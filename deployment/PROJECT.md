# Deployment Status & Design (cyanly)

This document provides a developer and AI Agent-oriented guide to the deployment architecture, configuration design, and management commands of `cyanly` (Chiyo Analytics).

---

## 🎯 Design Philosophy

The deployment engine is built with a self-hosting-first mindset, aiming for maximum simplicity, reproducibility, and minimal host environment requirements.

- **Zero-Dependency Host Environment**: The host server only requires Python 3 and Docker/Docker Compose. Developers and administrators do not need Go, Node.js, or pnpm installed on the target machine.
- **Python Zipapp (`.pyz`) via Shiv**: The CLI helper (`cyanly.pyz`) and installer (`install-cyanly.pyz`) are distributed as lightweight, self-contained Python executable zipapps built using `shiv`.
  - *Why Python?* Platform-independent, cleaner layout, and easier code management than complex shell scripts. Since modern Linux distributions come with a Python 3 interpreter, utilizing dependency-bundled zipapps provides a robust and seamless installer interface.
- **Containerized Core Stack**: All application services (`cyanly-collector`, `cyanly-worker`, `cyanly-api`, `cyanly-dashboard`) and datastores (PostgreSQL, ClickHouse, Redis) are run inside isolated Docker container network namespaces.
- **SSRF Protection in Production**: When `app.env = "production"`, outbound network requests from the collector (such as fetching JWKS endpoints to verify session tokens for sites configured in the `public.sites` table) will explicitly reject loopback/private/link-local/metadata IP targets. Local testing and development can bypass this by setting `app.env = "development"`.

---

## 📦 Deployment Target: Single Server Docker (`single_server_docker`)

This is the primary deployment target, provisioning the entire aggregate analytics platform on a single host.

**NOTE:**
Reverse Proxy Management: Users must manually configure and manage their own reverse proxy. The deployment engine is solely responsible for spinning up the service stack and publishing the application ports declared in the Docker Compose template. The current template uses Docker's default host bind behavior for published ports; restrict exposure with a reverse proxy, firewall, or Compose override as needed.

### Port Topology
The current single-server Compose template publishes these application ports to the host:
- **Collector API**: `8080` (Endpoints: `/collect` for telemetry beacons, `/sdk/*` for tracking scripts)
- **Query API**: `8081` (Endpoints: `/api/*` for dashboard queries and administration)
- **Next.js Dashboard**: `8079` (Endpoints: `/*` for user interface)
- **Worker Health**: `8082` (HTTP health server for liveness/readiness probes)

The datastore ports are used inside the Docker network and are not published to the host by the single-server deployment template:
- **Redis**: `6379` (Internal queue buffer, stream key: `cyanly:events`)
- **ClickHouse**: `9000` (Native TCP connection for analytics)
- **PostgreSQL**: `5432` (Metadata repository, site authorizations, policy records)

Each datastore has a `[<datastore>.deploy.single_server_docker]` section in `chiyo_analytics.toml`:
- `external = true` removes the bundled datastore container and its generated Compose dependencies so services connect to the configured external `addr`.
- `host_port = <port>` publishes the bundled datastore port for host-side debugging or integrations while preserving container-internal connectivity.
- ClickHouse uses explicit `native_host_port = <port>` and `http_host_port = <port>` fields instead of `host_port`, because it has both native TCP (`9000`) and HTTP (`8123`) interfaces.
- `volume = "<name-or-path>"` replaces the default named volume with either another named volume or a bind mount path such as `/mnt/data/postgres`.

The installer reads TOML with Python's standard `tomllib` and renders Docker Compose with `ruamel.yaml` structured YAML updates. The checked-in Compose template remains valid YAML; generation mutates service maps, dependency maps, port lists, and volume declarations rather than relying on block-level string replacement.

### Configurations & Seeding
- **Configuration File**: `chiyo_analytics.toml`
  - Configures JWT secrets, database connection settings, trusted proxies, CORS rules, and GeoIP updater parameters.
- **Environment Variables**:
  - The installer dynamically extracts configuration parameters and writes a `.env` file under the target folder to supply database secrets and API domains to the Docker Compose execution environment.
- **Automatic Database Seeding**:
  - On the first boot, the collector seeds default entries in the PostgreSQL `public.sites` table from `init_allowed_sites`.
  - The API server seeds the superuser login details in the `public.users` table from the `[api.superuser]` config section.

---

## 🔁 Deployment Lifecycle & Commands

### 1. Initial Installation (`install-cyanly.pyz`)
Distributed as the bootstrap installer script.
- **`python3 install-cyanly.pyz config [--config <path> | -c <path>]`**:
  - Generates the `./cyanly-preinstall/` directory and creates the template configuration `chiyo_analytics.toml` (unless a custom config file path is provided via `--config` or `-c`).
- **`python3 install-cyanly.pyz gen [--dest <path>] [--config <path> | -c <path>]`**:
  - Reads `./cyanly-preinstall/chiyo_analytics.toml` (or the custom configuration file path provided via `--config` or `-c`) and generates `docker-compose.yaml` and `.env` in the target directory (defaults to `~/.cyanly`).
  - If `--dest` is omitted, uses the active directory recorded in `~/.cyanly_installed` when valid, otherwise falls back to `~/.cyanly`.
  - Prompts before overwriting existing generated files unless `-y` or `--yes` is provided.
  - Downloads GeoIP databases (`dbip-city-ipv4.mmdb`, `dbip-city-ipv6.mmdb`, `origin-asn.mmdb`) to the installation's `/geoip` directory.
  - Extracts the management script `cyanly.pyz` into the install path.
  - Records the absolute active installation path in `~/.cyanly_installed`.
- **`python3 install-cyanly.pyz up [--dest <path>]`**:
  - Starts the Docker Compose containers from an existing generated installation directory.
  - If `--dest` is omitted, uses the active directory recorded in `~/.cyanly_installed` when valid, otherwise falls back to `~/.cyanly`.
  - Records the absolute active installation path in `~/.cyanly_installed` after a successful start.
- **`python3 install-cyanly.pyz install [--dest <path>] [--config <path> | -c <path>]`**:
  - Runs `gen` and then `up` for the same target directory.
  - Boots up the Docker Compose containers.

### 2. Stack Management (`cyanly.pyz`)
Once installed, run the management script from the installation directory to manage the active installation lifecycle. The management CLI reads `~/.cyanly_installed` first and validates that the recorded directory contains `docker-compose.yaml`; if the pointer is absent or invalid, it falls back to `~/.cyanly`; if neither path is valid, it exits with a clear error.
- **`python3 cyanly.pyz up [service]`**:
  - Runs `docker compose up -d [service]` against the existing generated Compose file. It does not regenerate `.env` or `docker-compose.yaml`.
- **`python3 cyanly.pyz restart [service]`**:
  - Restarts the given service or the entire stack.
- **`python3 cyanly.pyz uninstall [--volume]`**:
  - Stops and destroys all application containers and networks. Removes the installation folder and clears `~/.cyanly_installed` when it points to the removed directory.
  - *Warning:* Passing `--volume` (or `-v`) will permanently delete PostgreSQL and ClickHouse Docker volumes, purging all stored tracking data.

---

## 🛠️ Development & Compilation Guidelines

For developers modifying the deployment scripts, CLI managers, or Dockerfiles:

### Rebuilding Python Zipapps
The build script packs all scripts, templates, and libraries using `shiv`.
1. **Prepare the workspace environment**:
   Make sure you have standard development dependencies synchronised (includes `shiv` packaging tool):
   ```bash
   uv sync
   ```
2. **Build the packages**:
   Navigate to the `deployment/` directory and run:
   ```bash
   python3 build.py
   ```
   This will:
   - Copy `../mng_scripts/geoip_mng.py` with an auto-generated comment header to `deployment/common/geoip_mng.py`.
   - Compile `cyanly.pyz` (entrypoint: `cyanly:main`) and `install-cyanly.pyz` (entrypoint: `install-cyanly:main`).
   - Output compiled zipapps into `deployment/dist/`.

### Installer Tests
The deployment installer has local Python tests under `deployment/tests`. They isolate `HOME` and the working directory with pytest fixtures, mock GeoIP downloads and Docker execution, and use syrupy snapshots for generated `.env` and `docker-compose.yaml` output.

Run the tests from the project root:
```bash
uv run python mng.py test deployment
```

Update snapshots after intentional installer output changes:
```bash
uv run pytest deployment/tests --snapshot-update
```

### Local Docker Image Validation
To build local images to verify backend compiling or dashboard UI bundling:
- **Backend Image** (Ingests, worker, schema migrations `cy_migrate`, database updater):
  ```bash
  docker build -t ghcr.io/chiyolive/cyanly-backend:latest -f deployment/single_server_docker/backend.Dockerfile .
  ```
- **Dashboard Image** (Next.js server-side component standalone build):
  ```bash
  docker build -t ghcr.io/chiyolive/cyanly-dashboard:latest -f deployment/single_server_docker/dashboard.Dockerfile .
  ```
*Note: Always build from the project root directory because the Dockerfiles reference the backend code and compilation dependencies located at the root level.*

---

## 🔌 Reverse Proxy Configuration (Caddy & Nginx)

Since the application ports are published by Docker Compose, it is highly recommended to proxy traffic through a secure gateway and restrict direct host-port exposure with firewall rules or a Compose override.

### Routing Rules

All external traffic must be routed through the reverse proxy to the correct backend service. The route matching order matters — more specific prefixes must be matched before the catch-all dashboard route.

| Route Pattern | Backend | Port | Purpose |
|---------------|---------|------|---------|
| `/collect` | Collector | 8080 | Telemetry beacon ingestion (`POST`) and GeoIP lookup (`GET /collect/geo`) |
| `/sdk/*` | Collector | 8080 | Tracking SDK scripts (served when `serve_sdk = true`; the backend sets `Cache-Control: public, max-age=300`) |
| `/api/*` | Query API | 8081 | Dashboard API: auth (`/api/v1/auth/*`), user management (`/api/v1/users/*`), site management (`/api/v1/sites/*`), analytics queries (`/api/v1/analytics/*`) |
| `/*` | Dashboard | 8079 | Next.js web UI (catch-all fallback) |

### Security Notes

- **Client IP forwarding is critical.** The backend uses Gin's `c.ClientIP()` to extract the real client IP from `X-Real-IP` / `X-Forwarded-For` headers, but **only when the request originates from a trusted proxy** (configured via `trusted_proxies` in `chiyo_analytics.toml`). This IP is used for GeoIP enrichment on `/collect` and Redis-based login rate limiting on `/api/v1/auth/login` (5 attempts per 15 minutes per IP). If headers are missing or the proxy is not trusted, the backend falls back to the TCP remote address, which would be `127.0.0.1` — defeating both features.
- **Do not add CORS headers at the proxy layer.** CORS is fully managed by the Go backend's middleware (Collector and API each have their own logic controlled by `cors_allowed_origins`). Adding proxy-level CORS headers will cause duplicated or conflicting headers.
- **Security headers should be added at the proxy layer.** The backend does not set HSTS, X-Frame-Options, X-Content-Type-Options, or Referrer-Policy headers. These should be enforced by the reverse proxy.
- **Health probe endpoints (`/healthz`, `/readyz`) should not be exposed externally.** They are designed for container orchestrators (Docker healthchecks, Kubernetes probes) on the internal network.
- **Admin route authentication is handled by the Go backend.** Routes under `/api/v1/users/*` and `/api/v1/sites/*` require superuser-level JWT authentication enforced by the API server's middleware. No additional proxy-level access control is strictly necessary, though IP whitelisting can be added as defense-in-depth.

### Caddy v2 Example

```caddyfile
analytics.example.com {
    # --- Security Headers ---
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options    "nosniff"
        X-Frame-Options           "DENY"
        Referrer-Policy           "strict-origin-when-cross-origin"
        -Server
    }

    # --- Request Body Limits ---
    request_body /collect      10k
    request_body /api/*        50k

    # --- Block Health Probes from External Access ---
    handle /healthz {
        respond "Not Found" 404
    }
    handle /readyz {
        respond "Not Found" 404
    }

    # --- Collector (port 8080) ---
    handle /collect* {
        reverse_proxy 127.0.0.1:8080 {
            header_up X-Real-IP {remote_host}
        }
    }

    handle /sdk/* {
        reverse_proxy 127.0.0.1:8080
    }

    # --- Query API (port 8081) ---
    handle /api/* {
        reverse_proxy 127.0.0.1:8081 {
            header_up X-Real-IP {remote_host}
        }
    }

    # --- Dashboard (port 8079) ---
    handle {
        reverse_proxy 127.0.0.1:8079
    }

    encode gzip zstd
}
```

### Nginx Example

```nginx
# --- Rate Limiting Zones ---
# Collect endpoint: 120 req/min per IP, burst allows short spikes.
limit_req_zone $binary_remote_addr zone=cyanly_collect:10m rate=120r/m;
# API endpoints: 300 req/min per IP (dashboard loads trigger 5-8 concurrent calls).
limit_req_zone $binary_remote_addr zone=cyanly_api:10m      rate=300r/m;
# Login endpoint: 10 req/min per IP (backend has its own Redis-based 5/15min limit).
limit_req_zone $binary_remote_addr zone=cyanly_login:10m    rate=10r/m;

# --- Upstreams ---
upstream cyanly_collector {
    server 127.0.0.1:8080;
    keepalive 32;
}
upstream cyanly_api {
    server 127.0.0.1:8081;
    keepalive 16;
}
upstream cyanly_dashboard {
    server 127.0.0.1:8079;
    keepalive 8;
}

# --- HTTP → HTTPS Redirect ---
server {
    listen 80;
    server_name analytics.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name analytics.example.com;

    # SSL Configuration (update paths to your certificates)
    # ssl_certificate     /etc/letsencrypt/live/analytics.example.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/analytics.example.com/privkey.pem;

    # --- Security Headers ---
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header X-Frame-Options           "DENY" always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;

    # --- Gzip Compression ---
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 256;

    # --- Block Health Probes from External Access ---
    location = /healthz { return 404; }
    location = /readyz  { return 404; }

    # --- Collector: Telemetry Ingestion & GeoIP (port 8080) ---
    location /collect {
        limit_req zone=cyanly_collect burst=30 nodelay;
        client_max_body_size 10k;

        proxy_pass         http://cyanly_collector;
        proxy_http_version 1.1;
        proxy_set_header   Connection "";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # --- Collector: SDK Scripts (port 8080) ---
    location /sdk/ {
        proxy_pass         http://cyanly_collector;
        proxy_http_version 1.1;
        proxy_set_header   Connection "";
        proxy_set_header   Host $host;
    }

    # --- API: Login (port 8081, stricter rate limit) ---
    # Auth is handled by the Go backend (JWT + Redis-based login rate limiting).
    location = /api/v1/auth/login {
        limit_req zone=cyanly_login burst=5 nodelay;
        client_max_body_size 5k;

        proxy_pass         http://cyanly_api;
        proxy_http_version 1.1;
        proxy_set_header   Connection "";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # --- API: All Other Endpoints (port 8081) ---
    # Admin routes (/api/v1/users/*, /api/v1/sites/*) require superuser JWT — enforced by Go backend middleware.
    location /api/ {
        limit_req zone=cyanly_api burst=50 nodelay;
        client_max_body_size 50k;

        proxy_pass         http://cyanly_api;
        proxy_http_version 1.1;
        proxy_set_header   Connection "";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # --- Dashboard: Next.js UI (port 8079, catch-all) ---
    location / {
        proxy_pass         http://cyanly_dashboard;
        proxy_http_version 1.1;
        proxy_set_header   Connection "";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```
