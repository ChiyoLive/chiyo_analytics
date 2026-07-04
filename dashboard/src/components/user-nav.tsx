"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearTokens, getRefreshToken, getAccessToken } from "@/lib/auth";
import { denvPublic } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LogOut, User as UserIcon, MonitorSmartphone } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { type UserNavTrans } from "@/app/[lang]/header";

type UserNavProps = {
  lang: string;
  trans: UserNavTrans;
};

type UserProfile = {
  id: string;
  username: string;
  nickname: string;
  email: string;
  avatar: string | undefined;
  is_superuser: boolean;
  active_sessions: number;
};

export function UserNav({ lang, trans }: UserNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }

    const fetchProfile = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(
          `${await denvPublic.API_URL()}/api/v1/auth/me`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        } else {
          // Handle token expiration or invalidity if necessary
          // Could attempt to refresh token, but for now simple fallback
          setProfile(undefined);
        }
      } catch (err) {
        console.error("Failed to fetch user profile:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [pathname]);

  const handleLogout = async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await fetch(`${await denvPublic.API_URL()}/api/v1/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch (err) {
        console.error("Failed to revoke session on server:", err);
      }
    }

    clearTokens();
    setProfile(undefined);
    router.push(`/${lang}/login`);
  };

  if (isLoading) {
    return <Skeleton className="h-9 w-9 rounded-full" />;
  }

  if (!profile) return undefined;

  const getInitials = (nickname: string) => {
    return nickname ? nickname.charAt(0).toUpperCase() : "U";
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarImage src={profile.avatar || ""} alt={profile.nickname} />
            <AvatarFallback>{getInitials(profile.nickname)}</AvatarFallback>
          </Avatar>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end" forceMount>
        <div className="flex flex-col space-y-4">
          <div className="flex items-center space-x-4">
            <Avatar className="h-14 w-14">
              <AvatarImage src={profile.avatar || ""} alt={profile.nickname} />
              <AvatarFallback>{getInitials(profile.nickname)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none flex items-center gap-2">
                {profile.nickname}
                {profile.is_superuser && (
                  <Badge
                    variant="secondary"
                    className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  >
                    {trans["nav:superuser"]}
                  </Badge>
                )}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                @{profile.username}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded-md">
            <MonitorSmartphone className="h-4 w-4" />
            <span>
              {trans["nav:logged_in_devices"]}
              {profile.active_sessions}
            </span>
          </div>

          <div className="flex flex-col justify-between items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                // Placeholder for edit profile
                toast.info(trans["nav:coming_soon"]);
              }}
            >
              <UserIcon className="mr-2 h-4 w-4" />
              {trans["nav:edit_profile"]}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {trans["nav:sign_out"]}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
