#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${1:-infrastructure-interview-app:latest}"

echo "=========================================="
echo " Trivy Security & Vulnerability Scan"
echo " Image: ${IMAGE_NAME}"
echo "=========================================="

if command -v trivy &> /dev/null; then
    echo "Running local trivy CLI..."
    trivy image --config trivy.yaml "${IMAGE_NAME}"
    echo "Scanning filesystem and IaC misconfigurations..."
    trivy fs --config trivy.yaml .
elif command -v docker &> /dev/null; then
    echo "Running trivy via Docker container..."
    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
      -v "$(pwd)/trivy.yaml:/trivy.yaml" \
      aquasec/trivy image --config /trivy.yaml "${IMAGE_NAME}"
elif command -v podman &> /dev/null; then
    echo "Running trivy via Podman container..."
    podman run --rm -v "$(pwd)/trivy.yaml:/trivy.yaml" \
      aquasec/trivy image --config /trivy.yaml "${IMAGE_NAME}"
else
    echo "Error: Neither trivy CLI nor container runtime (docker/podman) is installed."
    echo "Install Trivy from: https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
    exit 1
fi

echo "=========================================="
echo " Trivy scan completed successfully!"
echo "=========================================="
