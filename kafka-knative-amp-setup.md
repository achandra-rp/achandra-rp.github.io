# End-to-End Installation & Validation Guide

Prometheus Agent → Amazon Managed Prometheus (AMP) → Grafana Dashboards for Knative & Kafka

---

## 1. Prerequisites

* An EKS cluster (≥ 1.24) with OIDC provider enabled.
* Tools installed on your workstation:

  * `helm` (≥ 3.10)
  * `kubectl`
  * `jq`
  * AWS CLI v2
* An Amazon Managed Prometheus (AMP) workspace ID (e.g., `ws-16154fd8-5a2f-43af-9f6a-bd86dbbf0363`).
* Kafka cluster accessible from EKS nodes (e.g., MSK or Strimzi).
* Namespace `monitoring` (this guide creates it if missing).

---

## 2. Set up IAM Role for Service Account (IRSA)

Create the following Kubernetes service account (`amp-iamproxy-ingest.yaml`):

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: amp-iamproxy-ingest
  namespace: monitoring
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::<ACCOUNT_ID>:role/EKS-AMP-Ingest
```

### IAM Role Policy

Attach the following policy to the IAM role (`EKS-AMP-Ingest`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "aps:RemoteWrite",
        "aps:GetSeries",
        "aps:GetLabels",
        "aps:GetMetricMetadata"
      ],
      "Resource": "arn:aws:aps:*:*:workspace/ws-16154fd8-5a2f-43af-9f6a-bd86dbbf0363"
    }
  ]
}
```

### Trust Relationship Policy

Define trust relationship with EKS OIDC provider:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/oidc.eks.<region>.amazonaws.com/id/<OIDC_ID>"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.<region>.amazonaws.com/id/<OIDC_ID>:sub": "system:serviceaccount:monitoring:amp-iamproxy-ingest"
        }
      }
    }
  ]
}
```

Apply the manifest and IAM policies.

---

## 3. Install Prometheus Agent with Helm

(Refer to original Helm installation steps provided earlier in the guide.)

---

## 4. Import Knative ServiceMonitors

```bash
kubectl apply -f https://raw.githubusercontent.com/knative-extensions/monitoring/main/servicemonitor.yaml
```

Modify namespaces if Knative runs in custom ones.

---

## 5. Deploy Kafka Exporter and ServiceMonitor

Apply provided Kafka Exporter manifest (`kafka-exporter.yaml`).

### Verify Kafka Exporter Installation

* Check Kafka Exporter Pod Status:

  ```bash
  kubectl -n monitoring get pods -l app=kafka-exporter
  ```

* Check Metrics Endpoint:

  ```bash
  kubectl -n monitoring port-forward svc/kafka-exporter 9308
  curl localhost:9308/metrics | grep kafka
  ```

* View available metrics exposed by Kafka Exporter:

  ```bash
  curl -sG 'http://localhost:9090/api/v1/label/__name__/values' --data-urlencode 'match[]={job="kafka-exporter"}' | jq -r '.data[]'
  ```

You can also inspect available metrics through the Kafka Exporter's web page by port-forwarding and accessing it via your browser.

---

## 6. Smoke-Test the Pipeline

Follow the detailed smoke-testing steps provided in the original documentation to:

1. Port-forward the Prometheus agent.
2. Validate Kafka Exporter metrics in Prometheus.
3. Verify metrics queued for remote-write.
4. Confirm metrics sent to AMP.
5. Query AMP directly.

---

## 7. Integrate Grafana with AMP

* Configure Grafana Data Source:

  * Type: Amazon Managed Prometheus
  * Workspace ID and region: match AMP
  * Auth: SigV4
* Confirm connection with **Save & Test**.
* Use Grafana Explore to test queries such as:

  ```promql
  kafka_consumergroup_lag{cluster="d-use1-rp-eks-srsc-st-01"}
  ```

---

## 8. Troubleshooting Commands

* Check ServiceMonitors:

  ```bash
  kubectl get servicemonitor -A
  ```

* Inspect Prometheus Remote Queue:

  ```bash
  curl -sG 'http://localhost:9090/api/v1/query' \
       --data-urlencode 'query=prometheus_remote_storage_pending_samples' | jq '.data.result'
  ```

* Inspect operator logs for config errors:

  ```bash
  kubectl -n monitoring logs deploy/amp-agent-kube-prometheus-operator | grep -i error
  ```

* AMP reachability test:

  ```bash
  kubectl run netcheck --rm -it --restart=Never --image=curlimages/curl -- curl -s -o /dev/null -w '%{http_code}\n' https://aps-workspaces.us-east-1.amazonaws.com/workspaces/ws-16154fd8-5a2f-43af-9f6a-bd86dbbf0363/api/v1/status
  ```
