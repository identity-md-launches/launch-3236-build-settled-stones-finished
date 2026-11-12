export type Cell = [number, number];
export interface Family { name: string; cells: Cell[] }
export const FAMILIES: Record<1 | 2 | 3 | 4 | 5, Family[]>;
export const SUITS: readonly ['Jade', 'Lapis', 'Garnet', 'Amber'];
export const STEER_WORK: bigint;
export interface Tile {
  roundId: bigint; work: bigint; dataHash: string; size: number; steers: boolean;
  familyIndex: number; family: string; cells: Cell[]; suitIndex: number; suit: string;
}
export function tileFor(roundId: bigint, work: bigint, dataHash: string): Tile;
export function sealText(rounds: { roundId: bigint; dataHash: string }[]): string;
export function tableSeal(rounds: { roundId: bigint; dataHash: string }[]): Promise<string>;
export function orient(cells: Cell[], quarter: number, flipped: boolean): Cell[];
