# Master workflow — candidate-bound execution sequence

**Series 1.1.0 · Profile `GLYPHOKU_VEM_127/1` · All revised workflows initially `NOT_STARTED`**

Read [MASTER_PROMPT.md](MASTER_PROMPT.md). The existing app is the baseline, not a greenfield build. All implementation and test states below are for a **future authorized run**; inspection evidence already supplied is recorded separately in [CANDIDATE_AUDIT.md](CANDIDATE_AUDIT.md).

| Order | Dossier | Boundary to establish | Evidence gate |
|---|---|---|---|
| W00 | [Bind, preserve and isolate](W00_BIND.md) | Exact candidate, one store, actual host/runtime, mutation policy | Baseline manifest, scope, snapshot, runtime and origin binding |
| W01 | [Cipher and authorization](W01_CIPHER.md) | Locked topology, complete uniqueness, bounded fresh batch | Positive and negative math/trace/duplicate tests |
| W02 | [Visible solver and pace](W02_PACE.md) | Initial/final frame, bounded real events, cancellation | Headed observation, pause/step/stop and stale-result evidence |
| W03 | [Domain transaction](W03_DOMAIN.md) | g=1 domain + owner mailbox, one coordinated write | One-board receipt, g=2, same-origin reload |
| W04 | [Frozen draft](W04_FREEZE.md) | Immutable canonical bytes and revalidation | Canonical vectors, mutation resistance, pre-deal refusals |
| W05 | [Envelope permit](W05_PERMIT.md) | Two fresh boards at g=2, READY, exact retries | Per-board evidence, one permit, g=3, zero deliveries |
| W06 | [Explicit local delivery](W06_DELIVER.md) | Exact permit spend + rows + receipt together | Inbox after reload, repeated send unchanged, failure injection |
| W07 | [Adversarial regression](W07_REFUSE.md) | Correct-validator negatives and cross-tab/storage tests | Expected-vs-observed matrix with precondition state |
| W08 | [Horizon and handoff](W08_HORIZON.md) | No new g=3 issuance; existing resources remain usable | Release decision, source-status boundary and complete checkpoint |

## Execution mechanics

For each dossier, resolve the entry prerequisites; read its source references and current target symbols; create failing tests for the stated baseline gaps; implement the smallest scoped changes; run the named unit/integration tests; perform headed observations where required; retain immutable attempt evidence; evaluate its Pass/Fail gate; and checkpoint. A failed attempt is never overwritten by a later successful one.

W00 establishes the storage/transaction design and preserves existing state. Implement the shared persistence adapter early enough that W03 never relies on an unreviewed optimistic-write effect. W01 establishes run-authorization contracts; W02 establishes their visible controller. W03 and W05 exercise those common boundaries through separate resource transitions. W04 verifies canonical draft semantics before any envelope preparation. W06 consumes only a completed W05 permit. W07 re-runs all relevant lower-level tests in isolated fixtures and adds interactions that the happy path cannot reach. W08 does not create a third issuance to make its handoff look complete.

Code may be organized in implementation increments before a journey is executed, but a later **acceptance gate** cannot pass on a failed predecessor. Independent static checks may continue after a blocked headed test; dependent issuance and delivery claims remain blocked.

## State model for this workflow library

| Field | Allowed values | Meaning |
|---|---|---|
| `workflow_status` | NOT_STARTED, IN_PROGRESS, COMPLETE, BLOCKED | Whether the dossier's work was performed |
| `assessment` | NOT_ASSESSED, PASS, FAIL, INCONCLUSIVE, NOT_APPLICABLE | Evidence-based verdict for its declared scope |
| `case_status` | NOT_RUN, PASS, FAIL, BLOCKED | Result of one authored acceptance case |
| `source_control_assessment` | NOT_ASSESSED unless separately evidenced | Never inherited from local acceptance |

Completing a failing test attempt can produce `COMPLETE / FAIL`; it does not release the next dependent journey. `NOT_APPLICABLE` requires an explicit reviewed scope decision and cannot waive the mandatory cipher, two journeys, visible solving, local-only scope or horizon.

## Required log for every attempt

Record: run ID; workflow/case ID; attempt number; baseline and edited source hashes; target profile digest; origin and instance/revision; fixture provenance; operator/mode; exact command or browser action; environment and clock; expected and observed outcomes; before/after state hashes and resource counts; applicable trace/candidate/draft/receipt identifiers; stdout/stderr or browser evidence; assessment; findings; cleanup; and checkpoint. Use the machine-readable template in [templates/WORKFLOW_RUN_TEMPLATE.json](templates/WORKFLOW_RUN_TEMPLATE.json).

Use synthetic mail only. Redact unrelated cookies, keys, identity data and environment secrets. Do not copy large parent archives into evidence or emit their contents into execution prompts.

## Blocking conditions

A target identity conflict, missing approved runtime, mutable or unreadable source, invalid existing registry, unsafe archive member, unavailable single-writer mechanism, unknown runtime network path, unsupported topology, uniqueness budget exhaustion, event-cap overflow, trace/replay failure, observer loss, stale/cancelled run, digest mismatch, unknown recipient, persistence failure or unverifiable required browser observation blocks its dependent operation. Keep prior valid evidence and committed resources intact. A refused external address is an expected negative test, not a reason to enable external mail.

## Checkpoint and recovery

After each gate, persist a checkpoint containing last committed registry revision, pending run IDs, completed workflow/case states, source digests, open findings and next permitted action. On restart, bind the candidate and origin again, validate the committed store, invalidate incomplete live tickets, and retrieve any prior completed operation by its immutable ID. Do not replay uncertain resource issuance or re-spend a permit to infer whether it worked.

A release handoff requires PASS for every mandatory acceptance case, reviewed scope for any genuinely inapplicable case, no unresolved blocking finding, and the same target/profile identity across the evidence set. Partial results must be labeled partial; there is no automatic promotion from a document, screenshot or unit-test pass to integrated acceptance.
