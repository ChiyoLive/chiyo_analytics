import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Calendar, Plus, X, Edit2, Trash2, PenLine } from "lucide-react";
import type { UserListItem } from "./shared";
import { UsersTrans } from "./page";

type UserCardProps = {
  user: UserListItem;
  trans: UsersTrans;
  onDelete: (id: string) => Promise<void>;
  onViewPolicies: (user: UserListItem, siteId: string) => void;
  onDeleteSite: (userId: string, siteId: string) => Promise<void>;
  onAddSite: (user: UserListItem) => void;
  onEdit: (user: UserListItem) => void;
};

export function UserCard({
  user,
  trans,
  onDelete,
  onViewPolicies,
  onDeleteSite,
  onAddSite,
  onEdit,
}: UserCardProps) {
  const avatarLetter = (user.nickname || user.username || "U")
    .substring(0, 1)
    .toUpperCase();

  return (
    <Card data-testid={`user-card-${user.username}`}>
      <CardHeader className="flex flex-row items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg border border-primary/20">
          {avatarLetter}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg text-foreground truncate">
              {user.nickname}
            </h3>
            {user.is_superuser && (
              <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/45 dark:text-blue-300 dark:border-blue-900 shrink-0 animate-pulse">
                {trans["users:superuser_badge"]}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            @{user.username}
          </p>
        </div>
      </CardHeader>

      {/* Content */}
      <CardContent className="flex-1 flex flex-col gap-4 pb-4">
        {/* Email & Created At */}
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground/75" />
            <span className="truncate">{user.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground/75" />
            <span>{new Date(user.created_at).toLocaleString()}</span>
          </div>
        </div>

        {/* Authorized Sites Box */}
        <div className="flex-1 flex flex-col rounded-xl border border-border bg-muted/20 p-3.5 space-y-3">
          <div className="flex flex-row justify-between">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {trans["users:site_permissions"]}
            </div>
            {!user.is_superuser && (
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => onAddSite(user)}
                className="cursor-pointer"
              >
                <Plus />
              </Button>
            )}
          </div>
          {user.is_superuser ? (
            <div className="text-xs text-blue-700 dark:text-blue-300 italic flex-1 flex items-center">
              {trans["users:superuser_all_access"]}
            </div>
          ) : user.sites.length === 0 ? (
            <div className="text-xs text-muted-foreground italic flex-1 flex items-center">
              {trans["users:no_sites_assigned"]}
            </div>
          ) : (
            <div className="space-y-2 flex-1 overflow-y-auto max-h-48 pr-1">
              {user.sites.map((site) => (
                <div
                  key={site.site_id}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border/60 bg-background/50 hover:bg-background/80 transition-colors"
                >
                  <span className="font-mono text-xs font-semibold text-foreground truncate">
                    {site.site_id}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Permission (View Policies) button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-md cursor-pointer hover:bg-muted"
                      onClick={() => onViewPolicies(user, site.site_id)}
                      title={trans["users:view_site_policies"]}
                    >
                      <PenLine className="h-3.5 w-3.5" />
                    </Button>
                    {/* Delete Site Association button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-md text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                      onClick={() => onDeleteSite(user.id, site.site_id)}
                      title={trans["users:delete_site_association"]}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      {/* Footer Buttons */}
      <CardFooter className="gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => onEdit(user)}
        >
          <Edit2 />
          {trans["common:edit"]}
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={() => onDelete(user.id)}
        >
          <Trash2 />
          {trans["common:delete"]}
        </Button>
      </CardFooter>
    </Card>
  );
}
