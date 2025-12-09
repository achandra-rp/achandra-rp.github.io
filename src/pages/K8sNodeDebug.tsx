import DocPage from '../components/DocPage';

const K8sNodeDebug = () => {
  return (
    <DocPage title="Kubernetes Node Debug Tool">
      <p>Debug Kubernetes nodes by launching privileged pods with host access.</p>

      <h2>Features</h2>
      <ul>
        <li>Interactive node selection with fzf</li>
        <li>Shows node conditions and troubleshooting tips</li>
        <li>Host filesystem and process access</li>
        <li>Detects pressure conditions automatically</li>
        <li>Built-in debugging commands</li>
      </ul>

      <h2>Prerequisites</h2>
      <ul>
        <li>kubectl with cluster access</li>
        <li>fzf for interactive mode (optional)</li>
        <li>RBAC permissions for debug pods</li>
      </ul>

      <h2>Installation</h2>
      <pre><code>{`curl -O https://raw.githubusercontent.com/achandra-rp/achandra-rp.github.io/main/public/scripts/k8s-node-debug.sh
chmod +x k8s-node-debug.sh`}</code></pre>

      <h2>Usage</h2>

      <h3>Interactive Mode</h3>
      <pre><code>./k8s-node-debug.sh</code></pre>

      <h3>Direct Node</h3>
      <pre><code>./k8s-node-debug.sh -n worker-node-1</code></pre>

      <h3>Custom Options</h3>
      <pre><code>./k8s-node-debug.sh -n worker-1 -i ubuntu:22.04 -s kube-system</code></pre>

      <h2>Options</h2>
      <table>
        <thead>
          <tr>
            <th>Flag</th>
            <th>Description</th>
            <th>Default</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>-n &lt;node-name&gt;</code></td>
            <td>Target node name</td>
            <td>Interactive selection</td>
          </tr>
          <tr>
            <td><code>-i &lt;image&gt;</code></td>
            <td>Container image to use</td>
            <td><code>ubuntu</code></td>
          </tr>
          <tr>
            <td><code>-s &lt;namespace&gt;</code></td>
            <td>Namespace for debug pod</td>
            <td><code>kube-system</code></td>
          </tr>
          <tr>
            <td><code>-I</code></td>
            <td>Force interactive mode</td>
            <td><code>false</code></td>
          </tr>
          <tr>
            <td><code>-h</code></td>
            <td>Show help message</td>
            <td>-</td>
          </tr>
        </tbody>
      </table>

      <h2>Host Access</h2>
      <p>Commands to use inside the debug pod:</p>

      <h3>Filesystem</h3>
      <pre><code>{`chroot /host              # Most common
ls /host/etc/kubernetes/  # Direct access
cat /host/proc/version
tail -f /host/var/log/messages`}</code></pre>

      <h3>Processes & Network</h3>
      <pre><code>{`nsenter -t 1 -p -n ps aux      # Host processes
nsenter -t 1 -p -n top         # Process monitor
nsenter -t 1 -n netstat -tulpn # Network connections
nsenter -t 1 -n ip addr show   # Network interfaces`}</code></pre>

      <h3>Kubernetes</h3>
      <pre><code>{`chroot /host systemctl status kubelet  # Kubelet status
chroot /host journalctl -u kubelet -f   # Kubelet logs
chroot /host crictl ps                  # Containers
chroot /host crictl logs <container-id> # Container logs`}</code></pre>

      <h2>Issue Detection</h2>
      <p>Automatically detects:</p>
      <ul>
        <li><strong>Disk Pressure</strong>: High disk usage</li>
        <li><strong>Memory Pressure</strong>: Low memory causing evictions</li>
        <li><strong>PID Pressure</strong>: Too many processes</li>
        <li><strong>Not Ready</strong>: Kubelet or system issues</li>
      </ul>

      <h2>Interactive Mode</h2>
      <p>fzf controls:</p>
      <ul>
        <li>Arrow keys: Navigate</li>
        <li>Type: Search/filter</li>
        <li>Preview: Node conditions and commands</li>
        <li>Ctrl+R: Refresh</li>
        <li>Ctrl+/: Toggle preview</li>
      </ul>

      <h2>Security Notes</h2>
      <p>Creates privileged pods with:</p>
      <ul>
        <li>Host filesystem access</li>
        <li>Host process/network namespaces</li>
        <li>SYS_ADMIN capabilities</li>
      </ul>
      <p>Only use on authorized nodes and clean up debug pods.</p>

      <h2>Troubleshooting</h2>
      <p><strong>fzf not found</strong></p>
      <pre><code>{`brew install fzf      # macOS
apt install fzf       # Ubuntu
yum install fzf       # RHEL`}</code></pre>

      <p><strong>No kubectl context</strong></p>
      <pre><code>{`kubectl config current-context
aws eks update-kubeconfig --region <region> --name <cluster>`}</code></pre>

      <p><strong>Permission denied</strong><br/>
      Need RBAC permissions for pods and debug API.</p>

      <h2>Examples</h2>
      <pre><code>{`# Debug specific node
./k8s-node-debug.sh -n ip-10-0-1-100.ec2.internal

# Custom image
./k8s-node-debug.sh -n worker-1 -i alpine:latest

# Force interactive mode
./k8s-node-debug.sh -I -n worker-1`}</code></pre>

      <h2>Contributing</h2>
      <p>Pull requests welcome. Follow security best practices.</p>
    </DocPage>
  );
};

export default K8sNodeDebug;
