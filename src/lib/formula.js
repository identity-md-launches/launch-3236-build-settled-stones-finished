// Settled Stones tile formula. Pure function of official (roundId, work, dataHash).
// bigint only for chain numbers. Shared by the game, the Inspect panel and test/formula.test.js.

/** Canonical cells per size, in the fixed family order. [x, y] pairs. */
export const FAMILIES = {
  1: [{ name: 'A', cells: [[0, 0]] }],
  2: [{ name: 'A', cells: [[0, 0], [1, 0]] }],
  3: [
    { name: 'I', cells: [[0, 0], [1, 0], [2, 0]] },
    { name: 'L', cells: [[0, 0], [1, 0], [1, 1]] },
  ],
  4: [
    { name: 'I', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
    { name: 'O', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    { name: 'T', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
    { name: 'L', cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
    { name: 'S', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  ],
  5: [
    { name: 'I', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
    { name: 'L', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]] },
    { name: 'U', cells: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },
    { name: 'T', cells: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] },
    { name: 'V', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
    { name: 'W', cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]] },
    { name: 'X', cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
    { name: 'P', cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] },
  ],
};

/** Four named mineral inlays. Suit index = second byte of dataHash % 4. */
export const SUITS = ['Jade', 'Lapis', 'Garnet', 'Amber'];

export const STEER_WORK = 40n;
const HASH_RE = /^0x[0-9a-f]{64}$/;

/**
 * @param {bigint} roundId
 * @param {bigint} work
 * @param {string} dataHash 0x + 64 hex
 */
export function tileFor(roundId, work, dataHash) {
  if (typeof roundId !== 'bigint' || typeof work !== 'bigint') throw new TypeError('roundId and work must be bigint');
  const hash = String(dataHash).toLowerCase();
  if (!HASH_RE.test(hash)) throw new TypeError('dataHash must be 0x + 64 hex');
  if (work <= 0n || /^0x0+$/.test(hash)) throw new RangeError('not an official active round');
  const b0 = BigInt(parseInt(hash.slice(2, 4), 16));
  const b1 = BigInt(parseInt(hash.slice(4, 6), 16));
  const steers = work >= STEER_WORK;
  const size = steers ? 4 + Number(work % 2n) : 1 + Number(work % 3n);
  const list = FAMILIES[size];
  const familyIndex = Number((b0 + roundId) % BigInt(list.length));
  const suitIndex = Number(b1 % 4n);
  return {
    roundId,
    work,
    dataHash: hash,
    size,
    steers,
    familyIndex,
    family: list[familyIndex].name,
    cells: list[familyIndex].cells.map(([x, y]) => [x, y]),
    suitIndex,
    suit: SUITS[suitIndex],
  };
}

/** The exact text that is hashed for the table seal. */
export function sealText(rounds) {
  return [...rounds]
    .sort((a, b) => (a.roundId < b.roundId ? -1 : a.roundId > b.roundId ? 1 : 0))
    .map((r) => `${r.roundId.toString()}:${String(r.dataHash).toLowerCase()}`)
    .join('\n');
}

/** First 8 lowercase hex of SHA-256 (Web Crypto) of sealText. */
export async function tableSeal(rounds) {
  const bytes = new TextEncoder().encode(sealText(rounds));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest).slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Rotate a cell list by quarter turns (0..3) and optional mirror, normalised to origin. */
export function orient(cells, quarter, flipped) {
  let pts = cells.map(([x, y]) => [flipped ? -x : x, y]);
  for (let i = 0; i < ((quarter % 4) + 4) % 4; i++) pts = pts.map(([x, y]) => [-y, x]);
  const minX = Math.min(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  return pts.map(([x, y]) => [x - minX, y - minY]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
