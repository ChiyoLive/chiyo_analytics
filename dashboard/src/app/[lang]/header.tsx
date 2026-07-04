import { CyanlyIcon } from "@/components/icons";
import { LangSwitcher } from "@/components/lang-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { UserNav } from "@/components/user-nav";
import { I18n } from "@/i18n";
import Link from "next/link";

type HeaderProps = {
  lang: string;
};

function trans(lang: string) {
  return I18n.transDict(lang, [
    "nav:superuser",
    "nav:logged_in_devices",
    "nav:edit_profile",
    "nav:sign_out",
    "nav:coming_soon",
    "common:theme_toggle",
    "common:theme_light",
    "common:theme_dark",
    "common:theme_system",
  ] as const);
}

export type UserNavTrans = Awaited<ReturnType<typeof trans>>;

export async function Header({ lang }: HeaderProps) {
  const title = await I18n.trans(lang, "dashboard:title");
  const transUserNav = await trans(lang);

  return (
    <header className="fixed top-0 z-50 h-[60px] w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link
          href={`/${lang}`}
          className="flex items-center gap-2 font-bold text-lg hover:opacity-85 transition-opacity"
        >
          <div className="h-5 w-5">
            <CyanlyIcon />
          </div>
          <span className="font-extrabold tracking-tight">{title}</span>
        </Link>
        <div className="flex items-center gap-2.5">
          <LangSwitcher currentLang={lang} />
          <ThemeSwitcher
            trans={{
              toggle: transUserNav["common:theme_toggle"],
              light: transUserNav["common:theme_light"],
              dark: transUserNav["common:theme_dark"],
              system: transUserNav["common:theme_system"],
            }}
          />
          <UserNav lang={lang} trans={transUserNav} />
        </div>
      </div>
    </header>
  );
}
