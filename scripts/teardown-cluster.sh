#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="interview-cluster"

echo "Tearing down Kind cluster: ${CLUSTER_NAME}..."
kind delete cluster --name "${CLUSTER_NAME}"
echo "Cluster deleted successfully."
