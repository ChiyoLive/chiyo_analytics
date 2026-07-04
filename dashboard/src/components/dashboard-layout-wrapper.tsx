"use client";

import { usePathname } from "next/navigation";
import { SideNav } from "./side-nav";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardTrans } from "@/app/[lang]/layout";

export function DashboardLayoutWrapper({
  children,
  lang,
  trans,
}: {
  children: React.ReactNode;
  lang: string;
  trans: DashboardTrans;
}) {
  const pathname = usePathname();
  const isLoginPage =
    pathname?.endsWith("/login") || pathname?.includes("/login");

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-3.5rem-2.5rem)] w-full bg-background font-sans">
        <SideNav lang={lang} trans={trans} />
        {/* 60px is header height, see `app/[lang]/header.tsx` */}
        <main className="flex-1 pt-[60px] w-full overflow-hidden transition-all duration-300 bg-background">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
