import type { PrivacyConsent, SerializedPrivacyConsent } from "../types";
import { CONSENT_CHANGE_EVENT, CONSENT_KEY, VISITOR_ID_KEY } from "../consts";

const GRANTED_CONSENT: PrivacyConsent = {
  required: true,
  functional: true,
  personalization: true,
};

const DENIED_CONSENT: PrivacyConsent = {
  required: true,
  functional: false,
  personalization: false,
};

export function serializeConsent(
  consent: PrivacyConsent,
): SerializedPrivacyConsent {
  return JSON.stringify(consent);
}

export function parseConsent(raw: string | undefined): PrivacyConsent | undefined {
  if (raw === undefined || raw === "") return undefined;

  if (raw === "granted") return GRANTED_CONSENT;
  if (raw === "denied") return DENIED_CONSENT;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPrivacyConsent(parsed)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function readStoredConsent(): PrivacyConsent | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return parseConsent(localStorage.getItem(CONSENT_KEY) || undefined);
}

export function saveConsent(consent: PrivacyConsent): void {
  if (typeof localStorage === "undefined") return;
  const serialized = serializeConsent(consent);
  localStorage.setItem(CONSENT_KEY, serialized);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<PrivacyConsent>(CONSENT_CHANGE_EVENT, {
        detail: consent,
      }),
    );
  }
}

export function persistConsentAndApplyStorage(
  consent: PrivacyConsent,
  visitorId: string,
): void {
  saveConsent(consent);
  if (typeof localStorage === "undefined") return;
  if (isStorageAllowedByConsent(consent)) {
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  } else {
    localStorage.removeItem(VISITOR_ID_KEY);
  }
}

export function isStorageAllowedByConsent(consent: PrivacyConsent): boolean {
  return consent.personalization;
}

function isPrivacyConsent(value: unknown): value is PrivacyConsent {
  if (typeof value !== "object" || value === null) return false;
  const maybe = value as {
    required?: unknown;
    functional?: unknown;
    personalization?: unknown;
  };

  return (
    maybe.required === true &&
    typeof maybe.functional === "boolean" &&
    typeof maybe.personalization === "boolean"
  );
}
