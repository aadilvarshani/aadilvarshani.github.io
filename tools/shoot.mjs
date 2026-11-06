#!/usr/bin/env node
// Visual gate: screenshots every page at desktop and phone widths in light and dark,
// and fails if any page scrolls sideways. Run from the repo root:
//   node tools/shoot.mjs <out-dir> [page.html ...]
// Needs Node 22+ (global fetch and WebSocket) and Chrome or Edge. Set CHROME to override the browser path.
// It starts its own headless browser with a throwaway profile and stops only that process.

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900, mobile: false },
  { name: "390", width: 390, height: 844, mobile: true },
];
const THEMES = ["light", "dark"];
const DEBUG_PORT = 9347;
const SETTLE_MS = 1500;

const BROWSER_CANDIDATES = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

function findBrowser() {
  const path = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!path) throw new Error("No Chrome or Edge found. Set CHROME to the browser executable.");
  return path;
}

function listPages() {
  const rootPages = readdirSync(".").filter((name) => name.endsWith(".html"));
  const blogPages = readdirSync("blog").filter((name) => name.endsWith(".html")).map((name) => `blog/${name}`);
  return [...rootPages, ...blogPages];
}

function launchBrowser(profileDir) {
  const browser = spawn(findBrowser(), [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profileDir}`, "about:blank",
  ], { stdio: "ignore" });
  return browser;
}

function stopBrowser(browser) {
  if (process.platform === "win32") {
    try { execFileSync("taskkill", ["/PID", String(browser.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* already gone */ }
  } else {
    browser.kill("SIGTERM");
  }
}

async function connectToPage() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      const page = targets.find((target) => target.type === "page");
      if (page) return openDevtoolsSession(page.webSocketDebuggerUrl);
    } catch { /* browser still starting */ }
    await wait(250);
  }
  throw new Error("Could not reach the headless browser's debugging port.");
}

async function openDevtoolsSession(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 0;
  socket.onmessage = (message) => {
    const reply = JSON.parse(message.data);
    if (reply.id && pending.has(reply.id)) {
      pending.get(reply.id)(reply);
      pending.delete(reply.id);
    }
  };
  await new Promise((ready, failed) => { socket.onopen = ready; socket.onerror = failed; });

  const send = (method, params = {}) => new Promise((done, failed) => {
    const id = ++nextId;
    pending.set(id, (reply) => (reply.error ? failed(new Error(`${method}: ${reply.error.message}`)) : done(reply.result)));
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;
  return { send, evaluate, close: () => socket.close() };
}

async function capture(session, pageUrl, viewport, theme, outFile) {
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile,
  });
  await session.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
  await session.send("Page.navigate", { url: pageUrl });
  await wait(SETTLE_MS);

  const scrollWidth = await session.evaluate("document.documentElement.scrollWidth");
  const scrollHeight = await session.evaluate("document.documentElement.scrollHeight");
  const shot = await session.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: viewport.width, height: Math.min(scrollHeight, 16000), scale: 1 },
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

  const profileDir = mkdtempSync(join(tmpdir(), "site-shoot-"));
  const browser = launchBrowser(profileDir);
  let overflowCount = 0;
  try {
    const session = await connectToPage();
    await session.send("Page.enable");
    for (const page of pages) {
      const pageUrl = pathToFileURL(resolve(page)).href;
      for (const viewport of VIEWPORTS) {
        for (const theme of THEMES) {
          const name = `${page.replace(/[\\/]/g, "_").replace(/\.html$/, "")}-${viewport.name}-${theme}.png`;
          const { overflows, scrollWidth } = await capture(session, pageUrl, viewport, theme, join(outDir, name));
          if (overflows) overflowCount++;
          console.log(`${overflows ? "FAIL" : "ok  "}  ${name}${overflows ? `  (scrollWidth ${scrollWidth})` : ""}`);
        }
      }
    }
    session.close();
  } finally {
    stopBrowser(browser);
    await wait(500);
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  console.log(`\n${overflowCount} page view(s) scroll sideways.`);
  process.exit(overflowCount ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
