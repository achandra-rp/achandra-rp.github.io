import DocPage from '../components/DocPage';

const KedaKnativeKafkaScaling = () => {
  return (
    <DocPage title="Testing KEDA Scaling for Knative Kafka Components">
      <h2>Overview</h2>
      <p>KEDA scales Knative Kafka components through <strong>annotation-based autoscaling</strong> on Triggers and direct <strong>ScaledObject</strong> configurations for the data plane components:</p>
      <ol>
        <li><strong>kafka-broker-dispatcher</strong> (StatefulSet) - Scales based on consumer group lag</li>
        <li><strong>kafka-broker-receiver</strong> (Deployment) - Scales based on incoming request volume</li>
        <li><strong>Consumer Groups</strong> - Individual triggers get their own consumer groups that scale independently</li>
      </ol>

      <h2>Prerequisites</h2>
      <ol>
        <li><strong>Enable KEDA Controller</strong>: Apply the feature flag configuration</li>
        <li><strong>Install KEDA</strong>: In your EKS cluster</li>
        <li><strong>Configure MSK Authentication</strong>: SCRAM-SHA-512 or IAM</li>
      </ol>

      <h2>Step 1: Enable KEDA Autoscaling</h2>
      <pre><code>{`# Enable KEDA controller in Knative
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: config-kafka-features
  namespace: knative-eventing
data:
  controller-autoscaler-keda: "enabled"
EOF`}</code></pre>

      <h2>Step 2: Configure MSK Authentication</h2>
      <pre><code>{`# Create MSK authentication secret
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
EOF`}</code></pre>

      <h2>Step 3: Test Dispatcher Scaling</h2>
      <h3>3.1 Create a ScaledObject for kafka-broker-dispatcher</h3>
      <pre><code>{`# dispatcher-scaledobject.yaml
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
      name: msk-scram-auth`}</code></pre>

      <pre><code>kubectl apply -f dispatcher-scaledobject.yaml</code></pre>

      <h3>3.2 Test Annotation-Based Scaling for Triggers</h3>
      <pre><code>{`# keda-scaled-trigger.yaml
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
      name: event-display`}</code></pre>

      <pre><code>kubectl apply -f keda-scaled-trigger.yaml</code></pre>

      <h2>Step 4: Load Testing Setup</h2>
      <h3>4.1 Create Producer Job</h3>
      <pre><code>{`# kafka-producer-job.yaml
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
            printf '{"id":%d,"timestamp":"%s"}\\n' "$i" "$(date)" \\
              | kcat -P \\
                  -b "$BOOTSTRAP" \\
                  -t demo-topic \\
                  -X security.protocol=SASL_SSL \\
                  -X sasl.mechanism=SCRAM-SHA-512 \\
                  -X sasl.username="$KAFKA_USER" \\
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
            secretKeyRef: {name: kafka-secret, key: password}`}</code></pre>

      <pre><code>kubectl apply -f kafka-producer-job.yaml</code></pre>

      <h3>4.2 Create Consumer Application</h3>
      <pre><code>{`# kafka-consumer-app.yaml
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
          kcat -C \\
               -b "$BOOTSTRAP" \\
               -t demo-topic \\
               -G demo-group \\
               -X security.protocol=SASL_SSL \\
               -X sasl.mechanism=SCRAM-SHA-512 \\
               -X sasl.username="$KAFKA_USER" \\
               -X sasl.password="$KAFKA_PASS" \\
               -q
        env:
        - name: BOOTSTRAP
          value: "YOUR_MSK_BOOTSTRAP_SERVERS"
        - name: KAFKA_USER
          valueFrom:
            secretKeyRef: {name: kafka-secret, key: user}
        - name: KAFKA_PASS
          valueFrom:
            secretKeyRef: {name: kafka-secret, key: password}`}</code></pre>

      <pre><code>kubectl apply -f kafka-consumer-app.yaml</code></pre>

      <h2>Step 5: Verification and Monitoring</h2>
      <h3>5.1 Monitor Dispatcher Scaling</h3>
      <pre><code>{`# Watch dispatcher pods scaling
kubectl get pods -n knative-eventing -l app=kafka-broker-dispatcher -w

# Check dispatcher StatefulSet status
kubectl get statefulset kafka-broker-dispatcher -n knative-eventing

# Monitor KEDA ScaledObject status
kubectl get scaledobject kafka-broker-dispatcher -n knative-eventing -o yaml`}</code></pre>

      <h3>5.2 Monitor Consumer Group Lag</h3>
      <pre><code>{`# Check consumer group lag (using kafka-consumer-groups)
kubectl run kafka-client --image=confluentinc/cp-kafka:latest --rm -it -- \\
  kafka-consumer-groups \\
  --bootstrap-server YOUR_MSK_BOOTSTRAP_SERVERS \\
  --group demo-group \\
  --describe \\
  --command-config /etc/kafka/consumer.properties

# Monitor KEDA metrics for lag
kubectl get --raw "/apis/external.metrics.k8s.io/v1beta1/namespaces/default/kafka-demo-group-demo-topic"`}</code></pre>

      <h3>5.3 Verify Receiver Scaling</h3>
      <pre><code>{`# Monitor receiver deployment
kubectl get deployment kafka-broker-receiver -n knative-eventing -w

# Check receiver service endpoints
kubectl get endpoints kafka-broker-ingress -n knative-eventing

# Monitor receiver metrics
kubectl port-forward -n knative-eventing deployment/kafka-broker-receiver 9090:9090
# Access http://localhost:9090/metrics`}</code></pre>

      <h3>5.4 Test Scaling Behavior</h3>
      <pre><code>{`# 1. Generate load and watch scaling
kubectl apply -f kafka-producer-job.yaml

# 2. Monitor scaling in real-time
watch kubectl get pods -l app=kafka-demo-consumer

# 3. Check KEDA scaler metrics
kubectl get hpa -A | grep keda

# 4. Monitor dispatcher scaling
kubectl get statefulset kafka-broker-dispatcher -n knative-eventing -w

# 5. Check trigger scaling (if using annotation-based)
kubectl get scaledobject -A`}</code></pre>

      <h3>5.5 Debugging Commands</h3>
      <pre><code>{`# Check KEDA operator logs
kubectl logs -n keda deployment/keda-operator -f

# Check KEDA metrics server
kubectl logs -n keda deployment/keda-metrics-apiserver -f

# Describe ScaledObject for detailed status
kubectl describe scaledobject kafka-broker-dispatcher -n knative-eventing

# Check trigger authentication
kubectl describe triggerauthentication msk-scram-auth -n knative-eventing

# Monitor Kafka broker controller logs
kubectl logs -n knative-eventing deployment/kafka-controller -f`}</code></pre>

      <h2>Step 6: Performance Validation</h2>
      <h3>6.1 Key Metrics to Monitor</h3>
      <p><strong>Dispatcher Scaling:</strong></p>
      <ul>
        <li>CPU/Memory utilization: <code>kubectl top pods -n knative-eventing -l app=kafka-broker-dispatcher</code></li>
        <li>Replica count: <code>kubectl get statefulset kafka-broker-dispatcher -n knative-eventing</code></li>
        <li>Message processing rate: Check metrics endpoint</li>
      </ul>

      <p><strong>Consumer Group Lag:</strong></p>
      <ul>
        <li>Current lag: Via kafka-consumer-groups command</li>
        <li>KEDA lag metrics: Via external metrics API</li>
        <li>Scaling triggers: Check ScaledObject status</li>
      </ul>

      <p><strong>Receiver Performance:</strong></p>
      <ul>
        <li>Request throughput: Monitor ingress metrics</li>
        <li>Response times: Check receiver metrics endpoint</li>
        <li>Error rates: Monitor logs and metrics</li>
      </ul>

      <h3>6.2 Expected Scaling Behavior</h3>
      <ul>
        <li><strong>Scale Up</strong>: When consumer group lag exceeds <code>lagThreshold</code> (50 messages)</li>
        <li><strong>Scale Down</strong>: After <code>cooldownPeriod</code> (180 seconds) when lag is below threshold</li>
        <li><strong>Minimum Replicas</strong>: Always maintains <code>minReplicaCount</code> (1)</li>
        <li><strong>Maximum Replicas</strong>: Never exceeds <code>maxReplicaCount</code> (20)</li>
      </ul>

      <h3>6.3 Troubleshooting Common Issues</h3>
      <p><strong>Scaling Not Triggered:</strong></p>
      <ul>
        <li>Check TriggerAuthentication credentials</li>
        <li>Verify MSK connectivity from pods</li>
        <li>Check consumer group exists and has lag</li>
      </ul>

      <p><strong>Authentication Errors:</strong></p>
      <ul>
        <li>Verify SCRAM credentials are correct</li>
        <li>Check MSK cluster security groups</li>
        <li>Ensure TLS is properly configured</li>
      </ul>

      <p><strong>Performance Issues:</strong></p>
      <ul>
        <li>Adjust resource limits for dispatcher</li>
        <li>Tune polling intervals and cooldown periods</li>
        <li>Monitor network latency to MSK</li>
      </ul>

      <h2>Architecture Summary</h2>
      <p>KEDA scales Knative Kafka components through two primary mechanisms:</p>

      <h3>1. Direct ScaledObject for kafka-broker-dispatcher</h3>
      <ul>
        <li><strong>Component</strong>: <code>kafka-broker-dispatcher</code> (StatefulSet)</li>
        <li><strong>Scaling Metric</strong>: Consumer group lag from MSK</li>
        <li><strong>Configuration</strong>: Explicit ScaledObject with Kafka trigger</li>
        <li><strong>Use Case</strong>: Scales the dispatcher based on pending messages to process</li>
      </ul>

      <h3>2. Annotation-Based Scaling for Triggers</h3>
      <ul>
        <li><strong>Component</strong>: Individual consumer groups created per Trigger</li>
        <li><strong>Scaling Metric</strong>: Consumer group lag per trigger</li>
        <li><strong>Configuration</strong>: Annotations on Trigger resources</li>
        <li><strong>Use Case</strong>: Scales individual trigger processing capacity</li>
      </ul>

      <h3>3. kafka-broker-receiver Scaling</h3>
      <ul>
        <li><strong>Component</strong>: <code>kafka-broker-receiver</code> (Deployment)</li>
        <li><strong>Scaling Metric</strong>: HTTP request volume or connection count</li>
        <li><strong>Configuration</strong>: Standard Kubernetes HPA or KEDA ScaledObject</li>
        <li><strong>Use Case</strong>: Scales ingress capacity for incoming events</li>
      </ul>

      <p>The key insight is that KEDA provides <strong>lag-based autoscaling</strong> for Kafka workloads, where:</p>
      <ul>
        <li>Each Trigger gets its own consumer group</li>
        <li>Each consumer group can scale independently based on message lag</li>
        <li>The dispatcher component scales to handle multiple consumer groups efficiently</li>
        <li>The receiver component scales to handle incoming event ingress</li>
      </ul>

      <p>This architecture allows for fine-grained scaling based on actual Kafka message processing demand rather than just CPU/memory metrics.</p>

      <h2>Key Annotations for KEDA Scaling</h2>
      <pre><code>{`# Essential annotations for Trigger-based scaling
annotations:
  autoscaling.knative.dev/class: "keda.autoscaling.knative.dev"
  autoscaling.knative.dev/minScale: "0"
  autoscaling.knative.dev/maxScale: "5"
  keda.autoscaling.knative.dev/lagThreshold: "30"
  keda.autoscaling.knative.dev/activationLagThreshold: "5"
  keda.autoscaling.knative.dev/pollingInterval: "15"
  keda.autoscaling.knative.dev/cooldownPeriod: "60"`}</code></pre>

      <h2>Next Steps</h2>
      <ol>
        <li><strong>Configure Prometheus monitoring</strong> for KEDA metrics</li>
        <li><strong>Set up Grafana dashboards</strong> for visualization</li>
        <li><strong>Implement alerting</strong> for scaling events</li>
        <li><strong>Tune performance</strong> based on your workload characteristics</li>
        <li><strong>Test failure scenarios</strong> and recovery mechanisms</li>
      </ol>
    </DocPage>
  );
};

export default KedaKnativeKafkaScaling;
