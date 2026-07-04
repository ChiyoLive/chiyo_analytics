import { I18n } from "@/i18n";
import { PageProps } from "@/types";
import { mockProducts } from "@/data/products";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Star, CheckCircle } from "lucide-react";

type ProductPageProps = PageProps<
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  {},
  {
    id: string;
  }
>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; lang: string }>;
}) {
  const { id } = await params;
  const product = mockProducts.find((p) => p.id === id);
  if (!product) return {};

  return {
    title: `${product.name} | Chiyo Store`,
  };
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { id, lang } = await params;

  const product = mockProducts.find((p) => p.id === id);
  if (!product) {
    notFound();
  }

  const specsTitle = await I18n.trans(lang, "specs:title");
  const cartText = await I18n.trans(lang, "cart:add");
  const backText = await I18n.trans(lang, "back:catalog");

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6 py-4">
      {/* Back Link */}
      <Link
        href={`/${lang}/products`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>{backText}</span>
      </Link>

      {/* Detail Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-2">
        {/* CSS Gradient Image Preview */}
        <div
          className="w-full rounded-2xl aspect-square md:aspect-auto md:h-[350px] shadow-sm border border-border/20"
          style={{ background: product.imageUrl }}
        />

        {/* Specs & Buy Panel */}
        <div className="flex flex-col gap-6 justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400 w-fit">
              <Star className="h-3 w-3 fill-current" />
              <span>
                {product.rating} ({product.reviewsCount} reviews)
              </span>
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight text-gradient">
              {product.name}
            </h1>

            <p className="text-2xl font-bold text-gradient">${product.price}</p>

            <p className="text-sm leading-relaxed text-muted-foreground mt-2">
              {product.description}
            </p>
          </div>

          {/* Technical Specs */}
          <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-muted/30 p-5">
            <h3 className="text-sm font-bold tracking-tight">{specsTitle}</h3>
            <ul className="grid grid-cols-1 gap-2.5">
              {product.specs.map((spec, index) => (
                <li
                  key={index}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>{spec}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Action button */}
          <div className="pt-4 border-t border-border/50">
            <Button
              size="lg"
              className="w-full rounded-xl py-6 font-semibold shadow hover:shadow-md transition-all"
              data-cyanly-event="add_to_cart"
              data-cyanly-props={JSON.stringify({
                product_id: product.id,
                product_name: "will-be-override",
                price: product.price,
              })}
              data-cyanly-prop-product-name={product.name}
            >
              {cartText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
