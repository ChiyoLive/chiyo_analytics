# Chiyo Analytics (cyanly)

セルフホスティング優先で設計された、高パフォーマンスかつプライバシー保護対応のモダンなウェブアクセス解析プラットフォーム。

---

🌐 **Languages:**  
[English](README.md) | [简体中文](README.zh.md) | [日本語](README.ja.md)

---

## ✨ 主な機能

- **🚀 高パフォーマンス設計**：Redis を用いた書き込みバッファ（キュー）を導入し、高並行なデータ収集と、ClickHouse 列指向データベースへの分析データ保存を疎結合化。高トラフィック时でも安定したスループットを実現します。
- **🛡️ プライバシー最優先**：GDPR、CCPA、および ePrivacy に標準で対応。Global Privacy Control (GPC) や Do-Not-Track (DNT) などのプライバシー保护シグナルをネイティブに処理します。
- **🎨 直感的な同意管理 UI**：Cookie カテゴリ（*必須、機能、パーソナライズ/クロスセッショントラッキング*）ごとに同意を細かく設定できるモダンなプライバシーバナーおよび設定ダイアログ（ライト/ダークモードにネイティブ対応）を内蔵。
- **🐳 マルチプラットフォーム Docker 対応**：公式ビルドの Docker イメージは `linux/amd64` と `linux/arm64` の両アーキテクチャをサポート。x86 サーバーのほか、Apple Silicon や AWS Graviton などの ARM ホストにもシームレスにデプロイ可能です。
- **📦 Python インストーラー**：対話型の Python zipapp（`install-cyanly.pyz`）により、環境設定や Docker Compose ファイルを自動生成。GeoIP データベースの自動ダウンロードおよび無停止（ホットリロード）更新にも対応しています。
- **🔌 柔軟な SDK 統合**：従来のマルチページアプリケーション（MPA）用の `<script>` タグによる埋め込み、またはシングルページアプリケーション（SPA）用の型定義付き npm パッケージによる統合をサポート。

---

## 🛠️ クイックスタート (インストールと起動)

### 事前準備
- サーバーに **Docker** と **Docker Compose** がインストールされていること。
- サーバーに **Python 3** がインストールされていること（管理スクリプトの実行に必要）。

### ステップ 1: ダウンロードと初期設定
以下のコマンドを実行して、最新のインストーラーウィザードをダウンロードし初期化します：
```bash
curl -sSL https://github.com/chiyolive/chiyo_analytics/releases/latest/download/install-cyanly.pyz -o install-cyanly.pyz
python3 install-cyanly.pyz config
```
実行すると希望の言語を尋ねられ、現在のディレクトリに `./cyanly-preinstall/` フォルダと設定ファイルのテンプレート `chiyo_analytics.toml` が生成されます。

### ステップ 2: 設定ファイルの編集
任意のテキストエディタで `./cyanly-preinstall/chiyo_analytics.toml` を開きます。ドメイン設定、セキュリティキー、データベースの認証情報などを環境に合わせて編集します。

### ステップ 3: インストールとデプロイ
インストーラーを実行して、環境ファイルの生成、GeoIP データベースのダウンロード、Docker イメージの取得、コンテナの起動を一括して行います：
```bash
python3 install-cyanly.pyz install
```

### ステップ 4: 日常運用とメンテナンス
インストール完了後、インストールディレクトリから同梱の管理 CLI を実行してください。この CLI は `~/.cyanly_installed` に記録された有効なインストールディレクトリを操作し、そのポインターが存在しない場合は `~/.cyanly` にフォールバックします：

- **既存の Compose ファイルからサービスを起動または再作成**：`python3 ~/.cyanly/cyanly.pyz up`
- **全サービスの再起動**：`python3 ~/.cyanly/cyanly.pyz restart`
- **稼働状態の確認**：デプロイ先フォルダで `docker compose ps` を実行
- **アンインストール（コンテナの停止と削除）**：`python3 ~/.cyanly/cyanly.pyz uninstall`
- **完全削除（コンテナおよびデータベースのデータの削除）**：`python3 ~/.cyanly/cyanly.pyz uninstall --volume`

---

## 🔌 JS SDK の統合

`chiyo_analytics.toml` で `collector.serve_sdk = true` が有効な場合、コレクターがトラッキング用 SDK を直接配信します。

### 1. マルチページアプリケーション (MPA)
HTML の `<head>` にスクリプトタグを追加するだけで、自動的にページビューの計測が開始されます：
```html
<script 
  src="https://your-collector-domain.com/sdk/mpa.iife.js" 
  data-site-id="your-site-id" 
  data-collector-url="https://your-collector-domain.com/collect"
  data-geo-lookup-url="https://your-collector-domain.com/collect/geo"
  // オプション: このパラメータを渡すと、SDK がプライバシー同意バナーを自動的にレンダリングします。ユーザーが「Accept All（すべて同意）」を選択するとフル追跡にアップグレードされ、それ以外の場合は訪問者の国に応じて追跡モードが自動的に切り替わります。
  data-show-privacy-consent-banner="true"
></script>
```

[examples/web](./examples/web) にて MPA SDK の使用方法を示す Express アプリケーションを提供しています。詳細についてはそちらをご確認ください。

### 2. シングルページアプリケーション (SPA)
フロントエンドプロジェクトに SDK パッケージをインストールします：
```bash
npm install cyanly_sdk
# または
pnpm add cyanly_sdk
```
その後、可能な限り**最初のクライアントサイドレンダリングコンポーネント**で SDK を初期化します：
```javascript
import { init, ui } from 'cyanly_sdk/spa';

function CyanlyTracker() {
  useEffect(() => {
    init({
      siteId: 'your-site-id',
      collectorUrl: "https://your-collector-domain.com/collect",
      geoLookupUrl: 'https://your-collector-domain.com/collect/geo'
    });

    // オプション: ページ内にプライバシー同意バナーをレンダリングします。ユーザーが「Accept All（すべて同意）」を選択するとフル追跡にアップグレードされ、それ以外の場合は訪問者の国に応じて追跡モードが自動的に切り替わります。
    ui.banner.render();
  }, []);
  return null;
}
```

SDK の初期化タイミングについて質問がある場合、すべての機能を有効にした 2 つの SPA 例を用意していますので参考にしてください：
- [examples/nextjs](./examples/nextjs)
    - この例は、Next.js を使用して Secure Token 機能を有効にした SSR フルスタックアプリケーションです。検索エンジンに優しい i18n 多言語対応や、SSR に優しいダークモードなどの様々なモダンな機能を備えています。
    - Next.js での SDK 初期化方法については、[cyanly-tracker](examples/nextjs/src/components/cyanly-tracker.tsx) と [layout.tsx](examples/nextjs/src/app/[lang]/layout.tsx) をご確認ください。
- [examples/vite_react_router](./examples/vite_react_router)
    - この例は、Vite と React Router v7 を使用して構築された純粋な CSR（クライアントサイドレンダリング）アプリケーションです。
    - [dev.js](./examples/vite_react_router/dev.js) を使用して、純粋な CSR アプリケーションで Secure Token 機能を有効にする方法を示しています。
    - CSR シングルページアプリケーションでの SDK 初期化方法については、[RootLayout.tsx](examples/vite_react_router/src/layouts/RootLayout.tsx) をご確認ください。

---

## 🏷️ カスタムイベントトラッキング

### 宣言的トラッキング (HTML 属性)
HTML 要素に属性を追加するだけで計測できます。外部ドメインへのリンククリックは自動的に `outbound_click` イベントとして収集されます。

- **基本的なイベント**：
  ```html
  <button data-cyanly-event="click_download">Download Now</button>
  ```
- **カスタムプロパティを付与する場合（簡易記法）**：
  ```html
  <button 
    data-cyanly-event="add_to_cart" 
    data-cyanly-prop-product-id="prod_889" 
    data-cyanly-prop-price="199::<number>" 
    data-cyanly-prop-active="true::<boolean>">
    Add to Cart
  </button>
  ```
- **カスタムパラメータ付き属性（JSON文字列を直接渡す場合）**：
  ```html
  <button 
    data-cyanly-event="checkout" 
    data-cyanly-props='{"cart_total": 499.50, "items_count": 3}'>
    Checkout
  </button>
  ```

### 命令的トラッキング (JavaScript コード)
- **MPA 構成**：
  ```javascript
  window.cyanly.trackEvent('custom_event_name', {
    category: 'engagement',
    value: 42
  });
  ```
- **SPA 構成**：
  ```javascript
  import { trackEvent } from 'cyanly_sdk/spa';

  trackEvent('custom_event_name', {
    category: 'engagement',
    value: 42
  });
  ```

---

## 🛡️ プライバシー準拠と同意設定

Chiyo Analytics は、ブラウザの `localStorage` に JSON 文字列形式で保存される同意状態（同意パラメータ）を細かく制御できます。
`{"required":true,"functional":true,"personalization":false}`

- **必須 Cookies (Required)**：基本的なセッション計測（常に有効）。
- **機能 Cookies (Functional)**：サイト内のユーザーカスタマイズ。
- **パーソナライズ追跡 (Personalization)**：クロスセッションでのユーザー特定（要明示的同意）。無効化された場合、トラッキングは現在のセッション内に制限され、コレクターおよびワーカー側で訪問者 IP や収集ログが自動的に匿名化・マスキングされます。

### 同意状態の設定
- **MPA 構成**：
  ```javascript
  window.cyanly.setConsent({
    required: true,
    functional: true,
    personalization: true
  });
  ```
- **SPA 構成**：
  ```javascript
  import { setConsent } from 'cyanly_sdk/spa';

  setConsent({
    required: true,
    functional: true,
    personalization: true
  });
  ```

---

## 📄 ライセンス
このプロジェクトは MIT ライセンスの下でオープンソースとして公開されています。詳細は [LICENSE](LICENSE) ファイルを参照してください。
