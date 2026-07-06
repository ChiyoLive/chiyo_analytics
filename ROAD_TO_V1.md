# Road to v1.0.0 (Production-Ready Release)

This document outlines the roadmap and missing requirements before Chiyo Analytics can be officially tagged as a production-ready `v1.0.0` release.

---

## 🛠️ Roadmap Checklist

### 1. Ingestion Queue Reliability
- [x] **Redis Streams Migration**: Replace `LPUSH`/`BRPOP` with Redis Streams (`XADD`/`XREADGROUP`) to implement consumer groups.
- [x] **At-Least-Once Delivery**: Implement a two-phase check or ACK pattern (e.g. pending list processing) to ensure that if a Go Worker crashes mid-batch, no event data is lost.
- [x] **Dead Letter Queue (DLQ)**: Handle corrupt or unparseable event payloads by pushing them to a dedicated DLQ instead of discarding them.

### 2. Collector Protection & Security
- [x] **Rate Limiting**: N/A (Managed by reverse proxy like Nginx/Caddy; reference configs in `deployment/PROJECT.md`)
- [x] **Payload Size Limit**: N/A (Managed by reverse proxy like Nginx/Caddy; reference configs in `deployment/PROJECT.md`)
- [x] **Dynamic Site ID Whitelisting**: Replace the static configuration list (`allowed_site_ids`) with a dynamic check querying Redis (with fallback to database), allowing new sites to be registered without restarting backend services.
- [x] **Session-Bound Secure Tokens**: Sites can configure a `jwks_url` to verify asymmetric JWT tokens on `/collect`, protecting against client-side spoofing.

### 3. ClickHouse Storage Optimization & Lifecycle
- [x] **Data Retention Policy (TTL)**: N/A (Deferred to v2). Implement automatic data cleaning (e.g., delete events older than 90 days / 1 year) using ClickHouse's native table TTL via a configurable `retention_days` parameter.
- [x] **Table Partitioning**: Schema partitioned by month (`PARTITION BY toYYYYMM(timestamp)`) to improve range query speeds and optimize space reclamation.
- [x] **Connection Pool Tuning**: N/A. The project uses `clickhouse-go/v2` native protocol (`clickhouse.Conn`), which does not use `database/sql`-style connection pooling. The single-connection model is sufficient for the self-hosted analytics use case.

### 4. Authentication, Roles & Multi-Tenancy
- [x] **Dashboard Access Control**: Built a sleek, secure login portal for the Next.js Dashboard using client-side JWT storage and server-side authentication proxying.
- [x] **Tenant Isolation**: Implemented relational site-mapping (`public.user_sites` table) and middleware checking on Go Query API routes to strictly enforce tenant site ownership.
- [x] **Dynamic API Token Management**: Replace the static token in `chiyo_analytics.toml` with cryptographically secure API keys generated per tenant/organization, allowing revoke and rotation. (Note: Dashboard API accesses have been migrated to use JWT user sessions).

### 5. SDK Enhancements & Compliance
- [x] **Custom Event Tracking**: Support tracking custom events (e.g., clicks, form submissions, purchases) via a new SDK API (e.g., `trackEvent('event_name', { key: 'value' })`).
- [x] **Offline Event Caching**: N/A (Cancelled - Not planned for web SDK). Buffer beacons in `localStorage` when the client is offline, sending them in batches when the connection is restored.
- [x] **Privacy Compliance**: Respect browser Do-Not-Track (DNT) and Global Privacy Control (GPC) signals dynamically based on IP country code, with public opt-in/opt-out SDK APIs.

### 6. Automated Testing & Code Quality
- [x] **Go Backend Tests**: N/A (Fully covered unit test deferred to v2). Write unit tests for config parser, IP/UA parsers, and integration tests for collector-to-worker-to-ClickHouse flow.
- [x] **Frontend SDK/Dashboard Tests**: N/A (Fully covered ui test deferred to v2). Set up Vitest/Jest tests for JS SDK behavior (history interception, duration calculation) and Dashboard UI components.
- [x] **CI Pipeline**: N/A (Deferred to v2). Add GitHub Actions workflow to run linters (`golangci-lint`, `eslint`) and execute the test suite on every pull request.

### 7. Deployment, Operations & Observability
- [x] **Health Probes**: Expose `/healthz` liveness and `/readyz` readiness endpoints in collector, worker, and query API for Docker health checks.
- [x] **Structured Logging**: Already implemented in Go backend using standard `log/slog` (outputs structured JSON in production mode).
- [x] **Metrics Exporting**: N/A (Deferred to v2 / skipped for single-server deployment).
- [x] **Production Deployment Manifests**: Provide a production-ready `docker-compose.prod.yaml` (containerizing the Go services) in the `deployment/single_server_docker` directory.
