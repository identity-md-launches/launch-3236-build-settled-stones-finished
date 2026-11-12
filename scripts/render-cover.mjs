// Renders the cover art (scripts/cover.html) to artifacts/headline-image.png (1920x1080),
// a 64x36 LED preview (16:9 centre crop, area average, approximate 8-step RGB ramp, nearest-neighbour upscale),
// The official Code ramp could not be verified. Browser-free alternative: render-cover-static.mjs.
// the og:image (1200x675) and a PNG favicon. Usage: IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node scripts/render-cover.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pw = await import(process.env.IMD_PLAYWRIGHT ? pathToFileURL(process.env.IMD_PLAYWRIGHT).href : 'playwright');
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(root, 'scripts/cover.html')).href);
await page.waitForTimeout(300);
const full = path.join(root, 'artifacts/headline-image.png');
await page.screenshot({ path: full });
const b64 = (await import('node:fs')).readFileSync(full).toString('base64');
const out = await page.evaluate(async (src) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
  // centre-crop to 16:9
  let w = img.width, h = Math.round(w * 9 / 16); if (h > img.height) { h = img.height; w = Math.round(h * 16 / 9); }
  const sx = (img.width - w) / 2, sy = (img.height - h) / 2;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const LW = 64, LH = 36, ramp = (v) => Math.round(Math.round(v / 255 * 7) / 7 * 255);
  const small = document.createElement('canvas'); small.width = LW; small.height = LH; const sc = small.getContext('2d'); const id = sc.createImageData(LW, LH);
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) {
    const x0 = Math.floor(i * w / LW), x1 = Math.floor((i + 1) * w / LW), y0 = Math.floor(j * h / LH), y1 = Math.floor((j + 1) * h / LH);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let xx = x0; xx < x1; xx++) { const o = (y * w + xx) * 4; r += d[o]; g += d[o + 1]; b += d[o + 2]; n++; }
    const o = (j * LW + i) * 4; id.data[o] = ramp(r / n); id.data[o + 1] = ramp(g / n); id.data[o + 2] = ramp(b / n); id.data[o + 3] = 255;
  }
  sc.putImageData(id, 0, 0);
  const big = document.createElement('canvas'); big.width = 1920; big.height = 1080; const bc = big.getContext('2d'); bc.imageSmoothingEnabled = false; bc.drawImage(small, 0, 0, 1920, 1080);
  const og = document.createElement('canvas'); og.width = 1200; og.height = 675; const oc = og.getContext('2d'); oc.imageSmoothingQuality = 'high'; oc.drawImage(img, 0, 0, 1200, 675);
  const fav = document.createElement('canvas'); fav.width = 64; fav.height = 64; const fc = fav.getContext('2d');
  const svg = new Image(); svg.src = '/favicon.svg';
  return { led: big.toDataURL('image/png'), og: og.toDataURL('image/png') };
}, b64);
const fs = await import('node:fs');
fs.writeFileSync(path.join(root, 'artifacts/headline-image.led-preview.png'), Buffer.from(out.led.split(',')[1], 'base64'));
fs.writeFileSync(path.join(root, 'public/og-image.png'), Buffer.from(out.og.split(',')[1], 'base64'));
// favicon png from the svg
const fp = await browser.newPage({ viewport: { width: 64, height: 64 } });
await fp.goto(pathToFileURL(path.join(root, 'public/favicon.svg')).href);
await fp.screenshot({ path: path.join(root, 'public/favicon-64.png'), omitBackground: true });
await browser.close();
console.log('rendered cover, LED preview, og-image, favicon-64');
