# GitOps com ArgoCD

Este diretório contém os manifestos declarativos de GitOps para o [ArgoCD](https://argo-cd.readthedocs.io/).

## 📁 Estrutura

- `application-local.yaml`: Define a aplicação para ambiente local (Kind/Minikube), consumindo o Helm Chart com `values-local.yaml`.
- `application-production.yaml`: Define a aplicação para ambiente de produção (AWS EKS), consumindo o Helm Chart com `values-production.yaml`.

---

## 🚀 Como Executar no Cluster Local (Kind / Minikube)

### 1. Instalar o ArgoCD no cluster
```bash
# Criar o namespace dedicado
kubectl create namespace argocd

# Aplicar a instalação estável oficial do ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Aguardar pods ficarem prontos
kubectl wait --namespace argocd --for=condition=ready pod --all --timeout=180s
```

### 2. Acessar a Interface Web do ArgoCD (Opcional)
```bash
# Port-forward para porta local 8080
kubectl port-forward svc/argocd-server -n argocd 8080:443
```
- Acesse em: `https://localhost:8080`
- Usuário: `admin`
- Senha inicial (gerada automaticamente):
  ```bash
  kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
  ```

### 3. Aplicar a Application GitOps
```bash
# Aplica a Application local
kubectl apply -f argocd/application-local.yaml
```

O ArgoCD irá automaticamente clonar o repositório, renderizar o Helm Chart com o `values-local.yaml` e reconciliar o estado do cluster de forma contínua com `selfHeal` e `prune`.
