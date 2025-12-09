import DocPage from '../components/DocPage';

const KedaDrivenAutoscaling = () => {
  return (
    <DocPage title="KEDA-Driven Autoscaling for Knative Kafka Broker">
      <h2>Architectural Deep Dive: The Interplay of Knative, Kafka, and KEDA</h2>
      <p>Achieving efficient, event-driven autoscaling in a cloud-native environment requires a sophisticated interplay of specialized components. The integration of Kubernetes Event-Driven Autoscaling (KEDA) with the Knative Kafka Broker enables dynamic scaling based on real Kafka metrics.</p>

      <h3>The Knative Kafka Broker's Two-Plane Architecture</h3>
      <p>The Knative Kafka Broker is designed with a clear separation of concerns, embodied in its two-plane architecture: a control plane for management and a data plane for high-throughput message processing.</p>

      <h4>Control Plane (Go)</h4>
      <p>The control plane is the management layer responsible for observing the state of Knative custom resources (CRs) and reconciling the cluster state to match the user's declared intent.</p>
      <ul>
        <li><strong>Core Component:</strong> The primary component is the <code>kafka-controller</code>, which runs as a pod within the <code>knative-eventing</code> namespace.</li>
        <li><strong>Function:</strong> Its main responsibility is to watch for the creation, update, and deletion of Broker and Trigger custom resources. When a user creates a Broker, the controller ensures the necessary data plane deployments are created. When a user creates or updates a Trigger, the controller configures the data plane to subscribe to the appropriate topic and deliver events to the specified sink.</li>
        <li><strong>Configuration Propagation:</strong> The control plane translates the specifications of these CRs into configuration that the data plane can consume. This is typically achieved by writing to shared Kubernetes ConfigMaps or Secrets.</li>
        <li><strong>Implementation:</strong> The control plane is implemented in Go, aligning it with core Kubernetes and Knative components.</li>
      </ul>

      <h4>Data Plane (Java/Vert.x)</h4>
      <p>The data plane is the workhorse of the system, engineered specifically to handle the high-volume, low-latency flow of CloudEvents.</p>
      <ul>
        <li><strong>Core Components:</strong> The data plane is composed of two primary deployments: <code>kafka-broker-receiver</code> and <code>kafka-broker-dispatcher</code>.</li>
        <li><strong>Implementation:</strong> This plane is implemented in Java, utilizing the Eclipse Vert.x toolkit, a non-blocking, event-driven framework that excels at handling concurrent I/O operations.</li>
      </ul>

      <h3>Anatomy of the Data Plane: receiver and dispatcher</h3>
      <p>The two components of the data plane have distinct roles and, consequently, different deployment and scaling models.</p>

      <h4>kafka-broker-receiver (Ingress)</h4>
      <p>The <code>kafka-broker-receiver</code> serves as the front door for all events entering a Kafka Broker.</p>
      <ul>
        <li><strong>Role:</strong> Acts as an HTTP ingress point, exposing an endpoint for incoming CloudEvents sent by event producers. Upon receiving an event, it validates it and writes it to Kafka.</li>
        <li><strong>Deployment Model:</strong> Deployed as a standard Kubernetes Deployment, which is well-suited for its stateless nature.</li>
        <li><strong>Scaling Mechanism:</strong> The operational load on the receiver is proportional to the rate of incoming HTTP requests. It is <strong>not</strong> a target for the KEDA Kafka lag scaler.</li>
      </ul>

      <h4>kafka-broker-dispatcher (Egress)</h4>
      <p>The <code>kafka-broker-dispatcher</code> is responsible for delivering events from Kafka to their final destinations.</p>
      <ul>
        <li><strong>Role:</strong> Acts as a Kafka consumer group. It reads CloudEvents from the broker's topic and dispatches them via HTTP to the subscriber sinks defined by Knative Trigger resources.</li>
        <li><strong>Deployment Model:</strong> Deployed as a Kubernetes StatefulSet, which provides stable, unique network identifiers for its pods and guarantees ordered deployment and scaling.</li>
        <li><strong>Scaling Mechanism:</strong> The dispatcher is the <strong>primary and intended target for KEDA-driven autoscaling</strong>. Its workload is a direct function of the consumer lag on its Kafka topic.</li>
      </ul>

      <h2>The KEDA Integration Model: A Decoupled Control Loop</h2>
      <p>The integration of KEDA into the Knative Kafka Broker ecosystem is a collaboration between three independent controllers:</p>
      <ol>
        <li><strong>Knative kafka-controller:</strong> Manages the Broker and Trigger resources, setting up the fundamental data plane components (receiver and dispatcher).</li>
        <li><strong>KEDA keda-operator:</strong> Runs in the <code>keda</code> namespace and manages the core KEDA logic. It watches for ScaledObject resources and orchestrates the scaling of target workloads.</li>
        <li><strong>eventing-autoscaler-keda Controller:</strong> This is the critical bridge between the Knative and KEDA worlds. It is a separate, optional component that must be installed. It watches for Knative resources like Triggers annotated for KEDA scaling, and dynamically creates a corresponding KEDA ScaledObject CR.</li>
      </ol>

      <h2>The End-to-End Reconciliation Flow: From Annotation to Scaled Pod</h2>
      <p>The process of scaling a <code>kafka-broker-dispatcher</code> based on Kafka lag involves:</p>
      <ol>
        <li><strong>User Action:</strong> A platform engineer defines a Knative Trigger resource with KEDA-specific annotations.</li>
        <li><strong>Knative Controller Reconciliation:</strong> The <code>kafka-controller</code> observes the new Trigger and ensures the dispatcher StatefulSet is configured.</li>
        <li><strong>KEDA Autoscaler Detection:</strong> The <code>eventing-autoscaler-keda</code> controller detects the annotated Trigger and initiates reconciliation.</li>
        <li><strong>ScaledObject Generation:</strong> The controller creates a KEDA ScaledObject resource with <code>scaleTargetRef</code> pointing to the dispatcher StatefulSet, <code>triggers</code> array containing the kafka trigger configuration, and scaling parameters like <code>minReplicaCount</code>, <code>maxReplicaCount</code>, etc., parsed from annotations.</li>
        <li><strong>KEDA Operator Action:</strong> The <code>keda-operator</code> detects the new ScaledObject and assumes responsibility for scaling.</li>
        <li><strong>Metrics Provisioning and HPA Management:</strong> The operator polls the Kafka topic for lag, exposes this metric, and manages the HorizontalPodAutoscaler.</li>
        <li><strong>Scaling Execution:</strong> The Kubernetes HPA controller queries the lag metric and scales the StatefulSet as needed.</li>
      </ol>

      <h2>Codebase Exploration: From Annotation to ScaledObject</h2>
      <h3>Inside eventing-autoscaler-keda: The Core Reconciliation Logic</h3>
      <p>The <a href="https://github.com/knative-extensions/eventing-autoscaler-keda">knative-extensions/eventing-autoscaler-keda</a> repository contains the adapter controller bridging Knative and KEDA.</p>

      <h4>Controller Entrypoint (main.go)</h4>
      <p>The entrypoint, typically at <code>cmd/controller/main.go</code>, initializes the Kubernetes client and controller.</p>

      <h4>The Reconciler (pkg/reconciler/keda/keda.go)</h4>
      <p>The core logic is the <code>Reconcile</code> function, which:</p>
      <ol>
        <li><strong>Annotation Check:</strong> Inspects the annotations of the resource for <code>autoscaling.knative.dev/class: keda.autoscaling.knative.dev</code>.</li>
        <li><strong>ScaledObject Generation:</strong> Constructs the ScaledObject using a helper function, <code>GenerateScaledObject</code>.</li>
      </ol>

      <h4>Dissecting GenerateScaledObject</h4>
      <p><code>GenerateScaledObject</code> takes a Knative resource object and produces a ScaledObject. Its steps:</p>
      <ul>
        <li>Instantiates an empty ScaledObject.</li>
        <li>Parses annotations.</li>
        <li>Populates scaling parameters.</li>
        <li>Constructs the trigger.</li>
        <li>Identifies the target workload.</li>
        <li>Returns the ScaledObject.</li>
      </ul>

      <h2>Configuration Reference: Mastering Annotations and ConfigMaps</h2>
      <h3>Global Activation: The config-kafka-features ConfigMap</h3>
      <p>Enable KEDA autoscaling globally:</p>
      <pre><code>{`apiVersion: v1
kind: ConfigMap
metadata:
  name: config-kafka-features
  namespace: knative-eventing
data:
  controller-autoscaler-keda: "enabled"
  # ... other config options`}</code></pre>

      <h3>Comprehensive Annotation Dictionary</h3>
      <table>
        <thead>
          <tr>
            <th>Annotation Key</th>
            <th>Applies To</th>
            <th>Purpose</th>
            <th>ScaledObject Field</th>
            <th>Default Value</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>autoscaling.knative.dev/class</td>
            <td>Trigger, KafkaSource</td>
            <td><strong>Required.</strong> Enables KEDA scaling for the resource by specifying the KEDA autoscaler class.</td>
            <td>N/A (Enabler)</td>
            <td>kpa.autoscaling.knative.dev</td>
            <td>"keda.autoscaling.knative.dev"</td>
          </tr>
          <tr>
            <td>autoscaling.knative.dev/min-scale</td>
            <td>Trigger, KafkaSource</td>
            <td>Minimum replicas. "0" enables scale-to-zero.</td>
            <td>spec.minReplicaCount</td>
            <td>"0"</td>
            <td>"1"</td>
          </tr>
          <tr>
            <td>autoscaling.knative.dev/max-scale</td>
            <td>Trigger, KafkaSource</td>
            <td>Maximum replicas.</td>
            <td>spec.maxReplicaCount</td>
            <td>"50"</td>
            <td>"20"</td>
          </tr>
          <tr>
            <td>autoscaling.eventing.knative.dev/lag-threshold</td>
            <td>Trigger, KafkaSource</td>
            <td>Target unprocessed messages (consumer lag) per replica.</td>
            <td>spec.triggers.metadata.lagThreshold</td>
            <td>"10"</td>
            <td>"20"</td>
          </tr>
          <tr>
            <td>keda.autoscaling.knative.dev/pollingInterval</td>
            <td>Trigger, KafkaSource</td>
            <td>Polling interval in seconds.</td>
            <td>spec.pollingInterval</td>
            <td>"30"</td>
            <td>"15"</td>
          </tr>
          <tr>
            <td>keda.autoscaling.knative.dev/cooldownPeriod</td>
            <td>Trigger, KafkaSource</td>
            <td>Cooldown period in seconds.</td>
            <td>spec.cooldownPeriod</td>
            <td>"300"</td>
            <td>"45"</td>
          </tr>
          <tr>
            <td>keda.autoscaling.knative.dev/kafkaActivationLagThreshold</td>
            <td>Trigger, KafkaSource</td>
            <td>Consumer lag threshold to scale from zero.</td>
            <td>spec.triggers.metadata.activationLagThreshold</td>
            <td>"1"</td>
            <td>"5"</td>
          </tr>
        </tbody>
      </table>

      <h2>Data Plane Performance Tuning: Beyond Pod Counts</h2>
      <p>Parameters are configured globally via the <code>config-kafka-broker-data-plane</code> ConfigMap.</p>
      <table>
        <thead>
          <tr>
            <th>Property</th>
            <th>File in ConfigMap</th>
            <th>Purpose</th>
            <th>Impact on Scaling</th>
            <th>Recommendation</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>max.poll.records</td>
            <td>config-kafka-broker-consumer.properties</td>
            <td>Max records fetched by consumer per poll.</td>
            <td>Directly controls throughput per pod.</td>
            <td>Tune based on workload.</td>
          </tr>
          <tr>
            <td>fetch.min.bytes</td>
            <td>config-kafka-broker-consumer.properties</td>
            <td>Minimum data for fetch request.</td>
            <td>Impacts batching and efficiency.</td>
            <td>Match to event size.</td>
          </tr>
          <tr>
            <td>maxPoolSize</td>
            <td>config-kafka-broker-webclient.properties</td>
            <td>Max Vert.x HTTP client pool size.</td>
            <td>Controls concurrent dispatches.</td>
            <td>Increase for higher concurrency.</td>
          </tr>
        </tbody>
      </table>

      <h2>Practical Guide: Testing and Verifying Scaling Behavior</h2>
      <h3>Environment Prerequisites and Installation</h3>
      <p><strong>Checklist:</strong></p>
      <ul>
        <li>A running Kubernetes cluster (Kind, Minikube, or cloud provider)</li>
        <li><code>kubectl</code> configured</li>
        <li>Helm v3+</li>
      </ul>

      <p><strong>Step-by-Step Installation:</strong></p>

      <h4>1. Install Strimzi Kafka Operator:</h4>
      <pre><code>{`kubectl create namespace kafka
helm repo add strimzi https://strimzi.io/charts/
helm install strimzi-kafka-operator strimzi/strimzi-kafka-operator --namespace kafka --version <latest_version>`}</code></pre>

      <h4>2. Deploy a Kafka Cluster:</h4>
      <p><code>kafka-cluster.yaml</code>:</p>
      <pre><code>{`apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: my-cluster
  namespace: kafka
spec:
  kafka:
    version: 3.5.1
    replicas: 1
    listeners:
      - name: plain
        port: 9092
        type: internal
        tls: false
      - name: tls
        port: 9093
        type: internal
        tls: true
    config:
      offsets.topic.replication.factor: 1
      transaction.state.log.replication.factor: 1
      transaction.state.log.min.isr: 1
    storage:
      type: jbod
      volumes:
        - id: 0
          type: persistent-claim
          size: 10Gi
          deleteClaim: true
  zookeeper:
    replicas: 1
    storage:
      type: persistent-claim
      size: 5Gi
      deleteClaim: true`}</code></pre>

      <p>Apply with:</p>
      <pre><code>kubectl apply -f kafka-cluster.yaml -n kafka</code></pre>

      <h4>3. Install Knative Serving and Eventing:</h4>
      <pre><code>{`# Install Knative Serving
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.18.0/serving-crds.yaml
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.18.0/serving-core.yaml

# Install Knative Eventing
kubectl apply -f https://github.com/knative/eventing/releases/download/knative-v1.18.0/eventing-crds.yaml
kubectl apply -f https://github.com/knative/eventing/releases/download/knative-v1.18.0/eventing-core.yaml`}</code></pre>

      <h4>4. Install Knative Kafka Broker:</h4>
      <pre><code>{`kubectl apply -f https://github.com/knative-extensions/eventing-kafka-broker/releases/download/knative-v1.18.0/eventing-kafka-controller.yaml
kubectl apply -f https://github.com/knative-extensions/eventing-kafka-broker/releases/download/knative-v1.18.0/eventing-kafka-broker.yaml`}</code></pre>

      <h4>5. Install KEDA:</h4>
      <pre><code>{`helm repo add kedacore https://kedacore.github.io/charts
helm install keda kedacore/keda --namespace keda --create-namespace`}</code></pre>

      <h4>6. Install the eventing-autoscaler-keda Controller:</h4>
      <pre><code>kubectl apply -f https://github.com/knative-extensions/eventing-autoscaler-keda/releases/download/knative-v1.18.0/eventing-autoscaler-keda.yaml</code></pre>

      <h4>7. Enable KEDA in Knative:</h4>
      <pre><code>{`kubectl patch configmap config-kafka-features -n knative-eventing --type merge -p '{"data":{"controller-autoscaler-keda":"enabled"}}'`}</code></pre>

      <h3>Test Scenario: Autoscaling a Broker Trigger's Dispatcher</h3>

      <h4>1. Create a Test Namespace:</h4>
      <pre><code>kubectl create ns keda-test</code></pre>

      <h4>2. Define a Sink Service</h4>
      <p><code>sink.yaml</code>:</p>
      <pre><code>{`apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: event-display
  namespace: keda-test
spec:
  template:
    spec:
      containers:
        - image: gcr.io/knative-releases/knative.dev/eventing/cmd/event_display`}</code></pre>

      <h4>3. Define the Kafka Broker</h4>
      <p><code>broker.yaml</code>:</p>
      <pre><code>{`apiVersion: eventing.knative.dev/v1
kind: Broker
metadata:
  name: default
  namespace: keda-test`}</code></pre>

      <h4>4. Define the Annotated Trigger</h4>
      <p><code>trigger.yaml</code>:</p>
      <pre><code>{`apiVersion: eventing.knative.dev/v1
kind: Trigger
metadata:
  name: keda-test-trigger
  namespace: keda-test
  annotations:
    autoscaling.knative.dev/class: "keda.autoscaling.knative.dev"
    autoscaling.knative.dev/min-scale: "0"
    autoscaling.knative.dev/max-scale: "10"
    autoscaling.eventing.knative.dev/lag-threshold: "20"
    keda.autoscaling.knative.dev/cooldownPeriod: "45"
spec:
  broker: default
  subscriber:
    ref:
      apiVersion: serving.knative.dev/v1
      kind: Service
      name: event-display`}</code></pre>

      <h4>5. Apply the Manifests:</h4>
      <pre><code>kubectl apply -f sink.yaml -f broker.yaml -f trigger.yaml</code></pre>

      <h3>Verification and Observation</h3>

      <h4>1. Verify ScaledObject Creation:</h4>
      <pre><code>{`kubectl get scaledobject -n knative-eventing
# Get the name of the ScaledObject
SO_NAME=$(kubectl get scaledobject -n knative-eventing -o jsonpath='{.items[0].metadata.name}')
kubectl get scaledobject $SO_NAME -n knative-eventing -o yaml`}</code></pre>

      <h4>2. Verify HPA Creation:</h4>
      <pre><code>kubectl get hpa -n knative-eventing</code></pre>

      <h4>3. Generate Kafka Load:</h4>
      <pre><code>{`kubectl -n kafka run kafka-producer -ti --image=quay.io/strimzi/kafka:0.37.0-kafka-3.5.1 --rm=true --restart=Never -- bin/kafka-console-producer.sh --bootstrap-server my-cluster-kafka-bootstrap:9092 --topic knative-broker-keda-test-default`}</code></pre>
      <p>Type/paste multiple lines to send messages.</p>

      <h4>4. Observe Scaling Up:</h4>
      <pre><code>watch kubectl get pods -n knative-eventing -l app=kafka-broker-dispatcher</code></pre>

      <h4>5. Observe Scaling Down:</h4>
      <ul>
        <li>Stop the producer pod (<code>Ctrl+C</code>).</li>
        <li>Monitor the event-display logs:</li>
      </ul>
      <pre><code>kubectl logs -n keda-test -l serving.knative.dev/service=event-display -c user-container -f</code></pre>

      <h3>Troubleshooting Common Issues</h3>
      <p><strong>ScaledObject is not created:</strong></p>
      <ul>
        <li>Check annotation spelling.</li>
        <li>Inspect logs of <code>eventing-autoscaler-keda-controller</code> pod.</li>
        <li>Ensure global feature flag is enabled.</li>
      </ul>

      <p><strong>Pods do not scale up under load:</strong></p>
      <ul>
        <li>Describe the HPA resource (<code>kubectl describe hpa ...</code>).</li>
        <li>Check <code>keda-operator</code> logs.</li>
        <li>Ensure <code>consumerGroup</code> in ScaledObject matches dispatcher.</li>
      </ul>

      <p><strong>Pods scale up, but throughput is low:</strong></p>
      <ul>
        <li>Tune parameters in <code>config-kafka-broker-data-plane</code>.</li>
      </ul>

      <h2>Conclusion and Expert Recommendations</h2>
      <h3>Summary of Architectural Patterns</h3>
      <ul>
        <li><strong>Two-Plane Architecture:</strong> Go for control; Java/Vert.x for data.</li>
        <li><strong>Decoupled Adapter Controller:</strong> <code>eventing-autoscaler-keda</code> bridges Knative and KEDA.</li>
        <li><strong>Asymmetric Scaling Model:</strong> Only the dispatcher is scaled with KEDA.</li>
      </ul>

      <h3>Strategic Recommendations</h3>
      <ul>
        <li>Adopt layered tuning: default first, then tune.</li>
        <li>Use isolated data planes for multi-tenancy.</li>
        <li>Implement end-to-end monitoring:
          <ul>
            <li>Kafka consumer group lag</li>
            <li>Event latency</li>
            <li>Controller logs</li>
          </ul>
        </li>
      </ul>

      <h3>Future Outlook</h3>
      <p>Knative and KEDA integration represents a strong trend toward application-aware autoscaling.</p>

      <h2>Works Cited</h2>
      <ol>
        <li><a href="https://knative.dev/blog/articles/kafka-broker-with-isolated-data-plane/">Knative Apache Kafka Broker with Isolated Data Plane</a></li>
        <li><a href="https://knative.dev/docs/eventing/brokers/broker-types/kafka-broker/">About Apache Kafka Broker</a></li>
        <li><a href="https://github.com/knative-extensions/eventing-kafka-broker">knative-extensions/eventing-kafka-broker</a></li>
        <li><a href="https://knative.dev/docs/serving/autoscaling/">About autoscaling – Knative</a></li>
        <li><a href="https://github.com/knative-extensions/eventing-autoscaler-keda">KEDA support for Knative Event Sources Autoscaling</a></li>
        <li><a href="https://knative.dev/docs/eventing/configuration/keda-configuration/">Configure KEDA Autoscaling of Knative Kafka Resources</a></li>
        <li><a href="https://keda.sh/">KEDA – Kubernetes Event-driven Autoscaling</a></li>
      </ol>
    </DocPage>
  );
};

export default KedaDrivenAutoscaling;
