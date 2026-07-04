import { I18n } from "@/i18n";
import { PageProps } from "@/types";
import { SitesClient } from "./sites-client";

function trans(lang: string) {
  return I18n.transDict(lang, [
    "sites:title",
    "sites:desc",
    "sites:create",
    "sites:edit",
    "sites:id",
    "sites:name",
    "sites:jwks_url",
    "sites:created_at",
    "sites:actions",
    "sites:create_success",
    "sites:updated_success",
    "sites:failed_load_sites",
    "sites:failed_create_site",
    "sites:failed_update_site",
    "sites:id_required",
    "sites:name_required",
    "sites:id_invalid_chars",
    "sites:empty",
    "common:confirm_title",
    "common:loading",
    "common:refresh",
    "common:edit",
    "common:cancel",
    "common:error",
    "common:save_changes",
    "users:failed_connect_backend",
    "users:network_error_submit",
  ] as const);
}
export type SitesTrans = Awaited<ReturnType<typeof trans>>;

export default async function SitesPage({ params }: PageProps) {
  const { lang } = await params;
  const sitesTrans = await trans(lang);

  return <SitesClient lang={lang} trans={sitesTrans} />;
}
