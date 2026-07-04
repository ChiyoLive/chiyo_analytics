"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";

import type { DashboardClientTrans } from "@/app/[lang]/page";

type TimeSeriesItem = {
  timestamp: string;
  pageviews: number;
  visitors: number;
}

type DashboardChartsProps = {
  data: TimeSeriesItem[];
  trans: DashboardClientTrans;
}

export function DashboardCharts({ data, trans }: DashboardChartsProps) {
  // If there's no data, display a placeholder
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center border border-dashed rounded-xl text-muted-foreground text-sm bg-card">
        {trans["dashboard:no_trend_data"]}
      </div>
    );
  }

  // Format timestamp for display
  const chartData = data.map((item) => {
    // If it's a date-only timestamp (e.g. "2026-06-13"), show it as is.
    // If it's hourly (e.g. "2026-06-13 20:00:00"), extract time part or format it.
    let label = item.timestamp;
    if (item.timestamp.includes(" ")) {
      const parts = item.timestamp.split(" ");
      if (parts.length > 1) {
        // e.g. "20:00:00" -> "20:00"
        const timeParts = parts[1].split(":");
        if (timeParts.length > 1) {
          label = `${parts[0].slice(5)} ${timeParts[0]}:${timeParts[1]}`;
        }
      }
    } else if (item.timestamp.includes("-")) {
      // e.g. "2026-06-13" -> "06-13"
      label = item.timestamp.slice(5);
    }

    return {
      name: label,
      pageviews: item.pageviews,
      visitors: item.visitors,
    };
  });

  const chartConfig = {
    pageviews: {
      label: trans["metrics:pageviews"],
      color: "var(--chart-1)",
    },
    visitors: {
      label: trans["metrics:visitors"],
      color: "var(--chart-2)",
    },
  } satisfies ChartConfig;

  return (
    <div className="bg-card border border-border p-6 rounded-2xl shadow-sm">
      <h3 className="text-lg font-semibold mb-6 text-card-foreground">
        {trans["dashboard:time_series"]}
      </h3>
      <div className="h-[300px] w-full">
        <ChartContainer
          config={chartConfig}
          className="h-full w-full"
          initialDimension={{ width: 600, height: 300 }}
        >
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-pageviews)"
                  stopOpacity={0.2}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-pageviews)"
                  stopOpacity={0.01}
                />
              </linearGradient>
              <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-visitors)"
                  stopOpacity={0.2}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-visitors)"
                  stopOpacity={0.01}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              dy={10}
              className="text-xs fill-muted-foreground"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              dx={-5}
              className="text-xs fill-muted-foreground"
            />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <Area
              type="monotone"
              dataKey="pageviews"
              stroke="var(--color-pageviews)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorPv)"
            />
            <Area
              type="monotone"
              dataKey="visitors"
              stroke="var(--color-visitors)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorUv)"
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}
