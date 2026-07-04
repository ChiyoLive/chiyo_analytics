export type PrivacyConsentSettings = {
  required: true;
  functional: boolean;
  personalization: boolean;
};

export type PrivacyConsent = PrivacyConsentSettings;

export type SerializedPrivacyConsent = string;

export type TokenResolver = () => Promise<string>;

export type EventProperties = Record<string, string | number | boolean>;

export type Config = {
  collectorUrl: string;

  geoLookupUrl: string;

  siteId: string;

  /**
   * @default 1000
   */
  reporterIgnoreMs?: number;

  /**
   * SPA only.
   */
  disableHistoryInterception?: boolean;

  /**
   * SPA only.
   */
  disableUnloadListeners?: boolean;

  /**
   * SPA only.
   *
   * sdk 会在每次上报前调用这个函数来向服务器异步获取当前的 token
   */
  tokenResolver?: TokenResolver;

  /**
   * MPA only.
   *
   * 传统网页中服务器无法为还没开始的会话签发 token，需要等待用户页面加载完成。
   * 通过传入 data-token-url 把签发 token 的时机延后到页面加载完成后向服务端申请。
   */
  tokenUrl?: string;

  /**
   * Privacy consent controlled by the host application.
   *
   * When provided, this value is treated as the source of truth for the whole
   * SDK lifetime and always overrides `_cyanly_consent` in localStorage.
   * Use this when your application owns the complete consent flow, for example
   * by reading consent from a server-side cookie or account setting before
   * calling `init()`.
   *
   * Do not pass this option if you want the SDK's built-in banner or
   * `setConsent()` to control consent dynamically on the current page.
   */
  consent?: PrivacyConsent;

  /**
   * MPA only.
   *
   * 通过传入 data-show-privacy-consent-banner
   * 来控制是否渲染 sdk 自带的 banner
   */
  showPrivacyConsentBanner?: boolean;
};
