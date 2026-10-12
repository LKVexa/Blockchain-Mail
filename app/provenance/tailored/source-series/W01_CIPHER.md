# W01 — Attach the cipher

**Status: NOT_STARTED** · Requires W00.

## Do

Deal one g=1 board and one g=2 board with `dealPlayable`. Check:

- length 256
- glyphs drawn from `1 2 3 4 5 6 A B C D E ★ ◆ ♠ ♣ ♥`
- empty cells inside 124–132 for g=1 and 133–140 for g=2
- g=2 emptier than g=1
- `runSolver` ends at `SEARCH_SOLVED`
- givens are unchanged in the final grid
- guess count is at least 8 on the g=1 board and at least 12 on the g=2 board
- the g=2 trace contains `RETRACT`

The scoring solve inside `dealPlayable` is not the issued solution. The board handed to the desk is givens only.

## Pass

Both boards meet the list above, and `verifyCandidate` accepts only the solved grid.

## Fail

A 9×9 digit grid, a full grid with no guesses, an empty count below the band, or a g=2 board that never retracts.

## Evidence

The test command, the empty counts, the guess counts, and the last event type. Do not paste the discarded filled grid as a permit.
