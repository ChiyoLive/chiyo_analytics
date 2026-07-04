# Chiyo Analytics (cyanly)

A modern, high-performance, and privacy-compliant aggregate web analytics platform, built with a self-hosting-first mindset.

---

🌐 **Languages:**  
[English](README.md) | [简体中文](README.zh.md) | [日本語](README.ja.md)

---

## ✨ Features

- **🚀 High Performance**: Built with a Redis-backed write buffer to handle heavy concurrent ingestion traffic, decoupled from columnar ClickHouse analytics storage.
- **🛡️ Privacy First**: GDPR, CCPA, and ePrivacy compliant out-of-the-box. Natively respects Global Privacy Control (GPC) and Do-Not-Track (DNT) signals.
- **🎨 Modern Consent UX**: Comes with an integrated, modern Privacy Banner and Settings Dialog (with native light/dark mode support) featuring granular cookie categories (*Required, Functional, Personalization*).
- **🐳 Multi-Platform Docker**: Pre-built Docker images supporting both `linux/amd64` and `linux/arm64` architectures for seamless deployment on both x86 servers and ARM-based instances (like Apple Silicon or AWS Graviton).
- **📦 Python-based Installer**: Clean, interactive Python zipapp (`install-cyanly.pyz`) for automated setup, dependency configuration, and zero-downtime GeoIP database updates.
- **🔌 Flexible SDKs**: Easy integration via a traditional Multi-Page Application (MPA) script tag or a strongly-typed Single-Page Application (SPA) package.

---

## 🛠️ Quick Start (Installation)

### Prerequisites
- **Docker** and **Docker Compose** installed on your server.
- **Python 3** installed on your server (for the installer script).

### Step 1: Download & Configure
Download the latest configuration wizard and run the initialization step:
```bash
curl -sSL https://github.com/chiyolive/chiyo_analytics/releases/latest/download/install-cyanly.pyz -o install-cyanly.pyz
python3 install-cyanly.pyz config
```
This wizard will prompt you for your preferred language and generate a `./cyanly-preinstall/` directory containing the `chiyo_analytics.toml` configuration template.

### Step 2: Edit Configuration
Open `./cyanly-preinstall/chiyo_analytics.toml` in your preferred editor. Customize the domain settings, security keys, and database credentials to match your environment.

### Step 3: Install & Deploy
Run the installer to generate environments, download GeoIP databases, pull Docker images, and start the services:
```bash
python3 install-cyanly.pyz install
```

### Step 4: Maintenance & Commands
After installation, you can manage the deployment using the extracted `cyanly.pyz` script inside `~/.cyanly` (or your customized destination folder):

- **Apply configuration changes**: `python3 ~/.cyanly/cyanly.pyz up`
- **Restart all services**: `python3 ~/.cyanly/cyanly.pyz restart`
- **Check service status**: `docker compose ps` (run in the deployment folder)
- **Uninstall (stop and remove containers)**: `python3 ~/.cyanly/cyanly.pyz uninstall`
- **Destructive uninstall (removes containers & databases)**: `python3 ~/.cyanly/cyanly.pyz uninstall --volume`

---

## 🔌 JS SDK Integration

If `collector.serve_sdk` is set to `true` in your `chiyo_analytics.toml`, the collector serves the tracking scripts directly.

### 1. Multi-Page Application (MPA)
Add the script tag to your HTML headers. The SDK will automatically track pageviews:
```html
<script 
  src="https://your-collector-domain.com/sdk/mpa.iife.js" 
  data-site-id="your-site-id" 
  data-collector-url="https://your-collector-domain.com/collect"
  data-geo-lookup-url="https://your-collector-domain.com/collect/geo"
  // Optional: When passed, the SDK will automatically render the privacy consent banner. When the user selects "Accept All", it upgrades to full tracking. Otherwise, it automatically switches the tracking mode based on the visitor's country.
  data-show-privacy-consent-banner="true"
></script>
```

We provide an Express application under [examples/web](./examples/web) to demonstrate how to use the MPA SDK; you can check it out for more details.

### 2. Single-Page Application (SPA)
Install the SDK package in your frontend project:
```bash
npm install cyanly_sdk
# or
pnpm add cyanly_sdk
```
Then, initialize the SDK as early as possible in your **root client-side rendered component**:
```javascript
import { init, ui } from 'cyanly_sdk/spa';

function CyanlyTracker() {
  useEffect(() => {
    init({
      siteId: 'your-site-id',
      collectorUrl: "https://your-collector-domain.com/collect",
      geoLookupUrl: 'https://your-collector-domain.com/collect/geo'
    });

    // Optional: Render the privacy consent banner on the page. When the user selects "Accept All", it upgrades to full tracking. Otherwise, it automatically switches the tracking mode based on the visitor's country.
    ui.banner.render();
  }, []);
  return null;
}
```

If you have any questions about the timing of SDK initialization, we provide two SPA examples with all features enabled for reference:
- [examples/nextjs](./examples/nextjs)
    - This example builds an SSR full-stack application using Next.js with Secure Token enabled. It includes search-engine-friendly i18n localization, SSR-friendly dark mode, and various other modern features.
    - Please refer to [cyanly-tracker](examples/nextjs/src/components/cyanly-tracker.tsx) and [layout.tsx](examples/nextjs/src/app/[lang]/layout.tsx) to learn how to initialize the SDK in Next.js.
- [examples/vite_react_router](./examples/vite_react_router)
    - This example builds a pure CSR (Client-Side Rendering) application using Vite and React Router v7.
    - It demonstrates how to enable Secure Token for a pure CSR application using [dev.js](./examples/vite_react_router/dev.js).
    - Please refer to [RootLayout.tsx](examples/vite_react_router/src/layouts/RootLayout.tsx) to learn how to initialize the SDK in a CSR Single-Page Application.

---

## 🏷️ Custom Event Tracking

### Declarative Tracking (HTML Attributes)
Add tracking attributes to HTML elements. Outbound cross-origin links are automatically tracked as `outbound_click`.

- **Basic Event**:
  ```html
  <button data-cyanly-event="click_download">Download Now</button>
  ```
- **Event with Custom Properties** (using shorthand attributes):
  ```html
  <button 
    data-cyanly-event="add_to_cart" 
    data-cyanly-prop-product-id="prod_889" 
    data-cyanly-prop-price="199::<number>" 
    data-cyanly-prop-active="true::<boolean>">
    Add to Cart
  </button>
  ```
- **Event with Custom Properties (Passing JSON String Directly)**:
  ```html
  <button 
    data-cyanly-event="checkout" 
    data-cyanly-props='{"cart_total": 499.50, "items_count": 3}'>
    Checkout
  </button>
  ```

### Imperative Tracking (JavaScript Code)
- **MPA Variant**:
  ```javascript
  window.cyanly.trackEvent('custom_event_name', {
    category: 'engagement',
    value: 42
  });
  ```
- **SPA Variant**:
  ```javascript
  import { trackEvent } from 'cyanly_sdk/spa';

  trackEvent('custom_event_name', {
    category: 'engagement',
    value: 42
  });
  ```

---

## 🛡️ Privacy Compliance & Consent

Chiyo Analytics supports granular user-consent states stored in `localStorage` as a JSON settings string:
`{"required":true,"functional":true,"personalization":false}`

- **Required Cookies**: Essential session tracking (always active).
- **Functional Cookies**: Site preferences.
- **Personalization Cookies**: Cross-session tracking (requires consent). If disabled, visitor tracking is restricted to the current browser session, and the backend automatically anonymizes the visitor IP and logs.

### Setting Consent State
- **MPA**:
  ```javascript
  window.cyanly.setConsent({
    required: true,
    functional: true,
    personalization: true
  });
  ```
- **SPA**:
  ```javascript
  import { setConsent } from 'cyanly_sdk/spa';

  setConsent({
    required: true,
    functional: true,
    personalization: true
  });
  ```

---

## 📄 License
This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
