# W07 — Prove refusals at the correct validators and under hostile state

**Series 1.1.0 · Profile `GLYPHOKU_VEM_127/1`**  
**Workflow status:** NOT_STARTED · **Assessment:** NOT_ASSESSED

[Master prompt](MASTER_PROMPT.md) · [Master workflow](MASTER_WORKFLOW.md) · [Technical contracts](INTEGRATION_CONTRACTS.md) · [Acceptance plan](ACCEPTANCE_TEST_PLAN.md)

## Entry gate

W06 PASS for the accepted journey; isolated snapshots at g=1, g=2 and g=3; authorized fault/concurrency/network test environment. If a prerequisite is missing, retain the current state and mark BLOCKED. A completed reading or baseline test does not satisfy this gate.

## Candidate binding and source adaptation

**Existing code to inspect:** All scoped Glyphoku code and the new adapter boundaries; src/lib/glyphoku/glyphoku.test.ts; package/runtime files. Neighboring code is inspected for unintended diff only.

**Finding owners:** F01–F15. Consult the exact baseline observations in [CANDIDATE_AUDIT.md](CANDIDATE_AUDIT.md). Suggested helper adapters are new work only when present in the reviewed diff.

The old W07 ran negatives against the completed g=3 instance. This version uses validator-specific preconditions so the horizon cannot mask broken checks, and expands corruption, concurrency, storage and platform coverage.

The original dossier is retained at [source-series/W07_REFUSE.md](source-series/W07_REFUSE.md). Preserve its source identity and evidence boundary; this revision adds explicit enforcement and verification steps rather than declaring the original requirements satisfied.

## Master prompt for this workflow

```text
Build an expected-versus-observed regression record for the real integrated candidate, not a list of intended protections. Each test must establish the correct g/revision and reach its named validator. Retain distinct fixtures for math, label, duplicate/replay, draft, recipient, storage, cross-tab and horizon tests. Include direct mutation-boundary calls because UI-only refusals did not cover the baseline gaps. Challenge malformed raw JSON, nested schema relations, missing spent data, stale snapshots, concurrent sends, quota/access/lock failure and uncertain writes. Observe both browser and relevant process networking in the local profile. Keep platform results honest; an unavailable Windows/browser/build environment is NOT_RUN or BLOCKED, never a generated pass. Do not execute source parent packs or broaden into real external email.

Work only in the authorized copy. Preserve exact source/profile identities and
prior committed data. Record evidence under the run/workflow/attempt ID.
Do not change source-control assessments or report unexecuted work as PASS.
```

## Do — implementation and verification sequence

1. Rerun the baseline Glyphoku tests and every new lower-level acceptance case, preserving their separate identities and results.

2. For each negative, state g/revision, intended validator and exact refusal reason. Reject horizon-only evidence for tests that require g=1 or g=2.

3. Load syntactically and semantically malformed storage fixtures; verify raw-byte preservation, read-only recovery and structured errors rather than empty resets.

4. Race cooperating tabs and stale snapshots through the real shared writer. Verify one consistent committed result, no duplicate spend and no stale READY restoration.

5. Inject storage/lock/migration/quota failures at each boundary, including ambiguous acknowledgment, and reconcile only by the same operation ID.

6. Capture local-profile browser and process traffic while running the required journeys; verify activated root/auth/PWA/preview behavior without sending external mail.

7. Run approved typecheck, relevant full regression/build and normal-user Windows/error-path checks. Keep unavailable prerequisites explicitly blocked and preserve unchanged-neighbor hashes.

8. Update every case and finding with real evidence, rerun fixes on new attempt IDs, and hand W08 a complete results matrix rather than a claimed blanket pass.

## Acceptance checklist

- [ ] **GV110-W07-T01 — Validators are not masked by horizon.** Each reaches and fails its intended validator; ISSUANCE_PAUSED alone never passes another negative case.
- [ ] **GV110-W07-T02 — Malformed JSON preservation.** Original bytes are preserved; mutation blocked; no automatic empty-instance overwrite, even if quarantine/export fails.
- [ ] **GV110-W07-T03 — Nested schema and relation validation.** Structured corruption/incompatibility result; no uncaught TypeError or invented defaults that reopen spend.
- [ ] **GV110-W07-T04 — Cross-tab send race.** One consistent final snapshot and one delivery per recipient; all cooperating writers share the same lock.
- [ ] **GV110-W07-T05 — Stale-tab rollback prevention.** Stale mutation denied; newer spend preserved. Manual hostile storage rollback is documented as outside the threat model, not falsely proven impossible.
- [ ] **GV110-W07-T06 — Storage/lock unavailable.** Fail closed or read-only; no optimistic success, hidden unsafe lock fallback or source-byte destruction.
- [ ] **GV110-W07-T07 — Runtime external-network boundary.** No runtime external dependency or external mail lookup; activated auth/PWA/preview paths are either local and tested or disabled by the explicit profile.
- [ ] **GV110-W07-T08 — Cross-platform and unchanged-neighbor regression.** Actual results recorded; missing environments BLOCKED/NOT_RUN; no unrelated BEM/JA21/Penteract changes or source-control PASS propagation.

Each checkbox is evidence-backed acceptance, not a claim that its test has already run. Full fixture, stimulus and evidence requirements appear in [ACCEPTANCE_TEST_PLAN.md](ACCEPTANCE_TEST_PLAN.md) and [registers/ACCEPTANCE_CASES.json](registers/ACCEPTANCE_CASES.json).

## Pass

All required negative, race, corruption, network and regression cases reach their intended boundaries and match their expected outcomes with unchanged-state evidence. Missing mandatory environments remain blocking, not waived by a unit-test result. Every listed mandatory case must have retained evidence for this target revision. Source controls remain NOT_ASSESSED; tests at the wrong precondition do not count.

## Fail

Masked validators, empty-store resets, stale writes, duplicated rows, false success on failed storage, external runtime dependencies under the local-only claim, or unsupported platform PASS claims block release. Record the failing case and preserve its evidence. INCONCLUSIVE is used for insufficient observation, never silently converted into PASS.

## Evidence

Per-case results and g/revision fixtures; exact reason codes; before/after bytes/hashes; concurrency/fault timelines; browser/process network records; test/build/Windows commands and exits; finding dispositions.

For each attempt use [templates/WORKFLOW_RUN_TEMPLATE.json](templates/WORKFLOW_RUN_TEMPLATE.json). Record exact command/action, fixture provenance, g/revision, source/profile hashes, expected/observed result, before/after state, affected identifiers, logs/captures and cleanup. Keep synthetic content distinct from any user data. Do not paste environment secrets or unrelated identity data into the record.

## Stop, rollback and checkpoint

Restore only named disposable test fixtures and stop only processes started by this run. Preserve the accepted journey state, original archives and all failing attempt evidence; do not erase evidence during cleanup.

Checkpoint the workflow and case results, last committed revision/receipt, invalidated/pending run IDs, open findings and the next permitted action. Only a PASS gate authorizes the next dependent journey. If blocked, independent static work may continue without claiming dependent issuance or delivery has occurred.
