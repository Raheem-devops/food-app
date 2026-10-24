# Food App: CI/CD and Autoscaling on Kubernetes

A Node.js food delivery API deployed with a full DevOps pipeline.

- **CI/CD:** GitHub Actions (self-hosted runner), Docker Hub
- **Runtime:** Kubernetes (Minikube) on AWS EC2, with a Horizontal Pod Autoscaler (2 to 8 pods)
- **Monitoring:** Prometheus and Grafana
- **Alerts:** Slack webhook

## Endpoints
| Path | Returns |
|---|---|
| `/` | Restaurant page |
| `/api/restaurants` | JSON list of restaurants |
| `/version` | Current release |
| `/health` | Health check |
| `/metrics` | Prometheus metrics |
EOFcat > README.md << 'EOF'
# Food App: CI/CD and Autoscaling on Kubernetes

A Node.js food delivery API deployed with a full DevOps pipeline.

- **CI/CD:** GitHub Actions (self-hosted runner), Docker Hub
- **Runtime:** Kubernetes (Minikube) on AWS EC2, with a Horizontal Pod Autoscaler (2 to 8 pods)
- **Monitoring:** Prometheus and Grafana
- **Alerts:** Slack webhook

## Endpoints
| Path | Returns |
|---|---|
| `/` | Restaurant page |
| `/api/restaurants` | JSON list of restaurants |
| `/version` | Current release |
| `/health` | Health check |
| `/metrics` | Prometheus metrics |
