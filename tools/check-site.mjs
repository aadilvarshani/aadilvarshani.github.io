#!/usr/bin/env node
// Static quality gate for the site. Run from the repo root: `node tools/check-site.mjs`.
// Exits 1 if any check fails. Warnings are printed but don't fail the run.
// No dependencies: Node built-ins only. Rules are documented in docs/ARCHITECTURE.md section 6.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, normalize, relative } from "node:path";

const ROOT = process.cwd();

const CANONICAL_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; img-src 'self'; connect-src 'self' https://formspree.io; " +
  "form-action 'self' https://formspree.io; base-uri 'self'; object-src 'none'; upgrade-insecure-requests;";

// Pages served from any depth by GitHub Pages; the only place root-relative links are allowed.
const ROOT_RELATIVE_ALLOWED = new Set(["404.html"]);

const STYLESHEET = "css/site.css";

const failures = [];
const warnings = [];

const fail = (file, message) => failures.push(`${file}: ${message}`);
const warn = (file, message) => warnings.push(`${file}: ${message}`);

// ---------- discovery ----------

function listPages() {
  const rootPages = readdirSync(ROOT).filter((name) => name.endsWith(".html"));
  const blogPages = readdirSync(join(ROOT, "blog"))
    .filter((name) => name.endsWith(".html"))
    .map((name) => `blog/${name}`);
  return [...rootPages, ...blogPages];
}

function readPage(page) {
  return readFileSync(join(ROOT, page), "utf8");
}

function tagsNamed(html, tagName) {
  return html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) ?? [];
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? match[1] : null;
}

function idsIn(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
}

// ---------- page checks ----------

function checkCsp(page, html) {
  const meta = tagsNamed(html, "meta").find((tag) => attribute(tag, "http-equiv") === "Content-Security-Policy");
  if (!meta) return fail(page, "missing Content-Security-Policy meta");
  if (attribute(meta, "content") !== CANONICAL_CSP) fail(page, "CSP differs from the canonical string");
}

function checkNoInlineStyleOrScript(page, html) {
  if (/\sstyle\s*=/.test(html)) fail(page, "inline style= attribute (blocked by the CSP)");
  if (/<style\b/i.test(html)) fail(page, "<style> element (blocked by the CSP)");
  const inlineScripts = tagsNamed(html, "script").filter((tag) => attribute(tag, "src") === null);
  if (inlineScripts.length) fail(page, "inline <script> without src (blocked by the CSP)");
}

function checkNoEmDash(page, html) {
  if (html.includes("—")) fail(page, "contains an em dash (house style forbids them)");
}

function isExternal(url) {
  return /^https?:\/\//i.test(url);
}

function isIgnorableUrl(url) {
  return url === "" || /^(mailto:|tel:|data:|#)/i.test(url);
}

function checkLinks(page, html, pagesById) {
  const references = [
    ...tagsNamed(html, "a").map((tag) => ({ tag, url: attribute(tag, "href") })),
    ...tagsNamed(html, "link").map((tag) => ({ tag, url: attribute(tag, "href") })),
    ...tagsNamed(html, "img").map((tag) => ({ tag, url: attribute(tag, "src") })),
    ...tagsNamed(html, "script").map((tag) => ({ tag, url: attribute(tag, "src") })),
  ].filter(({ url }) => url !== null);

  for (const { tag, url } of references) {
    if (tag.startsWith("<a") && isExternal(url)) checkExternalAnchor(page, tag, url);
    if (isExternal(url) || isIgnorableUrl(url)) continue;
    checkLocalReference(page, url, pagesById);
  }
  checkSamePageFragments(page, html);
}

function checkExternalAnchor(page, tag, url) {
  const rel = attribute(tag, "rel") ?? "";
  const opensNewTab = attribute(tag, "target") === "_blank";
  if (!opensNewTab || !rel.includes("noopener") || !rel.includes("noreferrer")) {
    fail(page, `external link without target="_blank" rel="noopener noreferrer": ${url}`);
  }
}

function checkLocalReference(page, url, pagesById) {
  if (url.startsWith("/") && !ROOT_RELATIVE_ALLOWED.has(page)) {
    return fail(page, `root-relative link (breaks on file://): ${url}`);
  }
  const [path, fragment] = url.split("#");
  const target = url.startsWith("/") ? normalize(path.slice(1)) : normalize(join(dirname(page), path));
  const targetFile = relative(ROOT, join(ROOT, target)).replaceAll("\\", "/");
  if (!existsSync(join(ROOT, targetFile))) return fail(page, `link to a missing file: ${url}`);
  if (fragment && targetFile.endsWith(".html") && !pagesById.get(targetFile)?.has(fragment)) {
    fail(page, `link to a missing #${fragment} on ${targetFile}`);
  }
}

function checkSamePageFragments(page, html) {
  const ids = idsIn(html);
  for (const tag of tagsNamed(html, "a")) {
    const href = attribute(tag, "href");
    if (href && href.length > 1 && href.startsWith("#") && !ids.has(href.slice(1))) {
      fail(page, `link to a missing #${href.slice(1)} on this page`);
    }
  }
}

function checkImageAlt(page, html) {
  for (const tag of tagsNamed(html, "img")) {
    if (attribute(tag, "alt") === null) fail(page, `<img> without alt: ${attribute(tag, "src")}`);
  }
}

function checkTabsHavePanels(page, html) {
  const ids = idsIn(html);
  for (const tag of tagsNamed(html, "button").filter((t) => attribute(t, "role") === "tab")) {
    const panelId = attribute(tag, "aria-controls");
    if (!panelId || !ids.has(panelId)) fail(page, `tab controls a missing panel: ${panelId}`);
  }
}

function checkNoPhoneNumbers(page, html) {
  const text = html.replace(/<[^>]+>/g, " ");
  const internationalNumber = /\+\d{1,3}[\s-]?\d{4,5}[\s-]?\d{4,6}/;
  const indianMobile = /(?<!\d)[6-9]\d{9}(?!\d)/;
  if (internationalNumber.test(text) || indianMobile.test(text)) fail(page, "looks like it contains a phone number");
}

// ---------- shared blocks ----------

function sharedBlock(html, pattern) {
  const match = html.match(pattern);
  if (!match) return null;
  // Normalise depth so root and blog/ pages compare equal: strip "../" and a leading "/".
  return match[0].replace(/(href|src)="(\.\.\/|\/)/g, '$1="').replace(/\s+/g, " ");
}

function checkSharedBlocksMatch(pages) {
  const blocks = [
    { name: "site bar", pattern: /<header class="site-bar"[\s\S]*?<\/header>/ },
    { name: "site foot", pattern: /<footer class="site-foot"[\s\S]*?<\/footer>/ },
  ];
  for (const { name, pattern } of blocks) {
    const versions = pages.map((page) => ({ page, block: sharedBlock(readPage(page), pattern) }));
    const migrated = versions.filter(({ block }) => block !== null);
    if (migrated.length === 0) continue;
    const reference = migrated[0];
    for (const { page, block } of migrated.slice(1)) {
      if (block !== reference.block) fail(page, `${name} differs from ${reference.page}`);
    }
  }
}

// ---------- stylesheet ----------

function topLevelStatements(css) {
  // Splits CSS into top-level statements by tracking brace depth. Comments are removed first.
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const statements = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "{") depth++;
    if (char === "}") depth--;
    const endsBlock = char === "}" && depth === 0;
    const endsAtRule = char === ";" && depth === 0;
    if (endsBlock || endsAtRule) {
      statements.push(source.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  return statements.filter(Boolean);
}

function checkStylesheet() {
  const file = join(ROOT, STYLESHEET);
  if (!existsSync(file)) return warn(STYLESHEET, "not found (expected during early migration)");
  for (const statement of topLevelStatements(readFileSync(file, "utf8"))) {
    const isLayerOrder = /^@layer\s+[\w\s,-]+;$/.test(statement);
    const layer = statement.match(/^@layer\s+([\w-]+)\s*\{/);
    if (isLayerOrder) continue;
    if (!layer) {
      fail(STYLESHEET, `CSS outside any @layer: ${statement.slice(0, 60)}...`);
      continue;
    }
    if (layer[1] !== "tokens" && /#[0-9a-fA-F]{3,8}\b/.test(statement)) {
      fail(STYLESHEET, `hex colour outside the tokens layer, in @layer ${layer[1]}`);
    }
  }
}

function warnOnUnknownClasses(pages) {
  const file = join(ROOT, STYLESHEET);
  if (!existsSync(file)) return;
  const css = readFileSync(file, "utf8");
  const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((match) => match[1]));
  for (const page of pages) {
    const html = readPage(page);
    if (!html.includes(STYLESHEET.split("/")[1])) continue; // page not migrated yet
    const used = [...html.matchAll(/\sclass="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/));
    for (const name of new Set(used)) {
      const isPageHook = name.startsWith("page-"); // body classes that scope the pages layer; rules are optional
      if (!defined.has(name) && !isPageHook) warn(page, `class "${name}" has no rule in ${STYLESHEET}`);
    }
  }
}

// ---------- run ----------

function main() {
  const pages = listPages();
  const pagesById = new Map(pages.map((page) => [page, idsIn(readPage(page))]));

  for (const page of pages) {
    const html = readPage(page);
    checkCsp(page, html);
    checkNoInlineStyleOrScript(page, html);
    checkNoEmDash(page, html);
    checkLinks(page, html, pagesById);
    checkImageAlt(page, html);
    checkTabsHavePanels(page, html);
    checkNoPhoneNumbers(page, html);
  }
  checkSharedBlocksMatch(pages);
  checkStylesheet();
  warnOnUnknownClasses(pages);

  for (const message of warnings) console.log(`warn  ${message}`);
  for (const message of failures) console.log(`FAIL  ${message}`);
  console.log(`\n${pages.length} pages checked: ${failures.length} failure(s), ${warnings.length} warning(s).`);
  process.exit(failures.length ? 1 : 0);
}

main();
