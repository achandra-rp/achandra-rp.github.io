#!/bin/bash

AWS_PROFILE=${AWS_PROFILE:-default}
export AWS_PROFILE

CLUSTER_NAME=$(kubectl config current-context | cut -d'/' -f2 2>/dev/null)

if [ -z "$CLUSTER_NAME" ]; then
    echo "Error: No EKS cluster context found"
    echo "Run: aws eks update-kubeconfig --region <region> --name <cluster-name>"
    exit 1
fi

echo
echo "EKS Node Status - Cluster: $CLUSTER_NAME"
echo
printf "┌%-22s┬%-21s┬%-30s┬%-14s┬%-17s┬%-14s┬%-14s┬%-15s┬%-12s┐\n" \
    "──────────────────────" "─────────────────────" "──────────────────────────────" "──────────────" "─────────────────" "──────────────" "──────────────" "───────────────" "────────────"
printf "│ %-20s │ %-19s │ %-28s │ %-12s │ %-15s │ %-12s │ %-12s │ %-13s │ %-10s │\n" \
    "Name" "Instance-ID" "K8s-Node-Name" "Type" "AZ" "CPU-Pressure" "Mem-Pressure" "Disk-Pressure" "Status"
printf "├%-22s┼%-21s┼%-30s┼%-14s┼%-17s┼%-14s┼%-14s┼%-15s┼%-12s┤\n" \
    "──────────────────────" "─────────────────────" "──────────────────────────────" "──────────────" "─────────────────" "──────────────" "──────────────" "───────────────" "────────────"

aws ec2 describe-instances \
    --filters "Name=instance-state-name,Values=running" \
              "Name=tag:kubernetes.io/cluster/$CLUSTER_NAME,Values=owned" \
    --query 'Reservations[*].Instances[*].[Tags[?Key==`Name`].Value|[0],InstanceId,InstanceType,Placement.AvailabilityZone]' \
    --output text | while read name instance_id instance_type az; do
    
    if [ "$name" = "None" ] || [ -z "$name" ]; then
        name="<no-name>"
    fi
    
    k8s_node_name=$(aws ec2 describe-instances \
        --instance-ids $instance_id \
        --query 'Reservations[0].Instances[0].PrivateDnsName' \
        --output text 2>/dev/null)
    
    if [ "$k8s_node_name" != "None" ] && [ -n "$k8s_node_name" ]; then
        k8s_display_name=$(echo "$k8s_node_name" | cut -d'.' -f1)
        
        k8s_disk=$(kubectl get node $k8s_node_name -o jsonpath='{.status.conditions[?(@.type=="DiskPressure")].status}' 2>/dev/null)
        k8s_memory=$(kubectl get node $k8s_node_name -o jsonpath='{.status.conditions[?(@.type=="MemoryPressure")].status}' 2>/dev/null)
        k8s_pid=$(kubectl get node $k8s_node_name -o jsonpath='{.status.conditions[?(@.type=="PIDPressure")].status}' 2>/dev/null)
        k8s_ready=$(kubectl get node $k8s_node_name -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
        
        if [ -n "$k8s_ready" ]; then
            if [ "$k8s_disk" = "True" ]; then
                disk_pressure="HIGH"
            elif [ "$k8s_disk" = "False" ]; then
                disk_pressure="OK"
            else
                disk_pressure="Unknown"
            fi
            
            if [ "$k8s_memory" = "True" ]; then
                mem_pressure="HIGH"
            elif [ "$k8s_memory" = "False" ]; then
                mem_pressure="OK"
            else
                mem_pressure="Unknown"
            fi
            
            if [ "$k8s_pid" = "True" ]; then
                cpu_pressure="HIGH-PID"
            elif [ "$k8s_pid" = "False" ]; then
                cpu_pressure="OK"
            else
                cpu_pressure="Unknown"
            fi
            
            if [ "$k8s_ready" = "True" ]; then
                k8s_status="Ready"
            elif [ "$k8s_ready" = "False" ]; then
                k8s_status="NotReady"
            else
                k8s_status="Unknown"
            fi
        else
            disk_pressure="N/A"
            mem_pressure="N/A"
            cpu_pressure="N/A"
            k8s_status="N/A"
        fi
    else
        k8s_display_name="N/A"
        disk_pressure="N/A"
        mem_pressure="N/A"
        cpu_pressure="N/A"
        k8s_status="N/A"
    fi
    
    printf "│ %-20s │ %-19s │ %-28s │ %-12s │ %-15s │ %-12s │ %-12s │ %-13s │ %-10s │\n" \
        "${name:0:20}" "$instance_id" "${k8s_display_name:0:28}" "$instance_type" "$az" \
        "$cpu_pressure" "$mem_pressure" "$disk_pressure" "$k8s_status"
done

printf "└%-22s┴%-21s┴%-30s┴%-14s┴%-17s┴%-14s┴%-14s┴%-15s┴%-12s┘\n" \
    "──────────────────────" "─────────────────────" "──────────────────────────────" "──────────────" "─────────────────" "──────────────" "──────────────" "───────────────" "────────────"

echo
echo "Legend:"
echo "  HIGH      - Pressure condition active"
echo "  OK        - No pressure"
echo "  HIGH-PID  - PID pressure (too many processes)"
echo "  N/A       - Not found in Kubernetes"
echo
