import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tileFor, tableSeal, orient, type Cell, type Tile } from './lib/formula.js';
import { activeRounds, customRpc, readState, roundsById, setCustomRpc, todaysRounds, type CoreState, type Round } from './lib/chain';
import { fetchSettlements, fetchStatus, txForRound, type ListedTx } from './lib/api';
import { BOARD, CHAIN_ID, PROXY, TABLE_SIZE } from './lib/official';
import { check, currentIndex, discard, fitsAnywhere, footprint, growGame, newGame, place, score, startAnchor, type GameState } from './lib/game';
import { parseShare, shareHash } from './lib/share';
import { StoneGlyph, SuitMark } from './Stone';
import { useCopy } from './useCopy';

type Mode = 'today' | 'shared' | 'live';
interface Table {
  rounds: Round[];
  tiles: Tile[];
  seal: string | null;
  note: string | null;
}
interface Play {
  game: GameState;
  quarter: number;
  flipped: boolean;
  anchor: Cell;
  reject: string | null;
  rejectTick: number;
  lastFate: string | null;
}

const LIVE_POLL_MS = 20000;
const STATUS_POLL_MS = 8000;
const SETTLE_POLL_MS = 60000;
const CENTER: Cell = [4, 4];

const freshPlay = (n: number): Play => ({ game: newGame(n), quarter: 0, flipped: false, anchor: CENTER, reject: null, rejectTick: 0, lastFate: null });
const emptyTable: Table = { rounds: [], tiles: [], seal: null, note: null };

function bestKey(ids: bigint[]) {
  return `settled-stones:best:${PROXY}:${ids.join(',')}`;
}
function readBest(ids: bigint[]): number | null {
  try {
    const v = localStorage.getItem(bestKey(ids));
    return v && /^\d+$/.test(v) ? Number(v) : null;
  } catch {
    return null;
  }
}
function writeBest(ids: bigint[], v: number) {
  try { localStorage.setItem(bestKey(ids), String(v)); } catch { /* storage off */ }
}

async function makeTable(rounds: Round[], note: string | null): Promise<Table> {
  const tiles = rounds.map((r) => tileFor(r.roundId, r.work, r.dataHash));
  const seal = rounds.length ? await tableSeal(rounds) : null;
  return { rounds, tiles, seal, note };
}

function idsLabel(rounds: Round[]) {
  return rounds.map((r) => r.roundId.toString()).join(', ');
}

export default function App() {
  const initialShare = useMemo(() => parseShare(window.location.hash), []);
  const [mode, setMode] = useState<Mode>(initialShare.kind === 'table' ? 'shared' : 'today');
  const [shareIds, setShareIds] = useState<bigint[] | null>(initialShare.kind === 'table' ? initialShare.ids : null);
  const [shareNote, setShareNote] = useState<string | null>(initialShare.kind === 'invalid' ? `${initialShare.reason} Dealing today's table instead.` : null);

  const [core, setCore] = useState<CoreState | null>(null);
  const [status, setStatus] = useState('Reading SqueekCore state() on Sepolia…');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [tables, setTables] = useState<Record<Mode, Table>>({ today: emptyTable, shared: emptyTable, live: emptyTable });
  const [plays, setPlays] = useState<Record<Mode, Play>>({ today: freshPlay(0), shared: freshPlay(0), live: freshPlay(0) });
  const [inspectIdx, setInspectIdx] = useState<number | null>(null);
  const [placedOnce, setPlacedOnce] = useState(false);

  const [apiNote, setApiNote] = useState<string>('Squeekchain API: checking…');
  const [apiDisagrees, setApiDisagrees] = useState(false);
  const [settlements, setSettlements] = useState<ListedTx[] | null>(null);
  const [settleState, setSettleState] = useState<'unknown' | 'listed' | 'loading'>('loading');
  const coreTrusted = useRef<boolean>(true);

  const [live, setLive] = useState<{ from: bigint | null; through: bigint | null; on: boolean; done: boolean; note: string | null }>({ from: null, through: null, on: false, done: false, note: null });

  const { copied, copy } = useCopy();
  const boardRef = useRef<HTMLDivElement>(null);

  const table = tables[mode];
  const play = plays[mode];
  const game = play.game;
  const cur = currentIndex(game);
  const tile = cur >= 0 ? table.tiles[cur] : undefined;

  // ---------- official data: state() then the table ----------
  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      setError(null);
      try {
        setStatus('Reading SqueekCore state() on Sepolia…');
        const s = await readState(ctl.signal);
        setCore(s);
        const frontier = s.settledThroughRound;
        if (mode === 'shared' && shareIds) {
          setStatus(`Reading shared rounds ${shareIds.join(', ')} from SqueekCore…`);
          const rounds = await roundsById(shareIds, frontier, ctl.signal);
          const t = await makeTable(rounds, null);
          setTables((p) => ({ ...p, shared: t }));
          setPlays((p) => ({ ...p, shared: freshPlay(t.tiles.length) }));
          setStatus(`Shared table dealt: ${rounds.length} official stone${rounds.length === 1 ? '' : 's'}.`);
          return;
        }
        if (tables.today.tiles.length) return;
        setStatus(`Paging certified rounds back from the frontier, round ${frontier}…`);
        const rounds = await todaysRounds(frontier, (lo) => setStatus(`Paging certified rounds ${lo + 1n}–${frontier} for the newest 8 active ones…`), ctl.signal);
        const note = rounds.length < TABLE_SIZE ? `Only ${rounds.length} official active round${rounds.length === 1 ? '' : 's'} exist so far, so all are dealt.` : null;
        const t = await makeTable(rounds, note);
        setTables((p) => ({ ...p, today: t }));
        setPlays((p) => ({ ...p, today: freshPlay(t.tiles.length) }));
        setStatus(`Dealt ${rounds.length} official stones. Settled through round ${frontier}.`);
      } catch (e) {
        if (ctl.signal.aborted) return;
        const msg = e instanceof Error ? e.message : 'Unknown error';
        if (mode === 'shared' && /not an official|past the settled|start at 1/.test(msg)) {
          setShareNote(`${msg}. That share link cannot be dealt.`);
          setShareIds(null);
          setMode('today');
          history.replaceState(null, '', window.location.pathname + window.location.search);
          return;
        }
        setError(msg);
        setStatus(`Could not read SqueekCore: ${msg}.`);
      }
    })();
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, mode, shareIds]);

  // ---------- seal shown as soon as the table is dealt ----------
  // (computed in makeTable)

  // ---------- API: status <= every 8s, settlements <= once a minute ----------
  useEffect(() => {
    let stop = false;
    let timer = 0;
    const tick = async () => {
      if (document.visibilityState === 'visible') {
        const r = await fetchStatus();
        if (stop) return;
        if (!r.ok) {
          setApiNote(`Squeekchain API unavailable (${r.reason}); its data is unknown. Play reads SqueekCore directly.`);
        } else if (r.data.coreMatches === false) {
          coreTrusted.current = false;
          setApiNote('The API names a different core contract, so its data is ignored.');
        } else {
          coreTrusted.current = true;
          setApiNote('Squeekchain API reachable.');
          const s = r.data.settledThroughRound;
          setApiDisagrees(s !== null && core !== null && s !== core.settledThroughRound);
        }
        timer = window.setTimeout(tick, r.ok ? STATUS_POLL_MS : Math.max(STATUS_POLL_MS * 4, (!r.ok && r.retryAfterMs) || 0));
        return;
      }
      timer = window.setTimeout(tick, STATUS_POLL_MS);
    };
    tick();
    return () => { stop = true; window.clearTimeout(timer); };
  }, [core]);

  const loadSettlements = useCallback(async () => {
    setSettleState('loading');
    const r = await fetchSettlements();
    if (r.ok && coreTrusted.current) {
      setSettlements(r.data);
      setSettleState('listed');
    } else {
      setSettlements(null);
      setSettleState('unknown');
    }
  }, []);
  useEffect(() => {
    loadSettlements();
    const t = window.setInterval(loadSettlements, SETTLE_POLL_MS);
    return () => window.clearInterval(t);
  }, [loadSettlements]);

  // ---------- Live table ----------
  useEffect(() => {
    if (mode !== 'live' || !live.on || live.done) return;
    let stop = false;
    let timer = 0;
    const poll = async () => {
      try {
        const s = await readState();
        if (stop) return;
        setCore(s);
        if (s.paused) {
          setLive((l) => ({ ...l, note: `SqueekCore is paused at round ${s.settledThroughRound}. Live waits; nothing is invented.` }));
        } else if (live.through !== null && s.settledThroughRound > live.through) {
          const { rounds, certifiedThrough } = await activeRounds(live.through, s.settledThroughRound);
          if (stop) return;
          const room = TABLE_SIZE - tables.live.rounds.length;
          const take = rounds.slice(0, room);
          if (take.length) {
            const all = [...tables.live.rounds, ...take];
            const t = await makeTable(all, null);
            setTables((p) => ({ ...p, live: t }));
            setPlays((p) => ({ ...p, live: { ...p.live, game: growGame(p.live.game, all.length) } }));
          }
          const full = tables.live.rounds.length + take.length >= TABLE_SIZE;
          setLive((l) => ({ ...l, through: certifiedThrough, done: full, note: full ? 'Live table is full: 8 official stones.' : null }));
        } else {
          setLive((l) => ({ ...l, note: null }));
        }
      } catch {
        setLive((l) => ({ ...l, note: 'Live could not reach a Sepolia RPC; trying again shortly.' }));
      }
      if (!stop) timer = window.setTimeout(poll, LIVE_POLL_MS);
    };
    timer = window.setTimeout(poll, live.through === null ? 0 : LIVE_POLL_MS);
    return () => { stop = true; window.clearTimeout(timer); };
  }, [mode, live.on, live.done, live.through, tables.live.rounds]);

  const startLive = useCallback(async () => {
    setMode('live');
    if (live.on) return;
    try {
      const s = core ?? (await readState());
      setCore(s);
      setLive({ from: s.settledThroughRound, through: s.settledThroughRound, on: true, done: false, note: null });
    } catch {
      setLive((l) => ({ ...l, note: 'Live could not reach a Sepolia RPC. Try again.' }));
    }
  }, [core, live.on]);

  // ---------- play ----------
  const cells = tile ? footprint(tile, play.quarter, play.flipped, play.anchor) : [];
  const verdict = tile ? check(game, cells) : null;

  const update = useCallback((fn: (p: Play) => Play) => setPlays((all) => ({ ...all, [mode]: fn(all[mode]) })), [mode]);

  const advance = useCallback((g: GameState, lastFate: string) => {
    // Auto-miss stones that fit nowhere, so the table never stalls.
    let next = g;
    let note = lastFate;
    for (;;) {
      const i = currentIndex(next);
      if (i < 0) break;
      if (fitsAnywhere(next, table.tiles[i])) break;
      next = discard(next, i, false);
      note = `Round ${table.tiles[i].roundId} fits nowhere on the table, so its cells miss.`;
    }
    const tableComplete = currentIndex(next) < 0 && (mode !== 'live' || live.done);
    if (tableComplete) next = { ...next, finished: true };
    return { next, note };
  }, [table.tiles, mode, live.done]);

  const nextAnchor = useCallback((g: GameState): Cell => {
    const i = currentIndex(g);
    return i >= 0 && table.tiles[i] ? startAnchor(g, table.tiles[i]) : CENTER;
  }, [table.tiles]);

  const tryPlace = useCallback((at?: Cell) => {
    if (!tile || cur < 0) return;
    const anchor = at ?? play.anchor;
    const fp = footprint(tile, play.quarter, play.flipped, anchor);
    const v = check(game, fp);
    if (!v.ok) {
      update((p) => ({ ...p, anchor, reject: v.why === 'edge' ? 'That runs off the table. Move or rotate the stone.' : 'That overlaps a placed stone. Try another spot.', rejectTick: p.rejectTick + 1 }));
      return;
    }
    const placed = place(game, cur, fp);
    const { next, note } = advance(placed, `Round ${tile.roundId} placed: +${fp.length}.`);
    setPlacedOnce(true);
    setInspectIdx(null);
    update((p) => ({ ...p, game: next, quarter: 0, flipped: false, anchor: nextAnchor(next), reject: null, lastFate: note }));
  }, [tile, cur, play, game, update, advance, nextAnchor]);

  const doDiscard = useCallback(() => {
    if (!tile || cur < 0 || game.discardUsed) return;
    const d = discard(game, cur, true);
    const { next, note } = advance(d, `Round ${tile.roundId} discarded; its ${tile.size} cell${tile.size === 1 ? '' : 's'} miss.`);
    setInspectIdx(null);
    update((p) => ({ ...p, game: next, quarter: 0, flipped: false, anchor: nextAnchor(next), reject: null, lastFate: note }));
  }, [tile, cur, game, update, advance, nextAnchor]);

  const rotate = useCallback(() => update((p) => ({ ...p, quarter: (p.quarter + 1) % 4, reject: null })), [update]);
  const flip = useCallback(() => update((p) => ({ ...p, flipped: !p.flipped, reject: null })), [update]);
  const finishLive = useCallback(() => {
    setLive((l) => ({ ...l, done: true }));
    setPlays((p) => ({ ...p, live: { ...p.live, game: { ...p.live.game, finished: true } } }));
  }, []);
  const replay = useCallback(() => update(() => freshPlay(table.tiles.length)), [update, table.tiles.length]);

  const onCell = useCallback((x: number, y: number, pointerType: string) => {
    if (!tile) return;
    const same = play.anchor[0] === x && play.anchor[1] === y;
    // Mouse: one click places. Touch and pen: first tap shows the stone there, second tap places.
    if (pointerType === 'mouse' || same) tryPlace([x, y]);
    else update((p) => ({ ...p, anchor: [x, y], reject: null }));
  }, [tile, play.anchor, tryPlace, update]);

  const onBoardKey = useCallback((e: React.KeyboardEvent) => {
    const k = e.key;
    const move: Record<string, Cell> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (move[k]) {
      e.preventDefault();
      update((p) => ({ ...p, reject: null, anchor: [Math.min(BOARD - 1, Math.max(0, p.anchor[0] + move[k][0])), Math.min(BOARD - 1, Math.max(0, p.anchor[1] + move[k][1]))] }));
    } else if (k === 'Enter' || k === ' ') { e.preventDefault(); tryPlace(); }
    else if (k === 'r' || k === 'R') { e.preventDefault(); rotate(); }
    else if (k === 'f' || k === 'F') { e.preventDefault(); flip(); }
  }, [update, tryPlace, rotate, flip]);

  // keep keyboard focus on the anchor cell
  useEffect(() => {
    const el = boardRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${play.anchor[0]},${play.anchor[1]}"]`);
    if (el && boardRef.current?.contains(document.activeElement)) el.focus();
  }, [play.anchor]);

  // ---------- score / best ----------
  const sc = score(game);
  const ids = table.rounds.map((r) => r.roundId);
  const [best, setBest] = useState<number | null>(null);
  useEffect(() => { setBest(ids.length ? readBest(ids) : null); }, [ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (game.finished && ids.length && (best === null || sc.total > best)) {
      writeBest(ids, sc.total);
      setBest(sc.total);
    }
  }, [game.finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const shareUrl = ids.length ? `${window.location.origin}${window.location.pathname}${shareHash(ids)}` : '';

  // ---------- render helpers ----------
  const ghost = new Map<number, boolean>();
  if (tile) for (const [x, y] of cells) if (x >= 0 && y >= 0 && x < BOARD && y < BOARD) ghost.set(y * BOARD + x, !!verdict?.ok);

  const inspectI = inspectIdx ?? (cur >= 0 ? cur : null);
  const inspect = inspectI !== null ? table.tiles[inspectI] : undefined;
  const loading = !table.tiles.length && !error && mode !== 'live';
  const tableTitle = mode === 'today' ? "Today's official table" : mode === 'shared' ? 'Shared official table' : 'Live table';

  const heading = (
    <div className="table-head">
      <h2 id="board-title">{tableTitle}</h2>
      <p className="ids">
        {table.rounds.length ? <>Rounds <span className="num">{idsLabel(table.rounds)}</span></> : mode === 'live' ? (live.from !== null ? <>Starts empty at round <span className="num">{live.from.toString()}</span></> : 'Starts empty at the settled frontier') : 'Rounds arrive from SqueekCore'}
        {table.seal && <> · Seal <button type="button" className="chip num" onClick={() => copy('seal', table.seal!)} aria-label={`Copy table seal ${table.seal}`}>{table.seal}</button>{copied === 'seal' && <span className="ok"> copied</span>}</>}
      </p>
    </div>
  );

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>Settled Stones</h1>
          <p className="tagline">Every official settled round is a stone.</p>
        </div>
        <nav className="modes" aria-label="Tables">
          {mode === 'shared' && <button type="button" className="tab" aria-pressed="true">Shared</button>}
          <button type="button" className="tab" aria-pressed={mode === 'today'} onClick={() => { setMode('today'); setInspectIdx(null); if (shareIds) { setShareIds(null); history.replaceState(null, '', window.location.pathname + window.location.search); } }}>Today</button>
          <button type="button" className="tab" aria-pressed={mode === 'live'} onClick={() => { setInspectIdx(null); startLive(); }}>Live</button>
        </nav>
      </header>

      <main className="layout">
        <section className="table-col" aria-labelledby="board-title">
          {heading}
          {shareNote && <p className="note warn" role="status">{shareNote}</p>}
          {table.note && <p className="note">{table.note}</p>}

          <div
            ref={boardRef}
            className={`board${play.reject ? (play.rejectTick % 2 ? ' shake-a' : ' shake-b') : ''}`}
            role="grid"
            aria-label={`9 by 9 table${tile ? `, holding round ${tile.roundId}` : ''}. Arrow keys move the stone, R rotates, F flips, Enter places.`}
            onKeyDown={onBoardKey}
          >
            {Array.from({ length: BOARD }, (_, y) => (
              <div role="row" key={y} className="row">
                {Array.from({ length: BOARD }, (_, x) => {
                  const i = y * BOARD + x;
                  const occ = game.board[i];
                  const g = ghost.get(i);
                  const t = occ >= 0 ? table.tiles[occ] : undefined;
                  const isAnchor = play.anchor[0] === x && play.anchor[1] === y;
                  const cls = ['cell', t ? `stone suit-${t.suitIndex}` : '', g !== undefined && tile ? (g ? `ghost suit-${tile.suitIndex}` : 'ghost bad') : ''].join(' ');
                  return (
                    <button
                      type="button"
                      role="gridcell"
                      key={x}
                      data-cell={`${x},${y}`}
                      className={cls}
                      tabIndex={isAnchor ? 0 : -1}
                      aria-label={`Row ${y + 1}, column ${x + 1}, ${t ? `stone of round ${t.roundId}` : 'empty'}${g !== undefined ? (g ? ', stone fits here' : ', stone does not fit') : ''}`}
                      onPointerUp={(e) => { if (e.button === 0) onCell(x, y, e.pointerType); }}
                      onPointerEnter={(e) => { if (e.pointerType === 'mouse' && tile && !isAnchor) update((p) => ({ ...p, anchor: [x, y], reject: null })); }}
                      onClick={(e) => { if (e.detail === 0) tryPlace([x, y]); }}
                      onDoubleClick={(e) => { if (t) { e.preventDefault(); setInspectIdx(occ); } }}
                    >
                      {t && <SuitMark suit={t.suitIndex} />}
                      {g !== undefined && tile && (g ? <SuitMark suit={tile.suitIndex} /> : <span className="x" aria-hidden="true">×</span>)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <p className={`status${error ? ' err' : ''}`} role="status" aria-live="polite">
            {play.reject ?? (game.finished ? `Table finished: ${sc.total} points.` : play.lastFate ?? (mode === 'live' ? (live.note ?? (live.on ? (tile ? 'Place the newest official stone.' : `Waiting for the next certified active round after ${live.through ?? '…'}.`) : 'Connecting to SqueekCore…')) : status))}
            {error && <> <button type="button" className="btn small" onClick={() => setAttempt((a) => a + 1)}>Retry</button></>}
          </p>
          {loading && !error && <p className="sr-only">Loading official rounds.</p>}
        </section>

        <aside className="side">
          {tile && !game.finished && (
            <div className="hand" aria-label="Stone in hand">
              <div className="hand-stone">
                <StoneGlyph cells={orient(tile.cells, play.quarter, play.flipped)} suit={tile.suitIndex} label={`Round ${tile.roundId}: ${tile.size}-cell ${tile.family}, ${tile.suit}`} />
                <p className="hand-cap">Round <span className="num">{tile.roundId.toString()}</span>, {tile.suit} {tile.family}</p>
              </div>
              <div className="controls">
                <button type="button" className="btn" onClick={rotate} aria-keyshortcuts="R">Rotate</button>
                <button type="button" className="btn" onClick={flip} aria-keyshortcuts="F" aria-pressed={play.flipped}>Flip</button>
                <button type="button" className="btn primary" onClick={() => tryPlace()} disabled={!verdict?.ok} aria-keyshortcuts="Enter">Place</button>
                <button type="button" className="btn quiet" onClick={doDiscard} disabled={game.discardUsed}>{game.discardUsed ? 'Discard used' : 'Discard once'}</button>
              </div>
              {!placedOnce && <p className="hint">rotate, then place</p>}
            </div>
          )}
          {mode === 'live' && live.on && !game.finished && (
            <p className="note">Live accepts newly certified official active rounds until 8 stones or you finish. <button type="button" className="btn small" onClick={finishLive}>Finish table</button></p>
          )}

          {table.tiles.length > 0 && <div className="scoreline">
            <p><span className="big num">{sc.total}</span> points <span className="muted">· {sc.cells} cells, {sc.lines} full line{sc.lines === 1 ? '' : 's'}</span></p>
            <p className="muted">Best on this table: {best === null ? 'none yet' : <span className="num">{best}</span>}. 1 per cell, +9 per full row or column.</p>
            {game.finished && <button type="button" className="btn small" onClick={replay}>Play this table again</button>}
          </div>}

          {table.tiles.length > 0 && (
            <ol className="tray" aria-label="Stones on this table, oldest first">
              {table.tiles.map((t, i) => (
                <li key={t.roundId.toString()}>
                  <button type="button" className={`tray-item fate-${game.fate[i] ?? 'hand'}${i === cur ? ' now' : ''}${i === inspectI ? ' sel' : ''}`} onClick={() => setInspectIdx(i)} aria-label={`Inspect round ${t.roundId}, ${game.fate[i] === 'placed' ? 'placed' : game.fate[i] === 'missed' ? 'missed' : i === cur ? 'in hand' : 'waiting'}`}>
                    <StoneGlyph cells={t.cells} suit={t.suitIndex} />
                    <span className="num">{t.roundId.toString()}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}

          {inspect && (
            <section className="inspect" aria-labelledby="inspect-title">
              <h3 id="inspect-title">Inspect round {inspect.roundId.toString()}</h3>
              <dl>
                <dt>Round</dt>
                <dd><button type="button" className="chip num" onClick={() => copy('round', inspect.roundId.toString())}>{inspect.roundId.toString()}</button>{copied === 'round' && <span className="ok"> copied</span>}</dd>
                <dt>Work</dt>
                <dd><button type="button" className="chip num" onClick={() => copy('work', inspect.work.toString())}>{inspect.work.toString()}</button>{copied === 'work' && <span className="ok"> copied</span>} {inspect.steers ? 'steers (40 or more)' : 'below 40, does not steer'}</dd>
                <dt>Stone</dt>
                <dd>size {inspect.size}, family {inspect.family}, {inspect.suit} inlay</dd>
                <dt>dataHash</dt>
                <dd><button type="button" className="chip num hash" onClick={() => copy('hash', inspect.dataHash)}>{inspect.dataHash}</button>{copied === 'hash' && <span className="ok"> copied</span>}</dd>
                <dt>Settlement tx</dt>
                <dd>
                  {(() => {
                    const tx = txForRound(settlements, inspect.roundId);
                    if (tx) return <><button type="button" className="chip num hash" onClick={() => copy('tx', tx)}>{tx}</button>{copied === 'tx' && <span className="ok"> copied</span>}</>;
                    if (settleState === 'loading') return 'Checking the API…';
                    if (settleState === 'unknown') return <>Unknown: the API is unavailable. <button type="button" className="btn small" onClick={loadSettlements}>Refresh</button></>;
                    return 'Not in the API’s recent settlements.';
                  })()}
                </dd>
              </dl>
            </section>
          )}

          {ids.length > 0 && (
            <p className="share">
              <button type="button" className="btn small" onClick={() => copy('share', shareUrl)}>Copy share link</button>
              {copied === 'share' && <span className="ok"> copied</span>}
              {copied === 'failed:share' && <span className="num"> {shareHash(ids)}</span>}
            </p>
          )}
        </aside>
      </main>

      <footer className="foot">
        {apiDisagrees && <p className="note warn">Using SqueekCore; the API disagrees.</p>}
        {core?.paused && <p className="note warn">SqueekCore is paused at round {core.settledThroughRound.toString()}. No new stones until it resumes.</p>}
        <p>Community game reading public Squeekchain data, not an official product. No wallet, no token.</p>
        <RpcSetting onChange={() => setAttempt((a) => a + 1)}>
          <p className="muted">
            SqueekCore proxy <span className="num">{PROXY}</span> on Sepolia ({CHAIN_ID.toString()}){core && <>, settled through round <span className="num">{core.settledThroughRound.toString()}</span></>}. {apiNote}
          </p>
        </RpcSetting>
      </footer>
    </div>
  );
}

function RpcSetting({ onChange, children }: { onChange: () => void; children: React.ReactNode }) {
  const [val, setVal] = useState(customRpc() ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <details className="rpc">
      <summary>Data sources and your own Sepolia RPC</summary>
      {children}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = val.trim();
          if (!v) { setCustomRpc(null); setMsg('Removed. Using the public Sepolia RPCs.'); onChange(); return; }
          try {
            const u = new URL(v);
            if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') throw new Error();
            setCustomRpc(u.toString());
            setMsg('Saved. It is tried after the public RPCs, and only if it reports Sepolia.');
            onChange();
          } catch {
            setMsg('Enter an https URL for a Sepolia RPC.');
          }
        }}
      >
        <label htmlFor="rpc-url">Sepolia RPC URL</label>
        <div className="rpc-row">
          <input id="rpc-url" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://sepolia.example.org" value={val} onChange={(e) => setVal(e.target.value)} />
          <button type="submit" className="btn small">Save</button>
        </div>
        {msg && <p className="muted" role="status">{msg}</p>}
      </form>
    </details>
  );
}
