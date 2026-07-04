import { I18n } from "@/i18n";
import { GenerateMetadataProps, LayoutProps } from "@/types";
import { ThemeProvider } from "@teispace/next-themes";
import { getTheme } from "@teispace/next-themes/server";
import { Metadata } from "next";
import { Header } from "./header";
import { Footer } from "./footer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthRefresher } from "./auth-refresher";
import { DashboardLayoutWrapper } from "@/components/dashboard-layout-wrapper";
import { AskDialog } from "@/components/ask-dialog";
import { Toaster } from "@/components/ui/sonner";

export async function generateMetadata({
  params,
}: GenerateMetadataProps): Promise<Metadata> {
  const { lang } = await params;
  const title = await I18n.trans(lang, "meta:title");
  const description = await I18n.trans(lang, "meta:description");

  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
  };
}

function transDashboard(lang: string) {
  return I18n.transDict(lang, [
    "nav:dashboard",
    "nav:manage_users",
    "nav:manage_sites",
    "nav:super_admin",
    "nav:toggle_side_bar",
  ] as const);
}
export type DashboardTrans = Awaited<ReturnType<typeof transDashboard>>;

function transAskDialog(lang: string) {
  return I18n.transDict(lang, ["common:cancel", "common:confirm"] as const);
}
export type AskDialogTrans = Awaited<ReturnType<typeof transAskDialog>>;

export default async function Layout({ children, params }: LayoutProps) {
  const { lang } = await params;
  const initalTheme = await getTheme();

  const dashboardTrans = await transDashboard(lang);
  const askDialogTrans = await transAskDialog(lang);

  return (
    <html lang={lang} suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          initialTheme={initalTheme ?? undefined}
        >
          <AuthRefresher />
          <Header lang={lang} />

          <TooltipProvider>
            <Toaster />
            <AskDialog trans={askDialogTrans} />

            <DashboardLayoutWrapper lang={lang} trans={dashboardTrans}>
              {children}
            </DashboardLayoutWrapper>
          </TooltipProvider>

          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
