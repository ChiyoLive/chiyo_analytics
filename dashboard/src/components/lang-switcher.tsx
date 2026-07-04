"use client";

import { Languages } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const languages = {
  en: "English",
  zh: "简体中文",
  ja: "日本語",
};

type LangSwitcherProps = {
  currentLang: string;
}

export function LangSwitcher({ currentLang }: LangSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLanguageChange = (newLang: string) => {
    if (!pathname) return;

    const segments = pathname.split("/");
    let newPath = "";
    if (segments.length > 1) {
      // The first segment (index 0) is empty string since pathname starts with '/'
      // The second segment (index 1) is the locale (e.g. 'zh', 'ja', 'en')
      segments[1] = newLang;
      newPath = segments.join("/");
    } else {
      newPath = `/${newLang}`;
    }

    const search = typeof window !== "undefined" ? window.location.search : "";
    router.push(newPath + search);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Languages className="h-4 w-4" />
          <span className="text-sm font-medium">
            {languages[currentLang as keyof typeof languages] ||
              currentLang.toUpperCase()}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.entries(languages).map(([code, label]) => (
          <DropdownMenuItem
            key={code}
            onClick={() => handleLanguageChange(code)}
            className={
              code === currentLang ? "font-bold text-primary bg-accent/50" : ""
            }
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
