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
        url: "#/docs/keda-driven-autoscaling",
        description: "Comprehensive guide for Knative Kafka broker autoscaling"
      },
      {
        title: "KEDA Scaling Test Guide",
        url: "#/docs/keda-knative-kafka-scaling",
        description: "Testing and validation procedures for KEDA scaling"
      },
      {
        title: "KEDA Installation Guide",
        url: "#/docs/keda-install",
        description: "Complete setup for EKS with Kafka broker and MSK"
      }
    ]
  },
  {
    title: "Kubernetes Operations",
    resources: [
      {
        title: "AKS-AMP OIDC Setup",
        url: "#/docs/aks-amp-oidc-config",
        description: "Authenticating AKS with AWS Managed Prometheus"
      },
      {
        title: "Troubleshooting Grafana",
        url: "#/docs/troubleshooting-grafana",
        description: "Common issues and solutions for Grafana"
      }
    ]
  },
  {
    title: "Infrastructure Monitoring",
    resources: [
      {
        title: "Vector Deployment Guide",
        url: "#/docs/vector-install",
        description: "Troubleshooting and deployment for Vector logging"
      },
      {
        title: "Blackbox Exporter Setup",
        url: "#/docs/blackbox-exporter-setup",
        description: "HTTP service monitoring with Prometheus"
      }
    ]
  },
  {
    title: "Kafka Integration",
    resources: [
      {
        title: "Kafka-Knative-AMP Setup",
        url: "#/docs/kafka-knative-amp-setup",
        description: "End-to-end installation and validation guide"
      }
    ]
  },
  {
    title: "Scripts & Tools",
    resources: [
      {
        title: "K8s Node Debug Script",
        url: "#/docs/k8s-node-debug",
        description: "Interactive node debugging tool with fzf integration"
      },
      {
        title: "EC2 Pressure Check Script",
        url: "#/docs/ec2-pressure-check",
        description: "EKS node pressure monitoring automation"
      },
      {
        title: "Kafka CLI Pod",
        url: "#/docs/kafka-cli",
        description: "Kubernetes pod configuration for Kafka operations"
      },
      {
        title: "Network Tools Pod",
        url: "#/docs/net-tools-pod",
        description: "Comprehensive Kubernetes debugging pod with network analysis tools"
      }
    ]
  }
];