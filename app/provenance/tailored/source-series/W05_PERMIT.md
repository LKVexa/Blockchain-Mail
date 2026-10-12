# W05 — Envelope permit

**Status: NOT_STARTED** · Requires W04.

## Do

Press Solve for Envelope at `g` = 2. The machine requires two fresh boards, each in the 133–140 empty band, each verified on its own. The domain puzzle from W03 must not be reused.

`issuePermit` writes one permit: sender, draft digest, recipients, state `READY`. The desk shows READY—NOT SENT. `g` becomes 3. A second permit for the identical frozen draft returns the existing permit instead of a second game reward. A different digest does not match this permit.

Issuance at `g` = 3 is paused. Do not deal a third resource to get around that.

## Pass

One READY permit, bound to the W04 digest, after exactly two verified boards, and `g` is 3.

## Fail

One board is accepted, the permit is already DELIVERED, or the domain solution is copied in as board two.

## Evidence

Permit id, digest match, puzzle count 2, and the pause text if a further issue is attempted.
