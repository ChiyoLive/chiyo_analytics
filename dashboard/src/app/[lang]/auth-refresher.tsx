"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  getAccessToken,
  getRefreshToken,
  parseJwt,
  refreshAccessToken,
  rotateTokens,
} from "@/lib/auth";

export function AuthRefresher() {
  const pathname = usePathname();

  useEffect(() => {
    // Skip if on the login page
    if (pathname && pathname.endsWith("/login")) {
      return;
    }

    const checkAndRefreshTokens = async () => {
      const accessToken = getAccessToken();
      const refreshToken = getRefreshToken();

      if (!accessToken || !refreshToken) {
        return;
      }

      const now = Math.floor(Date.now() / 1000);

      // 1. Proactive Access Token Refresh
      const accessClaims = parseJwt(accessToken);
      if (accessClaims && accessClaims.exp) {
        const iat = accessClaims.iat || (accessClaims.exp - 900); // fallback to 15m
        const totalDuration = accessClaims.exp - iat;
        const threshold = Math.min(60, totalDuration * 0.2);

        const accessTimeRemaining = accessClaims.exp - now;
        if (accessTimeRemaining <= threshold) {
          console.log(`[AuthRefresher] Access token expiring soon (remaining: ${accessTimeRemaining}s, threshold: ${threshold}s), refreshing...`);
          await refreshAccessToken();
        }
      }

      // 2. Proactive Refresh Token Rotation
      const refreshClaims = parseJwt(refreshToken);
      if (refreshClaims && refreshClaims.exp) {
        const iat = refreshClaims.iat || (refreshClaims.exp - 2592000); // fallback to 30d
        const totalDuration = refreshClaims.exp - iat;
        const threshold = Math.min(86400, totalDuration * 0.2);

        const refreshTimeRemaining = refreshClaims.exp - now;
        if (refreshTimeRemaining <= threshold) {
          console.log(`[AuthRefresher] Refresh token expiring soon (remaining: ${refreshTimeRemaining}s, threshold: ${threshold}s), rotating...`);
          await rotateTokens();
        }
      }
    };

    // Run immediately on mount
    checkAndRefreshTokens();

    // Determine check interval dynamically: must be at most half of the access token refresh threshold
    let checkInterval = 30000; // default 30s
    const accessToken = getAccessToken();
    if (accessToken) {
      const claims = parseJwt(accessToken);
      if (claims && claims.exp && claims.iat) {
        const totalDuration = claims.exp - claims.iat;
        const threshold = Math.min(60, totalDuration * 0.2);
        checkInterval = Math.max(1000, Math.min(30000, Math.floor(threshold / 2) * 1000));
      }
    }

    const interval = setInterval(checkAndRefreshTokens, checkInterval);

    return () => clearInterval(interval);
  }, [pathname]);

  return undefined;
}
