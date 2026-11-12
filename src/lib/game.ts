import { orient, type Cell, type Tile } from './formula.js';
import { BOARD } from './official';

export interface GameState {
  /** board[y*9+x] = index of the tile occupying it, or -1 */
  board: number[];
  /** per tile: 'hand' | 'placed' | 'missed' */
  fate: ('hand' | 'placed' | 'missed')[];
  discardUsed: boolean;
  finished: boolean;
}

export function newGame(tileCount: number): GameState {
  return { board: Array(BOARD * BOARD).fill(-1), fate: Array(tileCount).fill('hand'), discardUsed: false, finished: false };
}
export function growGame(g: GameState, tileCount: number): GameState {
  if (g.fate.length >= tileCount) return g;
  return { ...g, fate: [...g.fate, ...Array(tileCount - g.fate.length).fill('hand')] };
}

export function currentIndex(g: GameState): number {
  if (g.finished) return -1;
  return g.fate.indexOf('hand');
}

/** Pivot = cell nearest the centre of the oriented shape, so the stone sits under the finger. */
export function pivot(cells: Cell[]): Cell {
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const h = Math.max(...cells.map((c) => c[1])) + 1;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  let best = cells[0], bd = Infinity;
  for (const c of cells) {
    const d = (c[0] - cx) ** 2 + (c[1] - cy) ** 2;
    if (d < bd - 1e-9) { bd = d; best = c; }
  }
  return best;
}

export function footprint(tile: Tile, quarter: number, flipped: boolean, anchor: Cell): Cell[] {
  const cells = orient(tile.cells, quarter, flipped);
  const p = pivot(cells);
  return cells.map(([x, y]) => [x - p[0] + anchor[0], y - p[1] + anchor[1]]);
}

export type Verdict = { ok: true } | { ok: false; why: 'edge' | 'occupied' };
export function check(g: GameState, cells: Cell[]): Verdict {
  for (const [x, y] of cells) if (x < 0 || y < 0 || x >= BOARD || y >= BOARD) return { ok: false, why: 'edge' };
  for (const [x, y] of cells) if (g.board[y * BOARD + x] !== -1) return { ok: false, why: 'occupied' };
  return { ok: true };
}

/** True if the tile fits anywhere in any orientation. */
export function fitsAnywhere(g: GameState, tile: Tile): boolean {
  for (let q = 0; q < 4; q++) for (const f of [false, true]) for (let y = 0; y < BOARD; y++) for (let x = 0; x < BOARD; x++) {
    if (check(g, footprint(tile, q, f, [x, y])).ok) return true;
  }
  return false;
}

export function place(g: GameState, idx: number, cells: Cell[]): GameState {
  const board = [...g.board];
  for (const [x, y] of cells) board[y * BOARD + x] = idx;
  const fate = [...g.fate];
  fate[idx] = 'placed';
  return { ...g, board, fate };
}
export function discard(g: GameState, idx: number, useDiscard: boolean): GameState {
  const fate = [...g.fate];
  fate[idx] = 'missed';
  return { ...g, fate, discardUsed: g.discardUsed || useDiscard };
}

export function score(g: GameState) {
  const cells = g.board.filter((v) => v !== -1).length;
  let lines = 0;
  for (let i = 0; i < BOARD; i++) {
    let row = true, col = true;
    for (let j = 0; j < BOARD; j++) {
      if (g.board[i * BOARD + j] === -1) row = false;
      if (g.board[j * BOARD + i] === -1) col = false;
    }
    if (row) lines++;
    if (col) lines++;
  }
  return { cells, lines, total: cells + 9 * lines };
}

/** Starting spot for a stone in hand: the legal anchor nearest the centre, unrotated; centre if none. */
export function startAnchor(g: GameState, tile: Tile): Cell {
  const c = (BOARD - 1) / 2;
  const spots: Cell[] = [];
  for (let y = 0; y < BOARD; y++) for (let x = 0; x < BOARD; x++) spots.push([x, y]);
  spots.sort((a, b) => (a[0] - c) ** 2 + (a[1] - c) ** 2 - ((b[0] - c) ** 2 + (b[1] - c) ** 2) || a[1] - b[1] || a[0] - b[0]);
  for (const s of spots) if (check(g, footprint(tile, 0, false, s)).ok) return s;
  return [4, 4];
}
