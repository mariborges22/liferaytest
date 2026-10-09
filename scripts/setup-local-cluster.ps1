$ErrorActionPreference = "Stop"

$ClusterName = "interview-cluster"
$ImageTag = "mariborges22/infrastructure-interview-app:1.0.0"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Starting Full Automated Local Kubernetes Cluster Setup" -ForegroundColor Cyan
Write-Host " Multi-AZ High Availability (3 Zones) + Ingress + Helm" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Check requirements
foreach ($cmd in @("kind", "kubectl", "helm", "docker")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "Required tool '$cmd' is not installed or not in PATH."
        exit 1
    }
}

# 1. Build image
Write-Host ">> Step 1: Building container image ($ImageTag)..." -ForegroundColor Yellow
docker build -t $ImageTag .

# 2. Create Kind cluster
$clusters = kind get clusters
if ($clusters -contains $ClusterName) {
    Write-Host ">> Kind cluster '$ClusterName' already exists." -ForegroundColor Green
} else {
    Write-Host ">> Step 2: Creating Kind cluster with 3 worker nodes in 3 AZs..." -ForegroundColor Yellow
    kind create cluster --config k8s/kind-cluster.yaml
}

# 3. Load image into cluster
Write-Host ">> Step 3: Loading container image into Kind cluster..." -ForegroundColor Yellow
kind load docker-image $ImageTag --name $ClusterName

# 4. Ingress Controller
Write-Host ">> Step 4: Installing NGINX Ingress Controller..." -ForegroundColor Yellow
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

Write-Host ">> Waiting for Ingress Controller to be ready..." -ForegroundColor Yellow
kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=180s

# 5. Database
Write-Host ">> Step 5: Deploying Database (MariaDB)..." -ForegroundColor Yellow
kubectl apply -f k8s/mariadb.yaml
kubectl rollout status deployment/mariadb --timeout=120s

# 6. Helm Deploy
Write-Host ">> Step 6: Deploying Application via Helm Chart..." -ForegroundColor Yellow
helm upgrade --install interview-app ./helm/infrastructure-interview-app `
  -f ./helm/infrastructure-interview-app/values-local.yaml

kubectl rollout status deployment/interview-app-infrastructure-interview-app --timeout=180s

# 7. Check pods and nodes
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Deployment Complete! Checking Pod Distribution across AZs:" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
kubectl get nodes -L topology.kubernetes.io/zone
kubectl get pods -o wide -l app.kubernetes.io/name=infrastructure-interview-app

# 8. Smoke tests
Write-Host ">> Step 7: Executing automated smoke tests against Ingress..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
$env:APP_URL = "http://localhost"
node tests/smoke-test.js

Write-Host "============================================================" -ForegroundColor Green
Write-Host " SUCCESS! Access API at http://localhost/posts" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
