# aadilvarshani.github.io

Personal site for Aadil Varshani, threat detection engineer. Plain HTML, CSS and JS with no build step,
deployed by GitHub Pages from `master`.

## Running locally

Open `index.html` in a browser, or serve the folder with any static server (needed for `404.html`,
which uses root-relative paths the way GitHub Pages serves it):

```
python -m http.server 8000
```

## Before committing

```
node tools/check-site.mjs          # static checks
node tools/test-behaviour.mjs      # JS behaviour and no-JS fallbacks in headless Chrome
node tools/shoot.mjs <out-dir>     # screenshots of every page, light and dark, desktop and phone
```

Needs Node 22+ and Chrome or Edge. Nothing in `tools/` is loaded by the site.

## Structure

```
index.html, cv.html, 404.html   Pages at the root
blog/                           Writing index, series pages, posts, detection notes, images
css/site.css                    The only stylesheet (cascade layers, design tokens, dark mode)
js/                             theme-init, theme-toggle, tablist, lightbox
assets/                         Favicon, resume PDF
docs/DESIGN.md                  Design language
docs/ARCHITECTURE.md            Engineering rules, change recipes, migration notes
tools/                          Quality gates
```
