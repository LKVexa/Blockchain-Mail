# W05 — Issue one draft-bound READY envelope from two fresh boards

**Series 1.1.0 · Profile `GLYPHOKU_VEM_127/1`**  
**Workflow status:** NOT_STARTED · **Assessment:** NOT_ASSESSED

[Master prompt](MASTER_PROMPT.md) · [Master workflow](MASTER_WORKFLOW.md) · [Technical contracts](INTEGRATION_CONTRACTS.md) · [Acceptance plan](ACCEPTANCE_TEST_PLAN.md)

## Entry gate

W04 PASS, g=2 and its immutable frozen message; distinct fresh board authorization and coordinated persistence available. If a prerequisite is missing, retain the current state and mark BLOCKED. A completed reading or baseline test does not satisfy this gate.

## Candidate binding and source adaptation

**Existing code to inspect:** src/lib/glyphoku/registry.ts: issuePermit/Permit; studio.tsx: startEnvelope, finishSolved, openPermit; W01/W02 coordinator and W00 mutation adapter.

**Finding owners:** F01, F02, F03, F05, F07, F12. Consult the exact baseline observations in [CANDIDATE_AUDIT.md](CANDIDATE_AUDIT.md). Suggested helper adapters are new work only when present in the reviewed diff.

The original two-board issuance is retained. This revision enforces distinct live action provenance, digest/membership checks, one-write receipts and exact post-horizon retry retrieval that the baseline currently blocks.

The original dossier is retained at [source-series/W05_PERMIT.md](source-series/W05_PERMIT.md). Preserve its source identity and evidence boundary; this revision adds explicit enforcement and verification steps rather than declaring the original requirements satisfied.

## Master prompt for this workflow

```text
Implement the existing envelope journey at g=2 without sending automatically. Verify two distinct fresh 16x16 boards under the g=2 band and trace rules, bound to the exact frozen message and current instance/revision. Revalidate that intent inside the exclusive mutation boundary. Persist one READY permit, its authorization consumption and operation receipt while advancing g once to 3 and adding no deliveries. Display READY—NOT SENT with full frozen review. A repeated request for that exact accepted operation returns the same permit after g=3 without a new game or ordinal change. A different intent at g=3 is refused. Keep replay, hidden solutions, duplicate boards and stale callbacks outside the accepted issuance path.

Work only in the authorized copy. Preserve exact source/profile identities and
prior committed data. Record evidence under the run/workflow/attempt ID.
Do not change source-control assessments or report unexecuted work as PASS.
```

## Do — implementation and verification sequence

1. Confirm the accepted domain state is g=2 and the W04 draft remains byte-identical. Freeze the action/run binding before preparing any board.

2. Generate two distinct fresh g=2 challenges within the recorded limits. Reject duplicate fingerprints before authorizing the batch.

3. Display and solve each board in order through W02, retaining its own givens/candidate/trace/counter and rendered-checkpoint evidence.

4. Validate both boards independently, required retractions and full batch identity. Raw solved arrays or historical traces do not replace the live handle.

5. Under the same writer lock, validate current state and canonical local draft again, enforce g=2 envelope allocation, and compute one READY permit transition.

6. Persist permit, consumed authorizations, receipt and g=3 together; read back before showing READY—NOT SENT. Do not append delivery rows or trigger send.

7. Exercise exact accepted-operation retrieval after g=3, duplicate callbacks and different-intent horizon refusal with unchanged state assertions.

8. Reload READY and hand its exact permit ID plus complete frozen content to W06. Historical reload data must not resurrect an uncommitted live run.

## Acceptance checklist

- [ ] **GV110-W05-T01 — Exactly two fresh boards issue READY.** One READY permit bound to sender/draft/recipients, g=3, zero delivery rows, READY—NOT SENT shown.
- [ ] **GV110-W05-T02 — Wrong count and duplicate batch.** Correct count/distinctness failure, no permit or ordinal change.
- [ ] **GV110-W05-T03 — No hidden/replayed authorization.** No issuance; mathematical validity alone is insufficient.
- [ ] **GV110-W05-T04 — Revalidate frozen intent at issue.** Only the exact canonical local intent is eligible; forged FrozenDraft is refused.
- [ ] **GV110-W05-T05 — Exact retry after horizon.** Same permit/receipt is returned, with no new board, resource, revision or g increment.
- [ ] **GV110-W05-T06 — Different draft at g=3.** Issuance-paused refusal; no misleading old-permit match or replacement.
- [ ] **GV110-W05-T07 — Duplicate completion callbacks.** At most one new permit and one ordinal increment; exact duplicate retrieves prior receipt; conflicting/stale intent is denied.
- [ ] **GV110-W05-T08 — READY survives reload without send.** Permit remains READY, no automatic delivery, no revived live run and no reset of the horizon.

Each checkbox is evidence-backed acceptance, not a claim that its test has already run. Full fixture, stimulus and evidence requirements appear in [ACCEPTANCE_TEST_PLAN.md](ACCEPTANCE_TEST_PLAN.md) and [registers/ACCEPTANCE_CASES.json](registers/ACCEPTANCE_CASES.json).

## Pass

Exactly two fresh eligible live boards produce one persisted READY permit with the correct sender, digest and recipient scope; g is 3 and deliveries remain empty. Exact completed-operation retry/reload preserves that permit without new work. Every listed mandatory case must have retained evidence for this target revision. Source controls remain NOT_ASSESSED; tests at the wrong precondition do not count.

## Fail

Wrong/duplicate batch, forged or changed draft, replay-only authorization, premature send, double ordinal advancement, lost READY state or horizon-blocked exact retrieval is a failure. Record the failing case and preserve its evidence. INCONCLUSIVE is used for insufficient observation, never silently converted into PASS.

## Evidence

Two distinct board fingerprints and traces; intent/draft bytes/digest; permit ID/state; g/revision/receipt; zero delivery count; post-horizon retry and reload results.

For each attempt use [templates/WORKFLOW_RUN_TEMPLATE.json](templates/WORKFLOW_RUN_TEMPLATE.json). Record exact command/action, fixture provenance, g/revision, source/profile hashes, expected/observed result, before/after state, affected identifiers, logs/captures and cleanup. Keep synthetic content distinct from any user data. Do not paste environment secrets or unrelated identity data into the record.

## Stop, rollback and checkpoint

Cancel uncommitted actions and discard their tickets. Preserve a successfully committed READY permit and g=3; never reset the ordinal or mint a replacement after an uncertain acknowledgment.

Checkpoint the workflow and case results, last committed revision/receipt, invalidated/pending run IDs, open findings and the next permitted action. Only a PASS gate authorizes the next dependent journey. If blocked, independent static work may continue without claiming dependent issuance or delivery has occurred.
