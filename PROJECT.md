# Chiyo Analytics (cyanly)

A modern, high-performance, and privacy-compliant aggregate analytics platform, built with a self-hosting-first mindset.

---

## 🏗️ Architecture Overview

Chiyo Analytics decouples ingestion from storage using a Redis-backed write buffer to ensure high performance and durability under heavy concurrent traffic.

```
[Web Browser]
      │
      ├─► Loads SDK (`/sdk/mpa.iife.js` or `cyanly_sdk/spa`)
      │
      └─► POST (navigator.sendBeacon)
            │
            ▼
    [Go Collector]  (Gin) ◄─── Validates site_id via Postgres-backed cache, Redis Pub/Sub updates & optional Session Tokens
            │
         XADD
            │
            ▼
     [Redis Buffer] (Stream: cyanly:events)
            │
         XREADGROUP
            │
            ▼
      [Go Worker]   (Daemon) ◄─── Parses IP (MMDB GeoIP/ASN) & UA (mileusna/useragent)
            │
       Batch Write (TCP native connection)
            │
            ▼
    [ClickHouse DB]  (Columnar storage for analytics queries)
            ▲
            │
        Native SQL Queries
            │
     [Go Query API]  (Gin) ◄─── Protected by Bearer Token
            ▲
            │
     [Dashboard UI]  (Next.js Dashboard)
```

*Note on Query API stability*: The Query API handles zero-traffic/empty dataset periods gracefully by safe-guarding division operations in ClickHouse queries (e.g., bounce rate calculations) and sanitizing `NaN`/`Inf` floating-point values in Go before serializing JSON responses. Additionally, the Top Referrers query automatically excludes internal referrers (self-referrals) where the referrer's domain matches the target page's domain to ensure accurate external traffic source statistics.

*Structured Logging*: All Go backend services and utilities utilize Go's structured logging package `log/slog` for structured, high-performance application logs.

*Fatal Error Handling*: All Go backend commands (`api`, `collector`, `cy_migrate`, `worker`, `updater`) utilize standard Go `panic` calls rather than direct `os.Exit` exits to allow proper defer stack unwinding and clean diagnostic reporting on connection/startup failures.

*Health Probes*: The Go Collector, Go Query API, and Go Worker expose HTTP `/healthz` liveness endpoints and `/readyz` readiness endpoints. Readiness checks verify each service's runtime dependencies dynamically and return `503 Service Unavailable` if dependencies are down: Collector checks Redis and Postgres, Query API checks Redis, Postgres, and ClickHouse, and Worker checks Redis and ClickHouse. The Worker exposes probes via a dedicated lightweight HTTP server and treats health server bind failures as fatal startup errors.

*GeoIP Hot-Reloading and Updates*: The Go Worker supports zero-downtime hot-reloading of MMDB GeoIP/ASN databases configured as `geoip.db_ipv4`, `geoip.db_ipv6`, and `geoip.db_asn`. A background watcher checks for modifications on the database files on a regular interval (every 5 minutes) and reloads them thread-safely using `sync.RWMutex` without blocking active queries. The updater downloads databases to temporary files, validates them with `maxminddb-golang`, then atomically replaces the active files. Dedicated unit tests cover fast mtime-triggered reloads, invalid reload preservation, updater cron defaults, invalid download rejection, HTTP failures, and temporary-file cleanup.

---

## 💾 ClickHouse Schema

Analytics events are flattened and written into the `cyanly.events` table. It utilizes the `MergeTree` engine, optimized for time-series analytical queries:

```sql
CREATE TABLE IF NOT EXISTS cyanly.events (
    site_id String,
    timestamp DateTime,
    visitor_id String,
    session_id String,
    event_name String,
    properties String,
    url String,
    title String,
    referrer String,
    duration_ms Int32,
    screen_width Int32,
    screen_height Int32,

    -- UTM Campaigns
    utm_source String,
    utm_medium String,
    utm_campaign String,
    utm_term String,
    utm_content String,

    -- Ad Clicks
    gclid String,
    fbclid String,
    ttclid String,
    blclid String,
    bd_vid String,
    gdt_vid String,
    msclkid String,
    twclid String,
    clickid String,

    -- Geolocation (Parsed from IP)
    ip String,
    country String,
    region String,
    city String,

    -- Device details (Parsed from User-Agent)
    user_agent String,
    device_type String,
    os_name String,
    os_version String,
    browser_name String,
    browser_version String,

    -- Additional fields
    language String,
    country_code String,
    device_brand String,
    device_model String,
    ip_asn Nullable(UInt32),
    ip_asn_name Nullable(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (site_id, event_name, timestamp, visitor_id, session_id);
```

`event_name` defaults to `pageview` for browser pageview reports. Dashboard analytics endpoints filter to `event_name = 'pageview'` so custom events do not affect pageview, visitor, session, source, device, or duration metrics. `properties` stores a JSON string for custom event metadata and is empty for pageviews.

The Collector validates incoming events at the storage boundary (not as an authenticity check — `/collect` is public, so any value, including `pageview`, can be forged by a custom client):

- `event_name` must be non-empty, at most 64 bytes, and free of control characters. This bounds the cardinality of `event_name`, which is part of the ClickHouse `ORDER BY` key.
- `properties` is rejected if larger than 4KB or if it is not valid JSON.

`duration_ms` is a top-level metric column measured in milliseconds. It represents page stay duration for `pageview` events and is written as `0` for custom events.

## 💾 PostgreSQL Schema

Operational configurations and user credentials are saved in the `cyanly` database in PostgreSQL.

### 🛡️ Audit Deletion Specification (`xxx_deleted` Pattern)

To maintain strict operational audit trails and data lineage, all operational tables in the PostgreSQL schema must follow the `xxx_deleted` audit pattern:
1. **Audit Table**: For any table `xxx`, there must exist a matching table `xxx_deleted` containing:
   - `id BIGINT NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY`
   - `old_data JSONB NOT NULL` (contains the complete deleted row serialized as JSON)
   - `deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`
2. **Audit Trigger**: An `AFTER DELETE` trigger must be declared on `xxx` to automatically capture deleted rows and serialize them using `to_jsonb(OLD)` into `xxx_deleted`.

```sql
-- Common helper functions
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- 1. sites Table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.sites (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    jwks_url VARCHAR(255) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.sites_deleted (
    id BIGINT NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    old_data JSONB NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION public.sites_deleted_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.sites_deleted (old_data, deleted_at)
  VALUES (to_jsonb(OLD), CURRENT_TIMESTAMP);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER sites_deleted_trigger
AFTER DELETE ON public.sites
FOR EACH ROW
EXECUTE FUNCTION public.sites_deleted_fn();

CREATE OR REPLACE TRIGGER update_sites_updated_at
BEFORE UPDATE ON public.sites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 2. users Table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    nickname VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    avatar VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.users_deleted (
    id BIGINT NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    old_data JSONB NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION public.users_deleted_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users_deleted (old_data, deleted_at)
  VALUES (to_jsonb(OLD), CURRENT_TIMESTAMP);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER users_deleted_trigger
AFTER DELETE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.users_deleted_fn();

CREATE OR REPLACE TRIGGER update_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 3. user_cyanlys Table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.user_cyanlys (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    is_superuser BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS public.user_cyanlys_deleted (
    id BIGINT NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    old_data JSONB NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION public.user_cyanlys_deleted_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_cyanlys_deleted (old_data, deleted_at)
  VALUES (to_jsonb(OLD), CURRENT_TIMESTAMP);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER user_cyanlys_deleted_trigger
AFTER DELETE ON public.user_cyanlys
FOR EACH ROW
EXECUTE FUNCTION public.user_cyanlys_deleted_fn();

CREATE OR REPLACE TRIGGER update_user_cyanlys_updated_at
BEFORE UPDATE ON public.user_cyanlys
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 4. user_sites Table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.user_sites (
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    site_id VARCHAR(255) REFERENCES public.sites(id) ON DELETE CASCADE,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    PRIMARY KEY (user_id, site_id)
);

CREATE TABLE IF NOT EXISTS public.user_sites_deleted (
    id BIGINT NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    old_data JSONB NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION public.user_sites_deleted_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_sites_deleted (old_data, deleted_at)
  VALUES (to_jsonb(OLD), CURRENT_TIMESTAMP);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER user_sites_deleted_trigger
AFTER DELETE ON public.user_sites
FOR EACH ROW
EXECUTE FUNCTION public.user_sites_deleted_fn();

-- =========================================================================
-- 5. user_sessions Table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    refresh_token_jti VARCHAR(255) UNIQUE NOT NULL,
    device_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) NOT NULL,
    user_agent TEXT NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_refresh_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.user_sessions_deleted (
    id BIGINT NOT NULL GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    old_data JSONB NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION public.user_sessions_deleted_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_sessions_deleted (old_data, deleted_at)
  VALUES (to_jsonb(OLD), CURRENT_TIMESTAMP);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER user_sessions_deleted_trigger
AFTER DELETE ON public.user_sessions
FOR EACH ROW
EXECUTE FUNCTION public.user_sessions_deleted_fn();
```

## ⚙️ Database Schema Migrations (`cy_migrate`)

The schema migrations for both PostgreSQL and ClickHouse are managed via a unified, standalone CLI tool `cy_migrate` located in `backend/cmd/cy_migrate`. It connects to the target database using a DSN, runs the template-rendered SQL scripts from the migrations directory, and records applied migrations inside fully qualified `cyanly.schema_migrations` or `public.schema_migrations` history tables.

### Flags:
- `--driver`: Explicitly set the database driver (`clickhouse` or `postgres`). If omitted, auto-detects from the DSN prefix scheme.
- `--dsn`: Database connection string. Falls back to `CLICKHOUSE_DSN` or `POSTGRES_DSN` environment variables depending on the driver.
- `--migrations`: Directory containing migration SQL files (e.g. `./backend/migrations/ch_analytics` or `./backend/migrations/pg_metadata`).
- `--var`: Custom variables for template substitution (`key=value`), replacing `{{.key}}` placeholders in SQL scripts.

### Subcommands:
- `apply`: Applies all pending migrations (default action).
- `status`: Lists all migration files and prints their status (`applied` / `pending`).
- `new <name>`: Generates a new migration file with sequential version prefix (e.g., `0002_name.sql`).

### Running PostgreSQL Migrations:
```bash
go run backend/cmd/cy_migrate/main.go \
  --driver postgres \
  --dsn "postgres://cyanly:cyanly-password@localhost:5432/cyanly?sslmode=disable" \
  --migrations ./backend/migrations/pg_metadata \
  apply
```

### Running ClickHouse Migrations:
```bash
go run backend/cmd/cy_migrate/main.go \
  --driver clickhouse \
  --dsn "clickhouse://default:cyanly-password@localhost:9000/cyanly" \
  --migrations ./backend/migrations/ch_analytics \
  --var table=cyanly.events \
  apply
```

During local development, `uv run python mng.py dev` automatically checks and prepares the GeoIP/ASN databases, and runs both migration commands sequentially before launching backend services.

---

## 🔒 Security & Protection Layers

To protect the Collector and Query API from spam, spoofing, unauthorized reads, and malicious data injection, Chiyo Analytics implements multiple security and authorization layers:

1. **Strict Server-Side Origin & Referer Verification**:
   - The Collector validates the incoming `Origin` and `Referer` headers against `cors_allowed_origins`.
   - Unauthorized origins are immediately rejected with `403 Forbidden`.

2. **Dynamic Site ID Whitelisting**:
   - Authorized `site_id`s are loaded from the PostgreSQL `public.sites` table into a local thread-safe Go cache. The API publishes Redis Pub/Sub site-change notifications after successful site creation/update so Collectors can refresh the affected `site_id` immediately, while a full PostgreSQL sync still runs every 10 seconds as a consistency fallback.
   - Incoming events with unauthorized or unknown `site_id`s are rejected with `403 Forbidden`.

3. **Session-Bound Secure Tokens (JWKS Ticket System)**:
   - When a site is configured with a non-empty `jwks_url` in the database/configuration, the `/collect` endpoint requires a valid JWT signed with an asymmetric algorithm. `/collect/geo` applies the same `site_id` whitelist and secure-token verification before returning a country code. RSA (`RS*`/`PS*`), ECDSA (`ES*`) and Ed25519 (`EdDSA`) keys are all supported — the Collector dispatches on the `kty` advertised in the user's JWKS. Symmetric (`HS*`) and `none` algorithms are explicitly rejected to prevent algorithm-confusion attacks.
   - The user's application server independently generates and signs the short-lived session-bound JWT using its own private key, exposing the public key in standard JWKS format (typically under a well-known endpoint like `/api/cyanly-jwks` or `/.well-known/jwks.json`).
   - The JWT contains the bound `site_id`, `session_id`, and standard `exp` claims. The Collector retrieves the public key from the site's `jwks_url` to verify the token signature, caching JWKS responses by normalized URL and `kid` in local memory. JWKS cache expiry follows `Cache-Control: max-age` or `Expires` headers when present, falls back to 1 hour, and caps remote-provided TTLs at 24 hours. Tokens carrying an unknown `kid` trigger at most one refetch per 10-second window per `jwks_url`, so forged `kid`s cannot amplify into repeated requests against the user's JWKS endpoint. In production, JWKS outbound fetches reject loopback/private/link-local/metadata targets to reduce SSRF risk; local development continues to allow `localhost` JWKS endpoints for examples and tests.
   - The JS SDK natively supports resolving tokens asynchronously and refreshing them proactively in the background:
     - **SPA**: The `init()` configuration accepts a `tokenResolver` function (a function or async function returning a `Promise<string>`). The SDK decodes the JWT locally and schedules a background timer to proactively fetch a fresh token before it expires (at 80% of its lifetime or 5 minutes before expiry).
     - **MPA**: The script tag accepts `data-token-url="/api/cyanly-token"`, and the SDK fetches the token on load and maintains a background timer to refresh it proactively.

4. **Reverse Proxy Rate & Size Limiting**:
   - Reference configurations for **Nginx** and **Caddy** showing rate limiting (`limit_req`) and request payload limits are available in [examples/hosting_server/](./examples/hosting_server).

5. **Site-Bound IAM Policy Engine (Access Authorization)**:
   - Dashboard users are granted site-level access using JSONB-stored IAM policies on the `public.user_sites` table. The backend Policy Engine evaluates these statements dynamically:
     - **`read:analytics`**: Authorizes reading aggregated metrics analytics data (including overview metrics, top pages, traffic sources, device details, and visitor trends).
     - **`read:realtime`**: Authorizes reading granular realtime tracking profiles and user session paths (including IP addresses, device details, and visitor profiles).
     - **`*`**: Wildcard authorization granting full actions on the target site.
   - Example Policy Document:
     ```json
     [
       {
         "effect": "allow",
         "actions": ["read:analytics", "read:realtime"]
       }
     ]
     ```
   - Superusers automatically bypass site-specific policy checks, gaining implicit access to all endpoints. Superusers do not require site permission assignments, and the API prevents allocating specific site permissions to superuser accounts.

---

## 🚀 Quick Start

### 1. Setup Infrastructure
Spin up ClickHouse, Redis, and PostgreSQL using Docker Compose:
```bash
docker compose up -d
```

### 2. Configure Backend
Create/modify the configuration file `chiyo_analytics.toml` in the project root:
```toml
[app]
env = "development"

[collector]
addr = ":8080"
init_allowed_sites = [
  { site_id = "example-next-js", name = "Next.js Example", jwks = "http://localhost:13001/api/cyanly-jwks" },
  { site_id = "example-vite-react-router", jwks = "http://localhost:23002/api/cyanly-jwks" },
  { site_id = "example-traditional-mpa", jwks = "http://localhost:13003/api/cyanly-jwks" }
]
cors_allowed_origins = [
  "http://localhost:13001",
  "http://localhost:13002",
  "http://localhost:13003"
]
trusted_proxies = [
  "127.0.0.1",
  "::1"
]
serve_sdk = true

[api]
addr = ":8081"
jwt_secret = "cyanly-jwt-secret-key-change-in-prod"
access_token_expiry = "15m"
refresh_token_expiry = "30d"
trusted_proxies = [
  "127.0.0.1",
  "::1"
]
cors_allowed_origins = [
  "http://localhost:8079"
]

[api.superuser]
username = "admin"
nickname = "Administrator"
email = "admin@cyanly.local"
password = "cyanly-admin-secure-password"

[worker]
health_addr = ":8082"

[redis]
addr = "localhost:6379"
password = ""
db = 0
key = "cyanly:events"

[clickhouse]
addr = "localhost:9000"
database = "cyanly"
username = "default"
password = "cyanly-password"
table = "cyanly.events"

[geoip]
db_ipv4 = "./dbip-city-ipv4.mmdb"
db_ipv6 = "./dbip-city-ipv6.mmdb"
db_asn = "./origin-asn.mmdb"

[updater.geoip.db_ipv4]
name = "dbip-city-ipv4.mmdb"
url = "https://github.com/sapics/ip-location-db/releases/download/latest/dbip-city-ipv4.mmdb"
cron = "0 1 2,15 * *"

[updater.geoip.db_ipv6]
name = "dbip-city-ipv6.mmdb"
url = "https://github.com/sapics/ip-location-db/releases/download/latest/dbip-city-ipv6.mmdb"
cron = "0 1 2,15 * *"

[updater.geoip.db_asn]
name = "origin-asn.mmdb"
url = "https://github.com/sapics/ip-location-db/releases/download/latest/origin-asn.mmdb"
cron = "0 4 * * *"

[postgres]
addr = "localhost:5432"
database = "cyanly"
username = "cyanly"
password = "cyanly-password"
sslmode = "disable"
```

### 3. Build & Run Backend Services
Launch the backend components in the `backend/` directory:

```bash
cd backend

# 1. Start HTTP Ingest Collector
go run ./cmd/collector

# 2. Start Ingest Queue Worker
go run ./cmd/worker

# 3. Start Query API Server
go run ./cmd/api

# 4. Start Auto-Updater Daemon
go run ./cmd/updater
```

*Note on Automatic Seeding*: Upon the first startup, the Collector automatically seeds the PostgreSQL `public.sites` table from the `init_allowed_sites` configuration if the table is empty. Similarly, the API server automatically seeds the default superuser account from the `[api.superuser]` configuration if the user does not already exist.

*Note on package files*: The collector and API entrypoints are split into multiple files (e.g. `main.go`, `types.go`, `middleware.go`, and handler files formatted as `handler_*.go`) under their respective `main` packages. Running `go run ./cmd/collector` and `go run ./cmd/api` will automatically compile and run all package files.

#### Consolidated Development Server (Recommended)
Alternatively, you can start the backend services (including the auto-updater) and the Next.js dashboard UI simultaneously. The manager script automatically checks if the required GeoIP databases and CSV dump exist (downloading and dumping them if missing) before launching the services with a split-screen layout displaying real-time logs:

```bash
# Run the manager script using uv
uv run python mng.py dev
```

To specify a custom Go backend configuration file:
```bash
uv run python mng.py dev --config=chiyo_analytics.toml
```

##### Interactive TUI Layout Features:
- **2x2 Grid View**: Displays logs for collector, worker, api, and dashboard in separate panels. The updater is also started, appears in the status header, and writes a raw log file, but does not currently have a dedicated grid pane or zoom shortcut.
- **Interactive Zoom**: Press `1` (collector), `2` (worker), `3` (api), or `4` (dashboard) to expand that service to full screen. Press `ESC` to return to the 2x2 grid.
- **Log Persistence**: All raw console logs are saved to the `logs/` directory (`collector.log`, `worker.log`, `api.log`, `dashboard.log`, `updater.log`), separated by session banners.

##### Cleaning Dashboard & Environment (`clean` Subcommands):
You can clean up active port conflicts and logs cross-platform using the `clean` subcommand:

- **Clean Port Conflicts**:
  If any of the services fail to start due to port conflicts (e.g. `EADDRINUSE`), you can clean the default ports (8079, 8080, 8081, 8082):
  ```bash
  uv run python mng.py clean port
  ```
  Or specify custom ports to clean:
  ```bash
  uv run python mng.py clean port --ports=8079,8080
  ```
  This utility will output all active processes bound to those ports and ask for confirmation before terminating them safely.

- **Clean Logs**:
  You can clean up all generated log files (deleting the `logs/` directory):
  ```bash
  uv run python mng.py clean logs
  ```

##### Running Tests (`test` Subcommands):
You can execute various test suites using the `test` subcommands:

- **JS SDK Tests**:
  Runs the JS SDK unit/integration tests using Vitest:
  ```bash
  uv run python mng.py test sdk-js
  ```

- **Go Backend Tests**:
  Runs the Go backend unit tests (using `-v` for verbose output):
  ```bash
  uv run python mng.py test backend
  ```

- **All Unit Tests**:
  Sequentially runs JS SDK unit tests, Go backend unit tests, and deployment installer tests:
  ```bash
  uv run python mng.py test unit
  ```

- **Deployment Installer Tests**:
  Runs the Python tests for deployment installer file generation, overwrite handling, install directory pointer behavior, and syrupy snapshots:
  ```bash
  uv run python mng.py test deployment
  ```
  Update the deployment snapshots after intentional installer output changes with:
  ```bash
  uv run pytest deployment/tests --snapshot-update
  ```

- **E2E Integration Tests**:
  Executes a complete, automated end-to-end integration test flow that automatically checks and prepares missing GeoIP databases/CSV dump, rebuilds the containers, runs migrations, launches all services and example applications, executes Playwright tests, and cleans up everything gracefully:
  ```bash
  uv run python mng.py test e2e
  ```

- **All Tests (Unit + E2E)**:
  Runs all unit tests (JS SDK + Go backend + deployment installer tests) followed by the complete E2E integration test suite:
  ```bash
  uv run python mng.py test all
  ```



##### Managing GeoIP Databases (`geoip` Subcommands):
You can update, preview, and dump the GeoIP/ASN databases locally for the telemetry pipeline:

*   **Update GeoIP/ASN Databases**:
    Downloads the configured DB-IP City IPv4/IPv6 databases and the `origin-asn` database from `sapics/ip-location-db`, overwriting existing files:
    ```bash
    uv run python mng.py geoip update
    ```

*   **Preview IPv4/IPv6 City Entries**:
    Parses the city databases and prints the first 10 records:
    ```bash
    uv run python mng.py geoip ipv4-preview
    uv run python mng.py geoip ipv6-preview
    ```

*   **Preview ASN Entries**:
    Parses the ASN database and prints the first 10 records:
    ```bash
    uv run python mng.py geoip asn-preview
    ```

*   **Dump ASN to CSV**:
    Dumps all ASN database records to a CSV file (defaults to `geoip_asn.csv`):
    ```bash
    uv run python mng.py geoip asn-dump
    ```

The `uv run python mng.py test e2e` command will:
1. Recreate the ClickHouse, Redis, and PostgreSQL containers from scratch (wiping all volumes).
2. Wait for database readiness and run both Go schema migrations.
3. Automatically generate `.env.local` for the Next.js Dashboard using the configuration file, and start the Go Collector, Go Worker (health server on `8082`), Go API, GeoIP updater, Next.js Dashboard, all three examples (Next.js on `13001`, Vite React Router on `13002` with JWKS helper on `23002`, Web on `13003`) concurrently.
4. Run the Playwright E2E tests inside the `tests/` directory:
   - **Telemetry Flow** (`cyanly.spec.ts`): Validates the full data pipeline across all three example apps and verifies API/Dashboard metrics. Also verifies the MPA SDK proactively refreshes its secure token before expiry (driven via `page.clock` time simulation).
   - **GeoIP & ASN Suite** (`geoip.spec.ts`): Spoofs clients IPs using custom proxy headers (`X-Forwarded-For`), performs local lookup using the `maxmind` JS reader, and verifies that the collector, worker, and ClickHouse write exactly matching fields (`country`, `region`, `city`, `ip_asn`, `ip_asn_name`).
   - **Security Suite** (`security.spec.ts`): Red/Blue team adversarial tests checking Origin spoofing, Site ID whitelisting, Bearer token auth bypasses, login brute-force rate limiting, malformed JSON, SQL Injection resilience, tenant data isolation (cross-tenant access), and granular permission privilege escalation (RBAC).
   - **Auth API** (`auth_api.spec.ts`): Validates logout revocation behavior, rejection of invalid/missing refresh tokens, and authenticated `/me` profile responses plus unauthenticated/invalid-token failures.
   - **API Endpoints** (`api_endpoints.spec.ts`): Validates all 8 Query API endpoints (`overview`, `pages`, `sources`, `devices`, `time_series`, `events`, `recent_sessions`, `visitor`) return correct data structures, field types, and meaningful values; also tests parameter validation error handling (missing `site_id`, missing `visitor_id`).
   - **User Management** (`user_management.spec.ts`): Validates the Superuser role capabilities, testing all user administration API endpoints (Create, Read, Update, Delete users and their site-level IAM permission policies) and Dashboard UI interactivity, as well as access rejection for normal users.
   - **Site Management** (`site_management.spec.ts`): Validates all site administration API endpoints (Create, Read, Update) and Dashboard UI interactivity, including protections against XSS, SSRF, and access rejection for non-superusers.
   - **Secure Tokens** (`secure_tokens.spec.ts`): Comprehensive JWT adversarial tests verifying asymmetric signature verification via the JWKS endpoint served by the MPA example application. Covers missing tokens, garbage JWTs, `site_id`/`session_id` claim mismatches, expired tokens, algorithm-confusion attacks (RS256→HS256 using the public key as an HMAC secret, and unsigned `alg:none` tokens), forged signatures from an unknown (attacker) private key, unknown `kid` values, `/collect/geo` site/token enforcement, and the positive path for sites configured without a `jwks_url` (token verification disabled).
   - **Privacy Pipeline** (`privacy_pipeline.spec.ts`): Validates end-to-end privacy behavior from Collector through Worker to ClickHouse, including default anonymization for restricted regions, explicit granted consent preserving raw visitor/IP values, and GPC-triggered anonymization in non-restricted regions.
   - **Dashboard Token Rotation** (`token_rotation.spec.ts`): Validates proactive dashboard access-token refresh, refresh-token rotation, replay protection for the old refresh token, and login redirect after local credentials are cleared. Because backend JWTs are signed with server time, the test checks that the rotated access token authorizes API requests instead of requiring each access-token string to differ.
5. Shutdown all services, restore configurations, and propagate the test exit code.
6. Save E2E service execution logs under `logs/e2e/`.

### 4. Build and Test the JS SDK
Go to the JS SDK folder, install dependencies, run tests, and build the tracking scripts:
```bash
cd sdk_js
pnpm install
pnpm test
pnpm build
```
This builds the SDK variants into `sdk_js/dist/`:
- **Traditional Multi-Page Application (MPA)**: `mpa.iife.js`
- **Single-Page Application (SPA)**: `spa.js` with `spa.d.ts` types (ESM module for both CSR and SSR environments like React/Vue/Next.js, safe on server-side and fully featured on client-side)

### Serving SDK files from the Collector
If `collector.serve_sdk` is set to `true` in `chiyo_analytics.toml`, the Collector serves the tracking SDK and CSS files directly using Go `embed`:
- `GET /sdk/mpa.iife.js` serves `sdk/mpa.iife.js` (copy from `sdk_js/dist/mpa.iife.js`, see `tsdown.config.ts` in sdk_js for more detail)
- `GET /sdk/spa.js` serves `sdk/spa.js` (copy from `sdk_js/dist/spa.js`, see `tsdown.config.ts` in sdk_js for more detail)
- `GET /sdk/ui/index.css` serves `sdk/index.css` (copy from `sdk_js/dist/ui/index.css`, see `tsdown.config.ts` in sdk_js for more detail)

These files are served with `Cache-Control: public, max-age=300` header to support browser and CDN caching.

The SDK sends pageviews as event-driven payloads with `event_name: "pageview"`, empty `properties`, and `duration_ms` in milliseconds. The ignore threshold option is `reporterIgnoreMs` in SPA config and `data-reporter-ignore-ms` for MPA script tags; the default is `1000`.

The SDK natively supports GeoIP-based dynamic privacy compliance. It automatically detects and respects Global Privacy Control (`navigator.globalPrivacyControl`) and Do-Not-Track (`navigator.doNotTrack`) signals unless explicit consent is saved locally. Upon initialization, it queries the explicitly configured GeoIP lookup endpoint (`geoLookupUrl` for SPA, `data-geo-lookup-url` for MPA) with `site_id` and, for secure-token sites, the resolved token in the `Authorization: Bearer` header to resolve the user's country code and caches it in `sessionStorage` as `_cyanly_country`. If the user is in a region requiring explicit consent (EU, EEA, UK, Switzerland, or China) and has not granted it, the SDK defers writing the visitor ID to `localStorage` (storing it only in `sessionStorage` for temporary session-only tracking) and the backend dynamically anonymizes the request. For users in other regions (US, Japan, Rest of World), maximum collection is applied by default unless GPC/DNT is active.

The current consent model is fine-grained JSON: `{"required":true,"functional":boolean,"personalization":boolean}`. `personalization: true` permits persistent visitor ID storage; `personalization: false` keeps tracking session-scoped and causes backend anonymization. Legacy stored values (`granted` and `denied`) are parsed for compatibility and normalized into the fine-grained model by the SDK.

To support user-friendly regulatory compliance, the SDK provides an integrated, modern Privacy Banner and a Settings Dialog containing three cookie classifications: Required Cookies (essential session tracking), Functional Cookies (site configurations), and Personalization Cookies (cross-session tracking). Granular consent states are persisted in `localStorage` as a JSON settings string (e.g., `{"required":true,"functional":true,"personalization":false}`), and consent updates dispatch an internal browser event so the running SDK immediately reapplies visitor-ID persistence. The Go Worker (`cmd/worker`) parses this JSON payload dynamically to decide whether to anonymize the event (IP masking and daily-hashed visitor ID generation) based on the `personalization` flag.


Custom event tracking is available through `trackEvent`. SPA consumers can import it from `cyanly_sdk/spa`; MPA consumers can call `window.cyanly.trackEvent(...)`. The `setConsent(consent)` API is exposed in the SDK module and the global `window.cyanly` object to persist a fine-grained consent state (`_cyanly_consent`) and immediately update visitor-ID persistence. If `config.consent` / `data-consent` is provided during initialization, that value is treated as host-application controlled consent and always overrides `_cyanly_consent` for the SDK lifetime. The reserved event name `pageview` and empty event names are rejected by the SDK custom event API. Properties are validated client-side before sending: they must be a plain object whose values are `string | number | boolean`, and the serialized payload must stay within the 4KB collector limit. Invalid or oversized properties are dropped with a `console.warn` rather than sent. Declarative tracking is supported with `data-cyanly-event`. When an element carries `data-cyanly-event`, only that custom event fires (it is not also counted as an `outbound_click`). Outbound cross-origin links are automatically tracked as `outbound_click` with `href` and trimmed `text` properties.

Declarative event properties accept two forms, which may be combined:

- `data-cyanly-props` — a complete JSON object string, e.g. `data-cyanly-props='{"product_id":"vr-headset","price":899}'`. Values may be string/number/boolean. If the attribute is present but not parseable as a JSON object, the **entire event is dropped** (with a `console.warn`), not sent without properties.
- `data-cyanly-prop-<name>` — a per-property shorthand. The suffix is converted to snake_case (`data-cyanly-prop-product-id` → `product_id`). The value defaults to a string, but supports a `value::<type>` magic-string suffix to coerce the type, matching the `string | number | boolean` property contract:
  - `data-cyanly-prop-price="899::<number>"` → `899` (number, via `Number()`; a value that parses to `NaN` is kept as a string with a `console.warn`);
  - `data-cyanly-prop-active="false::<boolean>"` → `false`. Boolean uses an explicit, intuitive mapping: `"false"` (case-insensitive), `"0"` and `""` become `false`; every other value becomes `true`;
  - `data-cyanly-prop-id="007::<string>"` → `"007"` (suffix stripped, value kept verbatim);
  - no suffix → the raw string is used as-is.

  For values that don't fit these forms (e.g. nested objects), use `data-cyanly-props` JSON instead.

### 5. Production Single-Server Deployment (Docker)

For production hosting on a single server, Chiyo Analytics provides a fully containerized deployment workflow utilizing pre-built GHCR Docker images and a Python-based installer script:

1. Download and run the configuration wizard:
   ```bash
   curl -sSL https://github.com/chiyolive/chiyo_analytics/releases/latest/download/install-cyanly.pyz -o install-cyanly.pyz
   python3 install-cyanly.pyz config
   ```
   This will prompt you for your preferred language and generate the `./cyanly-preinstall/` directory containing the configuration template `chiyo_analytics.toml`.
2. Edit settings and database credentials in `./cyanly-preinstall/chiyo_analytics.toml`.
3. Generate the installation files (creates `.env` and `docker-compose.yaml`, downloads GeoIP files to `~/.cyanly/geoip`, extracts the management script, and records the active install directory in `~/.cyanly_installed`):
   ```bash
   python3 install-cyanly.pyz gen
   ```
4. Start the generated Docker Compose stack:
   ```bash
   python3 install-cyanly.pyz up
   ```
   To generate and start in one step, run:
   ```bash
   python3 install-cyanly.pyz install
   ```
5. The installer commands honor `--dest <path>` and the active installation pointer in `~/.cyanly_installed`; generated file writes prompt before overwriting existing files unless `-y` or `--yes` is provided. You can use the extracted `cyanly.pyz` script from the installation directory to manage that active deployment:
   - **Start or recreate services from the existing Compose file**: `python3 ~/.cyanly/cyanly.pyz up [service]`
   - **Restart containers**: `python3 ~/.cyanly/cyanly.pyz restart [service]`
   - **Uninstall and remove containers**: `python3 ~/.cyanly/cyanly.pyz uninstall`
   - **Uninstall with volumes (Destructive!)**: `python3 ~/.cyanly/cyanly.pyz uninstall --volume`
   - Current implementation note: `install-cyanly.pyz gen --dest <path>` writes the installation files to the requested path and updates `~/.cyanly_installed`; `install-cyanly.pyz up --dest <path>` starts Compose there and updates the pointer after success; `install` performs both steps. Use `<path>/cyanly.pyz` for that custom install. The management CLI reads the pointer first, falls back to `~/.cyanly` if the pointer is absent or invalid, and does not regenerate `.env` or `docker-compose.yaml` on `up`.

For detailed setup instructions, Nginx/Caddy reverse proxy mapping examples, management commands, zipapp packaging build steps, and container topology, refer to the [Deployment Status & Design Guide](./deployment/PROJECT.md).

#### ⚠️ Local Testing Notes (Single Server Docker)

When validating the `single_server_docker` deployment flow locally (e.g., testing production-like container builds on your own machine), keep the following network behaviors in mind:

- **SSRF Protection (`app.env = "production"`)**:
  In production mode, the Go Collector prevents Server-Side Request Forgery (SSRF) by blocking Loopback addresses (`localhost`, `127.0.0.1`, `::1`) and private network IP ranges when fetching site JWKS configurations. For local validation, change the environment settings in the `[app]` block of `chiyo_analytics.toml` to:
  ```toml
  [app]
  env = "development" # Disables private network filtering for JWKS fetching
  ```
- **Container Network Isolation**:
  Because each Docker container runs in its own network namespace, `localhost` (or `[::1]`) inside the `cyanly-collector` container resolves to the container itself, not the host machine or other containers.
  - **Host Services**: If the JWKS endpoint is running directly on the host machine (outside Docker, e.g., on port `13001`), configure the `jwks_url` in the database to use `http://host.docker.internal:13001/api/cyanly-jwks` (supported out-of-the-box on Docker Desktop for macOS/Windows).
  - **Container Services**: If the JWKS provider is also running in a Docker container within the same network, use the target container's service name (e.g., `http://my-web-app:13001/api/cyanly-jwks`) rather than `localhost`.

#### Building Docker Images Locally (For Developers)

If you want to build and tag the Docker images locally (e.g., to test changes or push to your own registry), execute the following commands from the **project root directory**:

- **Build the Go Backend Image** (compiles JS SDK, embeds it, and builds all Go binaries):
  ```bash
  docker build -t ghcr.io/chiyolive/cyanly-backend:latest -f deployment/single_server_docker/backend.Dockerfile .
  ```
- **Build the Next.js Dashboard Image** (standalone Node environment):
  ```bash
  docker build -t ghcr.io/chiyolive/cyanly-dashboard:latest -f deployment/single_server_docker/dashboard.Dockerfile .
  ```

*Note: The build context `.` (project root) is required because the Dockerfiles copy files from multiple package subdirectories (like `sdk_js/`, `backend/`, and `dashboard/`).*

---

## 📦 Web Application Examples

We provide three reference examples demonstrating how to integrate the Chiyo Analytics JS SDK in different environments.

### 1. Traditional Multi-Page Application (MPA)
A standard Express application demonstrating traditional page tracking with the MPA IIFE script inside a mock-production e-commerce catalog:
- Uses the standard IIFE script block imported in the HTML headers.
- Dynamically sets page titles and intercepts outgoing beacons to display them in a persistent visual Live Console.
- Persists event logs inside `localStorage` so that the Live Console history remains consistent across native page loads.

```bash
cd examples/web
pnpm install
pnpm build
pnpm start
```
Open `http://localhost:13003` in your browser.

### 2. Single-Page Application (SPA) with Client-Side Rendering (CSR)
A React 19 + Vite application demonstrating modular JS SDK integration inside a multi-page routing layout using **React Router v7 Data Mode**:
- Uses hook-based tracking listening to `useLocation` changes.
- Automatically handles dynamic route titles (e.g., dynamic params inside `/products/:id`).
- Implements a **Live Ingest Console Drawer** in the UI to display intercepted beacon reports and millisecond-based durations in real-time.

```bash
# Ensure JS SDK is built
cd sdk_js
pnpm build

# Run the CSR application
cd ../examples/vite_react_router
pnpm install
pnpm dev
```
Open `http://localhost:13002` in your browser, click catalog products, and watch the live event console!

### 3. Server-Side Rendering (SSR) / Hybrid Web Application
A Next.js (React 19) App Router project demonstrating modular JS SDK integration inside a hybrid SSR + CSR multi-page layout:
- Uses `cyanly_sdk/spa` which is safe to import and render server-side (no-op on server).
- Integrates a `CyanlyTracker` client component inside the layout to manually track client-side routing changes safely.
- Implements a **Live Ingest Console Drawer** in the UI, translation via dynamic `[lang]` routing (i18n, utilizing namespaced keys like `module:key`), and light/dark theme toggle.

```bash
# Ensure JS SDK is built
cd sdk_js
pnpm build

# Run the SSR application
cd ../examples/nextjs
pnpm install
pnpm dev
```
Open `http://localhost:13001` in your browser.

---

## 📊 Analytics Dashboard

A Next.js dashboard utilizing `shadcn/ui` and `recharts` is included under the `dashboard/` directory.

### Run the Dashboard:
1. Install dependencies:
   ```bash
   cd dashboard
   pnpm install
   ```
2. Set up environment variables (create a `.env.local` or `.env` file):
   ```env
   ANALYTICS_API_URL=http://localhost:8081
   ```
3. Run the development server:
   ```bash
   pnpm dev
   ```

Open `http://localhost:8079` in your browser.
The dashboard supports language selection (English, Simplified Chinese, Japanese) and Light/Dark themes. User Management modules, all analytics components (including overview cards, top pages, traffic sources, UTM campaigns, devices breakdown, the custom events card listing non-pageview event counts by name, and the Visitor Trends time-series charts displaying pageviews and visitors), and real-time sidebar details use strongly-typed localization translation (`trans`) properties under precise TypeScript types (e.g., `UsersTrans`) to eliminate broad, generic types and ensure consistent localization.
Dashboard API calls use client-side JWT authentication with automatic access-token refresh; the request that detects an expired token retries immediately after refresh, while concurrent requests wait for the same refresh result.

### Query API Endpoints

The Go Query API serves endpoints for the dashboard and requires a valid JWT Bearer token in the `Authorization` header. Analytics endpoints also require a valid `site_id` and are protected by `SiteAccessMiddleware`, which validates whether the user is authorized to access the requested site (superusers bypass this check). Login attempts are rate limited per `ClientIP()` using Redis key `cyanly:ratelimit:login:<ip>` with a 5-attempt, 15-minute window. Configure `[api].trusted_proxies` and `[collector].trusted_proxies` to the reverse proxy or load balancer IP ranges that are allowed to supply `X-Forwarded-For`; when omitted, only localhost proxies are trusted.

**Auth Endpoints:**
- `POST /api/v1/auth/login`: Authenticates a user and returns an access token and a refresh token.
- `POST /api/v1/auth/refresh`: Refreshes an expired access token using a valid refresh token.
- `POST /api/v1/auth/rotate`: Rotates a refresh token (invalidates the old one and returns a new pair).
- `POST /api/v1/auth/logout`: Revokes a refresh token session.
- `GET /api/v1/auth/me`: Returns the authenticated user's profile (including username, nickname, and active sessions count), permissions, authorized sites, and superuser status.

**User Management Endpoints:**
- `GET /api/v1/users`: List all registered users (Superuser only).
- `POST /api/v1/users`: Create a new user account (Superuser only).
- `PUT /api/v1/users/:id`: Update an existing user's profile info and superuser status (Superuser only).
- `DELETE /api/v1/users/:id`: Delete a user account (Superuser only).
- `POST /api/v1/users/:id/sites`: Associate a new site and permissions with a user (Superuser only).
- `PUT /api/v1/users/:id/sites/:site_id`: Update site permission statements for a user (Superuser only).
- `DELETE /api/v1/users/:id/sites/:site_id`: Remove site permissions for a user (Superuser only).

**Site Management Endpoints:**
- `GET /api/v1/sites`: List all sites in the system (Superuser only).
- `POST /api/v1/sites`: Create a new site configuration (Superuser only).
- `PUT /api/v1/sites/:id`: Update site name and JWKS verification URL (Superuser only).

**Analytics Endpoints:**
- `GET /api/v1/analytics/overview`: Returns top-level pageview KPIs (pageviews, visitors, sessions, avg duration in milliseconds, bounce rate).
- `GET /api/v1/analytics/pages`: Returns the top 100 pages sorted by pageviews.
- `GET /api/v1/analytics/sources`: Returns the top 50 referrers and UTM campaigns.
- `GET /api/v1/analytics/devices`: Returns breakdowns for device types, operating systems, browsers, and countries.
- `GET /api/v1/analytics/time_series`: Returns bucketed time series data for charts (hourly or daily granularity).
- `GET /api/v1/analytics/events`: Returns custom (non-pageview) event counts within the time range, aggregated by event name (`name`, `count`, `visitors`), ordered by count. Pageviews are excluded; this is the read path for events emitted via the SDK's `trackEvent` / declarative tracking.
- `GET /api/v1/analytics/recent_sessions`: Returns the 50 most recent sessions (within 24h window), containing visitor details, returning status, and chronological page navigation paths.
- `GET /api/v1/analytics/visitor?site_id=<id>&visitor_id=<visitor_id>`: Returns visitor profile metrics (total sessions, first/last visit times, unique devices, systems, browsers, and countries used).

---

## 🤖 CI/CD Release Automation

Chiyo Analytics uses **GitHub Actions** (configured with the latest Node 24 compatible actions like `actions/checkout@v7`, `pnpm/action-setup@v6`, the latest Docker actions, and `softprops/action-gh-release@v3`) to automate the build and release cycle. When a git version tag is pushed (matching `v*` like `v1.0.0`), the workflow automatically handles publishing:

1. **JS SDK to NPM**: Compiles `sdk_js` and publishes it to the NPM registry under the package name `cyanly_sdk`.
2. **Docker Images to GHCR**: Builds and pushes multi-platform production Docker images (supporting both `linux/amd64` and `linux/arm64` architectures) to GitHub Container Registry:
   - `ghcr.io/${owner}/cyanly-backend` (includes the embedded JS SDK built in Stage 1).
   - `ghcr.io/${owner}/cyanly-dashboard` (standalone Node.js environment).
3. **Installer Packages to GitHub Releases**: Compiles the standalone Python zipapps `install-cyanly.pyz` and `cyanly.pyz` using `shiv`, and publishes them as release assets.

### Fixed Mode Versioning
The project enforces a **Fixed Mode** versioning strategy across all release packages. The following manifests must always share the same version, even when only one package has content changes:
- `sdk_js/package.json`
- `dashboard/package.json`
- `deployment/pyproject.toml`

### 🚀 Step-by-Step Release Workflow

To publish a new release, follow these steps in order:

1. **Bump versions locally**:
   Run the interactive release helper script to bump the version across all manifests:
   ```bash
   uv run mng.py release
   ```
   Select the bump type (`major`, `minor`, `patch`, or `prerelease`) via the interactive Questionary menu. (For prerelease bumps, select `alpha`, `beta`, or `rc`; the helper handles the numeric suffix like `1.0.1-alpha.0` automatically).

2. **Commit and Push Manifests**:
   Stage the updated manifests, commit them, and push to the remote branch (e.g., `main`):
   ```bash
   git add sdk_js/package.json dashboard/package.json deployment/pyproject.toml
   git commit -m "chore: bump version to v1.0.0"
   git push origin main
   ```

3. **Create and Push Git Tag**:
   Create a Git tag for the commit we just pushed, and push it to remote:
   > [!IMPORTANT]
   > The pushed Git tag must match the bumped version in the manifests exactly after the `v` prefix is removed (for example, manifest version `1.0.1-rc.0` requires tag `v1.0.1-rc.0`).
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   Pushing the tag triggers the **Release Automation** workflow, which compiles and publishes the JS SDK to NPM (using `latest` tag for stable releases, or `next` for prereleases), builds and pushes Docker images to GHCR, and attaches the compiled `.pyz` zipapp installers to a new GitHub Release.

### Prerequisites for GitHub Actions
To successfully trigger and execute the workflow, you must configure the following:
- **NPM Trusted Publishing (OIDC)**: In your NPM account settings (under the `cyanly_sdk` package or global Trusted Publishers), add a "Trusted Publisher" linking your GitHub organization/repository and specifying `release.yaml` as the Workflow filename. This enables secure, passwordless publishing of the JS SDK with Provenance.
- **Workflow Permissions**: Ensure the default `GITHUB_TOKEN` is granted "Read and write permissions" (under Settings -> Actions -> General -> Workflow permissions) to authorize image pushes to GHCR and asset attachments on Releases.

---

## 🗺️ Roadmaps
- **v1.0.0 Release**: For the production-ready roadmap and pending feature checklists, please refer to [ROAD_TO_V1.md](./ROAD_TO_V1.md).
- **v2.0.0 Release**: For the enterprise multi-tenancy and distributed scalability roadmap, please refer to [ROAD_TO_V2.md](./ROAD_TO_V2.md).
