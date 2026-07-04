import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isStorageAllowedByConsent,
  parseConsent,
  persistConsentAndApplyStorage,
  saveConsent,
  serializeConsent,
} from "../src/lib/consent";
import { CONSENT_CHANGE_EVENT, CONSENT_KEY, VISITOR_ID_KEY } from "../src/consts";

describe("consent helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should parse fine-grained consent JSON", () => {
    const consent = parseConsent(
      '{"required":true,"functional":true,"personalization":false}',
    );

    expect(consent).toEqual({
      required: true,
      functional: true,
      personalization: false,
    });
    expect(consent ? isStorageAllowedByConsent(consent) : true).toBe(false);
  });

  it("should serialize fine-grained consent JSON", () => {
    expect(
      serializeConsent({
        required: true,
        functional: false,
        personalization: true,
      }),
    ).toBe('{"required":true,"functional":false,"personalization":true}');
  });

  it("should map legacy consent values into fine-grained settings", () => {
    expect(parseConsent("granted")).toEqual({
      required: true,
      functional: true,
      personalization: true,
    });
    expect(parseConsent("denied")).toEqual({
      required: true,
      functional: false,
      personalization: false,
    });
  });

  it("should reject malformed consent", () => {
    expect(parseConsent("maybe")).toBeUndefined();
    expect(parseConsent('{"required":true}')).toBeUndefined();
  });

  it("should save consent and dispatch a change event", () => {
    const setItem = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    vi.stubGlobal("window", { dispatchEvent });

    saveConsent({
      required: true,
      functional: false,
      personalization: false,
    });

    expect(setItem).toHaveBeenCalledWith(
      CONSENT_KEY,
      '{"required":true,"functional":false,"personalization":false}',
    );
    expect(dispatchEvent).toHaveBeenCalledOnce();
    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent;
    expect(event.type).toBe(CONSENT_CHANGE_EVENT);
    expect(event.detail).toEqual({
      required: true,
      functional: false,
      personalization: false,
    });
  });

  it("should apply visitor id persistence from consent", () => {
    const setItem = vi.fn();
    const removeItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem, removeItem });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });

    persistConsentAndApplyStorage(
      { required: true, functional: true, personalization: true },
      "visitor-1",
    );

    expect(setItem).toHaveBeenCalledWith(VISITOR_ID_KEY, "visitor-1");

    persistConsentAndApplyStorage(
      { required: true, functional: false, personalization: false },
      "visitor-1",
    );

    expect(removeItem).toHaveBeenCalledWith(VISITOR_ID_KEY);
  });
});
