# \#\# Authenticating AKS with AWS Managed Prometheus (AMP) using OIDC

This guide provides step-by-step instructions to securely configure an Azure Kubernetes Service (AKS) cluster to send metrics to an AWS Managed Service for Prometheus (AMP) workspace. It uses the recommended OIDC federation method, which avoids static credentials.

### \#\# Prerequisites

  * An active Azure subscription with an AKS cluster.
  * An active AWS account with an AMP workspace.
  * `az` (Azure CLI) installed and configured.
  * `kubectl` installed and configured to connect to your AKS cluster.

-----

### \#\# Step 1: Configure AKS and Get the OIDC Issuer URL

First, enable the OIDC issuer on your AKS cluster and retrieve its public URL.

1.  **Enable OIDC Issuer:**

    ```bash
    az aks update --name <MyAKSCluster> --resource-group <MyResourceGroup> --enable-oidc-issuer
    ```

2.  **Get the Issuer URL:** Copy this URL for the next steps.

    ```bash
    az aks show --name <MyAKSCluster> --resource-group <MyResourceGroup> --query "oidcIssuerProfile.issuerUrl" -o tsv
    ```

-----

### \#\# Step 2: Create the IAM OIDC Provider and Role in AWS

Configure AWS to trust your AKS cluster and create a role with specific permissions.

1.  **Create an IAM OIDC Provider:**

      * In the AWS IAM Console, go to **Identity providers** and click **Add provider**.
      * **Provider type**: `OpenID Connect`.
      * **Provider URL**: Paste the AKS issuer URL from Step 1.
      * **Audience**: Enter exactly `sts.amazonaws.com`.
      * Click **Get thumbprint** and **Add provider**.

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

-----

### \#\# Step 3: Configure Microsoft Entra ID for Federation

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

### \#\# Step 4: Create and Annotate the Kubernetes Service Account

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
      annotations:
        azure.workload.identity/client-id: <your-app-client-id>
    ```

3.  **Apply the manifest:**

    ```bash
    kubectl apply -f prometheus-sa.yaml
    ```

-----

### \#\# Step 5: Configure and Deploy Prometheus

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
