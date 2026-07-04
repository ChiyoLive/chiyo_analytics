import { I18n } from "@/i18n";
import { PageProps } from "@/types";
import { StayTimer } from "@/components/stay-timer";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Timer, Compass, Shield } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return {
    title: await I18n.trans(lang, "meta:title:home"),
  };
}

export default async function HomePage({ params }: PageProps) {
  const { lang } = await params;

  const heroTitle = await I18n.trans(lang, "hero:title");
  const heroDesc = await I18n.trans(lang, "hero:desc");
  const timerLabel = await I18n.trans(lang, "timer:badge");
  const ctaText = await I18n.trans(lang, "cta:explore");

  const featDurationTitle = await I18n.trans(lang, "feat:duration:title");
  const featDurationDesc = await I18n.trans(lang, "feat:duration:desc");
  const featRoutingTitle = await I18n.trans(lang, "feat:routing:title");
  const featRoutingDesc = await I18n.trans(lang, "feat:routing:desc");
  const featDurabilityTitle = await I18n.trans(lang, "feat:durability:title");
  const featDurabilityDesc = await I18n.trans(lang, "feat:durability:desc");

  const explainTitle = await I18n.trans(lang, "explain:title");
  const explainDesc = await I18n.trans(lang, "explain:desc");
  const explainFooter = await I18n.trans(lang, "explain:footer");

  return (
    <div className="flex flex-col gap-16 max-w-5xl mx-auto py-4">
      {/* Hero Section */}
      <section className="flex flex-col items-center text-center gap-6 py-8">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gradient leading-tight">
          {heroTitle}
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground leading-relaxed">
          {heroDesc}
        </p>

        {/* Live Stay Counter (Client Component inside Server Component) */}
        <div className="mt-2">
          <StayTimer label={timerLabel} />
        </div>

        <div className="mt-4">
          <Link href={`/${lang}/products`} passHref>
            <Button
              size="lg"
              className="rounded-full px-8 py-6 text-base font-semibold shadow-md hover:shadow-lg transition-all"
            >
              {ctaText} &rarr;
            </Button>
          </Link>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border border-border/60 hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary dark:text-zinc-100">
              <Timer className="h-6 w-6" />
            </div>
            <CardTitle className="font-bold">{featDurationTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-sm leading-relaxed">
              {featDurationDesc}
            </CardDescription>
          </CardContent>
        </Card>

        <Card className="border border-border/60 hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary dark:text-zinc-100">
              <Compass className="h-6 w-6" />
            </div>
            <CardTitle className="font-bold">{featRoutingTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-sm leading-relaxed">
              {featRoutingDesc}
            </CardDescription>
          </CardContent>
        </Card>

        <Card className="border border-border/60 hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary dark:text-zinc-100">
              <Shield className="h-6 w-6" />
            </div>
            <CardTitle className="font-bold">{featDurabilityTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-sm leading-relaxed">
              {featDurabilityDesc}
            </CardDescription>
          </CardContent>
        </Card>
      </section>

      {/* Integration Guide Section */}
      <section className="rounded-2xl border border-border/60 bg-card p-6 md:p-8 flex flex-col gap-4 shadow-sm">
        <h2 className="text-2xl font-bold tracking-tight">{explainTitle}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {explainDesc}
        </p>
        <pre className="code-block font-mono text-xs text-zinc-400 bg-zinc-950 dark:bg-zinc-900 border border-zinc-800 p-5 rounded-lg overflow-x-auto">
          {`// src/components/chiyo-tracker.tsx
import { init, trackPageView } from "cyanly_sdk/spa";

// Initialize once on client mount
useEffect(() => {
  init({
    siteId: "example-next-js",
    collectorUrl: "http://localhost:8080/collect",
    geoLookupUrl: "http://localhost:8080/collect/geo",
    disableHistoryInterception: true
  });
}, []);

// Listen to pathname & search changes to track page views
useEffect(() => {
  trackPageView();
}, [pathname, searchParams]);`}
        </pre>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {explainFooter}
        </p>
      </section>
    </div>
  );
}
