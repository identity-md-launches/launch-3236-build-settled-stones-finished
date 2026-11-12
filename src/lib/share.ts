import { PROXY, TABLE_SIZE } from './official';

export type ShareParse = { kind: 'none' } | { kind: 'invalid'; reason: string } | { kind: 'table'; ids: bigint[] };

const RE = /^#table=v1,11155111,(0x[0-9a-f]{40}),([1-9][0-9]{0,18}(?:,[1-9][0-9]{0,18}){0,7})$/;

/** Parses only the exact share format. Anything else is ignored or rejected; nothing is executed. */
export function parseShare(hash: string): ShareParse {
  if (!hash || hash === '#') return { kind: 'none' };
  if (!hash.startsWith('#table=')) return { kind: 'none' };
  const m = RE.exec(hash);
  if (!m) return { kind: 'invalid', reason: 'That share link is not in the v1 table format.' };
  if (m[1] !== PROXY) return { kind: 'invalid', reason: 'That share link names a different SqueekCore proxy.' };
  const ids = m[2].split(',').map((s) => BigInt(s));
  if (ids.length > TABLE_SIZE) return { kind: 'invalid', reason: 'A table holds at most 8 stones.' };
  for (let i = 1; i < ids.length; i++) if (ids[i] <= ids[i - 1]) return { kind: 'invalid', reason: 'Round ids in a share link must increase.' };
  return { kind: 'table', ids };
}

export function shareHash(ids: bigint[]): string {
  return `#table=v1,11155111,${PROXY},${ids.map(String).join(',')}`;
}
