# Settled Stones

Every official settled round is a stone.

Settled Stones is a 9×9 table game for the Squeekchain community. Each tile ("stone") is one official, settled, active SqueekCore round read straight from the contract on Sepolia. No backend, token, NFT, money, custody or wallet. It is a community game reading public Squeekchain data, not an official product.

Site label: `settled-stones`. The committed static export in `dist/` is what gets hosted; nothing is published from this repository.

## How this project uses Squeekchain

Settled Stones reads SqueekCore's own `state()` to learn how far rounds are settled, then pages `roundPage()` over the last 144 certified rounds and deals the newest 8 official active rounds (nonzero work and dataHash) as stones. Each stone's size, shape and mineral inlay come from a fixed formula over the official roundId, work and dataHash, and the table carries a SHA-256 seal of those rounds, so the same proxy and IDs always deal the same table. The Squeekchain API is optional: it only adds a settlement tx hash when its 24h recent settlements list one.

## Rules

1. The board is 9×9. Today's official table deals the most recent 8 official active rounds, oldest first. Eight stones are at most 40 cells, so they always fit.
2. The first stone starts in hand. Rotate (0/90/180/270) and flip it, then place it. A legal placement (inside the board, on empty cells) is fixed; an illegal spot is rejected with a red hatched preview, a shake and a message.
3. Once per table you may discard the stone in hand; its cells miss. A stone that fits nowhere misses automatically.
4. Score: 1 point per placed cell, +9 for every completed row or column. The best score per table is kept in `localStorage`.
5. Input: mouse click places (hover previews). Touch: first tap shows the stone there, second tap on the same cell places. Keyboard: arrows move, R rotates, F flips, Enter places.
6. Inspect (tap any stone in the tray) shows the official roundId, work, whether work ≥ 40 (steers), size/family/inlay, the full dataHash, and a settlement tx only when the API's recent settlements list one. Every official number is a copy button.
7. Share: `#table=v1,11155111,<lowercase proxy>,<id1>,<id2>,...` with 1–8 strictly increasing official IDs. A shared link reads only the contract (never `/v1/settlements`). Any other hash is ignored; a malformed `#table=` is rejected with a message; nothing in the URL is executed.
8. Live table: a separate table that starts empty at the current frontier and accepts newly certified official active rounds until 8 stones or until the player presses "Finish table". The first visit never waits for Live.

## Official sources

| What | Value |
| --- | --- |
| Deployments pin | https://docs.squeekchain.com/developers/#deployments, as given for 2026-11-12: `core-sepolia-20261103 r7`, chain `11155111`, proxy `0xFD6C166D4B8E2962E65746a13e5a0797CD4dE0c4` |
| ABI URL | https://docs.squeekchain.com/assets/abi/SqueekCore.json, pinned at `abi/SqueekCore.json` |
| Contract | always called through the proxy (`src/lib/official.ts`) |
| RPCs, in order | https://ethereum-sepolia-rpc.publicnode.com, https://1rpc.io/sepolia, https://sepolia.gateway.tenderly.co, https://0xrpc.io/sep, then an optional user-set Sepolia RPC (footer, "Data sources and your own Sepolia RPC"). Each must answer `eth_chainId = 0xaa36a7` before use; mainnet is never called. |
| API | https://api.squeekchain.com, GET only, no key: `/v1/status` (≤ every 8 s while visible, `identities.core` must equal the proxy) and `/v1/settlements?range=24h` (≤ once a minute, plus a manual Refresh). ETag and Retry-After are honoured. |

Re-check on 2026-11-12 (what this build found):

- `docs.squeekchain.com` and `api.squeekchain.com` both redirected to a Cloudflare Access login ("squeekchain offline (all public hosts)"), so the Deployments table and the ABI URL could not be re-read. The pin given in the brief was kept.
- On chain, the proxy has code on all four RPCs; its EIP-1967 implementation slot points to `0x6869d6102696243fd17013ab955d99cd0c522ad3`, `implementationCodeVersion()` is `3`, and the implementation is verified on Blockscout Sepolia as `SqueekCore` (solc 0.8.36). Because the official ABI URL was behind the login, `abi/SqueekCore.json` holds that verified implementation ABI. Replace it with the official file when the docs are reachable; the game only uses `state()` (`0xc19d93fb`) and `roundPage(uint64,uint64,uint256)` (`0xc8b9e08f`).
- `configuration()` reports roundDuration 600 s and maxWorkPerRound 10000, matching the brief. `state()` reported settledThroughRound 1248, not paused.
- The game never calls `workPerBlock`, `currentWork` or `currentRound()`.
- When the API is unreachable (as now), its data is shown as unknown, never zero or settled, and play continues from the contract alone. If the API's settled round disagrees with `state()`, the page says "Using SqueekCore; the API disagrees" and uses the contract.

## Reading the contract

- `state()` gives the frontier `settledThroughRound`. Later rounds are unknown, and `roundPage` is never called past the frontier. If `paused` is true the page says so and invents nothing.
- `roundPage(afterRound exclusive, throughRound inclusive, 16)` returns only official active rounds, oldest first. Official rounds a certified span omits are rests, not tiles. If `certifiedThroughRound` is below the requested `throughRound`, paging continues from the last listed id, or from `certifiedThroughRound` if none was listed.
- Fully certified pages are cached in `localStorage` (`settled-stones:page:v1:<proxy>:<after>:<through>`).
- All chain numbers are `bigint`.

### Work derivation

For each `roundPage` call: work of the first listed round = its `cumulativeWork` minus that same call's `start.cumulativeWork`; every later listed round = its `cumulativeWork` minus the previous listed round's `cumulativeWork`. Code: `activeRounds()` in `src/lib/chain.ts`.

### Today's table

Page back from the frontier in 16-round spans across the last 144 certified rounds (newest span first, stopping once 8 are found) and keep the newest 8 official active rounds, dealt oldest first. Only if fewer than 8 exist does it keep going back, and it says so if history is shorter. On 2026-11-12 (frontier 1248) this dealt rounds 1198, 1199, 1200, 1201, 1209, 1210, 1211, 1212, seal `9e25440f`; `cast` against the proxy confirms 1196–1201 and 1209–1212 are the active rounds in that range.

## Tile formula (fixed)

A pure function of official `(roundId, work, dataHash)` in `src/lib/formula.js`, shared by the game, Inspect and the test:

- `b0` = first byte of dataHash, `b1` = second byte.
- If `work < 40`: `n = 1 + (work % 3)`. If `work ≥ 40`: `n = 4 + (work % 2)`.
- Family index = `(b0 + roundId) % (family count for n)`, using the canonical cell lists in the brief (n=1 A; n=2 A; n=3 I, L; n=4 I, O, T, L, S; n=5 I, L, U, T, V, W, X, P).
- Suit = `b1 % 4` → Jade, Lapis, Garnet, Amber (incised ring, wave, lozenge, star).
- The player may rotate 0/90/180/270 and flip. No random pre-rotation.
- Table seal: first 8 lowercase hex of SHA-256 (Web Crypto) over one `{roundId}:{dataHash}` line per stone, increasing roundId, joined by `\n`, no trailing newline.

### The 1212 check

Official round 1212 on this proxy: `roundPage(1211, 1212, 16)` returns `start.cumulativeWork = 63633` and round 1212 at `cumulativeWork = 63713`, so work = **80**; dataHash = `0xf92e09fa2841de7ce610da44324b09a22acfef747dc89875ea1d6b4852b167a9`.

- 80 ≥ 40 → n = 4 + (80 % 2) = **4**
- b0 = 0xf9 = 249; (249 + 1212) % 5 = 1461 % 5 = 1 → **family O** (index 1 of n=4)
- b1 = 0x2e = 46; 46 % 4 = 2 → Garnet
- One-line table `1212:0xf92e09fa…b167a9` seals to **`deb98f44`**

The game (open `#table=v1,11155111,0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4,1212`), Inspect ("size 4, family O", work 80, the dataHash above, seal deb98f44) and `test/formula.test.js` all give the same result.

## Install, preview, rebuild

Requires Node 20+ (built with Node 24, npm 11).

```sh
npm ci            # install from package-lock.json
npm run dev       # local dev server
npm test          # node --test test/formula.test.js
npm run build     # tsc --noEmit, then vite build into dist/
npm run preview   # serve dist/ locally
```

`vite.config.ts` sets `base: './'`, so `dist/` uses relative asset URLs and works from any gateway subpath. Rebuild and commit `dist/` after every source change.

Cover art: `scripts/cover.html` is the drawing; `IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node scripts/render-cover.mjs` renders `artifacts/headline-image.png` (1920×1080 PNG), `artifacts/headline-image.led-preview.png` (16:9 centre crop, area-averaged to 64×36, nearest-neighbour upscale), `public/og-image.png` (1200×675) and `public/favicon-64.png`. Both required headline PNGs are now included. The preview uses the existing **approximate eight-step RGB ramp; it is not verified as the official Code ramp**. Official Code was unavailable during the revision; its authoritative palette/conversion is still needed to certify that part of the cover requirement.

The browser-free renderer used for these PNGs is `scripts/render-cover-static.mjs`. It rasterizes the same local SVG drawing with Sharp, without loading the game or uploading the picture. Optional tooling, installed only in disposable scratch space:

```sh
npm install --prefix test/scratch/tools --cache test/scratch/npm-cache --no-audit --no-fund jsdom@31.0.0 sharp@0.35.5 @sinonjs/fake-timers@15.4.0
IMD_JSDOM="$PWD/test/scratch/tools/node_modules/jsdom/lib/api.js" \
IMD_SHARP="$PWD/test/scratch/tools/node_modules/sharp/dist/index.cjs" \
node scripts/render-cover-static.mjs
```

## Layout of the repository

- `src/lib/official.ts`: pinned deployment, RPC list, API base, constants
- `src/lib/chain.ts`: read-only `eth_call` client with RPC fallback, ABI decoding, certified paging, page cache
- `src/lib/api.ts`: Squeekchain API client (ETag, Retry-After, unknown on failure)
- `src/lib/formula.js` (+ `.d.ts`): tile formula, orientation and seal
- `src/lib/game.ts`: placement, scoring, discard; `src/lib/share.ts`: share-link parse/format
- `src/App.tsx`, `src/Stone.tsx`, `src/styles.css`: the interface
- `abi/SqueekCore.json`, `artifacts/`, `dist/`, `DESIGN.md`

`.gitignore` was added to keep `node_modules/`, `.npm/`, `.cache/`, `test/scratch/` and `*.tgz` out of Git. Path budget: everything committed (source, lockfile, `dist/` ≈ 0.4 MB, `artifacts/` ≈ 0.25 MB, ABI 24 kB) is well under 8 MiB.

## Revision validation (2026-11-12)

The five review reports were reproduced before changes. Detailed evidence, the six-domain design review and limitations are in [artifacts/validation.md](artifacts/validation.md); the response to each finding is in `.imd-responses.json`.

- Inspect starts with unknown API identity. Settlement requests require a positive match to the pinned proxy. Missing/mismatched identity or a failed status request clears prior hashes and invalidates in-flight responses; identity recovery cannot revive an earlier response. Automatic settlement requests remain at least 60 seconds apart; manual refresh still obeys server Retry-After.
- Starting Live always reads fresh `state()` and initializes both frontiers before enabling its poll. Repeated clicks share the initialization; returning to an already-started Live table preserves it. A failed initialization leaves the board and Retry available.
- Retry-After handles delay-seconds and HTTP-date forms for both endpoints, including manual refreshes. A past date clamps to zero; invalid or missing values fall back to 60 seconds.
- The seal now inherits the shared 44px minimum height. The game's board, typography, palette, formula, RPC configuration, ABI and deployment pin are retained.
- Both headline PNGs are shipped, 1920×1080 and under 4 MB. Darker wells and wider gaps make the 9×9 grid survive 64×36 sampling. The official ramp remains unverified, as explained above.

| Check run for this revision | Actual result |
| --- | --- |
| `npm run typecheck --prefix test/scratch/build` | pass, TypeScript 5.9.3 |
| `npm run build --prefix test/scratch/build` | pass, Vite 6.4.6; export copied to `dist/` |
| `npm test` | 6/6 formula tests pass, including 1212 and `deb98f44` |
| `node --test test/api.test.mjs test/export.test.mjs` | 5/5 pass: Retry-After, ETag, identity parsing, required PNGs, export metadata/assets |
| `node test/ui-regression.mjs` with the optional modules below | 12/12 pass against the production bundle in JSDOM; no network requests |
| Pinned `taste.mjs --out test/scratch/taste` | could not measure: Playwright's matching executable was absent. A separate launch of the available Chromium failed with `socket() failed: Operation not permitted`. No new browser screenshots, viewport/overflow checks or rendered contrast measurements are claimed. |

The build ran in a scratch mirror to leave the repository's `node_modules/` untouched: copy `package.json` and `package-lock.json` to `test/scratch/build/`, run `npm ci --prefix test/scratch/build --cache test/scratch/npm-cache`, copy `src/`, `public/`, `index.html`, `tsconfig.json` and `vite.config.ts` into that mirror, run the scripts above, then replace `dist/` with the mirror's output. Normal local development can use the simpler root commands in the installation section.

The additional API tests use Node 24's type stripping; the DOM suite uses the optional scratch tools installed above:

```sh
node --test test/api.test.mjs test/export.test.mjs
IMD_JSDOM="$PWD/test/scratch/tools/node_modules/jsdom/lib/api.js" \
IMD_FAKE_TIMERS="$PWD/test/scratch/tools/node_modules/@sinonjs/fake-timers/src/fake-timers-src.js" \
node test/ui-regression.mjs
```

The DOM suite covers initial/missing/mismatched API identity, loss of a previously verified identity, API unavailability, an old in-flight response arriving after recovery, polling limits, delayed Live initialization, repeat clicks, tab switching, subsequent certified rounds, Live retry, keyboard placement, illegal placement, scoring, local best, discard, copying and shared round 1212. `test/fixtures/sepolia-rpc.json` contains real recorded proxy responses; only the test frontier and test API responses are controlled. These fixtures are never bundled into the site. DOM simulation does not establish layout or real-device behavior.

Rechecking the official Deployments and ABI URLs still reached an access login, and the official Code page could not be loaded. The existing pin and ABI were left unchanged. The proxy remained reachable through the permitted public RPC; its state reported frontier 1248, and `roundPage(1211,1212,16)` again gave work 80 and the published hash. The live API and official Code conversion remain external verification limitations. No hosting or public-repository operation was performed.

## Initial-submission validation record (prior run)

The following is retained from the accepted submission; its browser/probe results are historical, **not measurements of this revised export**. The revision's results and limitations above take precedence.

| Check | Command | Result |
| --- | --- | --- |
| Typecheck + production build | `npm run build` | pass: `tsc --noEmit` clean; Vite emitted `dist/index.html`, one CSS and one JS bundle (≈ 57 kB gzip) |
| Formula test | `npm test` | 6/6 pass, including 1212 → size 4, family O, index 1, seal `deb98f44` |
| Interaction test (Playwright, Chromium, real Sepolia data) | scratch script, not shipped | 22/22 pass, listed below |
| Touch + keyboard (Chromium, 390, `hasTouch`) | scratch script | first tap previews, second tap places (+5); arrows, R, Enter place the next stone (+4); scrollWidth 390 |
| Design probe | `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | 16/16 checks pass (render, layout, targets, contrast, casing, tracking, eyebrows, type-sizes, type-faces, glyphs, slogans, repetition, copy-budget, chrome, motion, share) |

Interaction checks that passed: the 9×9 board is in the first paint before data; today's table dealt in under 0.5 s after load with 8 stones in the tray; no horizontal scroll at 390; "rotate, then place" shown once; the tagline appears once; a corner placement is rejected ("That runs off the table"); a centre placement scores and stays fixed; Rotate then place works; placing onto a stone is rejected ("That overlaps a placed stone"); Discard works once, then is disabled; the 1212 shared link shows seal deb98f44, "size 4, family O", work 80 and the full dataHash; that table finishes at 4 points; an uppercase-proxy link, a decreasing-ID link and a zero-work round (1213) are each rejected; with every RPC and the API blocked, the board stays, the error is shown with Retry, and the tx stays unknown; Live starts empty at round 1248 and waits for the next certified active round. No console errors except the API's failed requests.

Limitations, stated plainly:

- The Squeekchain API was behind a login during this build, so the tx-hash path in Inspect, the `identities.core` check and the "API disagrees" banner were not exercised against real API responses. The response field names (`identities.core`, `settledThroughRound`, `recentSettlements[].txHash`, round range fields) are inferred, because the API docs could not be read; anything else is treated as unknown, and no tx hash is ever shown unless one is listed.
- In this machine's sandbox, Chromium's CORS preflights to the public RPCs failed at the network proxy. `curl` shows the real RPCs answer the preflight with `access-control-allow-origin: *`, so the test relayed RPC calls through Node with those same headers. The design probe ran without the relay, so it measured the failure state (board, status, Retry).
- WebKit was not tested: the installed WebKit build did not match the Playwright version on this machine.
- No new active round arrived during the session (the frontier moved past 1212 with zero work), so Live adding a stone was not observed; its paging is the same `activeRounds()` used by today's table.
- Board cells are about 38 px at 390 wide (nine cells cannot reach 44 px in 390 px with no horizontal scroll). Touch uses a two-tap place, so a missed tap only moves the preview; every other control is at least 44 px.
- The official Code LED ramp was not available; the LED preview uses an 8-step per-channel ramp as an approximation.
- Hosting under the label and a public repository happen after this job.

### Better Interface review

Guide: `.imd/reads/skills/better-interface/REFERENCE.md`, applied while building and then reviewed against its six domains. Rendered checks were made in headless Chromium through Playwright screenshots (390 and 1440) and the taste probe; no screen reader, forced-colors or browser zoom testing was done.

| Domain | Coverage | Findings → fixes |
| --- | --- | --- |
| Accessibility | native `<button>`s throughout; board is `role="grid"` with a roving `tabindex` on the stone's cell, arrows/R/F/Enter (`src/App.tsx:303`, `onBoardKey`); every cell has an `aria-label`; one stable `role="status"` `aria-live="polite"` line; visible focus outlines (`src/styles.css:90`, `:143`); illegal spots use hatching and × as well as red; the shake stops under `prefers-reduced-motion` | Tooltip on the natively disabled Discard control removed (`src/App.tsx:430`). Hover styles were sticky on touch: now inside `@media (hover: hover)` (`src/styles.css:137`, `:139`). |
| Layout | single column below 900 px, board and side panel above (`src/styles.css`, last media query); logical padding (`padding-inline`); long hashes wrap (`overflow-wrap: anywhere`) | The status line gets a 3-line minimum so messages do not move the controls (`src/styles.css:119`). New stones started over taken cells: they now start at the nearest open spot to the centre (`startAnchor` in `src/lib/game.ts`). |
| Writing | verb-first buttons (Rotate, Flip, Place, Discard once, Retry, Copy share link); errors say how to recover ("Move or rotate the stone") | Failure line shortened to "Could not read SqueekCore: Every Sepolia RPC failed (…)." with Retry next to it (`src/App.tsx:132`). |
| Typography | system serif stack plus a monospace stack for numbers and hashes only; two weights (400, 700); five sizes; tabular numerals; 16 px input | Added `text-wrap: balance` for headings and `pretty` for paragraphs (`src/styles.css:48`, `:49`). |
| Colors | role tokens in `:root` (`--paper`, `--ink`, `--press`, `--bad`, suit tokens); probe: all measured text ≥ 4.5:1 | Two raw colours replaced by tokens `--press-deep` and `--ok` (`src/styles.css:11`, `:12`). |
| UI | no `transition: all`; one border-or-shadow per surface (probe "chrome" 0); stones are debossed wells with raised carved stones | none open |

## License and credit

Community project. Design guidance adapted from Better Interface (MIT) as pinned for this job.
