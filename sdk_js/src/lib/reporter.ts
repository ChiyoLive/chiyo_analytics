import { getUtmParams, UtmParams } from "./utm";
import type {
  EventProperties,
  PrivacyConsent,
  SerializedPrivacyConsent,
} from "../types";
import { validateProperties } from "./properties";
import { getPrivacySignal } from "./privacy";
import { serializeConsent } from "./consent";

/**
 * JSON data to report, snake_case
 */
export type ReportData = {
  site_id: string;
  visitor_id: string;
  session_id: string;
  event_name: string;
  properties: string;
  url: string;
  title: string;
  referrer: string;
  duration_ms: number;
  screen_width: number;
  screen_height: number;
  language: string;
  utm: UtmParams;
  token?: string;
  consent?: SerializedPrivacyConsent;
  gpc: boolean;
};

export type MakeReportDataArgs = {
  siteId: string;
  visitorId: string;
  sessionId: string;
  eventName: string;
  properties?: string;
  durationMs: number;
  utm: UtmParams;
  url?: string;
  title?: string;
  referrer?: string;
  token?: string;
  consent?: PrivacyConsent;
};
export function makeReportData({
  siteId,
  visitorId,
  sessionId,
  eventName,
  properties,
  durationMs,
  utm,
  url,
  title,
  referrer,
  token,
  consent,
}: MakeReportDataArgs): ReportData {
  return {
    site_id: siteId,
    visitor_id: visitorId,
    session_id: sessionId,
    event_name: eventName,
    properties: properties || "",

    url:
      url !== undefined
        ? url
        : typeof window !== "undefined"
          ? window.location.href
          : "",
    title:
      title !== undefined
        ? title
        : typeof document !== "undefined"
          ? document.title
          : "",
    // 空字符串代表直接输入或书签
    referrer:
      referrer !== undefined
        ? referrer
        : typeof document !== "undefined"
          ? document.referrer || ""
          : "",
    duration_ms: durationMs,

    screen_width:
      typeof window !== "undefined" && window.screen ? window.screen.width : 0,
    screen_height:
      typeof window !== "undefined" && window.screen ? window.screen.height : 0,
    language: typeof navigator !== "undefined" ? navigator.language : "",

    utm,
    token,
    consent: consent ? serializeConsent(consent) : undefined,
    gpc: getPrivacySignal(),
  };
}

export type ReportArgs = {
  ignoreMs: number;
  collectorUrl: string;
  siteId: string;
  visitorId: string;
  sessionId: string;
  startTime: number;
  hasSent: { inner: boolean };
  token?: string;
  consent?: PrivacyConsent;
};
export function report({
  ignoreMs,
  collectorUrl,
  siteId,
  visitorId,
  sessionId,
  startTime,
  hasSent,
  token,
  consent,
}: ReportArgs) {
  if (typeof window === "undefined" || hasSent.inner) return;

  const endTime = Date.now();
  const durationMs = endTime - startTime;

  // 过滤掉停留时间过短的误触访问
  if (durationMs < ignoreMs) return;

  const utm = getUtmParams();
  const reportData = makeReportData({
    siteId,
    visitorId,
    sessionId,
    eventName: "pageview",
    durationMs,
    utm,
    token,
    consent,
  });

  const blob = new Blob([JSON.stringify(reportData)], {
    type: "application/json",
  });
  const success = navigator.sendBeacon(collectorUrl, blob);
  if (success) {
    hasSent.inner = true;
  }
}

export type TrackEventArgs = {
  collectorUrl: string;
  siteId: string;
  visitorId: string;
  sessionId: string;
  eventName: string;
  properties?: EventProperties;
  token?: string;
  consent?: PrivacyConsent;
};

export function trackEvent(args: TrackEventArgs): void {
  if (typeof window === "undefined") return;

  if (!args.eventName) {
    console.warn("[cyanly] eventName is required for trackEvent");
    return;
  }

  if (args.eventName === "pageview") {
    console.warn(
      "[cyanly] 'pageview' is reserved and cannot be used with trackEvent",
    );
    return;
  }

  const validated = validateProperties(args.properties);
  if (!validated.ok) {
    // validateProperties already warned; drop the event rather than send
    // data the collector would reject.
    return;
  }

  const reportData = makeReportData({
    siteId: args.siteId,
    visitorId: args.visitorId,
    sessionId: args.sessionId,
    eventName: args.eventName,
    properties: validated.serialized,
    durationMs: 0,
    utm: getUtmParams(),
    token: args.token,
    consent: args.consent,
  });

  const blob = new Blob([JSON.stringify(reportData)], {
    type: "application/json",
  });
  navigator.sendBeacon(args.collectorUrl, blob);
}
