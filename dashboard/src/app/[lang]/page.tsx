import { I18n } from "@/i18n";
import { PageProps } from "@/types";
import { DashboardClient } from "./dashboard-client";

type DashboardPageProps = PageProps<{
  searchParams: Promise<{
    site_id?: string;
    range?: string;
  }>;
}>;

function trans(lang: string) {
  return I18n.transDict(lang, [
    "dashboard:site_id",
    "dashboard:time_range",
    "dashboard:last_24h",
    "dashboard:last_7d",
    "dashboard:last_30d",
    "metrics:pageviews",
    "metrics:visitors",
    "metrics:sessions",
    "metrics:bounce_rate",
    "metrics:avg_duration",
    "dashboard:time_series",
    "dashboard:top_pages",
    "dashboard:traffic_sources",
    "dashboard:device_types",
    "dashboard:operating_systems",
    "dashboard:browsers",
    "dashboard:countries",
    "dashboard:utm_campaigns",
    "dashboard:source",
    "dashboard:medium",
    "dashboard:campaign",
    "metrics:pv",
    "metrics:uv",
    "dashboard:url",
    "dashboard:page_title",
    "common:status_offline",
    "common:status_offline_desc",
    "dashboard:direct_none",
    "common:loading",
    "dashboard:realtime_analysis",
    "dashboard:returning_visitor",
    "dashboard:new_visitor",
    "dashboard:direct_entry",
    "dashboard:geography_info",
    "dashboard:browser_info",
    "dashboard:os_info",
    "dashboard:visitor_profile",
    "dashboard:pageview_path",
    "dashboard:total_visits",
    "dashboard:first_visit",
    "dashboard:last_visit",
    "dashboard:devices_used",
    "dashboard:operating_systems_used",
    "dashboard:browsers_used",
    "dashboard:locations_visited",
    "dashboard:stay_duration",
    "dashboard:start_time",
    "dashboard:polling_interval",
    "dashboard:manual_refresh",
    "dashboard:action_details",
    "dashboard:ip_address",
    "dashboard:languages",
    "dashboard:referrer_url",
    "common:refresh",
    "dashboard:device_info",
    "dashboard:device_type",
    "dashboard:device_brand",
    "dashboard:device_model",
    "dashboard:resolution",
    "common:apply",
    "dashboard:realtime_overview",
    "dashboard:monitoring_site",
    "dashboard:devices_breakdown",
    "dashboard:no_pages_visited",
    "dashboard:untitled",
    "dashboard:no_traffic_sources",
    "dashboard:no_utm_campaigns",
    "dashboard:region",
    "dashboard:city",
    "dashboard:browser_name",
    "dashboard:browser_version",
    "dashboard:user_agent",
    "dashboard:os_name",
    "dashboard:os_version",
    "dashboard:visitor_id",
    "dashboard:no_trend_data",
    "dashboard:custom_events",
    "dashboard:event_name",
    "dashboard:event_count",
    "dashboard:no_custom_events",
  ] as const);
}
export type DashboardClientTrans = Awaited<ReturnType<typeof trans>>;

export default async function HomePage({
  params,
  searchParams,
}: DashboardPageProps) {
  const { lang } = await params;
  const sParams = await searchParams;

  const siteId = sParams.site_id || "NO_SITE_SELECTED";
  const range = sParams.range || "24h";

  // Fetch translations
  const dashboardClientTrans = await trans(lang);

  return (
    <DashboardClient
      lang={lang}
      siteId={siteId}
      range={range}
      trans={dashboardClientTrans}
    />
  );
}
