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

// Typing leaves span children in the code element until it settles; poll for that instead of a fixed sleep.
async function waitForTypingToFinish(session, codeSelector, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const spans = await session.evaluate(`document.querySelector(${JSON.stringify(codeSelector)}).children.length`);
    if (spans === 0) return;
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error(`typing in ${codeSelector} did not finish within ${timeoutMs} ms`);
}
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
      const lastTabId = await session.evaluate("Array.from(document.querySelectorAll('.dialect-tabs__tab')).pop().id");
      assertEqual(await session.evaluate("document.activeElement.id"), lastTabId, "focused tab after ArrowLeft from the first tab (wraps to the last)");
      assertEqual(await session.evaluate(isHidden(lastTabId.replace("tab-", "panel-"))), false, "last panel hidden");
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
      await waitForTypingToFinish(session, "#panel-kql code");
      const settled = await session.evaluate(`(() => {
        const code = document.querySelector('#panel-kql code');
        return { text: code.textContent, children: code.children.length };
      })()`);
      assertEqual(settled.children, 0, "leftover spans after typing");
      assertEqual(settled.text, fullText, "code text after typing");
      assertEqual(fullText.includes("DeviceProcessEvents\n| where (") && fullText.includes("\n  and ("), true, "line breaks and clause indentation present");
    },
  },
  {
    name: "switching tabs mid-typing leaves the first panel complete and typing only the new one",
    async run(session) {
      await navigate(session, pageUrl(HOME));
      const kql = await session.evaluate("document.querySelector('#panel-kql code').textContent");
      await session.evaluate("document.getElementById('tab-kql').click()");
      await session.evaluate("document.getElementById('tab-sigma').click()");
      await waitForTypingToFinish(session, "#panel-sigma code");
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
    name: "selecting a diagram part shows only its note, arrow keys move to the next part, and phones get the portrait drawing",
    async run(session) {
      const visibleNotes = "Array.from(document.querySelectorAll('[data-note]')).filter((n) => getComputedStyle(n).display !== 'none').map((n) => n.dataset.note).join()";
      try {
        await session.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
        await navigate(session, pageUrl("reaperwatch.html"));
        assertEqual(await session.evaluate(visibleNotes), "etw", "note shown on load");
        await session.evaluate("document.querySelector('[data-part=sqlite]').dispatchEvent(new MouseEvent('click', { bubbles: true }))");
        assertEqual(await session.evaluate(visibleNotes), "sqlite", "note shown after clicking SQLite");
        assertEqual(await session.evaluate("document.querySelector('[data-part=sqlite]').getAttribute('aria-pressed')"), "true", "SQLite aria-pressed");
        await session.evaluate("document.querySelector('[data-part=sqlite]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))");
        assertEqual(await session.evaluate(visibleNotes), "eql", "note shown after ArrowRight");

        await session.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await navigate(session, pageUrl("reaperwatch.html"));
        const shown = (selector) => `getComputedStyle(document.querySelector('${selector}')).display`;
        assertEqual(await session.evaluate(shown(".diagram__svg--landscape")), "none", "wide drawing hidden on a phone");
        assertEqual(await session.evaluate(shown(".diagram__svg--portrait")), "block", "portrait drawing shown on a phone");
        assertEqual(await session.evaluate(visibleNotes), "etw", "note shown on load on a phone");
        await session.evaluate("document.querySelector('.diagram__svg--portrait [data-part=sqlite]').dispatchEvent(new MouseEvent('click', { bubbles: true }))");
        assertEqual(await session.evaluate(visibleNotes), "sqlite", "note shown after tapping SQLite on a phone");
        assertEqual(await session.evaluate("document.querySelector('.diagram__svg--landscape [data-part=sqlite]').getAttribute('aria-pressed')"), "true", "selection shared with the wide drawing");
      } finally {
        await session.send("Emulation.clearDeviceMetricsOverride");
      }
    },
  },
  {
    name: "the plan opens on the current phase, and picking a phase updates the caption and line states",
    async run(session) {
      await navigate(session, pageUrl("reaperwatch.html"));
      const caption = "Array.from(document.querySelectorAll('[data-caption]')).filter((c) => !c.hidden).map((c) => c.dataset.caption).join()";
      const state = (phase) => `Array.from(new Set(Array.from(document.querySelectorAll('[data-plan] [data-phase="${phase}"]'), (i) => i.dataset.state))).join()`;
      assertEqual(await session.evaluate(caption), "1.5", "caption on load");
      assertEqual(await session.evaluate(state("1")), "done", "phase 1 lines on load");
      assertEqual(await session.evaluate(state("1.5")), "new", "phase 1.5 lines on load");
      assertEqual(await session.evaluate(state("4")), "future", "phase 4 lines on load");
      await session.evaluate("document.querySelector('[data-plan] [data-step=\"4\"]').click()");
      assertEqual(await session.evaluate(caption), "4", "caption after picking 4");
      assertEqual(await session.evaluate(state("4")), "new", "phase 4 lines after picking 4");
      assertEqual(await session.evaluate(state("2")), "done", "phase 2 lines after picking 4");
      assertEqual(await session.evaluate("document.querySelector('[data-plan] [data-step=\"4\"]').getAttribute('aria-pressed')"), "true", "4 aria-pressed");
      const boxState = (area) => `document.querySelector('.plan__svg--landscape .plan-part[data-area="${area}"]').dataset.state`;
      const openBox = "Array.from(document.querySelectorAll('.plan__block[data-area]')).filter((b) => !b.hidden).map((b) => b.dataset.area).join()";
      assertEqual(await session.evaluate(boxState("signature")), "new", "signature engine box lights up in phase 4");
      assertEqual(await session.evaluate(boxState("store")), "done", "storage box is built by phase 4");
      assertEqual(await session.evaluate(boxState("platforms")), "future", "macOS and Linux box is still to come in phase 4");
      assertEqual(await session.evaluate(openBox), "research", "the open box follows the phase to its first new box");
      await session.evaluate("document.querySelector('.plan__svg--landscape .plan-part[data-area=\"console\"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))");
      assertEqual(await session.evaluate(openBox), "console", "clicking a box opens its lines");
      assertEqual(await session.evaluate("document.querySelector('.plan__svg--portrait .plan-part[data-area=\"console\"]').getAttribute('aria-pressed')"), "true", "selection shared with the portrait drawing");
    },
  },
  {
    name: "the contact strip lights Write only once every field has text (never submits)",
    async run(session) {
      await navigate(session, pageUrl("contact.html"));
      const writeState = "document.querySelector('[data-step=write]').dataset.state";
      assertEqual(await session.evaluate(writeState), "idle", "Write before typing");
      await session.evaluate(`(() => {
        const type = (id, value) => { const f = document.getElementById(id); f.value = value; f.dispatchEvent(new Event("input", { bubbles: true })); };
        type("name", "Test"); type("email", "test@example.com");
      })()`);
      assertEqual(await session.evaluate(writeState), "idle", "Write with the message still empty");
      await session.evaluate(`(() => { const f = document.getElementById("message"); f.value = "hello"; f.dispatchEvent(new Event("input", { bubbles: true })); })()`);
      assertEqual(await session.evaluate(writeState), "done", "Write after every field has text");
      assertEqual(await session.evaluate("document.querySelector('[data-step=send]').dataset.state"), "idle", "Send before submitting");
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
