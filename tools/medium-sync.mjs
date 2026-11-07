#!/usr/bin/env node
// Medium cross-publishing queue. Run from the repo root. Node 22+, built-ins only.
// The workflow is documented in docs/MEDIUM.md.
//
//   node tools/medium-sync.mjs scan [--check]          rebuild medium/manifest.json from the posts
//   node tools/medium-sync.mjs package <slug>... --out <dir>
//   node tools/medium-sync.mjs package --pending --out <dir>
//   node tools/medium-sync.mjs record <slug> <medium-url> [--replace]
//   node tools/medium-sync.mjs changes --since <git-sha>    (CI: log what this push changed)
//   node tools/medium-sync.mjs queue                        (CI: open, update and close GitHub issues)
//
// Medium accepts no new API integrations and its API cannot update posts, so nothing here talks to
// Medium. The manual step is Medium's "Import a story"; this tool automates what happens before and
// after it.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  SITE_ORIGIN,
  listPostFiles,
  parsePost,
  linkedFromIndex,
  contentHash,
  decodeEntities,
  escapeHtml,
  stripTags,
} from "./lib/posts.mjs";

export const MANIFEST = "medium/manifest.json";
const ISSUE_LABEL = "medium-sync";
const PENDING = new Set(["awaiting-import", "needs-update"]);

const today = () => new Date().toISOString().slice(0, 10);

function humanDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  const name = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1];
  return `${day} ${name} ${year}`;
}

// ---------- manifest ----------

export function readManifest(root) {
  const path = join(root, MANIFEST);
  if (!existsSync(path)) return { articles: [] };
  return JSON.parse(readFileSync(path, "utf8"));
}

function syncStatusOf(entry) {
  if (entry.status === "excluded") return "excluded";
  if (entry.status === "removed") return "removed";
  if (entry.status === "draft") return "not-published";
  if (!entry.mediumUrl) return "awaiting-import";
  return entry.contentHash === entry.syncedHash ? "synced" : "needs-update";
}

function makeEntry(fields) {
  // Fixed key order keeps the JSON diff readable.
  const entry = {
    slug: fields.slug,
    title: fields.title,
    canonicalUrl: fields.canonicalUrl,
    publishedDate: fields.publishedDate,
    lastModified: fields.lastModified,
    status: fields.status,
    contentHash: fields.contentHash,
    mediumUrl: fields.mediumUrl ?? null,
    syncedHash: fields.syncedHash ?? null,
    lastSyncedAt: fields.lastSyncedAt ?? null,
    syncStatus: null,
  };
  if (fields.exclude) entry.exclude = true;
  entry.syncStatus = syncStatusOf(entry);
  return entry;
}

// Rebuilds the manifest from the posts on disk. Keeps what only a person can set: mediumUrl,
// syncedHash, lastSyncedAt and exclude. Never drops an entry, so a slug can never be queued twice.
export function buildManifest(root, existing) {
  const previous = new Map((existing.articles ?? []).map((entry) => [entry.slug, entry]));
  const linked = linkedFromIndex(root);
  const seen = new Set();
  const articles = [];

  for (const file of listPostFiles(root)) {
    const post = parsePost(root, file);
    const prev = previous.get(post.slug);
    const hash = contentHash(root, post);
    const exclude = prev?.exclude === true;
    seen.add(post.slug);
    articles.push(
      makeEntry({
        slug: post.slug,
        title: post.title,
        canonicalUrl: post.canonicalUrl,
        publishedDate: post.date,
        lastModified: !prev ? post.date : prev.contentHash === hash ? prev.lastModified : today(),
        status: exclude ? "excluded" : linked.has(post.slug) ? "published" : "draft",
        contentHash: hash,
        mediumUrl: prev?.mediumUrl,
        syncedHash: prev?.syncedHash,
        lastSyncedAt: prev?.lastSyncedAt,
        exclude,
      }),
    );
  }
  for (const prev of previous.values()) {
    if (!seen.has(prev.slug)) articles.push(makeEntry({ ...prev, status: "removed" }));
  }
  articles.sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    about: "Medium cross-publishing state. Rebuilt by `node tools/medium-sync.mjs scan`. See docs/MEDIUM.md.",
    siteOrigin: SITE_ORIGIN,
    articles,
  };
}

const serialise = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

// Used by tools/check-site.mjs: returns null when the manifest matches the posts, or a reason.
export function manifestDrift(root) {
  const path = join(root, MANIFEST);
  if (!existsSync(path)) return `${MANIFEST} is missing`;
  const current = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const rebuilt = serialise(buildManifest(root, readManifest(root)));
  if (current === rebuilt) return null;
  return `${MANIFEST} is out of date: run \`node tools/medium-sync.mjs scan\` and commit the result`;
}

function writeManifest(root, manifest) {
  mkdirSync(join(root, "medium"), { recursive: true });
  writeFileSync(join(root, MANIFEST), serialise(manifest));
}

function printTable(articles, before) {
  const old = new Map((before.articles ?? []).map((entry) => [entry.slug, entry]));
  for (const entry of articles) {
    const prev = old.get(entry.slug);
    const change = !prev ? "new" : prev.contentHash !== entry.contentHash ? "changed" : "unchanged";
    console.log(`${change.padEnd(10)} ${entry.syncStatus.padEnd(16)} ${entry.slug}`);
  }
}

function cmdScan(root, args) {
  const before = readManifest(root);
  const manifest = buildManifest(root, before);
  printTable(manifest.articles, before);
  if (args.includes("--check")) {
    const drift = manifestDrift(root);
    if (drift) {
      console.error(`\n${drift}`);
      process.exit(1);
    }
    console.log(`\n${MANIFEST} is current.`);
    return;
  }
  writeManifest(root, manifest);
  console.log(`\nWrote ${MANIFEST}.`);
}

// ---------- record ----------

function isMediumUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "medium.com" || url.hostname.endsWith(".medium.com"));
  } catch {
    return false;
  }
}

function cmdRecord(root, args) {
  const [slug, mediumUrl] = args.filter((arg) => !arg.startsWith("--"));
  if (!slug || !mediumUrl) fatal("usage: record <slug> <medium-url> [--replace]");
  if (!isMediumUrl(mediumUrl)) fatal(`not a https medium.com URL: ${mediumUrl}`);

  const manifest = buildManifest(root, readManifest(root));
  const entry = manifest.articles.find((candidate) => candidate.slug === slug);
  if (!entry) fatal(`no post with slug "${slug}" in ${MANIFEST}`);
  if (entry.status !== "published") fatal(`"${slug}" is ${entry.status}, not published; nothing to record`);
  if (entry.mediumUrl && entry.mediumUrl !== mediumUrl && !args.includes("--replace")) {
    fatal(`"${slug}" is already recorded at ${entry.mediumUrl}. Update that story instead of importing again, or pass --replace if the old story was deleted.`);
  }
  entry.mediumUrl = mediumUrl;
  entry.syncedHash = entry.contentHash;
  entry.lastSyncedAt = today();
  entry.syncStatus = syncStatusOf(entry);
  writeManifest(root, manifest);
  console.log(`Recorded ${slug} -> ${mediumUrl} (${entry.syncStatus}). Commit ${MANIFEST}; the open issue closes when it reaches master.`);
}

// ---------- package ----------

function tableToPre(tableHtml) {
  const rows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) => ({
    header: /<th\b/.test(row[1]),
    cells: [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cell) =>
      decodeEntities(stripTags(cell[1])).replace(/\s+/g, " ").trim(),
    ),
  }));
  const columns = Math.max(...rows.map((row) => row.cells.length));
  const widths = Array.from({ length: columns }, (_, i) => Math.max(...rows.map((row) => (row.cells[i] ?? "").length)));
  const line = (cells) => widths.map((width, i) => (cells[i] ?? "").padEnd(width)).join(" | ").trimEnd();
  const lines = [];
  for (const row of rows) {
    lines.push(line(row.cells));
    if (row.header) lines.push(widths.map((width) => "-".repeat(width)).join("-+-"));
  }
  return `<pre><code>${escapeHtml(lines.join("\n"))}</code></pre>`;
}

export function mediumArticle(post) {
  let body = post.prose;
  // Lightbox wrappers: keep the image, drop the link to the full-size file.
  body = body.replace(/<a\b[^>]*\shref="[^"]+\.(?:png|jpe?g|gif|webp)"[^>]*>\s*(<img\b[^>]*>)\s*<\/a>/gi, "$1");
  // Medium has no tables.
  body = body.replace(/<table\b[\s\S]*?<\/table>/g, tableToPre);
  // Relative links and images become absolute site URLs so they work on Medium.
  body = body.replace(/\s(src|href)="([^"]+)"/g, (match, attr, value) => {
    if (/^(https?:|mailto:)/i.test(value)) return match;
    return ` ${attr}="${new URL(value, post.canonicalUrl).href}"`;
  });
  body = body.replace(/\sclass="[^"]*"/g, "");

  const footer = `<hr>\n<p><em>Originally published at <a href="${post.canonicalUrl}">${post.canonicalUrl}</a> on ${humanDate(post.date)}.</em></p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(post.title)}</title>
<link rel="canonical" href="${post.canonicalUrl}">
</head>
<body>
<article>
<h1>${post.titleHtml}</h1>
${body}
${footer}
</article>
</body>
</html>
`;
}

function packageReadme(post, entry) {
  const warnings = [];
  if (post.tableCount) warnings.push(`${post.tableCount} table(s) converted to monospace code blocks, because Medium has no tables. Check they read well, or replace them with a screenshot.`);
  if (/<svg\b/.test(post.prose)) warnings.push("Inline SVG present. Medium drops it; export it as a PNG first.");
  const update = entry.syncStatus === "needs-update";
  return `# ${post.title}

| | |
|---|---|
| Canonical URL | ${post.canonicalUrl} |
| Originally published | ${humanDate(post.date)} (${post.date}) |
| Description | ${post.description} |
| Medium story | ${entry.mediumUrl ?? "not imported yet"} |
| Sync status | ${entry.syncStatus} |
| Content hash | \`${entry.contentHash}\` |

Images (loaded by Medium from the live site):
${post.images.length ? post.images.map((image) => `- ${SITE_ORIGIN}/${image}`).join("\n") : "- none"}

Warnings:
${warnings.length ? warnings.map((w) => `- ${w}`).join("\n") : "- none"}

${update ? `## Update the existing story

Do not import again: that would create a second story.

1. Open ${entry.mediumUrl} and choose Edit.
2. Apply the changes from the site. To replace the whole body, open \`article.html\` from this folder in a browser, select the article, copy it and paste it over the old body.
3. Publish the changes, then check Story settings, Advanced settings: the canonical link is still ${post.canonicalUrl}.
4. Run \`node tools/medium-sync.mjs record ${post.slug} ${entry.mediumUrl}\` on a branch and merge it.
` : `## Import

1. On Medium, open your Stories page and choose "Import a story".
2. Paste ${post.canonicalUrl} and import.
3. Check the draft against the live page: title, code blocks, diagrams, images, links.
4. Check Story settings, Advanced settings: the canonical link is ${post.canonicalUrl}. The import tool sets it; if not, set it there.
5. Publish, then run \`node tools/medium-sync.mjs record ${post.slug} <medium-url>\` on a branch and merge it.

If the import fails, open \`article.html\` from this folder in a browser, copy the article into a new Medium story, and set the canonical link by hand in step 4.
`}`;
}

function cmdPackage(root, args) {
  const outIndex = args.indexOf("--out");
  if (outIndex === -1 || !args[outIndex + 1]) fatal("usage: package <slug>... | --pending  --out <dir>");
  const outDir = resolve(args[outIndex + 1]);
  const manifest = buildManifest(root, readManifest(root));
  const wanted = args.includes("--pending")
    ? manifest.articles.filter((entry) => PENDING.has(entry.syncStatus)).map((entry) => entry.slug)
    : args.filter((arg, i) => !arg.startsWith("--") && i !== outIndex + 1);

  if (!wanted.length) {
    console.log("Nothing to package.");
    return;
  }
  for (const slug of wanted) {
    const entry = manifest.articles.find((candidate) => candidate.slug === slug);
    if (!entry || entry.status === "removed") fatal(`no post with slug "${slug}"`);
    const post = parsePost(root, `blog/${slug}.html`);
    const dir = join(outDir, slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "article.html"), mediumArticle(post));
    writeFileSync(join(dir, "README.md"), packageReadme(post, entry));
    console.log(`packaged   ${entry.syncStatus.padEnd(16)} ${slug}`);
  }
}

// ---------- changes (CI log) ----------

function manifestAt(root, sha) {
  if (!sha || /^0+$/.test(sha)) return { articles: [] };
  try {
    return JSON.parse(execFileSync("git", ["show", `${sha}:${MANIFEST}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return { articles: [] };
  }
}

function cmdChanges(root, args) {
  const since = args[args.indexOf("--since") + 1];
  const before = new Map(manifestAt(root, since).articles.map((entry) => [entry.slug, entry]));
  const after = readManifest(root).articles;
  let any = false;
  for (const entry of after) {
    const prev = before.get(entry.slug);
    const notes = [];
    if (!prev) notes.push(`new article (${entry.status})`);
    else {
      if (prev.status !== entry.status) notes.push(`status ${prev.status} -> ${entry.status}`);
      if (prev.contentHash !== entry.contentHash) notes.push("content changed");
      if (prev.mediumUrl !== entry.mediumUrl) notes.push(`Medium URL recorded: ${entry.mediumUrl}`);
      else if (prev.syncedHash !== entry.syncedHash) notes.push("re-sync recorded");
    }
    if (notes.length) {
      any = true;
      console.log(`${entry.slug}: ${notes.join("; ")} => ${entry.syncStatus}`);
    }
  }
  if (!any) console.log("No article changes in this push (only non-article edits, or nothing that affects Medium).");
  const pending = after.filter((entry) => PENDING.has(entry.syncStatus));
  console.log(`\n${pending.length} article(s) waiting on Medium: ${pending.map((e) => `${e.slug} (${e.syncStatus})`).join(", ") || "none"}`);
}

// ---------- queue (CI: GitHub issues) ----------

function githubClient() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) fatal("queue needs GITHUB_TOKEN and GITHUB_REPOSITORY (it runs in GitHub Actions)");
  const api = process.env.GITHUB_API_URL ?? "https://api.github.com";
  return async function request(method, path, body) {
    const response = await fetch(`${api}/repos/${repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "medium-sync",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`${method} ${path} returned ${response.status}: ${text.slice(0, 300)}`);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  };
}

const markerFor = (slug) => `<!-- medium-sync:slug=${slug} -->`;
const slugFromBody = (body) => body?.match(/<!-- medium-sync:slug=([\w-]+) -->/)?.[1] ?? null;

function issueFor(entry, runUrl) {
  const update = entry.syncStatus === "needs-update";
  const title = `Medium: ${update ? "update" : "import"} "${entry.title}"`;
  const steps = update
    ? `This article is already on Medium at ${entry.mediumUrl} and its content has changed since the last sync.
**Do not import it again**, which would create a duplicate story. Medium's API cannot update posts, so this is a manual edit.

1. Open ${entry.mediumUrl} and choose Edit.
2. Bring it in line with ${entry.canonicalUrl}. The package's \`article.html\` holds the full Medium-ready body if you want to paste it over.
3. Publish the changes. In Story settings, Advanced settings, confirm the canonical link is still ${entry.canonicalUrl}.
4. On a branch: \`node tools/medium-sync.mjs record ${entry.slug} ${entry.mediumUrl}\`, commit \`medium/manifest.json\`, merge.`
    : `This article is published on the site and has no Medium story yet.

1. Make sure ${entry.canonicalUrl} is live (the Pages deploy for this commit has finished).
2. On Medium: Stories, "Import a story", paste ${entry.canonicalUrl}.
3. Check the draft against the live page: code blocks, diagrams, images, tables (Medium has none; see the package README).
4. In Story settings, Advanced settings, confirm the canonical link is ${entry.canonicalUrl}. Medium's import tool sets it and backdates the story to the original date.
5. Publish, then on a branch: \`node tools/medium-sync.mjs record ${entry.slug} <medium-url>\`, commit \`medium/manifest.json\`, merge.

If the import fails, paste \`article.html\` from the package into a new story and set the canonical link by hand.`;
  const body = `${markerFor(entry.slug)}
| | |
|---|---|
| Canonical URL | ${entry.canonicalUrl} |
| Originally published | ${entry.publishedDate} |
| Last modified | ${entry.lastModified} |
| Sync status | \`${entry.syncStatus}\` |
| Content hash | \`${entry.contentHash}\` |
| Medium story | ${entry.mediumUrl ?? "none yet"} |

${steps}

Medium-ready package: the \`medium-packages\` artifact on ${runUrl ?? "the latest medium-sync run"}.

This issue closes automatically once the recorded sync reaches master. Nothing has been published to Medium by automation.`;
  return { title, body };
}

async function ensureLabel(request) {
  try {
    await request("GET", `/labels/${ISSUE_LABEL}`);
  } catch (error) {
    if (error.status !== 404) throw error;
    await request("POST", "/labels", { name: ISSUE_LABEL, color: "5319e7", description: "Article waiting on a Medium import or update" });
    console.log(`created label ${ISSUE_LABEL}`);
  }
}

async function openIssues(request) {
  const issues = [];
  for (let page = 1; ; page++) {
    const batch = await request("GET", `/issues?labels=${ISSUE_LABEL}&state=open&per_page=100&page=${page}`);
    issues.push(...batch.filter((issue) => !issue.pull_request));
    if (batch.length < 100) return issues;
  }
}

async function cmdQueue(root) {
  const request = githubClient();
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  const runUrl = GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : null;
  const manifest = readManifest(root);
  const failures = [];

  await ensureLabel(request);
  const bySlug = new Map();
  for (const issue of await openIssues(request)) {
    const slug = slugFromBody(issue.body);
    if (!slug) continue;
    if (bySlug.has(slug)) console.log(`warning: more than one open issue for ${slug} (#${bySlug.get(slug).number}, #${issue.number}); updating the first`);
    else bySlug.set(slug, issue);
  }

  for (const entry of manifest.articles) {
    const existing = bySlug.get(entry.slug);
    try {
      if (PENDING.has(entry.syncStatus)) {
        const { title, body } = issueFor(entry, runUrl);
        if (!existing) {
          const created = await request("POST", "/issues", { title, body, labels: [ISSUE_LABEL] });
          console.log(`opened     #${created.number} ${entry.syncStatus} ${entry.slug}`);
        } else if (existing.title !== title || existing.body !== body) {
          await request("PATCH", `/issues/${existing.number}`, { title, body });
          console.log(`updated    #${existing.number} ${entry.syncStatus} ${entry.slug}`);
        } else {
          console.log(`unchanged  #${existing.number} ${entry.syncStatus} ${entry.slug}`);
        }
      } else if (existing) {
        const reason = entry.syncStatus === "synced" ? `Recorded as synced: ${entry.mediumUrl} (${entry.lastSyncedAt}).` : `No longer queued: the article is now \`${entry.syncStatus}\`.`;
        await request("POST", `/issues/${existing.number}/comments`, { body: reason });
        await request("PATCH", `/issues/${existing.number}`, { state: "closed", state_reason: entry.syncStatus === "synced" ? "completed" : "not_planned" });
        console.log(`closed     #${existing.number} ${entry.syncStatus} ${entry.slug}`);
      } else {
        console.log(`nothing    ${entry.syncStatus.padEnd(16)} ${entry.slug}`);
      }
    } catch (error) {
      failures.push(entry.slug);
      console.log(`::error title=medium-sync ${entry.slug}::${error.message}`);
    }
  }
  if (failures.length) {
    console.log(`\n${failures.length} article(s) failed: ${failures.join(", ")}. Re-run the workflow; it is safe to repeat.`);
    process.exit(1);
  }
}

// ---------- run ----------

function fatal(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const root = process.cwd();
  if (command === "scan") return cmdScan(root, args);
  if (command === "package") return cmdPackage(root, args);
  if (command === "record") return cmdRecord(root, args);
  if (command === "changes") return cmdChanges(root, args);
  if (command === "queue") return cmdQueue(root);
  fatal("usage: node tools/medium-sync.mjs scan [--check] | package <slug>...|--pending --out <dir> | record <slug> <url> [--replace] | changes --since <sha> | queue");
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  main().catch((error) => fatal(error.stack ?? String(error)));
}
