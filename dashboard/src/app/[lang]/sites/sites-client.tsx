"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth, getAccessToken } from "@/lib/auth";
import { denvPublic } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, AlertCircle, Globe, PlusCircle, Edit } from "lucide-react";
import { CreateSiteDialog, type CreateSitePayload } from "./create-site-dialog";
import { EditSiteDialog, type EditSitePayload } from "./edit-site-dialog";
import { toast } from "sonner";
import { SitesTrans } from "./page";

type SitesClientProps = {
  lang: string;
  trans: SitesTrans;
};

type SiteListItem = {
  id: string;
  name: string;
  jwks_url: string | null;
  created_at: string;
  updated_at: string;
};

export function SitesClient({ lang, trans }: SitesClientProps) {
  const router = useRouter();
  const [sites, setSites] = useState<SiteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  // Modal states
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<SiteListItem | undefined>(
    undefined,
  );

  const fetchSites = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetchWithAuth(
        `${await denvPublic.API_URL()}/api/v1/sites`,
      );
      if (res.ok) {
        const data = await res.json();
        setSites(data as SiteListItem[]);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || trans["sites:failed_load_sites"]);
      }
    } catch (err) {
      console.error(err);
      setError(trans["users:failed_connect_backend"]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push(`/${lang}/login`);
      return;
    }
    fetchSites(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [lang, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateSubmit = async (
    payload: CreateSitePayload,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetchWithAuth(
        `${await denvPublic.API_URL()}/api/v1/sites`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        toast.success(trans["sites:create_success"]);
        fetchSites();
        return { success: true };
      } else {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          error: data.error || trans["sites:failed_create_site"],
        };
      }
    } catch (err) {
      console.error(err);
      return { success: false, error: trans["users:network_error_submit"] };
    }
  };

  const handleEditSubmit = async (
    id: string,
    payload: EditSitePayload,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetchWithAuth(
        `${await denvPublic.API_URL()}/api/v1/sites/${id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        toast.success(trans["sites:updated_success"]);
        fetchSites();
        return { success: true };
      } else {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          error: data.error || trans["sites:failed_update_site"],
        };
      }
    } catch (err) {
      console.error(err);
      return { success: false, error: trans["users:network_error_submit"] };
    }
  };

  const openEditSite = (site: SiteListItem) => {
    setSelectedSite(site);
    setEditOpen(true);
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString(
        lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US",
        {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        },
      );
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 flex-1 space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground font-sans">
            {trans["sites:title"]}
          </h1>
          <p className="text-sm text-muted-foreground font-sans mt-1">
            {trans["sites:desc"]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSites}
            disabled={loading}
            className="h-9 cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            {trans["common:refresh"]}
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="h-9 cursor-pointer"
            data-testid="create-site-btn"
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            {trans["sites:create"]}
          </Button>
        </div>
      </div>

      {/* Main content area */}
      {error ? (
        <Card className="border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/5">
          <CardContent className="pt-6 flex flex-col items-center justify-center text-center p-8">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4 animate-bounce" />
            <h3 className="text-lg font-bold text-red-700 dark:text-red-400">
              {trans["common:error"]}
            </h3>
            <p className="text-sm text-red-600 dark:text-red-400/80 mt-1 max-w-md leading-relaxed">
              {error}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSites}
              className="mt-4 cursor-pointer"
            >
              {trans["common:refresh"]}
            </Button>
          </CardContent>
        </Card>
      ) : loading && sites.length === 0 ? (
        <Card className="border border-border">
          <CardContent className="pt-6 flex flex-col items-center justify-center p-12 text-muted-foreground text-sm font-sans">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
              <span>{trans["common:loading"]}</span>
            </div>
          </CardContent>
        </Card>
      ) : sites.length === 0 ? (
        <Card className="border-dashed border-2 border-border bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground mb-4">
              <Globe className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-foreground font-sans">
              {trans["sites:empty"]}
            </h3>
            <p className="text-sm text-muted-foreground font-sans mt-2 max-w-sm">
              {trans["sites:desc"]}
            </p>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="mt-6 cursor-pointer"
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              {trans["sites:create"]}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="font-semibold text-muted-foreground">
                {trans["sites:id"]}
              </TableHead>
              <TableHead className="font-semibold text-muted-foreground">
                {trans["sites:name"]}
              </TableHead>
              <TableHead className="font-semibold text-muted-foreground">
                {trans["sites:jwks_url"]}
              </TableHead>
              <TableHead className="font-semibold text-muted-foreground">
                {trans["sites:created_at"]}
              </TableHead>
              <TableHead className="text-right font-semibold text-muted-foreground">
                {trans["sites:actions"]}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.map((site) => (
              <TableRow
                key={site.id}
                className="hover:bg-muted/20 transition-colors"
                data-testid={`site-row-${site.id}`}
              >
                <TableCell className="font-medium font-mono text-xs">
                  {site.id}
                </TableCell>
                <TableCell className="font-sans text-sm font-semibold">
                  {site.name}
                </TableCell>
                <TableCell className="font-sans text-xs text-muted-foreground max-w-xs truncate">
                  {site.jwks_url ? (
                    <span className="underline decoration-dotted">
                      {site.jwks_url}
                    </span>
                  ) : (
                    <span className="italic text-zinc-400 dark:text-zinc-500">
                      None
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-sans text-xs text-muted-foreground">
                  {formatDate(site.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditSite(site)}
                    className="h-8 px-2 cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    {trans["common:edit"]}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Dialogs */}
      <CreateSiteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreateSubmit}
        trans={trans}
      />

      <EditSiteDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        site={selectedSite}
        onSubmit={handleEditSubmit}
        trans={trans}
      />
    </div>
  );
}
