# Design language: aadilvarshani.github.io

Status: adopted, 2026-11-06. Engineering rules and the migration plan are in [ARCHITECTURE.md](ARCHITECTURE.md).
Sources: Anthropic `frontend-design` skill, Leonxlnx `taste-skill` 2.5, `clean-code` skill (markoa), and the house rules in the site repo's `CLAUDE.md`.

## 1. The idea

**"I've worked every seat an alert passes through."**

My career runs along the path an alert takes: the directory that writes the logs (Capgemini), the SOC that reads the alerts (ConnectWise), the engineer who writes the detections (ReliaQuest), and the sensor that produces the telemetry (ReaperWatch). The site is organised around that path. Every page is one seat, or a room off one.

People arrive from LinkedIn or the CV. They already know who I am, so the site never introduces or sells. It shows the work, in the language of the field, and lets the reader judge.

## 2. Principles

1. **Show the artifact, not a claim about it.** Every section carries one real thing from that world: an event ID table, a rule, a pipeline, a query. If a sentence can be replaced by an artifact, replace it.
2. **One bold thing per screen.** Each band has one artifact and one big year. Everything around it stays quiet. (frontend-design: "spend your boldness in one place".)
3. **Every word is true.** Facts come from the CV, the ReaperWatch repo or the posts. No invented numbers, quotes, customers or incidents. Opinions only when I've said them.
4. **Structure is information.** Numbers mark real sequences only (pipeline stages, series parts). A line means a path. Colour means a seat or a severity, never decoration.
5. **Motion narrates once.** One pulse travels the route line. Everything else moves only when the reader acts (tabs, hover, lightbox). No scroll reveals, no parallax, no fade-ins.
6. **Verified detections only.** Any query on the site states how it was checked (section 9).
7. **Plain voice.** First person, casual, takes a side, no rhetorical flourish (section 8).

## 3. Tokens

All tokens live in `:root` in the single stylesheet. Pages never hardcode colours.

### Colour

| Token | Value | Use |
|---|---|---|
| `--paper` | `#f3f4f2` | Page ground for reading pages |
| `--ink` | `#16181d` | Text, rules, primary buttons |
| `--muted` | `#5c6370` | Secondary text, dates |
| `--line` | `#cfd3d8` | Hairlines between list rows |
| `--panel` | `#16181d` | Code panels |
| `--panel-ink` | `#e9edf1` | Text on code panels |

**Seat colours.** Each seat owns a ground and an accent. Anything tied to a seat (a series, a post header, a CV section) inherits that seat's pair.

| Seat | Ground | Text | Accent | Texture words |
|---|---|---|---|---|
| Source (2022, AD) | `#d9dee4` | ink | ink | 4624 4625 4672 4720 4728 4740 |
| Reader (2023, SOC) | `#12161c` | `#e9edf1` | coral `#ff7a59` | LockBit Mimikatz loader dropper |
| Author (2025, detections) | `#f2d24b` | ink | ink | SPL KQL UDM AQL EQL Sigma |
| Sensor (2026, ReaperWatch) | `#1f3b33` | `#e7f0eb` | mint `#9fe0c0` | ETW PEB CNG Authenticode JSONL |

**Severity** (rules and alerts only): critical `#ff5a5f`, high `#ff9640`, medium `#e8c547`. Severity labels sit on these with dark text.

Never used: violet or lavender, acid green on near-black, cream with terracotta. These are the generated-site defaults both skills flag.

### Type

| Role | Family | Settings |
|---|---|---|
| Display and text | Bricolage Grotesque (variable, `opsz` 12 to 96) | Text at `opsz` 14, display at `opsz` 96 |
| Code, field names, IDs | IBM Plex Mono (400, 500) | Only where the content really is code or an identifier |

Both are self-hosted as latin woff2 in `assets/fonts/` (OFL licences alongside). No font CDN.

Scale (fluid, `clamp`):

| Step | Size | Weight | Tracking | Used for |
|---|---|---|---|---|
| Statement | `clamp(2.8rem, 7.4vw, 7rem)` | 750 | -0.035em | Home opening line, page titles |
| Year | `clamp(4.5rem, 11vw, 10rem)` | 800 | -0.05em | Seat years |
| Heading | `clamp(1.8rem, 3.4vw, 2.8rem)` | 700 | -0.025em | Section and seat headings |
| Subhead | 1.1 to 1.25rem | 600 to 700 | -0.015em | Card and list titles |
| Body | 18px / 1.6 | 400 | 0 | Prose, max 58 to 68ch |
| Small | 0.82 to 0.95rem | 400 to 600 | 0 | Meta, dates, captions of data |

Rules: sentence case everywhere. No all-caps labels, no tracked-out eyebrows, no single accented word in a headline.

### Space, shape, lines

- Page gutter: `clamp(16px, 4vw, 56px)`. Band padding: `clamp(64px, 9vw, 120px)` vertical.
- Seat layout: two columns, `4fr` (year) and `7fr` (content); one column under 760px.
- Radius: 2px for severity labels, 4px for buttons and tabs, 6px for panels. Nothing is pill-shaped.
- Lines: 1px hairlines for list rows, 2px for paths (route line, pipeline strips), 2px ink rule above a featured item.

## 4. Components

Class names follow BEM; the full inventory is in ARCHITECTURE.md section 3.5.

| Component | Class | What it is | Rules |
|---|---|---|---|
| Top bar | `site-bar` | Name left, four links right | No clock, no status dot, no `./` prefixes |
| Statement | `statement` | One sentence plus a short paragraph | Only the home page and section index pages |
| Seat band | `seat seat--source` etc. | Year, heading, org, body, artifact, texture | One artifact per band |
| Seat texture | `seat-texture` | Words from that world, huge, 8 to 9% opacity | Decorative only (`aria-hidden`), never readable content |
| Route line | `route` | Vertical path through the seats with a node per seat and one travelling pulse | The only ambient motion on the site; off under reduced motion |
| Path strip | `path-strip` | Ordered steps on a 2px line with a node per step | Real sequences only; takes the seat accent |
| Dialect tabs | `dialect-tabs` | One detection in several query languages | ARIA tabs with arrow keys, first tab visible without JS. On the home page the code types out when a tab is chosen. |
| Code panel | `code-panel` | Dark panel with a header (source or file) and a `pre` | Header says where the code comes from; long lines scroll inside the panel |
| Severity label | `severity severity--high` | Coloured label | Only on rules and alerts |
| Featured post | `post-feature` | Series, date, big title, one-line summary | Newest post only |
| Series column | `series` | Name, one-line description, ordered parts | Takes its seat colour (section 5) |
| Screenshot | `figure.terminal` | Real screenshot, blurred where needed, opens in the lightbox | No caption that apologises or explains a picture; a short factual caption is fine |
| Footer | `site-foot` | One human line plus email | Languages and Pune; later, one thing outside security |

## 5. Character per page

Each page belongs to a seat and borrows that seat's colour, texture and artifact style. Reading pages stay on paper so long text is comfortable. The seat shows up in the header band and the artifacts.

### Home (`index.html`)
As built in sample 7: statement, four seat bands on the route line, writing (featured post plus series columns), footer.

### Writing index (`blog/index.html`)
- Statement: "Notes from every seat." Then the featured post.
- One block per series, each opening with a short band in its seat colour and its texture:
  - **Building an EDR** goes with the sensor seat (green, ETW/PEB/CNG).
  - **Understanding Windows** goes with the source seat (grey, IRQL APC DPC PASSIVE).
  - **OSINT** goes with the reader seat (dark with coral, docProps customXml SiteId), because it's investigation work.
  - **Detection notes** (new) go with the author seat (yellow, SPL KQL Sigma).
- Parts listed as a path strip when a series is numbered.

### Series page (`blog/understanding-windows.html` and future ones)
Header band in the series colour with the series name, one-paragraph intro and a path strip of every part. It's a map of the series, not a list.

### Post pages (`blog/<slug>.html`)
- A 120 to 160px header band in the series colour: series name, part or concept number, date. Texture words faint behind.
- Title in the statement size on paper, then the body at 68ch.
- Code in code panels. Detections in dialect tabs with their verification line. Screenshots use the lightbox.
- End of post: a path strip of the series with this part's node filled, plus previous and next links. This replaces a generic "more posts" block.

### CV page (`cv.html`, new)
- The four seats again, in full: every CV bullet, still one band per seat.
- Skills as a definition list (Detection engineering, SIEM, EDR, Threat operations, Code), not pill clouds.
- Education, certification and languages in plain rows.
- A print stylesheet so "Print to PDF" produces a clean CV, while `assets/resume.pdf` stays the canonical download.
- No phone number.

### Detections & Repos (`blog/detection-notes.html`)
No detections are published here. A short note says why (the work belongs to my day job) and links the open-source repositories I reference: SigmaHQ, Splunk Security Content, Elastic detection-rules. The home page's "Detection notes" series entry links here.

### 404 (`404.html`, new)
Small character moment in the reader seat (dark, coral): "No event matched this path." with the request shown as a one-line query and a link home. One joke, then out.

## 6. Motion and interaction

| Allowed | Detail |
|---|---|
| Route pulse | 7s loop, linear, only on the home route line |
| Hover | Underline thickens on links, buttons step up 1px and press on click |
| Tabs | The panel swaps at once, then its code types out in about 0.7s (home page only, no cursor). Instant under reduced motion. |
| Lightbox | Opens and closes on click or Esc, focus returns to the link |

Everything stops under `prefers-reduced-motion`. Nothing moves because the page scrolled.

## 7. What we never do

- Terminal role-play: `./home` nav, blinking or typing cursors, `$` prompts in prose, "transmit message", live clocks, pulsing status dots.
- `// SECTION` labels, tracked all-caps eyebrows, `A · B · C` meta strings, `→` appended to links.
- Big-number stats rows (3+ years, 8+ SIEMs) as decoration. Those numbers live in sentences.
- Pill clouds of tools, identical rounded cards, gradient washes, glow.
- Scroll reveals, parallax, carousels, timed tabs.
- Placeholder or invented data on a published page. Placeholders in samples are marked and replaced before publishing.

## 8. Voice

- First person, plain, casual, takes my side. No balanced "from their side, from my side".
- No rhetorical parallelism, aphorisms or dramatic one-line paragraphs.
- No em dashes anywhere (repo rule). Commas, full stops, parentheses or colons instead.
- Avoid: genuinely, honestly, straightforward, load-bearing, "X isn't just Y, it's Z".
- Say plainly what's unverified or version-dependent.

## 9. Detection verification

Any detection shown on the site must be checked this way first. The home page tabs do not print the verification line (decision below), but the check is still run. Current toolchain, all local:

| Dialect | How it's verified |
|---|---|
| Sigma | `sigma check` (sigma-cli 4, pySigma 2): 0 errors and 0 issues on the full rule with IDs |
| Splunk SPL | Generated from the Sigma rule by pySigma's Splunk backend (`-t splunk -p splunk_windows`). Shown verbatim. |
| Sentinel KQL | Hand-translated, then parsed and analysed with Microsoft's `Kusto.Language` (npm `@kusto/language-service-next`) against the table schema. A deliberate misspelling must fail the check (negative control). |
| Anything else | Not published until there's a way to check it. |

Known limits are stated on the page, for example: the Splunk backend can't express `temporal_ordered`, so the generated SPL pairs both steps in a 30 minute window without enforcing order.

## 10. Decisions

| Decision | Outcome |
|---|---|
| Dark mode | Yes. Follows the OS, with a toggle. Seat colours have their own dark values. See ARCHITECTURE.md section 3.3. |
| Detection on the home page | Tabs only, no logic list and no verification line under them. The detection is still verified before it is published. The 2025 band shows Clearing Windows Event Logs (Security 1102). |
| Which detections | No detections are published on the notes page any more. The home page shows one baseline detection (log clearing, T1070.001). |
| Check script in the repo | Yes, `tools/` holds dev-only scripts. The site never loads them. |
| KQL time window | Fixed 10 minute bins for now; the limitation is stated with the query. |
| 2022 band artifact | The event ID table is removed by choice. The band keeps its text and the 4624 4625 texture. |
| Fonts | Self-hosted, no third-party requests (2026-11-06). |
| Footer line about life outside security | Open, waiting for your line. |
