// Run: node --test test/formula.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { tileFor, tableSeal, sealText, orient, FAMILIES } from '../src/lib/formula.js';

const R1212 = { roundId: 1212n, work: 80n, dataHash: '0xf92e09fa2841de7ce610da44324b09a22acfef747dc89875ea1d6b4852b167a9' };

test('official round 1212 is size 4, family O (index 1 of n=4)', () => {
  const t = tileFor(R1212.roundId, R1212.work, R1212.dataHash);
  assert.equal(t.size, 4);
  assert.equal(t.family, 'O');
  assert.equal(t.familyIndex, 1);
  assert.equal(t.steers, true);
  assert.deepEqual(t.cells, [[0, 0], [1, 0], [0, 1], [1, 1]]);
  // b1 = 0x2e = 46, 46 % 4 = 2
  assert.equal(t.suit, 'Garnet');
});

test('one-line table of 1212 seals to deb98f44', async () => {
  assert.equal(sealText([R1212]), '1212:0xf92e09fa2841de7ce610da44324b09a22acfef747dc89875ea1d6b4852b167a9');
  assert.equal(await tableSeal([R1212]), 'deb98f44');
});

test('seal orders by increasing roundId, newline joined, no trailing newline', () => {
  const a = { roundId: 1210n, dataHash: '0x' + 'ab'.repeat(32) };
  assert.equal(sealText([R1212, a]), `1210:${a.dataHash}\n1212:${R1212.dataHash}`);
});

test('size rules: work < 40 gives 1..3, work >= 40 gives 4..5', () => {
  const h = '0x' + '01'.repeat(32);
  assert.equal(tileFor(5n, 39n, h).size, 1);
  assert.equal(tileFor(5n, 1n, h).size, 2);
  assert.equal(tileFor(5n, 2n, h).size, 3);
  assert.equal(tileFor(5n, 40n, h).size, 4);
  assert.equal(tileFor(5n, 41n, h).size, 5);
});

test('rejects non-bigint input and inactive rounds', () => {
  assert.throws(() => tileFor(1212, 80n, R1212.dataHash));
  assert.throws(() => tileFor(1n, 0n, R1212.dataHash));
  assert.throws(() => tileFor(1n, 5n, '0x' + '00'.repeat(32)));
});

test('orient keeps cell count and normalises to origin', () => {
  for (const fams of Object.values(FAMILIES)) for (const f of fams) for (let q = 0; q < 4; q++) for (const fl of [false, true]) {
    const o = orient(f.cells, q, fl);
    assert.equal(o.length, f.cells.length);
    assert.equal(Math.min(...o.map((c) => c[0])), 0);
    assert.equal(Math.min(...o.map((c) => c[1])), 0);
  }
});
