apiVersion: v1
kind: Pod
metadata:
  name: kafka-cli
  namespace: keda-test        # <- change if you keep the secret / configmap elsewhere
  labels:
    app: kafka-cli
spec:
  restartPolicy: Never        # one-off utility pod; delete when you’re done
  containers:
  - name: kafka-cli
    image: bitnami/kafka:3.6.0
    # Pull the sensitive bits straight from the Secret and ConfigMap
    env:
      - name: KAFKA_USER
        valueFrom:
          secretKeyRef:
            name: kafka-secret       # must exist in the same namespace
            key: user
      - name: KAFKA_PASS
        valueFrom:
          secretKeyRef:
            name: kafka-secret
            key: password
      - name: KAFKA_PROTOCOL
        valueFrom:
          secretKeyRef:
            name: kafka-secret
            key: protocol            # e.g. SASL_SSL
      - name: KAFKA_SASL_MECHANISM
        valueFrom:
          secretKeyRef:
            name: kafka-secret
            key: sasl.mechanism      # e.g. SCRAM-SHA-512
      - name: BOOTSTRAP
        valueFrom:
          configMapKeyRef:
            name: kafka-broker-config
            key: bootstrap.servers
    # Build client.properties once, then idle so you can exec in at will
    command: ["/bin/sh", "-c"]
    args:
      - |
        set -e
        echo "security.protocol=${KAFKA_PROTOCOL}"          >  /tmp/client.properties
        echo "sasl.mechanism=${KAFKA_SASL_MECHANISM}"       >> /tmp/client.properties
        echo "sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username=\"${KAFKA_USER}\" password=\"${KAFKA_PASS}\";" >> /tmp/client.properties
        echo "Kafka CLI pod is ready – exec in and use kafka-topics.sh."
        tail -f /dev/null        # keep container alive for interactive use
