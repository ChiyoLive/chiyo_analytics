/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Checks if the browser has Global Privacy Control (GPC) or Do Not Track (DNT) active.
 */
export function getPrivacySignal(): boolean {
  if (typeof navigator === "undefined") return false;

  const hasGpc = (navigator as any).globalPrivacyControl === true;
  const hasDnt =
    navigator.doNotTrack === "1" ||
    (navigator as any).msDoNotTrack === "1" ||
    (typeof window !== "undefined" && (window as any).doNotTrack === "1");

  return hasGpc || hasDnt;
}
