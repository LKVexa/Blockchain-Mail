# Local integration API

**Base:** actual `http://127.0.0.1:<configured-port>` · **Profile:** `GLYPHOKU_VEXA127/2`

All game endpoints require a valid operator Bearer token. POST additionally requires JSON, `Content-Type: application/json`, and `X-BVE-Request: 1`; a supplied Origin must exactly match. Never put tokens in URLs. There is no CORS wildcard or remote RPC configuration. Error responses identify a refused condition without claiming partial success.

| Method/path | Bound input | Result/side effect |
|---|---|---|
| GET `/health` | No credentials | Version, literal listeners, separate credit and game profiles, bounds |
| GET `/api/glyphoku/state` | Operator | Current validated registry projection, revision, operations, active-run summary; no mailbox token |
| POST `/api/glyphoku/start` | `action`, `intent`, `expected_revision`, `instance_id`, `operation_id` | Start private bounded preparation, or return an exact committed operation; no resource yet |
| POST `/api/glyphoku/poll` | `run_id`, `observer_key` | Read phase/current frame; refresh observer lease, no issuance |
| POST `/api/glyphoku/ack` | Above plus exact `frame_id`, `digest` | Acknowledge pending initial/live/final frame; final checks may enable commit or next board |
| POST `/api/glyphoku/advance` | Run identity, `count` in 1/8/24/40, boolean `single_step` | Advance only with no pending frame; a single step requires count=1 and remains paused |
| POST `/api/glyphoku/control` | Run identity, action `pause`, `resume`, `hidden` or `stop` | Pause/resume or cancel worker/live authority; not a database rollback |
| POST `/api/glyphoku/commit` | Run identity and original `operation_id` | Atomically create domain or READY permit after all barriers; exact replay returns prior result |
| POST `/api/glyphoku/send` | `permit_id`, exact frozen `draft`, current `expected_revision`, `instance_id`, `operation_id` | Actual local mail transaction or exact prior receipt; READY never auto-sends |
| POST `/api/glyphoku/abandon` | Empty JSON | Authenticated operator cancels its active unfinished run |
| GET `/api/glyphoku/operation?id=...` | Completed operation ID | Read-only uncertainty recovery; no solver or send |
| GET `/api/glyphoku/trace?id=...` | Completed operation ID | Full retained logical traces and bounded metrics; does not prove human observation |
| GET `/api/glyphoku/mail` | Operator | Actual game Inbox messages, decrypted for the authorized operator |
| POST `/api/glyphoku/credential` | Empty JSON | Explicitly reveal the generated mailbox's read credential; private, do not log/publish |
| POST `/api/admin/verify` | Optional checkpoint | Signed ledger/state/object/permit/account invariant checks |

Domain intent is `{label: string}`. Envelope intent is `{draft: frozenDraft}`. A frozen draft has precisely `from`, `to`, `bcc`, `subject`, `body`, `digest` with normalized local strings/arrays; the digest is excluded from its own canonical preimage. The safe exported `freezeDraft` helper is a formatter, not issuance authority. POST schemas reject extra fields such as client-provided proof or solved grids.

Typical phases: PREPARING -> INITIAL_FRAME -> LIVE SOLVING -> FINAL_FRAME -> next INITIAL_FRAME or COMMIT_READY -> COMMITTED. A fault can produce FAILED; Stop produces CANCELLED. `paused` is independent state. Restarts do not restore uncommitted observer/run capabilities. `COMMIT_READY` is not a persisted domain/permit and certainly not a delivery.

Resource replies are under `result`; for example envelope result status READY includes `not_sent:true`, while an explicit-send result is DELIVERED_LOCAL. `replayed:true` identifies an existing operation. A read-back failure after commit must trigger read-only lookup, not a blind new operation ID.

The retained legacy endpoints and SMTP use `LOCAL127_CREDIT_V1`. Game mailboxes are refused by the old send/stamp-cancel/token-rotation paths. The separate namespace and mechanism tags are deliberate. No new uncontrolled bridge from public addresses, wallets or hosted identity providers is exposed.

See `tools/glyphoku-check.mjs` for an actual synthetic protocol driver, with test-only programmatic acknowledgments clearly separated from UI acceptance.
