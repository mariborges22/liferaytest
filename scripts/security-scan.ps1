param(
    [string]$ImageName = "infrastructure-interview-app:latest"
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Trivy Security & Vulnerability Scan" -ForegroundColor Cyan
Write-Host " Image: $ImageName" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

if (Get-Command trivy -ErrorAction SilentlyContinue) {
    Write-Host "Running local trivy CLI..." -ForegroundColor Yellow
    trivy image --config trivy.yaml $ImageName
    trivy fs --config trivy.yaml .
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "Running trivy via Docker container..." -ForegroundColor Yellow
    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "${PWD}/trivy.yaml:/trivy.yaml" aquasec/trivy image --config /trivy.yaml $ImageName
} elseif (Get-Command podman -ErrorAction SilentlyContinue) {
    Write-Host "Running trivy via Podman container..." -ForegroundColor Yellow
    podman run --rm -v "${PWD}/trivy.yaml:/trivy.yaml" aquasec/trivy image --config /trivy.yaml $ImageName
} else {
    Write-Error "Neither trivy CLI nor container runtime (docker/podman) is installed on PATH."
    exit 1
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host " Trivy scan completed successfully!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
