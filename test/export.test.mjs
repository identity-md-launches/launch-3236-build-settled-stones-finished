import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

test('required finished cover files are shipped as 1920x1080 PNGs, each under 4 MB', async () => {
  for (const filename of ['headline-image.png', 'headline-image.led-preview.png']) {
    const png = await readFile(new URL('../artifacts/' + filename, import.meta.url));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.ok(width >= 1920 && height >= 1080, filename);
    assert.equal(width * 9, height * 16);
    assert.ok(png.byteLength < 4000000, filename);
  }
});

test('production export retains exact metadata and every relative asset exists', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('<title>Settled Stones: every official settled round is a stone</title>'));
  assert.ok(html.includes('A table game for the Squeekchain community. Every official settled round is a stone. No wallet, no token, community project.'));
  assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /rel="icon"/);
  const assets = [...html.matchAll(/(?:src|href|content)="(\.\/[^\"]+)"/g)].map(match => match[1]);
  assert.ok(assets.length >= 4);
  for (const asset of assets) await access(new URL('../dist/' + asset, import.meta.url));
});
