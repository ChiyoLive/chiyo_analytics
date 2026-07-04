import { I18n } from "@/i18n";
import { PageProps } from "@/types";
import { UsersClient } from "./users-client";

function trans(lang: string) {
  return I18n.transDict(lang, [
    "users:title",
    "users:desc",
    "users:create",
    "users:username",
    "users:nickname",
    "users:email",
    "users:password",
    "users:is_superuser",
    "users:created_at",
    "users:actions",
    "users:site_permissions",
    "users:view_policies",
    "users:delete_confirm",
    "common:confirm_title",
    "users:delete_success",
    "users:create_success",
    "users:create_title",
    "users:create_submit",
    "users:add_site",
    "users:site_id",
    "users:policy_json",
    "users:policy_placeholder",
    "users:empty",
    "common:loading",
    "common:refresh",
    "users:superuser_badge",
    "users:superuser_all_access",
    "users:no_sites_assigned",
    "common:edit",
    "common:delete",
    "users:edit_title",
    "users:superuser_account",
    "users:superuser_desc",
    "common:save_changes",
    "users:create_desc",
    "users:policies_updated",
    "users:no_site_permissions_hint",
    "users:superuser_bypass_desc",
    "common:cancel",
    "users:password_keep_hint",
    "users:site_removed",
    "users:site_added",
    "users:updated_success",
    "users:remove_site_confirm",
    "users:invalid_policy_json",
    "users:add_site_desc",
    "users:add_site_submit",
    "users:site_id_required",
    "users:username_required",
    "users:nickname_required",
    "users:invalid_email",
    "users:password_min_length_hint",
    "users:password_placeholder_edit",
    "users:password_placeholder_create",
    "users:username_invalid_chars",
    "users:password_min_length",
    "users:edit_desc",
    "users:view_site_policies",
    "users:delete_site_association",
    "users:failed_load_users",
    "users:failed_connect_backend",
    "users:failed_delete_user",
    "users:failed_delete_user_error",
    "users:failed_create_user",
    "users:network_error_submit",
    "users:no_user_selected",
    "users:failed_update_policies",
    "users:failed_delete_site_association",
    "users:failed_delete_site_association_error",
    "users:failed_update_user",
    "users:failed_add_site_permission",
    "common:error",
  ] as const);
}
export type UsersTrans = Awaited<ReturnType<typeof trans>>;

export default async function UsersPage({ params }: PageProps) {
  const { lang } = await params;

  const usersTrans = await trans(lang);

  return <UsersClient lang={lang} trans={usersTrans} />;
}
