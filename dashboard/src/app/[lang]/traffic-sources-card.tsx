import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Globe } from "lucide-react";

type ReferrerItem = {
  source: string;
  pageviews: number;
  visitors: number;
}

type SourcesData = {
  referrers: ReferrerItem[];
}

import type { DashboardClientTrans } from "./page";

type TrafficSourcesCardProps = {
  sources: SourcesData | undefined;
  trans: DashboardClientTrans;
}

export function TrafficSourcesCard({
  sources,
  trans,
}: TrafficSourcesCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Globe className="h-4 w-4 text-chart-2" />
          {trans["dashboard:traffic_sources"]}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{trans["dashboard:source"]}</TableHead>
              <TableHead className="text-right">{trans["metrics:pv"]}</TableHead>
              <TableHead className="text-right pr-6">
                {trans["metrics:uv"]}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources?.referrers && sources.referrers.length > 0 ? (
              sources.referrers.slice(0, 8).map((ref, idx) => (
                <TableRow key={idx}>
                  <TableCell className="pl-6 font-semibold">
                    {ref.source === "Direct / None"
                      ? trans["dashboard:direct_none"]
                      : ref.source}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {ref.pageviews}
                  </TableCell>
                  <TableCell className="text-right pr-6 text-muted-foreground">
                    {ref.visitors}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center py-6 text-muted-foreground"
                >
                  {trans["dashboard:no_traffic_sources"]}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
