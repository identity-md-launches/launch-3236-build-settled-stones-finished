import type { Cell } from './lib/formula.js';

/** Incised suit marks, one per mineral inlay. Drawn as cut lines, not icons. */
const MARKS: Record<number, string> = {
  0: 'M12 5a7 7 0 1 0 0.01 0Z', // Jade: ring
  1: 'M4 15l4-5 4 5 4-5 4 5', // Lapis: wave
  2: 'M12 4l7 8-7 8-7-8Z', // Garnet: lozenge
  3: 'M12 4v16M4 12h16M7 7l10 10M17 7 7 17', // Amber: star
};

export function SuitMark({ suit }: { suit: number }) {
  return (
    <svg className="mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={MARKS[suit]} />
    </svg>
  );
}

/** Small preview of a stone's shape. */
export function StoneGlyph({ cells, suit, label }: { cells: Cell[]; suit: number; label?: string }) {
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const h = Math.max(...cells.map((c) => c[1])) + 1;
  return (
    <span className="glyph" style={{ gridTemplateColumns: `repeat(${w}, 1fr)`, aspectRatio: `${w} / ${h}`, width: `${w * 1.05}rem` }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {cells.map(([x, y]) => (
        <span key={`${x},${y}`} className={`stone suit-${suit}`} style={{ gridColumn: x + 1, gridRow: y + 1 }} />
      ))}
    </span>
  );
}
