# Front-end architecture and change guide

How the site is built, the rules that keep it maintainable, and how to make common changes without breaking anything. Read this before editing CSS, JS or page templates. The visual rules (colours, type, per-page character) live in [DESIGN.md](DESIGN.md).

## 1. Constraints (non-negotiable)

| Constraint | Why |
|---|---|
| Plain HTML, CSS and JS. No build step, no framework, no `package.json`. | GitHub Pages serves the repo as-is; anything that needs a build can silently drift. |
| One Content-Security-Policy, byte-identical on every page. No `'unsafe-inline'`. | No inline `style=`, `<style>` or inline `<script>` anywhere. `tools/check-site.mjs` enforces it. |
| Pages work from `file://` (open `index.html` directly). | That's why scripts are classic `defer` files, not ES modules (browsers block modules on `file://`). |
| Relative links only, except `404.html`. | Root-relative links break on `file://`. `404.html` is served at any depth by GitHub Pages, so it alone uses root-relative paths. |
| Every published URL stays stable. | Posts are linked from LinkedIn. |
| No third-party requests: fonts, scripts, styles, images and analytics all come from this origin. | Visitors' IPs never go to another host. `tools/check-site.mjs` fails on any third-party resource, and a behaviour test fails on any off-origin request. |

## 2. File layout

```
index.html                 Home
reaperwatch.html           ReaperWatch hub: interactive drawing, build log
contact.html               Contact form (Formspree)
404.html                   Not-found page (root-relative paths, see section 1)
blog/index.html            Writing index
blog/<series>.html         Series pages
blog/<slug>.html           Posts, flat, one depth
blog/images/               Post images: <post-slug>-<what-it-shows>.png
css/site.css               The only stylesheet
js/theme-init.js           Sets the theme before first paint (loaded in <head>)
js/theme-toggle.js         Theme button
js/tablist.js              Every ARIA tablist on the site
js/lightbox.js             Screenshot lightbox
assets/                    Favicon, apple-touch-icon, self-hosted fonts
assets/fonts/              Self-hosted woff2 fonts (latin subset) and their OFL licences
tools/check-site.mjs       Static checks
tools/test-behaviour.mjs   Behaviour tests in headless Chrome
tools/shoot.mjs            Screenshots + overflow checks in headless Chrome
tools/lib/browser.mjs      Shared local server and headless browser session for the two above
tools/strip-metadata.py    Strips metadata from PNG, JPG, SVG and PDF files (needs exiftool and qpdf)
docs/                      This file, DESIGN.md
```

## 3. CSS architecture

### 3.1 Cascade layers

`css/site.css` declares its layer order once, at the top:

```css
@layer reset, tokens, base, layout, components, pages, utilities;
```

Later layers always win over earlier layers regardless of selector specificity. So a component rule never needs `!important` or a longer selector to beat a base rule, and a page rule can adjust a component without a specificity fight. **Every rule lives inside a layer.** Unlayered CSS beats all layers and is not allowed.

| Layer | Contains | May reference |
|---|---|---|
| `reset` | Box sizing, margin resets | nothing |
| `tokens` | All custom properties (section 3.2) | tokens only |
| `base` | Element defaults: `body`, `a`, headings, `code`, focus | semantic tokens |
| `layout` | Page-level structure: `.wrap`, `.site-bar`, `.reading` | semantic tokens |
| `components` | Reusable blocks (section 3.4) | semantic and component tokens |
| `pages` | Rules for one page only, prefixed with the page class (`.page-cv ...`) | semantic and component tokens |
| `utilities` | Single-purpose helpers (`.visually-hidden`) | semantic tokens |

### 3.2 Design tokens, three tiers

Changes ripple through one tier at a time, so a change at one level can't break the others.

1. **Primitive tokens**: raw values with no meaning. `--gray-900: #16181d;` Only the `tokens` layer may contain a hex colour, font name or raw size. `check-site.mjs` fails on a hex colour anywhere else.
2. **Semantic tokens**: what a value is for. `--color-text`, `--color-bg`, `--color-border`, `--color-code-bg`. Components use these, never primitives.
3. **Component tokens**: knobs a component exposes. The seat band reads `--seat-bg`, `--seat-fg`, `--seat-accent`, which are set by `[data-seat="..."]`.

Naming: `--{category}-{role}-{variant}`. Categories are `color`, `font`, `size`, `space`, `radius`, `line`, `motion`.

### 3.3 Theming (light and dark)

Each semantic colour token is declared once with both values using `light-dark()`:

```css
:root {
  color-scheme: light dark;                       /* follow the OS by default */
  --color-bg: light-dark(var(--gray-50), var(--gray-975));
  --color-text: light-dark(var(--gray-900), var(--gray-100));
}
:root[data-theme="light"] { color-scheme: light; }  /* explicit choice */
:root[data-theme="dark"]  { color-scheme: dark; }
```

- The OS preference applies until the reader picks a theme with the toggle. The choice is stored in `localStorage` under `theme` and applied by `js/theme-init.js` in `<head>` before first paint (no flash of the wrong theme).
- **Components never mention themes.** They only use semantic tokens, so a new theme or a dark-mode tweak is a change to the `tokens` layer alone.
- Seat colours are component tokens. Each seat defines its own light and dark pair in one place (`[data-seat]` blocks in the `tokens` layer).
- Diagrams that are PNGs with white backgrounds sit on `--color-diagram-bg`, which stays white in both themes.

### 3.4 Naming: BEM

Block, element, modifier: `.seat`, `.seat__year`, `.seat--reader`. One block per component, and a block never styles another block's elements. A component's class names are its public interface: renaming one means a search across all pages (the check script lists unknown classes; see section 6).

### 3.5 Component inventory

| Block | Purpose | Variants / tokens |
|---|---|---|
| `site-bar` | Top bar: name, nav, theme toggle. Wraps on small screens; no hamburger menu. | none |
| `statement` | Big opening sentence and paragraph | none |
| `route` | Vertical path through the seats, one pulse | none |
| `seat` | One career band: year, heading, org, body, artifact, texture | `data-seat="source|reader|author|sensor"` |
| `path-strip` | Ordered steps on a line | takes `--seat-accent` from its seat |
| `dialect-tabs` | One detection in several query languages | none |
| `code-panel` | Dark code block with header | none |
| `severity` | Severity label | `--critical`, `--high`, `--medium` |
| `post-feature` | Featured post | none |
| `series-grid` | Series columns | each column takes `data-seat` |
| `post-header` | Coloured band at the top of a post | `data-seat` |
| `prose` | Long-form post body: headings, lists, tables, code, figures | none |
| `series-path` | End-of-post series map | none |
| `site-foot` | Footer | none |
| `lightbox` | Screenshot overlay (created by JS) | none |

## 4. JavaScript architecture

- One feature per file, loaded with `defer`. Each file wraps its code in a named `init...` function and calls it once. Nothing is added to `window` except what `theme-init.js` must share (nothing, today).
- Every init function starts with a guard clause: if the page doesn't have the feature's markup, it returns. So every page can load every script safely.
- Behaviour is attached through ARIA roles and `data-` attributes, never through styling classes. Styling classes can change without breaking JS.
- **Progressive enhancement:** every page is fully readable without JS. Tabs show their first panel, the lightbox link opens the image, the theme follows the OS.
- `tablist.js` handles every `[role="tablist"]` on the site. Never write a second tab script.

| File | Attaches to | Without JS |
|---|---|---|
| `theme-init.js` | `<html>` | OS preference applies |
| `theme-toggle.js` | `[data-theme-toggle]` | Button is hidden (`hidden` attribute removed by JS) |
| `tablist.js` | `[role="tablist"]` | First panel visible, others `hidden` in markup. A tablist with `data-typewriter` types the selected panel's code out (about 0.7s, instant under reduced motion); the markup always holds the full code. |
| `lightbox.js` | `figure.terminal a` | Link opens the image directly |

## 5. HTML templates

There's no templating engine, so shared markup (head, site bar, footer) is copied between pages. The check script compares these blocks across pages and fails if they drift.

Every page:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="(canonical, see tools/check-site.mjs)">
  <meta name="referrer" content="no-referrer">
  <title>Page title, Aadil Varshani</title>
  <meta name="description" content="...">
  <link rel="icon" type="image/svg+xml" href="(depth)assets/favicon.svg">
  <link rel="preload" ...> (the two main fonts, as="font" crossorigin)
  <link rel="stylesheet" href="(depth)css/site.css">
  <script src="(depth)js/theme-init.js"></script>
</head>
<body class="page-(name)">
  (site bar) (main) (site foot)
  <script src="(depth)js/(feature).js" defer></script> ...
</body>
</html>
```

`(depth)` is `` at the root and `../` in `blog/`.

## 6. Quality gates

Run all three before every commit. None has dependencies beyond Node 22+ and Chrome or Edge.

```bash
node tools/check-site.mjs          # static checks, exits 1 on any failure
node tools/test-behaviour.mjs      # tabs, theme toggle and storage, lightbox, no-JS fallbacks
node tools/shoot.mjs <out-dir>     # screenshots: every page x 1440/390 x light/dark, fails on horizontal overflow
```

The browser gates serve the site from a local HTTP server, like GitHub Pages, so `404.html` renders with its root-relative paths. Keep screenshot output outside the repo.

When you add behaviour, add a test to `tools/test-behaviour.mjs` first and watch it fail.

`check-site.mjs` fails on:
- CSP missing or not byte-identical to the canonical string, or the referrer policy not `no-referrer`
- any third-party resource (`<link>`, `<script>`, `<img>` or `<iframe>` pointing at another host)
- any `style=` attribute, `<style>` element or inline `<script>`
- any em dash in HTML
- root-relative links outside `404.html`; external links without `target="_blank" rel="noopener noreferrer"`
- links or images pointing at files that don't exist, or `#fragments` that don't exist on the target page
- `<img>` without `alt`
- tabs whose `aria-controls` doesn't match a panel
- phone-number patterns
- shared blocks (site bar, footer) differing between pages
- hex colours in `css/site.css` outside the `tokens` layer; CSS outside any `@layer`

Review the screenshots by eye for anything a script can't judge.

## 7. Change recipes

### Adjust dark mode
1. Edit the dark half of the relevant `light-dark()` token in the `tokens` layer.
2. `node tools/shoot.mjs` and review the `-dark` screenshots.
Nothing outside `tokens` should change. If you're tempted to write a dark-mode rule in a component, add a semantic token instead.

### Add a colour or seat
1. Add primitives to `tokens`.
2. Add a `[data-seat="new"]` block setting `--seat-bg`, `--seat-fg`, `--seat-accent` and `--seat-texture-opacity`, each with `light-dark()`.
3. Use `data-seat="new"` in markup. No component changes.

### Add a post
0. Run `python tools/strip-metadata.py` after adding any image or PDF.
1. Copy the newest post file in `blog/` as the starting point.
2. Change title, description, `post-header` (`data-seat` matches the series), and the article body.
3. Add it to `blog/index.html` (its series column) and to the series page, if the series has one.
4. Update the home page writing section if it's the newest post.
5. Run the gates.

### Add a detection
1. Write it in Sigma; `sigma check` must pass.
2. Generate every other dialect with an official pySigma backend (see DESIGN.md section 9). Don't hand-write a dialect that has no backend.
3. Add a `dialect-tabs` block; the verification line under it is mandatory.

### Change a font
Fonts are self-hosted so no visitor request leaves this origin. Put the woff2 file (latin subset; the variable file for Bricolage Grotesque so the `opsz` axis keeps working) and its licence in `assets/fonts/`, declare it with `@font-face` in the `tokens` layer under the same family name the tokens use, and update the preload links in every page head. Never point a page at a font CDN.

### Add a page
Start from the page that's closest, keep the shared blocks byte-identical, add a `page-(name)` body class, and put page-only CSS in the `pages` layer under that class.

## 8. Commit and branch conventions

- Work on a branch; `master` is live (GitHub Pages).
- Conventional Commits: `feat:`, `fix:`, `style:`, `refactor:`, `docs:`, `chore:`. One concern per commit.
- Every commit passes both gates.

## 9. Migration plan (from the old terminal theme)

Strangler approach: `css/site.css` is built alongside the old `css/style.css`; pages move one at a time and the old stylesheet and `js/script.js` are deleted once nothing references them.

| Phase | Work | Exit criteria |
|---|---|---|
| 0 | Branch, `tools/check-site.mjs`, `tools/shoot.mjs`, baseline screenshots of the old site | Done. Old site failed only on em dashes in titles and two absolute self-links |
| 1 | `css/site.css` (layers, tokens with dark mode, components), four JS files | Done |
| 2 | Home page | Done |
| 3 | Writing index and series page | Done |
| 4 | Posts on the post template; body text untouched | Done. Body text verified identical before and after |
| 5 | CV page with print styles | Done |
| 6 | 404 page | Done |
| 7 | Detection notes page | Done |
| 8 | Delete `css/style.css` and `js/script.js`, update `CLAUDE.md` and `README.md` | Done |
| 9 | Security assessment, then publish with approval | Findings fixed or accepted |
