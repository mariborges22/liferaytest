.PHONY: help build test scan helm-lint cluster-up cluster-down clean

IMAGE_NAME ?= mariborges22/infrastructure-interview-app
IMAGE_TAG ?= 1.0.0

help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

build: ## Build the multi-stage Docker image
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .

test: ## Run automated smoke tests (requires app running or APP_URL set)
	node tests/smoke-test.js

scan: ## Run Trivy vulnerability and misconfiguration scan
	./scripts/security-scan.sh $(IMAGE_NAME):$(IMAGE_TAG)

helm-lint: ## Validate and lint the Helm chart
	helm lint ./helm/infrastructure-interview-app

cluster-up: ## Provision local 3-AZ Kind cluster, deploy MariaDB, Helm app and run smoke tests
	./scripts/setup-local-cluster.sh

cluster-down: ## Delete local Kind cluster
	./scripts/teardown-cluster.sh

clean: ## Clean local compilation artifacts
	rm -rf dist node_modules
