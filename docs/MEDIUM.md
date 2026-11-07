# Medium cross-publishing

Posts are written and published on this site first. Medium carries a copy of each one, and that copy's canonical link points back to the post on this site. This document covers how the copies are tracked, what is automated, and the one step that has to be done by hand.

## Why there is a manual step

Medium's API is closed. Its documentation repository ([Medium/medium-api-docs](https://github.com/Medium/medium-api-docs)) was archived on 2023-03-02 and says "We don't allow any new integrations". Tokens that already exist still work, but the API can only **create** posts. It has no endpoint to update, list or delete them. Even with a token, an edited post could never be pushed to Medium, and the API cannot tell whether a story already exists.

This site has no token, so the supported route is Medium's **Import a story** tool. Medium's help centre says it backdates the story to the original date and adds a canonical link to the URL you import from. Nothing in this repo logs in to Medium, scrapes it or calls undocumented endpoints.

Everything before and after the import is automated.

## How it works

```
 edit blog/<slug>.html            you, on a branch
 node tools/medium-sync.mjs scan  rewrites medium/manifest.json
 check-site.mjs                   fails if the manifest is stale
            |
            v  merge to master (GitHub Pages deploys the site)
 .github/workflows/medium-sync.yml
   scan --check      manifest matches the posts
   changes           logs new / changed / recorded articles
   package           Medium-ready HTML, uploaded as an artifact
   queue             one GitHub issue per article that needs Medium work
            |
            v
 you: Import a story (or edit the existing story)
 node tools/medium-sync.mjs record <slug> <medium-url>, on a branch, merge
            |
            v
 workflow closes the issue
```

The workflow only runs when a file it cares about changes: `blog/*.html`, `blog/images/**`, `medium/**`, the sync tool, or the workflow itself. CSS, JS, the home page and other pages never trigger it. It runs with `contents: read` and `issues: write`, uses only the built-in `GITHUB_TOKEN`, and never pushes to master.

### What counts as an article

A file in `blog/` that uses the post template (`article.reading`, `h1.post-title`, `div.prose`) and has a date in its `post-header__meta` line. Series pages and `blog/index.html` don't count.

An article is **published** once `blog/index.html` links to it. Before that it is a draft, and nothing is queued for it.

### Identity and duplicates

The slug (the filename without `.html`) is the identifier. The canonical URL is always `https://aadilvarshani.github.io/blog/<slug>.html`.

Three things stop a second Medium story being created for one article:

1. The manifest has one entry per slug and never drops an entry. A deleted post stays in the manifest as `removed`.
2. Once an entry has a `mediumUrl`, a content change makes it `needs-update`. It never goes back to `awaiting-import`. The issue for `needs-update` says to edit the existing story, not to import again.
3. `record` refuses a second, different Medium URL for the same slug unless you pass `--replace`, which is only for when the old story was deleted.

The workflow also finds existing issues by a hidden `<!-- medium-sync:slug=... -->` marker, so a re-run updates the open issue instead of opening another.

### What counts as a change

`contentHash` is a sha256 over the title, description, date and the inner HTML of `div.prose`, with line endings normalised, plus the bytes of every image the prose uses. Edits to the site bar, the series-path nav at the end of a post, CSS or JS don't change it, so they don't queue an update.

### The manifest

`medium/manifest.json`, one entry per article:

| Field | Set by | Meaning |
|---|---|---|
| `slug` | scan | Identifier |
| `title` | scan | From `h1.post-title` |
| `canonicalUrl` | scan | The post on this site |
| `publishedDate` | scan | From the header date |
| `lastModified` | scan | Date the content hash last changed |
| `status` | scan | `published`, `draft`, `removed` or `excluded` |
| `contentHash` | scan | Hash of the current content |
| `mediumUrl` | record | The Medium story, or null |
| `syncedHash` | record | `contentHash` at the last confirmed sync |
| `lastSyncedAt` | record | Date of the last confirmed sync |
| `syncStatus` | derived | See below |
| `exclude` | you, by hand | `true` keeps an article off Medium |

`syncStatus` is:
- `awaiting-import` when there is no `mediumUrl`
- `synced` when `contentHash` equals `syncedHash`
- `needs-update` when they differ
- `not-published`, `removed` or `excluded` when the article isn't being synced

Only `awaiting-import` and `needs-update` produce issues.

## Initial migration

The first run after this lands queues the five existing posts. Each issue links to its package.

| Article | Canonical URL | Original date |
|---|---|---|
| Where Did That Process Go? Building an EDR Part 1 | https://aadilvarshani.github.io/blog/building-an-edr-part-1.html | 2026-07-15 |
| IRQL: The Reason Your Telemetry Has Null Fields | https://aadilvarshani.github.io/blog/understanding-windows-irql.html | 2026-08-25 |
| Attributing an Anonymised .docx From Its Metadata | https://aadilvarshani.github.io/blog/attributing-an-anonymised-docx.html | 2026-11-06 |
| Race Windows: Why My Process Events Had No Name | https://aadilvarshani.github.io/blog/understanding-windows-race-windows.html | 2026-11-07 |
| Parent PID Spoofing: Which Field to Believe | https://aadilvarshani.github.io/blog/understanding-windows-parent-pid-spoofing.html | 2026-11-07 |

Import them only after the deploy with the canonical tags is live. Check by viewing a post's source and finding `<link rel="canonical">`.

Two posts have tables, which Medium doesn't support: Building an EDR Part 1 (two) and the .docx post (one). If the import drops or mangles them, use the monospace version in that post's `article.html`, or a screenshot.

## Publishing a new article

1. Write the post as usual (CLAUDE.md, "Checklist when adding a post"), including the canonical and `article:published_time` lines.
2. Link it from `blog/index.html`.
3. Run `node tools/medium-sync.mjs scan` and commit `medium/manifest.json` with the post.
4. Run the gates and merge.
5. An issue titled `Medium: import "<title>"` opens. Follow it: wait for the deploy, import, check the canonical link, publish.
6. Run `node tools/medium-sync.mjs record <slug> <medium-url>` on a branch, commit the manifest, and merge. The issue closes.

## Updating an article that is already on Medium

1. Edit the post, run `scan`, commit, merge.
2. An issue titled `Medium: update "<title>"` opens. **Don't import again**, because that creates a second story.
3. Open the existing story, choose Edit, and apply the changes. To replace the whole body, open `article.html` from the package in a browser, copy the article and paste it over the old one.
4. Publish, and confirm the canonical link is unchanged.
5. Run `node tools/medium-sync.mjs record <slug> <medium-url>` with the same URL, on a branch, and merge. The issue closes.

## Manual import, step by step

1. On Medium, open **Stories** and choose **Import a story**.
2. Paste the canonical URL and import. Medium creates a draft.
3. Compare the draft with the live page: headings, code blocks, ASCII diagrams (they must stay in a monospace block), images, links and tables.
4. Open **Story settings**, then **Advanced settings**, and confirm the canonical link is the site URL. Set it there if it isn't.
5. Publish.

If the import fails, create a new story, paste the article from the package's `article.html`, and set the canonical link by hand in step 4. Images in the package are absolute URLs on this site, so Medium can fetch them.

## Packages

Every workflow run uploads a `medium-packages` artifact, kept for 90 days, with a folder per queued article:
- `article.html` contains the title and body, with relative links and images made absolute, lightbox wrappers removed, tables turned into monospace blocks, and an "Originally published at ..." line at the end.
- `README.md` lists the canonical URL, original date, description, images, warnings and the steps.

To build them locally:

```
node tools/medium-sync.mjs package --pending --out <folder outside the repo>
node tools/medium-sync.mjs package <slug> --out <folder outside the repo>
```

## Secrets

None. The workflow uses the built-in `GITHUB_TOKEN`, scoped to `issues: write`. It is passed only as an environment variable to the `queue` step and is never printed. API errors are logged without request headers.

If a Medium integration token ever becomes available, it would go in an Actions secret (Settings, Secrets and variables, Actions). The API could still only create posts, never update them, so the update flow above would stay manual.

## Recovering from failures

- **The workflow failed at `scan --check`.** The manifest on master doesn't match the posts. Run `node tools/medium-sync.mjs scan` on a branch, commit, and merge. `check-site.mjs` normally catches this before a commit.
- **The workflow failed at `queue`.** Each article is handled separately, and the failed ones are shown as errors in the run. Fix the cause (for example, Issues disabled on the repo, or a GitHub outage), then re-run it from the Actions tab or with **Run workflow** (`workflow_dispatch`). Re-runs are safe: existing issues are updated, not duplicated.
- **An import created a story but `record` was never run.** The issue stays open. Run `record` with the story's URL.
- **The same article was imported twice by mistake.** Delete the extra story on Medium and `record` the one you kept. If you already recorded the one you deleted, use `record <slug> <url> --replace`.
- **An article should not go to Medium.** Add `"exclude": true` to its manifest entry, run `scan`, and merge. Its issue closes as not planned.
- **A post that is on Medium was unpublished or deleted from the site.** Its entry becomes `not-published` or `removed` and keeps its `mediumUrl`. Nothing removes the Medium story; delete or unlist it by hand.

## Verifying canonical URLs

- **On the site:** `check-site.mjs` fails unless every post has exactly one `<link rel="canonical">` equal to its own URL and an `article:published_time` matching its header date.
- **On Medium:** in each story's **Story settings**, **Advanced settings**, the canonical link must be the site URL. In the published story's page source, `<link rel="canonical"` should point to the site. Check this once for each story when you import it; nothing here can check it automatically, because Medium's pages aren't reliably fetchable by scripts.

Nothing in this setup publishes to Medium. An article is on Medium only once you have imported it and recorded its URL.
