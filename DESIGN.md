# DESIGN.md: Settled Stones

Extracted from the final source: `src/styles.css` (all tokens and rules), `src/App.tsx`, `src/Stone.tsx`, `index.html`, `public/favicon.svg`. Observed in headless Chromium at 320, 390 and 1440 wide.

## Overview

A letterpress game table for the Squeekchain community. Warm paper, deep ink, one letterpress red for the main action, and a debossed 9×9 bed in which carved stones sit. The board is the first and largest thing on every screen; everything else (stone in hand, controls, score, tray, Inspect) is a quiet column of type beside or under it. No hero, no cards, no gradients on type. Density is low and calm: one action colour, two weights, five sizes.

System-wide rules: the board and the stone in hand come before any explanation; official numbers are set in monospace and are always copy buttons; depth means "physical object" (bed, wells, stones) and is never used for panels.

## Colors

All colours are custom properties in `:root` (`src/styles.css:3–25`), hex notation.

| Token | Value | Job |
| --- | --- | --- |
| `--paper` | `#efe7d6` | page background, input background, active-tab text |
| `--bed` | `#e2d7bf` | board bed, chip background, hover fill, selected tray item |
| `--well` | `#d6c9ad` | empty board cell (debossed well) |
| `--ink` | `#1f1a14` | body text, borders of buttons/tabs/rules, active tab fill, legal-preview outline |
| `--ink-soft` | `#4a4136` | secondary text (`.muted`, tagline, ids, notes, dt) |
| `--press` | `#8e2a1f` | letterpress red: primary button, focus outline, pointer hint, warnings |
| `--press-deep` | `#74221a` | primary button hover |
| `--press-ink` | `#fbf5ea` | text on `--press` |
| `--bad` | `#a3271b` | illegal placement outline/hatch, error status |
| `--ok` | `#2f5d3f` | "copied" confirmation |
| `--stone-0..3` | `#3d5246` Jade, `#39445f` Lapis, `#5b383b` Garnet, `#5a4a2c` Amber | stone body per suit |
| `--mark-0..3` | `#b9e6c8`, `#b4c8ff`, `#ffbcc0`, `#ffd889` | incised suit mark per suit |

`.suit-N` classes set local `--stone` and `--mark` from these. The taste probe measured every rendered text pair at or above 4.5:1 (3:1 large). There is no dark theme.

## Typography

- Families: `--serif` = "Iowan Old Style", "Palatino Linotype", Palatino, "URW Palladio L", P052, "Book Antiqua", Georgia, serif (all text); `--mono` = ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace (only `.num`: round ids, work, hashes, seal, score). System fonts only; no web fonts are loaded.
- Weights: 400 and 700 (headings, primary button, big score). Tagline and pointer hint use italic.
- Scale (`src/styles.css` `--t-*`): `--t-s` 0.8125rem (tray ids), `--t-m` 1rem (body, h3, inputs), `--t-l` 1.25rem (h2, ×), `--t-xl` 1.625rem (h1 on mobile, big score), `--t-xxl` 2.125rem (h1 from 900 px). `.num` is 0.9em of its context.
- Line height 1.5 body, 1.1 h1, 1.25 h2. h1 letter-spacing -0.01em; everything else natural. No uppercase.
- Headings use `text-wrap: balance`, paragraphs `text-wrap: pretty`; long hashes and the proxy wrap with `overflow-wrap: anywhere` and are never truncated.
- `font-variant-numeric: tabular-nums` on `.num`.

## Layout

- Spacing tokens `--s1..--s6`: 0.25, 0.5, 0.75, 1, 1.5, 2 rem. Board gap `--gap` 3px. Minimum control size `--hit` 44px.
- `.page`: max-width 72rem, centred; padding 0.75rem 0.5rem 2rem below 900px, 1.5rem 1.5rem 2rem from 900px.
- Header `.top`: flex, title + tagline at the left edge, table switch (`Today` / `Live`, plus `Shared` when a share link is open) at the right edge.
- `.layout`: one column below 900px (board, status, stone in hand + controls, score, tray, Inspect, share). From 900px: two columns, `minmax(0, 34rem)` board column and `minmax(0, 1fr)` side column, gap 2rem.
- Board: `width: 100%; max-width: 34rem; aspect-ratio: 1`, so cells are about 38px at 390 wide, 30px at 320, and 57px on desktop. No horizontal scroll at 320, 390 or 1440 (probe).
- The status line keeps `min-height: 3em` so messages never push the controls around.

## Elevation & Depth

Depth is reserved for the physical table:

- `.board`: inset shadow (debossed bed), radius 10px, no border.
- `.cell`: inset shadow (each well pressed into the bed), radius 4px.
- `.stone`: soft top-left highlight gradient, inner top light and bottom dark edge, 1px drop shadow: a raised carved stone. Suit mark gets a 1px dark drop-shadow so it reads as incised.
- Everything else is flat: buttons, tabs and inputs use a 1.5px ink border and no shadow; Inspect and the footer are separated by a 1.5px ink rule. No surface has both a border and a shadow.

## Shapes

`--radius` 6px for buttons, tabs, inputs and tray items; 4px for chips and wells; 5px stones (3px in glyphs); 10px board. Legal preview: 2px dashed ink outline inset 3px. Illegal preview: 2px solid `--bad` outline plus 45° hatching and a × glyph.

## Components

| Component | Source | Use and states |
| --- | --- | --- |
| Board | `src/App.tsx` (`role="grid"`), `.board`, `.cell` | 81 `<button role="gridcell">`. Mouse: hover previews, click places. Touch/pen: first tap previews, a second tap on the same cell places. Keyboard: roving `tabindex` on the stone's anchor cell; arrows move, R rotates, F flips, Enter/Space places. Illegal attempts shake the board (`.shake-a`/`.shake-b`, 260 ms, off under reduced motion) and write the reason to the status line. |
| Stone / glyph | `src/Stone.tsx` (`SuitMark`, `StoneGlyph`), `.stone`, `.suit-N`, `.mark` | Four incised marks: Jade ring, Lapis wave, Garnet lozenge, Amber star. Glyph is a mini-grid for the hand and the tray. |
| Button | `.btn`, `.btn.primary`, `.btn.quiet`, `.btn.small` | Outline ink button; primary is solid letterpress red (only Place); quiet is dashed (Discard once). Disabled at 0.55 opacity with `not-allowed`. Hover only on `(hover: hover)` devices. |
| Tab | `.tab` with `aria-pressed` | Table switch; pressed = ink fill with paper text. |
| Chip | `.chip`, `.chip.hash` | Copy button for an official number (round, work, dataHash, tx, seal); shows "copied" beside it. |
| Tray | `.tray`, `.tray-item` with `.now`, `.sel`, `.fate-placed`, `.fate-missed` | Ordered list of the table's stones, oldest first; current stone outlined, placed ones faded, missed ones struck through. Clicking opens Inspect. |
| Inspect | `.inspect` (`<dl>`) | Round, Work (+ steers), Stone (size, family, inlay), dataHash, Settlement tx (only when listed; otherwise "Unknown" with Refresh, or "Not in the API's recent settlements"). |
| Status | `.status` (`role="status"`, polite) | Loading phases, deal result, placement results, errors (`.err`) with an inline Retry. |
| Data sources | `RpcSetting` in `src/App.tsx`, `.rpc` (`<details>`) | Proxy, frontier, API state, and an optional user-set Sepolia RPC (https only, verified by chain id). |

States: first paint (static 9×9 board in `index.html` before JS), loading (status names the call in progress), dealt (seal and ids in the heading), finished (score line + "Play this table again"), RPC failure (board stays, error + Retry), API unknown, paused (footer warning), Live waiting (empty board, waiting message).

## Do's and Don'ts

- Do keep the board first and largest at every width; new features go in the side column below the controls.
- Do set every official value in `.num` and make it a `.chip` copy button.
- Do use `--press` for exactly one action per screen (Place) and for focus; use `--bad` only for illegal placements and errors.
- Do add new colours as role tokens in `:root`; do not paste hex into rules.
- Don't add shadows to panels or borders to stones; depth belongs to the table.
- Don't introduce web fonts, Inter/Roboto/Arial, uppercase labels or tracked kicker text.
- Don't truncate hashes or addresses; wrap them.
