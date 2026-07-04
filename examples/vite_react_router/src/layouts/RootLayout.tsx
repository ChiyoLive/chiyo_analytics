import "cyanly_sdk/ui/index.css";

import { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation } from "react-router";
import { init, ui, trackPageView, SESSION_ID_KEY } from "cyanly_sdk/spa";

interface EventLog {
  timestamp: string;
  url: string;
  title: string;
  durationMs: number;
  visitorId: string;
  sessionId: string;
}

export default function RootLayout() {
  const location = useLocation();
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(true);

  // Initialize SDK
  useEffect(() => {
    init({
      // Reporter 默认不上报 1s 以下的 pageview
      // 你可以使用这个函数来更改这个设置
      reporterIgnoreMs: 1000,

      siteId: "example-vite-react-router",

      collectorUrl: "http://localhost:8080/collect",

      geoLookupUrl: "http://localhost:8080/collect/geo",

      // Manual mode requires setting disableHistoryInterception: true
      // If you want to use automatic tracking mode, please keep it false
      disableHistoryInterception: true,

      tokenResolver: async () => {
        // NOTE: In a real-world production application, you should NEVER request tokens
        // directly from the frontend using the secret, as this exposes your secret to the client.
        // You must build your own backend API/server to proxy the request and securely request
        // the token from the Collector.
        //
        // This is done via our local dev api server (dev.js) on port 23002 for demonstration.
        try {
          const sessId = sessionStorage.getItem(SESSION_ID_KEY) || "";
          const response = await fetch(
            `http://localhost:23002/api/cyanly-token?sessionId=${sessId}`,
          );
          if (!response.ok)
            throw new Error("Failed to fetch token from dev api server");
          const data = await response.json();
          console.log("fetch token success:", data);
          return data.token;
        } catch (e) {
          console.error("[cyanly] Failed to fetch secure token:", e);
          return "";
        }
      },
    });

    ui.banner.render();

    // ==========================================
    // DEMO ONLY: Intercept beacons to log events to the visual Live Console.
    // The code block below is NOT needed in actual production applications.
    const originalSendBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function (url, data) {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/collect") && data) {
        try {
          if (data instanceof Blob) {
            data.text().then((text) => {
              const payload = JSON.parse(text);
              setLogs((prev) => [
                {
                  timestamp: new Date().toLocaleTimeString(),
                  url: payload.url || "",
                  title: payload.title || "",
                  durationMs: payload.duration_ms || 0,
                  visitorId: payload.visitor_id || "",
                  sessionId: payload.session_id || "",
                },
                ...prev.slice(0, 19), // Limit to last 20 events
              ]);
            });
          }
        } catch (e) {
          console.error("Failed to parse beacon", e);
        }
      }
      return originalSendBeacon.apply(this, [url, data]);
    };
    // ==========================================

    return () => {
      // ==========================================
      // DEMO ONLY: Clean up beacon interception.
      navigator.sendBeacon = originalSendBeacon;
      // ==========================================
    };
  }, []);

  // Use react-router's location hook to track pages.
  // This prevents cases where automatic mode
  // might not fully cover all react-router edge cases.
  //
  // If you are using automatic mode,
  // this useEffect is NOT needed.
  // Please do NOT set up this hook while using automatic mode,
  // as it may cause duplicate reporting.
  // The js_sdk will handle everything for you.
  useEffect(() => {
    // Set a small timeout to ensure JS has updated metadata like the page title
    const timeout = setTimeout(() => {
      trackPageView();
    }, 50);

    return () => {
      clearTimeout(timeout);
    };
  }, [location]);

  // Handle theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-container">
          <NavLink to="/" className="logo-link">
            <span className="logo-badge">千</span>
            <span>Chiyo Store</span>
          </NavLink>

          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <nav className="nav-links">
              <NavLink
                to="/"
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                Home
              </NavLink>
              <NavLink
                to="/products"
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                Products
              </NavLink>
            </nav>

            <button
              onClick={() =>
                setTheme((t) => (t === "light" ? "dark" : "light"))
              }
              className="theme-toggle"
              aria-label="Toggle theme"
            >
              {theme === "light" ? "🌙" : "☀️"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <Outlet />
      </main>

      {/* Real-time Ingestion Stream Console */}
      <div
        className="live-console"
        style={{ height: isConsoleOpen ? "18rem" : "3rem" }}
      >
        {/* Toggle bar */}
        <div
          onClick={() => setIsConsoleOpen((o) => !o)}
          className="console-header"
        >
          <div className="console-status">
            <span className="status-indicator" />
            <span className="console-title">Chiyo Ingest Live Console</span>
            <span className="site-badge">
              Site ID: example-vite-react-router
            </span>
          </div>
          <div className="console-meta">
            <span className="console-count">
              {logs.length} pageview events captured
            </span>
            <button className="console-toggle-btn">
              {isConsoleOpen ? "Collapse ▾" : "Expand ▴"}
            </button>
          </div>
        </div>

        {/* Logs content */}
        <div className="console-logs">
          {!isConsoleOpen ? null : logs.length === 0 ? (
            <div className="console-empty">
              <span className="console-empty-icon">⚡️</span>
              <p>
                No analytics events logged yet. Navigate to other pages or
                refresh to generate events!
              </p>
              <p className="console-empty-sub">
                (Remember: stays lasting &lt; 1 sec are filtered out to prevent
                noise)
              </p>
            </div>
          ) : (
            <div className="log-list">
              {logs.map((log, index) => (
                <div key={index} className="log-item">
                  <div className="log-item-header">
                    <span className="log-item-tag">
                      [BEACON REPORT] @ {log.timestamp}
                    </span>
                    <span className="log-item-duration">
                      Duration:{" "}
                      <strong>{(log.durationMs / 1000).toFixed(1)}s</strong>
                    </span>
                  </div>
                  <div className="log-item-grid">
                    <div>
                      <span className="log-field">URL:</span>{" "}
                      <span className="log-field-value">{log.url}</span>
                    </div>
                    <div>
                      <span className="log-field">Title:</span>{" "}
                      <span className="log-field-value">{log.title}</span>
                    </div>
                    <div>
                      <span className="log-field">Visitor ID:</span>{" "}
                      <span className="log-field-value log-id">
                        {log.visitorId}
                      </span>
                    </div>
                    <div>
                      <span className="log-field">Session ID:</span>{" "}
                      <span className="log-field-value log-id">
                        {log.sessionId}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
