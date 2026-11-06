#!/usr/bin/env node
// Behaviour tests for the site's JavaScript and its no-JS fallbacks, run in headless Chrome.
// Run from the repo root: node tools/test-behaviour.mjs
// Exits 1 if any test fails.

import { readdirSync } from "node:fs";
import { withBrowser, navigate, pageUrl } from "./lib/browser.mjs";

const HOME = "index.html";
const ALL_PAGES = [
  ...readdirSync(".").filter((name) => name.endsWith(".html")),
  ...readdirSync("blog").filter((name) => name.endsWith(".html")).map((name) => `blog/${name}`),
];
const loadedFontFamilies = `document.fonts.ready.then(() => [...new Set([...document.fonts]
  .filter((face) => face.status === "loaded").map((face) => face.family.replaceAll('"', "")))])`;
const POST_WITH_SCREENSHOTS = "blog/attributing-an-anonymised-docx.html";
const LIGHT_BG = "rgb(243, 244, 242)";
const DARK_BG = "rgb(15, 17, 21)";

function assertEqual(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const isHidden = (id) => `document.getElementById(${JSON.stringify(id)}).hidden`;
const bodyBackground = "getComputedStyle(document.body).backgroundColor";

async function useColorScheme(session, scheme) {
  await session.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
}

async function clearStoredTheme(session) {
  await session.evaluate("localStorage.clear()");
}

const tests = [
  {
    name: "without JavaScript the first tab panel shows and the theme button stays hidden",
    async run(session) {
      await session.send("Emulation.setScriptExecutionDisabled", { value: true });
      try {
        await navigate(session, pageUrl(HOME));
        assertEqual(await session.evaluate(isHidden("panel-sigma")), false, "Sigma panel hidden");
        assertEqual(await session.evaluate(isHidden("panel-spl")), true, "SPL panel hidden");
        assertEqual(await session.evaluate("document.querySelector('[data-theme-toggle]').hidden"), true, "theme button hidden");
      } finally {
        await session.send("Emulation.setScriptExecutionDisabled", { value: false });
      }
    },
  },
  {
    name: "clicking a tab shows its panel and hides the others",
    async run(session) {
      await navigate(session, pageUrl(HOME));
      await session.evaluate("document.getElementById('tab-spl').click()");
      assertEqual(await session.evaluate(isHidden("panel-spl")), false, "SPL panel hidden");
      assertEqual(await session.evaluate(isHidden("panel-sigma")), true, "Sigma panel hidden");
      assertEqual(await session.evaluate("document.getElementById('tab-spl').getAttribute('aria-selected')"), "true", "SPL aria-selected");
    },
  },
  {
    name: "arrow keys move selection and focus between tabs",
    async run(session) {
      await navigate(session, pageUrl(HOME));
      await session.evaluate(`(() => {
        const tab = document.getElementById('tab-sigma');
        tab.focus();
        tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      })()`);
      assertEqual(await session.evaluate("document.activeElement.id"), "tab-kql", "focused tab after ArrowLeft from the first tab");
      assertEqual(await session.evaluate(isHidden("panel-kql")), false, "KQL panel hidden");
    },
  },
  {
    name: "the OS dark preference applies when no theme is stored",
    async run(session) {
      await useColorScheme(session, "dark");
      await navigate(session, pageUrl(HOME));
      await clearStoredTheme(session);
      await navigate(session, pageUrl(HOME));
      assertEqual(await session.evaluate(bodyBackground), DARK_BG, "body background");
      await useColorScheme(session, "light");
    },
  },
  {
    name: "the theme button switches theme and the choice carries to other pages",
    async run(session) {
      await useColorScheme(session, "light");
      await navigate(session, pageUrl(HOME));
      await clearStoredTheme(session);
      await navigate(session, pageUrl(HOME));
      assertEqual(await session.evaluate(bodyBackground), LIGHT_BG, "body background before");
      await session.evaluate("document.querySelector('[data-theme-toggle]').click()");
      assertEqual(await session.evaluate("document.documentElement.dataset.theme"), "dark", "data-theme after click");
      assertEqual(await session.evaluate("localStorage.getItem('theme')"), "dark", "stored theme");
      await navigate(session, pageUrl("blog/index.html"));
      assertEqual(await session.evaluate("document.documentElement.dataset.theme"), "dark", "data-theme on the next page");
      assertEqual(await session.evaluate(bodyBackground), DARK_BG, "body background on the next page");
      assertEqual(await session.evaluate("document.querySelector('[data-theme-toggle]').textContent"), "Light", "button label");
      await clearStoredTheme(session);
    },
  },
  {
    name: "a typewriter tab types its code out, keeps every line break and indent, then settles on the exact text",
    async run(session) {
      await useColorScheme(session, "light");
      await navigate(session, pageUrl(HOME));
      const fullText = await session.evaluate("document.querySelector('#panel-kql code').textContent");
      await session.evaluate("document.getElementById('tab-kql').click()");
      const midway = await session.evaluate(`(() => {
        const code = document.querySelector('#panel-kql code');
        const typed = code.firstElementChild ? code.firstElementChild.textContent.length : -1;
        return { typed, total: code.textContent.length };
      })()`);
      assertEqual(midway.typed >= 0 && midway.typed < midway.total, true, `typing in progress (typed ${midway.typed} of ${midway.total})`);
      await new Promise((done) => setTimeout(done, 1800));
      const settled = await session.evaluate(`(() => {
        const code = document.querySelector('#panel-kql code');
        return { text: code.textContent, children: code.children.length };
      })()`);
      assertEqual(settled.children, 0, "leftover spans after typing");
      assertEqual(settled.text, fullText, "code text after typing");
      assertEqual(fullText.includes("\n| where EventID == 1102\n| project"), true, "line breaks and pipe indentation present");
    },
  },
  {
    name: "switching tabs mid-typing leaves the first panel complete and typing only the new one",
    async run(session) {
      await navigate(session, pageUrl(HOME));
      const kql = await session.evaluate("document.querySelector('#panel-kql code').textContent");
      await session.evaluate("document.getElementById('tab-kql').click()");
      await session.evaluate("document.getElementById('tab-sigma').click()");
      await new Promise((done) => setTimeout(done, 1800));
      assertEqual(await session.evaluate("document.querySelector('#panel-kql code').textContent"), kql, "KQL text after being interrupted");
      assertEqual(await session.evaluate("document.querySelector('#panel-kql code').children.length"), 0, "spans left in the interrupted panel");
      assertEqual(await session.evaluate("document.querySelector('#panel-sigma code').children.length"), 0, "spans left in the Sigma panel");
    },
  },
  {
    name: "with reduced motion the code appears at once, with no typing",
    async run(session) {
      await session.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      try {
        await navigate(session, pageUrl(HOME));
        await session.evaluate("document.getElementById('tab-kql').click()");
        assertEqual(await session.evaluate("document.querySelector('#panel-kql code').children.length"), 0, "spans present under reduced motion");
        assertEqual(await session.evaluate(isHidden("panel-kql")), false, "KQL panel hidden");
      } finally {
        await session.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
      }
    },
  },
  {
    name: "every page loads only same-origin resources (no third-party fonts, scripts or trackers)",
    async run(session) {
      for (const page of ALL_PAGES) {
        await navigate(session, pageUrl(page));
        const foreign = await session.evaluate(
          "performance.getEntriesByType('resource').map((entry) => new URL(entry.name).origin).filter((origin) => origin !== location.origin)",
        );
        assertEqual(JSON.stringify(foreign), "[]", `off-origin requests on ${page}`);
      }
    },
  },
  {
    name: "the self-hosted fonts load on the home page and on 404.html",
    async run(session) {
      for (const page of [HOME, "404.html"]) {
        await navigate(session, pageUrl(page));
        const families = await session.evaluate(loadedFontFamilies);
        assertEqual(families.includes("Bricolage Grotesque"), true, `Bricolage Grotesque loaded on ${page}`);
        assertEqual(families.includes("IBM Plex Mono"), true, `IBM Plex Mono loaded on ${page}`);
      }
    },
  },
  {
    name: "the lightbox opens over the post and Escape closes it",
    async run(session) {
      await navigate(session, pageUrl(POST_WITH_SCREENSHOTS));
      const url = await session.evaluate("location.href");
      await session.evaluate("document.querySelector('figure.terminal a').click()");
      assertEqual(await session.evaluate("location.href"), url, "page URL after click");
      assertEqual(await session.evaluate("document.querySelector('.lightbox').classList.contains('lightbox--open')"), true, "lightbox open");
      await session.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
      assertEqual(await session.evaluate("document.querySelector('.lightbox').classList.contains('lightbox--open')"), false, "lightbox open after Escape");
      assertEqual(await session.evaluate("document.activeElement === document.querySelector('figure.terminal a')"), true, "focus returned to the link");
    },
  },
];

async function main() {
  const failures = await withBrowser(".", async (session) => {
    let failed = 0;
    for (const test of tests) {
      try {
        await test.run(session);
        console.log(`pass  ${test.name}`);
      } catch (error) {
        failed++;
        console.log(`FAIL  ${test.name}\n      ${error.message}`);
      }
    }
    return failed;
  });
  console.log(`\n${tests.length - failures} of ${tests.length} tests passed.`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
