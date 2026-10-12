# W07 — Refusals

**Status: NOT_STARTED** · Requires W06.

## Do

Run these cases against the same instance. Each must refuse or no-op without a new domain, permit, or delivery.

| Case | Expected |
|---|---|
| Send the same permit again | `ok`, same delivery list length |
| Send that permit with a different body digest | refusal, no new row |
| Recipient `outsider@example.com` | refused before lookup |
| Candidate that changes a given | `commitDomain` / `issuePermit` refusal |
| Batch of one puzzle at `g` = 2 | refusal, wrong count |
| Empty count outside the band | refusal |
| Reserved label `mail` | refusal |

## Pass

Every row matches, and the delivery count is unchanged after the repeated send.

## Fail

Any row creates mail, or a repeated send duplicates the inbox row.

## Evidence

The refusal string or the unchanged delivery length for each row.
