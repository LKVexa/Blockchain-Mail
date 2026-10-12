# W02 — Visible search at 24×

**Status: NOT_STARTED** · Requires W01.

## Do

Load the desk. Confirm the speed control is on **24×**, with 1×, 8×, and 40× still listed. Start a domain solve. Before the search, the grid shows givens and blanks. During the search, cells change one event at a time from the solver, 24 events per 100 ms tick. Pause, resume, single-step, and stop still work. Hiding the tab pauses the run.

The "Composing the hard 16×16 cipher…" line may sit for seconds before the first event. That wait is the dealer rejecting boards. It is not the visible solve, and it must not write a domain.

## Pass

A headed observation shows givens first, then guesses, at 24×, with no domain row created until verification.

## Fail

The board fills in one paint, the default pace is not 24×, or composing itself calls `commitDomain`.

## Evidence

What the speed control showed, whether guesses appeared, and that the domain list was still empty at the first guess.
