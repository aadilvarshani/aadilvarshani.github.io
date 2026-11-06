// Shared plumbing for the browser-based gates (shoot.mjs, test-behaviour.mjs):
// a local static server that behaves like GitHub Pages, and a headless browser session over the DevTools protocol.
// Needs Node 22+ (global fetch and WebSocket) and Chrome or Edge. Set CHROME to override the browser path.

import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";

const DEBUG_PORT = 9347;
export const SERVER_PORT = 9348;
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".svg": "image/svg+xml", ".pdf": "application/pdf",
};
const BROWSER_CANDIDATES = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

export const wait = (ms) => new Promise((done) => setTimeout(done, ms));

export function pageUrl(page) {
  return `http://127.0.0.1:${SERVER_PORT}/${page.replaceAll("\\", "/")}`;
}

function startStaticServer(rootDir) {
  const root = resolve(rootDir);
  const server = createServer(async (request, response) => {
    const urlPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const filePath = resolve(join(root, urlPath));
    const insideRoot = filePath === root || filePath.startsWith(root + sep);
    if (!insideRoot) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(filePath);
      response.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream" }).end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((ready) => server.listen(SERVER_PORT, "127.0.0.1", () => ready(server)));
}

function findBrowser() {
  const path = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!path) throw new Error("No Chrome or Edge found. Set CHROME to the browser executable.");
  return path;
}

function launchBrowser(profileDir) {
  return spawn(findBrowser(), [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profileDir}`, "about:blank",
  ], { stdio: "ignore" });
}

function stopBrowser(browser) {
  if (process.platform !== "win32") return browser.kill("SIGTERM");
  try {
    execFileSync("taskkill", ["/PID", String(browser.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // already exited
  }
}

async function openDevtoolsSession(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 0;
  socket.onmessage = (message) => {
    const reply = JSON.parse(message.data);
    if (!reply.id || !pending.has(reply.id)) return;
    pending.get(reply.id)(reply);
    pending.delete(reply.id);
  };
  await new Promise((ready, failed) => { socket.onopen = ready; socket.onerror = failed; });

  const send = (method, params = {}) => new Promise((done, failed) => {
    const id = ++nextId;
    pending.set(id, (reply) => (reply.error ? failed(new Error(`${method}: ${reply.error.message}`)) : done(reply.result)));
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(`evaluate failed: ${exceptionDetails.text} in ${expression}`);
    return result.value;
  };
  return { send, evaluate, close: () => socket.close() };
}

async function connectToFirstPage() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      const page = targets.find((target) => target.type === "page");
      if (page) return openDevtoolsSession(page.webSocketDebuggerUrl);
    } catch {
      // browser still starting
    }
    await wait(250);
  }
  throw new Error("Could not reach the headless browser's debugging port.");
}

// Runs `work(session)` with a served site and a fresh headless browser, and always cleans up both.
export async function withBrowser(rootDir, work) {
  const server = await startStaticServer(rootDir);
  const profileDir = mkdtempSync(join(tmpdir(), "site-gate-"));
  const browser = launchBrowser(profileDir);
  try {
    const session = await connectToFirstPage();
    await session.send("Page.enable");
    try {
      return await work(session);
    } finally {
      session.close();
    }
  } finally {
    stopBrowser(browser);
    server.close();
    await wait(500);
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

export async function navigate(session, url, settleMs = 1200) {
  await session.send("Page.navigate", { url });
  await wait(settleMs);
}
