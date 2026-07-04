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
import { fetchWithAuth } from "@/lib/auth";
import { denvPublic } from "@/lib/api";

import type { DashboardClientTrans } from "@/app/[lang]/page";

type SiteSelectorProps = {
  initialSiteId: string;
  initialRange: string;
  trans: DashboardClientTrans;
};

type SiteInfo = {
  site_id: string;
  name: string;
};

export function SiteSelector({
  initialSiteId,
  initialRange,
  trans,
}: SiteSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [siteId, setSiteId] = useState(initialSiteId);
  const [range, setRange] = useState(initialRange);
  const [isPending, startTransition] = useTransition();
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const handleApply = (newSiteId: string, newRange: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("site_id", newSiteId.trim());
      params.set("range", newRange);

      router.push(`?${params.toString()}`);
    });
  };

  useEffect(() => {
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

            // Redirect to first site if the current siteId is not authorized (and list is not empty)
            if (
              list.length > 0 &&
              !list.some((s) => s.site_id === initialSiteId)
            ) {
              const firstSiteId = list[0].site_id;
              setSiteId(firstSiteId);
              const params = new URLSearchParams(window.location.search);
              params.set("site_id", firstSiteId);
              params.set("range", initialRange);
              router.push(`?${params.toString()}`);
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch sites for dropdown:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchSites();
    return () => {
      isMounted = false;
    };
  }, [initialSiteId, initialRange, router]);

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
        {loading ? (
          <Select disabled value="">
            <SelectTrigger className="h-9 w-full sm:w-48 bg-background">
              <SelectValue placeholder="Loading..." />
            </SelectTrigger>
          </Select>
        ) : (
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
        )}
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
        disabled={isPending || !siteId.trim() || loading}
        className="h-9 px-4 cursor-pointer"
      >
        {isPending ? "..." : trans["common:apply"]}
      </Button>
    </form>
  );
}
