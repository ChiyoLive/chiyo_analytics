# Chiyo Analytics (cyanly)

基于自托管优先设计、兼顾高性能与隐私合规的现代化网站流量聚合分析平台。

---

🌐 **Languages:**  
[English](README.md) | [简体中文](README.zh.md) | [日本語](README.ja.md)

---

## ✨ 特性

- **🚀 高性能架构**：利用基于 Redis 的写入缓冲机制解耦高并发的数据收集流与后端的列式分析存储（ClickHouse），保障高吞吐量下的稳定性。
- **🛡️ 隐私第一**：开箱即用符合 GDPR、CCPA 和 ePrivacy 规范，原生支持并遵循 Global Privacy Control (GPC) 和 Do-Not-Track (DNT) 隐私信号。
- **🎨 现代化合规 Banner**：内置现代美观的隐私 Banner 以及设置弹窗（原生支持 light/dark 模式），支持细粒度的 Cookie 许可分类（*必要 cookies、功能 cookies、个性化/跨端追踪 cookies*）。
- **🐳 多架构 Docker 支持**：官方预构建的 Docker 镜像完美支持 `linux/amd64` 与 `linux/arm64` 双架构，无缝部署于 x86 架构服务器或 ARM 架构主机（如 M 系列 Mac、AWS Graviton）。
- **📦 Python 单包安装器**：提供交互式配置向导工具 `install-cyanly.pyz`，自动化生成本地 Docker Compose 文件、自动配置环境、下载和热更新 GeoIP 数据库。
- **🔌 灵活的集成 SDK**：支持传统多页应用（MPA）的 Script 脚本标签导入，或现代单页应用（SPA）的强类型 NPM 依赖包集成。

---

## 🛠️ 快速上手 (安装部署)

### 前置条件
- 服务器上已安装 **Docker** 和 **Docker Compose**。
- 服务器上已安装 **Python 3**（用于执行安装管理脚本）。

### 第一步：下载并初始化配置
下载最新的安装包引导文件并生成基础模板：
```bash
curl -sSL https://github.com/chiyolive/chiyo_analytics/releases/latest/download/install-cyanly.pyz -o install-cyanly.pyz
python3 install-cyanly.pyz config
```
执行此配置向导时会提示选择首选语言，并在当前目录下生成 `./cyanly-preinstall/` 目录以及 `chiyo_analytics.toml` 配置文件模板。

### 第二步：编辑配置文件
使用文本编辑器修改 `./cyanly-preinstall/chiyo_analytics.toml`。根据你的实际部署环境配置域名、安全 Token 密钥以及数据库凭证。

### 第三步：一键安装与部署
执行安装程序。该脚本会自动创建部署目录、下载最新的 GeoIP 数据库、拉取 Docker 镜像并启动容器：
```bash
python3 install-cyanly.pyz install
```

### 第四步：日常运维与管理
安装完成后，请从安装目录运行内置的管理 CLI。它会操作记录在 `~/.cyanly_installed` 中的当前安装目录；如果该指针不存在，则回退到 `~/.cyanly`：

- **根据现有 Compose 文件启动或重建服务**：`python3 ~/.cyanly/cyanly.pyz up`
- **重启所有服务**：`python3 ~/.cyanly/cyanly.pyz restart`
- **查看运行状态**：在部署目录下执行 `docker compose ps`
- **停止并卸载容器**：`python3 ~/.cyanly/cyanly.pyz uninstall`
- **彻底卸载（销毁容器并删除数据库数据）**：`python3 ~/.cyanly/cyanly.pyz uninstall --volume`

---

## 🔌 客户端 SDK 集成

当你在 `chiyo_analytics.toml` 中开启了 `collector.serve_sdk = true` 时，数据收集器（Collector）将直接分发对应的静态 SDK 文件。

### 1. 传统多页应用 (MPA)
直接在你的 HTML Header 中引入由收集器分发的 JS 文件。SDK 会自动处理并发送 pageview 页面浏览量：
```html
<script 
  src="https://your-collector-domain.com/sdk/mpa.iife.js" 
  data-site-id="your-site-id" 
  data-collector-url="https://your-collector-domain.com/collect"
  data-geo-lookup-url="https://your-collector-domain.com/collect/geo"
  // 可选：传递这个参数时 SDK 会自动渲染隐私合规 Banner，当用户选择 Accept All 时会升级到全量追踪。否则自动根据访客国家切换追踪模式。
  data-show-privacy-consent-banner="true"
></script>
```

我们在 [examples/web](./examples/web) 中提供了一个 express 应用来展示如何使用 MPA SDK，你可以查看它获取更多信息。

### 2. 现代单页应用 (SPA)
在你的前端项目中安装 SDK 模块依赖：
```bash
npm install cyanly_sdk
# 或
pnpm add cyanly_sdk
```
然后尽可能在**最开始的客户端渲染组件**中初始化 SDK：
```javascript
import { init, ui } from 'cyanly_sdk/spa';

function CyanlyTracker() {
  useEffect(() => {
    init({
      siteId: 'your-site-id',
      collectorUrl: "https://your-collector-domain.com/collect",
      geoLookupUrl: 'https://your-collector-domain.com/collect/geo'
    });

    // 可选：渲染隐私合规 Banner 到页面中，当用户选择 Accept All 时会升级到全量追踪。否则自动根据访客国家切换追踪模式。
    ui.banner.render();
  }, []);
  return null;
}
```

如果你对于初始化 SDK 的时机有任何问题，我们提供了两个开启所有功能的 SPA 例子供你参考：
- [examples/nextjs](./examples/nextjs)
    - 这个例子使用 nextjs 构建了一个开启了 Secure Token 功能的 SSR 全栈应用。包含了搜索引擎友好的 i18n 国际化，SSR 友好的暗色模式等多种现代功能
    - 请查看 [cyanly-tracker](examples/nextjs/src/components/cyanly-tracker.tsx) 和 [layout.tsx](examples/nextjs/src/app/[lang]/layout.tsx) 来了解如何在 Next.JS 中初始化 SDK
- [examples/vite_react_router](./examples/vite_react_router)
    - 这个例子使用 vite + react-router v7 构建了一个纯 CSR 的应用。
    - 使用 [dev.js](./examples/vite_react_router/dev.js) 展示了如何给一个纯 CSR 应用开启 Secure Token 功能。
    - 请查看 [RootLayout.tsx](examples/vite_react_router/src/layouts/RootLayout.tsx) 来了解如何在 CSR 的单页应用中初始化 SDK

---

## 🏷️ 自定义事件跟踪

### 声明式事件跟踪 (HTML 属性)
只需在 HTML 标签中添加指定属性。外站跨域链接的跳转将自动被记为 `outbound_click`。

- **基础事件**：
  ```html
  <button data-cyanly-event="click_download">Download Now</button>
  ```
- **带自定义参数的属性（快捷方式）**：
  ```html
  <button 
    data-cyanly-event="add_to_cart" 
    data-cyanly-prop-product-id="prod_889" 
    data-cyanly-prop-price="199::<number>" 
    data-cyanly-prop-active="true::<boolean>">
    Add to Cart
  </button>
  ```
- **带自定义参数的属性（直接传递 JSON 字符串）**：
  ```html
  <button 
    data-cyanly-event="checkout" 
    data-cyanly-props='{"cart_total": 499.50, "items_count": 3}'>
    Checkout
  </button>
  ```

### 编程式事件跟踪 (JavaScript 代码)
- **MPA 模式**：
  ```javascript
  window.cyanly.trackEvent('custom_event_name', {
    category: 'engagement',
    value: 42
  });
  ```
- **SPA 模式**：
  ```javascript
  import { trackEvent } from 'cyanly_sdk/spa';

  trackEvent('custom_event_name', {
    category: 'engagement',
    value: 42
  });
  ```

---

## 🛡️ 隐私合规与许可授权

Chiyo Analytics 支持细粒度的用户许可授权控制，该状态以 JSON 格式存储在浏览器的 `localStorage` 中：
`{"required":true,"functional":true,"personalization":false}`

- **必要 Cookies (Required)**：发送核心的匿名会话度量（始终保持开启）。
- **功能 Cookies (Functional)**：网站个性化配置。
- **个性化追踪 (Personalization)**：跨会话的长效访客追踪（需要用户显式同意）。如果用户关闭该许可，SDK 访客标识将降级为仅在单次会话内生效，同时后端入库程序会自动脱敏并匿名化该访客的 IP 和全部埋点日志。

### 显式配置许可同意状态
- **MPA 模式**：
  ```javascript
  window.cyanly.setConsent({
    required: true,
    functional: true,
    personalization: true
  });
  ```
- **SPA 模式**：
  ```javascript
  import { setConsent } from 'cyanly_sdk/spa';

  setConsent({
    required: true,
    functional: true,
    personalization: true
  });
  ```

---

## 📄 开源许可证
本项目基于 MIT License 开源协议。详情请查阅 [LICENSE](LICENSE) 文件。
