// Offline DOM interactions against the production bundle, not a browser/layout test.
// Optional test tools: jsdom and @sinonjs/fake-timers. See README for installation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
const { JSDOM } = await import(process.env.IMD_JSDOM ? pathToFileURL(process.env.IMD_JSDOM).href : 'jsdom');
const { default: FakeTimers } = await import(process.env.IMD_FAKE_TIMERS ? pathToFileURL(process.env.IMD_FAKE_TIMERS).href : '@sinonjs/fake-timers');

const proxy = '0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4';
const share = '#table=v1,11155111,' + proxy + ',1212';
const tx = '0x' + 'a'.repeat(64); // Deliberately synthetic API test data, never production.
const freshTx = '0x' + 'b'.repeat(64);
const matchingStatus = { identities: { core: proxy }, settledThroughRound: '1248' };
const mismatch = { identities: { core: '0x' + '1'.repeat(40) }, settledThroughRound: '1248' };
const fixtures = JSON.parse(await readFile(new URL('./fixtures/sepolia-rpc.json', import.meta.url), 'utf8'));
const dir = process.argv[2] || 'dist';
const html = await readFile(dir + '/index.html', 'utf8');
const js = await readFile(dir + '/' + html.match(/src="\.\/([^\"]+\.js)"/)[1], 'utf8');
const css = await readFile(dir + '/' + html.match(/href="\.\/([^\"]+\.css)"/)[1], 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const listed = (hash = tx) => ({ recentSettlements: [{ status: 'settled', txHash: hash, fromRound: '1212', throughRound: '1212' }] });

async function setup(t, options = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost/' + (options.hash ?? share), runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  assert.equal(d.querySelectorAll('.board .cell').length, 81, 'Board is present before executing the bundle');
  const style = d.createElement('style'); style.textContent = css; d.head.append(style);
  w.TextEncoder = TextEncoder; w.AbortController = AbortController;
  Object.defineProperty(w.crypto, 'subtle', { value: webcrypto.subtle });
  const clock = FakeTimers.withGlobal(w).install({ now: Date.parse('2026-11-12T12:00:00Z'), toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  t.after(() => { clock.uninstall(); w.close(); });
  const ctl = { frontier: 1248, status: matchingStatus, statusGate: null, stateGate: null, settlements: () => listed(), rpcFails: false, requests: [], clipboard: [], ...options };
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => { ctl.clipboard.push(text); } } });
  w.fetch = async (url, opts = {}) => {
    ctl.requests.push({ url, time: clock.now, body: opts.body });
    if (url.includes('/v1/status')) {
      if (ctl.statusGate) await ctl.statusGate;
      if (ctl.status instanceof Error) throw ctl.status;
      return new Response(JSON.stringify(ctl.status));
    }
    if (url.includes('/v1/settlements')) return new Response(JSON.stringify(await ctl.settlements()));
    assert.ok(['https://ethereum-sepolia-rpc.publicnode.com', 'https://1rpc.io/sepolia', 'https://sepolia.gateway.tenderly.co', 'https://0xrpc.io/sep'].includes(url), 'Unexpected network destination');
    if (ctl.rpcFails) throw new Error('Controlled RPC failure');
    if (opts.signal?.aborted) throw new Error('Aborted');
    const body = JSON.parse(opts.body);
    if (body.method === 'eth_call') assert.equal(body.params[0].to, proxy);
    let result = fixtures[JSON.stringify([body.method, body.params])];
    assert.ok(result, 'Missing recorded RPC response: ' + JSON.stringify(body));
    if (body.method === 'eth_call' && body.params[0].data === '0xc19d93fb') {
      const frontier = ctl.frontier;
      if (ctl.stateGate) await ctl.stateGate;
      if (opts.signal?.aborted) throw new Error('Aborted');
      result = '0x' + frontier.toString(16).padStart(64, '0') + result.slice(66);
    } else if (body.method === 'eth_call') {
      const through = BigInt('0x' + body.params[0].data.slice(74, 138));
      assert.ok(through <= BigInt(ctl.frontier), 'No roundPage past the frontier');
    }
    return new Response(JSON.stringify({ result }));
  };
  const settle = async (milliseconds = 1) => {
    await clock.tickAsync(milliseconds);
    for (let i = 0; i < 6; i++) { await clock.tickAsync(1); await new Promise(r => setTimeout(r, 3)); }
  };
  const button = name => [...d.querySelectorAll('button')].find(b => b.textContent === name);
  const click = async name => { const b = button(name); assert.ok(b, 'Missing button ' + name); b.click(); await settle(); };
  const hasTx = (hash = tx) => [...d.querySelectorAll('.inspect button')].some(b => b.textContent === hash);
  w.eval(js); await settle();
  return { w, d, ctl, clock, settle, button, click, hasTx };
}

test('delayed mismatched status never authorizes an early settlement response', async t => {
  const gate = deferred();
  const s = await setup(t, { status: mismatch, statusGate: gate.promise });
  assert.equal(s.hasTx(), false);
  assert.equal(s.ctl.requests.filter(r => r.url.includes('/v1/settlements')).length, 0);
  gate.resolve(); await s.settle();
  assert.equal(s.hasTx(), false);
  assert.match(s.d.querySelector('.foot').textContent, /different core contract/);
  assert.match(s.d.querySelector('.inspect').textContent, /Unknown/);
});

test('missing identities.core remains unknown and cannot authorize settlements', async t => {
  const s = await setup(t, { status: { settledThroughRound: '1248' } });
  assert.equal(s.hasTx(), false);
  assert.equal(s.ctl.requests.filter(r => r.url.includes('/v1/settlements')).length, 0);
  assert.match(s.d.querySelector('.foot').textContent, /not identified its core/);
});

for (const [name, status] of [['mismatch', mismatch], ['missing identity', { settledThroughRound: '1248' }], ['unavailable', new Error('offline')]]) {
  test('previously accepted hashes are cleared when status becomes ' + name, async t => {
    const s = await setup(t);
    assert.equal(s.hasTx(), true, 'Matching core permits a listed hash');
    s.ctl.status = status;
    await s.settle(8100);
    assert.equal(s.hasTx(), false);
    assert.match(s.d.querySelector('.inspect').textContent, /Unknown/);
    const count = s.ctl.requests.filter(r => r.url.includes('/v1/settlements')).length;
    await s.click('Refresh');
    assert.equal(s.ctl.requests.filter(r => r.url.includes('/v1/settlements')).length, count, 'Refresh cannot bypass identity verification');
  });
}

test('an earlier in-flight settlement cannot restore hashes after identity changes and recovers', async t => {
  const gate = deferred();
  const s = await setup(t, { settlements: () => gate.promise });
  assert.equal(s.hasTx(), false);
  assert.equal(s.ctl.requests.filter(r => r.url.includes('/v1/settlements')).length, 1);
  s.ctl.status = mismatch; await s.settle(8100);
  s.ctl.status = matchingStatus; await s.settle(8100);
  gate.resolve(listed()); await s.settle();
  assert.equal(s.hasTx(), false, 'Recovery must not re-authorize the stale response');
  assert.equal(s.ctl.requests.filter(r => r.url.includes('/v1/settlements')).length, 1, 'Recovery still respects the minute polling limit');
  s.ctl.settlements = () => listed(freshTx);
  await s.settle(60000);
  assert.equal(s.hasTx(), false);
  assert.equal(s.hasTx(freshTx), true);
});

test('Live reads a fresh frontier, starts empty, and enables polling only after that response', async t => {
  const s = await setup(t, { hash: '', frontier: 1200 });
  assert.equal(s.d.querySelectorAll('.tray li').length, 8);
  const stateRequests = () => s.ctl.requests.filter(r => r.body && JSON.parse(r.body).params[0]?.data === '0xc19d93fb').length;
  const before = stateRequests(), gate = deferred();
  s.ctl.frontier = 1212; s.ctl.stateGate = gate.promise;
  await s.click('Live'); await s.click('Live');
  await s.settle(21000);
  assert.equal(stateRequests(), before + 1, 'Repeated clicks and timer must not start concurrent initialization');
  assert.equal(s.d.querySelectorAll('.tray li').length, 0);
  assert.match(s.d.querySelector('.status').textContent, /Reading the current SqueekCore frontier/);
  gate.resolve(); await s.settle(); s.ctl.stateGate = null;
  assert.match(s.d.querySelector('.ids').textContent, /Starts empty at round 1212/);
  await s.settle(21000);
  assert.match(s.d.querySelector('.ids').textContent, /Starts empty at round 1212/);
  assert.equal(s.d.querySelectorAll('.tray li').length, 0, 'Pre-start settlements must never be admitted');
});

test('an already-started Live table survives tab switches and admits only subsequent active rounds', async t => {
  const s = await setup(t, { hash: '', frontier: 1200 });
  await s.click('Live');
  assert.match(s.d.querySelector('.ids').textContent, /Starts empty at round 1200/);
  await s.click('Today'); s.ctl.frontier = 1212;
  await s.click('Live');
  assert.match(s.d.querySelector('.ids').textContent, /Starts empty at round 1200/);
  await s.settle(21000);
  assert.equal(s.d.querySelectorAll('.tray li').length, 5);
  assert.match(s.d.querySelector('.ids').textContent, /1201, 1209, 1210, 1211, 1212/);
  assert.match(s.d.querySelector('.ids').textContent, /fc07b605/);
});

test('Live initialization failure keeps the board and can retry with fresh state', async t => {
  const s = await setup(t, { hash: '', frontier: 1200 });
  s.ctl.rpcFails = true;
  await s.click('Live');
  assert.equal(s.d.querySelectorAll('.board .cell').length, 81);
  assert.match(s.d.querySelector('.status').textContent, /could not reach a Sepolia RPC/);
  s.ctl.rpcFails = false; s.ctl.frontier = 1212;
  await s.click('Retry');
  assert.match(s.d.querySelector('.ids').textContent, /Starts empty at round 1212/);
  assert.equal(s.d.querySelectorAll('.tray li').length, 0);
});

test('1212 seal, Inspect, keyboard placement, rejection, score, best and share still agree', async t => {
  const s = await setup(t, { status: new Error('offline') });
  const inspect = s.d.querySelector('.inspect').textContent;
  assert.match(inspect, /size 4, family O/); assert.match(inspect, /80 steers/);
  assert.ok(inspect.includes('0xf92e09fa2841de7ce610da44324b09a22acfef747dc89875ea1d6b4852b167a9'));
  const seal = s.d.querySelector('.ids .chip');
  assert.equal(seal.textContent, 'deb98f44');
  assert.equal(s.w.getComputedStyle(seal).minHeight, '44px', 'CSS minimum, not a browser pixel measurement');
  seal.click(); await s.settle(); assert.equal(s.ctl.clipboard.at(-1), 'deb98f44');
  await s.click('Copy share link'); assert.equal(s.ctl.clipboard.at(-1), 'http://localhost/' + share);
  await s.click('Rotate'); await s.click('Flip');
  assert.equal(s.button('Flip').getAttribute('aria-pressed'), 'true');
  s.d.querySelector('[data-cell="8,8"]').click(); await s.settle();
  assert.match(s.d.querySelector('.status').textContent, /runs off the table/);
  const board = s.d.querySelector('.board');
  for (let i = 0; i < 4; i++) { board.dispatchEvent(new s.w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await s.settle(); }
  for (let i = 0; i < 4; i++) { board.dispatchEvent(new s.w.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); await s.settle(); }
  board.dispatchEvent(new s.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await s.settle();
  assert.match(s.d.querySelector('.status').textContent, /Table finished: 4 points/);
  assert.equal(s.d.querySelectorAll('.board .stone').length, 4);
  assert.match(s.d.querySelector('.scoreline').textContent, /Best on this table: 4/);
  assert.equal(s.w.localStorage.getItem('settled-stones:best:' + proxy + ':1212'), '4');
});

test('Today still deals exactly eight oldest-first stones and allows one discard', async t => {
  const s = await setup(t, { hash: '', frontier: 1200 });
  assert.deepEqual([...s.d.querySelectorAll('.tray .num')].map(n => n.textContent), ['1183','1184','1185','1196','1197','1198','1199','1200']);
  await s.click('Discard once');
  assert.equal(s.button('Discard used').disabled, true);
  assert.equal(s.d.querySelectorAll('.tray .fate-missed').length, 1);
  assert.equal(s.d.querySelectorAll('.board .stone').length, 0);
  assert.equal(s.d.querySelectorAll('.tray li').length, 8);
});

test('RPC/API failure preserves the board, unknown tx state and Retry', async t => {
  const s = await setup(t, { rpcFails: true, status: new Error('offline') });
  assert.equal(s.d.querySelectorAll('.board .cell').length, 81);
  assert.ok(s.button('Retry')); assert.equal(s.hasTx(), false);
  s.ctl.rpcFails = false; await s.click('Retry');
  assert.equal(s.d.querySelector('.ids .chip').textContent, 'deb98f44');
  assert.equal(s.hasTx(), false);
});
