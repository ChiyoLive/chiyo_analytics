import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";

import { defineConfig } from "tsdown";
import { minify } from "html-minifier-terser";
import CleanCSS from "clean-css";

import * as consts from "./src/consts";

function minifyCSS(rawCSS: string): string {
  const output = new CleanCSS({
    level: 1,
  }).minify(rawCSS);

  if (output.errors.length > 0) {
    console.error("CSS Minify Errors:", output.errors);
    return rawCSS;
  }

  return output.styles;
}

function replaceMagicString(str: string): string {
  return Object.entries(consts).reduce((acc, [key, value]) => {
    if (typeof value === "string") {
      return acc.replaceAll(key, value);
    }
    return acc;
  }, str);
}

async function includeMinifiedHtml(p: string) {
  const rawHtml = readFileSync(path.resolve(p), "utf-8");
  const minified = await minify(rawHtml, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: true,
  });
  return JSON.stringify(replaceMagicString(minified));
}

async function makeDefined(): Promise<Record<string, string>> {
  return {
    __CYANLY_BANNER_HTML: await includeMinifiedHtml("src/ui/banner.html"),
    __CYANLY_DIALOG_HTML: await includeMinifiedHtml("src/ui/dialog.html"),
  };
}

/**
 * copy css file to dist
 */
function copyCSS() {
  const orig = path.resolve("src/ui/index.css");
  const rawCSS = readFileSync(orig, "utf-8");
  const replaced = replaceMagicString(rawCSS);

  const dest = path.resolve("dist/ui/index.css");
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, minifyCSS(replaced));
}

/**
 * 复制 mpa 相关的代码到 backend/cmd/collector/sdk 中
 *
 * 以便 backend 后续编译
 */
function copyToBackend() {
  const distDir = path.resolve("dist");
  const mpaSdk = path.join(distDir, "mpa.iife.js");
  const spaSdk = path.join(distDir, "spa.js");
  const css = path.join(distDir, "ui", "index.css");

  const destDir = path.resolve("..", "backend", "cmd", "collector", "sdk");
  mkdirSync(destDir, { recursive: true });
  copyFileSync(mpaSdk, path.join(destDir, "mpa.iife.js"));
  copyFileSync(spaSdk, path.join(destDir, "spa.js"));
  copyFileSync(css, path.join(destDir, "index.css"));
}

export default defineConfig([
  {
    entry: { mpa: "src/mpa/index.ts" },
    format: "iife",
    minify: true,
    clean: true,
    platform: "browser",
    define: await makeDefined(),
    deps: {
      alwaysBundle: ["nanoid"],
    },
  },
  {
    entry: { spa: "src/spa/index.ts" },
    format: "esm",
    dts: true,
    minify: true,
    clean: false,
    platform: "browser",
    define: await makeDefined(),
    deps: {
      alwaysBundle: ["nanoid"],
    },
    onSuccess: () => {
      copyCSS();
      copyToBackend();
    },
  },
]);
