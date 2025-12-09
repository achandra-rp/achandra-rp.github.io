import DocPage from '../components/DocPage';

const NetToolsPod = () => {
  return (
    <DocPage title="Network Tools Pod">
      <p>Comprehensive Kubernetes debugging pod with network analysis tools</p>

      <h2>Overview</h2>
      <p>The Network Tools Pod is a privileged Kubernetes pod designed for network debugging and troubleshooting. It comes pre-installed with essential network analysis tools, cloud APIs, and debugging utilities.</p>
      <p><strong>Security Notice:</strong> This pod runs with privileged access and host networking. Use only in development/staging environments or for authorized debugging purposes.</p>

      <h2>Features</h2>
      <ul>
        <li><strong>Network Analysis</strong>: ping, dig, nmap, tcpdump, traceroute, netcat, mtr</li>
        <li><strong>Load Testing</strong>: hey for HTTP load testing</li>
        <li><strong>Cloud APIs</strong>: awscurl, Azure REST API tools</li>
        <li><strong>Protocol Testing</strong>: grpcurl for gRPC APIs, socat for socket relay</li>
        <li><strong>Packet Analysis</strong>: tshark, ngrep for advanced packet inspection</li>
        <li><strong>System Tools</strong>: vim, jq, curl, wget, python3</li>
      </ul>

      <h2>Pod Configuration</h2>
      <pre><code>{`apiVersion: v1
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
            apt-get install -y \\
              curl wget net-tools dnsutils iputils-ping \\
              tcpdump nmap traceroute netcat-openbsd \\
              telnet whois mtr-tiny jq vim \\
              iproute2 iptables ethtool \\
              socat ngrep tshark \\
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
        cpu: "500m"`}</code></pre>

      <h2>Usage</h2>
      <h3>Deploy the Pod</h3>
      <pre><code>{`# Apply the pod configuration
kubectl apply -f net-tools-pod.yaml

# Wait for pod to be ready
kubectl wait --for=condition=Ready pod/network-debug-pod --timeout=300s`}</code></pre>

      <h3>Access the Pod</h3>
      <pre><code>{`# Execute into the pod
kubectl exec -it network-debug-pod -- /bin/bash

# Check pod status
kubectl get pod network-debug-pod
kubectl describe pod network-debug-pod`}</code></pre>

      <h2>Common Debugging Tasks</h2>
      <h3>Network Connectivity</h3>
      <pre><code>{`# Test basic connectivity
ping google.com
ping -c 4 8.8.8.8

# DNS resolution
dig kubernetes.default.svc.cluster.local
nslookup google.com

# Trace network path
traceroute google.com
mtr google.com`}</code></pre>

      <h3>Port and Service Testing</h3>
      <pre><code>{`# Check open ports
netstat -tuln
ss -tuln

# Test service connectivity
nc -zv service-name 80
telnet service-name 443

# Scan for open ports
nmap -p 1-1000 target-host`}</code></pre>

      <h3>HTTP/API Testing</h3>
      <pre><code>{`# Basic HTTP requests
curl -v https://api.example.com/health
wget -O- https://api.example.com/status

# Load testing with hey
hey -n 1000 -c 10 https://api.example.com/endpoint

# gRPC testing
grpcurl -plaintext service:9090 list
grpcurl -plaintext service:9090 package.Service/Method`}</code></pre>

      <h3>Packet Capture and Analysis</h3>
      <pre><code>{`# Capture packets
tcpdump -i any -w capture.pcap host target-host
tcpdump -i any port 80

# Real-time packet analysis
tshark -i any -f "host target-host"
ngrep -q -W byline "GET|POST" tcp port 80`}</code></pre>

      <h3>Cloud API Testing</h3>
      <pre><code>{`# AWS API calls (requires credentials)
awscurl --service ec2 --region us-east-1 'https://ec2.us-east-1.amazonaws.com/?Action=DescribeInstances&Version=2016-11-15'

# Using standard curl with AWS SigV4
curl -H "Authorization: AWS4-HMAC-SHA256 ..." https://service.region.amazonaws.com/`}</code></pre>

      <h3>Network Interface Analysis</h3>
      <pre><code>{`# View network interfaces
ip addr show
interfaces  # alias for ip addr show

# Check routing table
ip route show
routes      # alias for ip route show

# Network statistics
ethtool eth0
cat /proc/net/dev`}</code></pre>

      <h2>Built-in Aliases</h2>
      <p>The pod includes several useful aliases for quick access:</p>
      <ul>
        <li><code>ll</code> - List files in long format</li>
        <li><code>ports</code> - Show listening ports (netstat -tuln)</li>
        <li><code>connections</code> - Show socket connections (ss -tuln)</li>
        <li><code>routes</code> - Display routing table</li>
        <li><code>interfaces</code> - Show network interfaces</li>
      </ul>

      <h2>Cleanup</h2>
      <pre><code>{`# Remove the pod
kubectl delete pod network-debug-pod

# Or delete using the YAML file
kubectl delete -f net-tools-pod.yaml`}</code></pre>

      <h2>Security Considerations</h2>
      <ul>
        <li>The pod runs with <code>privileged: true</code> and has elevated capabilities</li>
        <li>Uses <code>hostNetwork: true</code> which shares the host's network namespace</li>
        <li>Should only be used in development/staging environments</li>
        <li>Remove the pod immediately after debugging is complete</li>
        <li>Consider using network policies to restrict pod communication if deployed in production</li>
      </ul>

      <h2>Troubleshooting</h2>
      <ul>
        <li>If pod fails to start, check node resources and security policies</li>
        <li>Tool installation happens via postStart hook - allow time for completion</li>
        <li>Some tools may require additional configuration for cloud provider environments</li>
        <li>Network policies may restrict pod connectivity in some clusters</li>
      </ul>
    </DocPage>
  );
};

export default NetToolsPod;
