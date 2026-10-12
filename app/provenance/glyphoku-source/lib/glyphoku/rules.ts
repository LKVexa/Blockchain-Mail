/** Glyphoku houses: each glyph once per row, column, and box. */

export type Topology = {
  order: number;
  boxRows: number;
  boxCols: number;
};

/** The desk plays the 16×16 cipher. Smaller rungs are easier and are not dealt. */
export const PLAYED: Topology = { order: 16, boxRows: 4, boxCols: 4 };

export const HORIZON_G = 2;

export function topologyFor(_ordinal: number): Topology {
  return PLAYED;
}

export function cellCount(topology: Topology): number {
  return topology.order * topology.order;
}

export function puzzlesRequired(ordinal: number): number {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 12) {
    throw new Error("ordinal is outside the exact integer range");
  }
  return 2 ** (ordinal - 1);
}

export function issuanceAllowed(ordinal: number): { ok: true; puzzles: number } | { ok: false; reason: string } {
  if (!Number.isInteger(ordinal) || ordinal < 1) return { ok: false, reason: "Ordinal is not a positive integer." };
  if (ordinal > HORIZON_G) {
    return {
      ok: false,
      reason: `Issuance is paused at ordinal ${ordinal}. This profile has measured support only through g=${HORIZON_G} (${puzzlesRequired(HORIZON_G)} puzzles).`,
    };
  }
  return { ok: true, puzzles: puzzlesRequired(ordinal) };
}

/** Empty cells on the 16×16 cipher. g=2 sits above g=1, at the rulebook's hard line. */
export function scoreBand(ordinal: number): { low: number; high: number } {
  if (ordinal === 1) return { low: 124, high: 132 };
  if (ordinal === 2) return { low: 133, high: 140 };
  throw new Error("no certified score band for this ordinal");
}

export function inBand(ordinal: number, givens: readonly number[], topology: Topology = topologyFor(ordinal)): boolean {
  const band = scoreBand(ordinal);
  const empty = givens.filter((value) => value === 0).length;
  return empty >= band.low && empty <= band.high && givens.length === cellCount(topology);
}

function boxOf(index: number, topology: Topology): number {
  const row = Math.floor(index / topology.order);
  const col = index % topology.order;
  const boxRow = Math.floor(row / topology.boxRows);
  const boxCol = Math.floor(col / topology.boxCols);
  const boxesAcross = topology.order / topology.boxCols;
  return boxRow * boxesAcross + boxCol;
}

export function verifyCandidate(
  givens: readonly number[],
  candidate: readonly number[],
  topology: Topology = PLAYED,
): { ok: true } | { ok: false; reason: string } {
  const n = cellCount(topology);
  if (givens.length !== n || candidate.length !== n) return { ok: false, reason: "Grid size does not match the topology." };
  const rows = Array.from({ length: topology.order }, () => new Set<number>());
  const cols = Array.from({ length: topology.order }, () => new Set<number>());
  const boxes = Array.from({ length: topology.order }, () => new Set<number>());
  for (let index = 0; index < n; index++) {
    const given = givens[index]!;
    const value = candidate[index]!;
    if (!Number.isInteger(value) || value < 1 || value > topology.order) return { ok: false, reason: "A cell is outside the glyph set." };
    if (given !== 0 && given !== value) return { ok: false, reason: "A given glyph was changed." };
    const row = Math.floor(index / topology.order);
    const col = index % topology.order;
    const box = boxOf(index, topology);
    if (rows[row]!.has(value) || cols[col]!.has(value) || boxes[box]!.has(value)) {
      return { ok: false, reason: "A row, column, or box repeats a glyph." };
    }
    rows[row]!.add(value);
    cols[col]!.add(value);
    boxes[box]!.add(value);
  }
  return { ok: true };
}

function popcount(value: number): number {
  let x = value >>> 0;
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Unique-completion count. Stops at 2. A search that runs away is treated as not unique. */
export function countSolutions(givens: readonly number[], topology: Topology = PLAYED, limit = 2): number {
  const n = topology.order;
  const full = (1 << n) - 1;
  const rows = Array(n).fill(0);
  const cols = Array(n).fill(0);
  const boxes = Array(n).fill(0);
  const empties: number[] = [];
  for (let index = 0; index < givens.length; index++) {
    const value = givens[index]!;
    const row = Math.floor(index / n);
    const col = index % n;
    const box = boxOf(index, topology);
    if (value === 0) empties.push(index);
    else {
      const bit = 1 << (value - 1);
      rows[row] |= bit;
      cols[col] |= bit;
      boxes[box] |= bit;
    }
  }
  let found = 0;
  let nodes = 0;
  const walk = (cursor: number): void => {
    if (found >= limit || nodes > 250000) return;
    if (cursor === empties.length) {
      found++;
      return;
    }
    nodes++;
    let best = cursor;
    let bestBits = 99;
    for (let look = cursor; look < empties.length; look++) {
      const index = empties[look]!;
      const row = Math.floor(index / n);
      const col = index % n;
      const box = boxOf(index, topology);
      const bits = popcount(full & ~(rows[row]! | cols[col]! | boxes[box]!));
      if (bits < bestBits) {
        bestBits = bits;
        best = look;
        if (bits <= 1) break;
      }
    }
    if (bestBits === 0) return;
    if (best !== cursor) {
      const swap = empties[cursor]!;
      empties[cursor] = empties[best]!;
      empties[best] = swap;
    }
    const index = empties[cursor]!;
    const row = Math.floor(index / n);
    const col = index % n;
    const box = boxOf(index, topology);
    let mask = full & ~(rows[row]! | cols[col]! | boxes[box]!);
    while (mask) {
      const bit = mask & -mask;
      mask ^= bit;
      rows[row] |= bit;
      cols[col] |= bit;
      boxes[box] |= bit;
      walk(cursor + 1);
      rows[row] ^= bit;
      cols[col] ^= bit;
      boxes[box] ^= bit;
      if (found >= limit) return;
    }
  };
  walk(0);
  return nodes > 250000 && found < 1 ? 2 : found;
}

function random(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffled<T>(values: T[], rng: () => number): T[] {
  const copy = values.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = swap;
  }
  return copy;
}

function candidatesOf(board: readonly number[], index: number, topology: Topology): number[] {
  if (board[index] !== 0) return [];
  const used = new Set<number>();
  const row = Math.floor(index / topology.order);
  const col = index % topology.order;
  const box = boxOf(index, topology);
  for (let i = 0; i < board.length; i++) {
    const value = board[i]!;
    if (value === 0) continue;
    const sameRow = Math.floor(i / topology.order) === row;
    const sameCol = i % topology.order === col;
    const sameBox = boxOf(i, topology) === box;
    if (sameRow || sameCol || sameBox) used.add(value);
  }
  const out: number[] = [];
  for (let value = 1; value <= topology.order; value++) if (!used.has(value)) out.push(value);
  return out;
}

function fill(topology: Topology, rng: () => number): number[] | null {
  const board = Array.from({ length: cellCount(topology) }, () => 0);
  const walk = (index: number): boolean => {
    if (index === board.length) return true;
    let next = index;
    while (next < board.length && board[next] !== 0) next++;
    if (next === board.length) return true;
    for (const value of shuffled(candidatesOf(board, next, topology), rng)) {
      board[next] = value;
      if (walk(next + 1)) return true;
      board[next] = 0;
    }
    return false;
  };
  return walk(0) ? board : null;
}

/**
 * Deal a unique 16×16 cipher at the hard end of the ordinal's band.
 * The finished grid used to punch givens is discarded.
 */
export function dealGivens(ordinal: number, seed: number, topology: Topology = topologyFor(ordinal)): number[] {
  const band = scoreBand(ordinal);
  const rng = random(seed || 1);
  const solved = fill(topology, rng);
  if (!solved) throw new Error("the dealer could not fill a cipher");
  const givens = solved.slice();
  let empty = 0;
  for (const index of shuffled(givens.map((_, cell) => cell), rng)) {
    if (empty >= band.high) break;
    const saved = givens[index]!;
    givens[index] = 0;
    if (countSolutions(givens, topology, 2) !== 1) givens[index] = saved;
    else empty++;
  }
  if (!inBand(ordinal, givens, topology)) {
    throw new Error("the dealer could not reach the hard cipher band");
  }
  return givens;
}
