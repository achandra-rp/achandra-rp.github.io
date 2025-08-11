# Network Tools Pod

Comprehensive Kubernetes debugging pod with network analysis tools

## Overview

The Network Tools Pod is a privileged Kubernetes pod designed for network debugging and troubleshooting. It comes pre-installed with essential network analysis tools, cloud APIs, and debugging utilities.

**Security Notice:** This pod runs with privileged access and host networking. Use only in development/staging environments or for authorized debugging purposes.

## Features

- **Network Analysis**: ping, dig, nmap, tcpdump, traceroute, netcat, mtr
- **Load Testing**: hey for HTTP load testing
- **Cloud APIs**: awscurl, Azure REST API tools
- **Protocol Testing**: grpcurl for gRPC APIs, socat for socket relay
- **Packet Analysis**: tshark, ngrep for advanced packet inspection
- **System Tools**: vim, jq, curl, wget, python3

## Pod Configuration

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: network-debug-pod
  namespace: default
  labels:
    app: network-debug
    purpose: troubleshooting
spec:
  hostNetwork: true
  restartPolicy: Never
  
  containers:
  - name: network-debug
    image: ubuntu:22.04
    imagePullPolicy: IfNotPresent
    
    command: ["/bin/bash"]
    args: ["-c", "sleep infinity"]
    
    securityContext:
      privileged: true
      capabilities:
        add:
        - NET_ADMIN
        - NET_RAW
        - SYS_ADMIN
    
    lifecycle:
      postStart:
        exec:
          command:
          - /bin/bash
          - -c
          - |
            # Update and install network tools
            apt-get update
            apt-get install -y \
              curl wget net-tools dnsutils iputils-ping \
              tcpdump nmap traceroute netcat-openbsd \
              telnet whois mtr-tiny jq vim \
              iproute2 iptables ethtool \
              socat ngrep tshark \
              python3 python3-pip unzip
            
            # Install awscurl for AWS API calls
            pip3 install awscurl
            
            # Install Azure REST API helper
            pip3 install requests azure-identity
            
            # Install hey for load testing
            curl -L https://hey-release.s3.us-east-2.amazonaws.com/hey_linux_amd64 -o /usr/local/bin/hey
            chmod +x /usr/local/bin/hey
            
            # Install grpcurl
            curl -L https://github.com/fullstorydev/grpcurl/releases/download/v1.8.7/grpcurl_1.8.7_linux_x86_64.tar.gz | tar -xz -C /usr/local/bin/
            
            # Create simple aliases
            cat > /root/.bashrc << 'EOF'
            alias ll='ls -la'
            alias ports='netstat -tuln'
            alias connections='ss -tuln'
            alias routes='ip route show'
            alias interfaces='ip addr show'
            
            echo "Network debugging tools ready!"
            echo "AWS: awscurl"
            echo "Azure: curl with requests/azure-identity"  
            echo "Load testing: hey"
            echo "Network: ping, dig, nmap, tcpdump, traceroute, etc."
            EOF
            
            source /root/.bashrc
    
    resources:
      requests:
        memory: "128Mi"
        cpu: "50m"
      limits:
        memory: "512Mi"
        cpu: "500m"
```

## Usage

### Deploy the Pod

```bash
# Apply the pod configuration
kubectl apply -f net-tools-pod.yaml

# Wait for pod to be ready
kubectl wait --for=condition=Ready pod/network-debug-pod --timeout=300s
```

### Access the Pod

```bash
# Execute into the pod
kubectl exec -it network-debug-pod -- /bin/bash

# Check pod status
kubectl get pod network-debug-pod
kubectl describe pod network-debug-pod
```

## Common Debugging Tasks

### Network Connectivity

```bash
# Test basic connectivity
ping google.com
ping -c 4 8.8.8.8

# DNS resolution
dig kubernetes.default.svc.cluster.local
nslookup google.com

# Trace network path
traceroute google.com
mtr google.com
```

### Port and Service Testing

```bash
# Check open ports
netstat -tuln
ss -tuln

# Test service connectivity
nc -zv service-name 80
telnet service-name 443

# Scan for open ports
nmap -p 1-1000 target-host
```

### HTTP/API Testing

```bash
# Basic HTTP requests
curl -v https://api.example.com/health
wget -O- https://api.example.com/status

# Load testing with hey
hey -n 1000 -c 10 https://api.example.com/endpoint

# gRPC testing
grpcurl -plaintext service:9090 list
grpcurl -plaintext service:9090 package.Service/Method
```

### Packet Capture and Analysis

```bash
# Capture packets
tcpdump -i any -w capture.pcap host target-host
tcpdump -i any port 80

# Real-time packet analysis
tshark -i any -f "host target-host"
ngrep -q -W byline "GET|POST" tcp port 80
```

### Cloud API Testing

```bash
# AWS API calls (requires credentials)
awscurl --service ec2 --region us-east-1 'https://ec2.us-east-1.amazonaws.com/?Action=DescribeInstances&Version=2016-11-15'

# Using standard curl with AWS SigV4
curl -H "Authorization: AWS4-HMAC-SHA256 ..." https://service.region.amazonaws.com/
```

### Network Interface Analysis

```bash
# View network interfaces
ip addr show
interfaces  # alias for ip addr show

# Check routing table
ip route show
routes      # alias for ip route show

# Network statistics
ethtool eth0
cat /proc/net/dev
```

## Built-in Aliases

The pod includes several useful aliases for quick access:

- `ll` - List files in long format
- `ports` - Show listening ports (netstat -tuln)
- `connections` - Show socket connections (ss -tuln)
- `routes` - Display routing table
- `interfaces` - Show network interfaces

## Cleanup

```bash
# Remove the pod
kubectl delete pod network-debug-pod

# Or delete using the YAML file
kubectl delete -f net-tools-pod.yaml
```

## Security Considerations

- The pod runs with `privileged: true` and has elevated capabilities
- Uses `hostNetwork: true` which shares the host's network namespace
- Should only be used in development/staging environments
- Remove the pod immediately after debugging is complete
- Consider using network policies to restrict pod communication if deployed in production

## Troubleshooting

- If pod fails to start, check node resources and security policies
- Tool installation happens via postStart hook - allow time for completion
- Some tools may require additional configuration for cloud provider environments
- Network policies may restrict pod connectivity in some clusters