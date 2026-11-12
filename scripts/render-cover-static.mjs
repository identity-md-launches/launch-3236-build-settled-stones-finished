// Optional browser-free renderer of the same SVG artwork as render-cover.mjs.
// Requires jsdom and sharp; module entry points may be supplied by IMD_JSDOM / IMD_SHARP.
// The 8-step RGB preview is an approximation, NOT a verified official Code ramp.
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = await import(process.env.IMD_JSDOM ? pathToFileURL(process.env.IMD_JSDOM).href : 'jsdom');
const { default: sharp } = await import(process.env.IMD_SHARP ? pathToFileURL(process.env.IMD_SHARP).href : 'sharp');
// Only the project's own vector drawing is executed. No URL or user input is loaded.
const dom = new JSDOM(await readFile(path.join(root, 'scripts/cover.html'), 'utf8'), { runScripts: 'dangerously' });
const svg = dom.window.document.querySelector('svg').outerHTML;
dom.window.close();
await mkdir(path.join(root, 'artifacts'), { recursive: true });
const cover = path.join(root, 'artifacts/headline-image.png');
await sharp(Buffer.from(svg)).flatten({ background: '#0e0b08' }).png().toFile(cover);

const { data, info } = await sharp(cover).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const width = 64, height = 36;
const small = Buffer.alloc(width * height * 3);
const ramp = (value) => Math.round(Math.round(value / 255 * 7) / 7 * 255);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const sums = [0, 0, 0];
  let count = 0;
  const x0 = Math.floor(x * info.width / width), x1 = Math.floor((x + 1) * info.width / width);
  const y0 = Math.floor(y * info.height / height), y1 = Math.floor((y + 1) * info.height / height);
  for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
    const offset = (sy * info.width + sx) * info.channels;
    for (let channel = 0; channel < 3; channel++) sums[channel] += data[offset + channel];
    count++;
  }
  for (let channel = 0; channel < 3; channel++) small[(y * width + x) * 3 + channel] = ramp(sums[channel] / count);
}
await sharp(small, { raw: { width, height, channels: 3 } })
  .resize(1920, 1080, { kernel: 'nearest' }).png()
  .toFile(path.join(root, 'artifacts/headline-image.led-preview.png'));
await sharp(cover).resize(1200, 675).png().toFile(path.join(root, 'public/og-image.png'));
console.log('Rendered headline-image.png, headline-image.led-preview.png and og-image.png. Code ramp remains unverified.');
