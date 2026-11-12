// Node 24+; exercises the production client with controlled HTTP responses and time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const dataUrl = (text) => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const official = dataUrl(stripTypeScriptTypes(await readFile(new URL('../src/lib/official.ts', import.meta.url), 'utf8')));
const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/api.ts', import.meta.url), 'utf8')).replace("'./official'", JSON.stringify(official));
let instance = 0;
const load = () => import(dataUrl(source + `\n// isolated client ${instance++}`));
const proxy = '0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4';

test('HTTP-date Retry-After blocks status AND settlement refreshes until their deadlines', async () => {
  const api = await load();
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  let now = Date.parse('2026-11-12T12:00:00Z');
  const requests = [];
  Date.now = () => now;
  globalThis.fetch = async url => {
    requests.push(url);
    return new Response('', { status: 503, headers: { 'Retry-After': 'Thu, 12 Nov 2026 12:05:00 GMT' } });
  };
  try {
    assert.equal((await api.fetchStatus()).retryAfterMs, 300000);
    assert.equal((await api.fetchSettlements()).retryAfterMs, 300000);
    now += 61000;
    assert.equal((await api.fetchStatus()).retryAfterMs, 239000);
    assert.equal((await api.fetchSettlements()).retryAfterMs, 239000);
    assert.equal(requests.length, 2, 'Neither polling nor refresh may bypass Retry-After');
    now += 238999;
    await api.fetchStatus(); await api.fetchSettlements();
    assert.equal(requests.length, 2);
    now++;
    await api.fetchStatus(); await api.fetchSettlements();
    assert.equal(requests.length, 4, 'Both endpoints can retry at the deadline');
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test('Retry-After supports seconds, past dates, zero, and a safe fallback for malformed values', async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  Date.now = () => Date.parse('2026-11-12T12:00:00Z');
  try {
    for (const [header, expected] of [['300', 300000], ['0', 0], ['Thu, 12 Nov 2026 11:59:00 GMT', 0], ['invalid', 60000], [null, 60000]]) {
      const api = await load();
      globalThis.fetch = async () => new Response('', { status: 429, headers: header === null ? {} : { 'Retry-After': header } });
      assert.equal((await api.fetchStatus()).retryAfterMs, expected, String(header));
    }
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test('ETag / 304 retains the verified status; identity must positively match', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const api = await load();
    globalThis.fetch = async () => new Response(JSON.stringify({ identities: { core: proxy }, settledThroughRound: '1248' }), { headers: { ETag: '"one"' } });
    assert.deepEqual((await api.fetchStatus()).data, { coreMatches: true, settledThroughRound: 1248n });
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.headers['If-None-Match'], '"one"');
      return new Response(null, { status: 304 });
    };
    assert.equal((await api.fetchStatus()).data.coreMatches, true);
    for (const [identities, expected] of [[undefined, null], [{}, null], [{ core: { address: proxy.toUpperCase() } }, true], [{ core: 'different core' }, false]]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ identities }));
      assert.equal((await api.fetchStatus()).data.coreMatches, expected);
    }
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal((await api.fetchStatus()).ok, false);
  } finally { globalThis.fetch = originalFetch; }
});
