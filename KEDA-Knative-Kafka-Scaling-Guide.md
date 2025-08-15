# Testing KEDA Scaling for Knative Kafka Components

## Overview

KEDA scales Knative Kafka components through **annotation-based autoscaling** on Triggers and direct **ScaledObject** configurations for the data plane components:

1. **kafka-broker-dispatcher** (StatefulSet) - Scales based on consumer group lag
2. **kafka-broker-receiver** (Deployment) - Scales based on incoming request volume
3. **Consumer Groups** - Individual triggers get their own consumer groups that scale independently

## Prerequisites

1. **Enable KEDA Controller**: Apply the feature flag configuration
2. **Install KEDA**: In your EKS cluster
3. **Configure MSK Authentication**: SCRAM-SHA-512 or IAM

## Step 1: Enable KEDA Autoscaling

```bash
# Enable KEDA controller in Knative
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: config-kafka-features
  namespace: knative-eventing
data:
  controller-autoscaler-keda: "enabled"
EOF
```

## Step 2: Configure MSK Authentication

```bash
# Create MSK authentication secret
kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: kafka-secret
  namespace: knative-eventing
type: Opaque
data:
  user: $(echo -n "your-msk-username" | base64)
  password: $(echo -n "your-msk-password" | base64)
  protocol: $(echo -n "SASL_SSL" | base64)
  sasl.mechanism: $(echo -n "SCRAM-SHA-512" | base64)
EOF

# Create TriggerAuthentication for KEDA
kubectl apply -f - <<EOF
apiVersion: keda.sh/v1alpha1
kind: TriggerAuthentication
metadata:
  name: msk-scram-auth
  namespace: knative-eventing
spec:
  secretTargetRef:
  - parameter: username
    name: kafka-secret
    key: user
  - parameter: password
    name: kafka-secret
    key: password
EOF
```

## Step 3: Test Dispatcher Scaling

### 3.1 Create a ScaledObject for kafka-broker-dispatcher

```yaml
# dispatcher-scaledobject.yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: kafka-broker-dispatcher
  namespace: knative-eventing
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: StatefulSet
    name: kafka-broker-dispatcher
  pollingInterval: 15                      # Check every 15 seconds
  cooldownPeriod: 180                      # Wait 3 minutes before scaling down
  minReplicaCount: 1
  maxReplicaCount: 20
  triggers:
  - type: kafka
    metadata:
      bootstrapServers: YOUR_MSK_BOOTSTRAP_SERVERS
      consumerGroup: knative-trigger-demo-trigger  # Consumer group for your trigger
      topic: knative-trigger-demo-trigger          # Topic for your trigger
      lagThreshold: "50"                           # Scale up when lag > 50 messages
      activationLagThreshold: "10"                 # Keep at least 1 replica when lag > 10
      tls: enable
      sasl: scram_sha512
      offsetResetPolicy: latest
    authenticationRef:
      name: msk-scram-auth
```

```bash
kubectl apply -f dispatcher-scaledobject.yaml
```

### 3.2 Test Annotation-Based Scaling for Triggers

```yaml
# keda-scaled-trigger.yaml
apiVersion: eventing.knative.dev/v1
kind: Trigger
metadata:
  name: demo-trigger
  namespace: default
  annotations:
    autoscaling.knative.dev/class: "keda.autoscaling.knative.dev"
    autoscaling.knative.dev/minScale: "0"
    autoscaling.knative.dev/maxScale: "5"
    keda.autoscaling.knative.dev/lagThreshold: "30"
    keda.autoscaling.knative.dev/activationLagThreshold: "5"
    keda.autoscaling.knative.dev/pollingInterval: "15"
    keda.autoscaling.knative.dev/cooldownPeriod: "60"
spec:
  broker: demo-broker
  filter:
    attributes:
      type: dev.knative.samples.heartbeat
  subscriber:
    ref:
      apiVersion: serving.knative.dev/v1
      kind: Service
      name: event-display
```

```bash
kubectl apply -f keda-scaled-trigger.yaml
```

## Step 4: Load Testing Setup

### 4.1 Create Producer Job

```yaml
# kafka-producer-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: kafka-burst-producer
  namespace: default
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: producer
        image: docker.io/edenhill/kcat:1.7.1
        command: ["/bin/sh", "-c"]
        args:
        - |
          for i in $(seq 1 10000); do
            printf '{"id":%d,"timestamp":"%s"}\n' "$i" "$(date)" \
              | kcat -P \
                  -b "$BOOTSTRAP" \
                  -t demo-topic \
                  -X security.protocol=SASL_SSL \
                  -X sasl.mechanism=SCRAM-SHA-512 \
                  -X sasl.username="$KAFKA_USER" \
                  -X sasl.password="$KAFKA_PASS"
          done
          echo "✔ Load test complete"
        env:
        - name: BOOTSTRAP
          value: "YOUR_MSK_BOOTSTRAP_SERVERS"
        - name: KAFKA_USER
          valueFrom:
            secretKeyRef: {name: kafka-secret, key: user}
        - name: KAFKA_PASS
          valueFrom:
            secretKeyRef: {name: kafka-secret, key: password}
```

```bash
kubectl apply -f kafka-producer-job.yaml
```

### 4.2 Create Consumer Application

```yaml
# kafka-consumer-app.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-demo-consumer
  namespace: default
spec:
  replicas: 0  # Start with 0 replicas
  selector:
    matchLabels: {app: kafka-demo-consumer}
  template:
    metadata:
      labels: {app: kafka-demo-consumer}
    spec:
      containers:
      - name: consumer
        image: docker.io/edenhill/kcat:1.7.1
        command: ["/bin/sh", "-c"]
        args:
        - |
          kcat -C \
               -b "$BOOTSTRAP" \
               -t demo-topic \
               -G demo-group \
               -X security.protocol=SASL_SSL \
               -X sasl.mechanism=SCRAM-SHA-512 \
               -X sasl.username="$KAFKA_USER" \
               -X sasl.password="$KAFKA_PASS" \
               -q
        env:
        - name: BOOTSTRAP
          value: "YOUR_MSK_BOOTSTRAP_SERVERS"
        - name: KAFKA_USER
          valueFrom:
            secretKeyRef: {name: kafka-secret, key: user}
        - name: KAFKA_PASS
          valueFrom:
            secretKeyRef: {name: kafka-secret, key: password}
```

```bash
kubectl apply -f kafka-consumer-app.yaml
```

## Step 5: Verification and Monitoring

### 5.1 Monitor Dispatcher Scaling

```bash
# Watch dispatcher pods scaling
kubectl get pods -n knative-eventing -l app=kafka-broker-dispatcher -w

# Check dispatcher StatefulSet status
kubectl get statefulset kafka-broker-dispatcher -n knative-eventing

# Monitor KEDA ScaledObject status
kubectl get scaledobject kafka-broker-dispatcher -n knative-eventing -o yaml
```

### 5.2 Monitor Consumer Group Lag

```bash
# Check consumer group lag (using kafka-consumer-groups)
kubectl run kafka-client --image=confluentinc/cp-kafka:latest --rm -it -- \
  kafka-consumer-groups \
  --bootstrap-server YOUR_MSK_BOOTSTRAP_SERVERS \
  --group demo-group \
  --describe \
  --command-config /etc/kafka/consumer.properties

# Monitor KEDA metrics for lag
kubectl get --raw "/apis/external.metrics.k8s.io/v1beta1/namespaces/default/kafka-demo-group-demo-topic"
```

### 5.3 Verify Receiver Scaling

```bash
# Monitor receiver deployment
kubectl get deployment kafka-broker-receiver -n knative-eventing -w

# Check receiver service endpoints
kubectl get endpoints kafka-broker-ingress -n knative-eventing

# Monitor receiver metrics
kubectl port-forward -n knative-eventing deployment/kafka-broker-receiver 9090:9090
# Access http://localhost:9090/metrics
```

### 5.4 Test Scaling Behavior

```bash
# 1. Generate load and watch scaling
kubectl apply -f kafka-producer-job.yaml

# 2. Monitor scaling in real-time
watch kubectl get pods -l app=kafka-demo-consumer

# 3. Check KEDA scaler metrics
kubectl get hpa -A | grep keda

# 4. Monitor dispatcher scaling
kubectl get statefulset kafka-broker-dispatcher -n knative-eventing -w

# 5. Check trigger scaling (if using annotation-based)
kubectl get scaledobject -A
```

### 5.5 Debugging Commands

```bash
# Check KEDA operator logs
kubectl logs -n keda deployment/keda-operator -f

# Check KEDA metrics server
kubectl logs -n keda deployment/keda-metrics-apiserver -f

# Describe ScaledObject for detailed status
kubectl describe scaledobject kafka-broker-dispatcher -n knative-eventing

# Check trigger authentication
kubectl describe triggerauthentication msk-scram-auth -n knative-eventing

# Monitor Kafka broker controller logs
kubectl logs -n knative-eventing deployment/kafka-controller -f
```

## Step 6: Performance Validation

### 6.1 Key Metrics to Monitor

1. **Dispatcher Scaling**:
   - CPU/Memory utilization: `kubectl top pods -n knative-eventing -l app=kafka-broker-dispatcher`
   - Replica count: `kubectl get statefulset kafka-broker-dispatcher -n knative-eventing`
   - Message processing rate: Check metrics endpoint

2. **Consumer Group Lag**:
   - Current lag: Via kafka-consumer-groups command
   - KEDA lag metrics: Via external metrics API
   - Scaling triggers: Check ScaledObject status

3. **Receiver Performance**:
   - Request throughput: Monitor ingress metrics
   - Response times: Check receiver metrics endpoint
   - Error rates: Monitor logs and metrics

### 6.2 Expected Scaling Behavior

- **Scale Up**: When consumer group lag exceeds `lagThreshold` (50 messages)
- **Scale Down**: After `cooldownPeriod` (180 seconds) when lag is below threshold
- **Minimum Replicas**: Always maintains `minReplicaCount` (1)
- **Maximum Replicas**: Never exceeds `maxReplicaCount` (20)

### 6.3 Troubleshooting Common Issues

1. **Scaling Not Triggered**:
   - Check TriggerAuthentication credentials
   - Verify MSK connectivity from pods
   - Check consumer group exists and has lag

2. **Authentication Errors**:
   - Verify SCRAM credentials are correct
   - Check MSK cluster security groups
   - Ensure TLS is properly configured

3. **Performance Issues**:
   - Adjust resource limits for dispatcher
   - Tune polling intervals and cooldown periods
   - Monitor network latency to MSK

## Architecture Summary

KEDA scales Knative Kafka components through two primary mechanisms:

### 1. **Direct ScaledObject for kafka-broker-dispatcher**
- **Component**: `kafka-broker-dispatcher` (StatefulSet)
- **Scaling Metric**: Consumer group lag from MSK
- **Configuration**: Explicit ScaledObject with Kafka trigger
- **Use Case**: Scales the dispatcher based on pending messages to process

### 2. **Annotation-Based Scaling for Triggers**
- **Component**: Individual consumer groups created per Trigger
- **Scaling Metric**: Consumer group lag per trigger
- **Configuration**: Annotations on Trigger resources
- **Use Case**: Scales individual trigger processing capacity

### 3. **kafka-broker-receiver Scaling**
- **Component**: `kafka-broker-receiver` (Deployment)
- **Scaling Metric**: HTTP request volume or connection count
- **Configuration**: Standard Kubernetes HPA or KEDA ScaledObject
- **Use Case**: Scales ingress capacity for incoming events

The key insight is that KEDA provides **lag-based autoscaling** for Kafka workloads, where:
- Each Trigger gets its own consumer group
- Each consumer group can scale independently based on message lag
- The dispatcher component scales to handle multiple consumer groups efficiently
- The receiver component scales to handle incoming event ingress

This architecture allows for fine-grained scaling based on actual Kafka message processing demand rather than just CPU/memory metrics.

## Key Annotations for KEDA Scaling

```yaml
# Essential annotations for Trigger-based scaling
annotations:
  autoscaling.knative.dev/class: "keda.autoscaling.knative.dev"
  autoscaling.knative.dev/minScale: "0"
  autoscaling.knative.dev/maxScale: "5"
  keda.autoscaling.knative.dev/lagThreshold: "30"
  keda.autoscaling.knative.dev/activationLagThreshold: "5"
  keda.autoscaling.knative.dev/pollingInterval: "15"
  keda.autoscaling.knative.dev/cooldownPeriod: "60"
```

## Next Steps

1. **Configure Prometheus monitoring** for KEDA metrics
2. **Set up Grafana dashboards** for visualization
3. **Implement alerting** for scaling events
4. **Tune performance** based on your workload characteristics
5. **Test failure scenarios** and recovery mechanisms
