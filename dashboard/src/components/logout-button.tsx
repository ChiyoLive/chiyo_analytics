"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearTokens, getRefreshToken, getAccessToken } from "@/lib/auth";
import { denvPublic } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

type LogoutButtonProps = {
  lang: string;
  title?: string;
};

export function LogoutButton({ lang, title }: LogoutButtonProps) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check if tokens exist in browser
    const token = getAccessToken();
    setIsLoggedIn(!!token); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

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
    setIsLoggedIn(false);
    router.push(`/${lang}/login`);
  };

  if (!isLoggedIn) return undefined;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleLogout}
      title={title || "Sign Out"}
      className="text-muted-foreground hover:text-foreground h-9 w-9"
    >
      <LogOut className="h-4 w-4" />
    </Button>
  );
}
