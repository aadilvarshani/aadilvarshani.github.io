# Design language: aadilvarshani.github.io

Status: adopted, 2026-11-06. Engineering rules and the migration plan are in [ARCHITECTURE.md](ARCHITECTURE.md).
Sources: Anthropic `frontend-design` skill, Leonxlnx `taste-skill` 2.5, `clean-code` skill (markoa), and the house rules in the site repo's `CLAUDE.md`.

## 1. The idea

**"I've worked every seat an alert passes through."**

My career runs along the path an alert takes: the directory that writes the logs (Capgemini), the SOC that reads the alerts (ConnectWise), the engineer who writes the detections (ReliaQuest), and the sensor that produces the telemetry (ReaperWatch). The site is organised around that path. Every page is one seat, or a room off one.

People arrive from LinkedIn. They already know who I am, so the site never introduces or sells. It shows the work, in the language of the field, and lets the reader judge.

## 2. Principles

1. **Show the artifact, not a claim about it.** Every section carries one real thing from that world: an event ID table, a rule, a pipeline, a query. If a sentence can be replaced by an artifact, replace it.
2. **One bold thing per screen.** Each band has one artifact and one big year. Everything around it stays quiet. (frontend-design: "spend your boldness in one place".)
3. **Every word is true.** Facts come from my CV, the ReaperWatch repo or the posts. No invented numbers, quotes, customers or incidents. Opinions only when I've said them.
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

**Seat colours.** Each seat owns a ground and an accent. Anything tied to a seat (a series, a post header) inherits that seat's pair.

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
| Plan blueprint | `plan` | Roadmap boxes plus a phase scrubber | ReaperWatch page only. Only the scrubber is interactive; without JS every line shows with its phase tag. Update the current phase (`DEFAULT_STEP` in `js/plan.js`) and the lines when a phase ships. |
| Footer | `site-foot` | Not used at the moment | Removed from every page; the style stays so it can come back. If it does: one human line, no email, no location. |

## 5. Character per page

Each page belongs to a seat and borrows that seat's colour, texture and artifact style. Reading pages stay on paper so long text is comfortable. The seat shows up in the header band and the artifacts.

### Home (`index.html`)
As built in sample 7: statement, four seat bands on the route line, writing (featured post plus series columns).

### Writing index (`blog/index.html`)
- Statement: "Notes from every seat." Then the featured post.
- One block per series, each opening with a short band in its seat colour and its texture:
  - **Building an EDR** goes with the sensor seat (green, ETW/PEB/CNG).
  - **Understanding Windows** goes with the source seat (grey, IRQL APC DPC PASSIVE).
  - **OSINT** goes with the reader seat (dark with coral, docProps customXml SiteId), because it's investigation work.
- Parts listed as a path strip when a series is numbered.

### Series page (`blog/understanding-windows.html` and future ones)
Header band in the series colour with the series name, one-paragraph intro and a path strip of every part. It's a map of the series, not a list.

### Post pages (`blog/<slug>.html`)
- A 120 to 160px header band in the series colour: series name, part or concept number, date. Texture words faint behind.
- Title in the statement size on paper, then the body at 68ch.
- Code in code panels. Detections in dialect tabs with their verification line. Screenshots use the lightbox.
- End of post: a path strip of the series with this part's node filled, plus previous and next links. This replaces a generic "more posts" block.

### ReaperWatch (`reaperwatch.html`)
- Statement, then the sensor seat band (year 2026) with why it exists.
- "How it works today": the interactive architecture drawing of what runs now. On desktop, selecting a part shows its note and real code beside the drawing (below it between 900 and 960px). At 900px and under a portrait drawing of the same parts replaces the wide one (the wide one would shrink to unreadable text); both share one selection and one set of notes, so any change to a part goes in both SVGs. The flow arrows are static. Code links are pinned to a ReaperWatch commit, never `HEAD`, so line ranges don't drift.
- "The plan": the roadmap as a blueprint in the sensor seat. Boxes follow the target architecture (telemetry, research, storage, the two engines, prevention, the alert pipeline, console, other platforms), and every line carries the phase that ships it. It opens on the current phase. The whole picture is a drawing of the finished system (one box per area, wired the way the parts will fit, in the same style as "How it works today"); a wide SVG on desktop and a portrait SVG at 900px and under, sharing one selection. The phase restyles the boxes: solid if built by then, accent if that phase adds to it, dashed if still to come. Choosing a box shows its lines beside the drawing (below it on phones), each line marked done, new or future; changing phase opens the first box that phase adds to. Each box shows the phases that touch it. Without JS every box's lines show under the drawing. If the boxes or phases change, update the drawings too (box labels, phase lists and `data-state` defaults); they were generated from the boxes, so regenerate rather than hand-edit where possible. On phones all twelve phases sit in one row with a compact caption. No dates. Phases 1.5 and 2 match the Notion build tracker; later phases are the stated plan.
- Product slot: a real dashboard screenshot (`blog/images/reaperwatch-dashboard.png`, lightbox) goes here once supplied. Until then the section is absent, never a placeholder.
- The build log at the end: both series (Building an EDR and Understanding Windows), with dates.

### Contact (`contact.html`)
"Say hi", then the reader band: a Write, Send, Inbox, Reply path strip that follows the message as it is written and sent, and the form. No email address and no location anywhere on the site.

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

The home page tabs show multi-SIEM engineering: one generic, credible Sigma rule (not work logic) in five query languages, every one generated by an official pySigma backend. Nothing is hand-written.

| Dialect | How it's produced |
|---|---|
| Sigma | `sigma check` (sigma-cli 4, pySigma 2): 0 errors, 0 issues on the full rule |
| Splunk SPL | `-t splunk -p splunk_windows` |
| Defender KQL | `pySigma-backend-kusto`, `microsoft_xdr` pipeline |
| Elastic EQL | `pySigma-backend-elasticsearch`, `EqlBackend` with `ecs_windows` |
| SecOps YARA-L | `pySigma-backend-secops`, `secops_udm_pipeline`, `output_format="yara_l"` |

Display versions only add line breaks between top-level clauses; a check confirms the text is otherwise identical. Re-parse the rule for every backend, because pySigma transforms rules in place. Backends that can't be installed (QRadar AQL needs a `regex` wheel that doesn't build on Python 3.14) are left out, not hand-written. Sources and outputs live in `OSINT/artifacts/detection-verify/showcase`.

## 10. Decisions

| Decision | Outcome |
|---|---|
| Dark mode | Yes. Follows the OS, with a toggle. Seat colours have their own dark values. See ARCHITECTURE.md section 3.3. |
| Detection on the home page | Tabs only, no logic list and no verification line under them. The detection is still verified before it is published. The 2025 band shows an Office or script host launching a shell with a download cradle or encoded command, in five dialects. |
| Which detections | No detections are published on the notes page any more. The home page shows one baseline detection (log clearing, T1070.001). |
| Check script in the repo | Yes, `tools/` holds dev-only scripts. The site never loads them. |
| KQL time window | Fixed 10 minute bins for now; the limitation is stated with the query. |
| 2022 band artifact | The event ID table is removed by choice. The band keeps its text and the 4624 4625 texture. |
| Fonts | Self-hosted, no third-party requests (2026-11-06). |
| Footer line about life outside security | Footer removed from every page (2026-11-07). Revisit only if a line is supplied. |
