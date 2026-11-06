# Front-end architecture and change guide

How the site is built, the rules that keep it maintainable, and how to make common changes without breaking anything. Read this before editing CSS, JS or page templates. The visual rules (colours, type, per-page character) live in [DESIGN.md](DESIGN.md).

## 1. Constraints (non-negotiable)

| Constraint | Why |
|---|---|
| Plain HTML, CSS and JS. No build step, no framework, no `package.json`. | GitHub Pages serves the repo as-is; anything that needs a build can silently drift. |
| One Content-Security-Policy, byte-identical on every page. No `'unsafe-inline'`. | No inline `style=`, `<style>` or inline `<script>` anywhere. `tools/check-site.mjs` enforces it. |
| Pages work from `file://` (open `index.html` directly). | That's why scripts are classic `defer` files, not ES modules (browsers block modules on `file://`). |
| Relative links only, except `404.html`. | Root-relative links break on `file://`. `404.html` is served at any depth by GitHub Pages, so it alone uses root-relative paths. |
| Every published URL stays stable. | Posts are linked from LinkedIn and the CV. |

## 2. File layout

```
index.html                 Home
cv.html                    CV page (prints to PDF)
404.html                   Not-found page (root-relative paths, see section 1)
blog/index.html            Writing index
blog/<series>.html         Series pages
blog/<slug>.html           Posts, flat, one depth
blog/images/               Post images: <post-slug>-<what-it-shows>.png
css/site.css               The only stylesheet
js/theme-init.js           Sets the theme before first paint (loaded in <head>)
js/theme-toggle.js         Theme button
js/nav.js                  Mobile navigation
js/tablist.js              Every ARIA tablist on the site
js/lightbox.js             Screenshot lightbox
assets/                    Favicon, resume.pdf
tools/check-site.mjs       Static checks (run before every commit)
tools/shoot.mjs            Screenshots + overflow checks in headless Chrome
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
| `site-bar` | Top bar: name, nav, theme toggle | none |
| `statement` | Big opening sentence and paragraph | none |
| `route` | Vertical path through the seats, one pulse | none |
| `seat` | One career band: year, heading, org, body, artifact, texture | `data-seat="source|reader|author|sensor"` |
| `event-table` | ID and meaning pairs | none |
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
| `nav.js` | `[data-nav-toggle]`, `[data-nav]` | Nav is always visible |
| `tablist.js` | `[role="tablist"]` | First panel visible, others `hidden` in markup |
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
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>Page title, Aadil Varshani</title>
  <meta name="description" content="...">
  <link rel="icon" type="image/svg+xml" href="(depth)assets/favicon.svg">
  <link rel="preconnect" ...> (fonts)
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

Run both before every commit. Neither has dependencies beyond Node 22+ and Chrome.

```bash
node tools/check-site.mjs          # static checks, exits 1 on any failure
node tools/shoot.mjs <out-dir>     # screenshots: every page x 1440/390 x light/dark, fails on horizontal overflow
```

`check-site.mjs` fails on:
- CSP missing or not byte-identical to the canonical string
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
1. Copy the newest post file in `blog/` as the starting point.
2. Change title, description, `post-header` (`data-seat` matches the series), and the article body.
3. Add it to `blog/index.html` (its series column) and to the series page, if the series has one.
4. Update the home page writing section if it's the newest post.
5. Run the gates.

### Add a detection
1. Write it in Sigma; `sigma check` must pass.
2. Generate other dialects with pySigma backends where they exist; hand-translate the rest and verify them (KQL with `@kusto/language-service-next`).
3. Add a `dialect-tabs` block; the verification line under it is mandatory.

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
| 0 | Branch, `tools/check-site.mjs`, `tools/shoot.mjs`, baseline screenshots of the old site | Gates run; failures on the old site are the expected ones (em dashes in titles) |
| 1 | `css/site.css` (layers, tokens with dark mode, components), the five JS files | Components render in both themes |
| 2 | Home page | Matches the reference sample in both themes, gates pass |
| 3 | Writing index and series page | Series colours and paths in place |
| 4 | Posts on the post template; body text untouched | URLs unchanged, gates pass |
| 5 | CV page with print styles | Prints cleanly; no phone number |
| 6 | 404 page | Renders from any depth |
| 7 | Detection notes page | Spray detection published with its verification line |
| 8 | Delete `css/style.css` and `js/script.js`, update `CLAUDE.md` | No reference to old classes; gates pass |
| 9 | Security assessment, then publish with approval | Findings fixed or accepted |
