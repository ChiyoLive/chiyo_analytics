import { I18n } from "@/i18n";
import { PageProps } from "@/types";
import { mockProducts } from "@/data/products";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Star } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return {
    title: await I18n.trans(lang, "meta:title:products"),
  };
}

export default async function ProductsPage({ params }: PageProps) {
  const { lang } = await params;

  const catalogTitle = await I18n.trans(lang, "catalog:title");
  const catalogSubtitle = await I18n.trans(lang, "catalog:subtitle");

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-10 py-4">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-gradient sm:text-4xl">
          {catalogTitle}
        </h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          {catalogSubtitle}
        </p>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {mockProducts.map((product) => (
          <Link
            key={product.id}
            href={`/${lang}/products/${product.id}`}
            className="group block"
          >
            <Card className="h-full overflow-hidden border border-border/60 hover:shadow-md transition-all duration-300 group-hover:border-primary/30">
              {/* CSS Gradient Image Preview */}
              <div
                className="gradient-card-bg"
                style={{ background: product.imageUrl }}
              />

              <CardHeader className="p-5 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    <Star className="h-3 w-3 fill-current" />
                    <span>
                      {product.rating} ({product.reviewsCount})
                    </span>
                  </div>
                  <span className="text-lg font-bold text-gradient">
                    ${product.price}
                  </span>
                </div>

                <CardTitle className="text-xl font-bold mt-2 group-hover:text-primary transition-colors">
                  {product.name}
                </CardTitle>
              </CardHeader>

              <CardContent className="px-5 pb-5 pt-0 flex flex-col justify-between flex-1 gap-4">
                <CardDescription className="text-sm leading-relaxed text-muted-foreground">
                  {product.description}
                </CardDescription>

                <div className="pt-2 text-xs font-semibold text-primary dark:text-zinc-300 group-hover:translate-x-1.5 transition-transform duration-200">
                  Inspect specs &rarr;
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
