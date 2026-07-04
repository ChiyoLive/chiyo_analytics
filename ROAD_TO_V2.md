# Road to v2.0.0 (Enterprise Multi-Tenancy & Distributed Scale)

This document outlines the architectural blueprint, design choices, and checklist for the `v2.0.0` release of `cyanly` (`chiyo_analytics`), focusing on enterprise-ready multi-tenancy, strict data isolation, and distributed scalability.

---

## 🏗️ Multi-Tenancy Architecture Blueprint

To support enterprise customers and large-scale SaaS deployments, `cyanly` will transition from a simple site-by-site permission model to a structured organization-based multi-tenancy model.

```
       [ Organization (Tenant) ]
         ├── Members (Users with Roles: Admin, Analyst, Viewer)
         └── Sites (Domain 1, Domain 2, etc.)
```

### 1. ClickHouse Multi-Tenancy Storage Strategy
To scale to thousands of tenants and billions of events without degradation, we will employ a **Shared Table with Tenant Key Prefix** strategy in ClickHouse, rather than a table-per-tenant design.

*   **Avoid Table Explosion**: ClickHouse stores data parts as physical directories/files. Having a table per tenant creates a massive file descriptor, memory, and merge pool overhead that crashes ClickHouse at scale.
*   **Sparse Index Optimization**: The primary key/sorting key for the events table in ClickHouse starts with `site_id` (representing the tenant's site):
    ```sql
    ORDER BY (site_id, event_name, timestamp, visitor_id, session_id)
    ```
    This physical sorting allows ClickHouse to instantly skip unrelated site data using index marks, achieving querying speeds comparable to dedicated tables without the architectural overhead.

### 2. Strict Data Isolation
To prevent cross-tenant data leaks (e.g., due to application-level bugs), we will implement a dual-layer isolation model:
*   **Application-Level Check**: Enforcement of `site_id` filtering in the Query API backend via robust context validation.
*   **Database-Level Row Security (RLS)**: Introduce ClickHouse Row Policies mapped to dynamic database users/roles or parametrized views, enforcing `USING site_id IN (...)` at the database engine level.

### 3. Distributed Sharding (Scale-Out)
When data outgrows a single ClickHouse node, the events table will be migrated to a distributed engine:
*   **Sharding Key**: Use `site_id` (or `organization_id`) as the sharding key.
*   **Co-location**: This guarantees that all events for a specific tenant reside on the same physical cluster node, eliminating the need for expensive scatter-gather operations during dashboard queries.

---

## 🛠️ Roadmap Checklist

### Phase 1: Metadata Schema Expansion (PostgreSQL)
- [ ] **Introduce `organization` Entity**: Create an `organization` table as the top-level tenant owner.
- [ ] **Update `public.user_sites` to `organization_member` & `site` Ownership**:
  - Relate `sites` to `organizations` (each site belongs to one organization).
  - Associate `users` to `organizations` with specific roles (`Admin`, `Analyst`, `Viewer`) via `organization_members`.
- [ ] **Soft Delete and Audit Trail**: Apply the `xxx_deleted` audit pattern to the new organization and member tables.

### Phase 2: Ingestion & Ingress Protection
- [ ] **Tenant Provisioning Pipeline**: Create automated APIs to provision new organizations, allocate default quotas, and generate initial tracking codes.
- [ ] **Rate Limiting & Quotas by Tenant**:
  - Implement tenant-level ingestion limits (e.g., monthly event quotas) in Caddy/Nginx or dynamically validated inside the Go Collector via Redis counter keys.
  - Return `429 Too Many Requests` or drop/DLQ events once a tenant exceeds their billing threshold.

### Phase 3: ClickHouse Scale & Distributed Sharding
- [ ] **Distributed Migration Plan**:
  - Document the setup for a multi-node ClickHouse cluster (Shards & Replicas via ClickHouse Keeper).
  - Define the `Distributed` table schema with `site_id` as the sharding key.
- [ ] **Lightweight Tenant Deletion**:
  - Build worker tasks to handle GDPR deletion requests using ClickHouse `DELETE FROM cyanly.events WHERE site_id = ?` (lightweight deletes).

### Phase 4: Enterprise Features & UX
- [ ] **SAML / SSO Support**: Allow enterprise tenants to configure identity providers (Okta, Entra ID, etc.) for dashboard login.
- [ ] **Custom Event Fields & Map Type Schemas**: Support unstructured tenant-defined event properties using ClickHouse `Map(String, String)` columns or dedicated JSON columns for maximum query performance on custom metrics.
- [ ] **Tenant Billing & Usage Dashboards**: Provide system administrators with real-time reports on event ingestion rates and storage footprints by tenant.
