# Cyanly (Chiyo Analytics) 单服务器 Docker 部署指南

本目录包含 `cyanly` 核心服务与数据看板的单服务器 Docker 部署方案（由用户在外部自行管理反向代理/HTTPS 证书）。

通过预构建的镜像与我们提供的一体化 Python 安装器 `install-cyanly.pyz`，您无需在服务器上安装 Node.js、Go 编译环境或手动配置数据库，即可快速完成部署。

---

## 🚀 快速开始 (Quick Start)

在服务器的空闲工作目录下，执行以下命令直接下载并初始化配置环境：

```bash
# 1. 下载并运行配置初始化
curl -sSL https://github.com/chiyolive/chiyo_analytics/releases/latest/download/install-cyanly.pyz -o install-cyanly.pyz && python3 install-cyanly.pyz config
```

运行后，安装器会在当前目录下生成 `./cyanly-preinstall` 目录，并释放配置文件模板 `chiyo_analytics.toml`。

---

## 🔁 完整部署生命周期管理

### 1. 配置参数 (`config`)
运行 `python3 install-cyanly.pyz config` 后，编辑 `./cyanly-preinstall/chiyo_analytics.toml` 配置文件，根据您的实际域名和需求，修改以下两项：

- **JWT 密钥及管理员凭证**：
  ```toml
  [api]
  jwt_secret = "your-custom-jwt-secret-change-me" # 务必修改！

  [api.superuser]
  username = "admin"
  password = "your-custom-admin-password" # 务必修改！
  ```
- **配置外部反代域名**：
  将 `api.cors_allowed_origins` 中默认 of `http://localhost:8079` 改为您的前端公开访问域名，例如 `https://analytics.example.com`。安装器会自动读取该域名来配置看板 API 动态连接地址。

---

### 2. 生成容器编排定义 (`gen`)
配置编辑完成后，运行：
```bash
python3 install-cyanly.pyz gen
```
此命令会读取 `chiyo_analytics.toml`，提取数据库密码、端口等配置，自动渲染并输出 `./cyanly-preinstall/docker-compose.yaml` 文件。

---

### 3. 安装部署 (`install`)
确认无误后，运行以下命令（由于安装在用户家目录 `~/.cyanly` 下，**通常无需 sudo 权限**）：
```bash
python3 install-cyanly.pyz install
```
安装器会自动完成以下工作：
1. 创建安装目录 `~/.cyanly`，并将配置文件和 compose 编排拷贝进去。该目录位于用户家目录下，完美适配 macOS/Linux 的 Docker 共享目录权限。
2. 在宿主机本地静默下载所需的 GeoIP 数据库文件并保存到 `~/.cyanly/geoip/` 中。
3. 调用系统的 `docker compose` 拉取 GHCR 预构建镜像 (`ghcr.io/chiyolive/cyanly-backend` & `ghcr.io/chiyolive/cyanly-dashboard`)。
4. 顺序启动数据库，执行 PG 与 ClickHouse 迁移，最后启动业务应用。
5. 在本地生成 `./cyanly-preinstall/INSTALLED.log` 安装日志标记文件。

---

### 4. 彻底卸载 (`uninstall`)
若需要停止容器并清理整个系统目录，在相同目录下执行：
```bash
python3 install-cyanly.pyz uninstall
```
此命令会调用 Docker Compose 停止容器、删除映射文件，并清理 `~/.cyanly` 文件夹，恢复干净的服务器状态。
*(注：出于安全原因，Docker 持久化卷数据如 `pg-data` 等仍会予以保留。)*

---

## 🔌 反向代理网关配置

服务在本地启动后会暴露以下端口，建议您仅允许本地 127.0.0.1 访问，并通过外部的反代理（Nginx 或 Caddy）代理对外提供服务。

- **Collector API**：`8080` (路由: `/collect`, `/sdk/*`)
- **Query API**：`8081` (路由: `/api/*`)
- **Next.js Dashboard**：`8079` (路由: `/*`)
- **Worker Health**：`8082` (监控/探针接口)

### 外部 Caddy 反代配置示例 (推荐)
```caddyfile
analytics.example.com {
    reverse_proxy /collect* 127.0.0.1:8080
    reverse_proxy /sdk/* 127.0.0.1:8080
    reverse_proxy /api/* 127.0.0.1:8081
    reverse_proxy /* 127.0.0.1:8079

    encode gzip zstd
}
```
