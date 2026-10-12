import { createSolver } from "./solver";
import { dealGivens, topologyFor } from "./rules";

/** Keep the hardest cipher that still finishes: the most guesses under the event cap. */
export function dealPlayable(ordinal: number, seed: number): number[] {
  const cap = ordinal === 1 ? 12000 : 18000;
  const minimumGuesses = ordinal === 1 ? 8 : 12;
  const topology = topologyFor(ordinal);
  let best: { givens: number[]; guesses: number } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    let givens: number[];
    try {
      givens = dealGivens(ordinal, (seed + attempt * 97) >>> 0);
    } catch {
      continue;
    }
    const solver = createSolver(givens, topology);
    let events = 0;
    let guesses = 0;
    let solved = false;
    for (;;) {
      const event = solver.step();
      if (!event) break;
      events++;
      if (event.type === "GUESS") guesses++;
      if (event.type === "SEARCH_SOLVED") {
        solved = true;
        break;
      }
      if (events > cap) break;
    }
    if (solved && guesses >= minimumGuesses && (!best || guesses > best.guesses)) {
      best = { givens, guesses };
    }
  }
  if (!best) throw new Error("No 16×16 cipher in the hard band finished inside the solver budget.");
  return best.givens;
}
