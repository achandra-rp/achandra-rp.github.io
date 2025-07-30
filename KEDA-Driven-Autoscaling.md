# **A Definitive Guide to KEDA-Driven Autoscaling for the Knative Kafka Broker Data Plane**

## **Architectural Deep Dive: The Interplay of Knative, Kafka, and KEDA**

Achieving efficient, event-driven autoscaling in a cloud-native environment requires a sophisticated interplay of specialized components. The integration of Kubernetes Event-Driven Autoscaling (KEDA) with the Knative Kafka Broker enables dynamic scaling based on real Kafka metrics.

### **The Knative Kafka Broker's Two-Plane Architecture**

The Knative Kafka Broker is designed with a clear separation of concerns, embodied in its two-plane architecture: a control plane for management and a data plane for high-throughput message processing.

#### **Control Plane (Go)**

The control plane is the management layer responsible for observing the state of Knative custom resources (CRs) and reconciling the cluster state to match the user's declared intent.

- **Core Component:** The primary component is the `kafka-controller`, which runs as a pod within the `knative-eventing` namespace.
- **Function:** Its main responsibility is to watch for the creation, update, and deletion of Broker and Trigger custom resources. When a user creates a Broker, the controller ensures the necessary data plane deployments are created. When a user creates or updates a Trigger, the controller configures the data plane to subscribe to the appropriate topic and deliver events to the specified sink.
- **Configuration Propagation:** The control plane translates the specifications of these CRs into configuration that the data plane can consume. This is typically achieved by writing to shared Kubernetes ConfigMaps or Secrets.
- **Implementation:** The control plane is implemented in Go, aligning it with core Kubernetes and Knative components.

#### **Data Plane (Java/Vert.x)**

The data plane is the workhorse of the system, engineered specifically to handle the high-volume, low-latency flow of CloudEvents.

- **Core Components:** The data plane is composed of two primary deployments: `kafka-broker-receiver` and `kafka-broker-dispatcher`.
- **Implementation:** This plane is implemented in Java, utilizing the Eclipse Vert.x toolkit, a non-blocking, event-driven framework that excels at handling concurrent I/O operations.

### **Anatomy of the Data Plane: receiver and dispatcher**

The two components of the data plane have distinct roles and, consequently, different deployment and scaling models.

#### **kafka-broker-receiver (Ingress)**

The `kafka-broker-receiver` serves as the front door for all events entering a Kafka Broker.

- **Role:** Acts as an HTTP ingress point, exposing an endpoint for incoming CloudEvents sent by event producers. Upon receiving an event, it validates it and writes it to Kafka.
- **Deployment Model:** Deployed as a standard Kubernetes Deployment, which is well-suited for its stateless nature.
- **Scaling Mechanism:** The operational load on the receiver is proportional to the rate of incoming HTTP requests. It is **not** a target for the KEDA Kafka lag scaler.

#### **kafka-broker-dispatcher (Egress)**

The `kafka-broker-dispatcher` is responsible for delivering events from Kafka to their final destinations.

- **Role:** Acts as a Kafka consumer group. It reads CloudEvents from the broker's topic and dispatches them via HTTP to the subscriber sinks defined by Knative Trigger resources.
- **Deployment Model:** Deployed as a Kubernetes StatefulSet, which provides stable, unique network identifiers for its pods and guarantees ordered deployment and scaling.
- **Scaling Mechanism:** The dispatcher is the **primary and intended target for KEDA-driven autoscaling**. Its workload is a direct function of the consumer lag on its Kafka topic.

---

## **The KEDA Integration Model: A Decoupled Control Loop**

The integration of KEDA into the Knative Kafka Broker ecosystem is a collaboration between three independent controllers:

1. **Knative kafka-controller:** Manages the Broker and Trigger resources, setting up the fundamental data plane components (receiver and dispatcher).
2. **KEDA keda-operator:** Runs in the `keda` namespace and manages the core KEDA logic. It watches for ScaledObject resources and orchestrates the scaling of target workloads.
3. **eventing-autoscaler-keda Controller:** This is the critical bridge between the Knative and KEDA worlds. It is a separate, optional component that must be installed. It watches for Knative resources like Triggers annotated for KEDA scaling, and dynamically creates a corresponding KEDA ScaledObject CR.

---

## **The End-to-End Reconciliation Flow: From Annotation to Scaled Pod**

The process of scaling a `kafka-broker-dispatcher` based on Kafka lag involves:

1. **User Action:** A platform engineer defines a Knative Trigger resource with KEDA-specific annotations.
2. **Knative Controller Reconciliation:** The `kafka-controller` observes the new Trigger and ensures the dispatcher StatefulSet is configured.
3. **KEDA Autoscaler Detection:** The `eventing-autoscaler-keda` controller detects the annotated Trigger and initiates reconciliation.
4. **ScaledObject Generation:** The controller creates a KEDA ScaledObject resource:

    - `scaleTargetRef` points to the dispatcher StatefulSet.
    - `triggers` array contains the kafka trigger configuration.
    - Scaling parameters like `minReplicaCount`, `maxReplicaCount`, etc., are parsed from annotations.

5. **KEDA Operator Action:** The `keda-operator` detects the new ScaledObject and assumes responsibility for scaling.
6. **Metrics Provisioning and HPA Management:** The operator polls the Kafka topic for lag, exposes this metric, and manages the HorizontalPodAutoscaler.
7. **Scaling Execution:** The Kubernetes HPA controller queries the lag metric and scales the StatefulSet as needed.

---

## **Codebase Exploration: From Annotation to ScaledObject**

### **Inside eventing-autoscaler-keda: The Core Reconciliation Logic**

The [`knative-extensions/eventing-autoscaler-keda`](https://github.com/knative-extensions/eventing-autoscaler-keda) repository contains the adapter controller bridging Knative and KEDA.

#### **Controller Entrypoint (main.go)**

The entrypoint, typically at `cmd/controller/main.go`, initializes the Kubernetes client and controller.

#### **The Reconciler (pkg/reconciler/keda/keda.go)**

The core logic is the `Reconcile` function, which:

1. **Annotation Check:** Inspects the annotations of the resource for `autoscaling.knative.dev/class: keda.autoscaling.knative.dev`.
2. **ScaledObject Generation:** Constructs the ScaledObject using a helper function, `GenerateScaledObject`.

#### **Dissecting GenerateScaledObject**

`GenerateScaledObject` takes a Knative resource object and produces a ScaledObject. Its steps:

- Instantiates an empty ScaledObject.
- Parses annotations.
- Populates scaling parameters.
- Constructs the trigger.
- Identifies the target workload.
- Returns the ScaledObject.

---

## **Configuration Reference: Mastering Annotations and ConfigMaps**

### **Global Activation: The config-kafka-features ConfigMap**

Enable KEDA autoscaling globally:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: config-kafka-features
  namespace: knative-eventing
data:
  controller-autoscaler-keda: "enabled"
  # ... other config options
```

### **Comprehensive Annotation Dictionary**

| Annotation Key | Applies To | Purpose | ScaledObject Field | Default Value | Example |
|---------------|------------|---------|--------------------|--------------|---------|
| autoscaling.knative.dev/class | Trigger, KafkaSource | **Required.** Enables KEDA scaling for the resource by specifying the KEDA autoscaler class. | N/A (Enabler) | kpa.autoscaling.knative.dev | "keda.autoscaling.knative.dev" |
| autoscaling.knative.dev/min-scale | Trigger, KafkaSource | Minimum replicas. "0" enables scale-to-zero. | spec.minReplicaCount | "0" | "1" |
| autoscaling.knative.dev/max-scale | Trigger, KafkaSource | Maximum replicas. | spec.maxReplicaCount | "50" | "20" |
| autoscaling.eventing.knative.dev/lag-threshold | Trigger, KafkaSource | Target unprocessed messages (consumer lag) per replica. | spec.triggers.metadata.lagThreshold | "10" | "20" |
| keda.autoscaling.knative.dev/pollingInterval | Trigger, KafkaSource | Polling interval in seconds. | spec.pollingInterval | "30" | "15" |
| keda.autoscaling.knative.dev/cooldownPeriod | Trigger, KafkaSource | Cooldown period in seconds. | spec.cooldownPeriod | "300" | "45" |
| keda.autoscaling.knative.dev/kafkaActivationLagThreshold | Trigger, KafkaSource | Consumer lag threshold to scale from zero. | spec.triggers.metadata.activationLagThreshold | "1" | "5" |

---

## **Data Plane Performance Tuning: Beyond Pod Counts**

Parameters are configured globally via the `config-kafka-broker-data-plane` ConfigMap.

| Property | File in ConfigMap | Purpose | Impact on Scaling | Recommendation |
|----------|------------------|---------|------------------|----------------|
| max.poll.records | config-kafka-broker-consumer.properties | Max records fetched by consumer per poll. | Directly controls throughput per pod. | Tune based on workload. |
| fetch.min.bytes | config-kafka-broker-consumer.properties | Minimum data for fetch request. | Impacts batching and efficiency. | Match to event size. |
| maxPoolSize | config-kafka-broker-webclient.properties | Max Vert.x HTTP client pool size. | Controls concurrent dispatches. | Increase for higher concurrency. |

---

## **Practical Guide: Testing and Verifying Scaling Behavior**

### **Environment Prerequisites and Installation**

**Checklist:**

- A running Kubernetes cluster (Kind, Minikube, or cloud provider)
- `kubectl` configured
- Helm v3+

**Step-by-Step Installation:**

1. **Install Strimzi Kafka Operator:**

```bash
kubectl create namespace kafka
helm repo add strimzi https://strimzi.io/charts/
helm install strimzi-kafka-operator strimzi/strimzi-kafka-operator --namespace kafka --version <latest_version>
```

2. **Deploy a Kafka Cluster:**

`kafka-cluster.yaml`:
```yaml
apiVersion: kafka.strimzi.io/v1beta2
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
      deleteClaim: true
```
Apply with:
```bash
kubectl apply -f kafka-cluster.yaml -n kafka
```

3. **Install Knative Serving and Eventing:**

```bash
# Install Knative Serving
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.18.0/serving-crds.yaml
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.18.0/serving-core.yaml

# Install Knative Eventing
kubectl apply -f https://github.com/knative/eventing/releases/download/knative-v1.18.0/eventing-crds.yaml
kubectl apply -f https://github.com/knative/eventing/releases/download/knative-v1.18.0/eventing-core.yaml
```

4. **Install Knative Kafka Broker:**

```bash
kubectl apply -f https://github.com/knative-extensions/eventing-kafka-broker/releases/download/knative-v1.18.0/eventing-kafka-controller.yaml
kubectl apply -f https://github.com/knative-extensions/eventing-kafka-broker/releases/download/knative-v1.18.0/eventing-kafka-broker.yaml
```

5. **Install KEDA:**

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm install keda kedacore/keda --namespace keda --create-namespace
```

6. **Install the eventing-autoscaler-keda Controller:**

```bash
kubectl apply -f https://github.com/knative-extensions/eventing-autoscaler-keda/releases/download/knative-v1.18.0/eventing-autoscaler-keda.yaml
```

7. **Enable KEDA in Knative:**

```bash
kubectl patch configmap config-kafka-features -n knative-eventing --type merge -p '{"data":{"controller-autoscaler-keda":"enabled"}}'
```

---

### **Test Scenario: Autoscaling a Broker Trigger's Dispatcher**

1. **Create a Test Namespace:**

```bash
kubectl create ns keda-test
```

2. **Define a Sink Service** (`sink.yaml`):

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: event-display
  namespace: keda-test
spec:
  template:
    spec:
      containers:
        - image: gcr.io/knative-releases/knative.dev/eventing/cmd/event_display
```

3. **Define the Kafka Broker** (`broker.yaml`):

```yaml
apiVersion: eventing.knative.dev/v1
kind: Broker
metadata:
  name: default
  namespace: keda-test
```

4. **Define the Annotated Trigger** (`trigger.yaml`):

```yaml
apiVersion: eventing.knative.dev/v1
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
      name: event-display
```

5. **Apply the Manifests:**

```bash
kubectl apply -f sink.yaml -f broker.yaml -f trigger.yaml
```

---

### **Verification and Observation**

1. **Verify ScaledObject Creation:**

```bash
kubectl get scaledobject -n knative-eventing
# Get the name of the ScaledObject
SO_NAME=$(kubectl get scaledobject -n knative-eventing -o jsonpath='{.items[0].metadata.name}')
kubectl get scaledobject $SO_NAME -n knative-eventing -o yaml
```

2. **Verify HPA Creation:**

```bash
kubectl get hpa -n knative-eventing
```

3. **Generate Kafka Load:**

```bash
kubectl -n kafka run kafka-producer -ti --image=quay.io/strimzi/kafka:0.37.0-kafka-3.5.1 --rm=true --restart=Never -- bin/kafka-console-producer.sh --bootstrap-server my-cluster-kafka-bootstrap:9092 --topic knative-broker-keda-test-default
```
Type/paste multiple lines to send messages.

4. **Observe Scaling Up:**

```bash
watch kubectl get pods -n knative-eventing -l app=kafka-broker-dispatcher
```

5. **Observe Scaling Down:**
- Stop the producer pod (`Ctrl+C`).
- Monitor the event-display logs:

```bash
kubectl logs -n keda-test -l serving.knative.dev/service=event-display -c user-container -f
```

---

### **Troubleshooting Common Issues**

- **ScaledObject is not created:**
  - Check annotation spelling.
  - Inspect logs of `eventing-autoscaler-keda-controller` pod.
  - Ensure global feature flag is enabled.

- **Pods do not scale up under load:**
  - Describe the HPA resource (`kubectl describe hpa ...`).
  - Check `keda-operator` logs.
  - Ensure `consumerGroup` in ScaledObject matches dispatcher.

- **Pods scale up, but throughput is low:**
  - Tune parameters in `config-kafka-broker-data-plane`.

---

## **Conclusion and Expert Recommendations**

### **Summary of Architectural Patterns**

- **Two-Plane Architecture:** Go for control; Java/Vert.x for data.
- **Decoupled Adapter Controller:** `eventing-autoscaler-keda` bridges Knative and KEDA.
- **Asymmetric Scaling Model:** Only the dispatcher is scaled with KEDA.

### **Strategic Recommendations**

- Adopt layered tuning: default first, then tune.
- Use isolated data planes for multi-tenancy.
- Implement end-to-end monitoring:
  - Kafka consumer group lag
  - Event latency
  - Controller logs

### **Future Outlook**

Knative and KEDA integration represents a strong trend toward application-aware autoscaling.

---

## **Works Cited**

1. Knative Apache Kafka Broker with Isolated Data Plane – [knative.dev](https://knative.dev/blog/articles/kafka-broker-with-isolated-data-plane/)
2. About Apache Kafka Broker – [knative.dev](https://knative.dev/docs/eventing/brokers/broker-types/kafka-broker/)
3. [knative-extensions/eventing-kafka-broker](https://github.com/knative-extensions/eventing-kafka-broker)
4. [eventing-kafka-broker/docs/channel/README.md](https://github.com/knative-sandbox/eventing-kafka-broker/blob/main/docs/channel/README.md)
5. [100-config-kafka-channel-data-plane.yaml](https://github.com/knative-extensions/eventing-kafka-broker/blob/main/data-plane/config/channel/100-config-kafka-channel-data-plane.yaml)
6. [About autoscaling – Knative](https://knative.dev/docs/serving/autoscaling/)
7. [Supported autoscaler types – Knative](https://knative.dev/docs/serving/autoscaling/autoscaler-types/)
8. [kafka-broker-dispatcher StatefulSet descriptor issue](https://github.com/knative-extensions/eventing-kafka-broker/issues/3995)
9. [KEDA support for Knative Event Sources Autoscaling](https://github.com/knative-extensions/eventing-autoscaler-keda)
10. [Configure KEDA Autoscaling of Knative Kafka Resources](https://knative.dev/docs/eventing/configuration/keda-configuration/)
11. [KEDA – Kubernetes Event-driven Autoscaling](https://keda.sh/)
12. [KEDA Concepts](https://keda.sh/docs/2.7/concepts/)
13. [Event-driven Autoscaling through KEDA and Knative Integration – Red Hat](https://www.redhat.com/tracks/_pfcdn/assets/10330/contents/394544/3e378991-2ed1-4057-a962-60)
14. [Application Scalability, Part 3: Knative and KEDA – Medium](https://turbaszek.medium.com/application-scalability-part-3-knative-and-keda-6d277a8b)
15. [keda package – knative.dev/eventing-autoscaler-keda/pkg/reconciler/keda](https://pkg.go.dev/knative.dev/eventing-autoscaler-keda/pkg/reconciler/keda)
16. [Configuring Kafka features – Knative](https://knative.dev/docs/eventing/brokers/broker-types/kafka-broker/configuring-kafka-features/)
17. [Increase number of events sent by Knative Kafka broker to Knative Service – Stack Overflow](https://stackoverflow.com/questions/73688710/increase-number-of-events-sen)
18. [Setup Knative Eventing with Kafka from scratch](https://dev.to/cheviana/knative-switchboard-series-part-1-setup-knative-even)
19. [Apache Kafka Source – Knative](https://knative.dev/docs/eventing/sources/kafka-source/)
20. [Knative: Home](https://knative.dev/docs/)
21. [Releases – knative-extensions/eventing-kafka-broker](https://github.com/knative-sandbox/eventing-kafka-broker/releases)
22. [Handling Kafka Events with Knative – Syntio](https://www.syntio.net/en/labs-musings/handling-kafka-events-with-knative/)
23. [Native integration with KEDA for LLM inference autoscaling – GitHub](https://github.com/kserve/kserve/issues/3561)
