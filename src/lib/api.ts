// Read-only client for https://api.squeekchain.com. GET only, no key.
// Unavailable means unknown: never zero, never settled.
import { API_BASE, PROXY } from './official';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; reason: string; retryAfterMs?: number };

const etags = new Map<string, { etag: string; body: unknown }>();
const blockedUntil = new Map<string, number>();

async function getJson(path: string): Promise<ApiResult<unknown>> {
  const until = blockedUntil.get(path) ?? 0;
  if (Date.now() < until) return { ok: false, reason: 'waiting for Retry-After', retryAfterMs: until - Date.now() };
  const prior = etags.get(path);
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { headers: prior ? { 'If-None-Match': prior.etag } : {}, redirect: 'error' });
  } catch {
    return { ok: false, reason: 'API unreachable' };
  }
  if (res.status === 304 && prior) return { ok: true, data: prior.body };
  if (res.status === 429 || res.status === 503) {
    const ra = res.headers.get('Retry-After');
    const secs = ra && /^\d+$/.test(ra) ? Number(ra) : 60;
    blockedUntil.set(path, Date.now() + secs * 1000);
    return { ok: false, reason: `API asked to retry after ${secs}s`, retryAfterMs: secs * 1000 };
  }
  if (!res.ok) return { ok: false, reason: `API answered ${res.status}` };
  try {
    const body = await res.json();
    const etag = res.headers.get('ETag');
    if (etag) etags.set(path, { etag, body });
    return { ok: true, data: body };
  } catch {
    return { ok: false, reason: 'API sent unreadable JSON' };
  }
}

const NOT_SETTLED = /projected|queued|provisional|optimistic|pending/i;
const TX_RE = /^0x[0-9a-fA-F]{64}$/;

function pick(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}
function asBig(v: unknown): bigint | null {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  return null;
}

export interface ApiStatus {
  coreMatches: boolean | null;
  settledThroughRound: bigint | null;
}

/** /v1/status: identities.core must match the official proxy. */
export async function fetchStatus(): Promise<ApiResult<ApiStatus>> {
  const r = await getJson('/v1/status');
  if (!r.ok) return r;
  const core = pick(r.data, 'identities', 'core');
  const coreAddr = typeof core === 'string' ? core : (pick(core, 'address') as string | undefined);
  const coreMatches = typeof coreAddr === 'string' ? coreAddr.toLowerCase() === PROXY : null;
  const settled =
    asBig(pick(r.data, 'settledThroughRound')) ??
    asBig(pick(r.data, 'core', 'settledThroughRound')) ??
    asBig(pick(r.data, 'settlement', 'settledThroughRound'));
  return { ok: true, data: { coreMatches, settledThroughRound: settled } };
}

export interface ListedTx { txHash: string; fromRound: bigint; throughRound: bigint }

/** /v1/settlements?range=24h, recentSettlements only. Entries that are not settled, or carry no real hash, are dropped. */
export async function fetchSettlements(): Promise<ApiResult<ListedTx[]>> {
  const r = await getJson('/v1/settlements?range=24h');
  if (!r.ok) return r;
  const list = pick(r.data, 'recentSettlements');
  if (!Array.isArray(list)) return { ok: true, data: [] };
  const out: ListedTx[] = [];
  for (const item of list.slice(0, 10)) {
    if (!item || typeof item !== 'object') continue;
    const status = String(pick(item, 'status') ?? pick(item, 'state') ?? '');
    if (NOT_SETTLED.test(status)) continue;
    const tx = pick(item, 'txHash') ?? pick(item, 'transactionHash') ?? pick(item, 'hash');
    if (typeof tx !== 'string' || !TX_RE.test(tx)) continue;
    const through = asBig(pick(item, 'settledThroughRound')) ?? asBig(pick(item, 'throughRound')) ?? asBig(pick(item, 'toRound'));
    const after = asBig(pick(item, 'afterRound'));
    const from = asBig(pick(item, 'fromRound')) ?? asBig(pick(item, 'firstRound')) ?? (after !== null ? after + 1n : null);
    if (through === null) continue;
    out.push({ txHash: tx.toLowerCase(), fromRound: from ?? through, throughRound: through });
  }
  return { ok: true, data: out };
}

export function txForRound(list: ListedTx[] | null, roundId: bigint): string | null {
  if (!list) return null;
  const hit = list.find((t) => roundId >= t.fromRound && roundId <= t.throughRound);
  return hit ? hit.txHash : null;
}
