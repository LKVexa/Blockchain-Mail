# Master prompt — attach Glyphoku to the virtual mail machine

**Series 1.0.0 · Profile `GLYPHOKU_VEM_127/1` · 2026-10-06**

[Workflow](MASTER_WORKFLOW.md) · [Start](START_HERE.md)

## Assignment

Attach the Glyphoku cipher desk to the virtual mail machine and keep the attachment honest. The cipher is the gate. The machine is the registry. Neither one is a public mail exchanger, a chain, or a currency.

Work in the authorized local copy. Inspect the files named below before describing them. Do not invent a second mail stack beside the one that already exists.

## The machine

The virtual mail machine is the in-browser registry:

| Piece | Where | What it is |
|---|---|---|
| Instance | `src/lib/glyphoku/registry.ts` | `g`, domains, mailboxes, permits, deliveries, spent permits |
| Names | same file | `owner@<label>.glyphoku.localhost` only |
| Freeze | `freezeDraft` | Canonical subject, body, sender, to, bcc, SHA-256 digest |
| Domain | `commitDomain` | One verified puzzle batch, then one domain and one owner box |
| Permit | `issuePermit` | One verified batch, then one draft-bound READY permit |
| Delivery | `sendLocal` | One local write per recipient; a second send of the same permit is a no-op |
| Store | `src/components/glyphoku/studio.tsx` | `localStorage` key `glyphoku-local-127`; bad JSON is quarantined, not repaired into mail |
| Desk | same file | The only operator surface |

There is no socket, no MX lookup, and no SMTP dialogue. External addresses fail inside `resolveMailbox` before any other work. The neighboring BEM module (`src/lib/bem-mail.ts`, addresses at `loopback.invalid`) is a separate lab. Do not merge it into this machine, and do not describe its stages as deliveries of this machine.

## The gate

The gate is the 16×16 Glyphoku cipher in `rules.ts`, `glyphs.ts`, `deal.ts`, and `solver.ts`.

- Glyphs, in order: `1 2 3 4 5 6 A B C D E ★ ◆ ♠ ♣ ♥`. Each glyph once per row, column, and 4×4 box.
- Played topology is `PLAYED`: order 16, box 4×4. The 4, 6, 9, and 12 rungs are not dealt.
- `P(g) = 2^(g-1)`. g=1 needs 1 puzzle. g=2 needs 2. g>2 is paused by `HORIZON_G = 2`.
- Empty-cell bands, independent of pace: g=1 is 124–132; g=2 is 133–140. g=2 starts strictly above g=1.
- `dealPlayable` keeps the candidate with the most guesses that still finishes. Caps: 12,000 events at g=1, 18,000 at g=2. Minimum guesses: 8 and 12. The solution used to score a candidate is discarded. The visible solver starts again from givens.
- A finished animation does not create a domain or a permit. `verifyCandidate` must accept the grid, givens must be unchanged, and the empty count must sit in band.

## Pace

The desk timer fires every 100 ms and applies `speed` events per tick. **24× means 24 events per tick, 240 events a second.** It is the default. 1×, 8×, and 40× remain available. Pace does not change the band, the ordinal, or the permit.

A sample of five deals, measured 2026-10-06, is an observation, not a service level:

- Domain, one board, on screen at 24×: about 20 seconds. Observed span 3–48 seconds.
- Envelope, two boards, on screen at 24×: about 1½ minutes of drawing, about 30–50 seconds each.
- Composing, before the first cell moves: usually a few seconds, sometimes up to a minute. One g=2 seed found no board inside the cap and stopped after about 70 seconds with nothing issued.

## Two journeys, in order

**Domain.** The user asks for a free local label and presses Solve & Create Domain. Show the givens, then the live search, including guesses and retractions. After the required puzzle verifies, `commitDomain` writes one domain and `owner@<label>.glyphoku.localhost`, and advances `g` from 1 to 2. Reading that mailbox later does not solve another puzzle.

**Envelope.** The user writes a message to a mailbox that already exists on this instance. `freezeDraft` runs before any new puzzle. Solve for Envelope plays `P(g)` fresh boards at the current band. `issuePermit` stores one permit in READY, bound to that sender and that digest, and advances `g`. The desk shows READY—NOT SENT. Send calls `sendLocal` once. A repeated send does not write a second copy. A changed draft needs a new permit and, while issuance is still open, a new game. After g=2, issuance is paused, so a third resource is refused in words, not by a weaker puzzle.

## Rules you do not get to soften

- Do not deal a digit sudoku and call it Glyphoku.
- Do not hide the search and paint a known solution. A stored replay cannot issue mail.
- Do not open a public listener, publish DNS, or accept `user@example.com`.
- Do not call a local commit consensus, a permit a coin, or a glyph a key.
- Do not mark any of the 4,800 source controls PASS because this machine runs. They stay NOT_ASSESSED unless a later, separate assessment names each ID and its evidence.
- Do not install the excluded BEM parent packs or the twelve Glyphoku parent zips as if this series had certified them.
- If a puzzle cannot be dealt inside the band and the event cap, stop and say so. Do not drop clues until the search is easy, and do not raise the cap in silence.

## What to return after an authorized run

The diff, the two journeys actually clicked or driven, the inbox bytes, the refusal of an external address, the idempotent second send, the pause at g=3, and the event counts and wall times at 24×. State NOT_ASSESSED for every source control you did not assess. State NOT_STARTED for any workflow in this series you did not run.
