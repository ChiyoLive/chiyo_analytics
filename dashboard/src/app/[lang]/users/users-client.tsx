"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth, getAccessToken } from "@/lib/auth";
import { denvPublic } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RefreshCw, AlertCircle, Users, UserPlus } from "lucide-react";
import type { UserListItem, PermissionPolicy } from "./shared";
import { UserCard } from "./user-card";
import { EditPoliciesDialog } from "./edit-policies-dialog";
import { AddSiteDialog } from "./add-site-dialog";
import { EditUserDialog, type EditUserPayload } from "./edit-user-dialog";
import {
  CreateUserDialog,
  type SubmitResult,
  type CreateUserPayload,
} from "./create-user-dialog";
import { ask } from "@/components/ask-dialog";
import { toast } from "sonner";
import { UsersTrans } from "./page";

type UsersClientProps = {
  lang: string;
  trans: UsersTrans;
};

export function UsersClient({ lang, trans }: UsersClientProps) {
  const router = useRouter();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  // Modals state
  const [createOpen, setCreateOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserListItem | undefined>(
    undefined,
  );
  const [selectedSiteId, setSelectedSiteId] = useState<string | undefined>(
    undefined,
  );

  const fetchUsers = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetchWithAuth(
        `${await denvPublic.API_URL()}/api/v1/users`,
      );
      if (res.ok) {
        const data = await res.json();
        setUsers(data as UserListItem[]);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || trans["users:failed_load_users"]);
      }
    } catch (err) {
      console.error(err);
      setError(trans["users:failed_connect_backend"]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    const yes = await ask.confirm({
      title: trans["common:confirm_title"],
      content: trans["users:delete_confirm"],
      confirmButton: ({ confirm }) => (
        <Button variant="destructive" onClick={confirm}>
          {trans["common:delete"]}
        </Button>
      ),
    });
    if (!yes) return;

    try {
      const res = await fetchWithAuth(
        `${await denvPublic.API_URL()}/api/v1/users/${id}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        toast.success(trans["users:delete_success"]);
        fetchUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || trans["users:failed_delete_user"]);
      }
    } catch (err) {
      console.error(err);
      toast.error(trans["users:failed_delete_user_error"]);
    }
  };

  const handleCreateSubmit = async (
    payload: CreateUserPayload,
  ): Promise<SubmitResult> => {
    try {
      const res = await fetchWithAuth(
        `${await denvPublic.API_URL()}/api/v1/users`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        toast.success(trans["users:create_success"]);
        fetchUsers();
        return { success: true };
      } else {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          error: data.error || trans["users:failed_create_user"],
        };
      }
    } catch (err) {
      console.error(err);
      return { success: false, error: trans["users:network_error_submit"] };
    }
  };

  const openViewPolicies = (user: UserListItem, siteId: string) => {
    setSelectedUser(user);
    setSelectedSiteId(siteId);
    setPolicyOpen(true);
  };

  const handleEditPoliciesSubmit = async (
    siteId: string,
    permissions: PermissionPolicy[],
  ): Promise<SubmitResult> => {
    if (!selectedUser)
      return { success: false, error: trans["users:no_user_selected"] };
    try {
      const res = await fetchWithAuth(
        `${await denvPublic.API_URL()}/api/v1/users/${selectedUser.id}/sites/${siteId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ permissions }),
        },
      );

      if (res.ok) {
        toast.success(trans["users:policies_updated"]);
        fetchUsers();
        return { success: true };
      } else {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          error: data.error || trans["users:failed_update_policies"],
        };
      }
    } catch (err) {
      console.error(err);
      return { success: false, error: trans["users:network_error_submit"] };
    }
  };

  const handleDeleteUserSite = async (userId: string, siteId: string) => {
    const yes = await ask.confirm({
      title: trans["common:confirm_title"],
      content: trans["users:remove_site_confirm"],
      confirmButton: ({ confirm }) => (
        <Button variant="destructive" onClick={confirm}>
          {trans["common:delete"]}
        </Button>
      ),
    });
    if (!yes) return;

    try {
      const res = await fetchWithAuth(
        `${await denvPublic.API_URL()}/api/v1/users/${userId}/sites/${siteId}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        toast.success(trans["users:site_removed"]);
        fetchUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(
          data.error || trans["users:failed_delete_site_association"],
        );
      }
    } catch (err) {
      console.error(err);
      toast.error(trans["users:failed_delete_site_association_error"]);
    }
  };

  const openEditUser = (user: UserListItem) => {
    setSelectedUser(user);
    setEditOpen(true);
  };

  const handleEditSubmit = async (
    userId: string,
    payload: EditUserPayload,
  ): Promise<SubmitResult> => {
    try {
      const res = await fetchWithAuth(
        `${await denvPublic.API_URL()}/api/v1/users/${userId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        toast.success(trans["users:updated_success"]);
        fetchUsers();
        return { success: true };
      } else {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          error: data.error || trans["users:failed_update_user"],
        };
      }
    } catch (err) {
      console.error(err);
      return { success: false, error: trans["users:network_error_submit"] };
    }
  };

  const openAddSite = (user: UserListItem) => {
    setSelectedUser(user);
    setAddSiteOpen(true);
  };

  const handleAddSiteSubmit = async (
    userId: string,
    siteId: string,
    permissions: PermissionPolicy[],
  ): Promise<SubmitResult> => {
    try {
      const res = await fetchWithAuth(
        `${await denvPublic.API_URL()}/api/v1/users/${userId}/sites`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ site_id: siteId, permissions }),
        },
      );

      if (res.ok) {
        toast.success(trans["users:site_added"]);
        fetchUsers();
        return { success: true };
      } else {
        const data = await res.json().catch(() => ({}));
        return {
          success: false,
          error: data.error || trans["users:failed_add_site_permission"],
        };
      }
    } catch (err) {
      console.error(err);
      return { success: false, error: trans["users:network_error_submit"] };
    }
  };

  // Authenticate check
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push(`/${lang}/login`);
    } else {
      fetchUsers(); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [lang, router]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="container relative mx-auto px-4 py-8 space-y-6 font-sans max-w-6xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-8 w-8 text-primary" />
            {trans["users:title"]}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {trans["users:desc"]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsers}
            className="cursor-pointer"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {trans["common:refresh"]}
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="cursor-pointer"
            data-testid="create-user-btn"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {trans["users:create"]}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <Card className="border border-border">
          <CardContent className="h-64 flex items-center justify-center text-muted-foreground">
            <RefreshCw className="h-7 w-7 animate-spin mr-2" />
            {trans["common:loading"]}
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border border-red-200 dark:border-red-950 bg-red-50/50 dark:bg-red-950/10">
          <CardHeader>
            <CardTitle className="text-red-800 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              {trans["common:error"]}
            </CardTitle>
            <CardDescription className="text-red-700/80 dark:text-red-400/80">
              {error}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : users.length === 0 ? (
        <Card className="border border-dashed border-border py-12 text-center text-muted-foreground">
          <CardContent>{trans["users:empty"]}</CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              trans={trans}
              onDelete={handleDeleteUser}
              onViewPolicies={openViewPolicies}
              onDeleteSite={handleDeleteUserSite}
              onAddSite={openAddSite}
              onEdit={openEditUser}
            />
          ))}
        </div>
      )}

      {/* Edit Policies Dialog */}
      <EditPoliciesDialog
        key={
          selectedUser && selectedSiteId
            ? `${selectedUser.id}-${selectedSiteId}`
            : "edit-policies-none"
        }
        open={policyOpen}
        onOpenChange={setPolicyOpen}
        user={selectedUser}
        siteId={selectedSiteId}
        onSubmit={handleEditPoliciesSubmit}
        trans={trans}
      />

      {/* Create User Dialog */}
      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreateSubmit}
        trans={trans}
      />

      {/* Add Site Dialog */}
      <AddSiteDialog
        key={selectedUser ? `add-site-${selectedUser.id}` : "add-site-none"}
        open={addSiteOpen}
        onOpenChange={setAddSiteOpen}
        user={selectedUser}
        onSubmit={handleAddSiteSubmit}
        trans={trans}
      />

      {/* Edit User Dialog */}
      <EditUserDialog
        key={selectedUser ? `edit-user-${selectedUser.id}` : "edit-user-none"}
        open={editOpen}
        onOpenChange={setEditOpen}
        user={selectedUser}
        onSubmit={handleEditSubmit}
        trans={trans}
      />
    </div>
  );
}
