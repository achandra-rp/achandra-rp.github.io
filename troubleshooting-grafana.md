# Grafana & Prometheus Query Reference

This document contains all the queries used during the troubleshooting to diagnose and fix the multi-cluster vector monitoring setup.

## Environment Setup
- **Grafana URL**: `https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com`
- **AMP Workspace**: `ws-eb486b77-4f33-45f8-a896-924d4c192290`
- **Clusters**: `prpkseaedge01`, `prpksmwedge01`

## Grafana API Queries

### 1. Dashboard Discovery
```bash
# Search for vector-related dashboards
curl -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/search?query=vector"
```

### 2. Datasource Information
```bash
# Get available datasources
curl -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources"
```

### 3. Label Value Queries (via Grafana Proxy to AMP)

#### Check Vector Instances
```bash
# Get all vector_instance label values
curl -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/label/vector_instance/values"
```

#### Check Available Clusters
```bash
# Get all cluster label values
curl -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/label/cluster/values"
```

#### Check Vector Jobs
```bash
# Get all job labels containing "vector"
curl -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/label/job/values" | \
  jq '.data[] | select(test("vector"))'
```

### 4. Dashboard Configuration Queries

#### Get Dashboard Variable Configuration
```bash
# Get vector_instance variable configuration from dashboard
curl -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/dashboards/uid/vector_multienv_dashboard" | \
  jq '.dashboard.templating.list[] | select(.name=="vector_instance")'
```

## Prometheus Queries (via Grafana Proxy)

### 1. Basic Health Checks

#### Check Service Availability
```bash
# Check if specific services are up
curl -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=up%7Bjob%3D~%22.*prpksmwedge01.*%22%7D"
```

#### Check Vector Started Status
```bash
# Verify vector instances are running
curl -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=vector_started_total"
```

### 2. Vector-Specific Metrics

#### Vector Component Events
```bash
# Check if vector components are receiving events
curl -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=vector_component_received_events_total"
```

#### Filter by Cluster
```bash
# Get metrics from specific cluster with data freshness
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=vector_started_total" | \
  jq --argjson current_time $(date +%s) \
  '.data.result[] | select(.metric.cluster == "prpksmwedge01" or .metric.cluster == "prpkseaedge01") |
   {cluster: .metric.cluster, vector_instance: .metric.vector_instance, age_seconds: ($current_time - .value[0])}'
```

### 3. Data Quality Checks

#### Check Data Freshness
```bash
# Verify data is recent (age in seconds)
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=up" | \
  jq --argjson current_time $(date +%s) \
  '.data.result[] | select(.metric.job | contains("prpksmwedge01")) |
   {job: .metric.job, cluster: .metric.cluster, age_seconds: ($current_time - .value[0])}'
```

#### Verify Event Processing
```bash
# Check if vector components have processed events
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=vector_component_received_events_total" | \
  jq '.data.result[] | select(.metric.cluster == "prpksmwedge01" or .metric.cluster == "prpkseaedge01") | 
      {cluster: .metric.cluster, vector_instance: .metric.vector_instance, job: .metric.job, has_data: (.value[1] | tonumber > 0)}'
```

### 4. Dashboard Variable Validation

#### Test Dashboard Query
```bash
# Test the exact query used by dashboard variables
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/label/vector_instance/values?match[]=vector_component_received_events_total" | \
  jq '.data[] | select(contains("prpksmwedge01") or contains("prpkseaedge01"))'
```

## Direct Prometheus Queries (kubectl port-forward)

### 1. Local Prometheus Access
```bash
# Port forward to local Prometheus instance
kubectl port-forward -n monitoring svc/amp-agent-kube-prometheus-prometheus 9090:9090 &
```

### 2. Target Discovery
```bash
# Check Prometheus targets
curl -s "http://localhost:9090/api/v1/targets" | \
  jq '.data.activeTargets[] | select(.labels.job | contains("vector")) | 
      {job: .labels.job, instance: .labels.instance, health: .health, lastScrape: .lastScrape}'
```

### 3. Configuration Validation
```bash
# Check Prometheus configuration
curl -s "http://localhost:9090/api/v1/status/config" | \
  jq '.data.yaml' | grep -A 5 -B 5 "kubernetes_sd_configs"
```

### 4. Metric Availability
```bash
# List all available metric names
curl -s "http://localhost:9090/api/v1/label/__name__/values" | \
  jq '.data[] | select(test("vector"))'
```

### 5. Label Value Queries
```bash
# Get unique vector instances
curl -s "http://localhost:9090/api/v1/query?query=vector_started_total" | \
  jq '.data.result[] | select(.metric.job | test("vector.*edge")) | 
      {job: .metric.job, vector_instance: .metric.vector_instance, cluster: .metric.cluster}'
```

## Kubernetes Cluster Queries

### 1. Service Monitor Validation
```bash
# Check service monitors in vector namespace
kubectl get servicemonitors.monitoring.coreos.com -n vector

# Get service monitor details
kubectl get servicemonitor vector-k8s-edge-metrics -n vector -o yaml | grep -A 3 -B 3 "vector_instance"
```

### 2. Prometheus Configuration
```bash
# Check Prometheus remote write configuration
kubectl get prometheus -n monitoring -o yaml | grep -A 15 remoteWrite

# Check Prometheus service monitor selector
kubectl get prometheus -n monitoring -o yaml | grep -A 10 serviceMonitorSelector
```

### 3. Pod and Service Status
```bash
# Check vector services
kubectl get services -n vector

# Check vector pods
kubectl get pods -n vector

# Check monitoring namespace
kubectl get pods -n monitoring
```

### 4. Logs Analysis
```bash
# Check Prometheus logs for remote write
kubectl logs -n monitoring prometheus-amp-agent-kube-prometheus-prometheus-0 -c prometheus | \
  grep -E "(remote|write|storage)"

# Check recent Prometheus activity
kubectl logs -n monitoring prometheus-amp-agent-kube-prometheus-prometheus-0 -c prometheus --since=2m
```

## Common PromQL Queries for Vector Monitoring

### 1. Service Health
```promql
# Check if vector services are up
up{job=~"vector.*metrics"}

# Vector instances that are running
vector_started_total
```

### 2. Event Processing
```promql
# Events received by components
vector_component_received_events_total

# Events sent by components
vector_component_sent_events_total

# Event processing rate
rate(vector_component_received_events_total[5m])
```

### 3. Performance Metrics
```promql
# Memory buffer usage
vector_buffer_byte_size{buffer_type="memory"}

# Events in buffer
vector_buffer_events{buffer_type="memory"}

# Source lag time
rate(vector_source_lag_time_seconds_sum[5m]) / rate(vector_source_lag_time_seconds_count[5m])
```

### 4. Multi-Cluster Queries
```promql
# Compare metrics across clusters
vector_component_received_events_total{cluster=~"prpkseaedge01|prpksmwedge01"}

# Cluster-specific filtering
vector_started_total{cluster="prpksmwedge01"}

# Environment and deployment filtering
vector_component_received_events_total{environment="edge",deployment=~"k8s|vna"}
```

## Troubleshooting Queries

### 1. Missing Data Investigation
```bash
# Check if cluster appears in metrics
curl -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/label/cluster/values"

# Search for any metrics from specific cluster
curl -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=up%7Bcluster%3D%22prpksmwedge01%22%7D"
```

### 2. Service Discovery Issues
```bash
# Check if services are being discovered
kubectl get servicemonitors -A | grep vector

# Verify service monitor labels match Prometheus selector
kubectl get prometheus -n monitoring -o yaml | grep -A 5 serviceMonitorSelector
```

### 3. Remote Write Validation
```bash
# Check remote write configuration exists
kubectl get prometheus -n monitoring -o yaml | grep -A 10 remoteWrite

# Verify AMP workspace URL is correct
kubectl get prometheus -n monitoring -o yaml | grep "aps-workspaces"
```

## Quick Reference Commands

```bash
# Check cluster data availability
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/label/cluster/values"

# Verify vector instances
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/label/vector_instance/values"

# Test data freshness
curl -s -H "Authorization: Bearer <TOKEN>" \
  "https://g-ff472922d6.grafana-workspace.us-east-1.amazonaws.com/api/datasources/proxy/1/api/v1/query?query=vector_started_total" | \
  jq --argjson current_time $(date +%s) '.data.result[] | {cluster: .metric.cluster, age_seconds: ($current_time - .value[0])}'
```
