import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Compass } from "lucide-react";
import { DashboardClientTrans } from "./page";
import { PageItem } from "./dashboard-client";

type TopPagesCardProps = {
  pages: PageItem[] | undefined;
  trans: DashboardClientTrans;
};

export function TopPagesCard({ pages, trans }: TopPagesCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary" />
          {trans["dashboard:top_pages"]}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">{trans["dashboard:url"]}</TableHead>
                <TableHead className="text-right">
                  {trans["metrics:pv"]}
                </TableHead>
                <TableHead className="text-right pr-6">
                  {trans["metrics:uv"]}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages && pages.length > 0 ? (
                pages.slice(0, 8).map((page, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="pl-6 font-mono text-xs max-w-[200px] truncate">
                      <span
                        className="font-semibold block truncate"
                        title={page.url}
                      >
                        {page.url || "/"}
                      </span>
                      {page.title && (
                        <span
                          className="text-muted-foreground block text-[10px] truncate"
                          title={page.title}
                        >
                          {page.title === "Untitled"
                            ? trans["dashboard:untitled"]
                            : page.title}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {page.pageviews}
                    </TableCell>
                    <TableCell className="text-right pr-6 text-muted-foreground">
                      {page.visitors}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center py-6 text-muted-foreground"
                  >
                    {trans["dashboard:no_pages_visited"]}
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
