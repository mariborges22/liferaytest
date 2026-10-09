# ==============================================================================
# SECRETS MANAGEMENT BEST PRACTICES
# 1. AWS KMS Customer Managed Key (CMK) for Envelope Encryption
# 2. AWS Secrets Manager for Storing DB Credentials
# 3. Dynamic Password Generation (No passwords stored in code or git!)
# ==============================================================================

# KMS Key for encrypting Secrets & Kubernetes Secrets at rest
resource "aws_kms_key" "secrets" {
  description             = "KMS Key for EKS and Application Secrets encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name = "${var.cluster_name}-secrets-kms"
  }
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${var.cluster_name}-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# Generate cryptographically secure random password
resource "random_password" "db_password" {
  length           = 24
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# AWS Secrets Manager Secret
resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "${var.environment}/database/credentials"
  kms_key_id              = aws_kms_key.secrets.arn
  recovery_window_in_days = 0

  tags = {
    Name = "${var.environment}-db-credentials"
  }
}

# Store Secret Values in Secrets Manager
resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = "admin"
    password = random_password.db_password.result
    engine   = "mariadb"
    port     = 3306
    database = "app_prod"
  })
}
