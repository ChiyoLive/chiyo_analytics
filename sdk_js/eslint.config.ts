import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["**/*.{js,ts,jsx,tsx}"],
  ignores: ["dist/**/*"],
  extends: [js.configs.recommended, tseslint.configs.recommended],
});
