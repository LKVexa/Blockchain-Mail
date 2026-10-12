# W03 — Domain journey

**Status: NOT_STARTED** · Requires W02.

## Do

From an empty instance (`g` is 1), choose a short lowercase label that is not reserved (`localhost`, `mail`, `www`, `glyphoku`). Press Solve & Create Domain. Watch the one required board through `SEARCH_SOLVED`. The desk then calls `commitDomain` with that givens array and the visible candidate.

Expect one domain `<label>.glyphoku.localhost`, one mailbox `owner@<label>.glyphoku.localhost`, and `g` equal to 2. Reload the page. The mailbox is still there. A second press for the same label is refused. Solving is not repeated for a mailbox that already exists.

## Pass

The mailbox survives reload, `g` is 2, and the puzzle count for that commit was 1.

## Fail

The domain appears before the search finishes, the address is not under `glyphoku.localhost`, or reload drops the mailbox.

## Evidence

The address, the storage key after reload, and `g`.
