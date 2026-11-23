import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://nulltheory.dev",
  compressHTML: false,
  build: { format: "file", inlineStylesheets: "never" },
  vite: { build: { assetsInlineLimit: 0 } },
});
