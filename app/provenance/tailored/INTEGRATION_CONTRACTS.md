# Integration contracts — one browser registry, one issuance authority

**Series 1.1.0 · Authored target contracts, not descriptions of completed code**

These contracts operationalize the small source series against the inspected candidate. They do not add a second backend or change the played puzzle, default pace, growth formula or horizon. References to new adapter names are suggested module responsibilities, not claims that those modules already exist.

## 1. Authority and trust model

The operator is the owner of one local browser profile and its origin-local data. The app enforces accidental misuse, stale UI state, replay through normal application paths and consistent local transitions. It does not defend against a malicious owner rewriting JavaScript, clearing browser data, rolling back storage or running arbitrary same-origin code. A SHA-256 checksum detects accidental changes relative to a stored expectation; an attacker able to replace both bytes and checksum can forge it. A visible event trace is not cryptographic proof of human observation.

The authority path is:

```text
operator action -> immutable intent -> fresh run coordinator
 -> bounded preparation -> live solver + observer
 -> independent complete verification -> exclusive storage mutation
 -> persisted operation receipt -> UI success
```

A low-level verifier may accept raw arrays for mathematical testing. The resource-creation entry points may not equate those arrays with a live authorization. Keep test-only injection paths unreachable from the shipped operator surface and production mutation API.

## 2. Immutable intent and live authorization

Bind a run to at least `runId`, `action`, `instanceId`, `expectedRevision`, `g`, `profileDigest`, `intentDigest`, ordered `boardIds`, ordered `givensDigests`, generation policy version, initial-frame acknowledgment, per-board event totals, terminal result, final-candidate digest and terminal-frame acknowledgment. A domain intent includes the normalized label. An envelope intent includes sender, canonical recipient scope and the frozen draft digest. IDs must be collision-resistant for the instance; human-readable sequential display IDs need not be used as security identifiers.

The coordinator maintains live state privately; arbitrary callers cannot gain issuance authority merely by supplying a structurally matching receipt object. Persist only completed authorization consumption/audit records alongside the resource transition. On reload, historical traces can be viewed but cannot mint an uncommitted action. A persisted completed receipt supports idempotent retrieval, not a new issuance.

Authorizations are invalidated by stop, cancelled preparation, observed topology/profile change, action/intent change, registry revision mismatch, invalid uniqueness result, cap overflow, duplicate board, observer loss outside the supported pause policy, or a terminal verification failure. Do not resurrect a cancelled run when a delayed callback fires.

## 3. Mathematical acceptance predicate

For each board `b`, require all of:

```text
topology(b) == {16,4,4}
length(givens(b)) == length(candidate(b)) == 256
candidate values are integers 1..16
nonzero givens are unchanged
all 16 rows, all 16 columns, all 16 4x4 boxes contain exactly 1..16
emptyCount(givens(b)) lies in the band for the bound g
uniqueness search completed and found exactly one solution
trace began at INIT and ended at SEARCH_SOLVED
trace mutations replay exactly to the final independently checked candidate
no trace mutation changed a given
GUESS count >= 8 (g=1) or >= 12 (g=2)
RETRACT count >= 1 on every g=2 board
1 <= total event count <= 12,000 (g=1) or 18,000 (g=2)
```

`INIT` and `SEARCH_SOLVED` count toward the cap. Check the limit before accepting a terminal success. The batch contains exactly `P(g)` distinct fresh board fingerprints bound to this action; repeated objects or copied arrays are still duplicates. Its authorization has not already been consumed except when retrieving that exact previously completed operation.

Use an independent final verifier; do not ask the search stepper to attest its own correctness. Record both the algorithm and policy versions. An empty-cell band alone does not establish uniqueness or measured difficulty, and larger empty counts are not a general hardness proof.

For uniqueness return a discriminated result such as `COMPLETE_ZERO`, `COMPLETE_ONE`, `AT_LEAST_TWO`, `INVALID_INPUT` or `BUDGET_EXHAUSTED`. A search capped after discovering one solution must be BUDGET_EXHAUSTED, not COMPLETE_ONE. A deadline cannot be enforced by checking it only after an unbounded recursive fill returns; bound recursion/work and yield or use a terminable worker.

## 4. Observation and pacing

Maintain two counters: logical solver sequence and observer checkpoint sequence. At 24×, up to 24 logical events can be processed per 100 ms tick; the renderer may combine updates. Maintain a bounded event log with no sequence gaps, per-board counts and current board snapshots. Backpressure must pause generation rather than discard authorization-relevant events. Export bounded evidence after a run or stream it into a bounded local evidence collector; never allocate an unbounded array simply to satisfy tracing.

The initial givens frame must be acknowledged before live search starts. The terminal candidate must be painted and independently verified before a transition becomes commit-eligible. Preserve indicators for guesses and retractions even when multiple events share one render interval, and provide paused single-step inspection. Record what a headed browser actually rendered. Do not label hidden dealer scoring, animation replay or a headless unit-test trace as the required on-screen journey.

Pause is reversible and performs no registry mutation. Single step performs one logical transition while the run remains paused. Stop cancels the entire action and every associated outstanding preparation job; pending results must carry a generation token. Visibility loss pauses immediately; unmount/restart invalidates the live action. The evidence recorder must distinguish a paused run from a failed or cancelled run.

## 5. Canonical draft v1

Keep the candidate's current normalization explicit. `from` is an existing normalized owner mailbox chosen from the registry. `to` and `bcc` are arrays produced by splitting input on commas/whitespace, trimming, lowercasing and removing duplicates within each list while preserving first-seen order. At least one To recipient is required. Delivery uses the union of To and Bcc so overlap does not create duplicate recipient rows.

Reject CR/LF in the subject before trimming; its trimmed length is 1–120 JavaScript string code units. Body replaces CRLF with LF, is not otherwise trimmed for storage, must contain non-whitespace text, and has length at most 4,000 code units. Bare CR behavior and Unicode code-unit limits must be tested and documented rather than silently normalized differently. Introduce stricter controls only with an explicit canonicalization revision and reviewed migration.

The exact preimage is:

```text
UTF8(JSON.stringify({from,to,bcc,subject,body}))
```

Compute SHA-256 over that byte string and encode lowercase hexadecimal. Do not include `digest` in its own preimage. Type validation precedes serialization; do not permit missing arrays, nonstrings, extra unreviewed fields or prototype-sensitive coercion to define a different message. Tests compare the custom SHA-256 implementation with Node's standard crypto implementation and include non-ASCII text.

At issue and send, reconstruct canonical bytes from the frozen data, recompute the digest, verify it equals the stored digest and the permit's digest, compare authorized sender/recipient scope, and revalidate registry membership. Deep-copy mutable arrays and nested data. A caller changing the body but keeping an old digest must be refused before any state change.

The READY review displays the complete frozen message. Keep its composing fields read-only through the issuance and READY review, or separate an unmistakably different new-draft editor whose changes cannot alter or implicitly send the active permit. This revision selects the simpler locked-active-draft approach. After g=3, any new-draft issuance remains paused. Sending the exact previously frozen READY message is still permitted.

## 6. Versioned storage and migration

Retain `glyphoku-local-127` as the single authority key. A proposed schema wrapper is:

```json
{
  "schema": "GLYPHOKU_LOCAL_REGISTRY/2",
  "profile": "GLYPHOKU_VEM_127/1",
  "instanceId": "generated-instance-id",
  "revision": 0,
  "instance": {
    "g": 1,
    "domains": [],
    "mailboxes": [],
    "permits": [],
    "deliveries": [],
    "spentPermits": []
  },
  "completedOperations": [],
  "consumedChallenges": []
}
```

This wrapper is a proposed implementation format, not baseline content or an accepted migration. Define strict schemas and bounded array/message sizes before implementation. Runtime preflight must select and record bounded maximum store size and quarantine/export policy; no unlimited expansion or hidden storage quota assumption is acceptable.

Validate unique IDs and labels, exact local-address construction, domain-to-mailbox links, sender/recipient membership, permit/canonical-digest consistency, allowed states, unique spent IDs, delivery-to-permit and delivery-to-mailbox links, per-recipient uniqueness and compatible global ordinal/operation history. g must be an integer compatible with this profile, not merely positive. A missing spentPermits field must not be defaulted to an empty list in a registry containing deliveries.

Distinguish these intake outcomes: ABSENT, VALID_CURRENT, VALID_LEGACY_COMPATIBLE, VALID_LEGACY_INCOMPATIBLE, CORRUPT, UNSUPPORTED_SCHEMA and STORAGE_UNAVAILABLE. Only ABSENT permits a genuinely new empty instance. Preserve raw legacy bytes in a unique backup before a reviewed migration; map only a semantically valid compatible legacy state. Incompatible but readable history remains available read-only. Corrupt or inaccessible storage blocks writes and offers a bounded export/recovery record; a failed quarantine write must not cause source overwriting. Do not overwrite a shared quarantine slot repeatedly and call that preservation.

Origin changes are not automatic migrations. `http://127.0.0.1:8081`, `http://localhost:8081` and a hosted app have distinct storage origins. Pin one approved origin and browser profile for acceptance.

## 7. Exclusive mutation protocol

Use one coordinator for every writer, including bootstrap, migration, issuance, explicit send and any operational reset. A suitable browser mechanism is an exclusive same-origin Web Lock when available in the selected environment; feature-detect it. If unavailable, the profile is read-only until a reviewed alternative is selected. A lock lease implemented by naive localStorage get/set is not an acceptable fallback.

Inside the lock:

1. Read raw storage and validate the full current schema and relationships.
2. Check the bound instance ID; resolve an exact matching completed operation as a read-only result where applicable.
3. For a new operation, compare expected revision, current g/action, immutable intent and authorization eligibility.
4. Compute a pure next-state value. Reject before writing if any sender, recipient, draft, batch, permit or horizon condition fails.
5. Add the operation receipt and consumed authorization data to that same next-state value. Increment revision once for the committed transition.
6. Serialize and write the complete snapshot once; perform read-back and validate the expected revision/content/receipt.
7. Publish UI success only after that acknowledgment. Preserve a recovery-needed state if the write may have happened but acknowledgment is ambiguous.

If a write succeeded but read-back failed, do not blindly issue or send again. Re-read under the same lock and retrieve the same operation ID; an existing matching receipt resolves the uncertainty. A hash is a comparison tool, not a substitute for locking or a hardware durability guarantee. Browser eviction, manual clearing and power-loss persistence remain explicit limitations.

## 8. Operation state transitions

| Precondition | Operation | Committed result | New game? |
|---|---|---|---|
| Fresh compatible instance, g=1 | Domain authorization with one board | One domain, one owner mailbox, g=2 | Yes, the domain game |
| Existing domain, g=2 | Envelope authorization with two fresh boards | One READY permit, g=3, no deliveries | Yes, the envelope game |
| Exact prior completed operation | Retrieve its result | Same resource/receipt, revision and g unchanged | No |
| READY permit at g=3 | Explicit send of exact frozen message | DELIVERED_LOCAL, spent ID, one row per unique authorized recipient | No |
| Already delivered exact permit/message | Repeat send | Prior result, no extra rows or ordinal change | No |
| Any compatible state | Read mailbox | No registry mutation | No |
| g>=3 | New domain/envelope intent | Structured issuance-paused refusal | No work is dealt |

A normal domain-then-envelope self-mail flow is the only fresh-instance acceptance journey within this horizon. Multi-recipient/Bcc behavior is tested with isolated synthetic registry fixtures labeled as such; do not create additional production resources outside the horizon just to populate tests.

QUEUED exists in the baseline type but no actual queue/transport is implemented. For this profile, only the reviewed direct READY-to-DELIVERED_LOCAL path is accepted. An imported QUEUED record is unsupported/recovery-needed, not automatically spent or completed. Unknown state values, orphan deliveries or inconsistent spend records are schema failures.

## 9. Structured refusals and evidence

Use machine-readable reason codes such as INVALID_TOPOLOGY, INVALID_GIVEN, WRONG_BATCH_LENGTH, DUPLICATE_CHALLENGE, STALE_RUN, REPLAY_NOT_AUTHORIZED, UNIQUE_SEARCH_INCOMPLETE, EVENT_BUDGET_EXCEEDED, DRAFT_DIGEST_MISMATCH, UNKNOWN_LOCAL_MAILBOX, EXTERNAL_RECIPIENT, WRONG_ACTION_FOR_ORDINAL, ISSUANCE_PAUSED, STORE_CORRUPT, STORE_WRITE_FAILED and LOCK_UNAVAILABLE. W00 must finalize names before tests depend on them; the strings here are proposed identifiers, not existing exports.

Every negative test captures the precondition g/revision, the exact reason, before/after committed bytes or hashes, resource counts and any forbidden side effect. A g=3 horizon refusal does not pass a g=2 duplicate-board or digest-validation test. A denied send with no newly persisted rows is different from an optimistic UI label followed by a storage exception.

## 10. Boundaries intentionally not enlarged

No currency, consensus, public DNS registration, SMTP ingress/egress, distributed ledger, network authentication of mailbox owners, JA21 cipher merge, Penteract wave/TIFF storage, factorial lottery schedule or source-parent certification is introduced. Keep the original 4,800 source assessments intact and unassessed. Any later expansion needs its own profile, source binding and acceptance gates rather than an undocumented edit to this one.
