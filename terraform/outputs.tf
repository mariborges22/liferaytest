output "cluster_name" {
  description = "EKS Cluster Name"
  value       = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  description = "EKS Cluster API Endpoint"
  value       = aws_eks_cluster.main.endpoint
}

output "github_actions_role_arn" {
  description = "IAM Role ARN to configure in GitHub Actions for passwordless OIDC deployments"
  value       = aws_iam_role.github_actions.arn
}

output "app_secrets_role_arn" {
  description = "IAM Role ARN for Kubernetes Service Account (IRSA) to access Secrets Manager"
  value       = aws_iam_role.app_secrets_reader.arn
}

output "db_credentials_secret_arn" {
  description = "ARN of the Database Credentials Secret in AWS Secrets Manager"
  value       = aws_secretsmanager_secret.db_credentials.arn
}
