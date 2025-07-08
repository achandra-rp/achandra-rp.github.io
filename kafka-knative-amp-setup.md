# End-to-End Installation & Validation Guide

*Complete setup and testing for Prometheus Agent → Amazon Managed Prometheus (AMP) → Grafana dashboards for Knative & Kafka*

![image](https://github.com/user-attachments/assets/e8b7b32e-cb26-4488-a15a-96d7626c233c)

---

## 1 Prerequisites & Environment Validation

### 1.1 Required Components
* **EKS cluster** (≥ 1.24) with OIDC provider enabled
* **Command line tools**: `helm` ≥ 3.10, `kubectl`, `jq`, and AWS CLI v2
* **AWS Resources**: 
  - AMP workspace (e.g., `<AMP_WORKSPACE_ID>`)
  - Grafana instance with AMP integration
* **Kafka cluster**: MSK, Strimzi, or other Kafka deployment reachable from EKS nodes
* **Knative**: Serving and/or Eventing components installed

### 1.2 Validate Prerequisites
```bash
# Check EKS cluster and OIDC
aws eks describe-cluster --name <your-cluster-name> --query 'cluster.identity.oidc.issuer'

# Verify command line tools
helm version --short
kubectl version --client --short
jq --version
aws --version

# Install awscurl for querying AMP (required for testing)
pip install awscurl

# Check AMP workspace exists
aws amp describe-workspace --workspace-id <AMP_WORKSPACE_ID> --region <YOUR_AWS_REGION>

# Verify Knative components
kubectl get pods -n knative-serving
kubectl get pods -n knative-eventing

# Check Kafka accessibility (replace with your Kafka endpoints)
kubectl run kafka-test --rm -it --restart=Never --image=confluentinc/cp-kafka:latest -- \
  kafka-topics --bootstrap-server <your-kafka-broker>:9092 --list
```

---

## 2 Create IRSA Role for AMP Integration

### 2.1 Gather Required Information
```bash
# Get your AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Get your EKS cluster's OIDC issuer
OIDC_ISSUER=$(aws eks describe-cluster --name <your-cluster-name> --query 'cluster.identity.oidc.issuer' --output text)
OIDC_ID=$(echo $OIDC_ISSUER | cut -d'/' -f5)

echo "Account ID: $AWS_ACCOUNT_ID"
echo "OIDC ID: $OIDC_ID"
```

### 2.2 Create IAM Role and Policy
```bash
# Create the IAM policy
cat > amp-ingest-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "aps:RemoteWrite",
        "aps:GetSeries",
        "aps:GetLabels",
        "aps:GetMetricMetadata"
      ],
      "Resource": "arn:aws:aps:<YOUR_AWS_REGION>:$AWS_ACCOUNT_ID:workspace/<AMP_WORKSPACE_ID>"
    }
  ]
}
EOF

aws iam create-policy --policy-name EKS-AMP-Ingest-Policy --policy-document file://amp-ingest-policy.json

# Create the trust policy
cat > amp-trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::$AWS_ACCOUNT_ID:oidc-provider/oidc.eks.<YOUR_AWS_REGION>.amazonaws.com/id/$OIDC_ID"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.<YOUR_AWS_REGION>.amazonaws.com/id/$OIDC_ID:sub": "system:serviceaccount:monitoring:amp-iamproxy-ingest"
        }
      }
    }
  ]
}
EOF

# Create the IAM role
aws iam create-role --role-name EKS-AMP-Ingest --assume-role-policy-document file://amp-trust-policy.json

# Attach the policy to the role
aws iam attach-role-policy --role-name EKS-AMP-Ingest --policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/EKS-AMP-Ingest-Policy
```

### 2.3 Create ServiceAccount
```bash
# Create the monitoring namespace
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Create the ServiceAccount with IRSA annotation
cat > amp-serviceaccount.yaml << EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: amp-iamproxy-ingest
  namespace: monitoring
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::$AWS_ACCOUNT_ID:role/EKS-AMP-Ingest
EOF

kubectl apply -f amp-serviceaccount.yaml
```

### 2.4 Validate IRSA Setup
```bash
# Check ServiceAccount annotation
kubectl get sa amp-iamproxy-ingest -n monitoring -o yaml

# Test role assumption (should show assumed role ARN)
kubectl run irsa-test --rm -it --restart=Never --serviceaccount=amp-iamproxy-ingest --namespace=monitoring --image=amazon/aws-cli:latest -- \
  sts get-caller-identity
```

---

## 3 Install Prometheus Agent with Helm

### 3.1 Add Helm Repository
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

### 3.2 Install Prometheus Agent
```bash
# Replace these values with your actual cluster name and workspace ID
CLUSTER_NAME="<YOUR_CLUSTER_NAME>"
WORKSPACE_ID="<AMP_WORKSPACE_ID>"
AWS_REGION="<YOUR_AWS_REGION>"

helm upgrade --install amp-agent prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set prometheus.serviceAccount.create=false \
  --set prometheus.serviceAccount.name=amp-iamproxy-ingest \
  --set prometheus.prometheusSpec.serviceAccountName=amp-iamproxy-ingest \
  --set prometheus.prometheusSpec.mode=agent \
  --set prometheus.prometheusSpec.enableRemoteWriteReceiver=false \
  --set prometheus.prometheusSpec.externalLabels.cluster=$CLUSTER_NAME \
  --set-string "prometheus.prometheusSpec.remoteWrite[0].url=https://aps-workspaces.$AWS_REGION.amazonaws.com/workspaces/$WORKSPACE_ID/api/v1/remote_write" \
  --set "prometheus.prometheusSpec.remoteWrite[0].sigv4.region=$AWS_REGION" \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set-json prometheus.prometheusSpec.serviceMonitorSelector='{}' \
  --set-json prometheus.prometheusSpec.serviceMonitorNamespaceSelector='{}' \
  --set prometheusOperator.serviceMonitor.selfNamespace=true \
  --set prometheus.prometheusSpec.scrapeInterval=30s \
  --set 'prometheus.prometheusSpec.remoteWrite[0].queueConfig.maxSamplesPerSend=1000' \
  --set 'prometheus.prometheusSpec.remoteWrite[0].queueConfig.batchSendDeadline=30s' \
  --set 'prometheus.prometheusSpec.remoteWrite[0].queueConfig.maxShards=200' \
  --set 'prometheus.prometheusSpec.remoteWrite[0].queueConfig.capacity=5000'
```

### 3.3 Verify Prometheus Agent Installation
```bash
# Check if pods are running
kubectl get pods -n monitoring -l app.kubernetes.io/name=prometheus

# Check agent logs (look for successful startup)
kubectl logs -n monitoring -l app.kubernetes.io/name=prometheus --tail=20

# Verify ServiceAccount is being used
kubectl get pods -n monitoring -l app.kubernetes.io/name=prometheus -o yaml | grep -A2 -B2 serviceAccount
```

---

## 4 Deploy Knative ServiceMonitors

### 4.1 Install Knative Monitoring Components
```bash
# Install Knative monitoring ServiceMonitors
kubectl apply -f https://raw.githubusercontent.com/knative-extensions/monitoring/main/servicemonitor.yaml

# Verify ServiceMonitors were created
kubectl get servicemonitor -A | grep knative
```

### 4.2 Validate Knative Metrics Endpoints
```bash
# Check if Knative pods expose metrics
kubectl get pods -n knative-serving -o wide
kubectl get pods -n knative-eventing -o wide

# Test metrics endpoint on a Knative pod (replace POD_NAME)
kubectl exec -n knative-serving <POD_NAME> -- curl -s localhost:9090/metrics | head -10

# Or port-forward to test locally
kubectl port-forward -n knative-serving <POD_NAME> 9090:9090 &
curl -s localhost:9090/metrics | grep -E "knative_|serving_|eventing_" | head -5
```

---

## 5 Deploy kafka-exporter and ServiceMonitor

### 5.1 Create Kafka Credentials Secret
```bash
# Create secret for Kafka authentication (adjust based on your setup)
kubectl create secret generic kafka-secret \
  --from-literal=user=<your-kafka-username> \
  --from-literal=password=<your-kafka-password> \
  --namespace=monitoring

# For MSK with IAM authentication, you might not need username/password
# Instead, use IAM roles for service accounts
```

### 5.2 Deploy kafka-exporter
```yaml
# kafka-exporter.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-exporter
  namespace: monitoring
  labels: 
    app: kafka-exporter
    component: metrics
spec:
  replicas: 1
  selector:
    matchLabels: 
      app: kafka-exporter
  template:
    metadata:
      labels: 
        app: kafka-exporter
        component: metrics
    spec:
      containers:
      - name: kafka-exporter
        image: danielqsj/kafka-exporter:v1.7.0
        args:
          # Replace with your actual Kafka broker endpoints
          - '--kafka.server=<KAFKA_BROKER_1>'
          - '--kafka.server=<KAFKA_BROKER_2>'
          - '--kafka.server=<KAFKA_BROKER_3>'
          - '--sasl.enabled'
          - '--sasl.username=$(KAFKA_USERNAME)'
          - '--sasl.password=$(KAFKA_PASSWORD)'
          - '--sasl.mechanism=scram-sha512'
          - '--tls.enabled'
          - '--tls.insecure-skip-tls-verify'
          - '--kafka.version=<KAFKA_VERSION>'
          - '--web.listen-address=:9308'
          - '--log.level=info'
        env:
          - name: KAFKA_USERNAME
            valueFrom: 
              secretKeyRef: 
                name: kafka-secret
                key: user
          - name: KAFKA_PASSWORD
            valueFrom: 
              secretKeyRef: 
                name: kafka-secret
                key: password
        ports:
          - name: metrics
            containerPort: 9308
            protocol: TCP
        livenessProbe:
          httpGet:
            path: /metrics
            port: 9308
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /metrics
            port: 9308
          initialDelaySeconds: 5
          periodSeconds: 10
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"
---
apiVersion: v1
kind: Service
metadata:
  name: kafka-exporter
  namespace: monitoring
  labels: 
    app: kafka-exporter
    component: metrics
spec:
  type: ClusterIP
  ports:
    - name: metrics
      port: 9308
      targetPort: 9308
      protocol: TCP
  selector:
    app: kafka-exporter
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: kafka-exporter
  namespace: monitoring
  labels:
    app: kafka-exporter
    component: metrics
spec:
  selector:
    matchLabels:
      app: kafka-exporter
  endpoints:
    - port: metrics
      path: /metrics
      interval: 30s
      scrapeTimeout: 10s
      honorLabels: true
  namespaceSelector:
    matchNames:
      - monitoring
```

### 5.3 Apply kafka-exporter Configuration
```bash
# Apply the complete kafka-exporter setup
kubectl apply -f kafka-exporter.yaml

# Check deployment status
kubectl get deployment kafka-exporter -n monitoring
kubectl get pods -n monitoring -l app=kafka-exporter

# Check service and endpoints
kubectl get svc kafka-exporter -n monitoring
kubectl get endpoints kafka-exporter -n monitoring
```

---

## 6 Comprehensive kafka-exporter Testing

### 6.1 Basic Connectivity Tests
```bash
# Check if kafka-exporter pod is running
kubectl get pods -n monitoring -l app=kafka-exporter -o wide

# Check pod logs for any errors
kubectl logs -n monitoring -l app=kafka-exporter --tail=20

# Test if the metrics endpoint is accessible
kubectl exec -n monitoring -l app=kafka-exporter -- curl -s localhost:9308/metrics | head -10
```

### 6.2 Port-Forward and Web Interface Testing
```bash
# Port-forward to access kafka-exporter web interface
kubectl port-forward -n monitoring svc/kafka-exporter 9308:9308 &

# Test metrics endpoint locally
curl -s localhost:9308/metrics | head -20

# Access the web interface (open in browser)
echo "Open http://localhost:9308 in your browser to see kafka-exporter web interface"

# Test specific metric queries
curl -s localhost:9308/metrics | grep -E "kafka_brokers|kafka_topic_partitions|kafka_consumergroup_lag"

# Check for specific Kafka metrics
curl -s localhost:9308/metrics | grep -c "kafka_" 
echo "Total kafka metrics found: $(curl -s localhost:9308/metrics | grep -c "kafka_")"
```

### 6.3 Kafka Connection Validation
```bash
# Check if kafka-exporter can connect to Kafka brokers
kubectl logs -n monitoring -l app=kafka-exporter | grep -E "connecting|connected|error|failed"

# Look for successful broker connections
kubectl logs -n monitoring -l app=kafka-exporter | grep -i "broker"

# Check for authentication success
kubectl logs -n monitoring -l app=kafka-exporter | grep -i "auth"
```

### 6.4 Metrics Quality Tests
```bash
# Test for essential Kafka metrics
METRICS_ENDPOINT="localhost:9308"

echo "Testing essential Kafka metrics..."

# Broker metrics
echo "Broker metrics:"
curl -s http://$METRICS_ENDPOINT/metrics | grep "kafka_brokers{" | head -3

# Topic metrics
echo "Topic metrics:"
curl -s http://$METRICS_ENDPOINT/metrics | grep "kafka_topic_partitions{" | head -3

# Consumer group lag (critical for monitoring)
echo "Consumer group lag metrics:"
curl -s http://$METRICS_ENDPOINT/metrics | grep "kafka_consumergroup_lag{" | head -3

# Partition metrics
echo "Partition metrics:"
curl -s http://$METRICS_ENDPOINT/metrics | grep "kafka_partition_" | head -3

# Count total metrics
echo "Total metrics exposed:"
curl -s http://$METRICS_ENDPOINT/metrics | grep -E "^kafka_" | wc -l
```

### 6.5 ServiceMonitor Discovery Test
```bash
# Check if Prometheus can discover kafka-exporter ServiceMonitor
kubectl get servicemonitor kafka-exporter -n monitoring -o yaml

# Verify labels match between service and ServiceMonitor
kubectl get svc kafka-exporter -n monitoring -o yaml | grep -A5 "labels:"
kubectl get servicemonitor kafka-exporter -n monitoring -o yaml | grep -A5 "matchLabels:"
```

### 6.6 kafka-exporter Health Check Script
```bash
#!/bin/bash
# kafka-exporter-health-check.sh

NAMESPACE="monitoring"
SERVICE_NAME="kafka-exporter"
METRICS_PORT="9308"

echo "=== kafka-exporter Health Check ==="

# Check pod status
echo "1. Checking pod status..."
POD_STATUS=$(kubectl get pods -n $NAMESPACE -l app=$SERVICE_NAME -o jsonpath='{.items[0].status.phase}')
if [ "$POD_STATUS" = "Running" ]; then
    echo "✓ Pod is running"
else
    echo "✗ Pod is not running: $POD_STATUS"
    exit 1
fi

# Check service endpoints
echo "2. Checking service endpoints..."
ENDPOINTS=$(kubectl get endpoints $SERVICE_NAME -n $NAMESPACE -o jsonpath='{.subsets[0].addresses[0].ip}')
if [ -n "$ENDPOINTS" ]; then
    echo "✓ Service has endpoints: $ENDPOINTS"
else
    echo "✗ Service has no endpoints"
    exit 1
fi

# Test metrics endpoint
echo "3. Testing metrics endpoint..."
kubectl exec -n $NAMESPACE -l app=$SERVICE_NAME -- curl -s --max-time 5 localhost:$METRICS_PORT/metrics > /tmp/kafka-metrics.txt
if [ $? -eq 0 ]; then
    METRIC_COUNT=$(grep -c "^kafka_" /tmp/kafka-metrics.txt)
    echo "✓ Metrics endpoint accessible, found $METRIC_COUNT kafka metrics"
else
    echo "✗ Metrics endpoint not accessible"
    exit 1
fi

# Check for critical metrics
echo "4. Checking for critical metrics..."
CRITICAL_METRICS=("kafka_brokers" "kafka_topic_partitions" "kafka_consumergroup_lag")
for metric in "${CRITICAL_METRICS[@]}"; do
    if grep -q "$metric" /tmp/kafka-metrics.txt; then
        echo "✓ Found $metric"
    else
        echo "⚠ Missing $metric"
    fi
done

# Check ServiceMonitor
echo "5. Checking ServiceMonitor..."
kubectl get servicemonitor $SERVICE_NAME -n $NAMESPACE > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ ServiceMonitor exists"
else
    echo "✗ ServiceMonitor missing"
    exit 1
fi

echo "=== Health check complete ==="
```

---

## 7 End-to-End Pipeline Testing

### 7.1 Install awscurl (Required for AMP Querying)
```bash
# Install awscurl for querying AMP
pip install awscurl

# Alternative: Use Docker if you don't want to install Python dependencies
docker pull okigan/awscurl

# Test awscurl installation
awscurl --version
```

### 7.2 Port-Forward Prometheus Agent
```bash
# Port-forward Prometheus agent for testing
kubectl -n monitoring port-forward deploy/<PROMETHEUS_AGENT_DEPLOYMENT_NAME> 9090:9090 &
```

### 7.3 Verify Metrics Collection
```bash
# Check that kafka-exporter metrics are collected by Prometheus
echo "Testing kafka-exporter metrics collection..."
curl -sG 'http://localhost:9090/api/v1/label/__name__/values' \
     --data-urlencode 'match[]={job="kafka-exporter"}' | jq -r '.data[]' | head -10

# Check for specific kafka metrics
echo "Checking for kafka consumer group lag metrics..."
curl -sG 'http://localhost:9090/api/v1/query' \
     --data-urlencode 'query=kafka_consumergroup_lag' | jq '.data.result | length'

# Check for Knative metrics
echo "Checking for Knative metrics..."
curl -sG 'http://localhost:9090/api/v1/label/__name__/values' \
     --data-urlencode 'match[]={job=~".*knative.*"}' | jq -r '.data[]' | head -5
```

### 7.4 Verify Remote Write Queue Health
```bash
# Check samples being queued for remote write
echo "Checking remote write queue..."
curl -sG 'http://localhost:9090/api/v1/query' \
     --data-urlencode 'query=prometheus_remote_storage_samples_in_total' | jq '.data.result'

# Check samples being sent to AMP
echo "Checking samples sent to AMP..."
curl -sG 'http://localhost:9090/api/v1/query' \
     --data-urlencode 'query=rate(prometheus_remote_storage_sent_samples_total[5m])' | jq '.data.result'

# Check for any remote write errors
echo "Checking for remote write errors..."
curl -sG 'http://localhost:9090/api/v1/query' \
     --data-urlencode 'query=prometheus_remote_storage_failed_samples_total' | jq '.data.result'
```

### 7.5 Test AMP Data Reception
```bash
# First, get the workspace endpoint
WORKSPACE_ID="<AMP_WORKSPACE_ID>"
AWS_REGION="<YOUR_AWS_REGION>"

# Get the query endpoint URL
QUERY_ENDPOINT=$(aws amp describe-workspace \
    --workspace-id $WORKSPACE_ID \
    --region $AWS_REGION \
    --query 'workspace.prometheusEndpoint' \
    --output text)

echo "Workspace endpoint: $QUERY_ENDPOINT"

# Query AMP directly for kafka metrics using awscurl
echo "Querying AMP directly for kafka metrics..."
awscurl -X POST --region $AWS_REGION \
    --service aps \
    "${QUERY_ENDPOINT}api/v1/query" \
    -d 'query=count(kafka_consumergroup_lag{cluster="<YOUR_CLUSTER_NAME>"})' \
    --header 'Content-Type: application/x-www-form-urlencoded'

# Query for Knative metrics
echo "Querying AMP for Knative metrics..."
awscurl -X POST --region $AWS_REGION \
    --service aps \
    "${QUERY_ENDPOINT}api/v1/query" \
    -d 'query=count({cluster="<YOUR_CLUSTER_NAME>", __name__=~"knative_.*"})' \
    --header 'Content-Type: application/x-www-form-urlencoded'

# Alternative: Using Docker for awscurl
export WORKSPACE_ID="<AMP_WORKSPACE_ID>"
export AWS_REGION="<YOUR_AWS_REGION>"

QUERY_ENDPOINT=$(aws amp describe-workspace \
    --workspace-id $WORKSPACE_ID \
    --region $AWS_REGION \
    --query 'workspace.prometheusEndpoint' \
    --output text)

docker run --rm -it \
    -e AWS_ACCESS_KEY_ID \
    -e AWS_SECRET_ACCESS_KEY \
    -e AWS_SESSION_TOKEN \
    okigan/awscurl \
    --region $AWS_REGION \
    --service aps \
    "${QUERY_ENDPOINT}api/v1/query" \
    -d 'query=up{cluster="<YOUR_CLUSTER_NAME>"}' \
    --header 'Content-Type: application/x-www-form-urlencoded'
```

---

## 8 Grafana Integration and Validation

### 8.1 Configure Grafana Data Source
1. **Open Grafana** → **Configuration** → **Data Sources** → **Add data source**
2. **Select** → **Amazon Managed Prometheus**
3. **Configure**:
   - **Name**: `AMP-Knative-Kafka`
   - **Workspace ID**: `<AMP_WORKSPACE_ID>`
   - **Region**: `<YOUR_AWS_REGION>`
   - **Authentication**: `AWS SigV4`
   - **Default Region**: `<YOUR_AWS_REGION>`
4. **Click** → **Save & Test** (should show "Data source is working")

### 8.2 Test Grafana Queries
```promql
# Test basic connectivity
up{cluster="<YOUR_CLUSTER_NAME>"}

# Test kafka metrics
kafka_consumergroup_lag{cluster="<YOUR_CLUSTER_NAME>"}

# Test Knative metrics
rate(knative_broker_events_total{cluster="<YOUR_CLUSTER_NAME>"}[5m])

# Test aggregated metrics
sum(kafka_consumergroup_lag{cluster="<YOUR_CLUSTER_NAME>"}) by (consumergroup)
```

### 8.3 Create Sample Dashboard
```json
{
  "dashboard": {
    "title": "Kafka & Knative Metrics",
    "panels": [
      {
        "title": "Kafka Consumer Group Lag",
        "type": "graph",
        "targets": [
          {
            "expr": "kafka_consumergroup_lag{cluster=\"<YOUR_CLUSTER_NAME>\"}",
            "legendFormat": "{{consumergroup}} - {{topic}}"
          }
        ]
      },
      {
        "title": "Knative Broker Events Rate",
        "type": "graph", 
        "targets": [
          {
            "expr": "rate(knative_broker_events_total{cluster=\"<YOUR_CLUSTER_NAME>\"}[5m])",
            "legendFormat": "{{broker}} - {{event_type}}"
          }
        ]
      }
    ]
  }
}
```

---

## 9 Comprehensive Troubleshooting Guide

### 9.1 Common Issues and Solutions

#### Issue: kafka-exporter Not Collecting Metrics
**Symptoms**: No kafka metrics in Prometheus, web interface shows connection errors  
**Diagnostics**:
```bash
# Check pod logs
kubectl logs -n monitoring -l app=kafka-exporter

# Check Kafka connectivity
kubectl exec -n monitoring -l app=kafka-exporter -- nc -zv <kafka-broker> 9092

# Test authentication
kubectl exec -n monitoring -l app=kafka-exporter -- kafkacat -b <kafka-broker>:9092 -L
```

#### Issue: ServiceMonitor Not Discovered
**Symptoms**: Targets not showing up in Prometheus  
**Diagnostics**:
```bash
# Check ServiceMonitor labels
kubectl get servicemonitor kafka-exporter -n monitoring -o yaml

# Check if Prometheus can access ServiceMonitor
kubectl get servicemonitor -A --show-labels
```

#### Issue: Remote Write Failures
**Symptoms**: Metrics in Prometheus but not in AMP  
**Diagnostics**:
```bash
# Check IAM permissions
kubectl logs -n monitoring -l app.kubernetes.io/name=prometheus | grep -i "sigv4\|remote_write\|401\|403"

# Test AMP connectivity
kubectl run amp-test --rm -it --restart=Never --image=curlimages/curl -- \
  curl -v https://aps-workspaces.<YOUR_AWS_REGION>.amazonaws.com/workspaces/<AMP_WORKSPACE_ID>/api/v1/remote_write
```

### 9.2 Useful Debugging Commands
```bash
# List all ServiceMonitors
kubectl get servicemonitor -A

# Check Prometheus targets
curl -s localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job == "kafka-exporter")'

# Check queue health
curl -s localhost:9090/api/v1/query?query=prometheus_remote_storage_pending_samples | jq .

# Check network connectivity
kubectl run netcheck --rm -it --restart=Never --image=busybox -- \
  nc -zv kafka-exporter.monitoring.svc.cluster.local 9308
```

### 9.3 Performance Monitoring
```bash
# Monitor remote write performance
curl -s localhost:9090/api/v1/query?query=rate(prometheus_remote_storage_sent_samples_total[5m]) | jq .

# Check scrape duration
curl -s localhost:9090/api/v1/query?query=scrape_duration_seconds | jq .

# Monitor memory usage
kubectl top pods -n monitoring
```

---

## 10 Maintenance and Monitoring

### 10.1 Regular Health Checks
```bash
# Weekly health check script
#!/bin/bash
echo "=== Weekly Metrics Pipeline Health Check ==="

# Check all components
kubectl get pods -n monitoring | grep -E "prometheus|kafka-exporter"

# Check AMP workspace
aws amp describe-workspace --workspace-id <AMP_WORKSPACE_ID> --region <YOUR_AWS_REGION>

# Test end-to-end flow with awscurl
QUERY_ENDPOINT=$(aws amp describe-workspace \
    --workspace-id <AMP_WORKSPACE_ID> \
    --region <YOUR_AWS_REGION> \
    --query 'workspace.prometheusEndpoint' \
    --output text)

awscurl -X POST --region <YOUR_AWS_REGION> \
    --service aps \
    "${QUERY_ENDPOINT}api/v1/query" \
    -d 'query=up{cluster="<YOUR_CLUSTER_NAME>"}' \
    --header 'Content-Type: application/x-www-form-urlencoded'
```

### 10.2 Alerting Rules
```yaml
# prometheus-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: kafka-knative-alerts
  namespace: monitoring
spec:
  groups:
  - name: kafka
    rules:
    - alert: KafkaConsumerGroupLag
      expr: kafka_consumergroup_lag > 1000
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "Kafka consumer group lag is high"
        description: "Consumer group {{ $labels.consumergroup }} has lag of {{ $value }}"
  
  - name: knative
    rules:
    - alert: KnativeBrokerDown
      expr: up{job=~".*knative.*"} == 0
      for: 2m
      labels:
        severity: critical
      annotations:
        summary: "Knative broker is down"
```

---
