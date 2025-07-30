# KEDA Installation Guide for EKS with Kafka Broker and MSK

## Prerequisites

- **EKS Cluster**: Kubernetes version 1.29 or higher
- **AWS MSK**: Amazon Managed Streaming for Apache Kafka cluster
- **kubectl**: Configured to connect to your EKS cluster
- **helm**: Version 3.x installed
- **Prometheus & Grafana**: Already deployed with Kafka exporter for observability
- **IAM Permissions**: Appropriate AWS IAM roles for MSK access

## Step 1: Install KEDA on EKS

### Option A: Using Helm (Recommended)

```bash
# Add KEDA Helm repository
helm repo add kedacore https://kedacore.github.io/charts
helm repo update

# Install KEDA in dedicated namespace
helm install keda kedacore/keda --namespace keda --create-namespace

# Verify installation
kubectl get pods -n keda
```

### Option B: Using kubectl

```bash
# Apply KEDA manifest
kubectl apply --server-side -f https://github.com/kedacore/keda/releases/download/v2.17.0/keda-2.17.0.yaml

# Verify installation
kubectl get pods -n keda
```

## Step 2: Configure MSK Authentication

### Option A: IAM Authentication (Recommended for MSK)

Create an IAM role for your EKS pods:

```yaml
# keda-msk-role.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: keda-msk-service-account
  namespace: keda
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::YOUR_ACCOUNT_ID:role/keda-msk-role
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: keda-msk-role
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: keda-msk-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: keda-msk-role
subjects:
- kind: ServiceAccount
  name: keda-msk-service-account
  namespace: keda
```

Apply the service account:

```bash
kubectl apply -f keda-msk-role.yaml
```

### Option B: SASL/SCRAM Authentication

Create a secret with your MSK credentials:

```yaml
# msk-credentials.yaml
apiVersion: v1
kind: Secret
metadata:
  name: msk-credentials
  namespace: default
type: Opaque
stringData:
  username: your-msk-username
  password: your-msk-password
```

```bash
kubectl apply -f msk-credentials.yaml
```

## Step 3: Deploy Sample Application

Create a sample Kafka consumer application:

```yaml
# kafka-consumer-app.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-consumer-app
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kafka-consumer-app
  template:
    metadata:
      labels:
        app: kafka-consumer-app
    spec:
      serviceAccountName: keda-msk-service-account
      containers:
      - name: kafka-consumer
        image: confluentinc/cp-kafka:latest
        command:
        - /bin/bash
        - -c
        - |
          kafka-console-consumer \
            --bootstrap-server YOUR_MSK_BOOTSTRAP_SERVERS \
            --topic test-topic \
            --group test-consumer-group \
            --consumer-config /etc/kafka/consumer.properties
        env:
        - name: KAFKA_OPTS
          value: "-Djava.security.auth.login.config=/etc/kafka/kafka_client_jaas.conf"
        volumeMounts:
        - name: kafka-config
          mountPath: /etc/kafka
      volumes:
      - name: kafka-config
        configMap:
          name: kafka-config
```

## Step 4: Configure KEDA ScaledObject

### For IAM Authentication:

```yaml
# keda-scaledobject-iam.yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: kafka-consumer-scaler
  namespace: default
spec:
  scaleTargetRef:
    name: kafka-consumer-app
  minReplicaCount: 1
  maxReplicaCount: 10
  triggers:
  - type: kafka
    metadata:
      bootstrapServers: YOUR_MSK_BOOTSTRAP_SERVERS
      consumerGroup: test-consumer-group
      topic: test-topic
      lagThreshold: "10"
      offsetResetPolicy: "latest"
    authenticationRef:
      name: msk-iam-auth
---
apiVersion: keda.sh/v1alpha1
kind: TriggerAuthentication
metadata:
  name: msk-iam-auth
  namespace: default
spec:
  awsAccessKey:
    valueFrom:
      secretKeyRef:
        name: aws-credentials
        key: AWS_ACCESS_KEY_ID
  awsSecretKey:
    valueFrom:
      secretKeyRef:
        name: aws-credentials
        key: AWS_SECRET_ACCESS_KEY
  podIdentity:
    provider: aws-eks
```

### For SASL/SCRAM Authentication:

```yaml
# keda-scaledobject-sasl.yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: kafka-consumer-scaler
  namespace: default
spec:
  scaleTargetRef:
    name: kafka-consumer-app
  minReplicaCount: 1
  maxReplicaCount: 10
  triggers:
  - type: kafka
    metadata:
      bootstrapServers: YOUR_MSK_BOOTSTRAP_SERVERS
      consumerGroup: test-consumer-group
      topic: test-topic
      lagThreshold: "10"
      offsetResetPolicy: "latest"
    authenticationRef:
      name: msk-sasl-auth
---
apiVersion: keda.sh/v1alpha1
kind: TriggerAuthentication
metadata:
  name: msk-sasl-auth
  namespace: default
spec:
  secretTargetRef:
  - parameter: username
    name: msk-credentials
    key: username
  - parameter: password
    name: msk-credentials
    key: password
```

Apply the ScaledObject:

```bash
kubectl apply -f keda-scaledobject-iam.yaml
# OR
kubectl apply -f keda-scaledobject-sasl.yaml
```

## Update Todos

- [x] Explore the codebase to understand Kafka Broker components
- [x] Research KEDA installation instructions from official docs
- [x] Create comprehensive EKS + Kafka Broker installation guide
- [ ] Add testing and verification steps for scaling
- [ ] Include MSK-specific configuration details

## Step 5: Testing and Verification

### 5.1 Verify KEDA Installation

```bash
# Check KEDA components
kubectl get pods -n keda
kubectl get scaledobjects -n default
kubectl describe scaledobject kafka-consumer-scaler -n default
```

### 5.2 Test Message Production

Create a producer to generate messages:

```bash
# Create a producer pod
kubectl run kafka-producer --image=confluentinc/cp-kafka:latest --rm -it -- /bin/bash

# Inside the producer pod, send messages
kafka-console-producer \
  --bootstrap-server YOUR_MSK_BOOTSTRAP_SERVERS \
  --topic test-topic \
  --producer-config /etc/kafka/producer.properties
```

### 5.3 Monitor Scaling Behavior

```bash
# Watch replica scaling in real-time
kubectl get pods -l app=kafka-consumer-app -w

# Check HPA (Horizontal Pod Autoscaler) status
kubectl get hpa

# Monitor KEDA metrics
kubectl get scaledobjects -o yaml
```

### 5.4 Load Testing

Create a load test script:

```bash
# load-test.sh
#!/bin/bash
for i in {1..1000}; do
  echo "Message $i: $(date)" | kafka-console-producer \
    --bootstrap-server YOUR_MSK_BOOTSTRAP_SERVERS \
    --topic test-topic \
    --producer-config /etc/kafka/producer.properties
  sleep 0.1
done
```

Run the load test:

```bash
chmod +x load-test.sh
./load-test.sh
```

### 5.5 Verify Scaling Metrics

Check consumer lag:

```bash
kafka-consumer-groups \
  --bootstrap-server YOUR_MSK_BOOTSTRAP_SERVERS \
  --group test-consumer-group \
  --describe
```

## Step 6: Observability with Prometheus & Grafana

### 6.1 KEDA Metrics

KEDA exposes metrics on port 8080. Add the following ServiceMonitor:

```yaml
# keda-servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: keda-metrics
  namespace: keda
spec:
  selector:
    matchLabels:
      app: keda-metrics-apiserver
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
```

### 6.2 Grafana Dashboard Queries

Key metrics to monitor:

- `keda_scaled_object_paused_total`: Paused scaled objects
- `keda_scaler_metrics_value`: Current scaler metric values
- `keda_scaler_metrics_latency`: Scaler response times

### 6.3 AlertManager Rules

```yaml
# keda-alerts.yaml
groups:
- name: keda.rules
  rules:
  - alert: KEDAScalerDown
    expr: up{job="keda-metrics-apiserver"} == 0
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "KEDA scaler is down"
      description: "KEDA scaler has been down for more than 5 minutes"
```

## Step 7: MSK-Specific Configuration

### 7.1 MSK Bootstrap Servers

Replace `YOUR_MSK_BOOTSTRAP_SERVERS` with your actual MSK cluster endpoints:

```bash
# Get MSK cluster endpoints
aws kafka get-bootstrap-brokers --cluster-arn your-msk-cluster-arn
```

Example format:
```
b-1.msk-cluster.abc123.c2.kafka.us-east-1.amazonaws.com:9098,b-2.msk-cluster.abc123.c2.kafka.us-east-1.amazonaws.com:9098
```

### 7.2 MSK IAM Policy

Create IAM policy for MSK access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "kafka-cluster:Connect",
        "kafka-cluster:AlterCluster",
        "kafka-cluster:DescribeCluster"
      ],
      "Resource": [
        "arn:aws:kafka:region:account-id:cluster/cluster-name/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "kafka-cluster:*Topic*",
        "kafka-cluster:WriteData",
        "kafka-cluster:ReadData"
      ],
      "Resource": [
        "arn:aws:kafka:region:account-id:topic/cluster-name/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "kafka-cluster:AlterGroup",
        "kafka-cluster:DescribeGroup"
      ],
      "Resource": [
        "arn:aws:kafka:region:account-id:group/cluster-name/*"
      ]
    }
  ]
}
```

### 7.3 MSK Security Groups

Ensure your EKS nodes can access MSK:

```bash
# Allow inbound traffic from EKS security group to MSK
aws ec2 authorize-security-group-ingress \
  --group-id sg-msk-cluster \
  --protocol tcp \
  --port 9098 \
  --source-group sg-eks-nodes
```

### 7.4 MSK Configuration Properties

For IAM authentication, create kafka client properties:

```properties
# kafka-client-iam.properties
security.protocol=SASL_SSL
sasl.mechanism=AWS_MSK_IAM
sasl.jaas.config=software.amazon.msk.auth.iam.IAMLoginModule required;
sasl.client.callback.handler.class=software.amazon.msk.auth.iam.IAMClientCallbackHandler
```

For SASL/SCRAM:

```properties
# kafka-client-sasl.properties
security.protocol=SASL_SSL
sasl.mechanism=SCRAM-SHA-512
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username="your-username" password="your-password";
```

### 7.5 Advanced KEDA Configuration for MSK

```yaml
# advanced-keda-msk.yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: kafka-consumer-scaler
  namespace: default
spec:
  scaleTargetRef:
    name: kafka-consumer-app
  minReplicaCount: 1
  maxReplicaCount: 20
  pollingInterval: 30
  cooldownPeriod: 300
  triggers:
  - type: kafka
    metadata:
      bootstrapServers: YOUR_MSK_BOOTSTRAP_SERVERS
      consumerGroup: test-consumer-group
      topic: test-topic
      lagThreshold: "10"
      offsetResetPolicy: "latest"
      allowIdleConsumers: "false"
      scaleToZeroOnInvalidOffset: "false"
      limitToPartitionsWithLag: "true"
    authenticationRef:
      name: msk-iam-auth
```

## Troubleshooting

### Common Issues:

1. **Authentication failures**: Verify IAM roles and MSK cluster policies
2. **Network connectivity**: Check security groups and VPC configuration
3. **Scaling delays**: Adjust pollingInterval and cooldownPeriod
4. **Resource limits**: Ensure adequate CPU/memory for scaled pods

### Debug Commands:

```bash
# Check KEDA logs
kubectl logs -n keda deployment/keda-operator

# Check ScaledObject status
kubectl describe scaledobject kafka-consumer-scaler

# Verify MSK connectivity
kubectl run -it --rm debug --image=confluentinc/cp-kafka:latest -- kafka-topics --bootstrap-server YOUR_MSK_BOOTSTRAP_SERVERS --list
```

## Final Update Todos

- [x] Explore the codebase to understand Kafka Broker components
- [x] Research KEDA installation instructions from official docs
- [x] Create comprehensive EKS + Kafka Broker installation guide
- [x] Add testing and verification steps for scaling
- [x] Include MSK-specific configuration details

## Summary

This comprehensive guide covers the complete installation and configuration of KEDA on EKS with Kafka Broker using AWS MSK. The guide includes:

✅ **KEDA Installation**: Both Helm and kubectl methods  
✅ **MSK Authentication**: IAM and SASL/SCRAM configurations  
✅ **Scaling Configuration**: Complete ScaledObject definitions  
✅ **Testing & Verification**: Load testing and monitoring steps  
✅ **Observability Integration**: Prometheus and Grafana setup  
✅ **MSK-Specific Details**: IAM policies, security groups, and client properties  
✅ **Troubleshooting**: Common issues and debug commands  

The guide is production-ready and includes security best practices for AWS MSK integration with proper IAM roles and authentication methods.
