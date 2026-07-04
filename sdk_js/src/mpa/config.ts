import { DEFAULT_REPORTER_IGNORE_MS } from "../consts";
import { parseConsent } from "../lib/consent";
import type { Config } from "../types";

export function parseConfig(): Config {
  const currentScript = document.currentScript;
  if (!currentScript) {
    throw new Error("currentScript is empty");
  }

  const collectorUrl = currentScript.getAttribute("data-collector-url");
  if (!collectorUrl) {
    throw new Error("data-collector-url attribute is missing");
  }

  const siteId = currentScript.getAttribute("data-site-id");
  if (!siteId) {
    throw new Error("data-site-id attribute is missing");
  }

  const tokenUrl = currentScript.getAttribute("data-token-url") || undefined;
  const geoLookupUrl = currentScript.getAttribute("data-geo-lookup-url");
  if (!geoLookupUrl) {
    throw new Error("data-geo-lookup-url attribute is missing");
  }
  const consent = parseConsent(
    currentScript.getAttribute("data-consent") || undefined,
  );
  const showPrivacyConsentBanner =
    currentScript.getAttribute("data-show-privacy-consent-banner") === "true";

  const reporterIgnoreMs =
    Number(currentScript.getAttribute("data-reporter-ignore-ms")) ||
    DEFAULT_REPORTER_IGNORE_MS;

  return {
    collectorUrl,
    geoLookupUrl,
    siteId,
    tokenUrl,
    reporterIgnoreMs,
    consent,
    showPrivacyConsentBanner,
  };
}
