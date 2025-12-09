import DocPage from '../components/DocPage';

const AksAmpOidcConfig = () => {
  return (
    <DocPage title="Authenticating AKS with AWS Managed Prometheus using OIDC">
      <p>This guide provides step-by-step instructions to securely configure an Azure Kubernetes Service (AKS) cluster to send metrics to an AWS Managed Service for Prometheus (AMP) workspace. It uses the recommended OIDC federation method, which avoids static credentials.</p>

      <h3>Prerequisites</h3>
      <ul>
        <li>An active Azure subscription with an AKS cluster.</li>
        <li>An active AWS account with an AMP workspace.</li>
        <li><code>az</code> (Azure CLI) installed and configured.</li>
        <li><code>kubectl</code> installed and configured to connect to your AKS cluster.</li>
      </ul>

      <h3>Step 1: Configure AKS and Get the OIDC Issuer URL</h3>
      <p>First, enable both the OIDC issuer and workload identity on your AKS cluster and retrieve its public URL.</p>

      <p><strong>1. Enable OIDC Issuer and Workload Identity:</strong></p>
      <pre><code>{`az aks update --name <MyAKSCluster> --resource-group <MyResourceGroup> --enable-oidc-issuer --enable-workload-identity`}</code></pre>

      <p><strong>2. Get the Issuer URL:</strong> Copy this URL for the next steps.</p>
      <pre><code>{`az aks show --name <MyAKSCluster> --resource-group <MyResourceGroup> --query "oidcIssuerProfile.issuerUrl" -o tsv`}</code></pre>

      <p><strong>3. Verify Workload Identity is Enabled:</strong></p>
      <p>Check for the workload identity webhook pods:</p>
      <pre><code>kubectl get pods -n kube-system | grep azure-wi-webhook</code></pre>
      <p>You should see pods with names like <code>azure-wi-webhook-controller-manager-xxxx-xxxxx</code>.</p>
      <p>Also verify the mutating webhook configuration:</p>
      <pre><code>kubectl get mutatingwebhookconfigurations | grep azure-wi-webhook</code></pre>

      <h3>Step 2: Create the IAM OIDC Provider and Role in AWS</h3>
      <p>Configure AWS to trust your AKS cluster and create a role with specific permissions.</p>

      <p><strong>1. Create an IAM OIDC Provider:</strong></p>
      <p><strong>Option A: Using AWS Console</strong></p>
      <ul>
        <li>In the AWS IAM Console, go to <strong>Identity providers</strong> and click <strong>Add provider</strong>.</li>
        <li><strong>Provider type</strong>: <code>OpenID Connect</code>.</li>
        <li><strong>Provider URL</strong>: Paste the AKS issuer URL from Step 1.</li>
        <li><strong>Audience</strong>: Enter exactly <code>sts.amazonaws.com</code>.</li>
        <li>Click <strong>Get thumbprint</strong> and <strong>Add provider</strong>.</li>
      </ul>

      <p><strong>Option B: Using AWS CLI</strong></p>
      <pre><code>{`# Extract the host from your AKS issuer URL (remove https:// and trailing path)
ISSUER_HOST=$(echo "<your-aks-issuer-url>" | sed 's|https://||' | sed 's|/.*||')

# Get the thumbprint
THUMBPRINT=$(echo | openssl s_client -servername $ISSUER_HOST -connect $ISSUER_HOST:443 2>/dev/null | openssl x509 -fingerprint -noout -sha1 | sed 's/://g' | sed 's/.*=//')

# Create the OIDC provider
aws iam create-open-id-connect-provider \\
  --url "<your-aks-issuer-url>" \\
  --client-id-list "sts.amazonaws.com" \\
  --thumbprint-list $THUMBPRINT`}</code></pre>

      <p><strong>If thumbprint auto-retrieval fails</strong>, manually get it:</p>
      <pre><code>{`# Replace <issuer-host> with your AKS issuer hostname
echo | openssl s_client -servername <issuer-host> -connect <issuer-host>:443 2>/dev/null | openssl x509 -fingerprint -noout -sha1 | sed 's/://g' | sed 's/.*=//'`}</code></pre>

      <p><strong>2. Create an IAM Role:</strong></p>
      <ul>
        <li>In the IAM Console, go to <strong>Roles</strong> and click <strong>Create role</strong>.</li>
        <li><strong>Trusted entity type</strong>: <code>Web identity</code>.</li>
        <li><strong>Identity provider</strong>: Choose the OIDC provider you just created.</li>
        <li><strong>Audience</strong>: Select <code>sts.amazonaws.com</code>.</li>
        <li><strong>Permissions Policy</strong>: Create a new policy with the following JSON, which allows writing to your AMP workspace.</li>
      </ul>
      <pre><code>{`{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "aps:RemoteWrite",
            "Resource": "arn:aws:aps:<aws-region>:<aws-account-id>:workspace/<workspace-id>"
        }
    ]
}`}</code></pre>

      <ul>
        <li><strong>Trust Policy</strong>: After creating the role, edit its trust policy to restrict it to a specific Kubernetes service account. This is a critical security step.</li>
      </ul>
      <pre><code>{`{
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
}`}</code></pre>

      <ul>
        <li>Give the role a name (e.g., <code>AKS-Prometheus-AMP-Role</code>) and <strong>copy its ARN</strong>.</li>
      </ul>

      <p><strong>3. Validate the OIDC Provider was created correctly:</strong></p>
      <pre><code>{`# List OIDC providers to verify creation
aws iam list-open-id-connect-providers

# Get details of your specific provider
aws iam get-open-id-connect-provider --open-id-connect-provider-arn "arn:aws:iam::<account-id>:oidc-provider/<issuer-host>"

# Verify the thumbprint matches
aws iam get-open-id-connect-provider --open-id-connect-provider-arn "arn:aws:iam::<account-id>:oidc-provider/<issuer-host>" --query "ThumbprintList"`}</code></pre>

      <h3>Step 3: Configure Microsoft Entra ID for Federation</h3>
      <p>Create an Azure AD application and link it to your Kubernetes service account.</p>

      <p><strong>1. Create an AAD Application:</strong></p>
      <pre><code>az ad app create --display-name "Prometheus-AMP-Federation"</code></pre>

      <p><strong>2. Get the Application's Object ID:</strong></p>
      <pre><code>{`az ad app show --id "Prometheus-AMP-Federation" --query "id" -o tsv`}</code></pre>
      <p>Copy the <strong>Object ID</strong> from the output.</p>

      <p><strong>3. Create a <code>credential.json</code> file:</strong></p>
      <pre><code>{`{
    "name": "aks-prometheus-federation",
    "issuer": "https://<your-aks-issuer-url-from-step-1>/",
    "subject": "system:serviceaccount:<MyNamespace>:<MyServiceAccountName>",
    "audiences": [
        "api://AzureADTokenExchange"
    ]
}`}</code></pre>

      <p><strong>4. Create the Federated Credential:</strong></p>
      <pre><code>az ad app federated-credential create --id &lt;your-app-object-id&gt; --parameters credential.json</code></pre>

      <h3>Step 4: Create and Annotate the Kubernetes Service Account</h3>
      <p>Deploy a service account in AKS that your Prometheus pod will use.</p>

      <p><strong>1. Get the AAD Application's Client ID:</strong></p>
      <pre><code>{`az ad app show --id "Prometheus-AMP-Federation" --query "appId" -o tsv`}</code></pre>

      <p><strong>2. Create a <code>prometheus-sa.yaml</code> file:</strong></p>
      <pre><code>{`apiVersion: v1
kind: ServiceAccount
metadata:
  name: <MyServiceAccountName> # e.g., prometheus-sa
  namespace: <MyNamespace>       # e.g., monitoring
  labels:
    azure.workload.identity/use: "true"
  annotations:
    azure.workload.identity/client-id: <your-app-client-id>`}</code></pre>

      <p><strong>3. Apply the manifest:</strong></p>
      <pre><code>kubectl apply -f prometheus-sa.yaml</code></pre>

      <p><strong>4. Verify the service account was created correctly:</strong></p>
      <pre><code>{`# Check if the service account exists with correct annotations and labels
kubectl get serviceaccount <MyServiceAccountName> -n <MyNamespace> -o yaml

# Verify the workload identity annotation is present
kubectl get serviceaccount <MyServiceAccountName> -n <MyNamespace> -o jsonpath='{.metadata.annotations.azure\\.workload\\.identity/client-id}'

# Verify the workload identity label is present
kubectl get serviceaccount <MyServiceAccountName> -n <MyNamespace> -o jsonpath='{.metadata.labels.azure\\.workload\\.identity/use}'`}</code></pre>

      <h3>Step 5: Configure and Deploy Prometheus</h3>
      <p>Finally, configure your Prometheus instance to use the service account and SigV4 authentication.</p>

      <p><strong>1. Update <code>prometheus.yml</code>:</strong> In your Prometheus ConfigMap, configure the <code>remote_write</code> section.</p>
      <pre><code>{`remote_write:
  - url: "https://aps-workspaces.<aws-region>.amazonaws.com/workspaces/<workspace-id>/api/v1/remote_write"
    sigv4:
      region: <aws-region>
      role_arn: <your-iam-role-arn-from-step-2>`}</code></pre>

      <p><strong>2. Update Prometheus Deployment:</strong> Ensure your Prometheus <code>Deployment</code> or <code>StatefulSet</code> uses the service account.</p>
      <pre><code>{`# ...
spec:
  template:
    spec:
      serviceAccountName: <MyServiceAccountName> # Must match the SA you created
      # ...`}</code></pre>

      <p><strong>3. Deploy your Prometheus configuration.</strong> Your metrics should now securely flow from AKS to AWS Managed Prometheus.</p>

      <p><strong>4. Check Prometheus logs for authentication issues:</strong></p>
      <pre><code>{`# Get Prometheus pod name
PROMETHEUS_POD=$(kubectl get pods -n <MyNamespace> -l app=prometheus -o jsonpath='{.items[0].metadata.name}')

# View Prometheus logs for authentication errors
kubectl logs $PROMETHEUS_POD -n <MyNamespace> | grep -i "remote_write|sigv4|auth|error"

# Check if workload identity environment variables are injected
kubectl exec $PROMETHEUS_POD -n <MyNamespace> -- env | grep -E "AZURE_|AWS_"

# Verify the Azure identity token file exists
kubectl exec $PROMETHEUS_POD -n <MyNamespace> -- ls -la /var/run/secrets/azure/tokens/`}</code></pre>

      <h3>Troubleshooting</h3>
      <p>If you encounter issues with the workload identity setup, follow these troubleshooting steps:</p>

      <p><strong>1. Verify workload identity is enabled on the cluster:</strong></p>
      <pre><code>{`az aks show --resource-group <MyResourceGroup> --name <MyAKSCluster> --query "securityProfile.workloadIdentity" -o tsv`}</code></pre>

      <p><strong>2. Check if both OIDC issuer and workload identity are enabled:</strong></p>
      <pre><code>{`az aks show --resource-group <MyResourceGroup> --name <MyAKSCluster> --query "{oidcIssuer: oidcIssuerProfile.enabled, workloadIdentity: securityProfile.workloadIdentity.enabled}" -o table`}</code></pre>

      <p><strong>3. If they're not enabled, update your cluster:</strong></p>
      <pre><code>{`az aks update --resource-group <MyResourceGroup> --name <MyAKSCluster> --enable-oidc-issuer --enable-workload-identity`}</code></pre>

      <p><strong>4. Verify the OIDC issuer URL is correct:</strong></p>
      <pre><code>{`az aks show --resource-group <MyResourceGroup> --name <MyAKSCluster> --query "oidcIssuerProfile.issuerUrl" -o tsv`}</code></pre>
      <p>This should return a URL like <code>https://oidc.prod-aks.azure.com/&lt;cluster-id&gt;/</code>.</p>

      <h3>Testing the Configuration</h3>
      <p>To manually test the OIDC federation and AWS role assumption from within a pod:</p>

      <p><strong>1. Set up environment variables inside your pod:</strong></p>
      <pre><code>{`export AWS_ROLE_ARN="arn:aws:iam::<aws-account-id>:role/AKS-Prometheus-AMP-Role"
export AWS_WEB_IDENTITY_TOKEN_FILE="/var/run/secrets/azure/tokens/azure-identity-token"
export AWS_DEFAULT_REGION="<aws-region>"`}</code></pre>

      <p><strong>2. Assume the role and get temporary credentials:</strong></p>
      <pre><code>{`TEMP_CREDS=$(aws sts assume-role-with-web-identity \\
  --role-arn "$AWS_ROLE_ARN" \\
  --role-session-name "aks-to-amp-test" \\
  --web-identity-token "file://$AWS_WEB_IDENTITY_TOKEN_FILE" \\
  --duration-seconds 3600 \\
  --output json)`}</code></pre>

      <p><strong>3. Extract and use the credentials:</strong></p>
      <pre><code>{`export AWS_ACCESS_KEY_ID=$(echo $TEMP_CREDS | jq -r '.Credentials.AccessKeyId')
export AWS_SECRET_ACCESS_KEY=$(echo $TEMP_CREDS | jq -r '.Credentials.SecretAccessKey')
export AWS_SESSION_TOKEN=$(echo $TEMP_CREDS | jq -r '.Credentials.SessionToken')`}</code></pre>

      <p><strong>4. Test access to AMP workspace:</strong></p>
      <pre><code>{`awscurl --service aps \\
  --region <aws-region> \\
  "https://aps-workspaces.<aws-region>.amazonaws.com/workspaces/<workspace-id>/api/v1/labels"`}</code></pre>

      <h3>Common Issues</h3>
      <p><strong>Issue: Token file not found</strong></p>
      <ul>
        <li><strong>Error</strong>: <code>open /var/run/secrets/azure/tokens/azure-identity-token: no such file or directory</code></li>
        <li><strong>Solution</strong>: Ensure the service account has the <code>azure.workload.identity/use: "true"</code> label and the pod is using the correct service account</li>
      </ul>

      <p><strong>Issue: Permission denied from AWS</strong></p>
      <ul>
        <li><strong>Error</strong>: <code>403 Forbidden</code> or <code>Access Denied</code> when writing to AMP</li>
        <li><strong>Solutions</strong>:
          <ul>
            <li>Verify the IAM role has the correct <code>aps:RemoteWrite</code> permission</li>
            <li>Check the trust policy condition matches your service account exactly</li>
            <li>Ensure the workspace ID in the policy matches your AMP workspace</li>
          </ul>
        </li>
      </ul>

      <p><strong>Issue: Webhook not injecting environment variables</strong></p>
      <ul>
        <li><strong>Symptoms</strong>: Missing <code>AZURE_CLIENT_ID</code>, <code>AZURE_TENANT_ID</code>, or token file</li>
        <li><strong>Solutions</strong>:
          <ul>
            <li>Verify workload identity webhook pods are running: <code>kubectl get pods -n kube-system | grep azure-wi-webhook</code></li>
            <li>Check service account has correct annotation and label</li>
            <li>Restart the pod to trigger webhook injection</li>
          </ul>
        </li>
      </ul>

      <p><strong>Issue: OIDC provider thumbprint mismatch</strong></p>
      <ul>
        <li><strong>Error</strong>: <code>Invalid identity token</code></li>
        <li><strong>Solution</strong>: Update the OIDC provider thumbprint using the manual method above</li>
      </ul>

      <p><strong>Issue: Federated credential subject mismatch</strong></p>
      <ul>
        <li><strong>Error</strong>: <code>AADSTS70021: No matching federated identity record found</code></li>
        <li><strong>Solution</strong>: Ensure the subject in <code>credential.json</code> exactly matches: <code>system:serviceaccount:&lt;namespace&gt;:&lt;service-account-name&gt;</code></li>
      </ul>

      <p><strong>Issue: Prometheus can't assume AWS role</strong></p>
      <ul>
        <li><strong>Error</strong>: <code>An error occurred (InvalidIdentityToken) when calling the AssumeRoleWithWebIdentity operation</code></li>
        <li><strong>Solutions</strong>:
          <ul>
            <li>Verify the Azure identity token file exists and is readable</li>
            <li>Check the AWS role ARN is correct in Prometheus configuration</li>
            <li>Ensure the role's trust policy allows your specific service account</li>
          </ul>
        </li>
      </ul>
    </DocPage>
  );
};

export default AksAmpOidcConfig;
