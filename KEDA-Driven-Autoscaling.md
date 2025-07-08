

# **A Definitive Guide to KEDA-Driven Autoscaling for the Knative Kafka Broker Data Plane**

## **Architectural Deep Dive: The Interplay of Knative, Kafka, and KEDA**

Achieving efficient, event-driven autoscaling in a cloud-native environment requires a sophisticated interplay of specialized components. The integration of Kubernetes Event-Driven Autoscaling (KEDA) with the Knative Kafka Broker is a prime example of such a system, where multiple control loops collaborate to dynamically adjust resource allocation based on real-time event processing demands. This architecture is not monolithic; rather, it is a carefully orchestrated system composed of distinct planes and controllers, each optimized for a specific task. Understanding this architecture is fundamental to effectively configuring, operating, and troubleshooting the autoscaling behavior of Knative's Kafka-based eventing infrastructure.

### **The Knative Kafka Broker's Two-Plane Architecture**

The Knative Kafka Broker is designed with a clear separation of concerns, embodied in its two-plane architecture: a control plane for management and a data plane for high-throughput message processing.1 This separation allows for independent optimization and technology choices best suited for each plane's function.

#### **Control Plane (Go)**

The control plane is the management layer responsible for observing the state of Knative custom resources (CRs) and reconciling the cluster state to match the user's declared intent.

* **Core Component:** The primary component of the control plane is the kafka-controller, which runs as a pod within the knative-eventing namespace.2  
* **Function:** Its main responsibility is to watch for the creation, update, and deletion of Broker and Trigger custom resources. When a user creates a Broker, the controller ensures the necessary underlying Kafka topics are provisioned (or referenced if using an external topic).2 When a user creates a  
  Trigger, the controller configures the data plane to subscribe to the appropriate topic and deliver events to the specified sink.  
* **Configuration Propagation:** The control plane translates the specifications of these CRs into configuration that the data plane can consume. This is typically achieved by writing to shared Kubernetes ConfigMap resources, a loosely coupled mechanism that decouples the data plane from direct communication with the Kubernetes API server.4  
* **Implementation:** The control plane is implemented in the Go programming language, aligning it with the technology stack of core Kubernetes and Knative components, leveraging the extensive libraries and frameworks available for building Kubernetes operators.3

#### **Data Plane (Java/Vert.x)**

The data plane is the workhorse of the system, engineered specifically to handle the high-volume, low-latency flow of CloudEvents.

* **Core Components:** The data plane is composed of two primary deployments: the kafka-broker-receiver and the kafka-broker-dispatcher.1  
* **Implementation:** This plane is implemented in Java, utilizing the Eclipse Vert.x toolkit.3 Vert.x is a non-blocking, event-driven framework that excels at handling concurrent I/O operations. This makes it an ideal choice for the data plane's tasks, which involve receiving HTTP requests and interacting with Kafka, both of which are I/O-intensive. This deliberate technological divergence from the Go-based control plane showcases a design that prioritizes performance for data flow over homogeneity with the management layer.

### **Anatomy of the Data Plane: receiver and dispatcher**

The two components of the data plane have distinct roles and, consequently, different deployment and scaling models.

#### **kafka-broker-receiver (Ingress)**

The kafka-broker-receiver serves as the front door for all events entering a Kafka Broker.

* **Role:** Its function is to act as an HTTP ingress point. It exposes an endpoint that listens for incoming CloudEvents sent by event producers. Upon receiving an event, it validates it and writes it into the appropriate Kafka topic for persistence and consumption by the dispatcher.1  
* **Deployment Model:** The receiver is deployed as a standard Kubernetes Deployment.1 This model is well-suited for its stateless nature; each receiver pod is identical and can handle any incoming request, allowing for simple horizontal scaling.  
* **Scaling Mechanism:** The operational load on the receiver is directly proportional to the rate of incoming HTTP requests from producers. As such, it is **not** a target for the KEDA Kafka lag scaler. Its scaling is typically managed by a standard Kubernetes Horizontal Pod Autoscaler (HPA) configured to monitor CPU or memory utilization, or potentially by the Knative Pod Autoscaler (KPA) if it were modeled as a Knative Service, which scales based on requests-per-second or concurrency.6

#### **kafka-broker-dispatcher (Egress)**

The kafka-broker-dispatcher is responsible for delivering events from Kafka to their final destinations.

* **Role:** The dispatcher acts as a Kafka consumer group. It reads CloudEvents from the broker's topic and dispatches them via HTTP to the subscriber sinks, which are defined by Knative Trigger resources.1  
* **Deployment Model:** Crucially, the dispatcher is deployed as a Kubernetes StatefulSet.8 This choice is significant. A  
  StatefulSet provides stable, unique network identifiers for its pods (e.g., kafka-broker-dispatcher-0, kafka-broker-dispatcher-1) and guarantees ordered deployment and scaling. This stability is highly beneficial for managing Kafka consumer group membership. As pods are added or removed, the ordered nature of the StatefulSet helps to minimize the frequency and impact of consumer group rebalancing events, which can temporarily halt event processing. This is particularly important for scenarios requiring ordered event delivery.2  
* **Scaling Mechanism:** The dispatcher is the **primary and intended target for KEDA-driven autoscaling**. Its workload is a direct function of the consumer lag on its Kafka topic—that is, the number of messages produced to the topic that have not yet been processed. This metric is precisely what KEDA's Kafka scaler is designed to monitor and act upon, making the dispatcher a perfect fit for this scaling model.9

### **The KEDA Integration Model: A Decoupled Control Loop**

The integration of KEDA into the Knative Kafka Broker ecosystem is not a built-in feature but rather a collaboration between three independent controllers operating in a decoupled fashion. This design enhances modularity and allows each component to evolve separately.

1. **Knative kafka-controller:** Manages the Broker and Trigger resources, setting up the fundamental data plane components (receiver and dispatcher).  
2. **KEDA keda-operator:** Runs in the keda namespace and manages the core KEDA logic. It watches for ScaledObject resources and orchestrates the scaling of target workloads by creating and managing HPAs based on metrics from external sources.12  
3. **eventing-autoscaler-keda Controller:** This is the critical bridge between the Knative and KEDA worlds. It is a separate, optional component that must be installed in the cluster.9 Its sole purpose is to translate a user's intent, expressed via annotations on Knative resources, into a declarative configuration that the  
   keda-operator can understand. It watches for Knative resources like Triggers that have been annotated for KEDA scaling and, in response, dynamically creates a corresponding KEDA ScaledObject CR.9

### **The End-to-End Reconciliation Flow: From Annotation to Scaled Pod**

The process of scaling a kafka-broker-dispatcher based on Kafka lag involves a precise sequence of events across these controllers.

1. **User Action:** A platform engineer defines a Knative Trigger resource. To enable KEDA scaling, they add a specific set of annotations to the Trigger's metadata, such as autoscaling.knative.dev/class: keda.autoscaling.knative.dev and autoscaling.eventing.knative.dev/lag-threshold: "100".10  
2. **Knative Controller Reconciliation:** The kafka-controller observes the new Trigger. It performs its standard reconciliation, ensuring that the kafka-broker-dispatcher StatefulSet is configured to consume events for this trigger and deliver them to the specified sink.  
3. **KEDA Autoscaler Detection:** The eventing-autoscaler-keda controller, which is watching Trigger resources, detects the creation or update of the annotated trigger. This invokes its reconciliation loop.  
4. **ScaledObject Generation:** The eventing-autoscaler-keda controller reads the annotations from the Trigger and programmatically constructs a KEDA ScaledObject resource. This ScaledObject will contain:  
   * A scaleTargetRef that points directly to the kafka-broker-dispatcher StatefulSet in the knative-eventing namespace.9  
   * A triggers array containing a kafka trigger configuration. This configuration is populated with the Kafka bootstrap servers, topic name, and consumer group ID associated with the Trigger, and crucially, the lagThreshold value extracted from the annotation.13  
   * Other scaling parameters like minReplicaCount, maxReplicaCount, pollingInterval, and cooldownPeriod, also parsed from the corresponding annotations on the Trigger.9  
5. **KEDA Operator Action:** The keda-operator detects the newly created ScaledObject. It now assumes responsibility for the scaling of the kafka-broker-dispatcher.  
6. **Metrics Provisioning and HPA Management:** The keda-operator begins to poll the specified Kafka topic to measure the consumer group lag. It exposes this metric via the Kubernetes custom metrics API. Concurrently, KEDA creates and manages a standard HorizontalPodAutoscaler resource. This HPA is configured to target the kafka-broker-dispatcher StatefulSet and to use the custom kafka-lag metric provided by KEDA's metrics server.12  
7. **Scaling Execution:** The native Kubernetes HPA controller queries the metrics API for the lag value. It compares the current lag against the target threshold defined in the ScaledObject. If the lag is high enough to warrant scaling, the HPA controller increases the replica count of the kafka-broker-dispatcher StatefulSet. Conversely, when the lag decreases, KEDA's logic ensures the HPA scales the StatefulSet down, respecting the configured cooldownPeriod and potentially scaling all the way to zero replicas if the lag remains at zero.12

This multi-stage, declarative flow ensures that the system is robust and aligns with Kubernetes design principles. The user only needs to interact with high-level Knative resources, and the specialized controllers handle the complex mechanics of translating that intent into low-level scaling actions.

## **Codebase Exploration: From Annotation to ScaledObject**

To fully grasp the mechanics of the KEDA integration, it is necessary to examine the implementation details within the relevant controller codebases. While the controllers themselves are complex, their core logic for this integration follows a clear and discernible pattern centered around the transformation of annotations into a declarative ScaledObject configuration.

### **Inside eventing-autoscaler-keda: The Core Reconciliation Logic**

The knative-extensions/eventing-autoscaler-keda repository contains the "adapter" controller that bridges Knative and KEDA. Its logic is designed to be dynamic and extensible.9

#### **Controller Entrypoint (main.go)**

The entrypoint for the controller, typically located at cmd/controller/main.go, is responsible for the initial setup. This includes initializing the client for communicating with the Kubernetes API server, setting up a logger, and creating a controller manager. The crucial step here is registering the reconcilers that will watch specific Kubernetes resources. The controller is designed to dynamically discover supported Custom Resource Definitions (CRDs) like KafkaSource and Trigger, and then start a dedicated reconciliation loop for each.9

#### **The Reconciler (pkg/reconciler/keda/keda.go)**

The heart of the integration resides in the reconciler package, likely within a file such as pkg/reconciler/keda/keda.go. The Reconcile function within this file is the main handler that gets executed whenever a change is detected in one of the watched resources (e.g., a Trigger).

The reconciliation logic follows these primary steps:

1. **Annotation Check:** The first action is to inspect the annotations of the incoming resource. It specifically looks for the presence of the autoscaling.knative.dev/class: keda.autoscaling.knative.dev annotation. If this annotation is missing or set to a different value (like the default kpa.autoscaling.knative.dev), the reconciler concludes that this resource is not meant to be scaled by KEDA and terminates its process for that resource.9  
2. **ScaledObject Generation:** If the class annotation is correctly set, the reconciler proceeds to construct the desired ScaledObject. This is typically handled by a dedicated helper function, GenerateScaledObject.

#### **Dissecting GenerateScaledObject**

The GenerateScaledObject function is a pure transformation function that takes the Knative resource object and its metadata as input and produces a ScaledObject as output. Based on the function signatures and constants defined in the knative.dev/eventing-autoscaler-keda/pkg/reconciler/keda package documentation, its internal process can be reconstructed.15

1. **Instantiation:** The function begins by creating an empty instance of the kedav1alpha1.ScaledObject struct.  
2. **Annotation Parsing:** It retrieves the full map of annotations from the input Knative object using obj.GetAnnotations().  
3. **Population of Core Scaling Parameters:** The function then systematically populates the fields of the ScaledObject. It uses helper functions, such as GetInt32ValueFromMap, to safely parse the string values from the annotation map into the required \*int32 types for the ScaledObject spec. It uses a set of predefined constants to look up the correct annotation keys 15:  
   * autoscaling.knative.dev/minScale maps to spec.minReplicaCount.  
   * autoscaling.knative.dev/maxScale maps to spec.maxReplicaCount.  
   * keda.autoscaling.knative.dev/pollingInterval maps to spec.pollingInterval.  
   * keda.autoscaling.knative.dev/cooldownPeriod maps to spec.cooldownPeriod.  
4. **Construction of the Trigger:** This is the most resource-specific part of the function. The logic identifies the type of the Knative resource (e.g., a Trigger associated with a KafkaBroker). It then extracts the necessary details to configure the KEDA scaler, such as the Kafka bootstrap servers, topic name, and consumer group ID, from the spec or status of the Knative resource. Finally, it reads the autoscaling.eventing.knative.dev/lag-threshold and keda.autoscaling.knative.dev/kafkaActivationLagThreshold annotations to populate the lagThreshold and activationLagThreshold metadata fields within the kedav1alpha1.ScaleTriggers struct.  
5. **Target Identification:** The function determines the workload that needs to be scaled. For a Trigger belonging to a Kafka Broker, this target is invariably the kafka-broker-dispatcher StatefulSet. The ScaleTargetRef field of the ScaledObject is populated with the name, kind (StatefulSet), and API version of this target.  
6. **Finalization:** The fully constructed ScaledObject is returned to the main Reconcile function. The reconciler then uses the Kubernetes client to create this ScaledObject in the cluster or update it if it already exists. Owner references are set on the ScaledObject to link it to the parent Knative resource, ensuring that it is automatically garbage-collected when the Knative resource is deleted.

This stateless, declarative transformation is robust. The eventing-autoscaler-keda controller does not need to track scaling history; it simply ensures that the state of the ScaledObject in the cluster is a direct reflection of the annotations on its parent Knative resource.

### **Inside eventing-kafka-broker: The Target Workload Controller**

While the eventing-autoscaler-keda controller manages the creation of the ScaledObject, the knative-extensions/eventing-kafka-broker controller is responsible for managing the workload that is being scaled.

#### **Control Plane Reconcilers**

Within the control-plane directory of the eventing-kafka-broker repository, reconcilers for Broker and Trigger objects handle the lifecycle of the data plane components.3 When a

Trigger is created, the trigger reconciler ensures that the kafka-broker-dispatcher StatefulSet is deployed and correctly configured.

#### **Dispatcher StatefulSet Management**

The role of the kafka-controller is not to scale the StatefulSet's replica count—that is delegated to KEDA—but to manage its template (spec.template). This includes setting the correct container image, resource requests and limits, and environment variables. Crucially, it configures the dispatcher pods to mount and read from a shared ConfigMap. This ConfigMap contains the contract, a data structure that maps consumer group IDs to their respective trigger configurations, including the sink URI and any delivery guarantees. This allows a single dispatcher pod to handle events for multiple triggers if necessary.8 The existence and correctness of the

StatefulSet template are the responsibility of the kafka-controller, while the replica count is externally managed by the KEDA-driven HPA.

## **Configuration Reference: Mastering Annotations and ConfigMaps**

Configuring KEDA-driven autoscaling for the Knative Kafka Broker involves manipulating resources at two levels: a global ConfigMap to enable the feature, and resource-specific annotations to fine-tune the behavior for each Trigger or KafkaSource. Furthermore, achieving optimal throughput requires tuning the performance parameters of the data plane pods themselves.

### **Global Activation: The config-kafka-features ConfigMap**

Before any annotation-based configuration can take effect, the KEDA autoscaling feature must be enabled globally for the Knative Kafka installation. This acts as a master feature gate.

The feature is controlled by the config-kafka-features ConfigMap located in the knative-eventing namespace. To enable it, this ConfigMap must contain the key controller-autoscaler-keda with the value enabled.10

A patch command or direct edit can be used to apply this configuration:

YAML

apiVersion: v1  
kind: ConfigMap  
metadata:  
  name: config-kafka-features  
  namespace: knative-eventing  
data:  
  controller-autoscaler-keda: "enabled"  
  \#... other existing features and config options

Without this global setting, the kafka-controller and associated components will not be aware of the KEDA integration, and the eventing-autoscaler-keda controller's actions may not be correctly coordinated.

### **Comprehensive Annotation Dictionary**

Once the feature is globally enabled, scaling behavior is controlled on a per-resource basis using annotations. The system is designed with a clear abstraction layer: engineers can use generic autoscaling.knative.dev/\* annotations for basic settings, but can also use more specific keda.autoscaling.knative.dev/\* annotations for finer control. The KEDA-specific annotations take precedence if both are present.

The following table serves as a consolidated reference for all relevant annotations, their purpose, and their mapping to the underlying KEDA ScaledObject.

**Table 3.2.1: Knative Kafka KEDA Autoscaling Annotations**

| Annotation Key | Applies To | Purpose | ScaledObject Field | Default Value | Example |
| :---- | :---- | :---- | :---- | :---- | :---- |
| autoscaling.knative.dev/class | Trigger, KafkaSource | **Required.** Enables KEDA scaling for the resource by specifying the KEDA autoscaler class. | N/A (Enabler) | kpa.autoscaling.knative.dev | keda.autoscaling.knative.dev |
| autoscaling.knative.dev/min-scale | Trigger, KafkaSource | The minimum number of replicas the workload can scale down to. A value of "0" enables scale-to-zero. | spec.minReplicaCount | "0" | "1" |
| autoscaling.knative.dev/max-scale | Trigger, KafkaSource | The maximum number of replicas the workload can scale out to. | spec.maxReplicaCount | "50" | "20" |
| autoscaling.eventing.knative.dev/lag-threshold | Trigger, KafkaSource | The target number of unprocessed messages (consumer lag) per replica. KEDA will add replicas to maintain this ratio. | spec.triggers.metadata.lagThreshold | "10" | "100" |
| keda.autoscaling.knative.dev/pollingInterval | Trigger, KafkaSource | The interval, in seconds, at which KEDA polls the Kafka topic for the consumer lag metric. | spec.pollingInterval | "30" | "15" |
| keda.autoscaling.knative.dev/cooldownPeriod | Trigger, KafkaSource | The period, in seconds, to wait after the last trigger activation before scaling down. | spec.cooldownPeriod | "300" | "60" |
| keda.autoscaling.knative.dev/kafkaActivationLagThreshold | Trigger, KafkaSource | The consumer lag threshold required to scale the workload from zero to one replica. | spec.triggers.metadata.activationLagThreshold | "0" | "5" |

Sources: 9

### **Data Plane Performance Tuning: Beyond Pod Counts**

Scaling the number of kafka-broker-dispatcher pods is only half of the performance equation. If each individual pod is not configured for high throughput, simply adding more pods will yield diminishing returns and may not resolve a processing bottleneck. Tuning the internal parameters of the dispatcher application is therefore a critical step for high-volume workloads.17

These parameters are configured globally via the config-kafka-broker-data-plane ConfigMap in the knative-eventing namespace. The data field of this ConfigMap contains keys that correspond to Java properties files used to configure the Vert.x application.

The following table details the most impactful properties for performance tuning.

**Table 3.3.1: Key Data Plane Performance Parameters**

| Property | File in ConfigMap | Purpose | Impact on Scaling | Recommendation |
| :---- | :---- | :---- | :---- | :---- |
| max.poll.records | config-kafka-broker-consumer.properties | The maximum number of records the Kafka consumer within a dispatcher pod will fetch in a single poll request. | This directly controls the batch size of events processed by a pod in each cycle. A low value will starve the pods, making KEDA's scaling ineffective as pods will be idle waiting for work. A very high value increases memory consumption per pod. | This value should be tuned in conjunction with max-scale. To ensure scaled-out pods are utilized effectively, increase this from the default of 500\. For high-throughput scenarios, values between 1000 and 5000 can be effective, depending on message size and memory constraints. |
| fetch.min.bytes | config-kafka-broker-consumer.properties | The minimum amount of data the Kafka broker should return for a fetch request. The broker will wait until this amount of data is available. | A higher value can increase throughput and reduce load on the Kafka brokers by encouraging larger, less frequent fetch requests. However, it can increase event processing latency if traffic is sporadic. | For low-latency requirements, keep the default value of 1\. For high-volume, steady-stream scenarios, increasing this value (e.g., to 50000\) can improve overall efficiency. |
| maxPoolSize | config-kafka-broker-webclient.properties | The maximum number of connections in the Vert.x HTTP client pool used by a dispatcher pod to send events to subscriber sinks. | This parameter acts as a bottleneck for a pod's egress concurrency. If maxPoolSize is less than max.poll.records, the dispatcher can fetch a large batch of events but can only send a small number of them concurrently, leading to internal head-of-line blocking. | **Crucially, set this value to be greater than or equal to max.poll.records.** A safe practice is to set them to the same value to ensure the pod can dispatch every event it fetches in parallel. |

Sources: 5

By balancing the number of pods (via KEDA annotations) with the processing capacity of each pod (via the data plane ConfigMap), a truly scalable and high-performance eventing system can be achieved.

## **Practical Guide: Testing and Verifying Scaling Behavior**

This section provides a comprehensive, step-by-step guide to deploy the necessary components, configure a test scenario, and verify the KEDA-driven autoscaling of the kafka-broker-dispatcher. This hands-on process is essential for validating the architecture and understanding its behavior in a controlled environment.

### **Environment Prerequisites and Installation**

Before configuring the test scenario, a complete environment with Kubernetes, Kafka, Knative, and KEDA must be established.

#### **Checklist**

* A running Kubernetes cluster (e.g., Kind, Minikube, or a cloud provider's managed service).  
* kubectl command-line tool configured to communicate with the cluster.  
* Helm v3+ (recommended for installing KEDA).

#### **Step-by-Step Installation**

1. **Install Strimzi Kafka Operator:** Strimzi simplifies the deployment and management of Kafka on Kubernetes. Install the operator into its own namespace (e.g., kafka).18  
   Bash  
   kubectl create namespace kafka  
   helm repo add strimzi https://strimzi.io/charts/  
   helm install strimzi-kafka-operator strimzi/strimzi-kafka-operator \--namespace kafka \--version \<latest\_version\>

2. **Deploy a Kafka Cluster:** Create a Kafka custom resource to provision a simple, single-node Kafka and Zookeeper cluster for testing purposes.18  
   YAML  
   \# kafka-cluster.yaml  
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
         \- name: plain  
           port: 9092  
           type: internal  
           tls: false  
         \- name: tls  
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
         \- id: 0  
           type: persistent-claim  
           size: 10Gi  
           deleteClaim: true  
     zookeeper:  
       replicas: 1  
       storage:  
         type: persistent-claim  
         size: 5Gi  
         deleteClaim: true

   Apply the manifest: kubectl apply \-f kafka-cluster.yaml \-n kafka  
3. **Install Knative:** Apply the manifests for Knative Serving and Knative Eventing core components.2  
   Bash  
   \# Install Knative Serving  
   kubectl apply \-f https://github.com/knative/serving/releases/download/knative-v1.18.0/serving-crds.yaml  
   kubectl apply \-f https://github.com/knative/serving/releases/download/knative-v1.18.0/serving-core.yaml

   \# Install Knative Eventing  
   kubectl apply \-f https://github.com/knative/eventing/releases/download/knative-v1.18.0/eventing-crds.yaml  
   kubectl apply \-f https://github.com/knative/eventing/releases/download/knative-v1.18.0/eventing-core.yaml

4. **Install Knative Kafka Broker:** Apply the controller and data plane manifests for the Kafka Broker.2  
   Bash  
   kubectl apply \-f https://github.com/knative-extensions/eventing-kafka-broker/releases/download/knative-v1.18.0/eventing-kafka-controller.yaml  
   kubectl apply \-f https://github.com/knative-extensions/eventing-kafka-broker/releases/download/knative-v1.18.0/eventing-kafka-broker.yaml

5. **Install KEDA:** Use Helm to install KEDA v2+ into its own keda namespace.9  
   Bash  
   helm repo add kedacore https://kedacore.github.io/charts  
   helm install keda kedacore/keda \--namespace keda \--create-namespace

6. **Install the eventing-autoscaler-keda Controller:** Apply the manifest for the adapter controller.9  
   Bash  
   kubectl apply \-f https://github.com/knative-extensions/eventing-autoscaler-keda/releases/download/knative-v1.18.0/eventing-autoscaler-keda.yaml

7. **Enable KEDA in Knative:** Patch the config-kafka-features ConfigMap to globally enable the integration.  
   Bash  
   kubectl patch configmap config-kafka-features \-n knative-eventing \--type merge \-p '{"data":{"controller-autoscaler-keda":"enabled"}}'

### **Test Scenario: Autoscaling a Broker Trigger's Dispatcher**

With the environment set up, configure a Broker, a Trigger with KEDA annotations, and a sink service.

1. **Create a Test Namespace:**  
   Bash  
   kubectl create ns keda-test

2. **Define a Sink Service:** Deploy a simple event-display service that logs incoming CloudEvents. This will act as the event destination.19  
   YAML  
   \# sink.yaml  
   apiVersion: serving.knative.dev/v1  
   kind: Service  
   metadata:  
     name: event-display  
     namespace: keda-test  
   spec:  
     template:  
       spec:  
         containers:  
           \- image: gcr.io/knative-releases/knative.dev/eventing/cmd/event\_display

3. **Define the Kafka Broker:** Create a Broker resource in the test namespace. It will automatically use the Kafka cluster via the default broker class configuration.2  
   YAML  
   \# broker.yaml  
   apiVersion: eventing.knative.dev/v1  
   kind: Broker  
   metadata:  
     name: default  
     namespace: keda-test

4. **Define the Annotated Trigger:** Create a Trigger that subscribes to the default broker and uses the event-display service as its sink. This manifest includes the crucial KEDA annotations to control scaling.  
   YAML  
   \# trigger.yaml  
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

5. **Apply the Manifests:**  
   Bash  
   kubectl apply \-f sink.yaml \-f broker.yaml \-f trigger.yaml

### **Verification and Observation**

After deploying the test resources, systematically verify that each component of the scaling mechanism is functioning correctly.

1. **Verify ScaledObject Creation:** The eventing-autoscaler-keda controller should have created a ScaledObject.  
   * **Command:** kubectl get scaledobject \-n knative-eventing  
   * **Expected Output:** You should see a ScaledObject resource. Its name will be algorithmically generated based on the Trigger's UID.9  
   * **Drill-down:** Inspect the ScaledObject's YAML to confirm that the annotations were translated correctly into its spec.  
     Bash  
     \# Get the name of the ScaledObject  
     SO\_NAME=$(kubectl get scaledobject \-n knative-eventing \-o jsonpath='{.items.metadata.name}')  
     kubectl get scaledobject $SO\_NAME \-n knative-eventing \-o yaml

     Verify that scaleTargetRef points to kafka-broker-dispatcher, and that minReplicaCount, maxReplicaCount, lagThreshold, etc., match the values from the Trigger annotations.  
2. **Verify HPA Creation:** KEDA should have created a HorizontalPodAutoscaler.  
   * **Command:** kubectl get hpa \-n knative-eventing  
   * **Expected Output:** An HPA targeting the kafka-broker-dispatcher StatefulSet should be present. The "TARGETS" column will show the current lag versus the target lag (e.g., 0/20).  
3. **Generate Kafka Load:** Produce a significant number of messages to the broker's topic. The topic name follows the template knative-broker-\<namespace\>-\<broker-name\>.16  
   * Start a producer pod:  
     Bash  
     kubectl \-n kafka run kafka-producer \-ti \--image=quay.io/strimzi/kafka:0.37.0-kafka-3.5.1 \--rm=true \--restart=Never \-- bin/kafka-console-producer.sh \--bootstrap-server my-cluster-kafka-bootstrap.kafka:9092 \--topic knative-broker-keda-test-default

   * In the producer shell, paste or type several hundred lines of text. Each line is a message.  
4. **Observe Scaling Up:** While the producer is sending messages, monitor the kafka-broker-dispatcher pods.  
   * **Command:** watch kubectl get pods \-n knative-eventing \-l app=kafka-broker-dispatcher  
   * **Expected Behavior:** The number of dispatcher pods should rapidly increase from 0 (or 1, if min-scale \> 0\) towards the configured max-scale of 10\. The HPA is reacting to the lag metric reported by KEDA, which will be well above the threshold of 20\.  
5. **Observe Scaling Down:**  
   * Stop the producer pod (Ctrl+C).  
   * Monitor the logs of the event-display service to see the events being consumed: kubectl logs \-n keda-test \-l serving.knative.dev/service=event-display \-c user-container \-f.  
   * Once the logs stop, the lag has returned to zero.  
   * **Expected Behavior:** After the lag has been zero for the duration of the cooldownPeriod (45 seconds in this example), the watch command from the previous step will show the kafka-broker-dispatcher pods terminating one by one until the min-scale count of 0 is reached.

### **Troubleshooting Common Issues**

* **Problem: The ScaledObject is not created.**  
  * **Check 1:** Double-check that the autoscaling.knative.dev/class annotation on the Trigger is spelled correctly and set to keda.autoscaling.knative.dev.  
  * **Check 2:** Inspect the logs of the eventing-autoscaler-keda-controller pod in the knative-eventing namespace. Look for any reconciliation errors related to the Trigger.  
  * **Check 3:** Ensure the global feature flag controller-autoscaler-keda is set to enabled in the config-kafka-features ConfigMap.  
* **Problem: Pods do not scale up under load.**  
  * **Check 1:** Describe the HPA resource: kubectl describe hpa \-n knative-eventing \<hpa-name\>. The Events section at the bottom will show the HPA's decisions and the metrics it observed. Ensure the reported lag metric is increasing.  
  * **Check 2:** Inspect the logs of the keda-operator pod in the keda namespace. Look for errors related to connecting to the Kafka cluster or calculating consumer lag. Authentication or network policy issues often surface here.  
  * **Check 3:** Verify the consumerGroup specified in the ScaledObject's trigger metadata matches the consumer group being used by the dispatcher for that Trigger.  
* **Problem: Pods scale up, but event throughput remains low.**  
  * **Cause:** This is a classic sign of an application-level bottleneck within the dispatcher pods, not an infrastructure scaling issue. The pods are running, but they cannot process events fast enough.  
  * **Solution:** Review and tune the parameters in the config-kafka-broker-data-plane ConfigMap, as detailed in Section 3.3. Specifically, consider increasing max.poll.records and ensuring maxPoolSize is at least as large.17

## **Conclusion and Expert Recommendations**

The integration of KEDA with the Knative Kafka Broker provides a powerful, event-driven scaling mechanism that is essential for building resilient, cost-effective, and high-performance serverless applications on Kubernetes. The architecture, characterized by its decoupled, multi-controller design and its clear separation of control and data planes, offers both flexibility and robustness. By correctly applying scaling logic to the consumer-facing kafka-broker-dispatcher StatefulSet based on real-time Kafka consumer lag, the system ensures that compute resources align precisely with processing demand.

### **Summary of Architectural Patterns**

The analysis reveals several key architectural patterns that are critical to the system's success:

* **Two-Plane Architecture:** The use of Go for the control plane and Java/Vert.x for the data plane optimizes each for its respective task—management and high-throughput data flow.  
* **Decoupled Adapter Controller:** The eventing-autoscaler-keda controller acts as a vital, loosely coupled bridge, translating user intent from Knative annotations into KEDA-native ScaledObject resources. This modularity allows Knative and KEDA to evolve independently without creating hard dependencies.  
* **Asymmetric Scaling Model:** The system intelligently applies KEDA's lag-based scaling only to the dispatcher (the consumer), where it is most relevant. The receiver (the producer) is left to be scaled by traditional metrics like CPU or RPS, demonstrating a "right tool for the right job" approach.

### **Strategic Recommendations**

For engineers and platform teams implementing this solution, the following strategic recommendations will help ensure a successful deployment and operation:

* **Adopt a Layered Tuning Approach:** Begin with the default KEDA and data plane configurations to establish a performance baseline. Address scaling issues methodically. First, validate that KEDA is scaling the number of pods correctly by observing the HPA and pod counts (the infrastructure layer). Only if bottlenecks persist after the pod count is scaling appropriately should you proceed to tune the application-level throughput parameters in the config-kafka-broker-data-plane ConfigMap.  
* **Leverage Isolated Data Planes for Multi-Tenancy:** In environments with multiple tenants or brokers exhibiting vastly different traffic patterns, the default shared data plane can lead to a "noisy neighbor" problem, where one high-traffic broker starves others of resources. To mitigate this, use the KafkaNamespaced broker class. This instructs the kafka-controller to deploy a dedicated receiver and dispatcher set within the broker's namespace, providing complete resource isolation at the cost of higher resource consumption.1  
* **Implement Holistic Monitoring:** Effective management requires a monitoring strategy that extends beyond pod counts. It is essential to monitor:  
  * **Kafka Consumer Group Lag:** Use a monitoring stack like Prometheus and Grafana, with a Kafka exporter, to directly visualize the consumer lag for the dispatcher's consumer group. This provides the ground truth for KEDA's scaling decisions.  
  * **End-to-End Event Latency:** Instrument the final sink application to measure the time from event creation to processing. This metric reveals the true user-facing performance and can help identify bottlenecks in the dispatcher or the sink itself.  
  * **Controller Logs:** Keep a close watch on the logs for all three key controllers (kafka-controller, eventing-autoscaler-keda, and keda-operator) to quickly diagnose reconciliation or metric collection errors.

### **Future Outlook**

The relationship between Knative and KEDA represents a significant trend in the cloud-native ecosystem toward more sophisticated, application-aware autoscaling. While this report focuses on Kafka lag, the underlying pattern of using KEDA as a pluggable scaling engine for Knative components is expanding. Ongoing work and proposals in the community aim to integrate KEDA with Knative Serving to enable scaling based on metrics beyond simple request counts, such as token throughput for Large Language Model (LLM) inference or queue lengths for worker-queue architectures.23 This indicates a future where Knative provides the serverless programming model and runtime, while KEDA offers a rich, extensible library of scalers to drive intelligent, fine-grained autoscaling for a diverse range of event-driven workloads. Mastering the integration detailed here provides a solid foundation for leveraging these future advancements.

#### **Works cited**

1. Knative Apache Kafka Broker with Isolated Data Plane \- Knative, accessed July 8, 2025, [https://knative.dev/blog/articles/kafka-broker-with-isolated-data-plane/](https://knative.dev/blog/articles/kafka-broker-with-isolated-data-plane/)  
2. About Apache Kafka Broker \- Knative, accessed July 8, 2025, [https://knative.dev/docs/eventing/brokers/broker-types/kafka-broker/](https://knative.dev/docs/eventing/brokers/broker-types/kafka-broker/)  
3. knative-extensions/eventing-kafka-broker: Alternate Kafka ... \- GitHub, accessed July 8, 2025, [https://github.com/knative-extensions/eventing-kafka-broker](https://github.com/knative-extensions/eventing-kafka-broker)  
4. eventing-kafka-broker/docs/channel/README.md at main \- GitHub, accessed July 8, 2025, [https://github.com/knative-sandbox/eventing-kafka-broker/blob/main/docs/channel/README.md](https://github.com/knative-sandbox/eventing-kafka-broker/blob/main/docs/channel/README.md)  
5. 100-config-kafka-channel-data-plane.yaml \- GitHub, accessed July 8, 2025, [https://github.com/knative-extensions/eventing-kafka-broker/blob/main/data-plane/config/channel/100-config-kafka-channel-data-plane.yaml](https://github.com/knative-extensions/eventing-kafka-broker/blob/main/data-plane/config/channel/100-config-kafka-channel-data-plane.yaml)  
6. About autoscaling \- Knative, accessed July 8, 2025, [https://knative.dev/docs/serving/autoscaling/](https://knative.dev/docs/serving/autoscaling/)  
7. Supported autoscaler types \- Knative, accessed July 8, 2025, [https://knative.dev/docs/serving/autoscaling/autoscaler-types/](https://knative.dev/docs/serving/autoscaling/autoscaler-types/)  
8. v1.14.7 kafka-broker-dispatcher StatefulSet descriptor is missing contract-resources volume definition \#3995 \- GitHub, accessed July 8, 2025, [https://github.com/knative-extensions/eventing-kafka-broker/issues/3995](https://github.com/knative-extensions/eventing-kafka-broker/issues/3995)  
9. KEDA support for Knative Event Sources Autoscaling \- GitHub, accessed July 8, 2025, [https://github.com/knative-extensions/eventing-autoscaler-keda](https://github.com/knative-extensions/eventing-autoscaler-keda)  
10. Configure KEDA Autoscaling of Knative Kafka Resources, accessed July 8, 2025, [https://knative.dev/docs/eventing/configuration/keda-configuration/](https://knative.dev/docs/eventing/configuration/keda-configuration/)  
11. KEDA | Kubernetes Event-driven Autoscaling, accessed July 8, 2025, [https://keda.sh/](https://keda.sh/)  
12. KEDA Concepts, accessed July 8, 2025, [https://keda.sh/docs/2.7/concepts/](https://keda.sh/docs/2.7/concepts/)  
13. Event-driven Autoscaling through KEDA and Knative Integration \- Red Hat, accessed July 8, 2025, [https://www.redhat.com/tracks/\_pfcdn/assets/10330/contents/394544/3e378991-2ed1-4057-a962-601eca344219.pdf](https://www.redhat.com/tracks/_pfcdn/assets/10330/contents/394544/3e378991-2ed1-4057-a962-601eca344219.pdf)  
14. Application Scalability, Part 3: Knative and KEDA | by Tomasz Urbaszek \- Medium, accessed July 8, 2025, [https://turbaszek.medium.com/application-scalability-part-3-knative-and-keda-6d277a8bb41c](https://turbaszek.medium.com/application-scalability-part-3-knative-and-keda-6d277a8bb41c)  
15. keda package \- knative.dev/eventing-autoscaler-keda/pkg/reconciler ..., accessed July 8, 2025, [https://pkg.go.dev/knative.dev/eventing-autoscaler-keda/pkg/reconciler/keda](https://pkg.go.dev/knative.dev/eventing-autoscaler-keda/pkg/reconciler/keda)  
16. Configuring Kafka features \- Knative, accessed July 8, 2025, [https://knative.dev/docs/eventing/brokers/broker-types/kafka-broker/configuring-kafka-features/](https://knative.dev/docs/eventing/brokers/broker-types/kafka-broker/configuring-kafka-features/)  
17. Increase number of events sent by Knative Kafka broker to Knative Service \- Stack Overflow, accessed July 8, 2025, [https://stackoverflow.com/questions/73688710/increase-number-of-events-sent-by-knative-kafka-broker-to-knative-service](https://stackoverflow.com/questions/73688710/increase-number-of-events-sent-by-knative-kafka-broker-to-knative-service)  
18. Setup Knative Eventing with Kafka from scratch, scale based on events volume, and monitor, accessed July 8, 2025, [https://dev.to/cheviana/knative-switchboard-series-part-1-setup-knative-eventing-with-kafka-from-scratch-scale-based-on-events-volume-and-monitor-3pcm](https://dev.to/cheviana/knative-switchboard-series-part-1-setup-knative-eventing-with-kafka-from-scratch-scale-based-on-events-volume-and-monitor-3pcm)  
19. Apache Kafka Source \- Knative, accessed July 8, 2025, [https://knative.dev/docs/eventing/sources/kafka-source/](https://knative.dev/docs/eventing/sources/kafka-source/)  
20. Knative: Home, accessed July 8, 2025, [https://knative.dev/docs/](https://knative.dev/docs/)  
21. Releases · knative-extensions/eventing-kafka-broker \- GitHub, accessed July 8, 2025, [https://github.com/knative-sandbox/eventing-kafka-broker/releases](https://github.com/knative-sandbox/eventing-kafka-broker/releases)  
22. Handling Kafka Events with Knative \- Syntio, accessed July 8, 2025, [https://www.syntio.net/en/labs-musings/handling-kafka-events-with-knative/](https://www.syntio.net/en/labs-musings/handling-kafka-events-with-knative/)  
23. Native integration with KEDA for LLM inference autoscaling · Issue \#3561 \- GitHub, accessed July 8, 2025, [https://github.com/kserve/kserve/issues/3561](https://github.com/kserve/kserve/issues/3561)
