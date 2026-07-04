"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getAccessToken } from "@/lib/auth";
import { denvPublic } from "@/lib/api";
import { LayoutDashboard, Users, PlusCircle, ShieldAlert } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { SidebarMenuTrigger } from "./sidebar-menu-trigger";
import { DashboardTrans } from "@/app/[lang]/layout";

type SideNavProps = {
  lang: string;
  trans: DashboardTrans;
};

type UserProfile = {
  id: string;
  username: string;
  is_superuser: boolean;
};

export function SideNav({ lang, trans }: SideNavProps) {
  const pathname = usePathname();
  const [isSuperuser, setIsSuperuser] = useState<boolean>(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const checkSuperuser = async () => {
      try {
        const res = await fetch(
          `${await denvPublic.API_URL()}/api/v1/auth/me`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        if (res.ok) {
          const data = (await res.json()) as UserProfile;
          setIsSuperuser(data.is_superuser);
        }
      } catch (err) {
        console.error("Failed to fetch superuser status in SideNav:", err);
      }
    };

    checkSuperuser();
  }, []);

  const navItems = [
    {
      label: trans["nav:dashboard"],
      href: `/${lang}`,
      icon: LayoutDashboard,
      active: pathname === `/${lang}` || pathname === `/${lang}/`,
    },
    {
      label: trans["nav:manage_users"],
      href: `/${lang}/users`,
      icon: Users,
      active: pathname?.startsWith(`/${lang}/users`),
      superuserOnly: true,
    },
    {
      label: trans["nav:manage_sites"],
      href: `/${lang}/sites`,
      icon: PlusCircle,
      active: pathname?.startsWith(`/${lang}/sites`),
      superuserOnly: true,
    },
  ];

  return (
    // 60px is header height, see `app/[lang]/header.tsx`
    <Sidebar collapsible="icon" className="pt-[60px]">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuTrigger>
              {trans["nav:toggle_side_bar"]}
            </SidebarMenuTrigger>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                if (item.superuserOnly && !isSuperuser) return undefined;

                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={item.active}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {isSuperuser && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <div>
                  <ShieldAlert className="text-blue-500 dark:text-blue-400" />
                  <span className="text-blue-700 dark:text-blue-400">
                    {trans["nav:super_admin"]}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
