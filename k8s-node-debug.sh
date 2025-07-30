#!/bin/bash

# Kubernetes Node Debug Session Launcher (Interactive Version)
#
# This script creates a privileged debug pod on a specified Kubernetes node,
# providing system-level access for troubleshooting and maintenance tasks.
# The debug pod uses the sysadmin profile which grants host filesystem access
# and elevated privileges necessary for node-level debugging operations.
#
# Features an interactive node selection interface using fzf for better UX.

# Exit immediately if a command exits with a non-zero status, if an unset
# variable is used, or if a command in a pipeline fails.
set -euo pipefail

# Script information
SCRIPT_NAME="$(basename "$0")"
LOG_PREFIX="[${SCRIPT_NAME}]:"

# --- Default Configuration ---
DEBUG_IMAGE="ubuntu"
NAMESPACE="kube-system"
NODE_NAME=""
INTERACTIVE_MODE=false

# --- Functions ---
usage() {
  cat << EOF
Launches a privileged debug pod on a specified Kubernetes node with interactive selection.

Usage: $(basename "$0") [-n <node-name>] [-i <image>] [-s <namespace>] [-I] [-h]

Optional:
  -n <node-name>   The name of the target node for the debug session.
                   If not provided, interactive selection will be used.
  -i <image>       The container image to use. (Default: "$DEBUG_IMAGE")
  -s <namespace>   The namespace for the debug pod. (Default: "$NAMESPACE")
  -I               Force interactive mode (even if -n is provided)
  -h               Display this help message and exit.

Interactive Features:
  - Arrow key navigation through available nodes
  - Real-time node status display
  - Search/filter nodes by typing
  - Requires fzf to be installed

Host System Access:
  Once in the debug pod, access the node's filesystem and processes:
  
  # Change root to the host filesystem (most common)
  chroot /host
  
  # Or access host filesystem directly
  ls /host/etc/kubernetes/
  cat /host/proc/version
  tail -f /host/var/log/messages
  
  # View host processes and namespaces
  nsenter -t 1 -p -n ps aux
  nsenter -t 1 -p -n top
  
  # Access host network namespace
  nsenter -t 1 -n netstat -tulpn
  nsenter -t 1 -n ip addr show
  
  # Check systemd services on the host
  chroot /host systemctl status kubelet
  chroot /host journalctl -u kubelet -f
  
  # Debug container runtime
  chroot /host crictl ps
  chroot /host crictl logs <container-id>

Examples:
  $(basename "$0")                    # Interactive node selection
  $(basename "$0") -n worker-node-1   # Direct node specification
  $(basename "$0") -I -n worker-1     # Force interactive mode
EOF
  exit 1
}

# --- Utility Functions ---
log_info() {
  echo "${LOG_PREFIX} INFO: $1"
}

log_error() {
  echo "${LOG_PREFIX} ERROR: $1" >&2
}

log_warn() {
  echo "${LOG_PREFIX} WARN: $1" >&2
}

# Check if fzf is available
check_fzf_available() {
  if ! command -v fzf &> /dev/null; then
    log_warn "fzf not found. Interactive mode requires fzf."
    log_info "Install fzf:"
    log_info "  macOS: brew install fzf"
    log_info "  Ubuntu/Debian: apt install fzf"
    log_info "  RHEL/CentOS: yum install fzf"
    log_info "  Or visit: https://github.com/junegunn/fzf#installation"
    return 1
  fi
  return 0
}

# Get formatted node information for selection
get_node_info() {
  kubectl get nodes -o custom-columns="\
NAME:.metadata.name,\
STATUS:.status.conditions[-1].type,\
ROLES:.metadata.labels.node-role\.kubernetes\.io/master,\
AGE:.metadata.creationTimestamp,\
VERSION:.status.nodeInfo.kubeletVersion,\
INTERNAL-IP:.status.addresses[?(@.type=='InternalIP')].address" \
  --no-headers 2>/dev/null | \
  awk '{
    name=$1; status=$2; role=$3; age=$4; version=$5; ip=$6;
    if (role == "<none>") role="worker";
    if (role != "worker") role="control-plane";
    printf "%-20s %-8s %-15s %-12s %s\n", name, status, role, version, ip
  }' | \
  sort
}

# Generate troubleshooting info for a node
get_node_troubleshooting_info() {
  local node_name="$1"
  
  echo "Common Node Issues & Troubleshooting:"
  echo "====================================="
  echo
  
  # Get individual node conditions with proper status checking
  local ready_status disk_pressure_status memory_pressure_status pid_pressure_status
  ready_status=$(kubectl get node "${node_name}" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
  disk_pressure_status=$(kubectl get node "${node_name}" -o jsonpath='{.status.conditions[?(@.type=="DiskPressure")].status}' 2>/dev/null)
  memory_pressure_status=$(kubectl get node "${node_name}" -o jsonpath='{.status.conditions[?(@.type=="MemoryPressure")].status}' 2>/dev/null)
  pid_pressure_status=$(kubectl get node "${node_name}" -o jsonpath='{.status.conditions[?(@.type=="PIDPressure")].status}' 2>/dev/null)
  
  if [[ -n "${ready_status}" || -n "${disk_pressure_status}" || -n "${memory_pressure_status}" || -n "${pid_pressure_status}" ]]; then
    echo "Node Condition Analysis:"
    echo "------------------------"
    
    # Check for common issues
    if [[ "${disk_pressure_status}" == "True" ]]; then
      echo "🔴 DISK PRESSURE DETECTED"
      echo "   Commands to investigate:"
      echo "   chroot /host df -h"
      echo "   chroot /host du -sh /var/lib/docker/* | sort -hr"
      echo "   chroot /host crictl system df"
      echo
    fi
    
    if [[ "${memory_pressure_status}" == "True" ]]; then
      echo "🔴 MEMORY PRESSURE DETECTED"
      echo "   Commands to investigate:"
      echo "   chroot /host free -h"
      echo "   nsenter -t 1 -p -n top -o %MEM"
      echo "   chroot /host systemctl status kubelet"
      echo
    fi
    
    if [[ "${pid_pressure_status}" == "True" ]]; then
      echo "🔴 PID PRESSURE DETECTED"
      echo "   Commands to investigate:"
      echo "   nsenter -t 1 -p -n ps aux | wc -l"
      echo "   cat /host/proc/sys/kernel/pid_max"
      echo
    fi
    
    if [[ "${ready_status}" == "False" ]]; then
      echo "🔴 NODE NOT READY"
      echo "   Commands to investigate:"
      echo "   chroot /host systemctl status kubelet"
      echo "   chroot /host journalctl -u kubelet -f"
      echo "   chroot /host crictl ps"
      echo
    fi
    
    # If no issues detected
    if [[ "${disk_pressure_status}" != "True" && "${memory_pressure_status}" != "True" && "${pid_pressure_status}" != "True" && "${ready_status}" != "False" ]]; then
      echo "✅ No critical conditions detected"
      echo
    fi
  fi
  
  echo "General Debugging Commands:"
  echo "---------------------------"
  echo "System Info:"
  echo "  chroot /host uname -a"
  echo "  cat /host/proc/version"
  echo "  chroot /host uptime"
  echo
  echo "Resource Usage:"
  echo "  chroot /host df -h"
  echo "  chroot /host free -h"
  echo "  nsenter -t 1 -p -n top"
  echo
  echo "Kubernetes Services:"
  echo "  chroot /host systemctl status kubelet"
  echo "  chroot /host crictl ps"
  echo "  chroot /host crictl images"
  echo
  echo "Network:"
  echo "  nsenter -t 1 -n ip addr show"
  echo "  nsenter -t 1 -n netstat -tulpn"
  echo
  echo "Logs:"
  echo "  chroot /host journalctl -u kubelet -f"
  echo "  tail -f /host/var/log/messages"
}

# Interactive node selection using fzf
select_node_interactive() {
  log_info "Loading node information..."
  
  local node_info
  node_info=$(get_node_info) || {
    log_error "Failed to retrieve node information"
    return 1
  }
  
  if [[ -z "${node_info}" ]]; then
    log_error "No nodes found in the cluster"
    return 1
  fi
  
  log_info "Select a node for debugging:"
  echo
  
  # Create header for fzf display
  local header="NAME                 STATUS   ROLE            VERSION      INTERNAL-IP"
  
  # Use fzf for selection with troubleshooting preview
  local selected_line
  selected_line=$(echo "${node_info}" | \
    fzf --header="${header}" \
        --header-lines=0 \
        --reverse \
        --height=15 \
        --border \
        --prompt="Select node: " \
        --preview="$(declare -f get_node_troubleshooting_info); get_node_troubleshooting_info {1}" \
        --preview-window="right:50%:wrap" \
        --bind="ctrl-r:reload($(declare -f get_node_info); get_node_info)" \
        --bind="ctrl-/:toggle-preview" \
  ) || {
    log_info "Node selection cancelled"
    return 1
  }
  
  # Extract node name (first column)
  NODE_NAME=$(echo "${selected_line}" | awk '{print $1}')
  
  if [[ -z "${NODE_NAME}" ]]; then
    log_error "No node selected"
    return 1
  fi
  
  log_info "Selected node: ${NODE_NAME}"
  return 0
}

# Validate node exists in cluster
validate_node_exists() {
  local node_name="$1"
  if ! kubectl get node "${node_name}" &>/dev/null; then
    log_error "Node '${node_name}' does not exist in the cluster"
    log_info "Available nodes:"
    kubectl get nodes --no-headers -o custom-columns=NAME:.metadata.name | sed 's/^/  - /'
    return 1
  fi
  return 0
}

# Check if kubectl context is set
validate_kubectl_context() {
  local current_context
  current_context=$(kubectl config current-context 2>/dev/null) || {
    log_error "No kubectl context is set. Please configure kubectl first"
    return 1
  }
  log_info "Using kubectl context: ${current_context}"
  return 0
}

# --- Argument Parsing ---
while getopts ":n:i:s:Ih" opt; do
  case ${opt} in
    h)
      usage
      ;;
    n)
      NODE_NAME=${OPTARG}
      ;;
    i)
      DEBUG_IMAGE=${OPTARG}
      ;;
    s)
      NAMESPACE=${OPTARG}
      ;;
    I)
      INTERACTIVE_MODE=true
      ;;
    \?)
      echo "Invalid option: -${OPTARG}" >&2
      usage
      ;;
    :)
      echo "Option -${OPTARG} requires an argument." >&2
      usage
      ;;
  esac
done

# --- Pre-flight Checks ---
if ! command -v kubectl &> /dev/null; then
  log_error "kubectl command not found. Please ensure it is installed and in your PATH"
  exit 1
fi

if ! validate_kubectl_context; then
  exit 1
fi

# --- Node Selection Logic ---
if [[ "${INTERACTIVE_MODE}" == "true" ]] || [[ -z "${NODE_NAME}" ]]; then
  if ! check_fzf_available; then
    if [[ -z "${NODE_NAME}" ]]; then
      log_error "Interactive mode requires fzf, and no node name was provided"
      log_info "Either install fzf or specify a node with -n <node-name>"
      exit 1
    else
      log_warn "fzf not available, using provided node name: ${NODE_NAME}"
    fi
  else
    if ! select_node_interactive; then
      exit 1
    fi
  fi
fi

# Validate the selected/provided node
if [[ -z "${NODE_NAME}" ]]; then
  log_error "No node specified or selected"
  usage
fi

if ! validate_node_exists "${NODE_NAME}"; then
  exit 1
fi

# --- Cleanup Function ---
cleanup() {
  local exit_code=$?
  if [[ ${exit_code} -ne 0 ]]; then
    log_warn "Script exited with non-zero status: ${exit_code}"
    log_info "Checking for orphaned debug pods in namespace ${NAMESPACE}..."
    
    # List any debug pods that might have been created but not properly cleaned up
    local debug_pods
    debug_pods=$(kubectl get pods -n "${NAMESPACE}" --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null | grep -E "node-debugger|debug" || true)
    
    if [[ -n "${debug_pods}" ]]; then
      log_warn "Found potential debug pods that may need manual cleanup:"
      echo "${debug_pods}" | sed 's/^/  - /'
      log_info "To clean up manually: kubectl delete pod <pod-name> -n ${NAMESPACE}"
    fi
  fi
}

# Register cleanup function to run on script exit
trap cleanup EXIT

# --- Execution ---
log_info "Starting debug session with the following parameters:"
log_info "  Node:       ${NODE_NAME}"
log_info "  Image:      ${DEBUG_IMAGE}"
log_info "  Namespace:  ${NAMESPACE}"
log_info "--------------------------------------------------------"
log_info "Once connected, access the host system with:"
log_info "  chroot /host                    # Change to host filesystem"
log_info "  nsenter -t 1 -p -n ps aux      # View host processes"
log_info "  nsenter -t 1 -n netstat -tulpn # Check network connections"
log_info "  chroot /host systemctl status kubelet # Check kubelet service"
log_info "--------------------------------------------------------"

# Start debug session with error handling
if ! kubectl debug node/"${NODE_NAME}" \
  -it \
  --image="${DEBUG_IMAGE}" \
  --profile=sysadmin \
  -n "${NAMESPACE}"; then
    log_error "Debug session failed to start"
    log_info "Troubleshooting steps:"
    log_info "  1. Verify node status: kubectl get node ${NODE_NAME}"
    log_info "  2. Check namespace exists: kubectl get namespace ${NAMESPACE}"
    log_info "  3. Ensure sufficient permissions for debug operations"
    log_info "  4. Check cluster connectivity: kubectl cluster-info"
    exit 1
fi

log_info "Debug session completed successfully"
