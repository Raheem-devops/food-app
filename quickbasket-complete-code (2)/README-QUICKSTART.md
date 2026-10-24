# QuickBasket application upgrade

This upgrade keeps the existing Node.js + Express + PostgreSQL + Kubernetes architecture from the repository and adds:
- PostgreSQL-backed restaurant and menu endpoints
- Guest checkout with server-side price validation
- Order persistence and tracking codes
- Admin order list/status endpoints protected by `ADMIN_TOKEN`
- Prometheus `orders_placed_total` and HTTP duration metrics
- Responsive browser UI for restaurant browsing, menu, cart, checkout and tracking

## Important data safety
The application uses `CREATE TABLE IF NOT EXISTS` and `INSERT ... ON CONFLICT DO NOTHING`. It does not drop tables, truncate tables, or delete the existing three restaurant records. Take a database backup before applying any schema change.

## Files to copy
Copy `app.js`, `server.js`, `db.js`, `package.json`, `Dockerfile`, `.dockerignore`, `app.test.js`, and the complete `public/` directory into the root of your existing `~/food-app` repository. Do not replace your `k8s/` directory or monitoring manifests.

## Environment expected by the app
The app supports either:
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, or
- `DATABASE_URL`

For your current Kubernetes database service, use PGHOST=postgres, PGDATABASE=foodapp, PGUSER=foodapp, and the password already held by your existing `food-db` Secret. Add ADMIN_TOKEN to that Secret (or a separate Secret) before using admin endpoints. Never put credentials in Git.

## API
- `GET /api/restaurants`
- `GET /api/restaurants/:id/menu`
- `POST /api/orders`
- `GET /api/orders/:trackingCode`
- `GET /api/admin/orders` (requires `x-admin-token`)
- `PATCH /api/admin/orders/:id/status` (requires `x-admin-token`)
- `GET /health`, `/version`, `/metrics`

## Build and test locally
```bash
npm install
npm test
npm start
```

## Kubernetes rollout (after reviewing your existing Secret and deployment)
First back up current data:
```bash
kubectl exec deploy/postgres -- sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > foodapp-backup.sql
```
Then update the existing app Deployment's container image using your CI/CD pipeline or a newly pushed image. Keep the current postgres Deployment, PVC, Services, HPA, PDB and monitoring manifests. Ensure the app Deployment exposes port 3000 and receives PGHOST/PGDATABASE/PGUSER/PGPASSWORD from the existing Secret. Add `ADMIN_TOKEN` as a Kubernetes Secret key. Do not run `kubectl delete pvc`, `kubectl delete namespace`, or `DROP DATABASE`.

After rollout:
```bash
kubectl rollout status deployment/food-app
kubectl get pods
kubectl port-forward svc/food-app 8080:80
```
Open `http://localhost:8080`.

## Admin API example
```bash
curl -H "x-admin-token: $ADMIN_TOKEN" http://localhost:8080/api/admin/orders
curl -X PATCH -H "Content-Type: application/json" -H "x-admin-token: $ADMIN_TOKEN" \\
  -d '{"status":"preparing"}' http://localhost:8080/api/admin/orders/1/status
```
The status endpoint is a demo control. For production, add real admin authentication, authorization, audit logs, rate limits, HTTPS and payment-provider integration.
