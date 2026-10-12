# W06 — Deliver into the inbox

**Status: NOT_STARTED** · Requires W05.

## Do

Press Send on the READY permit. `sendLocal` appends one delivery per distinct recipient, copies subject and body from the frozen draft, marks the permit `DELIVERED_LOCAL`, and records the permit id in `spentPermits`.

Open the inbox on that mailbox and read the subject and body. Reload. The message is still there. This read does not deal a puzzle and does not change `g`.

## Pass

The inbox shows the frozen subject and body after reload, and `g` is still 3.

## Fail

The body differs from the frozen draft, the message exists only on screen and not in storage, or send itself deals another cipher.

## Evidence

The delivery id, the mailbox address, and the stored subject after reload.
