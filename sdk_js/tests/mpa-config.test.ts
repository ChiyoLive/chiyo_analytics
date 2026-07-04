import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseConfig } from "../src/mpa/config";

type ScriptAttrs = {
  "data-collector-url": string;
  "data-geo-lookup-url": string;
  "data-site-id": string;
  "data-reporter-ignore-ms": string;
  "data-show-privacy-consent-banner": string;
  "data-consent": string;
};

describe("parseConfig", () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    const script = {
      getAttribute(name: string): string | undefined {
        const attrs: ScriptAttrs = {
          "data-collector-url": "https://collector.example.com/collect",
          "data-geo-lookup-url": "https://collector.example.com/collect/geo",
          "data-site-id": "site_123",
          "data-reporter-ignore-ms": "2000",
          "data-show-privacy-consent-banner": "true",
          "data-consent":
            '{"required":true,"functional":true,"personalization":false}',
        };
        if (name in attrs) {
          return attrs[name as keyof ScriptAttrs];
        }
        return undefined;
      },
    };

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        currentScript: script,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  });

  it("should parse privacy and geo lookup config from script attributes", () => {
    expect(parseConfig()).toEqual({
      collectorUrl: "https://collector.example.com/collect",
      geoLookupUrl: "https://collector.example.com/collect/geo",
      siteId: "site_123",
      tokenUrl: undefined,
      reporterIgnoreMs: 2000,
      showPrivacyConsentBanner: true,
      consent: {
        required: true,
        functional: true,
        personalization: false,
      },
    });
  });
});
