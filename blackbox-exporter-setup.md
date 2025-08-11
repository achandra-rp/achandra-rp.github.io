# Blackbox Exporter Setup for HTTP Service Monitoring

This guide covers setting up blackbox exporter to monitor HTTP endpoints and create reliable service availability alerts.

## Overview

Blackbox exporter probes external endpoints and exports metrics about their availability. This provides more reliable monitoring than relying on internal service mesh metrics for actual service health.

## Prerequisites

- Kubernetes cluster with Prometheus Operator
- Prometheus Agent configured to scrape ServiceMonitors
- Access to create resources in monitoring namespace

## 1. Deploy Blackbox Exporter

### Create ConfigMap with Probe Configuration

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: blackbox-config
  namespace: monitoring
data:
  blackbox.yml: |
    modules:
      http_2xx:
        prober: http
        timeout: 5s
        http:
          valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
          valid_status_codes: []
          method: GET
          headers:
            User-Agent: "Blackbox Exporter"
          fail_if_not_ssl: false
          fail_if_body_matches_regexp: []
          fail_if_body_not_matches_regexp: []
          fail_if_header_matches: []
          fail_if_header_not_matches: []
      http_post_2xx:
        prober: http
        timeout: 5s
        http:
          method: POST
          headers:
            Content-Type: application/json
          body: '{}'
      http_2xx_4xx:
        prober: http
        timeout: 5s
        http:
          valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
          valid_status_codes: [200, 201, 202, 204, 401, 403]
          method: GET
          headers:
            User-Agent: "Blackbox Exporter"
          fail_if_not_ssl: false
      tcp_connect:
        prober: tcp
        timeout: 5s
      dns:
        prober: dns
        timeout: 5s
        dns:
          query_name: "example.com"
          query_type: "A"
```

### Deploy Blackbox Exporter

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: blackbox-exporter
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: blackbox-exporter
  template:
    metadata:
      labels:
        app: blackbox-exporter
    spec:
      containers:
      - name: blackbox-exporter
        image: prom/blackbox-exporter:latest
        ports:
        - containerPort: 9115
        args:
          - --config.file=/etc/blackbox_exporter/blackbox.yml
          - --web.listen-address=:9115
        volumeMounts:
        - name: config
          mountPath: /etc/blackbox_exporter
        resources:
          limits:
            memory: 256Mi
            cpu: 200m
          requests:
            memory: 128Mi
            cpu: 100m
        livenessProbe:
          httpGet:
            path: /health
            port: 9115
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 9115
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: config
        configMap:
          name: blackbox-config
---
apiVersion: v1
kind: Service
metadata:
  name: blackbox-exporter
  namespace: monitoring
  labels:
    app: blackbox-exporter
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "9115"
    prometheus.io/path: "/metrics"
spec:
  ports:
  - port: 9115
    targetPort: 9115
    name: http
  selector:
    app: blackbox-exporter
```

## 2. Configure Prometheus Scraping

### Basic ServiceMonitor for Blackbox Exporter Metrics

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: blackbox-exporter
  namespace: monitoring
  labels:
    app: blackbox-exporter
spec:
  selector:
    matchLabels:
      app: blackbox-exporter
  endpoints:
  - port: http
    interval: 30s
    path: /metrics
```

### ServiceMonitor for HTTP Endpoint Probes

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: loki-blackbox-probe
  namespace: monitoring
  labels:
    app: loki-probe
spec:
  selector:
    matchLabels:
      app: blackbox-exporter
  endpoints:
  - port: http
    interval: 30s
    path: /probe
    params:
      module: [http_2xx_4xx]
      target: 
      - https://your-domain.com/loki/api/v1/labels
    relabelings:
    # Set the instance label to the target URL
    - sourceLabels: [__param_target]
      targetLabel: instance
    - sourceLabels: [__param_target]
      targetLabel: __tmp_target
    # Point scraping to blackbox exporter
    - targetLabel: __address__
      replacement: blackbox-exporter.monitoring.svc.cluster.local:9115
    # Preserve target URL in target label
    - sourceLabels: [__tmp_target]
      targetLabel: target
    # Set custom job name
    - targetLabel: job
      replacement: loki-gateway-probe
    metricRelabelings:
    # Add service label for easier alerting
    - sourceLabels: [instance]
      targetLabel: service
      replacement: loki-gateway
```

## 3. Key Metrics Exposed

### Main Probe Metrics

- **probe_success**: `1` if probe succeeded, `0` if failed
- **probe_duration_seconds**: Time taken for probe to complete
- **probe_http_status_code**: HTTP status code returned
- **probe_http_content_length**: Length of HTTP response
- **probe_ssl_earliest_cert_expiry**: SSL certificate expiration time

### Example Queries

```promql
# Service availability
probe_success{job="loki-gateway-probe"}

# Average probe duration
avg(probe_duration_seconds{job="loki-gateway-probe"})

# SSL certificate expiry (days remaining)
(probe_ssl_earliest_cert_expiry - time()) / 86400

# HTTP response codes
probe_http_status_code{job="loki-gateway-probe"}
```

## 4. Sample Alert Rules

### Service Down Alert

```yaml
groups:
- name: blackbox-alerts
  rules:
  - alert: HTTPEndpointDown
    expr: probe_success{job="loki-gateway-probe"} == 0
    for: 1m
    labels:
      severity: critical
      service: loki-gateway
      alert_type: http_probe
    annotations:
      summary: "{{ $labels.service }} HTTP endpoint is down"
      description: "HTTP probe to {{ $labels.instance }} has been failing for more than 1 minute"

  - alert: HTTPEndpointSlow
    expr: probe_duration_seconds{job="loki-gateway-probe"} > 5
    for: 2m
    labels:
      severity: warning
      service: loki-gateway
      alert_type: performance
    annotations:
      summary: "{{ $labels.service }} HTTP endpoint is slow"
      description: "HTTP probe to {{ $labels.instance }} is taking {{ $value }}s to respond"

  - alert: SSLCertificateExpiringSoon
    expr: (probe_ssl_earliest_cert_expiry - time()) / 86400 < 30
    for: 1h
    labels:
      severity: warning
      service: loki-gateway
      alert_type: certificate
    annotations:
      summary: "SSL certificate expiring soon"
      description: "SSL certificate for {{ $labels.instance }} expires in {{ $value }} days"
```

## 5. Multiple Endpoint Configuration

For monitoring multiple services, create separate ServiceMonitors:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: multi-service-probes
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: blackbox-exporter
  endpoints:
  # Loki Gateway
  - port: http
    interval: 30s
    path: /probe
    params:
      module: [http_2xx]
      target: [https://your-domain.com/loki/ready]
    relabelings:
    - sourceLabels: [__param_target]
      targetLabel: instance
    - targetLabel: __address__
      replacement: blackbox-exporter.monitoring.svc.cluster.local:9115
    - targetLabel: job
      replacement: loki-probe
    - targetLabel: service
      replacement: loki-gateway
  
  # Tempo Gateway  
  - port: http
    interval: 30s
    path: /probe
    params:
      module: [http_2xx]
      target: [https://your-domain.com/tempo/ready]
    relabelings:
    - sourceLabels: [__param_target]
      targetLabel: instance
    - targetLabel: __address__
      replacement: blackbox-exporter.monitoring.svc.cluster.local:9115
    - targetLabel: job
      replacement: tempo-probe
    - targetLabel: service
      replacement: tempo-gateway
```

## 6. Troubleshooting

### Check Blackbox Exporter Status

```bash
# Check pod status
kubectl get pods -n monitoring | grep blackbox

# Check logs
kubectl logs -n monitoring deployment/blackbox-exporter

# Test probe directly
kubectl port-forward -n monitoring svc/blackbox-exporter 9115:9115
curl "http://localhost:9115/probe?target=https://example.com&module=http_2xx"
```

### Verify Prometheus Scraping

```bash
# Check ServiceMonitor
kubectl get servicemonitors -n monitoring

# Port forward to Prometheus and check targets
kubectl port-forward -n monitoring svc/prometheus-service 9090:9090
# Navigate to http://localhost:9090/targets
```

### Common Issues

1. **Probe failing**: Check target URL accessibility from cluster
2. **No metrics in Grafana**: Verify ServiceMonitor selector matches Prometheus configuration  
3. **SSL errors**: Adjust `fail_if_not_ssl` setting in blackbox config
4. **Timeout issues**: Increase probe timeout in configuration
5. **Auth endpoints failing**: Use `http_2xx_4xx` module for endpoints that return 401/403 for unauthenticated requests
6. **Metrics not appearing in AMG**: Allow 5-15 minutes for metrics to propagate through Prometheus Agent → AMP → AMG pipeline

### Why HTTP Probes vs Internal Metrics

**HTTP probes are more reliable than internal service mesh metrics for several reasons:**

- **Real user experience**: Tests the actual HTTP endpoint users/clients would hit
- **End-to-end validation**: Includes network, load balancer, ingress, and service layers  
- **Auth-aware**: Can distinguish between service down (503) vs auth required (401)
- **Service mesh independent**: Works regardless of Istio/mesh configuration
- **Clear failure modes**: Connection refused, timeout, or HTTP errors are unambiguous

**Example: Istio `pilot_endpoint_not_ready` vs HTTP probe**
- Istio metrics may not trigger when pods are cleanly scaled down (normal behavior)
- HTTP probes detect actual service unavailability regardless of the cause
- Tested scenario: Scaling down loki-gateway triggered HTTP probe alert but not Istio endpoint alert

## 7. Best Practices

### Security
- Use dedicated service account with minimal permissions
- Configure network policies to restrict blackbox exporter access
- Use secure endpoints (HTTPS) where possible

### Performance
- Set appropriate scrape intervals (30s-60s for most use cases)
- Monitor blackbox exporter resource usage
- Use multiple replicas for high availability

### Alerting
- Set reasonable evaluation periods (1-5 minutes)
- Use different severity levels (critical/warning)
- Include relevant context in alert descriptions
- Test alerts by temporarily scaling down services

### Monitoring
- Monitor the blackbox exporter itself
- Track probe success rates over time  
- Set up alerts for blackbox exporter downtime
- Use dashboards to visualize endpoint health trends

## 8. Integration with Grafana

### Sample Dashboard Queries

```promql
# Service uptime percentage
avg_over_time(probe_success{job="loki-gateway-probe"}[24h]) * 100

# Response time trends
probe_duration_seconds{job="loki-gateway-probe"}

# Availability heatmap
probe_success{job=~".*-probe"}
```

This setup provides reliable HTTP endpoint monitoring that complements internal service metrics and gives you real-world service availability insights.