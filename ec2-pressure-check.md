# EKS Node Pressure Monitor

Monitor EKS node pressure conditions across your cluster. Shows EC2 instances mapped to Kubernetes nodes with pressure status.

## Features

- Cluster-wide node overview in table format
- Maps EC2 instances to Kubernetes nodes
- Monitors disk, memory, and PID pressure
- Shows node readiness status
- Displays instance types and availability zones
- Configurable AWS profiles

## Prerequisites

- kubectl with EKS cluster access
- AWS CLI with ec2:describe-instances permission
- Kubernetes node read permissions

## Installation

```bash
curl -O https://raw.githubusercontent.com/achandra-rp/achandra-rp.github.io/main/ec2-pressure-check.sh
chmod +x ec2-pressure-check.sh
```

## Usage

```bash
# Basic usage
./ec2-pressure-check.sh

# Custom AWS profile
export AWS_PROFILE=my-profile
./ec2-pressure-check.sh

# One-time override
AWS_PROFILE=dev ./ec2-pressure-check.sh
```

## Output

Table columns:

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

## Status Values

### Pressure
- **OK**: No pressure (condition False)
- **HIGH**: Pressure active (condition True)
- **HIGH-PID**: PID pressure (too many processes)
- **Unknown**: Can't determine status
- **N/A**: Node not in Kubernetes

### Node Status
- **Ready**: Accepting pods
- **NotReady**: Has issues
- **Unknown**: Can't determine
- **N/A**: Not in Kubernetes

## Sample Output

```
EKS Node Status - Cluster: my-cluster

┌──────────────────────┬─────────────────────┬──────────────────────────────┬──────────────┬─────────────────┬──────────────┬──────────────┬───────────────┬────────────┐
│ Name                 │ Instance-ID         │ K8s-Node-Name                │ Type         │ AZ              │ CPU-Pressure │ Mem-Pressure │ Disk-Pressure │ Status     │
├──────────────────────┼─────────────────────┼──────────────────────────────┼──────────────┼─────────────────┼──────────────┼──────────────┼───────────────┼────────────┤
│ worker-node-1        │ i-0123456789abcdef0 │ ip-10-0-1-100                │ t3.medium    │ us-west-2a      │ OK           │ OK           │ OK            │ Ready      │
│ worker-node-2        │ i-0987654321fedcba0 │ ip-10-0-2-200                │ t3.medium    │ us-west-2b      │ OK           │ HIGH         │ OK            │ Ready      │
│ worker-node-3        │ i-0abcdef123456789  │ ip-10-0-3-300                │ t3.large     │ us-west-2c      │ OK           │ OK           │ HIGH          │ NotReady   │
└──────────────────────┴─────────────────────┴──────────────────────────────┴──────────────┴─────────────────┴──────────────┴──────────────┴───────────────┴────────────┘

Legend:
  HIGH      - Pressure condition active
  OK        - No pressure
  HIGH-PID  - PID pressure (too many processes)
  N/A       - Not found in Kubernetes
```

## Configuration

Default AWS profile: `shared-rsc-prod`

```bash
# Override profile
export AWS_PROFILE=my-profile
AWS_PROFILE=my-profile ./ec2-pressure-check.sh
```

Cluster detected from kubectl context:
```bash
kubectl config current-context
```

## Troubleshooting

**No cluster context**
```bash
aws eks update-kubeconfig --region us-west-2 --name my-cluster
kubectl config current-context
```

**AWS permissions error**
Need `ec2:DescribeInstances` permission.

**Node not in Kubernetes**
EC2 instances tagged for cluster but not registered as nodes:
- Instance still starting up
- Kubelet config issues
- Network problems
- IAM role issues

### Debugging Pressure

**Memory Pressure**
```bash
kubectl top nodes
./k8s-node-debug.sh -n <node>
# Then: chroot /host free -h
```

**Disk Pressure**
```bash
./k8s-node-debug.sh -n <node>
# Then: chroot /host df -h
```

**PID Pressure**
```bash
./k8s-node-debug.sh -n <node>
# Then: nsenter -t 1 -p -n ps aux | wc -l
```

## Integration

Pairs well with:
- k8s-node-debug.sh for detailed node debugging
- Prometheus/Grafana for historical trends
- CloudWatch for AWS metrics
- CI/CD for automated health checks

## Use Cases

- Pre-deployment capacity checks
- Incident response for node issues
- Capacity planning and scaling
- Cost optimization

## Contributing

Pull requests welcome. Maintain backward compatibility and include error handling.
