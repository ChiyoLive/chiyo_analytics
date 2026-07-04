"use client";

import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { init, ui, trackPageView, SESSION_ID_KEY } from "cyanly_sdk/spa";

function TrackerCore() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 1. Initialize Chiyo Analytics on mount (Client-side only)
  useEffect(() => {
    init({
      // Reporter 默认不上报 1s 以下的 pageview
      // 你可以使用这个函数来更改这个设置
      reporterIgnoreMs: 1000,

      siteId: "example-next-js",

      collectorUrl: "http://localhost:8080/collect",

      geoLookupUrl: "http://localhost:8080/collect/geo",

      // We do manual routing tracking below.
      //
      // Manual mode requires setting disableHistoryInterception: true
      // If you want to use automatic tracking mode, please keep it false
      disableHistoryInterception: true,

      tokenResolver: async () => {
        const sessId = sessionStorage.getItem(SESSION_ID_KEY) || "";
        const res = await fetch(`/api/cyanly-token?sessionId=${sessId}`);
        if (!res.ok) {
          console.error("Failed to fetch token: ", await res.text());
          return "";
        }
        const data = await res.json();
        return data.token;
      },
    });
    ui.banner.render();
  }, []);

  // 2. Use next.js's pathname and searchParams hook to track pages.
  // This prevents cases where automatic mode
  // might not fully cover all edge cases.
  //
  // If you are using automatic mode,
  // this useEffect is NOT needed.
  // Please do NOT set up this hook while using automatic mode,
  // as it may cause duplicate reporting.
  // The js_sdk will handle everything for you.
  useEffect(() => {
    // Set a small delay to ensure React/Next.js has completed rendering
    // and updated the document.title in the DOM.
    const timeout = setTimeout(() => {
      trackPageView();
    }, 50);

    return () => clearTimeout(timeout);
  }, [pathname, searchParams]);

  return null;
}

export function CyanlyTracker() {
  return (
    <Suspense fallback={null}>
      <TrackerCore />
    </Suspense>
  );
}
