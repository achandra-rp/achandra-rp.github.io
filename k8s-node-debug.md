# Kubernetes Node Debug Tool

Debug Kubernetes nodes by launching privileged pods with host access.

## Features

- Interactive node selection with fzf
- Shows node conditions and troubleshooting tips
- Host filesystem and process access
- Detects pressure conditions automatically
- Built-in debugging commands

## Prerequisites

- kubectl with cluster access
- fzf for interactive mode (optional)
- RBAC permissions for debug pods

## Installation

```bash
curl -O https://raw.githubusercontent.com/achandra-rp/achandra-rp.github.io/main/k8s-node-debug.sh
chmod +x k8s-node-debug.sh
```

## Usage

### Interactive Mode
```bash
./k8s-node-debug.sh
```

### Direct Node
```bash
./k8s-node-debug.sh -n worker-node-1
```

### Custom Options
```bash
./k8s-node-debug.sh -n worker-1 -i ubuntu:22.04 -s kube-system
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-n <node-name>` | Target node name | Interactive selection |
| `-i <image>` | Container image to use | `ubuntu` |
| `-s <namespace>` | Namespace for debug pod | `kube-system` |
| `-I` | Force interactive mode | `false` |
| `-h` | Show help message | - |

## Host Access

Commands to use inside the debug pod:

### Filesystem
```bash
chroot /host              # Most common
ls /host/etc/kubernetes/  # Direct access
cat /host/proc/version
tail -f /host/var/log/messages
```

### Processes & Network
```bash
nsenter -t 1 -p -n ps aux      # Host processes
nsenter -t 1 -p -n top         # Process monitor
nsenter -t 1 -n netstat -tulpn # Network connections
nsenter -t 1 -n ip addr show   # Network interfaces
```

### Kubernetes
```bash
chroot /host systemctl status kubelet  # Kubelet status
chroot /host journalctl -u kubelet -f   # Kubelet logs
chroot /host crictl ps                  # Containers
chroot /host crictl logs <container-id> # Container logs
```

## Issue Detection

Automatically detects:

- **Disk Pressure**: High disk usage
- **Memory Pressure**: Low memory causing evictions
- **PID Pressure**: Too many processes
- **Not Ready**: Kubelet or system issues

## Interactive Mode

fzf controls:
- Arrow keys: Navigate
- Type: Search/filter
- Preview: Node conditions and commands
- Ctrl+R: Refresh
- Ctrl+/: Toggle preview

## Security Notes

Creates privileged pods with:
- Host filesystem access
- Host process/network namespaces
- SYS_ADMIN capabilities

Only use on authorized nodes and clean up debug pods.

## Troubleshooting

**fzf not found**
```bash
brew install fzf      # macOS
apt install fzf       # Ubuntu
yum install fzf       # RHEL
```

**No kubectl context**
```bash
kubectl config current-context
aws eks update-kubeconfig --region <region> --name <cluster>
```

**Permission denied**
Need RBAC permissions for pods and debug API.

## Examples

```bash
# Debug specific node
./k8s-node-debug.sh -n ip-10-0-1-100.ec2.internal

# Custom image
./k8s-node-debug.sh -n worker-1 -i alpine:latest

# Force interactive mode
./k8s-node-debug.sh -I -n worker-1
```

## Contributing

Pull requests welcome. Follow security best practices.
