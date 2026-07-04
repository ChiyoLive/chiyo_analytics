/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COUNTRY_CACHE_KEY, SESSION_ID_KEY, VISITOR_ID_KEY } from "../src/consts";

describe("SPA geo lookup", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  const originalNavigator = globalThis.navigator;
  const originalFetch = globalThis.fetch;
  const originalHistory = globalThis.history;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();

    const sessionValues = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn((key: string) => sessionValues.get(key) || null),
      setItem: vi.fn((key: string, value: string) => {
        sessionValues.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        sessionValues.delete(key);
      }),
    });
    const historyMock = {
      pushState: vi.fn(),
      replaceState: vi.fn(),
    };
    vi.stubGlobal("history", historyMock);
    vi.stubGlobal("Event", class MockEvent {
      type: string;

      constructor(type: string) {
        this.type = type;
      }
    });
    vi.stubGlobal("window", {
      location: { href: "https://app.example.test/page" },
      addEventListener: vi.fn(),
      history: historyMock,
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("document", {
      title: "Test",
      referrer: "",
      querySelector: vi.fn(() => undefined),
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("navigator", {
      language: "en-US",
      sendBeacon: vi.fn(() => true),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ country: "US" }),
        }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: originalSessionStorage,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch,
    });
    Object.defineProperty(globalThis, "history", {
      configurable: true,
      value: originalHistory,
    });
  });

  it("should send site_id and resolved token to geo lookup", async () => {
    const { init } = await import("../src/spa/index");
    init({
      siteId: "secure-site",
      collectorUrl: "https://collector.example.test/collect",
      geoLookupUrl: "https://collector.example.test/collect/geo",
      tokenResolver: async () => "secure-token",
    });

    await vi.runAllTimersAsync();

    expect(fetch).toHaveBeenCalledWith(
      "https://collector.example.test/collect/geo?site_id=secure-site",
      {
        headers: {
          Authorization: "Bearer secure-token",
        },
      },
    );
  });

  it("should use cached country to persist visitor id without a geo fetch", async () => {
    vi.mocked(sessionStorage.getItem).mockImplementation((key: string) => {
      if (key === COUNTRY_CACHE_KEY) return "US";
      if (key === VISITOR_ID_KEY) return "session-visitor";
      if (key === SESSION_ID_KEY) return "session-id";
      return null;
    });

    const { init } = await import("../src/spa/index");
    init({
      siteId: "open-site",
      collectorUrl: "https://collector.example.test/collect",
      geoLookupUrl: "https://collector.example.test/collect/geo",
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.setItem).toHaveBeenCalledWith(
      VISITOR_ID_KEY,
      "session-visitor",
    );
  });
});
