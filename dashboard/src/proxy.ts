import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPPORT_LOCALES = ["en", "zh", "ja"];
const DEFAULT_LOCALE = "en";

function getPreferredLocale(request: NextRequest): string {
  const acceptLanguage = request.headers.get("accept-language");
  if (!acceptLanguage) return DEFAULT_LOCALE;

  // accept-language 格式示例: "zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7"
  const preferred = acceptLanguage
    .split(",")
    .map((part) => {
      const [lang, q] = part.trim().split(";q=");
      return {
        lang: lang.trim().toLowerCase(),
        q: q ? parseFloat(q) : 1.0,
      };
    })
    .sort((a, b) => b.q - a.q) // 按权重从高到低排序
    .find(({ lang }) =>
      SUPPORT_LOCALES.some(
        (locale) =>
          lang === locale || // 精确匹配: "zh" === "zh"
          lang.startsWith(`${locale}-`), // 前缀匹配: "zh-CN".startsWith("zh-")
      ),
    );

  if (!preferred) return DEFAULT_LOCALE;

  // 将匹配到的 lang ("zh-CN") 映射回我们支持的 locale ("zh")
  return (
    SUPPORT_LOCALES.find(
      (locale) =>
        preferred.lang === locale || preferred.lang.startsWith(`${locale}-`),
    ) ?? DEFAULT_LOCALE
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 检查 pathname 是否已经包含支持的语言前缀 (例如 /zh/about 或 /zh)
  const pathnameHasLocale = SUPPORT_LOCALES.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );

  if (pathnameHasLocale) return NextResponse.next();

  const locale = getPreferredLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;

  // 例如：访问 my-domain/ 自动重定向到 my-domain/zh
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: [
    // 过滤掉所有静态文件、API 路由、favicon 等，防止拦截它们
    //
    //    api: 我们自己的 api 路由。之后可能用到，先过滤掉
    //        _next/static|_next/image: nextjs 自己的路由
    //                                                                    .well-known: 提供 public/.well-known/** 的访问
    //                                                                                assets: 提供 public/assets/** 访问
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.well-known|assets).*)",
  ],
};
