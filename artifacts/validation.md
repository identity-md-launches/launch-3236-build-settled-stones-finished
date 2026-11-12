# Settled Stones revision validation — 2026-11-12

Scope: evaluate the two reopened findings, restore the required finished covers, and repair the narrow dealt-table controls. The accepted artwork, game logic, contract reader, formula, deployment pin, metadata and social thumbnail are preserved. Checks below describe the final `dist/`, not a development server.

## Findings and fixes

1. **High — missing finished covers.** `scripts/render-cover.mjs:13` names a missing deliverable. Before changes, `node --test test/export.test.mjs` failed with ENOENT for `artifacts/headline-image.png`. Rendered the existing `scripts/cover.html` artwork using `scripts/render-cover-static.mjs`. Both PNGs are now present, 1920×1080, 16:9: headline **126,459 bytes**, LED preview **25,991 bytes**, each below 4 MB. Read both images visually: the centered nine-by-nine table, dark wells, mineral stones and lifted central stone are visible. Every preview pixel was checked against its 30×30 block's first pixel: **zero mismatches**, establishing nearest-neighbour enlargement of 64×36 samples. The cover/export test now passes. Existing repository exclusions ignored `artifacts/`; `.gitignore:10` now explicitly allows these deliverables and this document within a stated path budget, so their presence survives file collection. The official Code ramp remains unverified; the preview uses the existing approximate eight-step RGB ramp. No image was uploaded.

2. **High — narrow dealt-table control overflow.** `src/styles.css:131` used four intrinsic-minimum columns. Replayed the shipped official RPC recordings at frontier 1200, dealing IDs 1183, 1184, 1185, 1196, 1197, 1198, 1199, 1200 with seal `c0080d6c`. At 320px this machine's default 16px serif fallback wrapped the discard label and did not recreate the reported 336px extent. Increasing reader text to a 20px root reproduced the same intrinsic-width defect: controls x=15, width=350.203125, right=365.203125; document clientWidth=320, scrollWidth=365. The regression failed on this measured overflow before the CSS fix. Added only a `max-width: 360px` rule at `src/styles.css:132` with `repeat(2, minmax(0, 1fr))`; the existing 44px minimum button height remains. After rebuilding, default text at 320px gives control bounds x=12..308, all buttons 44px high, and document width 320. The 20px reader setting gives bounds x=15..305 and document width 320. The regression passes, including touch Rotate, Flip, Place, then one Discard and its disabled state. No control or downstream content is clipped to hide overflow.

## Commands and actual results

Dependencies were installed into disposable `test/scratch/` directories using the existing lockfile; no production dependencies or lockfile changed. Source and frontend configuration were copied into `test/scratch/build/` for the build. Its final export replaced `dist/`; obsolete hashed assets were removed.

| Command / check | Result |
| --- | --- |
| `npm run typecheck --prefix test/scratch/build` | Pass, TypeScript 5.9.3 |
| `npm run build --prefix test/scratch/build` | Pass, Vite 6.4.6, 35 modules; relative asset URLs preserved |
| `node --test test/formula.test.js test/api.test.mjs test/export.test.mjs` | **11/11 pass**, including 1212 size 4/family O/work 80/seal `deb98f44`, API Retry-After/ETag, cover files, metadata and relative assets |
| `node test/ui-regression.mjs` with optional JSDOM/fake-timer module paths | **12/12 pass** against the final production bundle; identity, polling, Live transitions, placement, rejection, score, share and retry |
| `node --test test/layout.test.mjs` with optional Playwright/browser paths | **1/1 pass**; dealt export at 320, 360, 390, 899, 900 and 1440px, plus 320px/20px text and touch controls; no script errors |
| Pinned `taste.mjs --out test/scratch/taste --offline` with scratch browser adapter | **16/16 pass** in offline/error state |
| Pinned `taste.mjs --out test/scratch/taste-dealt --offline` with recorded-RPC adapter | **15/16 pass**; one false positive for overlapping multiline bounding boxes, examined below |
| Raw-pixel LED check | 64×36 blocks, each 30×30 uniform pixels; zero mismatches |
| `git diff --check` | Pass |

The initial browser-tool launch failed because its Chromium socket path was too long. The unmodified probe's direct Playwright launch also could not find its matching executable. A scratch module supplied the installed Chromium headless-shell executable to the probe without changing the pinned measurement code. For the dealt probe only, a second option replayed the existing official RPC recordings and returned API unavailable; no test responses are bundled in production. The layout regression likewise replays recordings with no external network requests, serves `dist/` at `/preview/`, and uses a fresh browser context.

**Probe false positive:** at 390px, taste flags the wrapped `.ids span.num` against `.ids .chip.num`. The span's outer rectangle contains whitespace beside its second line. The actual text fragments are (x=72..374.27, y=129.59..145.59) and (x=12..98.36, y=162.78..178.78). The seal is x=143.36..228.45, y=149.59..193.59. Neither text fragment intersects the seal. The 390px screenshot confirms readable, separate text. The heading is unchanged.

Screenshots, examined during this revision and intentionally confined to disposable scratch space:

- `test/scratch/layout/1200-320.png`, `1200-390.png`, `1200-1440.png`, `1200-320-large-text.png` (final dealt layout).
- `test/scratch/taste/shots/390.png`, `1440.png` and full-page variants (offline/error state).
- `test/scratch/taste-dealt/shots/390.png`, `1440.png` and full-page variants (official fixture table). At 390×844 the board and Place control are on the first screen.
- Both finished PNGs in `artifacts/` were also inspected directly.

## Better Interface review

Applied `.imd/reads/skills/better-interface/REFERENCE.md` and the pinned design-critic reference to the affected components. The six domains were considered together, preserving the existing letterpress design.

| Domain | Coverage, finding and result |
| --- | --- |
| Accessibility | Checked native control names, touch Rotate/Flip/Place/Discard and disabled discard, minimum 44px control heights, production DOM regressions for keyboard placement and retry. The narrow overflow is fixed. Board wells retain the documented sub-44px mobile size and two-tap path. Screen reader, physical touch device, forced colors and native zoom not verified. |
| Layout | Checked actual dealt export at six widths and enlarged text at 320px, plus screenshots at 320/390/1440. The single grid change fixes the demonstrated overflow. No horizontal scrolling. Probe's multiline bounding-box flag is a false positive documented above. RTL and native 200% zoom not verified. |
| Writing | Checked existing control labels and unavailable-data status against their handlers. No new product copy or invented data; existing recoverable errors retained. |
| Typography | Checked final screenshots: normal-size controls fit, discard text remains readable, long hashes wrap, five-size serif/monospace system retained. No new fonts are shipped. Default system font appearance varies by machine. |
| Colors | Existing semantic tokens retained. Both probe runs pass measured solid-background text contrast (4.5:1, 3:1 large). Images/gradients and every composited state were not contrast-certified. Official LED ramp remains unverified. |
| UI | Checked button states, stone placement, discard, carved stone appearance and reduced-motion probe. No added panels, transitions or modal tutorial. Slow-motion animation-panel review not performed. |

`DESIGN.md` records the final narrow breakpoint and current browser coverage. Design guidance is adapted from Better Interface (MIT); the pinned documentation guidance is adapted from Paul Bakaus's Impeccable (Apache-2.0).

Complete for the two reported revision defects. External official Code conversion, a new live-service check, WebKit, native zoom, physical-device and assistive-technology checks remain unverified. Hosting and repository publication are handled after submission.
