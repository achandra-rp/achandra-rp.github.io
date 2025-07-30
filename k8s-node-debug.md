# Kubernetes Node Debug Tool

An interactive debugging tool for launching privileged debug pods on Kubernetes nodes with system-level access for troubleshooting and maintenance.

## Features

- **Interactive Node Selection**: Uses fzf for browsing and selecting nodes
- **Real-time Node Status**: Shows node conditions and troubleshooting hints
- **Privileged Access**: Provides host filesystem and process access
- **Smart Condition Analysis**: Detects disk pressure, memory pressure, PID pressure, and readiness issues
- **Comprehensive Troubleshooting**: Built-in commands for common debugging scenarios

## Prerequisites

- `kubectl` configured with cluster access
- `fzf` for interactive mode (optional if specifying node directly)
- Appropriate RBAC permissions for creating debug pods

## Installation

```bash
curl -O https://raw.githubusercontent.com/achandra-rp/achandra-rp.github.io/blob/main/k8s-node-debug.sh
chmod +x node-debug.sh
```

## Usage

### Interactive Mode (Recommended)
```bash
./node-debug.sh
```
Browse nodes with arrow keys, search by typing, and see real-time troubleshooting info.

### Direct Node Specification
```bash
./node-debug.sh -n worker-node-1
```

### Custom Options
```bash
./node-debug.sh -n worker-node-1 -i ubuntu:22.04 -s kube-system
```

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `-n <node-name>` | Target node name | Interactive selection |
| `-i <image>` | Container image to use | `ubuntu` |
| `-s <namespace>` | Namespace for debug pod | `kube-system` |
| `-I` | Force interactive mode | `false` |
| `-h` | Show help message | - |

## Host System Access

Once connected to the debug pod, use these commands to access the host system:

### File System Access
```bash
# Change root to host filesystem (most common)
chroot /host

# Access host files directly
ls /host/etc/kubernetes/
cat /host/proc/version
tail -f /host/var/log/messages
```

### Process and Network Access
```bash
# View host processes
nsenter -t 1 -p -n ps aux
nsenter -t 1 -p -n top

# Check network connections
nsenter -t 1 -n netstat -tulpn
nsenter -t 1 -n ip addr show
```

### Kubernetes Troubleshooting
```bash
# Check kubelet service
chroot /host systemctl status kubelet
chroot /host journalctl -u kubelet -f

# Container runtime debugging
chroot /host crictl ps
chroot /host crictl logs <container-id>
```

## Automated Issue Detection

The tool automatically detects and provides troubleshooting guidance for:

- **Disk Pressure**: High disk usage affecting node performance
- **Memory Pressure**: Insufficient memory causing pod evictions
- **PID Pressure**: Too many processes running on the node
- **Node Not Ready**: Kubelet or system issues preventing readiness

## Interactive Features

When using fzf interactive mode:

- **Arrow Keys**: Navigate through nodes
- **Type to Search**: Filter nodes by name
- **Preview Panel**: Shows node conditions and troubleshooting commands
- **Ctrl+R**: Refresh node list
- **Ctrl+/**: Toggle preview panel

## Security Considerations

This tool creates privileged pods with:
- Host filesystem access (`/host` mount)
- Host process namespace access
- Host network namespace access
- SYS_ADMIN capabilities

Only use on nodes you have authorization to debug and ensure proper cleanup of debug pods.

## Troubleshooting

### Common Issues

**fzf not found**
```bash
# macOS
brew install fzf

# Ubuntu/Debian
apt install fzf

# RHEL/CentOS
yum install fzf
```

**No kubectl context**
```bash
kubectl config current-context
aws eks update-kubeconfig --region <region> --name <cluster-name>
```

**Permission denied**
Ensure your user has RBAC permissions to create pods in the target namespace and use the `debug` API.

## Examples

### Debug a specific worker node
```bash
./node-debug.sh -n ip-10-0-1-100.ec2.internal
```

### Use custom image for debugging
```bash
./node-debug.sh -n worker-1 -i alpine:latest
```

### Force interactive selection with node specified
```bash
./node-debug.sh -I -n worker-1
```

## Contributing

Issues and pull requests welcome. Please ensure scripts follow security best practices and include appropriate error handling.
