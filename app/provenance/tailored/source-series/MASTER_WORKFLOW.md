# Master workflow — Glyphoku virtual mail

**Series 1.0.0 · Profile `GLYPHOKU_VEM_127/1`**

Read [MASTER_PROMPT.md](MASTER_PROMPT.md) first. Run the workflows in order. A later workflow must not invent mail that an earlier gate refused.

| ID | File | Attaches | Starts as |
|---|---|---|---|
| W00 | [W00_BIND.md](W00_BIND.md) | Name the machine and the cipher files | NOT_STARTED |
| W01 | [W01_CIPHER.md](W01_CIPHER.md) | 16×16 glyph rules and hard bands | NOT_STARTED |
| W02 | [W02_PACE.md](W02_PACE.md) | Visible solver, default 24× | NOT_STARTED |
| W03 | [W03_DOMAIN.md](W03_DOMAIN.md) | First journey, one puzzle, one mailbox | NOT_STARTED |
| W04 | [W04_FREEZE.md](W04_FREEZE.md) | Draft frozen before the envelope game | NOT_STARTED |
| W05 | [W05_PERMIT.md](W05_PERMIT.md) | Second journey, two puzzles, one permit | NOT_STARTED |
| W06 | [W06_DELIVER.md](W06_DELIVER.md) | Explicit send into the local inbox | NOT_STARTED |
| W07 | [W07_REFUSE.md](W07_REFUSE.md) | External mail, bad grids, double send | NOT_STARTED |
| W08 | [W08_HORIZON.md](W08_HORIZON.md) | Pause after g=2, evidence, handoff | NOT_STARTED |

## How to advance

Each file has four lines that must be filled with observations, not intentions: **Do**, **Pass**, **Fail**, **Evidence**. Copy those headings into the run log. Leave the status NOT_STARTED until that workflow's evidence exists.

Shared gates:

1. The cipher alphabet on the board includes a digit, a letter, and a symbol. A board of only `1–9` is a fail.
2. The visible event list contains `INIT` before a placement, and at least one `GUESS` on every issued board. A retraction is required on the g=2 boards used for a permit.
3. `commitDomain` and `issuePermit` refuse a batch of the wrong length, a changed given, or an empty-count outside the band.
4. `sendLocal` writes inbox rows only for `*.glyphoku.localhost` mailboxes already on the instance.
5. Pace 24× is selected when the desk loads. Changing it does not change `g` or the band.
6. No workflow may report PASS for a BEM stage, a public SMTP session, or a source-control ID.

## Stop conditions

Stop the series, keep earlier evidence, and mark the current workflow BLOCKED when:

- the dealer throws because no cipher in band finished under the event cap
- the headed view cannot show the grid
- persistence rewrites a spent permit back to READY
- someone asks to deliver outside `glyphoku.localhost`

Do not "finish the demo" by skipping the cipher.
