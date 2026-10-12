# W04 — Freeze the draft

**Status: NOT_STARTED** · Requires W03.

## Do

Compose from the owner mailbox to that same mailbox, or to another mailbox already on the instance. Subject 1–120 characters, no line break. Body present, at most 4,000 characters. Call `freezeDraft` before Solve for Envelope.

Confirm the frozen record has `from`, `to`, `bcc`, `subject`, `body`, and a SHA-256 `digest` of that canonical JSON. Changing the body after freeze must produce a different digest. An address that does not end in `.glyphoku.localhost` is refused here, with no puzzle started.

## Pass

The digest is stable for the same bytes and changes when the body changes. External recipients never reach the dealer.

## Fail

The solver starts and the draft is still editable, or an external address is accepted "for later."

## Evidence

Two digests (same text, then one changed character) and the refusal string for an external address.
