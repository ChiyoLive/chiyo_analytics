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

---

## 随手记一下之后的 v2 版本要做的事
- [ ] 中国大陆部署的本地化痛点：小程序的追踪支持
    - [ ] 在中国大陆，相当大比例的业务流量、私域流量根本不在网页端，而是在微信小程序、支付宝小程序、抖音小程序里。小程序环境没有 window、document、navigator，你的 JS SDK 无法直接运行。如果能提供一个轻量级、针对小程序 wx.request 上报的专用 SDK，这个项目在国内自研替代 GA4 的吸引力会直接翻倍。
- [ ] 国内高精度 GeoIP/ISP 的支持
    - [ ] 由于国内复杂的网络大环境（三网隔离、各省市 IP 频繁变动），标准的 MaxMind 等国外开源地理库对中国大陆省份/城市/运营商（电信/联通/移动）的识别准确率通常比较低。如果要完美适配国内部署，建议在后端 updater 里提供对国内高精度 IP 库（如纯真 IP 库（QQWry）或 IP2Region）的接口适配。
- [ ] “大流量”下的横向扩展（Horizontal Scaling）能力
    - [ ] 单机的瓶颈往往卡在 ClickHouse 的 I/O 或者 Redis 的内存上。如果是真正的大流量，采集端（Collector）必须能做到多节点无状态横向扩容（配合 HPA），并与存储端集群解耦。目前单机部署模式会让一些真正的海量流量企业持观望态度。
- [ ] 高流量下的“隐形炸弹”：ClickHouse TTL 缺失
    - [ ] 如果真的跑在大流量生产环境，ClickHouse 的硬盘占用速度会非常恐怖。一旦没有自动 TTL 机制，服务器很容易在几个月后因为磁盘爆满而导致 ClickHouse 挂掉。在 v2 之前，用户不得不自己写复杂的 crontab 脚本去手工 ALTER TABLE DROP PARTITION。
