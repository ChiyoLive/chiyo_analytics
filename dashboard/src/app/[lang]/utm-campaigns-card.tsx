import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Terminal } from "lucide-react";

type UTMItem = {
  source: string;
  medium: string;
  campaign: string;
  pageviews: number;
  visitors: number;
}

type SourcesData = {
  utm: UTMItem[];
}

import type { DashboardClientTrans } from "./page";

type UTMCampaignsCardProps = {
  sources: SourcesData | undefined;
  trans: DashboardClientTrans;
}

export function UTMCampaignsCard({
  sources,
  trans,
}: UTMCampaignsCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Terminal className="h-4 w-4 text-emerald-500" />
          {trans["dashboard:utm_campaigns"]}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{trans["dashboard:campaign"]}</TableHead>
              <TableHead>
                {trans["dashboard:source"]} / {trans["dashboard:medium"]}
              </TableHead>
              <TableHead className="text-right pr-6">
                {trans["metrics:pv"]}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources?.utm && sources.utm.length > 0 ? (
              sources.utm.slice(0, 8).map((utm, idx) => (
                <TableRow key={idx}>
                  <TableCell
                    className="pl-6 font-semibold max-w-[120px] truncate"
                    title={utm.campaign}
                  >
                    {utm.campaign}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    <span className="bg-muted px-1.5 py-0.5 rounded mr-1">
                      {utm.source}
                    </span>
                    <span className="bg-muted px-1.5 py-0.5 rounded">
                      {utm.medium}
                    </span>
                  </TableCell>
                  <TableCell className="text-right pr-6 font-semibold">
                    {utm.pageviews}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center py-6 text-muted-foreground"
                >
                  {trans["dashboard:no_utm_campaigns"]}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
