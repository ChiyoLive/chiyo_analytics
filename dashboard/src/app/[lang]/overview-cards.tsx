import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Eye,
  Users,
  MousePointerClick,
  CornerUpRight,
  Timer,
} from "lucide-react";
import type { DashboardClientTrans } from "./page";

type OverviewData = {
  pageviews: number;
  visitors: number;
  sessions: number;
  average_duration: number;
  bounce_rate: number;
}

type OverviewCardsProps = {
  overview: OverviewData;
  trans: DashboardClientTrans;
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const remainingSecs = sec % 60;
  return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins}m`;
}

export function OverviewCards({ overview, trans }: OverviewCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground">
            {trans["metrics:pageviews"]}
          </CardTitle>
          <Eye className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {overview.pageviews.toLocaleString()}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground">
            {trans["metrics:visitors"]}
          </CardTitle>
          <Users className="h-4 w-4 text-chart-2" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {overview.visitors.toLocaleString()}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground">
            {trans["metrics:sessions"]}
          </CardTitle>
          <MousePointerClick className="h-4 w-4 text-emerald-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {overview.sessions.toLocaleString()}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground">
            {trans["metrics:bounce_rate"]}
          </CardTitle>
          <CornerUpRight className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {overview.bounce_rate.toFixed(1)}%
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground">
            {trans["metrics:avg_duration"]}
          </CardTitle>
          <Timer className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatDuration(overview.average_duration)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
