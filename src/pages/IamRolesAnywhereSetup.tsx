import { useEffect, useState } from 'react';
import DocPage from '../components/DocPage';
import Mermaid from '../components/Mermaid';
import './IamRolesAnywhereSetup.css';
import '../components/Mermaid.css';

interface Section {
  id: string;
  label: string;
  shortLabel: string;
}

const sections: Section[] = [
  { id: 'overview', label: 'Architecture Overview', shortLabel: 'Overview' },
  { id: 'step1', label: 'Install cert-manager', shortLabel: 'cert-manager' },
  { id: 'step2', label: 'Extract CA Certificate', shortLabel: 'Extract CA' },
  { id: 'step3', label: 'AWS IAM Roles Anywhere Resources', shortLabel: 'AWS Resources' },
  { id: 'step4', label: 'IAM Roles with Trust Policies', shortLabel: 'IAM Roles' },
  { id: 'step5', label: 'Configure Certificate Issuer', shortLabel: 'Cert Issuer' },
  { id: 'step6', label: 'Test Setup', shortLabel: 'Test' },
  { id: 'troubleshooting', label: 'Troubleshooting', shortLabel: 'Debug' },
];

const IamRolesAnywhereSetup = () => {
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 150;

      for (let i = sections.length - 1; i >= 0; i--) {
        const element = document.getElementById(sections[i].id);
        if (element && element.offsetTop <= scrollPosition) {
          setActiveSection(sections[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: elementPosition - offset, behavior: 'smooth' });
    }
  };

  return (
    <DocPage title="IAM Roles Anywhere Setup for RKE2 Clusters">
      {/* Floating Navigation */}
      <nav className="iamra-nav" aria-label="Guide navigation">
        <div className="iamra-nav-track">
          {sections.map((section, index) => (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className={`iamra-nav-item ${activeSection === section.id ? 'active' : ''}`}
              aria-current={activeSection === section.id ? 'step' : undefined}
            >
              <span className="iamra-nav-marker">
                {index === 0 ? 'O' : index === sections.length - 1 ? '?' : index}
              </span>
              <span className="iamra-nav-label">{section.shortLabel}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Introduction */}
      <div className="iamra-intro">
        <p>Configure AWS IAM Roles Anywhere on an on-premises RKE2 Kubernetes cluster. Enable workloads to obtain temporary AWS credentials using X.509 certificates instead of static access keys.</p>

        <div className="iamra-meta-grid">
          <div className="iamra-meta-item">
            <span className="iamra-meta-label">Duration</span>
            <span className="iamra-meta-value">~45 min</span>
          </div>
          <div className="iamra-meta-item">
            <span className="iamra-meta-label">Prerequisites</span>
            <span className="iamra-meta-value">kubectl, AWS CLI, Helm</span>
          </div>
          <div className="iamra-meta-item">
            <span className="iamra-meta-label">Cluster</span>
            <span className="iamra-meta-value">RKE2</span>
          </div>
          <div className="iamra-meta-item">
            <span className="iamra-meta-label">Region</span>
            <span className="iamra-meta-value">us-east-1</span>
          </div>
        </div>
      </div>

      {/* Overview Section */}
      <section id="overview" className="iamra-section">
        <header className="iamra-section-header">
          <h2>Architecture Overview</h2>
        </header>

        <Mermaid chart={`
graph TB
    subgraph RKE2["ON-PREMISES RKE2 CLUSTER"]
        CM[cert-manager] -->|issues| CERT[X.509 Certificate]
        CM -->|uses| CA[Cluster CA]
        CERT -->|mounts to| POD[Pod with Signing Helper]

        subgraph POD_INTERNAL["Pod Components"]
            APP[App Container]
            HELPER[AWS Signing Helper Sidecar]
        end

        POD --> POD_INTERNAL
        HELPER -->|serves credentials| APP
    end

    subgraph AWS["AWS"]
        IAMRA[IAM Roles Anywhere]
        TA[Trust Anchor<br/>CA Certificate]
        PROFILE[Profile<br/>Role Mapping]
        STS[STS Temporary<br/>Credentials]
        ROLE[IAM Role<br/>Permissions]

        IAMRA --> TA
        TA --> PROFILE
        PROFILE --> STS
        STS --> ROLE
    end

    HELPER -->|authenticates with cert| IAMRA

    style RKE2 fill:#282c34,stroke:#61afef,stroke-width:2px
    style AWS fill:#282c34,stroke:#e5c07b,stroke-width:2px
    style POD_INTERNAL fill:#21252b,stroke:#5c6370,stroke-width:1px
    style CM fill:#61afef,stroke:#61afef,color:#1a1d23
    style IAMRA fill:#e5c07b,stroke:#e5c07b,color:#1a1d23
    style HELPER fill:#98c379,stroke:#98c379,color:#1a1d23
        `} className="iamra-diagram" />


        <h3>How It Works</h3>

        <h4>The Problem</h4>
        <p>On-premises Kubernetes clusters can't use IAM roles like EC2 instances do. Traditionally, you'd need to:</p>
        <ul>
          <li>Create static IAM access keys</li>
          <li>Store them as secrets in Kubernetes</li>
          <li>Rotate them manually (security risk if forgotten)</li>
          <li>Risk exposure if secrets are compromised</li>
        </ul>

        <h4>The Solution</h4>
        <p>IAM Roles Anywhere allows workloads outside AWS to obtain <strong>temporary, auto-rotating credentials</strong> using X.509 certificates instead of static keys. Here's the complete flow:</p>

        <ol className="iamra-flow-list">
          <li>
            <strong>Certificate Issuance</strong>
            <p>When a pod starts, cert-manager automatically issues an X.509 certificate signed by your cluster's CA. This certificate uniquely identifies the pod and has a short TTL (e.g., 12 hours).</p>
          </li>
          <li>
            <strong>Certificate Mounting</strong>
            <p>The certificate and private key are mounted into the pod as a Kubernetes secret. The AWS Signing Helper sidecar container has access to these files.</p>
          </li>
          <li>
            <strong>Authentication Request</strong>
            <p>When your application needs AWS credentials, it calls the local metadata endpoint (<code>http://127.0.0.1:9911</code>) served by the signing helper sidecar.</p>
          </li>
          <li>
            <strong>Certificate Validation</strong>
            <p>The signing helper uses the pod's certificate to make a <code>CreateSession</code> API call to IAM Roles Anywhere. AWS validates the certificate against the Trust Anchor (your cluster CA uploaded to AWS).</p>
          </li>
          <li>
            <strong>Trust Verification</strong>
            <p>IAM Roles Anywhere checks:
              <ul>
                <li>Is the certificate signed by a trusted CA (Trust Anchor)?</li>
                <li>Is the certificate still valid (not expired)?</li>
                <li>Does the Trust Anchor match a registered Trust Anchor?</li>
              </ul>
            </p>
          </li>
          <li>
            <strong>Credential Issuance</strong>
            <p>If validation passes, AWS STS issues temporary credentials (AccessKeyId, SecretAccessKey, SessionToken) valid for 1 hour (configurable). These are returned to the signing helper.</p>
          </li>
          <li>
            <strong>Credential Serving</strong>
            <p>The signing helper exposes these credentials via a local HTTP endpoint that mimics the EC2 instance metadata service. Your application uses the standard AWS SDK to fetch credentials from this endpoint.</p>
          </li>
          <li>
            <strong>Automatic Renewal</strong>
            <p>Before credentials expire, the signing helper automatically requests new ones using the same certificate. When the certificate nears expiration, cert-manager issues a new one. Your application never sees this complexity.</p>
          </li>
        </ol>

        <h4>Key Benefits</h4>
        <div className="iamra-steps-overview">
          <div className="iamra-step-card">
            <span className="iamra-step-num">🔒</span>
            <span className="iamra-step-name"><strong>No Static Credentials</strong> - Certificates rotate automatically, reducing breach risk</span>
          </div>
          <div className="iamra-step-card">
            <span className="iamra-step-num">⏱️</span>
            <span className="iamra-step-name"><strong>Short-Lived Tokens</strong> - Credentials expire in 1 hour, limiting exposure window</span>
          </div>
          <div className="iamra-step-card">
            <span className="iamra-step-num">🔄</span>
            <span className="iamra-step-name"><strong>Zero Maintenance</strong> - No manual rotation, renewal happens automatically</span>
          </div>
          <div className="iamra-step-card">
            <span className="iamra-step-num">📝</span>
            <span className="iamra-step-name"><strong>Audit Trail</strong> - All credential requests logged in CloudTrail</span>
          </div>
          <div className="iamra-step-card">
            <span className="iamra-step-num">🎯</span>
            <span className="iamra-step-name"><strong>Standard AWS SDK</strong> - No code changes, works with existing applications</span>
          </div>
        </div>

        <h4>Security Model</h4>
        <p>The security is based on a chain of trust:</p>
        <ol>
          <li><strong>You trust your cluster CA</strong> - Only your cluster can issue certificates signed by this CA</li>
          <li><strong>AWS trusts your cluster CA</strong> - You upload the CA certificate to AWS as a Trust Anchor</li>
          <li><strong>Certificates prove identity</strong> - Any certificate signed by your CA is trusted by AWS</li>
          <li><strong>Fine-grained access</strong> - The IAM role determines what the pod can access in AWS</li>
        </ol>

        <div className="iamra-callout info">
          <strong>Think of it like this:</strong> Your cluster CA is like a passport authority. AWS trusts passports (certificates) issued by this authority. Each pod gets a passport that proves it's from your trusted cluster. AWS checks the passport and issues temporary visitor credentials based on the role you've assigned.
        </div>

        <h3>Steps Summary</h3>
        <div className="iamra-steps-overview">
          {sections.slice(1, -1).map((section, index) => (
            <div key={section.id} className="iamra-step-card">
              <span className="iamra-step-num">{index + 1}</span>
              <span className="iamra-step-name">{section.label}</span>
            </div>
          ))}
        </div>

        <h3>Prerequisites</h3>
        <ul className="iamra-prereq-list">
          <li>SSH access to RKE2 cluster nodes</li>
          <li><code>kubectl</code> access to the cluster</li>
          <li>AWS Console access with IAM administrative permissions</li>
          <li>AWS CLI configured with appropriate credentials</li>
          <li>Helm installed</li>
        </ul>

        <h3>Required Information</h3>
        <table>
          <thead>
            <tr>
              <th>Variable</th>
              <th>Description</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>CLUSTER_NAME</code></td>
              <td>Kubernetes cluster identifier</td>
              <td>greensboro-edge</td>
            </tr>
            <tr>
              <td><code>AWS_ACCOUNT_ID</code></td>
              <td>12-digit AWS account number</td>
              <td>471112935967</td>
            </tr>
            <tr>
              <td><code>AWS_REGION</code></td>
              <td>Target AWS region</td>
              <td>us-east-1</td>
            </tr>
          </tbody>
        </table>

        <div className="iamra-callout critical">
          <strong>Critical:</strong> The CA certificate used for the Trust Anchor <strong>MUST</strong> have <code>CA:TRUE</code> in Basic Constraints. Extracting from the wrong source will cause IAMRA authentication to fail.
        </div>
      </section>

      {/* Step 1: cert-manager */}
      <section id="step1" className="iamra-section">
        <header className="iamra-section-header">
          <h2>Step 1: Install cert-manager</h2>
          <span className="iamra-section-time">~5 min</span>
        </header>

        <h3>1.1 Add Helm Repository</h3>
        <pre><code>{`# Add the Jetstack Helm repository
helm repo add jetstack https://charts.jetstack.io

# Update Helm repositories
helm repo update

# Verify
helm search repo jetstack/cert-manager`}</code></pre>

        <h3>1.2 Check for Existing Installation</h3>
        <pre><code>{`# Check if cert-manager is already installed
kubectl get namespace cert-manager 2>/dev/null && \\
  echo "cert-manager namespace exists" || \\
  echo "cert-manager not installed"

# Check for CRDs
kubectl get crd certificates.cert-manager.io 2>/dev/null && \\
  echo "CRDs exist" || \\
  echo "CRDs not installed"`}</code></pre>

        <div className="iamra-callout info">
          If cert-manager is already installed and running, skip to Step 1.4 (Verification).
        </div>

        <h3>1.3 Install cert-manager</h3>
        <pre><code>{`# Install cert-manager with CRDs
helm install cert-manager jetstack/cert-manager \\
  --namespace cert-manager \\
  --create-namespace \\
  --version v1.14.4 \\
  --set crds.enabled=true \\
  --set prometheus.enabled=true \\
  --set webhook.timeoutSeconds=30

# Wait for deployment to complete
kubectl -n cert-manager rollout status deployment/cert-manager --timeout=120s
kubectl -n cert-manager rollout status deployment/cert-manager-webhook --timeout=120s
kubectl -n cert-manager rollout status deployment/cert-manager-cainjector --timeout=120s`}</code></pre>

        <h3>1.4 Verification</h3>
        <pre><code>{`# Check 1: All pods running
kubectl get pods -n cert-manager
# Expected: 3 pods all in Running state with 1/1 ready

# Check 2: CRDs installed
kubectl get crd | grep cert-manager
# Expected: certificates.cert-manager.io, clusterissuers.cert-manager.io, etc.

# Check 3: Webhook is responding
kubectl get apiservices | grep cert-manager
# Expected: v1.cert-manager.io shows True in AVAILABLE column`}</code></pre>

        <details className="iamra-details">
          <summary>1.5 Test Certificate Creation (Optional)</summary>
          <pre><code>{`# Create a test certificate
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Namespace
metadata:
  name: cert-manager-test
---
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: test-selfsigned
  namespace: cert-manager-test
spec:
  selfSigned: {}
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: test-cert
  namespace: cert-manager-test
spec:
  secretName: test-cert-tls
  duration: 1h
  renewBefore: 30m
  commonName: test.example.com
  issuerRef:
    name: test-selfsigned
    kind: Issuer
EOF

# Wait and check
sleep 10
kubectl get certificate -n cert-manager-test test-cert
# Expected: Ready = True

# Cleanup
kubectl delete namespace cert-manager-test`}</code></pre>
        </details>

        <div className="iamra-callout success">
          <strong>Checkpoint:</strong> All cert-manager pods running, CRDs installed, webhook available. Proceed to Step 2.
        </div>
      </section>

      {/* Step 2: Extract CA */}
      <section id="step2" className="iamra-section">
        <header className="iamra-section-header">
          <h2>Step 2: Extract Cluster CA Certificate</h2>
          <span className="iamra-section-time">~2 min</span>
        </header>

        <div className="iamra-callout critical">
          <strong>Critical:</strong> The certificate MUST have <code>CA:TRUE</code> in Basic Constraints. The <code>rke2-serving</code> secret contains the API server certificate (CA:FALSE) which will NOT work.
        </div>

        <h3>2.1 Extract the CA Certificate</h3>
        <pre><code>{`# Method 1: Extract from kube-root-ca.crt ConfigMap (RECOMMENDED)
kubectl get configmap kube-root-ca.crt \\
  -n kube-system \\
  -o jsonpath='{.data.ca\\.crt}' > cluster-ca.crt

# Method 2: Extract from kubeconfig (alternative)
kubectl config view --raw \\
  -o jsonpath='{.clusters[?(@.name=="greensboro-edge")].cluster.certificate-authority-data}' \\
  | base64 -d > cluster-ca.crt

# Method 3: SSH to node (fallback)
# ssh user@control-plane-node
# sudo cat /var/lib/rancher/rke2/server/tls/server-ca.crt`}</code></pre>

        <h3>2.2 Verify the Certificate (CRITICAL)</h3>
        <pre><code>{`# Check certificate details
openssl x509 -in cluster-ca.crt -text -noout | head -20

# CRITICAL: Verify it's a CA certificate
openssl x509 -in cluster-ca.crt -text -noout | grep -A2 "Basic Constraints"
# MUST show: CA:TRUE

# Check validity
openssl x509 -in cluster-ca.crt -checkend 0
# Expected: "Certificate will not expire"`}</code></pre>

        <div className="iamra-callout warning">
          <strong>If you see CA:FALSE:</strong> You extracted the wrong certificate. Use the <code>kube-root-ca.crt</code> ConfigMap method.
        </div>

        <h3>2.3 Save Certificate Information</h3>
        <pre><code>{`# Get certificate fingerprint (SHA-256)
openssl x509 -in cluster-ca.crt -fingerprint -sha256 -noout

# Get certificate subject
openssl x509 -in cluster-ca.crt -subject -noout

# Get certificate validity period
openssl x509 -in cluster-ca.crt -dates -noout

# Save certificate as base64 (for AWS CLI/Terraform)
base64 -i cluster-ca.crt > cluster-ca.crt.b64`}</code></pre>

        <h3>2.4 Verification Checklist</h3>
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>Command</th>
              <th>Expected</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>File exists</td>
              <td><code>ls -la cluster-ca.crt</code></td>
              <td>Non-zero size</td>
            </tr>
            <tr>
              <td>Valid X.509</td>
              <td><code>openssl x509 -in cluster-ca.crt -noout</code></td>
              <td>No errors</td>
            </tr>
            <tr>
              <td>Is CA cert</td>
              <td><code>openssl x509 ... | grep "CA:TRUE"</code></td>
              <td><strong>CA:TRUE</strong></td>
            </tr>
            <tr>
              <td>Not expired</td>
              <td><code>openssl x509 ... -checkend 0</code></td>
              <td>Will not expire</td>
            </tr>
          </tbody>
        </table>

        <div className="iamra-callout success">
          <strong>Output Files:</strong>
          <ul>
            <li><code>cluster-ca.crt</code> - PEM-encoded CA certificate (upload to AWS)</li>
            <li><code>cluster-ca.crt.b64</code> - Base64-encoded certificate (for CLI/Terraform)</li>
          </ul>
        </div>
      </section>

      {/* Step 3: AWS Resources */}
      <section id="step3" className="iamra-section">
        <header className="iamra-section-header">
          <h2>Step 3: Create AWS IAM Roles Anywhere Resources</h2>
          <span className="iamra-section-time">~15 min</span>
        </header>

        <h3>Option A: AWS Console (Recommended)</h3>

        <h4>3.1 Create Trust Anchor</h4>
        <ol>
          <li>Navigate to IAM Roles Anywhere: <a href="https://console.aws.amazon.com/rolesanywhere" target="_blank" rel="noopener noreferrer">AWS Console</a></li>
          <li>Select region: <code>us-east-1</code></li>
          <li>Click "Create a trust anchor"</li>
          <li>Configure:
            <table>
              <tbody>
                <tr><th>Field</th><th>Value</th></tr>
                <tr><td>Name</td><td><code>greensboro-edge-trust-anchor</code></td></tr>
                <tr><td>Certificate authority source</td><td>External certificate bundle</td></tr>
                <tr><td>External certificate bundle</td><td>Upload <code>cluster-ca.crt</code></td></tr>
              </tbody>
            </table>
          </li>
          <li>Click "Create trust anchor"</li>
          <li><strong>Record the Trust Anchor ARN</strong></li>
        </ol>

        <h4>3.2 Create Profile</h4>
        <ol>
          <li>Click "Create a profile"</li>
          <li>Configure:
            <table>
              <tbody>
                <tr><th>Field</th><th>Value</th></tr>
                <tr><td>Name</td><td><code>greensboro-edge-profile</code></td></tr>
                <tr><td>Session duration</td><td>3600 (1 hour)</td></tr>
                <tr><td>Require instance properties</td><td>Unchecked</td></tr>
                <tr><td>Role ARNs</td><td>Add in Step 4</td></tr>
              </tbody>
            </table>
          </li>
          <li>Click "Create profile"</li>
          <li><strong>Record the Profile ARN</strong></li>
        </ol>

        <details className="iamra-details">
          <summary>Option B: AWS CLI</summary>
          <pre><code>{`# Set variables
export AWS_REGION="us-east-1"
export AWS_ACCOUNT_ID="471112935967"
export TRUST_ANCHOR_NAME="greensboro-edge-trust-anchor"
export PROFILE_NAME="greensboro-edge-profile"

# Create Trust Anchor
CA_CERT_CONTENT=$(cat cluster-ca.crt)
aws rolesanywhere create-trust-anchor \\
  --name "\${TRUST_ANCHOR_NAME}" \\
  --source "sourceData={x509CertificateData=\\"\${CA_CERT_CONTENT}\\"},sourceType=CERTIFICATE_BUNDLE" \\
  --enabled \\
  --region "\${AWS_REGION}"

# Get Trust Anchor ARN
TRUST_ANCHOR_ARN=$(aws rolesanywhere list-trust-anchors \\
  --region "\${AWS_REGION}" \\
  --query "trustAnchors[?name=='\${TRUST_ANCHOR_NAME}'].trustAnchorArn" \\
  --output text)
echo "Trust Anchor ARN: \${TRUST_ANCHOR_ARN}"

# Create Profile
aws rolesanywhere create-profile \\
  --name "\${PROFILE_NAME}" \\
  --duration-seconds 3600 \\
  --enabled \\
  --region "\${AWS_REGION}"

# Get Profile ARN
PROFILE_ARN=$(aws rolesanywhere list-profiles \\
  --region "\${AWS_REGION}" \\
  --query "profiles[?name=='\${PROFILE_NAME}'].profileArn" \\
  --output text)
echo "Profile ARN: \${PROFILE_ARN}"`}</code></pre>
        </details>

        <h3>3.3 Save Configuration</h3>
        <pre><code>{`# Create configuration file
cat > aws-config.env <<EOF
# AWS IAM Roles Anywhere Configuration
export AWS_ACCOUNT_ID="471112935967"
export AWS_REGION="us-east-1"

# Trust Anchor (from Step 3)
export TRUST_ANCHOR_ARN="arn:aws:rolesanywhere:us-east-1:471112935967:trust-anchor/YOUR_ID"

# Profile (from Step 3)
export PROFILE_ARN="arn:aws:rolesanywhere:us-east-1:471112935967:profile/YOUR_ID"
EOF

echo "Update aws-config.env with actual ARN values!"`}</code></pre>

        <h3>3.4 Verification</h3>
        <pre><code>{`# Verify Trust Anchor
aws rolesanywhere list-trust-anchors --region us-east-1

# Verify Profile
aws rolesanywhere list-profiles --region us-east-1`}</code></pre>

        <div className="iamra-callout success">
          <strong>Checkpoint:</strong> Trust Anchor and Profile created, both show <code>"enabled": true</code>.
        </div>
      </section>

      {/* Step 4: IAM Roles */}
      <section id="step4" className="iamra-section">
        <header className="iamra-section-header">
          <h2>Step 4: Create IAM Roles with Trust Policies</h2>
          <span className="iamra-section-time">~10 min</span>
        </header>

        <h3>4.1 Trust Policy Template</h3>
        <p>This trust policy allows IAM Roles Anywhere to assume the role using certificates from your cluster.</p>

        <pre><code>{`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowRolesAnywhereAssumeRole",
      "Effect": "Allow",
      "Principal": {
        "Service": "rolesanywhere.amazonaws.com"
      },
      "Action": [
        "sts:AssumeRole",
        "sts:TagSession",
        "sts:SetSourceIdentity"
      ],
      "Condition": {
        "ArnEquals": {
          "aws:SourceArn": "arn:aws:rolesanywhere:us-east-1:ACCOUNT_ID:trust-anchor/TRUST_ANCHOR_ID"
        }
      }
    }
  ]
}`}</code></pre>

        <div className="iamra-callout warning">
          <strong>Important:</strong> Replace <code>ACCOUNT_ID</code> and <code>TRUST_ANCHOR_ID</code> with actual values.
        </div>

        <h3>4.2 Create Test Role</h3>
        <p>Create a test role to verify IAMRA is working:</p>

        <pre><code>{`# Load config
source aws-config.env

# Create trust policy file
cat > /tmp/iamra-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "rolesanywhere.amazonaws.com"
      },
      "Action": [
        "sts:AssumeRole",
        "sts:TagSession",
        "sts:SetSourceIdentity"
      ],
      "Condition": {
        "ArnEquals": {
          "aws:SourceArn": "\${TRUST_ANCHOR_ARN}"
        }
      }
    }
  ]
}
EOF

# Create role
aws iam create-role \\
  --role-name greensboro-edge-test-role \\
  --assume-role-policy-document file:///tmp/iamra-trust-policy.json \\
  --tags Key=Cluster,Value=greensboro-edge Key=Purpose,Value=iamra-test

# Attach read-only policy for testing
aws iam attach-role-policy \\
  --role-name greensboro-edge-test-role \\
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess

# Get role ARN
TEST_ROLE_ARN=$(aws iam get-role \\
  --role-name greensboro-edge-test-role \\
  --query 'Role.Arn' --output text)
echo "Test Role ARN: \${TEST_ROLE_ARN}"`}</code></pre>

        <h3>4.3 Update Profile with Role ARNs</h3>
        <pre><code>{`# Extract Profile ID from ARN
PROFILE_ID=$(echo \${PROFILE_ARN} | rev | cut -d'/' -f1 | rev)

# Update profile with test role
aws rolesanywhere update-profile \\
  --profile-id "\${PROFILE_ID}" \\
  --role-arns "\${TEST_ROLE_ARN}" \\
  --region "\${AWS_REGION}"

# Verify
aws rolesanywhere get-profile \\
  --profile-id "\${PROFILE_ID}" \\
  --region us-east-1 | jq '.profile.roleArns'`}</code></pre>

        <h3>4.4 Update Configuration File</h3>
        <pre><code>{`# Add role ARN to config
cat >> aws-config.env <<EOF

# Test Role (from Step 4)
export TEST_ROLE_ARN="arn:aws:iam::471112935967:role/greensboro-edge-test-role"
EOF`}</code></pre>

        <div className="iamra-callout success">
          <strong>Checkpoint:</strong> Test role created with trust policy, added to Profile.
        </div>
      </section>

      {/* Step 5: Cert Issuer */}
      <section id="step5" className="iamra-section">
        <header className="iamra-section-header">
          <h2>Step 5: Configure Certificate Issuer</h2>
          <span className="iamra-section-time">~5 min</span>
        </header>

        <h3>5.1 Create Cluster CA Secret</h3>
        <p>cert-manager needs the CA key pair to sign certificates.</p>

        <pre><code>{`# SSH to control plane node and extract CA key pair
ssh user@control-plane-node

# On the node:
sudo cat /var/lib/rancher/rke2/server/tls/server-ca.crt > /tmp/ca.crt
sudo cat /var/lib/rancher/rke2/server/tls/server-ca.key > /tmp/ca.key

# Exit SSH and copy files locally
exit
scp user@control-plane-node:/tmp/ca.crt ./
scp user@control-plane-node:/tmp/ca.key ./

# Create secret in cert-manager namespace
kubectl create secret tls cluster-ca-keypair \\
  --cert=ca.crt \\
  --key=ca.key \\
  -n cert-manager

# Clean up local files
rm ca.crt ca.key`}</code></pre>

        <div className="iamra-callout info">
          <strong>Alternative:</strong> If you cannot access the cluster CA key, you can create a dedicated CA for IAM Roles Anywhere. However, you'll need to upload this new CA to AWS as the Trust Anchor.
        </div>

        <h3>5.2 Create ClusterIssuer</h3>
        <pre><code>{`cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: iamra-cluster-issuer
  labels:
    app.kubernetes.io/name: iamra-issuer
    app.kubernetes.io/part-of: iam-roles-anywhere
spec:
  ca:
    secretName: cluster-ca-keypair
EOF`}</code></pre>

        <h3>5.3 Verify Issuer</h3>
        <pre><code>{`# Check ClusterIssuer status
kubectl get clusterissuer iamra-cluster-issuer

# Should show Ready=True
kubectl get clusterissuer iamra-cluster-issuer -o yaml | grep -A5 "status:"`}</code></pre>

        <details className="iamra-details">
          <summary>5.4 Test Certificate Issuance</summary>
          <pre><code>{`# Create a test certificate
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: test-iamra-cert
  namespace: default
spec:
  secretName: test-iamra-cert-tls
  duration: 1h
  renewBefore: 30m
  commonName: test-pod.default.svc.cluster.local
  usages:
    - digital signature
    - key encipherment
    - client auth
  issuerRef:
    name: iamra-cluster-issuer
    kind: ClusterIssuer
EOF

# Wait and verify
sleep 10
kubectl get certificate test-iamra-cert -n default
# Expected: Ready = True

# Inspect the certificate
kubectl get secret test-iamra-cert-tls -n default \\
  -o jsonpath='{.data.tls\\.crt}' | base64 -d | \\
  openssl x509 -text -noout | head -20

# Cleanup
kubectl delete certificate test-iamra-cert -n default
kubectl delete secret test-iamra-cert-tls -n default`}</code></pre>
        </details>

        <div className="iamra-callout success">
          <strong>Checkpoint:</strong> ClusterIssuer Ready=True, test certificate issued successfully.
        </div>
      </section>

      {/* Step 6: Test Setup */}
      <section id="step6" className="iamra-section">
        <header className="iamra-section-header">
          <h2>Step 6: Test IAM Roles Anywhere Setup</h2>
          <span className="iamra-section-time">~10 min</span>
        </header>

        <h3>Container Image</h3>
        <div className="iamra-callout info">
          <strong>Pre-built Image:</strong> <code>ghcr.io/radpartners/iamra-sidecar:latest</code>
          <ul>
            <li>Contains AWS Signing Helper v1.3.0 binary</li>
            <li>Based on Alpine 3.19 with glibc compatibility</li>
            <li>ENTRYPOINT is <code>/usr/local/bin/aws_signing_helper</code></li>
            <li>Must provide <code>args</code> with <code>serve</code> subcommand</li>
          </ul>
        </div>

        <h3>6.1 Create Test ConfigMap</h3>
        <pre><code>{`# Load configuration
source aws-config.env

# Create ConfigMap
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: iamra-config
  namespace: default
data:
  AWS_REGION: "\${AWS_REGION}"
  TRUST_ANCHOR_ARN: "\${TRUST_ANCHOR_ARN}"
  PROFILE_ARN: "\${PROFILE_ARN}"
  ROLE_ARN: "\${TEST_ROLE_ARN}"
EOF`}</code></pre>

        <h3>6.2 Deploy Test Pod</h3>
        <pre><code>{`cat <<EOF | kubectl apply -f -
---
# Certificate for the test pod
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: iamra-test-cert
  namespace: default
spec:
  secretName: iamra-test-cert-tls
  duration: 12h
  renewBefore: 4h
  commonName: "iamra-test.default.svc.cluster.local"
  usages:
    - digital signature
    - key encipherment
    - client auth
  issuerRef:
    name: iamra-cluster-issuer
    kind: ClusterIssuer
---
# Test pod with signing helper sidecar
apiVersion: v1
kind: Pod
metadata:
  name: iamra-test-pod
  namespace: default
  labels:
    app: iamra-test
spec:
  containers:
    # Test container with AWS CLI
    - name: test-container
      image: amazon/aws-cli:latest
      command: ["sleep", "infinity"]
      env:
        - name: AWS_EC2_METADATA_SERVICE_ENDPOINT
          value: "http://127.0.0.1:9911"
        - name: AWS_REGION
          valueFrom:
            configMapKeyRef:
              name: iamra-config
              key: AWS_REGION

    # AWS Signing Helper sidecar
    - name: credential-helper
      image: ghcr.io/radpartners/iamra-sidecar:latest
      args:
        - serve
        - --certificate
        - /iamra/tls.crt
        - --private-key
        - /iamra/tls.key
        - --trust-anchor-arn
        - \\$(TRUST_ANCHOR_ARN)
        - --profile-arn
        - \\$(PROFILE_ARN)
        - --role-arn
        - \\$(ROLE_ARN)
        - --port
        - "9911"
      env:
        - name: TRUST_ANCHOR_ARN
          valueFrom:
            configMapKeyRef:
              name: iamra-config
              key: TRUST_ANCHOR_ARN
        - name: PROFILE_ARN
          valueFrom:
            configMapKeyRef:
              name: iamra-config
              key: PROFILE_ARN
        - name: ROLE_ARN
          valueFrom:
            configMapKeyRef:
              name: iamra-config
              key: ROLE_ARN
      volumeMounts:
        - name: iamra-certs
          mountPath: /iamra
          readOnly: true
      resources:
        requests:
          cpu: 10m
          memory: 32Mi
        limits:
          cpu: 100m
          memory: 64Mi

  volumes:
    - name: iamra-certs
      secret:
        secretName: iamra-test-cert-tls
EOF`}</code></pre>

        <h3>6.3 Wait for Pod to be Ready</h3>
        <pre><code>{`# Wait for certificate
kubectl wait --for=condition=Ready certificate/iamra-test-cert \\
  -n default --timeout=60s

# Wait for pod
kubectl wait --for=condition=Ready pod/iamra-test-pod \\
  -n default --timeout=120s

# Check pod status
kubectl get pod iamra-test-pod -n default
# Expected: 2/2 Running`}</code></pre>

        <h3>6.4 Verify Credential Helper</h3>
        <pre><code>{`# Check signing helper logs
kubectl logs iamra-test-pod -n default -c credential-helper

# Test credential endpoint
kubectl exec iamra-test-pod -n default -c test-container -- \\
  curl -s http://127.0.0.1:9911/latest/meta-data/iam/security-credentials/`}</code></pre>

        <h3>6.5 Test AWS API Access</h3>
        <pre><code>{`# Test STS GetCallerIdentity
kubectl exec iamra-test-pod -n default -c test-container -- \\
  aws sts get-caller-identity

# Expected output:
# {
#     "UserId": "AROA...:...",
#     "Account": "471112935967",
#     "Arn": "arn:aws:sts::471112935967:assumed-role/greensboro-edge-test-role/..."
# }

# Test S3 list (if ReadOnlyAccess attached)
kubectl exec iamra-test-pod -n default -c test-container -- \\
  aws s3 ls --region us-east-1 | head -5`}</code></pre>

        <h3>6.6 Cleanup Test Resources</h3>
        <pre><code>{`# Delete test pod and certificate
kubectl delete pod iamra-test-pod -n default
kubectl delete certificate iamra-test-cert -n default
kubectl delete secret iamra-test-cert-tls -n default
kubectl delete configmap iamra-config -n default`}</code></pre>

        <div className="iamra-callout success">
          <strong>Success!</strong> If <code>aws sts get-caller-identity</code> returns your assumed role ARN, IAM Roles Anywhere is working correctly.
        </div>

        <h3>Verification Checklist</h3>
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>Expected Result</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Certificate issued</td>
              <td>Ready=True</td>
            </tr>
            <tr>
              <td>Pod running</td>
              <td>2/2 containers Ready</td>
            </tr>
            <tr>
              <td>Signing helper logs</td>
              <td>No errors, serving on port 9911</td>
            </tr>
            <tr>
              <td>Credential endpoint</td>
              <td>Returns role name</td>
            </tr>
            <tr>
              <td>STS GetCallerIdentity</td>
              <td>Returns assumed role ARN</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Troubleshooting */}
      <section id="troubleshooting" className="iamra-section">
        <header className="iamra-section-header">
          <h2>Troubleshooting Guide</h2>
        </header>

        <h3>Quick Diagnosis</h3>
        <pre><code>{`# Quick status check
echo "=== Certificates ===" && kubectl get certificates -A | grep iamra
echo ""
echo "=== Pods ===" && kubectl get pods -A | grep -E "(iamra|signing)"
echo ""
echo "=== Recent Events ===" && kubectl get events -A --sort-by='.lastTimestamp' | tail -20`}</code></pre>

        <h3>Common Issues</h3>

        <details className="iamra-details" open>
          <summary>1. ImagePullBackOff (401 Unauthorized)</summary>
          <div className="iamra-callout warning">
            <strong>Symptom:</strong> <code>ErrImagePull: 401 Unauthorized</code>
          </div>
          <p><strong>Cause:</strong> Container image is on private registry.</p>
          <pre><code>{`# Create ImagePullSecret
kubectl create secret docker-registry github-registry-secret \\
  --docker-server=ghcr.io \\
  --docker-username=YOUR_GITHUB_USERNAME \\
  --docker-password=YOUR_GITHUB_TOKEN \\
  -n default

# Add to pod spec:
# spec:
#   imagePullSecrets:
#     - name: github-registry-secret`}</code></pre>
        </details>

        <details className="iamra-details">
          <summary>2. Container Shows Help and Exits</summary>
          <div className="iamra-callout warning">
            <strong>Symptom:</strong> credential-helper container exits immediately, logs show help text
          </div>
          <p><strong>Cause:</strong> Missing <code>args</code> with <code>serve</code> subcommand.</p>
          <pre><code>{`# CORRECT - use args:
args:
  - serve
  - --certificate
  - /iamra/tls.crt
  - --private-key
  - /iamra/tls.key
  - --trust-anchor-arn
  - $(TRUST_ANCHOR_ARN)
  - --profile-arn
  - $(PROFILE_ARN)
  - --role-arn
  - $(ROLE_ARN)
  - --port
  - "9911"`}</code></pre>
        </details>

        <details className="iamra-details">
          <summary>3. Certificate Not Ready</summary>
          <div className="iamra-callout warning">
            <strong>Symptom:</strong> Certificate shows Ready=False
          </div>
          <pre><code>{`# Check certificate status
kubectl describe certificate <cert-name> -n <namespace>

# Check certificate request
kubectl get certificaterequests -n <namespace>

# Check issuer
kubectl describe clusterissuer iamra-cluster-issuer

# Check cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager --tail=100`}</code></pre>
        </details>

        <details className="iamra-details">
          <summary>4. AWS Authentication Failing</summary>
          <div className="iamra-callout warning">
            <strong>Symptom:</strong> <code>AccessDenied</code> or <code>SignatureDoesNotMatch</code>
          </div>
          <pre><code>{`# Check signing helper logs
kubectl logs <pod-name> -n <namespace> -c credential-helper --tail=50

# Test credential endpoint manually
kubectl exec <pod-name> -n <namespace> -c <container> -- \\
  curl -v http://127.0.0.1:9911/latest/meta-data/iam/security-credentials/`}</code></pre>
          <p><strong>Common causes:</strong></p>
          <ul>
            <li>Trust Anchor ARN incorrect</li>
            <li>Profile ARN incorrect</li>
            <li>Role ARN not in Profile</li>
            <li>CA certificate doesn't match Trust Anchor</li>
          </ul>
        </details>

        <details className="iamra-details">
          <summary>5. CA Certificate Issues</summary>
          <div className="iamra-callout critical">
            <strong>Symptom:</strong> IAMRA fails even with correct ARNs
          </div>
          <p><strong>Cause:</strong> Certificate used for Trust Anchor has <code>CA:FALSE</code>.</p>
          <pre><code>{`# Verify your CA certificate
openssl x509 -in cluster-ca.crt -text -noout | grep -A2 "Basic Constraints"
# MUST show: CA:TRUE

# If CA:FALSE, re-extract from correct source:
kubectl get configmap kube-root-ca.crt \\
  -n kube-system \\
  -o jsonpath='{.data.ca\\.crt}' > cluster-ca.crt

# Then re-upload to AWS Trust Anchor`}</code></pre>
        </details>

        <details className="iamra-details">
          <summary>6. x509: certificate signed by unknown authority</summary>
          <div className="iamra-callout warning">
            <strong>Symptom:</strong> SSL certificate verification errors
          </div>
          <p><strong>Cause:</strong> Container missing CA certificates for AWS connections.</p>
          <p>The pre-built <code>ghcr.io/radpartners/iamra-sidecar:latest</code> image includes CA certificates. If building your own, ensure <code>ca-certificates</code> package is installed.</p>
        </details>

        <h3>AWS-Side Verification</h3>
        <pre><code>{`# Verify Trust Anchor
aws rolesanywhere list-trust-anchors --region us-east-1

# Verify Profile
aws rolesanywhere list-profiles --region us-east-1

# Verify Role Trust Policy
aws iam get-role --role-name greensboro-edge-test-role \\
  --query 'Role.AssumeRolePolicyDocument'

# Check CloudTrail for auth failures
aws cloudtrail lookup-events \\
  --lookup-attributes AttributeKey=EventSource,AttributeValue=rolesanywhere.amazonaws.com \\
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \\
  --max-results 20`}</code></pre>

        <details className="iamra-details">
          <summary>Collect Diagnostics Script</summary>
          <pre><code>{`#!/bin/bash
OUTPUT_DIR="/tmp/iamra-diagnostics-$(date +%Y%m%d-%H%M%S)"
mkdir -p $OUTPUT_DIR

# Certificates
kubectl get certificates -A -o yaml > $OUTPUT_DIR/certificates.yaml
kubectl get certificaterequests -A -o yaml > $OUTPUT_DIR/certificate-requests.yaml

# ClusterIssuer
kubectl get clusterissuer -o yaml > $OUTPUT_DIR/cluster-issuer.yaml

# Pod descriptions
kubectl describe pods -n default -l app=iamra-test > $OUTPUT_DIR/pod-describe.txt

# Logs
kubectl logs -n default -l app=iamra-test -c credential-helper --tail=500 > $OUTPUT_DIR/signing-helper.log 2>&1

# cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager --tail=500 > $OUTPUT_DIR/cert-manager.log 2>&1

# Events
kubectl get events -A --sort-by='.lastTimestamp' > $OUTPUT_DIR/events.txt

echo "Diagnostics collected to $OUTPUT_DIR"`}</code></pre>
        </details>

        <h3>References</h3>
        <ul>
          <li><a href="https://aws.amazon.com/blogs/security/connect-your-on-premises-kubernetes-cluster-to-aws-apis-using-iam-roles-anywhere/" target="_blank" rel="noopener noreferrer">AWS Blog: Connect on-premises Kubernetes to AWS using IAM Roles Anywhere</a></li>
          <li><a href="https://github.com/aws-samples/aws-iam-ra-for-kubernetes" target="_blank" rel="noopener noreferrer">GitHub: aws-samples/aws-iam-ra-for-kubernetes</a></li>
          <li><a href="https://docs.aws.amazon.com/rolesanywhere/latest/userguide/introduction.html" target="_blank" rel="noopener noreferrer">AWS IAM Roles Anywhere Documentation</a></li>
          <li><a href="https://cert-manager.io/docs/" target="_blank" rel="noopener noreferrer">cert-manager Documentation</a></li>
        </ul>
      </section>
    </DocPage>
  );
};

export default IamRolesAnywhereSetup;
