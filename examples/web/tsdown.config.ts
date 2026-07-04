import { defineConfig } from "tsdown";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  entry: "src/server.ts",
  format: "esm",
  platform: "node",
  clean: true,
  onSuccess: async () => {
    const publicDistDir = path.resolve(__dirname, "dist/public");
    fs.mkdirSync(publicDistDir, { recursive: true });

    // Copy public templates
    const publicSrcDir = path.resolve(__dirname, "src/public");
    if (fs.existsSync(publicSrcDir)) {
      const files = fs.readdirSync(publicSrcDir);
      for (const file of files) {
        fs.copyFileSync(
          path.join(publicSrcDir, file),
          path.join(publicDistDir, file),
        );
      }
      console.log("Successfully copied templates to dist/public");
    }

    // Copy JS SDK
    const sdkSrcPath = path.resolve(
      __dirname,
      "node_modules/cyanly_sdk/dist/mpa.iife.js",
    );
    if (fs.existsSync(sdkSrcPath)) {
      fs.copyFileSync(sdkSrcPath, path.join(publicDistDir, "sdk.js"));
      console.log("Successfully copied JS SDK to dist/public/sdk.js");
    } else {
      console.warn(
        "Warning: Built JS SDK not found at " +
          sdkSrcPath +
          '. Make sure to run "pnpm build" in sdk_js first!',
      );
    }

    // Copy ui css file
    const cssSrcPath = path.resolve(
      __dirname,
      "node_modules/cyanly_sdk/dist/ui/index.css",
    );
    if (fs.existsSync(cssSrcPath)) {
      fs.copyFileSync(cssSrcPath, path.join(publicDistDir, "cyanly.css"));
      console.log(
        "Successfully copied cyanly UI css file to dist/public/cyanly.css",
      );
    } else {
      console.warn(
        "Warning: Built UI CSS file not found at " +
          sdkSrcPath +
          '. Make sure to run "pnpm build" in sdk_js first!',
      );
    }
  },
});
