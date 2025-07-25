# Authenticating AKS with AWS Managed Prometheus (AMP) using OIDC

This guide provides step-by-step instructions to securely configure an Azure Kubernetes Service (AKS) cluster to send metrics to an AWS Managed Service for Prometheus (AMP) workspace. It uses the recommended OIDC federation method, which avoids static credentials.

### Prerequisites

  * An active Azure subscription with an AKS cluster.
  * An active AWS account with an AMP workspace.
  * `az` (Azure CLI) installed and configured.
  * `kubectl` installed and configured to connect to your AKS cluster.

-----

### Step 1: Configure AKS and Get the OIDC Issuer URL

First, enable both the OIDC issuer and workload identity on your AKS cluster and retrieve its public URL.

1.  **Enable OIDC Issuer and Workload Identity:**

    ```bash
    az aks update --name <MyAKSCluster> --resource-group <MyResourceGroup> --enable-oidc-issuer --enable-workload-identity
    ```

2.  **Get the Issuer URL:** Copy this URL for the next steps.

    ```bash
    az aks show --name <MyAKSCluster> --resource-group <MyResourceGroup> --query "oidcIssuerProfile.issuerUrl" -o tsv
    ```

3.  **Verify Workload Identity is Enabled:**

    Check for the workload identity webhook pods:
    ```bash
    kubectl get pods -n kube-system | grep azure-wi-webhook
    ```

    You should see pods with names like `azure-wi-webhook-controller-manager-xxxx-xxxxx`.

    Also verify the mutating webhook configuration:
    ```bash
    kubectl get mutatingwebhookconfigurations | grep azure-wi-webhook
    ```

-----

### Step 2: Create the IAM OIDC Provider and Role in AWS

Configure AWS to trust your AKS cluster and create a role with specific permissions.

1.  **Create an IAM OIDC Provider:**

    **Option A: Using AWS Console**
      * In the AWS IAM Console, go to **Identity providers** and click **Add provider**.
      * **Provider type**: `OpenID Connect`.
      * **Provider URL**: Paste the AKS issuer URL from Step 1.
      * **Audience**: Enter exactly `sts.amazonaws.com`.
      * Click **Get thumbprint** and **Add provider**.

    **Option B: Using AWS CLI**
    ```bash
    # Extract the host from your AKS issuer URL (remove https:// and trailing path)
    ISSUER_HOST=$(echo "<your-aks-issuer-url>" | sed 's|https://||' | sed 's|/.*||')

    # Get the thumbprint
    THUMBPRINT=$(echo | openssl s_client -servername $ISSUER_HOST -connect $ISSUER_HOST:443 2>/dev/null | openssl x509 -fingerprint -noout -sha1 | sed 's/://g' | sed 's/.*=//')

    # Create the OIDC provider
    aws iam create-open-id-connect-provider \
      --url "<your-aks-issuer-url>" \
      --client-id-list "sts.amazonaws.com" \
      --thumbprint-list $THUMBPRINT
    ```

    **If thumbprint auto-retrieval fails**, manually get it:
    ```bash
    # Replace <issuer-host> with your AKS issuer hostname
    echo | openssl s_client -servername <issuer-host> -connect <issuer-host>:443 2>/dev/null | openssl x509 -fingerprint -noout -sha1 | sed 's/://g' | sed 's/.*=//'
    ```

2.  **Create an IAM Role:**

      * In the IAM Console, go to **Roles** and click **Create role**.
      * **Trusted entity type**: `Web identity`.
      * **Identity provider**: Choose the OIDC provider you just created.
      * **Audience**: Select `sts.amazonaws.com`.
      * **Permissions Policy**: Create a new policy with the following JSON, which allows writing to your AMP workspace.
        ```json
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": "aps:RemoteWrite",
                    "Resource": "arn:aws:aps:<aws-region>:<aws-account-id>:workspace/<workspace-id>"
                }
            ]
        }
        ```
      * **Trust Policy**: After creating the role, edit its trust policy to restrict it to a specific Kubernetes service account. This is a critical security step.
        ```json
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "Federated": "arn:aws:iam::<aws-account-id>:oidc-provider/<issuer-url-path>"
                    },
                    "Action": "sts:AssumeRoleWithWebIdentity",
                    "Condition": {
                        "StringEquals": {
                            "<issuer-url-without-https>/:sub": "system:serviceaccount:<MyNamespace>:<MyServiceAccountName>"
                        }
                    }
                }
            ]
        }
        ```
      * Give the role a name (e.g., `AKS-Prometheus-AMP-Role`) and **copy its ARN**.

3.  **Validate the OIDC Provider was created correctly:**
    ```bash
    # List OIDC providers to verify creation
    aws iam list-open-id-connect-providers

    # Get details of your specific provider
    aws iam get-open-id-connect-provider --open-id-connect-provider-arn "arn:aws:iam::<account-id>:oidc-provider/<issuer-host>"

    # Verify the thumbprint matches
    aws iam get-open-id-connect-provider --open-id-connect-provider-arn "arn:aws:iam::<account-id>:oidc-provider/<issuer-host>" --query "ThumbprintList"
    ```

-----

### Step 3: Configure Microsoft Entra ID for Federation

Create an Azure AD application and link it to your Kubernetes service account.

1.  **Create an AAD Application:**

    ```bash
    az ad app create --display-name "Prometheus-AMP-Federation"
    ```

2.  **Get the Application's Object ID:**

    ```bash
    az ad app show --id "Prometheus-AMP-Federation" --query "id" -o tsv
    ```

    Copy the **Object ID** from the output.

3.  **Create a `credential.json` file:**

    ```json
    {
        "name": "aks-prometheus-federation",
        "issuer": "https://<your-aks-issuer-url-from-step-1>/",
        "subject": "system:serviceaccount:<MyNamespace>:<MyServiceAccountName>",
        "audiences": [
            "api://AzureADTokenExchange"
        ]
    }
    ```

4.  **Create the Federated Credential:**

    ```bash
    az ad app federated-credential create --id <your-app-object-id> --parameters credential.json
    ```

-----

### Step 4: Create and Annotate the Kubernetes Service Account

Deploy a service account in AKS that your Prometheus pod will use.

1.  **Get the AAD Application's Client ID:**

    ```bash
    az ad app show --id "Prometheus-AMP-Federation" --query "appId" -o tsv
    ```

2.  **Create a `prometheus-sa.yaml` file:**

    ```yaml
    apiVersion: v1
    kind: ServiceAccount
    metadata:
      name: <MyServiceAccountName> # e.g., prometheus-sa
      namespace: <MyNamespace>       # e.g., monitoring
      labels:
        azure.workload.identity/use: "true"
      annotations:
        azure.workload.identity/client-id: <your-app-client-id>
    ```

3.  **Apply the manifest:**

    ```bash
    kubectl apply -f prometheus-sa.yaml
    ```

4.  **Verify the service account was created correctly:**

    ```bash
    # Check if the service account exists with correct annotations and labels
    kubectl get serviceaccount <MyServiceAccountName> -n <MyNamespace> -o yaml

    # Verify the workload identity annotation is present
    kubectl get serviceaccount <MyServiceAccountName> -n <MyNamespace> -o jsonpath='{.metadata.annotations.azure\.workload\.identity/client-id}'

    # Verify the workload identity label is present
    kubectl get serviceaccount <MyServiceAccountName> -n <MyNamespace> -o jsonpath='{.metadata.labels.azure\.workload\.identity/use}'
    ```

-----

### Step 5: Configure and Deploy Prometheus

Finally, configure your Prometheus instance to use the service account and SigV4 authentication.

1.  **Update `prometheus.yml`:** In your Prometheus ConfigMap, configure the `remote_write` section.

    ```yaml
    remote_write:
      - url: "https://aps-workspaces.<aws-region>.amazonaws.com/workspaces/<workspace-id>/api/v1/remote_write"
        sigv4:
          region: <aws-region>
          role_arn: <your-iam-role-arn-from-step-2>
    ```

2.  **Update Prometheus Deployment:** Ensure your Prometheus `Deployment` or `StatefulSet` uses the service account.

    ```yaml
    # ...
    spec:
      template:
        spec:
          serviceAccountName: <MyServiceAccountName> # Must match the SA you created
          # ...
    ```

3.  **Deploy your Prometheus configuration.** Your metrics should now securely flow from AKS to AWS Managed Prometheus.

4.  **Check Prometheus logs for authentication issues:**

    ```bash
    # Get Prometheus pod name
    PROMETHEUS_POD=$(kubectl get pods -n <MyNamespace> -l app=prometheus -o jsonpath='{.items[0].metadata.name}')

    # View Prometheus logs for authentication errors
    kubectl logs $PROMETHEUS_POD -n <MyNamespace> | grep -i "remote_write\|sigv4\|auth\|error"

    # Check if workload identity environment variables are injected
    kubectl exec $PROMETHEUS_POD -n <MyNamespace> -- env | grep -E "AZURE_|AWS_"

    # Verify the Azure identity token file exists
    kubectl exec $PROMETHEUS_POD -n <MyNamespace> -- ls -la /var/run/secrets/azure/tokens/
    ```

-----

### Troubleshooting

If you encounter issues with the workload identity setup, follow these troubleshooting steps:

1.  **Verify workload identity is enabled on the cluster:**
    ```bash
    az aks show --resource-group <MyResourceGroup> --name <MyAKSCluster> --query "securityProfile.workloadIdentity" -o tsv
    ```

2.  **Check if both OIDC issuer and workload identity are enabled:**
    ```bash
    az aks show --resource-group <MyResourceGroup> --name <MyAKSCluster> --query "{oidcIssuer: oidcIssuerProfile.enabled, workloadIdentity: securityProfile.workloadIdentity.enabled}" -o table
    ```

3.  **If they're not enabled, update your cluster:**
    ```bash
    az aks update --resource-group <MyResourceGroup> --name <MyAKSCluster> --enable-oidc-issuer --enable-workload-identity
    ```

4.  **Verify the OIDC issuer URL is correct:**
    ```bash
    az aks show --resource-group <MyResourceGroup> --name <MyAKSCluster> --query "oidcIssuerProfile.issuerUrl" -o tsv
    ```
    This should return a URL like `https://oidc.prod-aks.azure.com/<cluster-id>/`.

-----

### Testing the Configuration

To manually test the OIDC federation and AWS role assumption from within a pod:

1.  **Set up environment variables inside your pod:**
    ```bash
    export AWS_ROLE_ARN="arn:aws:iam::<aws-account-id>:role/AKS-Prometheus-AMP-Role"
    export AWS_WEB_IDENTITY_TOKEN_FILE="/var/run/secrets/azure/tokens/azure-identity-token"
    export AWS_DEFAULT_REGION="<aws-region>"
    ```

2.  **Assume the role and get temporary credentials:**
    ```bash
    TEMP_CREDS=$(aws sts assume-role-with-web-identity \
      --role-arn "$AWS_ROLE_ARN" \
      --role-session-name "aks-to-amp-test" \
      --web-identity-token "file://$AWS_WEB_IDENTITY_TOKEN_FILE" \
      --duration-seconds 3600 \
      --output json)
    ```

3.  **Extract and use the credentials:**
    ```bash
    export AWS_ACCESS_KEY_ID=$(echo $TEMP_CREDS | jq -r '.Credentials.AccessKeyId')
    export AWS_SECRET_ACCESS_KEY=$(echo $TEMP_CREDS | jq -r '.Credentials.SecretAccessKey')
    export AWS_SESSION_TOKEN=$(echo $TEMP_CREDS | jq -r '.Credentials.SessionToken')
    ```

4.  **Test access to AMP workspace:**
    ```bash
    awscurl --service aps \
      --region <aws-region> \
      "https://aps-workspaces.<aws-region>.amazonaws.com/workspaces/<workspace-id>/api/v1/labels"
    ```

-----

### Common Issues

**Issue: Token file not found**
- **Error**: `open /var/run/secrets/azure/tokens/azure-identity-token: no such file or directory`
- **Solution**: Ensure the service account has the `azure.workload.identity/use: "true"` label and the pod is using the correct service account

**Issue: Permission denied from AWS**
- **Error**: `403 Forbidden` or `Access Denied` when writing to AMP
- **Solutions**:
  - Verify the IAM role has the correct `aps:RemoteWrite` permission
  - Check the trust policy condition matches your service account exactly
  - Ensure the workspace ID in the policy matches your AMP workspace

**Issue: Webhook not injecting environment variables**
- **Symptoms**: Missing `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, or token file
- **Solutions**:
  - Verify workload identity webhook pods are running: `kubectl get pods -n kube-system | grep azure-wi-webhook`
  - Check service account has correct annotation and label
  - Restart the pod to trigger webhook injection

**Issue: OIDC provider thumbprint mismatch**
- **Error**: `Invalid identity token`
- **Solution**: Update the OIDC provider thumbprint using the manual method above

**Issue: Federated credential subject mismatch**
- **Error**: `AADSTS70021: No matching federated identity record found`
- **Solution**: Ensure the subject in `credential.json` exactly matches: `system:serviceaccount:<namespace>:<service-account-name>`

**Issue: Prometheus can't assume AWS role**
- **Error**: `An error occurred (InvalidIdentityToken) when calling the AssumeRoleWithWebIdentity operation`
- **Solutions**:
  - Verify the Azure identity token file exists and is readable
  - Check the AWS role ARN is correct in Prometheus configuration
  - Ensure the role's trust policy allows your specific service account
