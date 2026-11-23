# Migration to nulltheory.dev

This site is moving from hand-written HTML on `aadilvarshani.github.io` to an Astro site on `nulltheory.dev`, hosted on Cloudflare. This document records the decisions and the phases. The step-by-step executor plan lives outside the repo; this is the durable summary.

## Goal

One public platform organised into six pillars that feed each other: EDR (flagship), Blog (deep dives), Docs (living reference), Academy (a public, vendor-neutral curriculum, built later), Tools (utilities and verified detections) and About. The aim is NullSec-style depth with ITProfessor-style structure. Running cost stays at zero apart from the domain.

## The private learning hub is separate

The private academy is a personal learning hub that paraphrases private partner documentation. It is not part of this repo and never will be. It lives in its own private repo on its own `*.pages.dev` address behind Cloudflare Access, with no `nulltheory` branding, because that name is reserved for the future public academy.

## Decisions

| Area | Choice | Why |
|---|---|---|
| Generator | Astro, static output | Typed content collections with `reference()` links between pillars, zero JS by default, islands when a tool needs one |
| Public host | Cloudflare Pages (or Workers static assets, same `dist/`) | Free, real `_headers` and `_redirects`, same account as the DNS |
| Private hub | Cloudflare Pages on `*.pages.dev`, Access, D1 | Free, fails closed, hostname not published in certificate transparency logs |
| Contact form | Formspree, unchanged | Free tier |
| Security contact | Cloudflare Email Routing to `security@nulltheory.dev` | Keeps a personal address out of `security.txt` |
| Search | Pagefind (Phase 5) | Static, free |
| Analytics | None on the page | House rule |

### URL scheme

Astro builds with `build.format: "file"`, so pages keep their `blog/<slug>.html` paths and GitHub Pages serves them unchanged. Cloudflare Pages serves `/blog/<slug>` and redirects the `.html` form to it, so old links keep working on both hosts. From Phase 2, pages use root-relative links and `npm run dev` replaces opening files over `file://`.

## Phases

| Phase | Outcome |
|---|---|
| 0 | Branch, this document, domain and email routing on Cloudflare |
| 1 | Astro builds today's site unchanged; gates run on `dist/`; github.io deploys through Actions |
| 2 | Layouts and typed collections; security CI (Gitleaks, metadata check, detection verification, build gates) |
| 3 | nulltheory.dev live on Cloudflare; github.io becomes redirect stubs; Medium canonicals updated |
| 4 | Private hub live on its own `*.pages.dev` address behind Access |
| 5 | Pillars built out: EDR, Docs, Tools, detections library, search |
| 6 | Public, vendor-neutral Academy at nulltheory.dev/academy |

## Guardrails

1. Do not merge a branch that moves files into `public/` until GitHub Pages is switched to the Actions source. Master deploys the repo root today, and moving the files first takes the live site down.
2. Nothing from the private hub's lessons, glossary, modules, bosses, outcomes or changelog is ever copied into this repo. Only the simulated company generator and the pure engines (RNG, spaced repetition, grading, XP) are original work and reusable in Phase 6.
3. The CSP stays strict: no `'unsafe-inline'` for script or style, no `style=""` attributes, no inline `<script>` or `<style>` in built HTML. Phase 2 adds a CI check on `dist/`.
