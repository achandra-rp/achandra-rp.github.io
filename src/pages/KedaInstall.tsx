import DocPage from '../components/DocPage';

const KedaInstall = () => {
  return (
    <DocPage title="KEDA Installation Guide for EKS with Kafka Broker and MSK">
      <h2>Prerequisites</h2>
      <ul>
        <li><strong>EKS Cluster</strong>: Kubernetes version 1.29 or higher</li>
        <li><strong>AWS MSK</strong>: Amazon Managed Streaming for Apache Kafka cluster</li>
        <li><strong>kubectl</strong>: Configured to connect to your EKS cluster</li>
        <li><strong>helm</strong>: Version 3.x installed</li>
        <li><strong>Prometheus & Grafana</strong>: Already deployed with Kafka exporter for observability</li>
        <li><strong>IAM Permissions</strong>: Appropriate AWS IAM roles for MSK access</li>
      </ul>

      <h2>Step 1: Install KEDA on EKS</h2>

      <h3>Option A: Using Helm (Recommended)</h3>
      <pre><code>{`# Add KEDA Helm repository
helm repo add kedacore https://kedacore.github.io/charts
helm repo update

# Install KEDA in dedicated namespace
helm install keda kedacore/keda --namespace keda --create-namespace

# Verify installation
kubectl get pods -n keda`}</code></pre>

      <h3>Option B: Using kubectl</h3>
      <pre><code>{`# Apply KEDA manifest
kubectl apply --server-side -f https://github.com/kedacore/keda/releases/download/v2.17.0/keda-2.17.0.yaml

# Verify installation
kubectl get pods -n keda`}</code></pre>

      <h2>Step 2: Configure MSK Authentication</h2>

      <h3>Option A: IAM Authentication (Recommended for MSK)</h3>
      <p>Create an IAM role for your EKS pods:</p>
      <pre><code>{`# keda-msk-role.yaml
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
  namespace: keda`}</code></pre>

      <p>Apply the service account:</p>
      <pre><code>kubectl apply -f keda-msk-role.yaml</code></pre>

      <h3>Option B: SASL/SCRAM Authentication</h3>
      <p>Create a secret with your MSK credentials:</p>
      <pre><code>{`# msk-credentials.yaml
apiVersion: v1
kind: Secret
metadata:
  name: msk-credentials
  namespace: default
type: Opaque
stringData:
  username: your-msk-username
  password: your-msk-password`}</code></pre>

      <pre><code>kubectl apply -f msk-credentials.yaml</code></pre>

      <h2>Step 3: Deploy Sample Application</h2>
      <p>Create a sample Kafka consumer application:</p>
      <pre><code>{`# kafka-consumer-app.yaml
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
          kafka-console-consumer \\
            --bootstrap-server YOUR_MSK_BOOTSTRAP_SERVERS \\
            --topic test-topic \\
            --group test-consumer-group \\
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
          name: kafka-config`}</code></pre>

      <h2>Step 4: Configure KEDA ScaledObject</h2>

      <h3>For IAM Authentication:</h3>
      <pre><code>{`# keda-scaledobject-iam.yaml
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
    provider: aws-eks`}</code></pre>

      <h3>For SASL/SCRAM Authentication:</h3>
      <pre><code>{`# keda-scaledobject-sasl.yaml
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
    key: password`}</code></pre>

      <p>Apply the ScaledObject:</p>
      <pre><code>{`kubectl apply -f keda-scaledobject-iam.yaml
# OR
kubectl apply -f keda-scaledobject-sasl.yaml`}</code></pre>

      <h2>Step 5: Testing and Verification</h2>

      <h3>5.1 Verify KEDA Installation</h3>
      <pre><code>{`# Check KEDA components
kubectl get pods -n keda
kubectl get scaledobjects -n default
kubectl describe scaledobject kafka-consumer-scaler -n default`}</code></pre>

      <h3>5.2 Test Message Production</h3>
      <p>Create a producer to generate messages:</p>
      <pre><code>{`# Create a producer pod
kubectl run kafka-producer --image=confluentinc/cp-kafka:latest --rm -it -- /bin/bash

# Inside the producer pod, send messages
kafka-console-producer \\
  --bootstrap-server YOUR_MSK_BOOTSTRAP_SERVERS \\
  --topic test-topic \\
  --producer-config /etc/kafka/producer.properties`}</code></pre>

      <h3>5.3 Monitor Scaling Behavior</h3>
      <pre><code>{`# Watch replica scaling in real-time
kubectl get pods -l app=kafka-consumer-app -w

# Check HPA (Horizontal Pod Autoscaler) status
kubectl get hpa

# Monitor KEDA metrics
kubectl get scaledobjects -o yaml`}</code></pre>

      <h3>5.4 Load Testing</h3>
      <p>Create a load test script:</p>
      <pre><code>{`# load-test.sh
#!/bin/bash
for i in {1..1000}; do
  echo "Message $i: $(date)" | kafka-console-producer \\
    --bootstrap-server YOUR_MSK_BOOTSTRAP_SERVERS \\
    --topic test-topic \\
    --producer-config /etc/kafka/producer.properties
  sleep 0.1
done`}</code></pre>

      <p>Run the load test:</p>
      <pre><code>{`chmod +x load-test.sh
./load-test.sh`}</code></pre>

      <h3>5.5 Verify Scaling Metrics</h3>
      <p>Check consumer lag:</p>
      <pre><code>{`kafka-consumer-groups \\
  --bootstrap-server YOUR_MSK_BOOTSTRAP_SERVERS \\
  --group test-consumer-group \\
  --describe`}</code></pre>

      <h2>Step 6: Observability with Prometheus & Grafana</h2>

      <h3>6.1 KEDA Metrics</h3>
      <p>KEDA exposes metrics on port 8080. Add the following ServiceMonitor:</p>
      <pre><code>{`# keda-servicemonitor.yaml
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
    path: /metrics`}</code></pre>

      <h3>6.2 Grafana Dashboard Queries</h3>
      <p>Key metrics to monitor:</p>
      <ul>
        <li><code>keda_scaled_object_paused_total</code>: Paused scaled objects</li>
        <li><code>keda_scaler_metrics_value</code>: Current scaler metric values</li>
        <li><code>keda_scaler_metrics_latency</code>: Scaler response times</li>
      </ul>

      <h3>6.3 AlertManager Rules</h3>
      <pre><code>{`# keda-alerts.yaml
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
      description: "KEDA scaler has been down for more than 5 minutes"`}</code></pre>

      <h2>Step 7: MSK-Specific Configuration</h2>

      <h3>7.1 MSK Bootstrap Servers</h3>
      <p>Replace <code>YOUR_MSK_BOOTSTRAP_SERVERS</code> with your actual MSK cluster endpoints:</p>
      <pre><code>{`# Get MSK cluster endpoints
aws kafka get-bootstrap-brokers --cluster-arn your-msk-cluster-arn`}</code></pre>

      <p>Example format:</p>
      <pre><code>b-1.msk-cluster.abc123.c2.kafka.us-east-1.amazonaws.com:9098,b-2.msk-cluster.abc123.c2.kafka.us-east-1.amazonaws.com:9098</code></pre>

      <h3>7.2 MSK IAM Policy</h3>
      <p>Create IAM policy for MSK access:</p>
      <pre><code>{`{
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
}`}</code></pre>

      <h3>7.3 MSK Security Groups</h3>
      <p>Ensure your EKS nodes can access MSK:</p>
      <pre><code>{`# Allow inbound traffic from EKS security group to MSK
aws ec2 authorize-security-group-ingress \\
  --group-id sg-msk-cluster \\
  --protocol tcp \\
  --port 9098 \\
  --source-group sg-eks-nodes`}</code></pre>

      <h3>7.4 MSK Configuration Properties</h3>
      <p>For IAM authentication, create kafka client properties:</p>
      <pre><code>{`# kafka-client-iam.properties
security.protocol=SASL_SSL
sasl.mechanism=AWS_MSK_IAM
sasl.jaas.config=software.amazon.msk.auth.iam.IAMLoginModule required;
sasl.client.callback.handler.class=software.amazon.msk.auth.iam.IAMClientCallbackHandler`}</code></pre>

      <p>For SASL/SCRAM:</p>
      <pre><code>{`# kafka-client-sasl.properties
security.protocol=SASL_SSL
sasl.mechanism=SCRAM-SHA-512
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username="your-username" password="your-password";`}</code></pre>

      <h3>7.5 Advanced KEDA Configuration for MSK</h3>
      <pre><code>{`# advanced-keda-msk.yaml
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
      name: msk-iam-auth`}</code></pre>

      <h2>Troubleshooting</h2>

      <h3>Common Issues:</h3>
      <ol>
        <li><strong>Authentication failures</strong>: Verify IAM roles and MSK cluster policies</li>
        <li><strong>Network connectivity</strong>: Check security groups and VPC configuration</li>
        <li><strong>Scaling delays</strong>: Adjust pollingInterval and cooldownPeriod</li>
        <li><strong>Resource limits</strong>: Ensure adequate CPU/memory for scaled pods</li>
      </ol>

      <h3>Debug Commands:</h3>
      <pre><code>{`# Check KEDA logs
kubectl logs -n keda deployment/keda-operator

# Check ScaledObject status
kubectl describe scaledobject kafka-consumer-scaler

# Verify MSK connectivity
kubectl run -it --rm debug --image=confluentinc/cp-kafka:latest -- kafka-topics --bootstrap-server YOUR_MSK_BOOTSTRAP_SERVERS --list`}</code></pre>

      <h2>Summary</h2>
      <p>This comprehensive guide covers the complete installation and configuration of KEDA on EKS with Kafka Broker using AWS MSK. The guide includes:</p>
      <p>
        ✅ <strong>KEDA Installation</strong>: Both Helm and kubectl methods<br/>
        ✅ <strong>MSK Authentication</strong>: IAM and SASL/SCRAM configurations<br/>
        ✅ <strong>Scaling Configuration</strong>: Complete ScaledObject definitions<br/>
        ✅ <strong>Testing & Verification</strong>: Load testing and monitoring steps<br/>
        ✅ <strong>Observability Integration</strong>: Prometheus and Grafana setup<br/>
        ✅ <strong>MSK-Specific Details</strong>: IAM policies, security groups, and client properties<br/>
        ✅ <strong>Troubleshooting</strong>: Common issues and debug commands
      </p>
      <p>The guide is production-ready and includes security best practices for AWS MSK integration with proper IAM roles and authentication methods.</p>
    </DocPage>
  );
};

export default KedaInstall;
