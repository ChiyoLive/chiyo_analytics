"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { Terminal, Clock, User, Cpu } from "lucide-react";

export interface EventLog {
  timestamp: string;
  url: string;
  title: string;
  durationMs: number;
  visitorId: string;
  sessionId: string;
}

const LiveConsoleContext = createContext<{
  logs: EventLog[];
  isConsoleOpen: boolean;
  setIsConsoleOpen: (open: boolean) => void;
}>({
  logs: [],
  isConsoleOpen: true,
  setIsConsoleOpen: () => {},
});

export function useLiveConsole() {
  return useContext(LiveConsoleContext);
}

export function LiveConsoleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Intercept beacons
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

    return () => {
      navigator.sendBeacon = originalSendBeacon;
    };
  }, []);

  return (
    <LiveConsoleContext.Provider
      value={{ logs, isConsoleOpen, setIsConsoleOpen }}
    >
      {children}
    </LiveConsoleContext.Provider>
  );
}

export function LiveConsole({ lang }: { lang: string }) {
  const { logs, isConsoleOpen, setIsConsoleOpen } = useLiveConsole();

  const labels = {
    en: {
      title: "Chiyo Ingest Live Console",
      captured: "pageview events captured",
      empty:
        "No analytics events logged yet. Navigate to other pages or refresh to generate events!",
      empty_sub: "(Stays lasting < 1 sec are filtered out to prevent noise)",
      expand: "Expand ▴",
      collapse: "Collapse ▾",
      url: "URL",
      title_label: "Title",
      visitor: "Visitor ID",
      session: "Session ID",
      duration: "Duration",
    },
    zh: {
      title: "Chiyo实时数据接收控制台",
      captured: "个页面访问事件被捕获",
      empty: "暂无分析事件记录。请切换页面或刷新以产生事件！",
      empty_sub: "（注意：停留时间小于 1 秒的访问将被自动过滤以防杂音干扰）",
      expand: "展开 ▴",
      collapse: "折叠 ▾",
      url: "网址",
      title_label: "标题",
      visitor: "访客 ID",
      session: "会话 ID",
      duration: "停留时长",
    },
    ja: {
      title: "Chiyo Analytics 受信コンソール",
      captured: "件のイベントを検知",
      empty:
        "分析イベントはまだありません。他のページに移動するか、リロードしてイベントを発生させてください！",
      empty_sub:
        "（注意：ノイズを防ぐため、1秒未満の滞在はフィルターで除外されます）",
      expand: "展開 ▴",
      collapse: "折叠 ▾",
      url: "URL",
      title_label: "タイトル",
      visitor: "ビジター ID",
      session: "セッション ID",
      duration: "滞在時間",
    },
  }[lang as "en" | "zh" | "ja"] || {
    title: "Chiyo Ingest Live Console",
    captured: "pageview events captured",
    empty:
      "No analytics events logged yet. Navigate to other pages or refresh to generate events!",
    empty_sub: "(Stays lasting < 1 sec are filtered out to prevent noise)",
    expand: "Expand ▴",
    collapse: "Collapse ▾",
    url: "URL",
    title_label: "Title",
    visitor: "Visitor ID",
    session: "Session ID",
    duration: "Duration",
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-black/95 text-zinc-300 font-mono shadow-2xl transition-all duration-300 backdrop-blur-md"
      style={{ height: isConsoleOpen ? "18rem" : "3rem" }}
    >
      {/* Header bar */}
      <div
        onClick={() => setIsConsoleOpen(!isConsoleOpen)}
        className="flex h-12 cursor-pointer items-center justify-between px-6 bg-zinc-950/80 hover:bg-zinc-950/40 border-b border-border/40 select-none"
      >
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <Terminal className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-bold text-emerald-400">
            {labels.title}
          </span>
          <span className="hidden sm:inline-block rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400 font-semibold border border-zinc-700/50">
            Site ID: test-site-id
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-zinc-500 hidden md:inline">
            {logs.length} {labels.captured}
          </span>
          <button className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium">
            {isConsoleOpen ? labels.collapse : labels.expand}
          </button>
        </div>
      </div>

      {/* Logs View */}
      <div className="h-[calc(18rem-3rem)] overflow-y-auto p-4 md:p-6">
        {!isConsoleOpen ? null : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-6">
            <Terminal className="h-10 w-10 text-zinc-600 mb-2 animate-pulse" />
            <p className="text-sm text-zinc-400 max-w-md">{labels.empty}</p>
            <p className="text-xs text-zinc-600 mt-1">{labels.empty_sub}</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-5xl mx-auto">
            {logs.map((log, index) => (
              <div
                key={index}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 transition-all duration-200 hover:border-emerald-500/30"
              >
                <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/60 pb-2 mb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
                      [BEACON REPORT]
                    </span>
                    <span className="text-xs text-zinc-500">
                      {log.timestamp}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <Clock className="h-3 w.3" />
                    <span>
                      {labels.duration}:{" "}
                      <strong className="text-sm font-bold">
                        {(log.durationMs / 1000).toFixed(1)}s
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-zinc-500 min-w-16 text-right">
                      {labels.url}:
                    </span>
                    <span
                      className="text-zinc-300 truncate font-semibold"
                      title={log.url}
                    >
                      {log.url}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-zinc-500 min-w-16 text-right">
                      {labels.title_label}:
                    </span>
                    <span
                      className="text-zinc-300 truncate font-semibold"
                      title={log.title}
                    >
                      {log.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-3 w-3 text-zinc-600" />
                    <span className="text-zinc-500 min-w-16 text-right">
                      {labels.visitor}:
                    </span>
                    <span className="text-zinc-400 font-mono select-all text-[11px] truncate bg-zinc-950/50 px-1.5 py-0.5 rounded border border-zinc-800/50">
                      {log.visitorId}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Cpu className="h-3 w-3 text-zinc-600" />
                    <span className="text-zinc-500 min-w-16 text-right">
                      {labels.session}:
                    </span>
                    <span className="text-zinc-400 font-mono select-all text-[11px] truncate bg-zinc-950/50 px-1.5 py-0.5 rounded border border-zinc-800/50">
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
  );
}

export function LiveConsoleLayoutWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isConsoleOpen } = useLiveConsole();
  return (
    <main className={`${className} ${isConsoleOpen ? "pb-80" : "pb-20"}`}>
      {children}
    </main>
  );
}
