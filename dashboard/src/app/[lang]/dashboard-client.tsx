"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth, getAccessToken, clearTokens, getRefreshToken } from "@/lib/auth";
import { calculateTimeRange, denvPublic } from "@/lib/api";
import { SiteSelector } from "@/components/site-selector";
import { DashboardCharts } from "@/components/dashboard-charts";
import { RealtimeSidebar } from "@/components/realtime-sidebar";
import { OfflineCard } from "./offline-card";
import { OverviewCards } from "./overview-cards";
import { TopPagesCard } from "./top-pages-card";
import { TrafficSourcesCard } from "./traffic-sources-card";
import { UTMCampaignsCard } from "./utm-campaigns-card";
import { DevicesBreakdownCard } from "./devices-breakdown-card";
import { CustomEventsCard } from "./custom-events-card";
import { Loader2, PlusCircle, ShieldAlert, LogOut } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DashboardClientTrans } from "./page";
export type { DashboardClientTrans };

export type SiteInfo = {
  site_id: string;
  name: string;
};

export type DashboardClientProps = {
  lang: string;
  siteId: string;
  range: string;
  trans: DashboardClientTrans;
};

export type OverviewData = {
  pageviews: number;
  visitors: number;
  sessions: number;
  average_duration: number;
  bounce_rate: number;
};

export type ReferrerItem = {
  source: string;
  pageviews: number;
  visitors: number;
};

export type UTMItem = {
  source: string;
  medium: string;
  campaign: string;
  pageviews: number;
  visitors: number;
};

export type SourcesData = {
  referrers: ReferrerItem[];
  utm: UTMItem[];
};

export type PageItem = {
  url: string;
  title: string;
  pageviews: number;
  visitors: number;
  average_duration: number;
};

export type CountItem = {
  name: string;
  count: number;
};

export type DevicesData = {
  device_types: CountItem[];
  operating_systems: CountItem[];
  browsers: CountItem[];
  countries: CountItem[];
};

export type TimeSeriesItem = {
  timestamp: string;
  pageviews: number;
  visitors: number;
};

export type EventItem = {
  name: string;
  count: number;
  visitors: number;
};

export function DashboardClient({
  lang,
  siteId,
  range,
  trans,
}: DashboardClientProps) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sites, setSites] = useState<SiteInfo[] | undefined>(undefined);
  const [loadingSites, setLoadingSites] = useState(true);
  const [isSuperuser, setIsSuperuser] = useState<boolean>(false);

  // States for dashboard metrics
  const [overview, setOverview] = useState<OverviewData | undefined>(undefined);
  const [sources, setSources] = useState<SourcesData | undefined>(undefined);
  const [pages, setPages] = useState<PageItem[] | undefined>(undefined);
  const [devices, setDevices] = useState<DevicesData | undefined>(undefined);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesItem[] | undefined>(
    undefined,
  );
  const [events, setEvents] = useState<EventItem[] | undefined>(undefined);

  // 1. Authenticate check and site list fetch on mount
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push(`/${lang}/login`);
      return;
    }

    setIsAuthenticated(true); // eslint-disable-line react-hooks/set-state-in-effect

    let isMounted = true;
    const fetchSites = async () => {
      try {
        const res = await fetchWithAuth(
          `${await denvPublic.API_URL()}/api/v1/auth/me`,
        );
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            const list = (data.sites || []) as SiteInfo[];
            setSites(list);
            setIsSuperuser(!!data.is_superuser);
          }
        } else {
          if (isMounted) {
            setError(true);
          }
        }
      } catch (err) {
        console.error("Failed to fetch user sites:", err);
        if (isMounted) {
          setError(true);
        }
      } finally {
        if (isMounted) {
          setLoadingSites(false);
        }
      }
    };

    fetchSites();

    return () => {
      isMounted = false;
    };
  }, [lang, router]);

  // 2. Redirect and Fetch metrics whenever siteId, range, or authentication status changes
  useEffect(() => {
    if (!isAuthenticated || !sites) return;

    // Check if the current siteId is authorized for this user
    const isAuthorized = sites.some((s) => s.site_id === siteId);

    if (!isAuthorized) {
      if (sites.length > 0) {
        const firstSiteId = sites[0].site_id;
        const params = new URLSearchParams(window.location.search);
        params.set("site_id", firstSiteId);
        params.set("range", range);
        router.push(`?${params.toString()}`);
      } else {
        setLoading(false); // eslint-disable-line react-hooks/set-state-in-effect
      }
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(false);

      const timeRange = calculateTimeRange(range);
      const params = new URLSearchParams({
        site_id: siteId,
        start: timeRange.start,
        end: timeRange.end,
      }).toString();

      try {
        const [
          overviewRes,
          sourcesRes,
          pagesRes,
          devicesRes,
          timeSeriesRes,
          eventsRes,
        ] = await Promise.all([
          fetchWithAuth(
            `${await denvPublic.API_URL()}/api/v1/analytics/overview?${params}`,
          ),
          fetchWithAuth(
            `${await denvPublic.API_URL()}/api/v1/analytics/sources?${params}`,
          ),
          fetchWithAuth(
            `${await denvPublic.API_URL()}/api/v1/analytics/pages?${params}`,
          ),
          fetchWithAuth(
            `${await denvPublic.API_URL()}/api/v1/analytics/devices?${params}`,
          ),
          fetchWithAuth(
            `${await denvPublic.API_URL()}/api/v1/analytics/time_series?${params}`,
          ),
          fetchWithAuth(
            `${await denvPublic.API_URL()}/api/v1/analytics/events?${params}`,
          ),
        ]);

        if (
          !overviewRes.ok ||
          !sourcesRes.ok ||
          !pagesRes.ok ||
          !devicesRes.ok ||
          !timeSeriesRes.ok ||
          !eventsRes.ok
        ) {
          throw new Error("Failed to fetch dashboard metrics");
        }

        const [
          overviewData,
          sourcesData,
          pagesData,
          devicesData,
          timeSeriesData,
          eventsData,
        ] = await Promise.all([
          overviewRes.json() as Promise<OverviewData>,
          sourcesRes.json() as Promise<SourcesData>,
          pagesRes.json() as Promise<PageItem[]>,
          devicesRes.json() as Promise<DevicesData>,
          timeSeriesRes.json() as Promise<TimeSeriesItem[]>,
          eventsRes.json() as Promise<EventItem[]>,
        ]);

        setOverview(overviewData);
        setSources(sourcesData);
        setPages(pagesData);
        setDevices(devicesData);
        setTimeSeries(timeSeriesData);
        setEvents(eventsData);
      } catch (err) {
        console.error("Dashboard fetching error:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [siteId, range, isAuthenticated, sites, router]);

  if (isAuthenticated === undefined || loadingSites || (loading && !overview)) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasNoSites = sites && sites.length === 0;

  if (hasNoSites) {
    const handleLogout = async () => {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        try {
          await fetch(`${await denvPublic.API_URL()}/api/v1/auth/logout`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
        } catch (err) {
          console.error("Failed to revoke session on server:", err);
        }
      }
      clearTokens();
      router.push(`/${lang}/login`);
    };

    if (isSuperuser) {
      return (
        <main className="container mx-auto px-4 py-16 flex-1 flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md w-full border border-border bg-card shadow-lg rounded-xl">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
                <PlusCircle className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                {trans["dashboard:no_sites_title_admin"]}
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {trans["dashboard:no_sites_desc_admin"]}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4">
              <Button asChild className="w-full h-10 font-medium cursor-pointer">
                <Link href={`/${lang}/sites`}>
                  {trans["dashboard:no_sites_btn_admin"]}
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={handleLogout}
                className="w-full h-10 font-medium cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                {trans["nav:sign_out"]}
              </Button>
            </CardContent>
          </Card>
        </main>
      );
    }

    return (
      <main className="container mx-auto px-4 py-16 flex-1 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full border border-destructive/20 bg-card shadow-lg rounded-xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-4">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              {trans["dashboard:no_sites_title_user"]}
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {trans["dashboard:no_sites_desc_user"]}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Button
              variant="outline"
              onClick={handleLogout}
              className="w-full h-10 font-medium cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {trans["nav:sign_out"]}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (error || !overview) {
    return (
      <main className="container mx-auto px-4 py-8 flex-1">
        <OfflineCard
          statusOffline={trans["common:status_offline"]}
          statusOfflineDesc={trans["common:status_offline_desc"]}
        />
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8 flex-1 space-y-6">
      {/* 1. Header Site & Range Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground font-sans">
            {trans["dashboard:realtime_overview"]}
          </h2>
          <p className="text-sm text-muted-foreground font-sans">
            {`${trans["dashboard:monitoring_site"]}: ${siteId}`}
          </p>
        </div>
        <SiteSelector
          initialSiteId={siteId}
          initialRange={range}
          trans={trans}
          sites={sites || []}
        />
      </div>

      {/* Grid Layout: Sidebar (Left) + Analytics Content (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Real-time Sidebar Section */}
        <div className="lg:col-span-5 xl:col-span-4 order-1 lg:order-1 bg-zinc-50/50 dark:bg-zinc-900/10 p-4 rounded-xl border dark:border-zinc-800">
          <RealtimeSidebar siteId={siteId} lang={lang} translations={trans} />
        </div>

        {/* Main Dashboard Section */}
        <div className="lg:col-span-7 xl:col-span-8 order-2 lg:order-2 space-y-6">
          {/* 2. Overview Summary Cards */}
          <OverviewCards overview={overview} trans={trans} />

          {/* 3. Trend Charts */}
          {timeSeries && <DashboardCharts data={timeSeries} trans={trans} />}

          {/* 4. Split Grid: Top Pages & Traffic Sources */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <TopPagesCard pages={pages} trans={trans} />

            <TrafficSourcesCard sources={sources} trans={trans} />
          </div>

          {/* 5. Split Grid: UTM campaigns & Devices info */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <UTMCampaignsCard sources={sources} trans={trans} />

            <DevicesBreakdownCard devices={devices} trans={trans} />
          </div>

          {/* 6. Custom Events */}
          <CustomEventsCard events={events} trans={trans} />
        </div>
      </div>
    </main>
  );
}
