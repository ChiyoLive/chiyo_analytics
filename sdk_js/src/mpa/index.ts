/**
 * 适用于传统多 html 页面
 *
 * 直接埋入 script tag
 */

import { parseConfig } from "./config";
import { nanoid } from "nanoid";
import {
  SESSION_ID_KEY,
  VISITOR_ID_KEY,
  CONSENT_KEY,
  COUNTRY_CACHE_KEY,
  CONSENT_CHANGE_EVENT,
  DEFAULT_REPORTER_IGNORE_MS,
} from "../consts";
import { report, trackEvent as reporterTrackEvent } from "../lib/reporter";
import { readDeclarativeProps } from "../lib/declarative";
import { getJwtExpiry } from "../lib/jwt";
import { getPrivacySignal } from "../lib/privacy";
import {
  isStorageAllowedByConsent,
  persistConsentAndApplyStorage,
  readStoredConsent,
} from "../lib/consent";
import type { EventProperties, PrivacyConsent } from "../types";
import { ui } from "../ui/index";
import { requiresDefaultAnonymization } from "../lib/regions";

export { SESSION_ID_KEY, VISITOR_ID_KEY, CONSENT_KEY, COUNTRY_CACHE_KEY };

(async function () {
  try {
    const cfg = parseConfig();

    if (cfg.showPrivacyConsentBanner) {
      ui.banner.render();
    }

    let visitorId = "";
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

    function applyStorageStrategy(countryCode: string) {
      const currentConsent = cfg.consent || readStoredConsent();

      let allowStorage: boolean;

      if (currentConsent !== undefined) {
        allowStorage = isStorageAllowedByConsent(currentConsent);
      } else {
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

    function getGeoLookupUrl() {
      const url = new URL(cfg.geoLookupUrl, window.location.href);
      url.searchParams.set("site_id", cfg.siteId);
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

    function setConsent(consent: PrivacyConsent) {
      persistConsentAndApplyStorage(consent, visitorId);
    }

    function getConsent() {
      return cfg.consent || readStoredConsent();
    }

    let storedSessionId = sessionStorage.getItem(SESSION_ID_KEY);
    if (!storedSessionId) {
      storedSessionId = nanoid();
    }
    const sessionId = storedSessionId;
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);

    let resolvedToken: string | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    async function fetchToken() {
      if (!cfg.tokenUrl) return;
      try {
        const res = await fetch(`${cfg.tokenUrl}?sessionId=${sessionId}`);
        if (!res.ok) {
          throw new Error(`Token fetch failed: ${res.statusText}`);
        }
        const data = await res.json();
        if (data && data.token) {
          resolvedToken = data.token;
          scheduleTokenRefresh(data.token);
        }
      } catch (error) {
        console.error("[cyanly] Failed to fetch secure token", error);
      }
    }

    function scheduleTokenRefresh(token: string) {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = undefined;
      }
      const expiryMs = getJwtExpiry(token);
      if (!expiryMs) return;

      const now = Date.now();
      const ttl = expiryMs - now;

      if (ttl <= 0) {
        fetchToken();
        return;
      }

      const buffer = Math.min(5 * 60 * 1000, ttl * 0.2);
      const delay = ttl - buffer;

      refreshTimer = setTimeout(() => {
        fetchToken();
      }, delay);
    }

    if (cfg.tokenUrl) {
      await fetchToken();
    }

    resolveCountryStorageStrategy();

    window.addEventListener(CONSENT_CHANGE_EVENT, () => {
      applyCurrentCountryStorageStrategy();
    });

    const startTime = Date.now();
    const hasSent = { inner: false };

    function trackEvent(eventName: string, properties?: EventProperties): void {
      reporterTrackEvent({
        collectorUrl: cfg.collectorUrl,
        siteId: cfg.siteId,
        visitorId,
        sessionId,
        eventName,
        properties,
        token: resolvedToken,
        consent: getConsent(),
      });
    }

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
            // Invalid data-cyanly-props drops the whole event
            // (readDeclarativeProps already warned), rather than sending it
            // without properties.
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).cyanly = {
      trackEvent,
      setConsent,
      ui,
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        report({
          ignoreMs: cfg.reporterIgnoreMs || DEFAULT_REPORTER_IGNORE_MS,
          collectorUrl: cfg.collectorUrl,
          siteId: cfg.siteId,
          visitorId,
          sessionId,
          startTime,
          hasSent,
          token: resolvedToken,
          consent: getConsent(),
        });
      }
    });

    window.addEventListener("pagehide", () => {
      report({
        ignoreMs: cfg.reporterIgnoreMs || DEFAULT_REPORTER_IGNORE_MS,
        collectorUrl: cfg.collectorUrl,
        siteId: cfg.siteId,
        visitorId,
        sessionId,
        startTime,
        hasSent,
        token: resolvedToken,
        consent: getConsent(),
      });
    });
  } catch (e) {
    console.error(e);
  }
})();
