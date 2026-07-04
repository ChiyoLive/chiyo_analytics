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
- **`python3 install-cyanly.pyz config`**:
  - Generates the `./cyanly-preinstall/` directory and creates the template configuration `chiyo_analytics.toml`.
- **`python3 install-cyanly.pyz install [--dest <path>]`**:
  - Reads `./cyanly-preinstall/chiyo_analytics.toml` and generates `docker-compose.yaml` and `.env` in the target directory (defaults to `~/.cyanly`).
  - Downloads GeoIP databases (`dbip-city-ipv4.mmdb`, `dbip-city-ipv6.mmdb`, `origin-asn.mmdb`) to the installation's `/geoip` directory.
  - Extracts the management script `cyanly.pyz` into the install path.
  - Boots up the Docker Compose containers.
  - After Docker Compose starts successfully, records the absolute active installation path in `~/.cyanly_installed`.

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

## 🔌 Reverse Proxy Mapping (Nginx & Caddy)

Since the application ports are published by Docker Compose, it is highly recommended to proxy traffic through a secure gateway and restrict direct host-port exposure with firewall rules or a Compose override.

### Caddy v2 Example
```caddyfile
analytics.example.com {
    reverse_proxy /collect* 127.0.0.1:8080
    reverse_proxy /sdk/* 127.0.0.1:8080
    reverse_proxy /api/* 127.0.0.1:8081
    reverse_proxy /* 127.0.0.1:8079

    encode gzip zstd
}
```

### Nginx Example
```nginx
server {
    listen 443 ssl;
    server_name analytics.example.com;

    # Include SSL configurations ...

    location /collect {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /sdk/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:8079;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
