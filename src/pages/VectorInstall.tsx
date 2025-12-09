import DocPage from '../components/DocPage';

const VectorInstall = () => {
  return (
    <DocPage title="Vector Troubleshooting and Deployment Guide">
      <p>This guide contains practical commands and procedures for troubleshooting and deploying Vector based on operational experience.</p>

      <h2>Deployment Commands</h2>
      <h3>Helm Operations</h3>
      <pre><code>{`# List Vector deployments
helm ls -A | grep vector

# Get current configuration values
helm get values -n vector vector > vector-k8s-values.yaml
helm get values -n vector vector-efs > vector-vna-values.yaml

# Deploy/upgrade Vector instances
helm upgrade vector vector/vector --namespace vector --values vector-k8s-values.yaml
helm upgrade vector-efs vector/vector --namespace vector --values vector-vna-values.yaml

# Get deployed manifests
helm get manifest vector -n vector > vector-manifest.yaml

# Dry run deployment to check changes
helm upgrade vector-efs vector/vector -n vector -f vector-vna-values.yaml --dry-run --debug

# Compare configuration changes
helm diff upgrade vector-efs vector/vector -n vector -f vector-vna-values.yaml`}</code></pre>

      <h3>Vector-Specific Kubectl Operations</h3>
      <pre><code>{`# Get Vector pods by instance (useful for multi-instance deployments)
kubectl get pods -n vector -l app.kubernetes.io/instance=vector-efs

# Get Vector services with specific labels
kubectl get svc -n vector -l 'app.kubernetes.io/name=vector,app.kubernetes.io/instance=vector-efs'

# Vector DaemonSet specific operations
kubectl get daemonsets -n vector
kubectl logs daemonsets/vector-efs --all-containers --ignore-errors --timestamps`}</code></pre>

      <h2>Troubleshooting Commands</h2>
      <h3>Vector-Specific Log Analysis</h3>
      <pre><code>{`# Vector JSON log parsing for application-specific logs
kubectl logs -n vector vector-efs-0 | jq -R 'fromjson? | select(.application | test("db-store-v5-deployment")) | .message'
kubectl logs -n vector vector-efs-0 | awk -F: '/{\"application\"/{print $2}' | sort | uniq -c

# Count specific events across all Vector pods
for pod in $(kubectl get po -n vector | awk '/efs/{print $1}'); do
  echo "=== $pod ==="
  kubectl logs -n vector $pod | grep "DB Store operation completed" | wc -l
done`}</code></pre>

      <h3>Vector Container Debugging</h3>
      <pre><code>{`# Access Vector's view of Kubernetes logs
kubectl exec -n vector vector-efs-0 -- cat /var/log/pods/<namespace>_<app>-deployment-*/app/0.log

# Search logs directly from Vector's log mount
kubectl exec -n vector vector-efs-0 -- sh -c 'grep -hF "DB Store operation completed" /var/log/containers/db-store*log*'

# Copy Vector's processed logs for analysis
kubectl cp vector-efs-0:/var/log/pods/<namespace>_<app>-deployment-*/app/* . -n vector`}</code></pre>

      <h3>Vector Tap Commands</h3>
      <pre><code>{`# Monitor Vector data flow
kubectl exec -it vector-efs-0 -- vector tap --outputs-of kubernetes_logs --inputs-of dbstore_metric --quiet --format json --limit 1000 --interval 100

kubectl exec -it vector-efs-0 -- vector tap --outputs-of raw_logs --limit 5000 | grep "DB Store operation completed" | wc -l

kubectl exec -it vector-efs-0 -- vector tap --outputs-of dedupe_logs --limit 5000 | grep "DB Store operation completed" | wc -l

# List all available components for tapping
kubectl exec -it vector-efs-0 -- vector tap --list

# Monitor specific transform or sink
kubectl exec -it vector-efs-0 -- vector tap --outputs-of aws_s3 --format json
kubectl exec -it vector-efs-0 -- vector tap --inputs-of dedupe_logs --format json`}</code></pre>

      <h2>Port Forwarding and Metrics</h2>
      <h3>Port Forward Setup</h3>
      <pre><code>{`# Port forward to Vector metrics endpoint
kubectl port-forward -n vector svc/vector 9598:9598
kubectl port-forward -n vector svc/vector-efs 9598:9598

# Port forward to specific pod
VECTOR_POD=$(kubectl get pods -n vector -l app.kubernetes.io/name=vector -o jsonpath='{.items[0].metadata.name}')
kubectl port-forward -n vector pod/$VECTOR_POD 9598:9598

# Background port forwarding
kubectl port-forward -n vector svc/vector-efs 9598:9598 &`}</code></pre>

      <h3>Metrics Collection</h3>
      <pre><code>{`# Basic metrics queries
curl -s http://localhost:9598/metrics | grep vector_
curl -s http://localhost:9598/metrics | grep vector_events
curl -s http://localhost:9598/metrics | grep vector_events_dropped_total

# Specific metrics patterns
curl -s http://localhost:9598/metrics | grep -E 'vector_'
curl -s http://localhost:9598/metrics | head -n 50`}</code></pre>

      <h2>Monitoring Setup</h2>
      <h3>ServiceMonitor Management</h3>
      <pre><code>{`# Get ServiceMonitor resources
kubectl get servicemonitor -n vector
kubectl get servicemonitor -n vector -o yaml

# Apply ServiceMonitor configurations
kubectl apply -f vector-k8s-metrics.yaml
kubectl apply -f vector-vna-metrics.yaml

# Edit ServiceMonitor
kubectl edit servicemonitors.monitoring.coreos.com vector-efs-metrics -n vector

# Export ServiceMonitor configurations
kubectl get servicemonitors.monitoring.coreos.com -n vector vector-metrics -o yaml | kubectl neat > vector-k8s-metrics.yaml
kubectl get servicemonitors.monitoring.coreos.com -n vector vector-efs-metrics -o yaml | kubectl neat > vector-vna-metrics.yaml`}</code></pre>

      <h3>Prometheus Integration</h3>
      <pre><code>{`# Check Prometheus targets
echo "Visit http://localhost:9090/targets and look for 'serviceMonitor/vector/vector-metrics'"

# Check Prometheus logs for Vector
kubectl logs -n monitoring -l app.kubernetes.io/name=prometheus | grep -i "vector|servicemonitor" | tail -10

# Port forward to Prometheus
kubectl -n monitoring port-forward prometheus-amp-agent-kube-prometheus-prometheus-0 9090:9090`}</code></pre>

      <h2>Vector-Specific Resource Management</h2>
      <h3>Vector Service Account for S3</h3>
      <pre><code>{`# Check Vector S3 service account configuration
kubectl get sa -n vector s3-sa -o yaml

# Verify service labels for ServiceMonitor discovery
kubectl get service -n vector -l app.kubernetes.io/instance=vector-efs --show-labels`}</code></pre>

      <h2>Configuration Management</h2>
      <h3>Values File Management</h3>
      <pre><code>{`# Validate YAML syntax
yamllint vector-k8s-values.yaml
yamllint vector-vna-values.yaml`}</code></pre>

      <h2>Common Issues and Solutions</h2>
      <h3>Metrics Not Appearing</h3>
      <ul>
        <li>Verify ServiceMonitor configuration</li>
        <li>Check port forwarding: <code>kubectl port-forward -n vector svc/vector-efs 9598:9598</code></li>
        <li>Test metrics endpoint: <code>curl -s http://localhost:9598/metrics</code></li>
        <li>Ensure Prometheus can reach the Vector service</li>
        <li>Check ServiceMonitor selector labels match Vector service labels</li>
      </ul>

      <h3>Log Processing Issues</h3>
      <ul>
        <li>Use Vector tap commands to monitor data flow</li>
        <li>Check for errors in Vector logs</li>
        <li>Verify source configurations in values files</li>
        <li><strong>Important</strong>: Check Vector internal metrics for dropped events:</li>
      </ul>
      <pre><code>{`curl -s http://localhost:9598/metrics | grep vector_component_discarded_events_total
curl -s http://localhost:9598/metrics | grep vector_component_errors_total`}</code></pre>

      <h3>Vector Configuration Validation</h3>
      <p>Test Vector config syntax before deployment:</p>
      <pre><code>kubectl exec -it vector-efs-0 -- vector validate --config-dir /etc/vector</code></pre>

      <p>Visualize Vector component topology:</p>
      <pre><code>kubectl exec -it vector-efs-0 -- vector graph --config-dir /etc/vector</code></pre>

      <h3>Performance Issues</h3>
      <p>Monitor buffer usage:</p>
      <pre><code>curl -s http://localhost:9598/metrics | grep vector_buffer</code></pre>

      <p>Check throughput metrics:</p>
      <pre><code>{`curl -s http://localhost:9598/metrics | grep -E "vector_component_(received|sent)_events_total"`}</code></pre>

      <h3>S3 Upload Issues</h3>
      <ul>
        <li>Check service account annotations for IAM role</li>
        <li>Verify bucket permissions and region settings</li>
        <li>Monitor Vector logs for S3-specific errors</li>
      </ul>
    </DocPage>
  );
};

export default VectorInstall;
