// Rendered regression for dealt tables. Only recorded official RPC responses are
// replayed; the API is unavailable and no external network requests are made.
// Optional: IMD_PLAYWRIGHT=/path/to/playwright/index.mjs
//           IMD_CHROMIUM_EXECUTABLE=/path/to/chrome-headless-shell
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.IMD_PLAYWRIGHT
  ? pathToFileURL(process.env.IMD_PLAYWRIGHT).href : 'playwright');
const fixtures = JSON.parse(await readFile(new URL('./fixtures/sepolia-rpc.json', import.meta.url), 'utf8'));
const proxy = '0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4';
const rpcs = new Set(['https://ethereum-sepolia-rpc.publicnode.com', 'https://1rpc.io/sepolia', 'https://sepolia.gateway.tenderly.co', 'https://0xrpc.io/sep']);
const shots = new URL('./scratch/layout/', import.meta.url);

for (const frontier of [1200]) {
  test(`dealt Today table at frontier ${frontier} fits narrow viewports`, async () => {
    const browser = await chromium.launch(process.env.IMD_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.IMD_CHROMIUM_EXECUTABLE } : {});
    try {
      const page = await browser.newPage({ viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === 'http://localhost') {
          const relative = url.pathname.replace(/^\/preview\//, '') || 'index.html';
          assert.ok(!relative.includes('..'));
          return route.fulfill({ path: new URL('../dist/' + relative, import.meta.url).pathname });
        }
        if (url.origin === 'https://api.squeekchain.com') return route.fulfill({ status: 503, body: 'Unavailable in this offline regression' });
        assert.ok(rpcs.has(url.origin), 'Unexpected network destination: ' + url.origin);
        const body = request.postDataJSON();
        let result = fixtures[JSON.stringify([body.method, body.params])];
        assert.ok(result, 'Missing official RPC fixture: ' + JSON.stringify(body));
        if (body.method === 'eth_call') {
          assert.equal(body.params[0].to, proxy);
          if (body.params[0].data === '0xc19d93fb') {
            result = '0x' + frontier.toString(16).padStart(64, '0') + result.slice(66);
          }
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) });
      });
      await page.goto('http://localhost/preview/');
      await page.locator('.controls').waitFor();
      await page.locator('.ids .chip').waitFor();
      assert.equal(await page.locator('.tray li').count(), 8);
      await mkdir(shots, { recursive: true });
      for (const width of [320, 360, 390, 899, 900, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => scrollTo(0, 0));
        if ([320, 390, 1440].includes(width)) {
          await page.screenshot({ path: new URL(`${frontier}-${width}.png`, shots).pathname, fullPage: true });
        }
        const metrics = await page.evaluate(() => {
          const controls = document.querySelector('.controls');
          const box = controls.getBoundingClientRect();
          return {
            client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
            controls: { left: box.left, right: box.right, width: box.width },
            columns: getComputedStyle(controls).gridTemplateColumns.split(' ').length,
            buttons: [...controls.querySelectorAll('button')].map(button => {
              const b = button.getBoundingClientRect();
              return { label: button.textContent, left: b.left, right: b.right, height: b.height };
            }),
          };
        });
        console.log(JSON.stringify({ frontier, width, ...metrics }));
        assert.equal(metrics.scroll, metrics.client, `No horizontal overflow at ${width}px`);
        for (const button of metrics.buttons) {
          assert.ok(button.left >= 0 && button.right <= width, `${button.label} fits at ${width}px`);
          assert.ok(button.height >= 44, `${button.label} keeps a 44px target`);
        }
      }
      await page.setViewportSize({ width: 320, height: 844 });
      // Exercise a reader's larger default text as well as the machine's font
      // fallback. Intrinsic grid minimums must not push controls off the page.
      await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; scrollTo(0, 0); });
      await page.screenshot({ path: new URL(`${frontier}-320-large-text.png`, shots).pathname, fullPage: true });
      const enlarged = await page.evaluate(() => {
        const box = document.querySelector('.controls').getBoundingClientRect();
        return { client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, controls: { left: box.left, right: box.right, width: box.width } };
      });
      console.log(JSON.stringify({ frontier, width: 320, textSize: 20, ...enlarged }));
      assert.equal(enlarged.scroll, enlarged.client, 'Dealt controls also fit with 20px reader text');
      assert.ok(enlarged.controls.right <= 320);
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
      await page.getByRole('button', { name: 'Rotate', exact: true }).tap();
      await page.getByRole('button', { name: 'Flip', exact: true }).tap();
      assert.equal(await page.getByRole('button', { name: 'Flip', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: 'Place', exact: true }).tap();
      assert.ok(await page.locator('.board .stone:not(.ghost)').count() > 0);
      await page.getByRole('button', { name: 'Discard once', exact: true }).tap();
      assert.equal(await page.getByRole('button', { name: 'Discard used' }).isDisabled(), true);
      assert.equal(await page.locator('.tray .fate-missed').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
