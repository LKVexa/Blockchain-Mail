import { cellCount, verifyCandidate, validateGivens, boxOf, type Topology } from "./rules.ts";

export type SolveEventType =
  | "INIT"
  | "ASSIGN"
  | "GUESS"
  | "CONTRADICTION"
  | "RETRACT"
  | "SEARCH_SOLVED"
  | "SEARCH_EXHAUSTED";

export type SolveEvent = {
  seq: number;
  type: SolveEventType;
  cell: number | null;
  oldValue: number;
  newValue: number;
  rule: string;
  depth: number;
  nodes: number;
};

type Kind = "given" | "derived" | "guess" | "empty";
type Placement = { cell: number; value: number };
type Frame = { cell: number; options: number[]; placed: Placement[] };

/**
 * Live search. Each `step` performs the next real mutation.
 * The constructor accepts givens only — there is no solution argument.
 */
export function createSolver(givens: readonly number[], topology: Topology) {
  const n = cellCount(topology);
  const valid = validateGivens(givens, topology);
  if (!valid.ok) throw new Error(valid.code+": "+valid.reason);
  const board = givens.slice();
  const kind: Kind[] = givens.map((value) => (value === 0 ? "empty" : "given"));
  const root: Placement[] = [];
  const stack: Frame[] = [];
  let retry: Frame | null = null;
  let seq = 0;
  let nodes = 0;
  let phase: "init" | "search" | "contradict" | "retry" | "done" = "init";
  let outcome: "solved" | "exhausted" | null = null;

  const rows = new Uint32Array(16), cols = new Uint32Array(16), boxes = new Uint32Array(16);
  for(let i=0;i<n;i++) if(board[i]) { const bit=1<<(board[i]!-1); rows[i>>4]!|=bit; cols[i%16]!|=bit; boxes[boxOf(i)]!|=bit; }
  function candidates(index:number):number[]{
    if(board[index]!==0)return [];
    const mask=65535 & ~(rows[index>>4]! | cols[index%16]! | boxes[boxOf(index)]!);
    const values:number[]=[]; for(let value=16;value>=1;value--)if(mask & (1<<(value-1)))values.push(value);
    return values;
  }

  function place(cell: number, value: number, placementKind: "derived" | "guess", into: Placement[]) {
    board[cell] = value;
    const bit=1<<(value-1); rows[cell>>4]!|=bit; cols[cell%16]!|=bit; boxes[boxOf(cell)]!|=bit;
    kind[cell] = placementKind;
    into.push({ cell, value });
  }

  function nakedSingle(): { cell: number; value: number } | null {
    for (let index = 0; index < n; index++) {
      if (board[index] !== 0) continue;
      const values = candidates(index);
      if (values.length === 1) return { cell: index, value: values[0]! };
    }
    return null;
  }

  function blocked(): boolean {
    for (let index = 0; index < n; index++) {
      if (board[index] === 0 && candidates(index).length === 0) return true;
    }
    return false;
  }

  function event(type: SolveEventType, cell: number | null, oldValue: number, newValue: number, rule: string): SolveEvent {
    seq++;
    return { seq, type, cell, oldValue, newValue, rule, depth: stack.length, nodes };
  }

  return {
    givens: givens.slice(),
    candidates,
    snapshot() {
      return { board: board.slice(), kind: kind.slice(), depth: stack.length, nodes, outcome };
    },
    step(): SolveEvent | null {
      if (phase === "done") return null;
      if (phase === "init") {
        phase = "search";
        return event("INIT", null, 0, 0, "GIVENS");
      }
      if (phase === "retry" && retry) {
        const value = retry.options.shift()!;
        retry.placed = [];
        place(retry.cell, value, "guess", retry.placed);
        stack.push(retry);
        retry = null;
        phase = "search";
        nodes++;
        return event("GUESS", stack[stack.length - 1]!.cell, 0, value, "MRV");
      }
      if (phase === "contradict") {
        const frame = stack[stack.length - 1];
        if (!frame) {
          phase = "done";
          outcome = "exhausted";
          return event("SEARCH_EXHAUSTED", null, 0, 0, "NO_BRANCH");
        }
        const last = frame.placed.pop();
        if (!last) {
          stack.pop();
          return event("RETRACT", frame.cell, 0, 0, "BACKTRACK");
        }
        const bit=1<<(last.value-1); rows[last.cell>>4]!^=bit; cols[last.cell%16]!^=bit; boxes[boxOf(last.cell)]!^=bit;
        board[last.cell] = 0;
        kind[last.cell] = "empty";
        if (frame.placed.length === 0) {
          stack.pop();
          if (frame.options.length > 0) {
            retry = frame;
            phase = "retry";
          }
        }
        return event("RETRACT", last.cell, last.value, 0, "BACKTRACK");
      }

      const into = stack.length > 0 ? stack[stack.length - 1]!.placed : root;
      const single = nakedSingle();
      if (single) {
        place(single.cell, single.value, "derived", into);
        nodes++;
        return event("ASSIGN", single.cell, 0, single.value, "NAKED_SINGLE");
      }
      if (blocked()) {
        phase = "contradict";
        return event("CONTRADICTION", null, 0, 0, "EMPTY_DOMAIN");
      }
      if (board.every((value) => value !== 0)) {
        phase = "done";
        outcome = "solved";
        return event("SEARCH_SOLVED", null, 0, 0, "COMPLETE");
      }
      let bestCell = -1;
      let bestValues: number[] = [];
      for (let index = 0; index < n; index++) {
        if (board[index] !== 0) continue;
        const values = candidates(index);
        if (bestCell < 0 || values.length < bestValues.length) {
          bestCell = index;
          bestValues = values;
        }
      }
      if (bestCell < 0 || bestValues.length === 0) {
        phase = "contradict";
        return event("CONTRADICTION", bestCell < 0 ? null : bestCell, 0, 0, "EMPTY_DOMAIN");
      }
      const placed: Placement[] = [];
      place(bestCell, bestValues[0]!, "guess", placed);
      stack.push({ cell: bestCell, options: bestValues.slice(1), placed });
      nodes++;
      return event("GUESS", bestCell, 0, bestValues[0]!, "MRV");
    },
  };
}

export type Solver = ReturnType<typeof createSolver>;

/** Run the live stepper to completion. Tests use this; the view calls `step` on a timer. */
export function runSolver(givens: readonly number[], topology: Topology): { events: SolveEvent[]; board: number[] } {
  const solver = createSolver(givens, topology);
  const events: SolveEvent[] = [];
  for (;;) {
    const next = solver.step();
    if (!next) break;
    events.push(next);
    if (events.length > 200000) throw new Error("solver exceeded the local event budget");
  }
  return { events, board: solver.snapshot().board };
}

export function replayBoard(givens: readonly number[], events: readonly SolveEvent[]): number[] {
  const board = givens.slice();
  for (const item of events) {
    if (item.type === "ASSIGN" || item.type === "GUESS") {
      if (item.cell === null || board[item.cell] !== 0) throw new Error("event overwrites a filled cell");
      board[item.cell] = item.newValue;
    } else if (item.type === "RETRACT") {
      if (item.cell === null || board[item.cell] !== item.oldValue) throw new Error("retraction does not match the board");
      board[item.cell] = 0;
    }
  }
  return board;
}
