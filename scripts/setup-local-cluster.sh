#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="interview-cluster"
IMAGE_TAG="mariborges22/infrastructure-interview-app:1.0.0"

echo "============================================================"
echo " Starting Full Automated Local Kubernetes Cluster Setup"
echo " Multi-AZ High Availability (3 Zones) + Ingress + Helm"
echo "============================================================"

# 1. Check requirements
for cmd in kind kubectl helm docker; do
    if ! command -v "$cmd" &> /dev/null; then
        echo "Error: Required command '$cmd' is not installed or not in PATH."
        exit 1
    fi
done

# 2. Build application container image
echo ">> Step 1: Building container image (${IMAGE_TAG})..."
docker build -t "${IMAGE_TAG}" .

# 3. Create Kind cluster if it does not exist
if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
    echo ">> Kind cluster '${CLUSTER_NAME}' already exists."
else
    echo ">> Step 2: Creating Kind cluster with 3 worker nodes in 3 AZs..."
    kind create cluster --config k8s/kind-cluster.yaml
fi

# 4. Load Docker image into Kind cluster nodes
echo ">> Step 3: Loading container image into Kind cluster..."
kind load docker-image "${IMAGE_TAG}" --name "${CLUSTER_NAME}"

# 5. Install NGINX Ingress Controller
echo ">> Step 4: Installing NGINX Ingress Controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

echo ">> Waiting for Ingress Controller to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s

# 6. Deploy Database (MariaDB)
echo ">> Step 5: Deploying Database (MariaDB)..."
kubectl apply -f k8s/mariadb.yaml

echo ">> Waiting for MariaDB to be ready..."
kubectl rollout status deployment/mariadb --timeout=120s

# 7. Deploy Application via Helm
echo ">> Step 6: Deploying Application via Helm Chart..."
helm upgrade --install interview-app ./helm/infrastructure-interview-app \
  -f ./helm/infrastructure-interview-app/values-local.yaml

echo ">> Waiting for Application Pods rollout..."
kubectl rollout status deployment/interview-app-infrastructure-interview-app --timeout=180s

# 8. Display Cluster State & Pod Distribution across AZs
echo "============================================================"
echo " Deployment Complete! Checking Pod Distribution across AZs:"
echo "============================================================"
kubectl get nodes -L topology.kubernetes.io/zone
echo ""
kubectl get pods -o wide -l app.kubernetes.io/name=infrastructure-interview-app
echo ""

# 9. Execute automated smoke tests
echo ">> Step 7: Executing automated smoke tests against Ingress (http://localhost)..."
sleep 5
APP_URL="http://localhost" ./tests/smoke-test.sh

echo "============================================================"
echo " SUCCESS! The environment is up and fully operational."
echo " Access the API at: http://localhost/posts"
echo " Health probe:      http://localhost/healthz"
echo " Readiness probe:   http://localhost/readyz"
echo "============================================================"
