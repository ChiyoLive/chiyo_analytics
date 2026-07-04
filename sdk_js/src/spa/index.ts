/**
 * 适用于 Single Page Application (SPA) 的 Web Analytics SDK
 *
 * 兼容 Client-Side Rendering (CSR) 和 Server-Side Rendering (SSR)
 */

import { nanoid } from "nanoid";
import {
  SESSION_ID_KEY,
  VISITOR_ID_KEY,
  CONSENT_KEY,
  COUNTRY_CACHE_KEY,
  CONSENT_CHANGE_EVENT,
  DEFAULT_REPORTER_IGNORE_MS,
} from "../consts";
import { getUtmParams } from "../lib/utm";
import {
  makeReportData,
  trackEvent as reporterTrackEvent,
} from "../lib/reporter";
import { getPrivacySignal } from "../lib/privacy";
import {
  isStorageAllowedByConsent,
  persistConsentAndApplyStorage,
  readStoredConsent,
} from "../lib/consent";
import { readDeclarativeProps } from "../lib/declarative";
import { getJwtExpiry } from "../lib/jwt";
import type {
  Config,
  EventProperties,
  PrivacyConsent,
  TokenResolver,
} from "../types";
import { ui } from "../ui/index";
import { requiresDefaultAnonymization } from "../lib/regions";

export { SESSION_ID_KEY, VISITOR_ID_KEY, CONSENT_KEY, COUNTRY_CACHE_KEY, ui };

let config: Config | undefined = undefined;
let visitorId = "";
let sessionId = "";
let activeUrl = "";
let activeTitle = "";
let activeReferrer = "";
let activeStartTime = 0;
let isReported = false;
let isInitialized = false;
let resolvedToken = "";
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

const isBrowser = typeof window !== "undefined";

async function resolveToken(tokenResolver: TokenResolver) {
  if (typeof tokenResolver !== "function") {
    console.error("[cyanly] invalid token resolver");
    return;
  }

  try {
    const res = await tokenResolver();
    if (typeof res === "string") {
      resolvedToken = res;
      scheduleTokenRefresh(res, tokenResolver);
    } else {
      console.error("[cyanly] invalid token resolver");
    }
  } catch (e) {
    console.error("[cyanly] Error executing token resolver", e);
  }
}

function scheduleTokenRefresh(token: string, tokenResolver: TokenResolver) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }

  const expiryMs = getJwtExpiry(token);
  if (!expiryMs) return;

  const now = Date.now();
  const ttl = expiryMs - now;

  if (ttl <= 0) {
    resolveToken(tokenResolver);
    return;
  }

  // Refresh at 80% of token lifetime, or 5 minutes before expiration, whichever is closer to expiration
  const buffer = Math.min(5 * 60 * 1000, ttl * 0.2);
  const delay = ttl - buffer;

  refreshTimer = setTimeout(() => {
    resolveToken(tokenResolver);
  }, delay);
}

/**
 * Persist a new consent value and immediately apply visitor-ID storage rules.
 */
export function setConsent(consent: PrivacyConsent): void {
  if (!isBrowser) return;
  persistConsentAndApplyStorage(consent, visitorId);
}

function applyStorageStrategy(countryCode: string) {
  if (!config) return;

  const currentConsent = config.consent || readStoredConsent();

  let allowStorage: boolean;

  if (currentConsent !== undefined) {
    allowStorage = isStorageAllowedByConsent(currentConsent);
  } else {
    // Check GPC/DNT privacy signals
    const isPrivacySignalActive = getPrivacySignal();

    if (
      requiresDefaultAnonymization(countryCode) ||
      countryCode.toUpperCase() === "CN"
    ) {
      allowStorage = false;
    } else if (countryCode.toUpperCase() === "US") {
      allowStorage = !isPrivacySignalActive;
    } else {
      allowStorage = !isPrivacySignalActive;
    }
  }

  if (allowStorage) {
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  }
}

function applyCurrentCountryStorageStrategy() {
  const cachedCountry = sessionStorage.getItem(COUNTRY_CACHE_KEY);
  if (cachedCountry) {
    applyStorageStrategy(cachedCountry);
  }
}

function getGeoLookupUrl(): string {
  if (!config) return "";
  const url = new URL(config.geoLookupUrl, window.location.href);
  url.searchParams.set("site_id", config.siteId);
  return url.toString();
}

function fetchCountry() {
  fetch(getGeoLookupUrl(), {
    headers: resolvedToken
      ? {
          Authorization: `Bearer ${resolvedToken}`,
        }
      : undefined,
  })
    .then((res) => res.json())
    .then((data) => {
      if (data && data.country) {
        sessionStorage.setItem(COUNTRY_CACHE_KEY, data.country);
        applyStorageStrategy(data.country);
      }
    })
    .catch((err) => {
      console.error("[cyanly] Failed to fetch IP geolocation", err);
    });
}

function resolveCountryStorageStrategy() {
  const cachedCountry = sessionStorage.getItem(COUNTRY_CACHE_KEY);
  if (cachedCountry) {
    applyStorageStrategy(cachedCountry);
  } else {
    fetchCountry();
  }
}

export function init(cfg: Config) {
  if (!isBrowser || isInitialized) return;
  config = cfg;
  isInitialized = true;

  // Retrieve or generate visitorId
  const storedVisitorId = localStorage.getItem(VISITOR_ID_KEY);
  if (storedVisitorId) {
    visitorId = storedVisitorId;
  } else {
    visitorId = sessionStorage.getItem(VISITOR_ID_KEY) || "";
    if (!visitorId) {
      visitorId = nanoid();
      sessionStorage.setItem(VISITOR_ID_KEY, visitorId);
    }
  }

  sessionId = sessionStorage.getItem(SESSION_ID_KEY) || "";
  if (!sessionId) {
    sessionId = nanoid();
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }

  activeUrl = window.location.href;
  activeTitle = document.title;
  activeReferrer = document.referrer || "";
  activeStartTime = Date.now();
  isReported = false;

  if (config.tokenResolver) {
    resolveToken(config.tokenResolver).finally(() => {
      resolveCountryStorageStrategy();
    });
  } else {
    resolveCountryStorageStrategy();
  }

  window.addEventListener(CONSENT_CHANGE_EVENT, () => {
    applyCurrentCountryStorageStrategy();
  });

  // Watch title changes (only if history interception/auto track is enabled)
  if (!config.disableHistoryInterception) {
    const target = document.querySelector("title");
    if (target) {
      const observer = new MutationObserver(() => {
        activeTitle = document.title;
      });
      observer.observe(target, {
        subtree: true,
        characterData: true,
        childList: true,
      });
    }
  }

  // Intercept history changes
  if (!config.disableHistoryInterception) {
    setupHistoryInterception();
  }

  // Listen to visibilitychange and pagehide
  if (!config.disableUnloadListeners) {
    setupUnloadListeners();
  }

  setupClickTracking();
}

export type TrackPageViewOptions = {
  customUrl?: string;
  customTitle?: string;
};

export function trackPageView({
  customTitle,
  customUrl,
}: TrackPageViewOptions = {}) {
  if (!isBrowser || !isInitialized || !config) return;

  const nextUrl = customUrl || window.location.href;
  const nextTitle = customTitle || document.title;

  const getCleanUrl = (u: string) => u.split("#")[0];
  if (activeUrl && getCleanUrl(nextUrl) === getCleanUrl(activeUrl)) {
    if (nextTitle !== activeTitle) {
      activeTitle = nextTitle;
    }
    return;
  }

  if (activeUrl) {
    triggerReport();
  }

  activeReferrer = activeUrl || document.referrer || "";
  activeUrl = nextUrl;
  activeTitle = nextTitle;
  activeStartTime = Date.now();
  isReported = false;
}

function triggerReport() {
  if (!config || !activeUrl || isReported) return;

  const endTime = Date.now();
  const durationMs = endTime - activeStartTime;

  const ignoreMs = config.reporterIgnoreMs || DEFAULT_REPORTER_IGNORE_MS;
  if (durationMs < ignoreMs) return;

  const utm = getUtmParams();
  const currentConsent = config.consent || readStoredConsent();

  const reportData = makeReportData({
    siteId: config.siteId,
    visitorId,
    sessionId,
    eventName: "pageview",
    durationMs,
    utm,
    url: activeUrl,
    title: activeTitle,
    referrer: activeReferrer,
    token: resolvedToken,
    consent: currentConsent,
  });

  const blob = new Blob([JSON.stringify(reportData)], {
    type: "application/json",
  });
  const success = navigator.sendBeacon(config.collectorUrl, blob);
  if (success) {
    isReported = true;
  }
}

export function trackEvent(
  eventName: string,
  properties?: EventProperties,
): void {
  if (!isBrowser || !isInitialized || !config) return;

  const currentConsent = config.consent || readStoredConsent();

  reporterTrackEvent({
    collectorUrl: config.collectorUrl,
    siteId: config.siteId,
    visitorId,
    sessionId,
    eventName,
    properties,
    token: resolvedToken,
    consent: currentConsent,
  });
}

function setupClickTracking() {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const cyanlyTarget = target.closest<HTMLElement>("[data-cyanly-event]");
      if (cyanlyTarget) {
        const eventName = cyanlyTarget.getAttribute("data-cyanly-event");
        if (eventName) {
          const parsed = readDeclarativeProps(cyanlyTarget);
          // Invalid data-cyanly-props drops the whole event (readDeclarativeProps
          // already warned), rather than sending it without properties.
          if (parsed.ok) {
            trackEvent(eventName, parsed.properties);
          }
        }
        // An explicit data-cyanly-event wins; do not also fire outbound_click
        // for the same click.
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      try {
        const linkUrl = new URL(anchor.href, window.location.origin);
        if (linkUrl.origin !== window.location.origin) {
          trackEvent("outbound_click", {
            href: anchor.href,
            text: (anchor.textContent || "").trim().slice(0, 200),
          });
        }
      } catch {
        // Invalid URL, skip.
      }
    },
    { capture: true },
  );
}

function setupHistoryInterception() {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  const handleUrlChange = async (oldUrl: string, newUrl: string) => {
    const getCleanUrl = (u: string) => u.split("#")[0];
    if (getCleanUrl(oldUrl) !== getCleanUrl(newUrl)) {
      if (config && config.tokenResolver) {
        const expiryMs = getJwtExpiry(resolvedToken);
        const now = Date.now();
        if (!expiryMs || now >= expiryMs - 10000) {
          await resolveToken(config.tokenResolver);
        }
      }
      triggerReport();

      activeReferrer = oldUrl;
      activeUrl = newUrl;
      activeTitle = document.title;
      activeStartTime = Date.now();
      isReported = false;
    }
  };

  history.pushState = function (state, unused, url) {
    const oldUrl = window.location.href;
    originalPushState.apply(this, [state, unused, url]);
    const newUrl = window.location.href;
    handleUrlChange(oldUrl, newUrl);
  };

  history.replaceState = function (state, unused, url) {
    const oldUrl = window.location.href;
    originalReplaceState.apply(this, [state, unused, url]);
    const newUrl = window.location.href;
    handleUrlChange(oldUrl, newUrl);
  };

  window.addEventListener("popstate", () => {
    const oldUrl = activeUrl;
    const newUrl = window.location.href;
    handleUrlChange(oldUrl, newUrl);
  });
}

function setupUnloadListeners() {
  const reportUnload = () => {
    triggerReport();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      reportUnload();
    } else if (document.visibilityState === "visible") {
      activeStartTime = Date.now();
      isReported = false;
    }
  });

  window.addEventListener("pagehide", () => {
    reportUnload();
  });
}
