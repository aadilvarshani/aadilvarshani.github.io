# aadilvarshani.github.io

Personal site for Aadil Varshani, threat detection engineer. Hand-written HTML, CSS and JS in `public/`, built with Astro
(static output) and deployed from `master`. The site is moving to nulltheory.dev on Cloudflare; see `docs/MIGRATION.md`.

## Running locally

Needs Node 22+.

```
npm ci
npm run dev        # dev server
npm run build      # writes dist/
npm run preview    # serves dist/
```

## Before committing

Build first (`npm run build`), then:

```
npm run gate:check                       # static checks on dist/
npm run gate:behaviour                   # JS behaviour and no-JS fallbacks in headless Chrome
npm run gate:shoot -- <out-dir>          # screenshots of every page, light and dark, desktop and phone
```

Needs Node 22+ and Chrome or Edge. Nothing in `tools/` is loaded by the site.

After adding any image or PDF, strip its metadata (needs Python 3, exiftool and qpdf):

```
python tools/strip-metadata.py --dry-run   # see what each file carries
python tools/strip-metadata.py             # strip and verify (needs a clean git tree)
```

## Structure

```
index.html, reaperwatch.html, contact.html, 404.html   Pages at the root
blog/                           Writing index, series pages, posts, detections and repos page, images
css/site.css                    The only stylesheet (cascade layers, design tokens, dark mode)
js/                             theme-init, theme-toggle, tablist, lightbox
assets/                         Favicon, resume PDF, self-hosted fonts
docs/DESIGN.md                  Design language
docs/ARCHITECTURE.md            Engineering rules, change recipes, migration notes
tools/                          Quality gates and strip-metadata.py
```
