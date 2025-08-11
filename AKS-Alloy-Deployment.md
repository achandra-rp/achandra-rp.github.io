# Deploying Grafana Alloy on AKS with AWS Managed Prometheus Integration

This guide provides step-by-step instructions to deploy Grafana Alloy (OpenTelemetry collector) on an Azure Kubernetes Service (AKS) cluster that sends metrics to AWS Managed Prometheus (AMP). This guide assumes you have already deployed Prometheus on AKS with OIDC federation to AWS as documented in `AKS-AMP-OIDC-Config.md`.

## Prerequisites

- An AKS cluster with OIDC issuer and workload identity enabled
- Existing Prometheus deployment with AWS AMP integration working
- Azure CLI (`az`) installed and configured
- `kubectl` configured to connect to your AKS cluster
- `helm` installed
- Access to the same AWS account and AMP workspace used by Prometheus

## Overview

Grafana Alloy will be deployed as a DaemonSet to collect telemetry data from all nodes in your AKS cluster and forward metrics to your existing AWS Managed Prometheus workspace using the same OIDC federation mechanism.

---

## Step 1: Verify Prerequisites

First, verify your existing setup is working correctly.

### 1.1 Check AKS Configuration

```bash
# Verify OIDC issuer and workload identity are enabled
az aks show --resource-group <MyResourceGroup> --name <MyAKSCluster> \
  --query "{oidcIssuer: oidcIssuerProfile.enabled, workloadIdentity: securityProfile.workloadIdentity.enabled}" \
  -o table

# Get the OIDC issuer URL (save this for later steps)
export AKS_OIDC_ISSUER=$(az aks show --name <MyAKSCluster> --resource-group <MyResourceGroup> \
  --query "oidcIssuerProfile.issuerUrl" -o tsv)
echo "AKS OIDC Issuer: $AKS_OIDC_ISSUER"
```

### 1.2 Verify Existing Azure AD Application

```bash
# Get your existing Azure AD application details
export AZURE_APP_NAME="Prometheus-AMP-Federation"  # Adjust if different
export AZURE_CLIENT_ID=$(az ad app show --id "$AZURE_APP_NAME" --query "appId" -o tsv)
export AZURE_APP_OBJECT_ID=$(az ad app show --id "$AZURE_APP_NAME" --query "id" -o tsv)

echo "Azure Client ID: $AZURE_CLIENT_ID"
echo "Azure App Object ID: $AZURE_APP_OBJECT_ID"
```

### 1.3 Get AWS Configuration Details

```bash
# Set your AWS configuration (adjust these values)
export AWS_REGION="us-east-1"  # Your AWS region
export AWS_ACCOUNT_ID="123456789012"  # Your AWS account ID
export AMP_WORKSPACE_ID="ws-your-workspace-id"  # Your AMP workspace ID
export AWS_ROLE_NAME="AKS-Prometheus-AMP-Role"  # Your existing IAM role name

# Construct the role ARN
export AWS_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${AWS_ROLE_NAME}"
echo "AWS Role ARN: $AWS_ROLE_ARN"
```

---

## Step 2: Create Alloy Namespace and Service Account

### 2.1 Create Namespace

```bash
kubectl create namespace grafana-alloy
```

### 2.2 Create Service Account

```bash
# Create the service account with workload identity annotations
kubectl apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: grafana-alloy
  namespace: grafana-alloy
  labels:
    azure.workload.identity/use: "true"
  annotations:
    azure.workload.identity/client-id: ${AZURE_CLIENT_ID}
EOF
```

### 2.3 Verify Service Account Creation

```bash
# Verify the service account was created with correct annotations
kubectl get serviceaccount grafana-alloy -n grafana-alloy -o yaml

# Check for the workload identity annotation
kubectl get serviceaccount grafana-alloy -n grafana-alloy \
  -o jsonpath='{.metadata.annotations.azure\.workload\.identity/client-id}'
```

---

## Step 3: Update Azure AD Federated Credentials

Add Alloy's service account to your existing Azure AD application federation.

### 3.1 Create Federated Credential Configuration

```bash
# Create the federated credential JSON for Alloy
cat > alloy-federated-credential.json <<EOF
{
    "name": "aks-alloy-federation",
    "issuer": "${AKS_OIDC_ISSUER}",
    "subject": "system:serviceaccount:grafana-alloy:grafana-alloy",
    "audiences": [
        "api://AzureADTokenExchange"
    ]
}
EOF
```

### 3.2 Add Federated Credential to Azure AD App

```bash
# Add the federated credential to your existing Azure AD application
az ad app federated-credential create \
  --id ${AZURE_APP_OBJECT_ID} \
  --parameters alloy-federated-credential.json

# Verify the federated credential was created
az ad app federated-credential list --id ${AZURE_APP_OBJECT_ID} \
  --query "[?name=='aks-alloy-federation']" -o table
```

---

## Step 4: Update AWS IAM Role Trust Policy

Modify your existing AWS IAM role to trust both Prometheus and Alloy service accounts.

### 4.1 Get Current Trust Policy

```bash
# Get the current trust policy
aws iam get-role --role-name ${AWS_ROLE_NAME} \
  --query "Role.AssumeRolePolicyDocument" > current-trust-policy.json

# Display current trust policy for reference
cat current-trust-policy.json
```

### 4.2 Create Updated Trust Policy

```bash
# Extract OIDC provider path from issuer URL
OIDC_PROVIDER_PATH=$(echo ${AKS_OIDC_ISSUER} | sed 's|https://||')

# Create updated trust policy with both service accounts
cat > updated-trust-policy.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/${OIDC_PROVIDER_PATH}"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "${OIDC_PROVIDER_PATH}:sub": [
                        "system:serviceaccount:monitoring:prometheus-sa",
                        "system:serviceaccount:grafana-alloy:grafana-alloy"
                    ],
                    "${OIDC_PROVIDER_PATH}:aud": "sts.amazonaws.com"
                }
            }
        }
    ]
}
EOF
```

**Note**: Adjust the first service account path (`system:serviceaccount:monitoring:prometheus-sa`) to match your actual Prometheus namespace and service account name.

### 4.3 Update the IAM Role

```bash
# Update the trust policy
aws iam update-assume-role-policy \
  --role-name ${AWS_ROLE_NAME} \
  --policy-document file://updated-trust-policy.json

# Verify the trust policy was updated
aws iam get-role --role-name ${AWS_ROLE_NAME} \
  --query "Role.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals"
```

---

## Step 5: Create Alloy Configuration

### 5.1 Create Alloy Configuration File

```bash
cat > alloy-config.alloy <<EOF
// OpenTelemetry receiver for logs, metrics, and traces
otelcol.receiver.otlp "default" {
  grpc {
    endpoint = "0.0.0.0:4317"
  }
  http {
    endpoint = "0.0.0.0:4318"
  }
  output {
    logs    = [otelcol.processor.batch.logs.input]
    metrics = [otelcol.processor.batch.metrics.input]
    traces  = [otelcol.processor.batch.traces.input]
  }
}

// Batch processor for better performance
otelcol.processor.batch "logs" {
  output {
    logs = [otelcol.exporter.logging.logs.input]
  }
}

otelcol.processor.batch "metrics" {
  output {
    metrics = [otelcol.exporter.prometheus.metrics.input]
  }
}

otelcol.processor.batch "traces" {
  output {
    traces = [otelcol.exporter.logging.traces.input]
  }
}

// Export metrics to AWS Managed Prometheus
otelcol.exporter.prometheus "metrics" {
  forward_to = [prometheus.remote_write.amp.receiver]
}

// Configure remote write to AWS Managed Prometheus
prometheus.remote_write "amp" {
  endpoint {
    url = "https://aps-workspaces.${AWS_REGION}.amazonaws.com/workspaces/${AMP_WORKSPACE_ID}/api/v1/remote_write"
    sigv4 {
      region   = "${AWS_REGION}"
      role_arn = "${AWS_ROLE_ARN}"
    }
  }
}

// Logging exporters for debugging
otelcol.exporter.logging "logs" {
  verbosity           = "basic"
  sampling_initial    = 2
  sampling_thereafter = 500
}

otelcol.exporter.logging "traces" {
  verbosity           = "basic"
  sampling_initial    = 2
  sampling_thereafter = 500
}

// Kubernetes service discovery for scraping metrics
discovery.kubernetes "pods" {
  role = "pod"
}

discovery.kubernetes "services" {
  role = "service"
}

discovery.kubernetes "endpoints" {
  role = "endpoints"
}

// Scrape metrics from discovered targets
prometheus.scrape "kubernetes_pods" {
  targets    = discovery.kubernetes.pods.targets
  forward_to = [prometheus.remote_write.amp.receiver]

  scrape_interval = "30s"
  scrape_timeout  = "10s"
}

prometheus.scrape "kubernetes_services" {
  targets    = discovery.kubernetes.services.targets
  forward_to = [prometheus.remote_write.amp.receiver]

  scrape_interval = "30s"
  scrape_timeout  = "10s"
}
EOF
```

### 5.2 Create ConfigMap

```bash
# Create ConfigMap with Alloy configuration
kubectl create configmap grafana-alloy-config \
  --from-file=config.alloy=alloy-config.alloy \
  -n grafana-alloy
```

---

## Step 6: Create Alloy Helm Values

### 6.1 Create Helm Values File

```bash
cat > alloy-values.yaml <<EOF
# Alloy configuration
alloy:
  configMap:
    create: false
    name: grafana-alloy-config
    key: config.alloy

# Deploy as DaemonSet to collect from all nodes
controller:
  type: daemonset
  
  # Resource requests and limits
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 500m
      memory: 512Mi

  # Security context
  securityContext:
    runAsUser: 472
    runAsGroup: 472
    fsGroup: 472

  # Tolerations to run on all nodes including master/control plane
  tolerations:
    - operator: Exists

  # Node selector (optional)
  nodeSelector: {}

  # Host networking for better node visibility
  hostNetwork: false
  
  # Volumes for logs and container runtime
  extraVolumes:
    - name: varlog
      hostPath:
        path: /var/log
    - name: varlibdockercontainers
      hostPath:
        path: /var/lib/docker/containers

  extraVolumeMounts:
    - name: varlog
      mountPath: /var/log
      readOnly: true
    - name: varlibdockercontainers
      mountPath: /var/lib/docker/containers
      readOnly: true

# Use existing service account
serviceAccount:
  create: false
  name: grafana-alloy

# Service configuration
service:
  enabled: true
  type: ClusterIP
  ports:
    http:
      port: 12345
      targetPort: 12345
      protocol: TCP
    otlp-grpc:
      port: 4317
      targetPort: 4317
      protocol: TCP
    otlp-http:
      port: 4318
      targetPort: 4318
      protocol: TCP

# Enable collection capabilities
logs:
  enabled: true
traces:
  enabled: true

# Ingress (disabled by default)
ingress:
  enabled: false

# RBAC permissions for Kubernetes service discovery
rbac:
  create: true

# Cluster role for accessing Kubernetes resources
clusterRole:
  create: true
  rules:
    - apiGroups: [""]
      resources:
        - nodes
        - nodes/proxy
        - nodes/metrics
        - services
        - endpoints
        - pods
        - ingresses
        - configmaps
      verbs: ["get", "list", "watch"]
    - apiGroups: ["extensions", "networking.k8s.io"]
      resources:
        - ingresses
      verbs: ["get", "list", "watch"]
    - apiGroups: ["apps"]
      resources:
        - deployments
        - daemonsets
        - replicasets
        - statefulsets
      verbs: ["get", "list", "watch"]
    - nonResourceURLs: ["/metrics", "/metrics/cadvisor"]
      verbs: ["get"]
EOF
```

---

## Step 7: Deploy Alloy

### 7.1 Add Grafana Helm Repository

```bash
# Add Grafana Helm repository
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
```

### 7.2 Deploy Alloy

```bash
# Deploy Alloy using Helm
helm install grafana-alloy grafana/alloy \
  --namespace grafana-alloy \
  --values alloy-values.yaml \
  --wait
```

### 7.3 Verify Deployment

```bash
# Check if Alloy DaemonSet is running
kubectl get daemonset -n grafana-alloy

# Check pod status
kubectl get pods -n grafana-alloy -o wide

# Check if all nodes have Alloy pods
kubectl get nodes
kubectl get pods -n grafana-alloy -o wide | grep -c Running
```

---

## Step 8: Verify Configuration and Connectivity

### 8.1 Check Workload Identity Integration

```bash
# Get a running Alloy pod name
ALLOY_POD=$(kubectl get pods -n grafana-alloy -l app.kubernetes.io/name=alloy -o jsonpath='{.items[0].metadata.name}')

# Check if Azure workload identity environment variables are injected
kubectl exec -n grafana-alloy $ALLOY_POD -- env | grep -E "AZURE_|AWS_"

# Verify the Azure identity token file exists
kubectl exec -n grafana-alloy $ALLOY_POD -- ls -la /var/run/secrets/azure/tokens/

# Check if the token file contains a valid JWT
kubectl exec -n grafana-alloy $ALLOY_POD -- cat /var/run/secrets/azure/tokens/azure-identity-token | cut -d. -f2 | base64 -d 2>/dev/null | jq . || echo "Token format check failed"
```

### 8.2 Check Alloy Logs

```bash
# Check Alloy startup logs
kubectl logs -n grafana-alloy $ALLOY_POD | head -50

# Check for authentication and remote write errors
kubectl logs -n grafana-alloy $ALLOY_POD | grep -i -E "error|warn|auth|remote_write|sigv4"

# Follow logs in real-time
kubectl logs -n grafana-alloy $ALLOY_POD -f
```

### 8.3 Test AWS Role Assumption

```bash
# Test role assumption from within the Alloy pod
kubectl exec -n grafana-alloy $ALLOY_POD -- sh -c '
export AWS_ROLE_ARN="'${AWS_ROLE_ARN}'"
export AWS_WEB_IDENTITY_TOKEN_FILE="/var/run/secrets/azure/tokens/azure-identity-token"
export AWS_DEFAULT_REGION="'${AWS_REGION}'"

# Install AWS CLI if not present (for testing only)
if ! command -v aws &> /dev/null; then
    echo "AWS CLI not found in container, role assumption test skipped"
    exit 0
fi

# Test role assumption
aws sts assume-role-with-web-identity \
  --role-arn "$AWS_ROLE_ARN" \
  --role-session-name "alloy-test" \
  --web-identity-token "file://$AWS_WEB_IDENTITY_TOKEN_FILE" \
  --duration-seconds 3600 \
  --query "Credentials.AccessKeyId" \
  --output text
'
```

---

## Step 9: Monitoring and Validation

### 9.1 Check Alloy Health Endpoint

```bash
# Port forward to access Alloy's health endpoint
kubectl port-forward -n grafana-alloy $ALLOY_POD 12345:12345 &
PORT_FORWARD_PID=$!

# Check health endpoint
curl -s http://localhost:12345/-/healthy || echo "Health check failed"

# Check configuration endpoint
curl -s http://localhost:12345/-/config | head -20

# Stop port forwarding
kill $PORT_FORWARD_PID 2>/dev/null || true
```

### 9.2 Verify Metrics in AWS Managed Prometheus

```bash
# Query AWS Managed Prometheus to verify metrics are being received
# You can use awscurl or the AWS Console

# Example query using AWS CLI (if you have awscurl installed)
# awscurl --service aps --region ${AWS_REGION} \
#   "https://aps-workspaces.${AWS_REGION}.amazonaws.com/workspaces/${AMP_WORKSPACE_ID}/api/v1/label/__name__/values"
```

### 9.3 Create Monitoring Dashboard

You can create a simple monitoring job to check Alloy status:

```bash
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: CronJob
metadata:
  name: alloy-health-check
  namespace: grafana-alloy
spec:
  schedule: "*/5 * * * *"  # Every 5 minutes
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: grafana-alloy
          containers:
          - name: health-check
            image: curlimages/curl:latest
            command:
            - /bin/sh
            - -c
            - |
              ALLOY_POD=\$(kubectl get pods -n grafana-alloy -l app.kubernetes.io/name=alloy -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
              if [ -n "\$ALLOY_POD" ]; then
                kubectl exec -n grafana-alloy \$ALLOY_POD -- curl -s http://localhost:12345/-/healthy >/dev/null
                if [ \$? -eq 0 ]; then
                  echo "Alloy health check: PASSED"
                else
                  echo "Alloy health check: FAILED"
                fi
              else
                echo "No Alloy pods found"
              fi
          restartPolicy: OnFailure
EOF
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue: Alloy pods not starting
**Symptoms**: Pods stuck in `Pending` or `CrashLoopBackOff` state

**Solutions**:
```bash
# Check pod events
kubectl describe pod -n grafana-alloy $ALLOY_POD

# Check node resources
kubectl top nodes

# Check for resource constraints
kubectl get pods -n grafana-alloy -o yaml | grep -A 10 resources
```

#### Issue: Workload Identity not working
**Symptoms**: Missing Azure environment variables or token file

**Solutions**:
```bash
# Verify workload identity webhook is running
kubectl get pods -n kube-system | grep azure-wi-webhook

# Check service account annotations
kubectl get serviceaccount grafana-alloy -n grafana-alloy -o yaml

# Restart pods to trigger webhook injection
kubectl rollout restart daemonset/grafana-alloy -n grafana-alloy
```

#### Issue: AWS authentication failures
**Symptoms**: 403 errors or "Access Denied" in logs

**Solutions**:
```bash
# Verify AWS role trust policy
aws iam get-role --role-name ${AWS_ROLE_NAME} --query "Role.AssumeRolePolicyDocument"

# Check AMP workspace permissions
aws aps describe-workspace --workspace-id ${AMP_WORKSPACE_ID}

# Verify role has APS permissions
aws iam list-attached-role-policies --role-name ${AWS_ROLE_NAME}
```

#### Issue: No metrics appearing in AMP
**Symptoms**: Alloy running but no data in AWS Managed Prometheus

**Solutions**:
```bash
# Check Alloy configuration
kubectl exec -n grafana-alloy $ALLOY_POD -- curl -s http://localhost:12345/-/config | grep -A 10 remote_write

# Check for remote write errors
kubectl logs -n grafana-alloy $ALLOY_POD | grep remote_write

# Verify network connectivity
kubectl exec -n grafana-alloy $ALLOY_POD -- nslookup aps-workspaces.${AWS_REGION}.amazonaws.com
```

---

## Cleanup

To remove the Alloy deployment:

```bash
# Remove Helm deployment
helm uninstall grafana-alloy -n grafana-alloy

# Remove namespace
kubectl delete namespace grafana-alloy

# Remove federated credential from Azure AD (optional)
az ad app federated-credential delete \
  --id ${AZURE_APP_OBJECT_ID} \
  --federated-credential-id $(az ad app federated-credential list --id ${AZURE_APP_OBJECT_ID} --query "[?name=='aks-alloy-federation'].id" -o tsv)

# Remove Alloy service account from AWS IAM trust policy (update trust policy to remove the Alloy service account)
```

---

## Additional Configuration Options

### Custom Metric Collection

You can modify the Alloy configuration to collect specific metrics:

```bash
# Update the ConfigMap with custom configuration
kubectl create configmap grafana-alloy-config \
  --from-file=config.alloy=your-custom-config.alloy \
  -n grafana-alloy \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart DaemonSet to pick up new configuration
kubectl rollout restart daemonset/grafana-alloy -n grafana-alloy
```

### Resource Limits Tuning

Adjust resource limits based on your cluster size:

```bash
# For larger clusters, update resource limits in alloy-values.yaml
# Then upgrade the Helm deployment
helm upgrade grafana-alloy grafana/alloy \
  --namespace grafana-alloy \
  --values alloy-values-updated.yaml
```

---

This completes the deployment of Grafana Alloy on AKS with AWS Managed Prometheus integration. The setup leverages your existing OIDC federation and provides a robust telemetry collection solution.
