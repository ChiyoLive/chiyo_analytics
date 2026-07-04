"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { fetchWithAuth } from "@/lib/auth";
import { denvPublic } from "@/lib/api";
import {
  UserPlus,
  UserCheck,
  Globe,
  GlobeOff,
  Smartphone,
  Tablet,
  Monitor,
  Terminal,
  BookOpenText,
  Layers,
  BookUser,
  Compass,
  Flame,
  Play,
  Pause,
  RefreshCw,
  ExternalLink,
  MonitorSmartphone,
  Earth,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ChromeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="4" />
    <line x1="21.17" y1="8" x2="12" y2="8" />
    <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
    <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
  </svg>
);
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

type Action = {
  url: string;
  title: string;
  timestamp: string;
  duration_ms: number;
};

type Session = {
  session_id: string;
  visitor_id: string;
  start_time: string;
  end_time: string;
  total_duration_ms: number;
  ip: string;
  country: string;
  country_code: string;
  region: string;
  city: string;
  language: string;
  user_agent: string;
  device_type: string;
  os_name: string;
  os_version: string;
  browser_name: string;
  browser_version: string;
  referrer: string;
  is_returning: boolean;
  actions: Action[];
  device_brand?: string;
  device_model?: string;
  screen_width?: number;
  screen_height?: number;
};

type VisitorProfile = {
  visitor_id: string;
  total_sessions: number;
  first_visit: string;
  last_visit: string;
  devices: string[];
  operating_systems: string[];
  browsers: string[];
  countries: string[];
};

type RealtimeSidebarProps = {
  siteId: string;
  lang: string;
  translations: Record<string, string>;
};

export function RealtimeSidebar({
  siteId,
  lang,
  translations,
}: RealtimeSidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [pollingInterval, setPollingInterval] = useState<number>(1000); // Default 1s
  const [isPaused, setIsPaused] = useState(false);
  // Dialog States
  const [activeDialog, setActiveDialog] = useState<
    | {
        type: "country" | "browser" | "os" | "device" | "profile" | "action";
        session?: Session;
        action?: Action;
      }
    | undefined
  >(undefined);

  const [visitorProfile, setVisitorProfile] = useState<
    VisitorProfile | undefined
  >(undefined);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Poll Ref for cleanup
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetchWithAuth(
        `${await denvPublic.API_URL()}/api/v1/analytics/recent_sessions?site_id=${siteId}`,
      );
      if (res.ok) {
        const data = (await res.json()) as Session[];
        setSessions(data);
      }
    } catch (e) {
      console.error("Failed to fetch real-time sessions:", e);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  const fetchVisitorProfile = async (visitorId: string) => {
    setLoadingProfile(true);
    setVisitorProfile(undefined);
    try {
      const res = await fetchWithAuth(
        `${await denvPublic.API_URL()}/api/v1/analytics/visitor?site_id=${siteId}&visitor_id=${visitorId}`,
      );
      if (res.ok) {
        const data = (await res.json()) as VisitorProfile;
        setVisitorProfile(data);
      }
    } catch (e) {
      console.error("Failed to fetch visitor profile:", e);
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    fetchSessions(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchSessions]);

  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

    if (pollingInterval > 0 && !isPaused) {
      pollTimerRef.current = setInterval(() => {
        fetchSessions();
      }, pollingInterval);
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [pollingInterval, isPaused, fetchSessions]);

  // Helper formatters
  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString(
      lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      },
    );
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    return d.toLocaleString(
      lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US",
    );
  };

  const formatDuration = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const mins = Math.floor(sec / 60);
    const remainingSecs = sec % 60;
    return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins}m`;
  };

  const getFlagEmoji = (countryCode: string) => {
    if (!countryCode || countryCode === "Unknown" || countryCode === "Local") {
      return "🌐";
    }
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map((char) => 127397 + char.charCodeAt(0));
    try {
      return String.fromCodePoint(...codePoints);
    } catch {
      return "🌐";
    }
  };

  const getReferrerDomain = (url: string) => {
    if (!url) return translations["dashboard:direct_entry"];
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url;
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType?.toLowerCase()) {
      case "mobile":
        return <Smartphone className="h-4 w-4" />;
      case "tablet":
        return <Tablet className="h-4 w-4" />;
      case "desktop":
        return <Monitor className="h-4 w-4" />;
      case "bot":
        return <Terminal className="h-4 w-4 text-destructive" />;
      default:
        return <MonitorSmartphone className="h-4 w-4" />;
    }
  };

  const getBrowserIcon = (browserName: string) => {
    const name = browserName?.toLowerCase() || "";
    if (name.includes("chrome")) {
      return <ChromeIcon className="h-4 w-4 text-amber-500" />;
    }
    if (name.includes("safari")) {
      return <Compass className="h-4 w-4 text-sky-500" />;
    }
    if (name.includes("firefox")) {
      return <Flame className="h-4 w-4 text-orange-500" />;
    }
    return <Compass className="h-4 w-4 text-zinc-500" />;
  };

  const getOSIcon = (osName: string) => {
    const name = osName?.toLowerCase() || "";
    if (
      name.includes("windows") ||
      name.includes("mac") ||
      name.includes("linux") ||
      name.includes("android") ||
      name.includes("ios")
    ) {
      return <Layers className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />;
    }
    return <Layers className="h-4 w-4 text-zinc-400" />;
  };

  const getCleanUrlPath = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.pathname + parsed.search;
    } catch {
      return url;
    }
  };

  const handleProfileClick = (visitorId: string, session: Session) => {
    setActiveDialog({ type: "profile", session });
    fetchVisitorProfile(visitorId);
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full space-y-4">
        {/* Realtime Header & Controls */}
        <div className="flex items-center justify-between border-b pb-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isPaused ? "bg-amber-400" : "bg-emerald-400"}`}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${isPaused ? "bg-amber-500" : "bg-emerald-500"}`}
              ></span>
            </span>
            <h3 className="font-bold text-foreground text-sm uppercase tracking-wider">
              {translations["dashboard:realtime_analysis"]}
            </h3>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5">
            <select
              value={pollingInterval}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setPollingInterval(val);
                if (val === 0) setIsPaused(true);
              }}
              className="text-xs bg-zinc-100 dark:bg-zinc-800 border-none outline-none rounded px-2 py-1 text-zinc-600 dark:text-zinc-400 font-medium"
              title={translations["dashboard:polling_interval"]}
            >
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
              <option value={0}>
                {translations["dashboard:manual_refresh"]}
              </option>
            </select>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? "Play" : "Pause"}
            >
              {isPaused ? (
                <Play className="h-3.5 w-3.5" />
              ) : (
                <Pause className="h-3.5 w-3.5" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={fetchSessions}
              title={translations["common:refresh"]}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Sessions Card list */}
        <div className="p-1 flex-1 overflow-y-auto space-y-3 max-h-[75vh] lg:max-h-[calc(100vh-220px)] pr-1 scrollbar-thin">
          {loading && sessions.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground animate-pulse">
              {translations["common:loading"]}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              No active visits in the last 24h
            </div>
          ) : (
            sessions.map((session) => (
              <Card
                key={session.session_id}
                className="group overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:shadow-md transition-all duration-200"
              >
                <CardContent className="p-3.5 space-y-3">
                  {/* 1. Header Row [R] + Time & Duration */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            {session.is_returning ? (
                              <UserCheck className="h-4 w-4 text-emerald-500 stroke-[2.5]" />
                            ) : (
                              <UserPlus className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          {session.is_returning
                            ? translations["dashboard:returning_visitor"] ||
                              "Returning Visitor"
                            : translations["dashboard:new_visitor"]}
                        </TooltipContent>
                      </Tooltip>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {formatTime(session.start_time)}
                      </span>
                    </div>
                    <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 font-medium font-mono">
                      {formatDuration(session.total_duration_ms)}
                    </span>
                  </div>

                  {/* 2. Referrer Info [D] */}
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {session.referrer ? (
                      <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
                    ) : (
                      <GlobeOff className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    )}
                    <span
                      className="truncate max-w-[280px] font-medium block cursor-help"
                      title={session.referrer || undefined}
                    >
                      {getReferrerDomain(session.referrer)}
                    </span>
                  </div>

                  {/* 3. Badges Metadata Row [C] [B] [O] [D] [P] */}
                  <div className="flex items-center justify-between pt-1 border-t dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      {/* Country [C] */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() =>
                              setActiveDialog({ type: "country", session })
                            }
                            className="hover:text-primary transition-colors cursor-pointer text-zinc-500 dark:text-zinc-400"
                          >
                            <Earth className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          {session.country
                            ? `${session.country}${session.city ? `, ${session.city}` : ""}`
                            : translations["dashboard:geography_info"] ||
                              "Geography Details"}
                        </TooltipContent>
                      </Tooltip>

                      {/* Browser [B] */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() =>
                              setActiveDialog({ type: "browser", session })
                            }
                            className="hover:text-primary transition-colors cursor-pointer text-zinc-500 dark:text-zinc-400"
                          >
                            {getBrowserIcon(session.browser_name)}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          {session.browser_name} {session.browser_version}
                        </TooltipContent>
                      </Tooltip>

                      {/* OS [O] */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() =>
                              setActiveDialog({ type: "os", session })
                            }
                            className="hover:text-primary transition-colors cursor-pointer text-zinc-500 dark:text-zinc-400"
                          >
                            {getOSIcon(session.os_name)}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          {session.os_name} {session.os_version}
                        </TooltipContent>
                      </Tooltip>

                      {/* Device [D] */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() =>
                              setActiveDialog({ type: "device", session })
                            }
                            className="hover:text-primary transition-colors cursor-pointer text-zinc-500 dark:text-zinc-400"
                          >
                            {getDeviceIcon(session.device_type)}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          {session.device_brand
                            ? `${session.device_type} - ${session.device_brand} ${session.device_model || ""}`.trim()
                            : session.device_type}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Profile [P] */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                          onClick={() =>
                            handleProfileClick(session.visitor_id, session)
                          }
                        >
                          <BookUser className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        {translations["dashboard:visitor_profile"]}
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* 4. Page View Actions Path */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                    {session.actions.map((act, index) => (
                      <Tooltip key={index}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() =>
                              setActiveDialog({
                                type: "action",
                                session,
                                action: act,
                              })
                            }
                            className="flex items-center justify-center h-6 w-6 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shadow-sm"
                          >
                            <BookOpenText className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[20rem] space-y-1 p-2 text-xs">
                          <div className="max-w-[19rem]">
                            <p className="font-semibold truncate">
                              {act.title || "Untitled"}
                            </p>
                            <p className="text-[10px] text-zinc-400 truncate">
                              {getCleanUrlPath(act.url)}
                            </p>
                            <div className="flex justify-between text-[10px] text-zinc-400 pt-1">
                              <span>{formatTime(act.timestamp)}</span>
                              <span>{formatDuration(act.duration_ms)}</span>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Dialogs */}
        <Dialog
          open={activeDialog !== undefined}
          onOpenChange={(open) => !open && setActiveDialog(undefined)}
        >
          <DialogContent className="max-w-md bg-white dark:bg-zinc-950">
            {activeDialog?.type === "country" && activeDialog.session && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span>
                      {getFlagEmoji(activeDialog.session.country_code)}
                    </span>
                    <span>{translations["dashboard:geography_info"]}</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm pt-2">
                  <div className="grid grid-cols-3 py-1.5 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:countries"]}
                    </span>
                    <span className="col-span-2 font-semibold">
                      {activeDialog.session.country}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1.5 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:region"]}
                    </span>
                    <span className="col-span-2 font-semibold">
                      {activeDialog.session.region}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1.5 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:city"]}
                    </span>
                    <span className="col-span-2 font-semibold">
                      {activeDialog.session.city}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1.5 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:ip_address"]}
                    </span>
                    <span className="col-span-2 font-mono font-semibold">
                      {activeDialog.session.ip}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1.5">
                    <span className="text-zinc-500">
                      {translations["dashboard:languages"]}
                    </span>
                    <span className="col-span-2 font-semibold">
                      {activeDialog.session.language || "Unknown"}
                    </span>
                  </div>
                </div>
              </>
            )}

            {activeDialog?.type === "browser" && activeDialog.session && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {getBrowserIcon(activeDialog.session.browser_name)}
                    <span>{translations["dashboard:browser_info"]}</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm pt-2">
                  <div className="grid grid-cols-3 py-1.5 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:browser_name"]}
                    </span>
                    <span className="col-span-2 font-semibold">
                      {activeDialog.session.browser_name}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1.5 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:browser_version"]}
                    </span>
                    <span className="col-span-2 font-mono font-semibold">
                      {activeDialog.session.browser_version}
                    </span>
                  </div>
                  <div className="space-y-1 py-1.5">
                    <span className="text-zinc-500 block">
                      {translations["dashboard:user_agent"]}
                    </span>
                    <span className="block text-xs bg-zinc-50 dark:bg-zinc-900 p-2.5 rounded font-mono break-all border dark:border-zinc-800 leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {activeDialog.session.user_agent}
                    </span>
                  </div>
                </div>
              </>
            )}

            {activeDialog?.type === "os" && activeDialog.session && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {getOSIcon(activeDialog.session.os_name)}
                    <span>{translations["dashboard:os_info"]}</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm pt-2">
                  <div className="grid grid-cols-3 py-1.5 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:os_name"]}
                    </span>
                    <span className="col-span-2 font-semibold">
                      {activeDialog.session.os_name}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1.5 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:os_version"]}
                    </span>
                    <span className="col-span-2 font-mono font-semibold">
                      {activeDialog.session.os_version}
                    </span>
                  </div>
                  <div className="space-y-1 py-1.5">
                    <span className="text-zinc-500 block">
                      {translations["dashboard:user_agent"]}
                    </span>
                    <span className="block text-xs bg-zinc-50 dark:bg-zinc-900 p-2.5 rounded font-mono break-all border dark:border-zinc-800 leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {activeDialog.session.user_agent}
                    </span>
                  </div>
                </div>
              </>
            )}

            {activeDialog?.type === "device" && activeDialog.session && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {getDeviceIcon(activeDialog.session.device_type)}
                    <span>{translations["dashboard:device_info"]}</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm pt-2">
                  <div className="grid grid-cols-3 py-1.5 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:device_type"]}
                    </span>
                    <span className="col-span-2 font-semibold capitalize">
                      {activeDialog.session.device_type}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1.5 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:device_brand"]}
                    </span>
                    <span className="col-span-2 font-semibold">
                      {activeDialog.session.device_brand || "Unknown"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1.5 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:device_model"]}
                    </span>
                    <span className="col-span-2 font-semibold">
                      {activeDialog.session.device_model || "Unknown"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1.5 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:resolution"]}
                    </span>
                    <span className="col-span-2 font-mono font-semibold">
                      {activeDialog.session.screen_width &&
                      activeDialog.session.screen_height
                        ? `${activeDialog.session.screen_width} x ${activeDialog.session.screen_height}`
                        : "Unknown"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1.5 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:os_info"]}
                    </span>
                    <span className="col-span-2 font-semibold">
                      {activeDialog.session.os_name}{" "}
                      {activeDialog.session.os_version}
                    </span>
                  </div>
                  <div className="space-y-1 py-1.5">
                    <span className="text-zinc-500 block">
                      {translations["dashboard:user_agent"]}
                    </span>
                    <span className="block text-xs bg-zinc-50 dark:bg-zinc-900 p-2.5 rounded font-mono break-all border dark:border-zinc-800 leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {activeDialog.session.user_agent}
                    </span>
                  </div>
                </div>
              </>
            )}

            {activeDialog?.type === "profile" && activeDialog.session && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <BookUser className="h-5 w-5 text-primary" />
                    <span>{translations["dashboard:visitor_profile"]}</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3.5 text-sm pt-2">
                  {loadingProfile ? (
                    <div className="text-center py-6 text-xs text-muted-foreground animate-pulse">
                      Loading profile stats...
                    </div>
                  ) : visitorProfile ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 py-1 border-b dark:border-zinc-800">
                        <span className="text-zinc-500">
                          {translations["dashboard:visitor_id"]}
                        </span>
                        <span
                          className="col-span-2 font-mono text-xs truncate"
                          title={visitorProfile.visitor_id}
                        >
                          {visitorProfile.visitor_id}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 py-1 border-b dark:border-zinc-800">
                        <span className="text-zinc-500">
                          {translations["dashboard:total_visits"]}
                        </span>
                        <span className="col-span-2 font-semibold">
                          {visitorProfile.total_sessions}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 py-1 border-b dark:border-zinc-800">
                        <span className="text-zinc-500">
                          {translations["dashboard:first_visit"]}
                        </span>
                        <span className="col-span-2 font-semibold text-xs">
                          {formatDate(visitorProfile.first_visit)}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 py-1 border-b dark:border-zinc-800">
                        <span className="text-zinc-500">
                          {translations["dashboard:last_visit"]}
                        </span>
                        <span className="col-span-2 font-semibold text-xs">
                          {formatDate(visitorProfile.last_visit)}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 py-1 border-b dark:border-zinc-800">
                        <span className="text-zinc-500">
                          {translations["dashboard:devices_used"]}
                        </span>
                        <span className="col-span-2 font-semibold capitalize text-xs">
                          {visitorProfile.devices?.join(", ") || "Unknown"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 py-1 border-b dark:border-zinc-800">
                        <span className="text-zinc-500">
                          {translations["dashboard:operating_systems_used"]}
                        </span>
                        <span className="col-span-2 font-semibold text-xs">
                          {visitorProfile.operating_systems?.join(", ") ||
                            "Unknown"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 py-1 border-b dark:border-zinc-800">
                        <span className="text-zinc-500">
                          {translations["dashboard:browsers_used"]}
                        </span>
                        <span className="col-span-2 font-semibold text-xs">
                          {visitorProfile.browsers?.join(", ") || "Unknown"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 py-1">
                        <span className="text-zinc-500">
                          {translations["dashboard:locations_visited"]}
                        </span>
                        <span className="col-span-2 font-semibold text-xs">
                          {visitorProfile.countries?.join(", ") || "Unknown"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-xs text-muted-foreground text-destructive">
                      Failed to load profile.
                    </div>
                  )}
                </div>
              </>
            )}

            {activeDialog?.type === "action" && activeDialog.action && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <BookOpenText className="h-5 w-5 text-primary" />
                    <span>{translations["dashboard:action_details"]}</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3.5 text-sm pt-2">
                  <div className="grid grid-cols-3 py-1 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:page_title"]}
                    </span>
                    <span className="col-span-2 font-semibold">
                      {activeDialog.action.title || "Untitled"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:url"]}
                    </span>
                    <span className="col-span-2 break-all text-xs font-mono font-medium leading-relaxed">
                      <a
                        href={activeDialog.action.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {activeDialog.action.url}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1 border-b dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {translations["dashboard:start_time"]}
                    </span>
                    <span className="col-span-2 font-semibold text-xs">
                      {formatDate(activeDialog.action.timestamp)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 py-1">
                    <span className="text-zinc-500">
                      {translations["dashboard:stay_duration"]}
                    </span>
                    <span className="col-span-2 font-semibold text-xs">
                      {formatDuration(activeDialog.action.duration_ms)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
