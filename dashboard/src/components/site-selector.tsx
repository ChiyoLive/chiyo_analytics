"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type {
  DashboardClientTrans,
  SiteInfo,
} from "@/app/[lang]/dashboard-client";

type SiteSelectorProps = {
  initialSiteId: string;
  initialRange: string;
  trans: DashboardClientTrans;
  sites: SiteInfo[];
};

export function SiteSelector({
  initialSiteId,
  initialRange,
  trans,
  sites,
}: SiteSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [siteId, setSiteId] = useState(initialSiteId);
  const [range, setRange] = useState(initialRange);
  const [isPending, startTransition] = useTransition();

  // Sync props to state if they change externally
  useEffect(() => {
    setSiteId(initialSiteId); // eslint-disable-line react-hooks/set-state-in-effect
  }, [initialSiteId]);

  useEffect(() => {
    setRange(initialRange); // eslint-disable-line react-hooks/set-state-in-effect
  }, [initialRange]);

  const handleApply = (newSiteId: string, newRange: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("site_id", newSiteId.trim());
      params.set("range", newRange);

      router.push(`?${params.toString()}`);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleApply(siteId, range);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-card border border-border p-3 rounded-xl shadow-sm"
    >
      <div className="flex-1 flex items-center gap-2">
        <label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
          {trans["dashboard:site_id"]}:
        </label>
        <Select
          value={siteId}
          onValueChange={(val) => {
            setSiteId(val);
            handleApply(val, range);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-48 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sites.map((s) => (
              <SelectItem key={s.site_id} value={s.site_id}>
                {s.name || s.site_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
          {trans["dashboard:time_range"]}:
        </label>
        <Select
          value={range}
          onValueChange={(val) => {
            setRange(val);
            handleApply(siteId, val);
          }}
        >
          <SelectTrigger className="h-9 w-[140px] bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">{trans["dashboard:last_24h"]}</SelectItem>
            <SelectItem value="7d">{trans["dashboard:last_7d"]}</SelectItem>
            <SelectItem value="30d">{trans["dashboard:last_30d"]}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        type="submit"
        size="sm"
        disabled={isPending || !siteId.trim()}
        className="h-9 px-4 cursor-pointer"
      >
        {isPending ? "..." : trans["common:apply"]}
      </Button>
    </form>
  );
}
