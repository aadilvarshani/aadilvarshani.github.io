// Shared post parsing for tools/check-site.mjs and tools/medium-sync.mjs.
// No dependencies: Node built-ins only. Regex-based, like the rest of tools/, because the post
// template is hand-written and fixed (see docs/ARCHITECTURE.md section 5).

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export const SITE_ORIGIN = "https://aadilvarshani.github.io";
export const BLOG_DIR = "blog";
export const BLOG_INDEX = "blog/index.html";

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

const normaliseNewlines = (text) => text.replace(/\r\n/g, "\n");

export function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rarr;/g, "→")
    .replace(/&larr;/g, "←")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const stripTags = (html) => html.replace(/<[^>]+>/g, "");

export function canonicalUrlFor(slug) {
  return `${SITE_ORIGIN}/${BLOG_DIR}/${slug}.html`;
}

// "Part 1, 15 Jul 2026" or "6 Nov 2026" -> "2026-07-15". Returns null when there is no date (series pages).
export function parseHeaderDate(metaText) {
  const match = metaText.match(/(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${String(MONTHS[month]).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// Every blog/*.html that uses the post template and carries a date. Series pages and the index have no date.
export function listPostFiles(root) {
  return readdirSync(join(root, BLOG_DIR))
    .filter((name) => name.endsWith(".html") && name !== "index.html")
    .map((name) => `${BLOG_DIR}/${name}`)
    .filter((file) => {
      const html = readFileSync(join(root, file), "utf8");
      return isPostTemplate(html) && parseHeaderDate(headerMeta(html) ?? "") !== null;
    })
    .sort();
}

function isPostTemplate(html) {
  return /<article class="reading">/.test(html) && /<h1 class="post-title">/.test(html) && /<div class="prose">/.test(html);
}

function headerMeta(html) {
  const match = html.match(/<span class="post-header__meta">([^<]*)<\/span>/);
  return match ? match[1].trim() : null;
}

// The inner HTML of div.prose: everything after its opening tag up to the </div> that sits just
// before the series-path nav (or the end of the article).
export function proseOf(html) {
  const start = html.indexOf('<div class="prose">');
  if (start === -1) return null;
  const bodyStart = start + '<div class="prose">'.length;
  const navAt = html.indexOf('<nav class="series-path"', bodyStart);
  const articleEnd = html.indexOf("</article>", bodyStart);
  const stop = navAt !== -1 ? navAt : articleEnd;
  const chunk = html.slice(bodyStart, stop);
  const close = chunk.lastIndexOf("</div>");
  return normaliseNewlines(close === -1 ? chunk : chunk.slice(0, close)).trim();
}

function metaContent(html, attr, value) {
  const tag = (html.match(/<meta\b[^>]*>/gi) ?? []).find((t) => t.includes(`${attr}="${value}"`));
  const match = tag?.match(/\scontent="([^"]*)"/);
  return match ? match[1] : null;
}

export function canonicalLinksIn(html) {
  return (html.match(/<link\b[^>]*>/gi) ?? [])
    .filter((tag) => /\srel="canonical"/.test(tag))
    .map((tag) => tag.match(/\shref="([^"]*)"/)?.[1] ?? null);
}

// Local image files referenced from the prose (img src and lightbox links), as repo-relative paths.
function imagesIn(prose) {
  const refs = [
    ...[...prose.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]),
    ...[...prose.matchAll(/<a\b[^>]*\shref="([^"]+\.(?:png|jpe?g|gif|svg|webp))"/gi)].map((m) => m[1]),
  ].filter((url) => !/^https?:/i.test(url));
  return [...new Set(refs.map((url) => `${BLOG_DIR}/${url.replace(/^\.\//, "")}`))].sort();
}

export function parsePost(root, file) {
  const html = readFileSync(join(root, file), "utf8");
  const slug = file.slice(BLOG_DIR.length + 1, -".html".length);
  const titleMatch = html.match(/<h1 class="post-title">([\s\S]*?)<\/h1>/);
  const meta = headerMeta(html) ?? "";
  const prose = proseOf(html) ?? "";
  return {
    file,
    slug,
    title: titleMatch ? decodeEntities(stripTags(titleMatch[1])).trim() : null,
    titleHtml: titleMatch ? titleMatch[1].trim() : null,
    description: decodeEntities(metaContent(html, "name", "description") ?? ""),
    date: parseHeaderDate(meta),
    headerMeta: meta,
    publishedTimeMeta: metaContent(html, "property", "article:published_time"),
    canonicalLinks: canonicalLinksIn(html),
    canonicalUrl: canonicalUrlFor(slug),
    prose,
    images: imagesIn(prose),
    tableCount: (prose.match(/<table\b/g) ?? []).length,
  };
}

// A post counts as published once blog/index.html links to it. Until then it is a draft.
export function linkedFromIndex(root) {
  const html = readFileSync(join(root, BLOG_INDEX), "utf8");
  return new Set([...html.matchAll(/\shref="(?:\.\/)?([\w-]+)\.html(?:#[^"]*)?"/g)].map((m) => m[1]));
}

// sha256 over the parts of a post that would appear on Medium: title, description, date, prose,
// and the bytes of every image the prose uses. The site bar, series nav, CSS and JS are excluded.
export function contentHash(root, post) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify({ title: post.title, description: post.description, date: post.date, prose: post.prose }));
  for (const image of post.images) {
    const path = join(root, image);
    hash.update(`\n${image}\n`);
    hash.update(existsSync(path) ? readFileSync(path) : "missing");
  }
  return `sha256:${hash.digest("hex")}`;
}
