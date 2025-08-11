# Kafka CLI Tools

A Kubernetes pod-based utility for interacting with Kafka clusters using command-line tools. This approach provides a consistent, containerized environment for Kafka operations.

## Overview

This utility creates a Kubernetes pod with the Bitnami Kafka image, pre-configured with authentication credentials and broker information. The pod remains idle, allowing you to execute Kafka CLI commands interactively.

## Pod Configuration

The Kafka CLI pod is configured with the following specifications:

```yaml
apiVersion: v1
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
    image: bitnami/kafka:3.6.0
```

## Prerequisites

Before deploying the Kafka CLI pod, ensure you have:

- **Kafka Secret**: Contains authentication credentials
- **Kafka ConfigMap**: Contains broker configuration  
- **Proper Namespace**: Both resources in the same namespace as the pod

### Required Secret (kafka-secret)

Create a secret with the following keys:

```bash
kubectl create secret generic kafka-secret \
  --from-literal=user=your-username \
  --from-literal=password=your-password \
  --from-literal=protocol=SASL_SSL \
  --from-literal=sasl.mechanism=SCRAM-SHA-512
```

### Required ConfigMap (kafka-broker-config)

Create a configmap with broker information:

```bash
kubectl create configmap kafka-broker-config \
  --from-literal=bootstrap.servers=your-broker-endpoints
```

## Deployment

Deploy the Kafka CLI pod using the provided YAML configuration:

```bash
kubectl apply -f kafka-cli.sh
```

Wait for the pod to be ready:

```bash
kubectl wait --for=condition=Ready pod/kafka-cli -n keda-test --timeout=60s
```

## Usage

Once the pod is running, execute into it to use Kafka CLI tools:

```bash
kubectl exec -it kafka-cli -n keda-test -- /bin/bash
```

### Available Commands

Inside the pod, you can use standard Kafka CLI tools with the pre-configured client properties:

#### List Topics

```bash
kafka-topics.sh --bootstrap-server $BOOTSTRAP \
  --command-config /tmp/client.properties \
  --list
```

#### Create Topic

```bash
kafka-topics.sh --bootstrap-server $BOOTSTRAP \
  --command-config /tmp/client.properties \
  --create --topic my-topic --partitions 3 --replication-factor 2
```

#### Describe Topic

```bash
kafka-topics.sh --bootstrap-server $BOOTSTRAP \
  --command-config /tmp/client.properties \
  --describe --topic my-topic
```

#### Produce Messages

```bash
kafka-console-producer.sh --bootstrap-server $BOOTSTRAP \
  --producer.config /tmp/client.properties \
  --topic my-topic
```

#### Consume Messages

```bash
kafka-console-consumer.sh --bootstrap-server $BOOTSTRAP \
  --consumer.config /tmp/client.properties \
  --topic my-topic --from-beginning
```

#### List Consumer Groups

```bash
kafka-consumer-groups.sh --bootstrap-server $BOOTSTRAP \
  --command-config /tmp/client.properties \
  --list
```

#### Describe Consumer Group

```bash
kafka-consumer-groups.sh --bootstrap-server $BOOTSTRAP \
  --command-config /tmp/client.properties \
  --describe --group my-consumer-group
```

## Configuration Details

The pod automatically generates a `client.properties` file at startup with the following configuration:

```properties
security.protocol=${KAFKA_PROTOCOL}
sasl.mechanism=${KAFKA_SASL_MECHANISM}
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username="${KAFKA_USER}" password="${KAFKA_PASS}";
```

> **Note:** The pod uses environment variables from Kubernetes secrets and configmaps to build the client configuration, ensuring sensitive information is properly managed.

## Cleanup

When finished, delete the pod:

```bash
kubectl delete pod kafka-cli -n keda-test
```

> **Security Notice:** This pod is designed for interactive debugging and testing. Ensure proper RBAC and network policies are in place for production environments.

## Troubleshooting

### Pod Won't Start

- Verify the kafka-secret and kafka-broker-config exist in the correct namespace
- Check pod logs: `kubectl logs kafka-cli -n keda-test`
- Ensure the namespace exists

### Authentication Errors

- Verify secret contains correct credentials
- Check SASL mechanism matches broker configuration
- Ensure protocol (SASL_SSL, SASL_PLAINTEXT) is correct

### Connection Issues

- Verify bootstrap servers are accessible from the cluster
- Check network policies and security groups
- Test connectivity: `telnet broker-endpoint 9092`