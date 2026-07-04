import { denvPublic } from "./api";

export const IS_SERVER = typeof window === "undefined";

export function getAccessToken(): string | undefined {
  if (IS_SERVER) return undefined;
  return localStorage.getItem("cyanly_access_token") ?? undefined;
}

export function getRefreshToken(): string | undefined {
  if (IS_SERVER) return undefined;
  return localStorage.getItem("cyanly_refresh_token") ?? undefined;
}

export function setTokens(accessToken: string, refreshToken?: string) {
  if (IS_SERVER) return;
  localStorage.setItem("cyanly_access_token", accessToken);
  if (refreshToken) {
    localStorage.setItem("cyanly_refresh_token", refreshToken);
  }
}

export function clearTokens() {
  if (IS_SERVER) return;
  localStorage.removeItem("cyanly_access_token");
  localStorage.removeItem("cyanly_refresh_token");
}

export function parseJwt(token: string) {
  if (typeof window === "undefined") return undefined;
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch {
    return undefined;
  }
}

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

// Perform token refresh call
export async function refreshAccessToken(): Promise<string | undefined> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return undefined;

  try {
    const res = await fetch(
      `${await denvPublic.API_URL()}/api/v1/auth/refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
    );

    if (!res.ok) {
      throw new Error("Failed to refresh token");
    }

    const data = await res.json();
    if (data.access_token) {
      setTokens(data.access_token);
      return data.access_token;
    }
  } catch (err) {
    console.error("Refresh token error:", err);
    clearTokens();
  }
  return undefined;
}

// Perform token rotate call
export async function rotateTokens(): Promise<
  | {
      accessToken: string;
      refreshToken: string;
    }
  | undefined
> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return undefined;

  try {
    const res = await fetch(
      `${await denvPublic.API_URL()}/api/v1/auth/rotate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
    );

    if (!res.ok) {
      throw new Error("Failed to rotate tokens");
    }

    const data = await res.json();
    if (data.access_token && data.refresh_token) {
      setTokens(data.access_token, data.refresh_token);
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      };
    }
  } catch (err) {
    console.error("Rotate token error:", err);
    clearTokens();
  }
  return undefined;
}

// Wrapper around native fetch to inject Auth headers and auto-refresh expired tokens
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const accessToken = getAccessToken();

  // Initialize headers
  const headers = new Headers(options.headers || {});
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 && getRefreshToken()) {
    if (isRefreshing) {
      // Return a promise that resolves once the in-flight refresh finishes.
      return new Promise((resolve) => {
        addRefreshSubscriber((token) => {
          headers.set("Authorization", `Bearer ${token}`);
          resolve(fetch(url, { ...options, headers }));
        });
      });
    }

    isRefreshing = true;
    const newAccessToken = await refreshAccessToken();
    isRefreshing = false;

    if (newAccessToken) {
      onRefreshed(newAccessToken);
      headers.set("Authorization", `Bearer ${newAccessToken}`);
      return fetch(url, { ...options, headers });
    }

    // Refresh failed, redirect to login.
    if (typeof window !== "undefined") {
      const currentLang = window.location.pathname.split("/")[1] || "en";
      window.location.href = `/${currentLang}/login`;
    }
    refreshSubscribers = [];
    return response;
  }

  return response;
}
