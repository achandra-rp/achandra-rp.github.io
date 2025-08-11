export interface Resource {
  title: string;
  url: string;
  description: string;
}

export interface ResourceCategory {
  title: string;
  resources: Resource[];
}

export const resourceCategories: ResourceCategory[] = [
  {
    title: "KEDA & Autoscaling",
    resources: [
      {
        title: "KEDA-Driven Autoscaling Guide",
        url: "KEDA-Driven-Autoscaling.md",
        description: "Comprehensive guide for Knative Kafka broker autoscaling"
      },
      {
        title: "KEDA Scaling Test Guide",
        url: "KEDA-Knative-Kafka-Scaling-Guide.md",
        description: "Testing and validation procedures for KEDA scaling"
      },
      {
        title: "KEDA Installation Guide",
        url: "keda-install.md",
        description: "Complete setup for EKS with Kafka broker and MSK"
      }
    ]
  },
  {
    title: "Kubernetes Operations",
    resources: [
      {
        title: "AKS-AMP OIDC Setup",
        url: "AKS-AMP-OIDC-Config.md",
        description: "Authenticating AKS with AWS Managed Prometheus"
      },
      {
        title: "Troubleshooting Grafana",
        url: "troubleshooting-grafana.md",
        description: "Common issues and solutions for Grafana"
      }
    ]
  },
  {
    title: "Infrastructure Monitoring",
    resources: [
      {
        title: "Vector Deployment Guide",
        url: "vector-install.md",
        description: "Troubleshooting and deployment for Vector logging"
      },
      {
        title: "Blackbox Exporter Setup",
        url: "blackbox-exporter-setup.md",
        description: "HTTP service monitoring with Prometheus"
      }
    ]
  },
  {
    title: "Kafka Integration",
    resources: [
      {
        title: "Kafka-Knative-AMP Setup",
        url: "kafka-knative-amp-setup.md",
        description: "End-to-end installation and validation guide"
      }
    ]
  },
  {
    title: "Scripts & Tools",
    resources: [
      {
        title: "K8s Node Debug Script",
        url: "k8s-node-debug.md",
        description: "Interactive node debugging tool with fzf integration"
      },
      {
        title: "EC2 Pressure Check Script",
        url: "ec2-pressure-check.md",
        description: "EKS node pressure monitoring automation"
      },
      {
        title: "Kafka CLI Pod",
        url: "kafka-cli.md",
        description: "Kubernetes pod configuration for Kafka operations"
      },
      {
        title: "Network Tools Pod",
        url: "net-tools-pod.md",
        description: "Comprehensive Kubernetes debugging pod with network analysis tools"
      }
    ]
  }
];