export type PermissionPolicy = {
  effect: "allow" | "deny";
  actions: string[];
};

export type SitePermission = {
  site_id: string;
  permissions: PermissionPolicy[];
};

export type UserListItem = {
  id: string;
  username: string;
  nickname: string;
  email: string;
  is_superuser: boolean;
  sites: SitePermission[];
  created_at: string;
  updated_at: string;
};
