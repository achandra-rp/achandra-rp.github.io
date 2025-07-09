# KEDA-Driven Autoscaling for Kafka Eventing

## Overview

This document describes how to enable and configure KEDA-based autoscaling for Knative Kafka Eventing on your cluster. It includes steps to enable the feature, set up the required infrastructure, and tune autoscaling behavior.

---

## Table of Contents

- [Enabling KEDA-based Autoscaling](#enabling-keda-based-autoscaling)
- [Installing KEDA and Prerequisites](#installing-keda-and-prerequisites)
- [Configuring Feature Flags](#configuring-feature-flags)
- [Annotations for KEDA Autoscaling](#annotations-for-keda-autoscaling)
- [Data Plane Performance Parameters](#data-plane-performance-parameters)
- [Troubleshooting and Observability](#troubleshooting-and-observability)
- [References](#references)

---

## Enabling KEDA-based Autoscaling

To enable KEDA autoscaling for Kafka Eventing components, you must:

1. Install KEDA in your cluster.
2. Update the `config-kafka-features` ConfigMap in the `knative-eventing` namespace to enable KEDA autoscaling.

---

## Installing KEDA and Prerequisites

**1. Install KEDA**

You can install KEDA using Helm:

```bash
kubectl create namespace kafka
helm repo add strimzi https://strimzi.io/charts/
helm install strimzi-kafka-operator strimzi/strimzi-kafka-operator --namespace kafka --version <latest_version>
```

**2. Install KEDA**

```bash
kubectl create namespace keda
helm repo add kedacore https://kedacore.github.io/charts
helm install keda kedacore/keda --namespace keda
```

**3. Verify Installation**

```bash
kubectl get pods -n keda
```

---

## Configuring Feature Flags

Enable KEDA autoscaling by updating the `config-kafka-features` ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: config-kafka-features
  namespace: knative-eventing
data:
  controller-autoscaler-keda: "enabled"
  # ... other existing features and config options
```

Apply the patch:

```bash
kubectl patch configmap config-kafka-features -n knative-eventing --type merge -p '{"data":{"controller-autoscaler-keda":"enabled"}}'
```

---

## Annotations for KEDA Autoscaling

To enable and tune KEDA for Triggers and KafkaSources, use the following annotations:

| Annotation Key                                 | Applies To           | Purpose                                                                                  | ScaledObject Field              | Default Value | Example |
|------------------------------------------------|----------------------|------------------------------------------------------------------------------------------|---------------------------------|---------------|---------|
| autoscaling.knative.dev/class                  | Trigger, KafkaSource | **Required.** Enables KEDA scaling for the resource by specifying the KEDA autoscaler class. | N/A (Enabler)                   | kpa.autoscaling.knative.dev | keda.autoscaling.knative.dev |
| autoscaling.knative.dev/min-scale              | Trigger, KafkaSource | The minimum number of replicas the workload can scale down to. A value of "0" enables scale-to-zero. | spec.minReplicaCount            | "0"          | "1"     |
| autoscaling.knative.dev/max-scale              | Trigger, KafkaSource | The maximum number of replicas the workload can scale out to.                             | spec.maxReplicaCount            | "50"         | "20"    |
| autoscaling.eventing.knative.dev/lag-threshold | Trigger, KafkaSource | The target number of unprocessed messages (consumer lag) per replica.                     | spec.triggers.metadata.lagThreshold | "100"    | "20"    |

**Example:**
```yaml
apiVersion: eventing.knative.dev/v1
kind: KafkaSource
metadata:
  name: my-kafka-source
  namespace: default
  annotations:
    autoscaling.knative.dev/class: keda.autoscaling.knative.dev
    autoscaling.knative.dev/min-scale: "1"
    autoscaling.knative.dev/max-scale: "10"
    autoscaling.eventing.knative.dev/lag-threshold: "50"
spec:
  # ... rest of spec
```

---

## Data Plane Performance Parameters

Tune consumer parallelism and batching for best performance:

| Parameter                                 | Type    | Default         | Description                                                             |
|-------------------------------------------|---------|-----------------|-------------------------------------------------------------------------|
| `consumer.concurrency`                    | int     | 1               | Number of parallel consumer threads per replica.                        |
| `consumer.batch.size`                     | int     | 100             | Number of messages to fetch per poll.                                   |
| `consumer.lag.threshold`                  | int     | 100             | Lag per replica before triggering scale-out.                            |
| `consumer.poll.timeout`                   | string  | "1s"            | Poll timeout for fetching records from Kafka.                           |

**Example:**
```yaml
apiVersion: eventing.knative.dev/v1
kind: KafkaSource
metadata:
  name: my-kafka-source
spec:
  consumer:
    concurrency: 4
    batch:
      size: 500
    lag:
      threshold: 50
    poll:
      timeout: "500ms"
```

---

## Troubleshooting and Observability

**1. Check KEDA ScaledObjects**

```bash
kubectl get scaledobject -n knative-eventing
kubectl describe scaledobject <name> -n knative-eventing
```

**2. View Autoscaler Status**

```bash
kubectl get keda
```

**3. Logs**

```bash
kubectl logs deployment/keda-operator -n keda
```

**4. Find ScaledObject Name for a KafkaSource**

```bash
SO_NAME=$(kubectl get scaledobject -n knative-eventing -o jsonpath='{.items[0].metadata.name}')
kubectl get scaledobject $SO_NAME -n knative-eventing -o yaml
```

---

## References

- [KEDA Documentation](https://keda.sh/docs/)
- [Knative Eventing Kafka Autoscaling](https://knative.dev/docs/eventing/samples/kafka/autoscaling/)
- [Strimzi Kafka Operator](https://strimzi.io/)

---
