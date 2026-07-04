"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth, getAccessToken } from "@/lib/auth";
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
import { Loader2 } from "lucide-react";
import { DashboardClientTrans } from "./page";

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

  // States for dashboard metrics
  const [overview, setOverview] = useState<OverviewData | undefined>(undefined);
  const [sources, setSources] = useState<SourcesData | undefined>(undefined);
  const [pages, setPages] = useState<PageItem[] | undefined>(undefined);
  const [devices, setDevices] = useState<DevicesData | undefined>(undefined);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesItem[] | undefined>(
    undefined,
  );
  const [events, setEvents] = useState<EventItem[] | undefined>(undefined);

  // 1. Authenticate check on mount
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push(`/${lang}/login`);
    } else {
      setIsAuthenticated(true); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [lang, router]);

  // 2. Fetch metrics whenever siteId, range, or authentication status changes
  useEffect(() => {
    if (!isAuthenticated) return;

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
  }, [siteId, range, isAuthenticated]);

  if (isAuthenticated === undefined || (loading && !overview)) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
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
