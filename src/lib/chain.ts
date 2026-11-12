// Minimal, read-only SqueekCore reader. bigint only. No wallet, no SDK.
import { CHAIN_ID_HEX, PAGE_MAX, PROXY, RPCS, TABLE_SIZE, WINDOW } from './official';

// Selectors from abi/SqueekCore.json
const SEL_STATE = '0xc19d93fb'; // state()
const SEL_ROUND_PAGE = '0xc8b9e08f'; // roundPage(uint64,uint64,uint256)

export interface CoreState {
  settledThroughRound: bigint;
  cumulativeWork: bigint;
  blockHeight: bigint;
  paused: boolean;
}
export interface Round {
  roundId: bigint;
  work: bigint;
  dataHash: string;
}
interface Page {
  certifiedThroughRound: bigint;
  startWork: bigint;
  rounds: { roundId: bigint; cumulativeWork: bigint; dataHash: string }[];
}

const CUSTOM_KEY = 'settled-stones:custom-rpc';
export function customRpc(): string | null {
  try { return localStorage.getItem(CUSTOM_KEY); } catch { return null; }
}
export function setCustomRpc(url: string | null) {
  try { if (url) localStorage.setItem(CUSTOM_KEY, url); else localStorage.removeItem(CUSTOM_KEY); } catch { /* storage off */ }
}

const verified = new Set<string>();
let preferred = 0;

async function post(url: string, method: string, params: unknown[], signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal,
  });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`${new URL(url).host}: ${body.error.message ?? 'RPC error'}`);
  return body.result;
}

function endpoints(): string[] {
  const list = [...RPCS];
  const c = customRpc();
  if (c) list.push(c);
  return list;
}

/** eth_call against the official proxy, trying RPCs in order. Each RPC must report Sepolia first. */
export async function ethCall(data: string, signal?: AbortSignal): Promise<string> {
  const list = endpoints();
  const order = [...list.slice(preferred), ...list.slice(0, preferred)];
  let lastErr: unknown = null;
  for (const url of order) {
    try {
      if (!verified.has(url)) {
        const id = await post(url, 'eth_chainId', [], signal);
        if (String(id).toLowerCase() !== CHAIN_ID_HEX) throw new Error(`${new URL(url).host} is not Sepolia`);
        verified.add(url);
      }
      const out = await post(url, 'eth_call', [{ to: PROXY, data }, 'latest'], signal);
      preferred = list.indexOf(url);
      return String(out);
    } catch (e) {
      if (signal?.aborted) throw e;
      lastErr = e;
    }
  }
  throw new Error(`Every Sepolia RPC failed${lastErr instanceof Error ? ` (${lastErr.message})` : ''}`);
}

function words(hex: string): bigint[] {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 64 !== 0 || h.length === 0) throw new Error('Malformed ABI response');
  const out: bigint[] = [];
  for (let i = 0; i < h.length; i += 64) out.push(BigInt('0x' + h.slice(i, i + 64)));
  return out;
}
const u256 = (v: bigint) => v.toString(16).padStart(64, '0');
const hash32 = (v: bigint) => '0x' + v.toString(16).padStart(64, '0');

export async function readState(signal?: AbortSignal): Promise<CoreState> {
  const w = words(await ethCall(SEL_STATE, signal));
  if (w.length < 8) throw new Error('Malformed state() response');
  return { settledThroughRound: w[0], cumulativeWork: w[1], blockHeight: w[3], paused: w[7] !== 0n };
}

// Certified pages are final: cache them by (proxy, after, through).
const PAGE_CACHE = 'settled-stones:page:v1:';
const memCache = new Map<string, Page>();
function cacheKey(after: bigint, through: bigint) { return `${PAGE_CACHE}${PROXY}:${after}:${through}`; }
function loadCached(after: bigint, through: bigint): Page | null {
  const k = cacheKey(after, through);
  const m = memCache.get(k);
  if (m) return m;
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const j = JSON.parse(raw);
    const p: Page = {
      certifiedThroughRound: BigInt(j.c), startWork: BigInt(j.s),
      rounds: j.r.map((r: [string, string, string]) => ({ roundId: BigInt(r[0]), cumulativeWork: BigInt(r[1]), dataHash: r[2] })),
    };
    memCache.set(k, p);
    return p;
  } catch { return null; }
}
function storeCached(after: bigint, through: bigint, p: Page) {
  const k = cacheKey(after, through);
  memCache.set(k, p);
  try {
    localStorage.setItem(k, JSON.stringify({
      c: p.certifiedThroughRound.toString(), s: p.startWork.toString(),
      r: p.rounds.map((r) => [r.roundId.toString(), r.cumulativeWork.toString(), r.dataHash]),
    }));
  } catch { /* storage full or off: memory cache only */ }
}

/** One roundPage(after, through, 16) call. Caller guarantees through <= frontier. */
export async function roundPage(after: bigint, through: bigint, signal?: AbortSignal): Promise<Page> {
  const cached = loadCached(after, through);
  if (cached) return cached;
  const data = SEL_ROUND_PAGE + u256(after) + u256(through) + u256(PAGE_MAX);
  const w = words(await ethCall(data, signal));
  // w[0] = offset of the tuple (0x20). Tuple head at word 1.
  const base = Number(w[0] / 32n);
  const certifiedThroughRound = w[base];
  const startWork = w[base + 1];
  const arr = base + Number(w[base + 7] / 32n);
  const len = Number(w[arr]);
  if (len > 16) throw new Error('roundPage returned more than 16 records');
  const rounds = [] as Page['rounds'];
  for (let i = 0; i < len; i++) {
    const o = arr + 1 + i * 5;
    rounds.push({ roundId: w[o], cumulativeWork: w[o + 1], dataHash: hash32(w[o + 4]) });
  }
  const page = { certifiedThroughRound, startWork, rounds };
  if (certifiedThroughRound >= through) storeCached(after, through, page);
  return page;
}

/**
 * All official active rounds in (after, through], oldest first.
 * Work = cumulativeWork - start (first listed) then minus the previous listed checkpoint.
 * Continues while certifiedThroughRound < through.
 */
export async function activeRounds(after: bigint, through: bigint, signal?: AbortSignal): Promise<{ rounds: Round[]; certifiedThrough: bigint }> {
  const out: Round[] = [];
  let cursor = after;
  let certifiedThrough = after;
  while (cursor < through) {
    const end = cursor + PAGE_MAX < through ? cursor + PAGE_MAX : through;
    const page = await roundPage(cursor, end, signal);
    let prev = page.startWork;
    for (const r of page.rounds) {
      const work = r.cumulativeWork - prev;
      prev = r.cumulativeWork;
      if (r.roundId <= cursor || r.roundId > end) continue;
      if (work > 0n && !/^0x0+$/.test(r.dataHash)) out.push({ roundId: r.roundId, work, dataHash: r.dataHash });
    }
    if (page.certifiedThroughRound >= end) {
      certifiedThrough = end;
      cursor = end;
    } else {
      const next = page.rounds.length ? page.rounds[page.rounds.length - 1].roundId : page.certifiedThroughRound;
      certifiedThrough = page.certifiedThroughRound;
      if (next <= cursor) break; // nothing more is certified yet
      cursor = next;
    }
  }
  return { rounds: out, certifiedThrough };
}

/**
 * Today's official table: page the last 144 certified rounds (newest chunk first) and keep the
 * newest 8 official active rounds. Only if fewer than 8 exist there, keep paging back to round 0.
 * Returned oldest first.
 */
export async function todaysRounds(frontier: bigint, onProgress?: (scannedFrom: bigint) => void, signal?: AbortSignal): Promise<Round[]> {
  const found: Round[] = [];
  let hi = frontier;
  const windowFloor = frontier > WINDOW ? frontier - WINDOW : 0n;
  while (hi > 0n && found.length < TABLE_SIZE) {
    const lo = hi > PAGE_MAX ? hi - PAGE_MAX : 0n;
    onProgress?.(lo < windowFloor ? lo : lo);
    const { rounds } = await activeRounds(lo, hi, signal);
    found.unshift(...rounds);
    hi = lo;
  }
  return found.slice(-TABLE_SIZE);
}

/** Load exact official rounds by id (shared tables). Throws if any id is not an official active round. */
export async function roundsById(ids: bigint[], frontier: bigint, signal?: AbortSignal): Promise<Round[]> {
  const out: Round[] = [];
  for (const id of ids) {
    if (id > frontier) throw new Error(`Round ${id} is past the settled frontier ${frontier}`);
    if (id < 1n) throw new Error('Round ids start at 1');
    const { rounds } = await activeRounds(id - 1n, id, signal);
    const r = rounds.find((x) => x.roundId === id);
    if (!r) throw new Error(`Round ${id} is not an official active round`);
    out.push(r);
  }
  return out;
}
