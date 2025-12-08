#!/bin/bash

# Debug script for Kubernetes nodes
# Creates a privileged debug pod on the target node for system troubleshooting
# Uses the sysadmin profile to access host filesystem and elevated privileges

set -euo pipefail

SCRIPT_NAME=$(basename $0)

# Default settings
DEBUG_IMAGE="ubuntu"
NAMESPACE="kube-system"
NODE_NAME=""
INTERACTIVE_MODE=false

# Internals for cleanup (compatible with macOS bash 3.2)
__NODE_DEBUGGER_PODS_BEFORE=""
__PODS_BASELINE_READY=false
__CLEANUP_DONE=false

usage() {
  cat << EOF
Launches a debug pod on a Kubernetes node for troubleshooting.

Usage: $(basename "$0") [-n <node-name>] [-i <image>] [-s <namespace>] [-I] [-h]

Options:
  -n <node-name>   Target node name (interactive selection if not provided)
  -i <image>       Container image (default: "$DEBUG_IMAGE")
  -s <namespace>   Namespace for debug pod (default: "$NAMESPACE")
  -I               Force interactive mode
  -h               Show this help

Useful commands in the debug pod:
  chroot /host                         # Access host filesystem
  nsenter -t 1 -p -n ps aux           # View host processes
  nsenter -t 1 -n netstat -tulpn      # Check network
  chroot /host systemctl status kubelet
  chroot /host crictl ps

Examples:
  $(basename "$0")                    # Interactive node selection
  $(basename "$0") -n worker-node-1   # Direct node specification
  $(basename "$0") -I -n worker-1     # Force interactive mode
EOF
  exit 1
}

log_info() {
  echo "[${SCRIPT_NAME}] $1"
}

log_error() {
  echo "[${SCRIPT_NAME}] ERROR: $1" >&2
}

log_warn() {
  echo "[${SCRIPT_NAME}] WARNING: $1" >&2
}

check_fzf_available() {
  if ! command -v fzf &> /dev/null; then
    log_warn "fzf not found. Interactive mode requires fzf."
    log_info "Install with: brew install fzf (macOS) or apt install fzf (Ubuntu)"
    return 1
  fi
  return 0
}

get_node_info() {
  kubectl get nodes -o custom-columns="\
NAME:.metadata.name,\
STATUS:.status.conditions[-1].type,\
ROLES:.metadata.labels.node-role\.kubernetes\.io/master,\
VERSION:.status.nodeInfo.kubeletVersion,\
INTERNAL-IP:.status.addresses[?(@.type=='InternalIP')].address" \
  --no-headers 2>/dev/null | \
  awk '{
    name=$1; status=$2; role=$3; version=$4; ip=$5;
    if (role == "<none>") role="worker";
    if (role != "worker") role="control-plane";
    printf "%-20s %-8s %-15s %-12s %s\n", name, status, role, version, ip
  }' | sort
}

get_node_troubleshooting_info() {
  local node_name="$1"
  
  echo "Node Troubleshooting for ${node_name}:"
  echo "======================================"
  echo
  
  # Check node conditions
  local ready_status disk_pressure memory_pressure pid_pressure
  ready_status=$(kubectl get node "${node_name}" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
  disk_pressure=$(kubectl get node "${node_name}" -o jsonpath='{.status.conditions[?(@.type=="DiskPressure")].status}' 2>/dev/null)
  memory_pressure=$(kubectl get node "${node_name}" -o jsonpath='{.status.conditions[?(@.type=="MemoryPressure")].status}' 2>/dev/null)
  pid_pressure=$(kubectl get node "${node_name}" -o jsonpath='{.status.conditions[?(@.type=="PIDPressure")].status}' 2>/dev/null)
  
  # Report issues
  if [[ "${disk_pressure}" == "True" ]]; then
    echo "ISSUE: Disk pressure detected"
    echo "  Check: chroot /host df -h"
    echo "  Clean: chroot /host crictl system df"
    echo
  fi
  
  if [[ "${memory_pressure}" == "True" ]]; then
    echo "ISSUE: Memory pressure detected"
    echo "  Check: chroot /host free -h"
    echo "  Monitor: nsenter -t 1 -p -n top"
    echo
  fi
  
  if [[ "${pid_pressure}" == "True" ]]; then
    echo "ISSUE: PID pressure detected"
    echo "  Check: nsenter -t 1 -p -n ps aux | wc -l"
    echo
  fi
  
  if [[ "${ready_status}" == "False" ]]; then
    echo "ISSUE: Node not ready"
    echo "  Check: chroot /host systemctl status kubelet"
    echo "  Logs: chroot /host journalctl -u kubelet -f"
    echo
  fi
  
  if [[ "${disk_pressure}" != "True" && "${memory_pressure}" != "True" && "${pid_pressure}" != "True" && "${ready_status}" != "False" ]]; then
    echo "Node appears healthy"
    echo
  fi
  
  echo "Standard debugging commands:"
  echo "  chroot /host df -h              # Disk usage"
  echo "  chroot /host free -h            # Memory usage"
  echo "  nsenter -t 1 -p -n top          # Processes"
  echo "  chroot /host systemctl status kubelet"
  echo "  chroot /host crictl ps          # Containers"
}

select_node_interactive() {
  log_info "Getting node information..."
  
  local node_info
  node_info=$(get_node_info) || {
    log_error "Failed to get node information"
    return 1
  }
  
  if [[ -z "${node_info}" ]]; then
    log_error "No nodes found"
    return 1
  fi
  
  log_info "Select a node:"
  echo
  
  local header="NAME                 STATUS   ROLE            VERSION      INTERNAL-IP"
  
  local selected_line
  selected_line=$(echo "${node_info}" | \
    fzf --header="${header}" \
        --header-lines=0 \
        --reverse \
        --height=15 \
        --border \
        --prompt="Node: " \
        --preview="$(declare -f get_node_troubleshooting_info); get_node_troubleshooting_info {1}" \
        --preview-window="right:50%:wrap" \
  ) || {
    log_info "Selection cancelled"
    return 1
  }
  
  NODE_NAME=$(echo "${selected_line}" | awk '{print $1}')
  
  if [[ -z "${NODE_NAME}" ]]; then
    log_error "No node selected"
    return 1
  fi
  
  log_info "Selected: ${NODE_NAME}"
  return 0
}

validate_node_exists() {
  local node_name="$1"
  if ! kubectl get node "${node_name}" &>/dev/null; then
    log_error "Node '${node_name}' not found"
    log_info "Available nodes:"
    kubectl get nodes --no-headers -o custom-columns=NAME:.metadata.name | sed 's/^/  - /'
    return 1
  fi
  return 0
}

validate_kubectl_context() {
  local current_context
  current_context=$(kubectl config current-context 2>/dev/null) || {
    log_error "No kubectl context set"
    return 1
  }
  log_info "Using context: ${current_context}"
  return 0
}

# Parse arguments
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

# Check prerequisites
if ! command -v kubectl &> /dev/null; then
  log_error "kubectl not found in PATH"
  exit 1
fi

if ! validate_kubectl_context; then
  exit 1
fi

# Node selection
if [[ "${INTERACTIVE_MODE}" == "true" ]] || [[ -z "${NODE_NAME}" ]]; then
  if ! check_fzf_available; then
    if [[ -z "${NODE_NAME}" ]]; then
      log_error "Need fzf for interactive mode or specify node with -n"
      exit 1
    else
      log_warn "fzf not available, using node: ${NODE_NAME}"
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

cleanup() {
  # Guard against double execution
  if [[ "${__CLEANUP_DONE}" == "true" ]]; then
    return 0
  fi
  __CLEANUP_DONE=true

  # Helper to list node-debugger pods on the selected node
  list_node_debugger_pods() {
    kubectl get pods -n "${NAMESPACE}" \
      --field-selector "spec.nodeName=${NODE_NAME}" \
      --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null | \
      grep -E '^node-debugger' || true
  }

  # If we never captured a baseline, avoid destructive guesses
  if [[ "${__PODS_BASELINE_READY}" != "true" ]]; then
    # Best-effort notice without deleting potentially unrelated pods
    local possible
    possible=$(list_node_debugger_pods)
    if [[ -n "${possible}" ]]; then
      log_warn "Debug session ended without baseline; possible leftover pods:"
      echo "${possible}" | sed 's/^/  - /'
      log_info "Manually clean with: kubectl delete pod <pod> -n ${NAMESPACE}"
    fi
    return 0
  fi

  # Compute pods created during this session: AFTER minus BEFORE
  local after before created
  after=$(list_node_debugger_pods | sort -u || true)
  before=$(printf "%s\n" "${__NODE_DEBUGGER_PODS_BEFORE}" | sort -u || true)
  # Use comm to find lines present in AFTER but not in BEFORE
  created=$(comm -13 <(printf "%s\n" "${before}") <(printf "%s\n" "${after}") || true)

  if [[ -z "${created}" ]]; then
    # Nothing to delete
    return 0
  fi

  log_info "Cleaning up debug pod(s):"
  local pod
  while IFS= read -r pod; do
    [[ -z "${pod}" ]] && continue
    echo "  - ${pod}"
    # Best-effort delete; don't fail script on errors
    kubectl delete pod "${pod}" -n "${NAMESPACE}" --ignore-not-found --wait=false >/dev/null 2>&1 || true
  done <<< "${created}"
}

# Set cleanup traps (EXIT covers normal exit; INT/TERM cover Ctrl-C/kill)
trap cleanup EXIT INT TERM

# Start debug session
log_info "Starting debug session:"
log_info "  Node: ${NODE_NAME}"
log_info "  Image: ${DEBUG_IMAGE}"
log_info "  Namespace: ${NAMESPACE}"
echo
log_info "Useful commands once connected:"
log_info "  chroot /host                    # Access host filesystem"
log_info "  nsenter -t 1 -p -n ps aux      # View host processes"
log_info "  chroot /host systemctl status kubelet"
echo

# Capture baseline of node-debugger pods on this node before starting session
__NODE_DEBUGGER_PODS_BEFORE=$(kubectl get pods -n "${NAMESPACE}" \
  --field-selector "spec.nodeName=${NODE_NAME}" \
  --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null | grep -E '^node-debugger' | sort -u || true)
__PODS_BASELINE_READY=true

if ! kubectl debug node/"${NODE_NAME}" \
  -it \
  --image="${DEBUG_IMAGE}" \
  --profile=sysadmin \
  -n "${NAMESPACE}"; then
    log_error "Debug session failed"
    log_info "Troubleshooting:"
    log_info "  1. kubectl get node ${NODE_NAME}"
    log_info "  2. kubectl get namespace ${NAMESPACE}"
    log_info "  3. Check permissions and cluster connectivity"
    exit 1
fi

log_info "Debug session completed"
