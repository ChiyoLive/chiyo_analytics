"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setTokens } from "@/lib/auth";
import { denvPublic } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { LoginTrans } from "./page";
import { CyanlyIconTransparent } from "@/components/icons";

type LoginFormProps = {
  lang: string;
  trans: LoginTrans;
};

export function LoginForm({ lang, trans }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `${await denvPublic.API_URL()}/api/v1/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        },
      );

      if (!res.ok) {
        throw new Error(trans["auth:error"]);
      }

      const data = await res.json();
      if (data.access_token && data.refresh_token) {
        setTokens(data.access_token, data.refresh_token);
        // Redirect to dashboard home
        router.push(`/${lang}`);
      } else {
        throw new Error(trans["auth:invalid_response"]);
      }
    } catch (err) {
      setError(`${err}` || trans["auth:error"]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="flex flex-col items-center justify-center space-y-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-lg shadow-primary/20 dark:shadow-none">
          <CyanlyIconTransparent />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          cyanly
        </h1>
      </div>

      <Card className="border border-zinc-200/60 bg-white/70 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/70 shadow-2xl shadow-zinc-200/50 dark:shadow-none">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            {trans["auth:title"]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive dark:bg-destructive/20 border border-destructive/20">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {trans["auth:email"]}
              </label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200 focus-visible:ring-1 focus-visible:ring-zinc-400 dark:border-zinc-800"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {trans["auth:password"]}
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200 focus-visible:ring-1 focus-visible:ring-zinc-400 dark:border-zinc-800"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 transition-all duration-200 shadow-md shadow-primary/10 hover:shadow-primary/20"
            >
              {loading ? "..." : trans["auth:submit"]}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
