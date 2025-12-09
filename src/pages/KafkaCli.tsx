import DocPage from '../components/DocPage';

const KafkaCli = () => {
  return (
    <DocPage title="Kafka CLI Tools">
      <p>A Kubernetes pod-based utility for interacting with Kafka clusters using command-line tools. This approach provides a consistent, containerized environment for Kafka operations.</p>

      <h2>Overview</h2>
      <p>This utility creates a Kubernetes pod with the Bitnami Kafka image, pre-configured with authentication credentials and broker information. The pod remains idle, allowing you to execute Kafka CLI commands interactively.</p>

      <h2>Pod Configuration</h2>
      <p>The Kafka CLI pod is configured with the following specifications:</p>
      <pre><code>{`apiVersion: v1
kind: Pod
metadata:
  name: kafka-cli
  namespace: keda-test
  labels:
    app: kafka-cli
spec:
  restartPolicy: Never
  containers:
  - name: kafka-cli
    image: bitnami/kafka:3.6.0`}</code></pre>

      <h2>Prerequisites</h2>
      <p>Before deploying the Kafka CLI pod, ensure you have:</p>
      <ul>
        <li><strong>Kafka Secret</strong>: Contains authentication credentials</li>
        <li><strong>Kafka ConfigMap</strong>: Contains broker configuration</li>
        <li><strong>Proper Namespace</strong>: Both resources in the same namespace as the pod</li>
      </ul>

      <h3>Required Secret (kafka-secret)</h3>
      <p>Create a secret with the following keys:</p>
      <pre><code>{`kubectl create secret generic kafka-secret \\
  --from-literal=user=your-username \\
  --from-literal=password=your-password \\
  --from-literal=protocol=SASL_SSL \\
  --from-literal=sasl.mechanism=SCRAM-SHA-512`}</code></pre>

      <h3>Required ConfigMap (kafka-broker-config)</h3>
      <p>Create a configmap with broker information:</p>
      <pre><code>{`kubectl create configmap kafka-broker-config \\
  --from-literal=bootstrap.servers=your-broker-endpoints`}</code></pre>

      <h2>Deployment</h2>
      <p>Deploy the Kafka CLI pod using the provided YAML configuration:</p>
      <pre><code>{`curl -O https://raw.githubusercontent.com/achandra-rp/achandra-rp.github.io/main/public/kafka-cli.yaml
kubectl apply -f kafka-cli.yaml`}</code></pre>

      <p>Wait for the pod to be ready:</p>
      <pre><code>{`kubectl wait --for=condition=Ready pod/kafka-cli -n keda-test --timeout=60s`}</code></pre>

      <h2>Usage</h2>
      <p>Once the pod is running, execute into it to use Kafka CLI tools:</p>
      <pre><code>kubectl exec -it kafka-cli -n keda-test -- /bin/bash</code></pre>

      <h3>Available Commands</h3>
      <p>Inside the pod, you can use standard Kafka CLI tools with the pre-configured client properties:</p>

      <h4>List Topics</h4>
      <pre><code>{`kafka-topics.sh --bootstrap-server $BOOTSTRAP \\
  --command-config /tmp/client.properties \\
  --list`}</code></pre>

      <h4>Create Topic</h4>
      <pre><code>{`kafka-topics.sh --bootstrap-server $BOOTSTRAP \\
  --command-config /tmp/client.properties \\
  --create --topic my-topic --partitions 3 --replication-factor 2`}</code></pre>

      <h4>Describe Topic</h4>
      <pre><code>{`kafka-topics.sh --bootstrap-server $BOOTSTRAP \\
  --command-config /tmp/client.properties \\
  --describe --topic my-topic`}</code></pre>

      <h4>Produce Messages</h4>
      <pre><code>{`kafka-console-producer.sh --bootstrap-server $BOOTSTRAP \\
  --producer.config /tmp/client.properties \\
  --topic my-topic`}</code></pre>

      <h4>Consume Messages</h4>
      <pre><code>{`kafka-console-consumer.sh --bootstrap-server $BOOTSTRAP \\
  --consumer.config /tmp/client.properties \\
  --topic my-topic --from-beginning`}</code></pre>

      <h4>List Consumer Groups</h4>
      <pre><code>{`kafka-consumer-groups.sh --bootstrap-server $BOOTSTRAP \\
  --command-config /tmp/client.properties \\
  --list`}</code></pre>

      <h4>Describe Consumer Group</h4>
      <pre><code>{`kafka-consumer-groups.sh --bootstrap-server $BOOTSTRAP \\
  --command-config /tmp/client.properties \\
  --describe --group my-consumer-group`}</code></pre>

      <h2>Configuration Details</h2>
      <p>The pod automatically generates a <code>client.properties</code> file at startup with the following configuration:</p>
      <pre><code>{`security.protocol=\${KAFKA_PROTOCOL}
sasl.mechanism=\${KAFKA_SASL_MECHANISM}
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username="\${KAFKA_USER}" password="\${KAFKA_PASS}";`}</code></pre>

      <blockquote>
        <p><strong>Note:</strong> The pod uses environment variables from Kubernetes secrets and configmaps to build the client configuration, ensuring sensitive information is properly managed.</p>
      </blockquote>

      <h2>Cleanup</h2>
      <p>When finished, delete the pod:</p>
      <pre><code>kubectl delete pod kafka-cli -n keda-test</code></pre>

      <blockquote>
        <p><strong>Security Notice:</strong> This pod is designed for interactive debugging and testing. Ensure proper RBAC and network policies are in place for production environments.</p>
      </blockquote>

      <h2>Troubleshooting</h2>
      <h3>Pod Won't Start</h3>
      <ul>
        <li>Verify the kafka-secret and kafka-broker-config exist in the correct namespace</li>
        <li>Check pod logs: <code>kubectl logs kafka-cli -n keda-test</code></li>
        <li>Ensure the namespace exists</li>
      </ul>

      <h3>Authentication Errors</h3>
      <ul>
        <li>Verify secret contains correct credentials</li>
        <li>Check SASL mechanism matches broker configuration</li>
        <li>Ensure protocol (SASL_SSL, SASL_PLAINTEXT) is correct</li>
      </ul>

      <h3>Connection Issues</h3>
      <ul>
        <li>Verify bootstrap servers are accessible from the cluster</li>
        <li>Check network policies and security groups</li>
        <li>Test connectivity: <code>telnet broker-endpoint 9092</code></li>
      </ul>
    </DocPage>
  );
};

export default KafkaCli;
