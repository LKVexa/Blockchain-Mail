# W08 — Keep the horizon closed and issue an evidence-backed handoff

**Series 1.1.0 · Profile `GLYPHOKU_VEM_127/1`**  
**Workflow status:** NOT_STARTED · **Assessment:** NOT_ASSESSED

[Master prompt](MASTER_PROMPT.md) · [Master workflow](MASTER_WORKFLOW.md) · [Technical contracts](INTEGRATION_CONTRACTS.md) · [Acceptance plan](ACCEPTANCE_TEST_PLAN.md)

## Entry gate

W07 results available; mandatory failed/blocked cases remain unresolved blockers, not permission to claim a completed release. If a prerequisite is missing, retain the current state and mark BLOCKED. A completed reading or baseline test does not satisfy this gate.

## Candidate binding and source adaptation

**Existing code to inspect:** src/lib/glyphoku/rules.ts: HORIZON_G/issuanceAllowed; studio.tsx footer and action admission; completed operation retrieval; run and source-status registers.

**Finding owners:** F05, F12, F15. Consult the exact baseline observations in [CANDIDATE_AUDIT.md](CANDIDATE_AUDIT.md). Suggested helper adapters are new work only when present in the reviewed diff.

The original pause and handoff remain, with an explicit distinction between new issuance and existing-operation use, measurement provenance, recovery checkpoints and release gates that cannot certify upstream controls.

The original dossier is retained at [source-series/W08_HORIZON.md](source-series/W08_HORIZON.md). Preserve its source identity and evidence boundary; this revision adds explicit enforcement and verification steps rather than declaring the original requirements satisfied.

## Master prompt for this workflow

```text
Verify that no new resource can be issued after g=2, while exact prior-operation retrieval, a previously issued READY send, repeated exact send and mailbox reading remain possible without a new puzzle. Do not raise the horizon, reset g, substitute easier work or silently import a different growth model. Prepare a final evidence-backed decision containing the actual diff, identities, measurements, case/workflow results, unresolved findings and resumable checkpoint. Separate browser persistence from server durability and local acceptance from the unassessed 4,800 source controls. A partial implementation or missing headed/Windows/network evidence must be reported precisely. Return instructions matching files that actually exist, not imagined launchers or a promised future deployment.

Work only in the authorized copy. Preserve exact source/profile identities and
prior committed data. Record evidence under the run/workflow/attempt ID.
Do not change source-control assessments or report unexecuted work as PASS.
```

## Do — implementation and verification sequence

1. Exercise new-domain and new-envelope requests at g=3 through UI and authoritative API; record no new dealer work, resource or ordinal change.

2. Use accepted READY and delivered fixtures to verify exact prior retrieval/send/retry/read remain available without reopening issuance.

3. Check all measurement records: preparation, active solving, visible elapsed time, pauses, events and render checkpoints. Report failures and sample sizes without reusing historical observations.

4. Review source attribution and control states. Leave all 4,800 upstream assessments NOT_ASSESSED unless a distinct later assessment actually supplied per-ID evidence.

5. Produce a scoped diff, before/after hashes and artifact/evidence manifest. Confirm original archives and excluded modules are preserved.

6. Create and exercise a recovery checkpoint that retains completed receipts and cancels unfinished live actions; never infer success by re-issuing.

7. Assess every mandatory gate and open finding. Mark release PASS only when evidence is complete; otherwise issue a specific PARTIAL/BLOCKED decision and next safe checkpoint.

8. Write normal-user run/recovery/origin/horizon limitations using actual tested behavior. State Windows/build/browser/network gaps and do not claim a patched artifact when only documentation exists.

## Acceptance checklist

- [ ] **GV110-W08-T01 — New issuance remains paused at g=3.** No new game, resource, horizon lift or hidden smaller puzzle; a clear paused reason is displayed.
- [ ] **GV110-W08-T02 — Existing resources remain usable.** These existing operations remain available without new issuance or puzzles.
- [ ] **GV110-W08-T03 — Measurements are scoped and honest.** Only measured samples are summarized; no historical sample or nominal 240 events/s is presented as guaranteed wall time.
- [ ] **GV110-W08-T04 — Upstream assessment boundary.** All 4,800 source assessments remain NOT_ASSESSED absent separate per-ID evidence; 72 local cases are not a replacement inventory.
- [ ] **GV110-W08-T05 — Diff and provenance handoff.** Original archives preserved; all edits attributable; no invented modified build or silently updated binding.
- [ ] **GV110-W08-T06 — Recovery checkpoint.** Committed operation receipts are retrieved; unfinished live tickets cancelled; no duplicate issuance/spend or guessed result.
- [ ] **GV110-W08-T07 — Evidence-backed release decision.** Release only with all mandatory passes and no unresolved blocker; otherwise an explicit partial/blocked decision with no fabricated approval.
- [ ] **GV110-W08-T08 — Operator handoff and limitations.** Instructions match the delivered diff; Windows/unobserved areas are labeled; browser-storage and same-origin trust limits are plain.

Each checkbox is evidence-backed acceptance, not a claim that its test has already run. Full fixture, stimulus and evidence requirements appear in [ACCEPTANCE_TEST_PLAN.md](ACCEPTANCE_TEST_PLAN.md) and [registers/ACCEPTANCE_CASES.json](registers/ACCEPTANCE_CASES.json).

## Pass

The horizon remains closed to new issuance, existing resources work as scoped, every required acceptance claim has matching evidence, and the final handoff accurately separates implementation, tests, observations and unassessed source material. Every listed mandatory case must have retained evidence for this target revision. Source controls remain NOT_ASSESSED; tests at the wrong precondition do not count.

## Fail

Any g reset/horizon extension, disabled required puzzle rule, untraceable diff, missing gate promoted to PASS, fictional timing/platform result or source-control certification by implication fails the handoff. Record the failing case and preserve its evidence. INCONCLUSIVE is used for insufficient observation, never silently converted into PASS.

## Evidence

Horizon and existing-operation records; case/workflow summaries; findings; measurement table; scoped diff/hashes; restart checkpoint; actual operator runbook; explicit release decision.

For each attempt use [templates/WORKFLOW_RUN_TEMPLATE.json](templates/WORKFLOW_RUN_TEMPLATE.json). Record exact command/action, fixture provenance, g/revision, source/profile hashes, expected/observed result, before/after state, affected identifiers, logs/captures and cleanup. Keep synthetic content distinct from any user data. Do not paste environment secrets or unrelated identity data into the record.

## Stop, rollback and checkpoint

Keep the last valid committed store and all evidence. A blocked release is a preserved checkpoint, not a reason to delete mail, unlock spent permits, redeal historical work or rewrite source assessments.

Checkpoint the workflow and case results, last committed revision/receipt, invalidated/pending run IDs, open findings and the next permitted action. Only a PASS gate authorizes the next dependent journey. If blocked, independent static work may continue without claiming dependent issuance or delivery has occurred.
