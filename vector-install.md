# Vector Troubleshooting and Deployment Guide

This guide contains practical commands and procedures for troubleshooting and deploying Vector based on operational experience.

## Deployment Commands

### Helm Operations

```bash
# List Vector deployments
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
helm diff upgrade vector-efs vector/vector -n vector -f vector-vna-values.yaml
```

### Vector-Specific Kubectl Operations

```bash
# Get Vector pods by instance (useful for multi-instance deployments)
kubectl get pods -n vector -l app.kubernetes.io/instance=vector-efs

# Get Vector services with specific labels
kubectl get svc -n vector -l 'app.kubernetes.io/name=vector,app.kubernetes.io/instance=vector-efs'

# Vector DaemonSet specific operations
kubectl get daemonsets -n vector
kubectl logs daemonsets/vector-efs --all-containers --ignore-errors --timestamps
```

## Troubleshooting Commands

### Vector-Specific Log Analysis

```bash
# Vector JSON log parsing for application-specific logs
kubectl logs -n vector vector-efs-0 | jq -R 'fromjson? | select(.application | test("db-store-v5-deployment")) | .message'
kubectl logs -n vector vector-efs-0 | awk -F: '/{"application"/{print $2}' | sort | uniq -c

# Count specific events across all Vector pods
for pod in $(kubectl get po -n vector | awk '/efs/{print $1}'); do
  echo "=== $pod ==="
  kubectl logs -n vector $pod | grep "DB Store operation completed" | wc -l
done
```

### Vector Container Debugging

```bash
# Access Vector's view of Kubernetes logs
kubectl exec -n vector vector-efs-0 -- cat /var/log/pods/rpvna_db-store-v5-deployment-*/db-store/0.log

# Search logs directly from Vector's log mount
kubectl exec -n vector vector-efs-0 -- sh -c 'grep -hF "DB Store operation completed" /var/log/containers/db-store*log*'

# Copy Vector's processed logs for analysis
kubectl cp vector-efs-0:/var/log/pods/rpvna_db-store-v5-deployment-*/db-store/* . -n vector
```

### Vector Tap Commands

```bash
# Monitor Vector data flow
kubectl exec -it vector-efs-0 -- vector tap --outputs-of kubernetes_logs --inputs-of dbstore_metric --quiet --format json --limit 1000 --interval 100

kubectl exec -it vector-efs-0 -- vector tap --outputs-of raw_logs --limit 5000 | grep "DB Store operation completed" | wc -l

kubectl exec -it vector-efs-0 -- vector tap --outputs-of dedupe_logs --limit 5000 | grep "DB Store operation completed" | wc -l

# List all available components for tapping
kubectl exec -it vector-efs-0 -- vector tap --list

# Monitor specific transform or sink
kubectl exec -it vector-efs-0 -- vector tap --outputs-of aws_s3 --format json
kubectl exec -it vector-efs-0 -- vector tap --inputs-of dedupe_logs --format json
```

## Port Forwarding and Metrics

### Port Forward Setup

```bash
# Port forward to Vector metrics endpoint
kubectl port-forward -n vector svc/vector 9598:9598
kubectl port-forward -n vector svc/vector-efs 9598:9598

# Port forward to specific pod
VECTOR_POD=$(kubectl get pods -n vector -l app.kubernetes.io/name=vector -o jsonpath='{.items[0].metadata.name}')
kubectl port-forward -n vector pod/$VECTOR_POD 9598:9598

# Background port forwarding
kubectl port-forward -n vector svc/vector-efs 9598:9598 &
```

### Metrics Collection

```bash
# Basic metrics queries
curl -s http://localhost:9598/metrics | grep vector_
curl -s http://localhost:9598/metrics | grep vector_events
curl -s http://localhost:9598/metrics | grep vector_events_dropped_total

# Specific metrics patterns
curl -s http://localhost:9598/metrics | grep -E 'vector_'
curl -s http://localhost:9598/metrics | head -n 50
```

## Monitoring Setup

### ServiceMonitor Management

```bash
# Get ServiceMonitor resources
kubectl get servicemonitor -n vector
kubectl get servicemonitor -n vector -o yaml

# Apply ServiceMonitor configurations
kubectl apply -f vector-k8s-metrics.yaml
kubectl apply -f vector-vna-metrics.yaml

# Edit ServiceMonitor
kubectl edit servicemonitors.monitoring.coreos.com vector-efs-metrics -n vector

# Export ServiceMonitor configurations
kubectl get servicemonitors.monitoring.coreos.com -n vector vector-metrics -o yaml | kubectl neat > vector-k8s-metrics.yaml
kubectl get servicemonitors.monitoring.coreos.com -n vector vector-efs-metrics -o yaml | kubectl neat > vector-vna-metrics.yaml
```

### Prometheus Integration

```bash
# Check Prometheus targets
echo "Visit http://localhost:9090/targets and look for 'serviceMonitor/vector/vector-metrics'"

# Check Prometheus logs for Vector
kubectl logs -n monitoring -l app.kubernetes.io/name=prometheus | grep -i "vector\|servicemonitor" | tail -10

# Port forward to Prometheus
kubectl -n monitoring port-forward prometheus-amp-agent-kube-prometheus-prometheus-0 9090:9090
```

## Vector-Specific Resource Management

### Vector Service Account for S3

```bash
# Check Vector S3 service account configuration
kubectl get sa -n vector s3-sa -o yaml

# Verify service labels for ServiceMonitor discovery
kubectl get service -n vector -l app.kubernetes.io/instance=vector-efs --show-labels
```

## Configuration Management

### Values File Management

```bash
# Validate YAML syntax
yamllint vector-k8s-values.yaml
yamllint vector-vna-values.yaml
```

## Diagnostic Scripts

## Common Issues and Solutions

### Metrics Not Appearing
- Verify ServiceMonitor configuration
- Check port forwarding: `kubectl port-forward -n vector svc/vector-efs 9598:9598`
- Test metrics endpoint: `curl -s http://localhost:9598/metrics`
- Ensure Prometheus can reach the Vector service
- Check ServiceMonitor selector labels match Vector service labels

### Log Processing Issues
- Use Vector tap commands to monitor data flow
- Check for errors in Vector logs
- Verify source configurations in values files
- **Important**: Check Vector internal metrics for dropped events:
  ```bash
  curl -s http://localhost:9598/metrics | grep vector_component_discarded_events_total
  curl -s http://localhost:9598/metrics | grep vector_component_errors_total
  ```

### Vector Configuration Validation
- Test Vector config syntax before deployment:
  ```bash
  kubectl exec -it vector-efs-0 -- vector validate --config-dir /etc/vector
  ```
- Visualize Vector component topology:
  ```bash
  kubectl exec -it vector-efs-0 -- vector graph --config-dir /etc/vector
  ```

### Performance Issues
- Monitor buffer usage:
  ```bash
  curl -s http://localhost:9598/metrics | grep vector_buffer
  ```
- Check throughput metrics:
  ```bash
  curl -s http://localhost:9598/metrics | grep -E "vector_component_(received|sent)_events_total"
  ```

### S3 Upload Issues
- Check service account annotations for IAM role
- Verify bucket permissions and region settings
- Monitor Vector logs for S3-specific errors
