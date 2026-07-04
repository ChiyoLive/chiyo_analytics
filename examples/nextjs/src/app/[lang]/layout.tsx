import "cyanly_sdk/ui/index.css";
import { I18n } from "@/i18n";
import { LayoutProps } from "@/types";
import { ThemeProvider } from "@teispace/next-themes";
import { getTheme } from "@teispace/next-themes/server";
import { Metadata } from "next";
import Link from "next/link";
import { Activity } from "lucide-react";
import { LangSwitcher } from "@/components/lang-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { CyanlyTracker } from "@/components/cyanly-tracker";
import {
  LiveConsoleProvider,
  LiveConsole,
  LiveConsoleLayoutWrapper,
} from "@/components/live-console";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const title = await I18n.trans(lang, "store:title");
  const description = await I18n.trans(lang, "hero:desc");

  return {
    title,
    description,
  };
}

export default async function Layout({ children, params }: LayoutProps) {
  const { lang } = await params;
  const initialTheme = await getTheme();

  const title = await I18n.trans(lang, "store:title");
  const navHome = await I18n.trans(lang, "nav:home");
  const navProducts = await I18n.trans(lang, "nav:products");

  return (
    <html lang={lang} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground flex flex-col">
        <ThemeProvider
          attribute="class"
          initialTheme={initialTheme ?? undefined}
        >
          <LiveConsoleProvider>
            {/* Chiyo Tracker - Client Side Page Tracking */}
            <CyanlyTracker />

            {/* Header */}
            <header className="glass-header sticky top-0 z-40 w-full border-b border-border/80 bg-background/80 backdrop-blur-md">
              <div className="container mx-auto flex h-14 items-center justify-between px-4">
                <Link
                  href={`/${lang}`}
                  className="flex items-center gap-2 font-bold text-lg hover:opacity-85 transition-opacity"
                >
                  <Activity className="h-5 w-5 text-primary dark:text-zinc-100" />
                  <span className="font-extrabold tracking-tight text-gradient">
                    {title}
                  </span>
                </Link>

                <div className="flex items-center gap-6">
                  <nav className="hidden sm:flex items-center gap-6 text-sm font-medium">
                    <Link
                      href={`/${lang}`}
                      className="hover:text-primary/80 transition-colors"
                    >
                      {navHome}
                    </Link>
                    <Link
                      href={`/${lang}/products`}
                      className="hover:text-primary/80 transition-colors"
                    >
                      {navProducts}
                    </Link>
                  </nav>

                  <div className="flex items-center gap-2.5">
                    <LangSwitcher currentLang={lang} />
                    <ThemeSwitcher />
                  </div>
                </div>
              </div>
            </header>

            {/* Main Content */}
            <LiveConsoleLayoutWrapper className="container mx-auto px-4 pt-8 flex-1">
              {children}
            </LiveConsoleLayoutWrapper>

            {/* Live Event Console */}
            <LiveConsole lang={lang} />
          </LiveConsoleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
