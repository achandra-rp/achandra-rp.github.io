# EKS Node Pressure Monitor

A comprehensive monitoring tool that provides a tabular overview of all EKS worker nodes, correlating AWS EC2 instance information with Kubernetes node conditions to identify pressure issues across your cluster.

## Features

- **Cluster-wide Overview**: Shows all EKS nodes in a formatted table
- **AWS/K8s Correlation**: Maps EC2 instances to Kubernetes nodes
- **Pressure Detection**: Monitors disk, memory, and PID pressure conditions
- **Node Status Tracking**: Real-time readiness status for all nodes
- **Instance Details**: Shows instance type, availability zone, and IDs
- **Configurable AWS Profile**: Environment variable support for different AWS accounts

## Prerequisites

- `kubectl` configured with EKS cluster access
- `aws` CLI configured with appropriate permissions
- AWS permissions for `ec2:describe-instances`
- Kubernetes permissions to read node status

## Installation

```bash
curl -O https://raw.githubusercontent.com/achandra-rp/achandra-rp.github.io/refs/heads/main/ec2-pressure-check.sh
chmod +x ec2-pressure-check.sh
```

## Usage

### Basic Usage
```bash
./ec2-pressure-check.sh
```

### Custom AWS Profile
```bash
export AWS_PROFILE=my-production-profile
./ec2-pressure-check.sh
```

### One-time Profile Override
```bash
AWS_PROFILE=dev-environment ./ec2-pressure-check.sh
```

## Output Format

The tool displays a comprehensive table with the following columns:

| Column | Description |
|--------|-------------|
| **Name** | EC2 instance name tag |
| **Instance-ID** | AWS EC2 instance identifier |
| **K8s-Node-Name** | Kubernetes node name (hostname) |
| **Type** | EC2 instance type (e.g., t3.medium) |
| **AZ** | Availability zone |
| **CPU-Pressure** | PID pressure status |
| **Mem-Pressure** | Memory pressure status |
| **Disk-Pressure** | Disk pressure status |
| **Status** | Kubernetes node readiness |

## Status Indicators

### Pressure Conditions
- **OK**: No pressure detected, condition is False
- **HIGH**: Pressure condition is active (True)
- **HIGH-PID**: PID pressure detected (too many processes)
- **Unknown**: Unable to determine condition status
- **N/A**: Node not found in Kubernetes cluster

### Node Status
- **Ready**: Node is ready to accept pods
- **NotReady**: Node has issues preventing pod scheduling
- **Unknown**: Unable to determine node status
- **N/A**: Node not found in Kubernetes

## Example Output

```
EKS Node Pressure Status for cluster: my-production-cluster

┌──────────────────────┬─────────────────────┬──────────────────────────────┬──────────────┬─────────────────┬──────────────┬──────────────┬───────────────┬────────────┐
│ Name                 │ Instance-ID         │ K8s-Node-Name                │ Type         │ AZ              │ CPU-Pressure │ Mem-Pressure │ Disk-Pressure │ Status     │
├──────────────────────┼─────────────────────┼──────────────────────────────┼──────────────┼─────────────────┼──────────────┼──────────────┼───────────────┼────────────┤
│ worker-node-1        │ i-0123456789abcdef0 │ ip-10-0-1-100                │ t3.medium    │ us-west-2a      │ OK           │ OK           │ OK            │ Ready      │
│ worker-node-2        │ i-0987654321fedcba0 │ ip-10-0-2-200                │ t3.medium    │ us-west-2b      │ OK           │ HIGH         │ OK            │ Ready      │
│ worker-node-3        │ i-0abcdef123456789  │ ip-10-0-3-300                │ t3.large     │ us-west-2c      │ OK           │ OK           │ HIGH          │ NotReady   │
└──────────────────────┴─────────────────────┴──────────────────────────────┴──────────────┴─────────────────┴──────────────┴──────────────┴───────────────┴────────────┘

Legend:
  HIGH      - Node has pressure condition active
  OK        - Node has no pressure condition
  HIGH-PID  - Node has PID pressure (too many processes)
  N/A       - Node not found in Kubernetes
```

## Configuration

### AWS Profile
The script uses the `shared-rsc-prod` profile by default, but can be overridden:

```bash
# Method 1: Environment variable
export AWS_PROFILE=my-profile
./ec2-pressure-check.sh

# Method 2: Inline override
AWS_PROFILE=my-profile ./ec2-pressure-check.sh
```

### EKS Cluster Detection
The script automatically detects the EKS cluster from your current kubectl context:
```bash
kubectl config current-context
# Should show: arn:aws:eks:region:account:cluster/cluster-name
```

## Troubleshooting

### Common Issues

**No EKS cluster context found**
```bash
# Configure kubectl for your EKS cluster
aws eks update-kubeconfig --region us-west-2 --name my-cluster

# Verify context
kubectl config current-context
```

**AWS permissions error**
Ensure your AWS credentials have the following permissions:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ec2:DescribeInstances"
            ],
            "Resource": "*"
        }
    ]
}
```

**Node not found in Kubernetes**
This indicates EC2 instances that are tagged for the cluster but not registered as Kubernetes nodes. Common causes:
- Instance startup in progress
- Kubelet configuration issues
- Network connectivity problems
- IAM role issues

### Debugging High Pressure Nodes

**Memory Pressure**
```bash
# Check memory usage on the node
kubectl top nodes
kubectl describe node <node-name>

# Debug using node-debug.sh
./node-debug.sh -n <node-name>
# Then: chroot /host free -h
```

**Disk Pressure**
```bash
# Check disk usage
kubectl describe node <node-name>

# Debug using node-debug.sh  
./node-debug.sh -n <node-name>
# Then: chroot /host df -h
```

**PID Pressure**
```bash
# Check process count
./node-debug.sh -n <node-name>
# Then: nsenter -t 1 -p -n ps aux | wc -l
```

## Integration

This tool pairs well with:
- **node-debug.sh**: For detailed debugging of specific nodes
- **Prometheus/Grafana**: For historical pressure trend monitoring
- **CloudWatch**: For AWS-level instance monitoring
- **CI/CD pipelines**: For automated cluster health checks

## Use Cases

- **Pre-deployment Health Checks**: Verify cluster capacity before deployments
- **Incident Response**: Quickly identify problematic nodes during outages
- **Capacity Planning**: Monitor pressure trends to plan scaling
- **Cost Optimization**: Identify underutilized or over-pressured instances

## Contributing

Issues and pull requests welcome. Please ensure changes maintain backward compatibility and include appropriate error handling for AWS API calls.
