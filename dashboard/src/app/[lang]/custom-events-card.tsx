import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MousePointerClick } from "lucide-react";
import { DashboardClientTrans } from "./page";
import { EventItem } from "./dashboard-client";

type CustomEventsCardProps = {
  events: EventItem[] | undefined;
  trans: DashboardClientTrans;
};

export function CustomEventsCard({ events, trans }: CustomEventsCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <MousePointerClick className="h-4 w-4 text-primary" />
          {trans["dashboard:custom_events"]}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">
                  {trans["dashboard:event_name"]}
                </TableHead>
                <TableHead className="text-right">
                  {trans["dashboard:event_count"]}
                </TableHead>
                <TableHead className="text-right pr-6">
                  {trans["metrics:visitors"]}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events && events.length > 0 ? (
                events.slice(0, 8).map((event, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="pl-6 font-mono text-xs max-w-[200px] truncate">
                      <span
                        className="font-semibold block truncate"
                        title={event.name}
                      >
                        {event.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {event.count}
                    </TableCell>
                    <TableCell className="text-right pr-6 text-muted-foreground">
                      {event.visitors}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center py-6 text-muted-foreground"
                  >
                    {trans["dashboard:no_custom_events"]}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
