import DocPage from '../components/DocPage';

const TroubleshootingGrafana = () => {
  return (
    <DocPage title="Grafana & Prometheus Query Reference">
      <p>This document contains all the queries used during troubleshooting to diagnose and fix the multi-cluster vector monitoring setup.</p>

      <h2>Environment Setup</h2>
      <ul>
        <li><strong>Grafana URL</strong>: <code>https://&lt;grafana-workspace-id&gt;.grafana-workspace.&lt;region&gt;.amazonaws.com</code></li>
        <li><strong>AMP Workspace</strong>: <code>&lt;amp-workspace-id&gt;</code></li>
        <li><strong>Clusters</strong>: <code>&lt;cluster-name-1&gt;</code>, <code>&lt;cluster-name-2&gt;</code></li>
      </ul>

      <h2>Grafana API Queries</h2>
      <h3>1. Dashboard Discovery</h3>
      <pre><code>{`# Search for vector-related dashboards
curl -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/search?query=vector"`}</code></pre>

      <h3>2. Datasource Information</h3>
      <pre><code>{`# Get available datasources
curl -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources"`}</code></pre>

      <h3>3. Label Value Queries (via Grafana Proxy to AMP)</h3>
      <h4>Check Vector Instances</h4>
      <pre><code>{`# Get all vector_instance label values
curl -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/label/vector_instance/values"`}</code></pre>

      <h4>Check Available Clusters</h4>
      <pre><code>{`# Get all cluster label values
curl -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/label/cluster/values"`}</code></pre>

      <h4>Check Vector Jobs</h4>
      <pre><code>{`# Get all job labels containing "vector"
curl -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/label/job/values" | \\
  jq '.data[] | select(test("vector"))'`}</code></pre>

      <h3>4. Dashboard Configuration Queries</h3>
      <h4>Get Dashboard Variable Configuration</h4>
      <pre><code>{`# Get vector_instance variable configuration from dashboard
curl -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/dashboards/uid/vector_multienv_dashboard" | \\
  jq '.dashboard.templating.list[] | select(.name=="vector_instance")'`}</code></pre>

      <h2>Prometheus Queries (via Grafana Proxy)</h2>
      <h3>1. Basic Health Checks</h3>
      <h4>Check Service Availability</h4>
      <pre><code>{`# Check if specific services are up
curl -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=up%7Bjob%3D~%22.*<cluster-name-mw>.*%22%7D"`}</code></pre>

      <h4>Check Vector Started Status</h4>
      <pre><code>{`# Verify vector instances are running
curl -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=vector_started_total"`}</code></pre>

      <h3>2. Vector-Specific Metrics</h3>
      <h4>Vector Component Events</h4>
      <pre><code>{`# Check if vector components are receiving events
curl -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=vector_component_received_events_total"`}</code></pre>

      <h4>Filter by Cluster</h4>
      <pre><code>{`# Get metrics from specific cluster with data freshness
curl -s -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=vector_started_total" | \\
  jq --argjson current_time $(date +%s) \\
  '.data.result[] | select(.metric.cluster == "<cluster-name-mw>" or .metric.cluster == "<cluster-name-se>") |
   {cluster: .metric.cluster, vector_instance: .metric.vector_instance, age_seconds: ($current_time - .value[0])}'`}</code></pre>

      <h3>3. Data Quality Checks</h3>
      <h4>Check Data Freshness</h4>
      <pre><code>{`# Verify data is recent (age in seconds)
curl -s -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=up" | \\
  jq --argjson current_time $(date +%s) \\
  '.data.result[] | select(.metric.job | contains("<cluster-name-mw>")) |
   {job: .metric.job, cluster: .metric.cluster, age_seconds: ($current_time - .value[0])}'`}</code></pre>

      <h4>Verify Event Processing</h4>
      <pre><code>{`# Check if vector components have processed events
curl -s -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=vector_component_received_events_total" | \\
  jq '.data.result[] | select(.metric.cluster == "<cluster-name-mw>" or .metric.cluster == "<cluster-name-se>") |
      {cluster: .metric.cluster, vector_instance: .metric.vector_instance, job: .metric.job, has_data: (.value[1] | tonumber > 0)}'`}</code></pre>

      <h3>4. Dashboard Variable Validation</h3>
      <h4>Test Dashboard Query</h4>
      <pre><code>{`# Test the exact query used by dashboard variables
curl -s -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/label/vector_instance/values?match[]=vector_component_received_events_total" | \\
  jq '.data[] | select(contains("<cluster-name-mw>") or contains("<cluster-name-se>"))'`}</code></pre>

      <h2>Direct Prometheus Queries (kubectl port-forward)</h2>
      <h3>1. Local Prometheus Access</h3>
      <pre><code>{`# Port forward to local Prometheus instance
kubectl port-forward -n monitoring svc/amp-agent-kube-prometheus-prometheus 9090:9090 &`}</code></pre>

      <h3>2. Target Discovery</h3>
      <pre><code>{`# Check Prometheus targets
curl -s "http://localhost:9090/api/v1/targets" | \\
  jq '.data.activeTargets[] | select(.labels.job | contains("vector")) |
      {job: .labels.job, instance: .labels.instance, health: .health, lastScrape: .lastScrape}'`}</code></pre>

      <h3>3. Configuration Validation</h3>
      <pre><code>{`# Check Prometheus configuration
curl -s "http://localhost:9090/api/v1/status/config" | \\
  jq '.data.yaml' | grep -A 5 -B 5 "kubernetes_sd_configs"`}</code></pre>

      <h3>4. Metric Availability</h3>
      <pre><code>{`# List all available metric names
curl -s "http://localhost:9090/api/v1/label/__name__/values" | \\
  jq '.data[] | select(test("vector"))'`}</code></pre>

      <h3>5. Label Value Queries</h3>
      <pre><code>{`# Get unique vector instances
curl -s "http://localhost:9090/api/v1/query?query=vector_started_total" | \\
  jq '.data.result[] | select(.metric.job | test("vector.*edge")) |
      {job: .metric.job, vector_instance: .metric.vector_instance, cluster: .metric.cluster}'`}</code></pre>

      <h2>Kubernetes Cluster Queries</h2>
      <h3>1. Service Monitor Validation</h3>
      <pre><code>{`# Check service monitors in vector namespace
kubectl get servicemonitors.monitoring.coreos.com -n vector

# Get service monitor details
kubectl get servicemonitor vector-k8s-edge-metrics -n vector -o yaml | grep -A 3 -B 3 "vector_instance"`}</code></pre>

      <h3>2. Prometheus Configuration</h3>
      <pre><code>{`# Check Prometheus remote write configuration
kubectl get prometheus -n monitoring -o yaml | grep -A 15 remoteWrite

# Check Prometheus service monitor selector
kubectl get prometheus -n monitoring -o yaml | grep -A 10 serviceMonitorSelector`}</code></pre>

      <h3>3. Pod and Service Status</h3>
      <pre><code>{`# Check vector services
kubectl get services -n vector

# Check vector pods
kubectl get pods -n vector

# Check monitoring namespace
kubectl get pods -n monitoring`}</code></pre>

      <h3>4. Logs Analysis</h3>
      <pre><code>{`# Check Prometheus logs for remote write
kubectl logs -n monitoring prometheus-amp-agent-kube-prometheus-prometheus-0 -c prometheus | \\
  grep -E "(remote|write|storage)"

# Check recent Prometheus activity
kubectl logs -n monitoring prometheus-amp-agent-kube-prometheus-prometheus-0 -c prometheus --since=2m`}</code></pre>

      <h2>Common PromQL Queries for Vector Monitoring</h2>
      <h3>1. Service Health</h3>
      <pre><code>{`# Check if vector services are up
up{job=~"vector.*metrics"}

# Vector instances that are running
vector_started_total`}</code></pre>

      <h3>2. Event Processing</h3>
      <pre><code>{`# Events received by components
vector_component_received_events_total

# Events sent by components
vector_component_sent_events_total

# Event processing rate
rate(vector_component_received_events_total[5m])`}</code></pre>

      <h3>3. Performance Metrics</h3>
      <pre><code>{`# Memory buffer usage
vector_buffer_byte_size{buffer_type="memory"}

# Events in buffer
vector_buffer_events{buffer_type="memory"}

# Source lag time
rate(vector_source_lag_time_seconds_sum[5m]) / rate(vector_source_lag_time_seconds_count[5m])`}</code></pre>

      <h3>4. Multi-Cluster Queries</h3>
      <pre><code>{`# Compare metrics across clusters
vector_component_received_events_total{cluster=~"<cluster-name-se>|<cluster-name-mw>"}

# Cluster-specific filtering
vector_started_total{cluster="<cluster-name-mw>"}

# Environment and deployment filtering
vector_component_received_events_total{environment="edge",deployment=~"k8s|vna"}`}</code></pre>

      <h2>Troubleshooting Queries</h2>
      <h3>1. Missing Data Investigation</h3>
      <pre><code>{`# Check if cluster appears in metrics
curl -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/label/cluster/values"

# Search for any metrics from specific cluster
curl -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=up%7Bcluster%3D%22<cluster-name-mw>%22%7D"`}</code></pre>

      <h3>2. Service Discovery Issues</h3>
      <pre><code>{`# Check if services are being discovered
kubectl get servicemonitors -A | grep vector

# Verify service monitor labels match Prometheus selector
kubectl get prometheus -n monitoring -o yaml | grep -A 5 serviceMonitorSelector`}</code></pre>

      <h3>3. Remote Write Validation</h3>
      <pre><code>{`# Check remote write configuration exists
kubectl get prometheus -n monitoring -o yaml | grep -A 10 remoteWrite

# Verify AMP workspace URL is correct
kubectl get prometheus -n monitoring -o yaml | grep "aps-workspaces"`}</code></pre>

      <h2>Quick Reference Commands</h2>
      <pre><code>{`# Check cluster data availability
curl -s -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/label/cluster/values"

# Verify vector instances
curl -s -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/label/vector_instance/values"

# Test data freshness
curl -s -H "Authorization: Bearer <TOKEN>" \\
  "https://<grafana-workspace-id>.grafana-workspace.<region>.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=vector_started_total" | \\
  jq --argjson current_time $(date +%s) '.data.result[] | {cluster: .metric.cluster, age_seconds: ($current_time - .value[0])}'`}</code></pre>
    </DocPage>
  );
};

export default TroubleshootingGrafana;
