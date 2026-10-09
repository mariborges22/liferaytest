$ClusterName = "interview-cluster"
Write-Host "Tearing down Kind cluster: $ClusterName..." -ForegroundColor Yellow
kind delete cluster --name $ClusterName
Write-Host "Cluster deleted successfully." -ForegroundColor Green
