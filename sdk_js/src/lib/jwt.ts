/**
 * Lightweight, zero-dependency helper to extract expiration from JWT.
 */
export function getJwtExpiry(token: string): number | undefined {
  if (!token) return undefined;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;
    const payloadPart = parts[1];

    // Base64Url decode with padding fallback
    const padding = "=".repeat((4 - (payloadPart.length % 4)) % 4);
    const base64 = (payloadPart + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const jsonStr = atob(base64);
    const payload = JSON.parse(jsonStr);

    if (typeof payload.exp === "number") {
      return payload.exp * 1000; // convert to milliseconds
    }
  } catch (e) {
    // ignore parsing errors and return undefined
    console.error("get jwt expiry error", e);
  }
  return undefined;
}
