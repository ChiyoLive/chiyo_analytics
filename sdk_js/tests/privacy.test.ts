import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getPrivacySignal } from "../src/lib/privacy";

describe("privacy signal helper", () => {
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });

  it("should return false if navigator is undefined", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: undefined,
      configurable: true,
    });
    expect(getPrivacySignal()).toBe(false);
  });

  it("should return true if globalPrivacyControl is enabled", () => {
    const mockNavigator = {
      globalPrivacyControl: true,
    };
    Object.defineProperty(globalThis, "navigator", {
      value: mockNavigator,
      configurable: true,
    });
    expect(getPrivacySignal()).toBe(true);
  });

  it("should return true if doNotTrack is '1'", () => {
    const mockNavigator = {
      doNotTrack: "1",
    };
    Object.defineProperty(globalThis, "navigator", {
      value: mockNavigator,
      configurable: true,
    });
    expect(getPrivacySignal()).toBe(true);
  });

  it("should return true if msDoNotTrack is '1'", () => {
    const mockNavigator = {
      msDoNotTrack: "1",
    };
    Object.defineProperty(globalThis, "navigator", {
      value: mockNavigator,
      configurable: true,
    });
    expect(getPrivacySignal()).toBe(true);
  });

  it("should return true if window.doNotTrack is '1'", () => {
    const mockNavigator = {
      doNotTrack: undefined,
    };
    Object.defineProperty(globalThis, "navigator", {
      value: mockNavigator,
      configurable: true,
    });

    const mockWindow = {
      doNotTrack: "1",
    };
    Object.defineProperty(globalThis, "window", {
      value: mockWindow,
      configurable: true,
    });

    expect(getPrivacySignal()).toBe(true);
  });

  it("should return false if privacy signals are not set or set to other values", () => {
    const mockNavigator = {
      globalPrivacyControl: undefined,
      doNotTrack: "unspecified",
    };
    Object.defineProperty(globalThis, "navigator", {
      value: mockNavigator,
      configurable: true,
    });
    expect(getPrivacySignal()).toBe(false);
  });
});
