#!/usr/bin/env node
// Visual gate: screenshots every page at desktop and phone widths in light and dark,
// and fails if any page scrolls sideways. Run from the repo root:
//   node tools/shoot.mjs <out-dir> [page.html ...]
// Pages are served over a local HTTP server (like GitHub Pages), so root-relative paths in 404.html resolve.

import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { withBrowser, navigate, pageUrl } from "./lib/browser.mjs";

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900, mobile: false },
  { name: "390", width: 390, height: 844, mobile: true },
];
const THEMES = ["light", "dark"];
const MAX_SHOT_HEIGHT = 16000;

function listPages() {
  const rootPages = readdirSync(".").filter((name) => name.endsWith(".html"));
  const blogPages = readdirSync("blog").filter((name) => name.endsWith(".html")).map((name) => `blog/${name}`);
  return [...rootPages, ...blogPages];
}

function screenshotName(page, viewport, theme) {
  return `${page.replace(/[\\/]/g, "_").replace(/\.html$/, "")}-${viewport.name}-${theme}.png`;
}

async function capture(session, page, viewport, theme, outFile) {
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile,
  });
  await session.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
  await navigate(session, pageUrl(page));

  const scrollWidth = await session.evaluate("document.documentElement.scrollWidth");
  const scrollHeight = await session.evaluate("document.documentElement.scrollHeight");
  const shot = await session.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: viewport.width, height: Math.min(scrollHeight, MAX_SHOT_HEIGHT), scale: 1 },
  });
  writeFileSync(outFile, Buffer.from(shot.data, "base64"));
  return { overflows: scrollWidth > viewport.width, scrollWidth };
}

async function main() {
  const [outDir, ...requestedPages] = process.argv.slice(2);
  if (!outDir) {
    console.error("Usage: node tools/shoot.mjs <out-dir> [page.html ...]");
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  const pages = requestedPages.length ? requestedPages : listPages();

  const overflowCount = await withBrowser(".", async (session) => {
    let overflows = 0;
    for (const page of pages) {
      for (const viewport of VIEWPORTS) {
        for (const theme of THEMES) {
          const name = screenshotName(page, viewport, theme);
          const result = await capture(session, page, viewport, theme, join(outDir, name));
          if (result.overflows) overflows++;
          console.log(`${result.overflows ? "FAIL" : "ok  "}  ${name}${result.overflows ? `  (scrollWidth ${result.scrollWidth})` : ""}`);
        }
      }
    }
    return overflows;
  });

  console.log(`\n${overflowCount} page view(s) scroll sideways.`);
  process.exit(overflowCount ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
