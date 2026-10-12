# W03 — Create exactly one local domain through the coordinated store

**Series 1.1.0 · Profile `GLYPHOKU_VEM_127/1`**  
**Workflow status:** NOT_STARTED · **Assessment:** NOT_ASSESSED

[Master prompt](MASTER_PROMPT.md) · [Master workflow](MASTER_WORKFLOW.md) · [Technical contracts](INTEGRATION_CONTRACTS.md) · [Acceptance plan](ACCEPTANCE_TEST_PLAN.md)

## Entry gate

W02 PASS; W00 storage adapter implemented and verified; fresh compatible synthetic g=1 fixture. If a prerequisite is missing, retain the current state and mark BLOCKED. A completed reading or baseline test does not satisfy this gate.

## Candidate binding and source adaptation

**Existing code to inspect:** src/lib/glyphoku/registry.ts: normalizeLabel, domainAddress, commitDomain; studio.tsx: startDomain/finishSolved; shared mutation adapter proposed under src/lib/glyphoku/.

**Finding owners:** F01, F06, F07, F11, F12. Consult the exact baseline observations in [CANDIDATE_AUDIT.md](CANDIDATE_AUDIT.md). Suggested helper adapters are new work only when present in the reviewed diff.

The source journey is retained, with authoritative action allocation, one-store write acknowledgment, exact final-candidate binding and concurrent/stale-call checks added.

The original dossier is retained at [source-series/W03_DOMAIN.md](source-series/W03_DOMAIN.md). Preserve its source identity and evidence boundary; this revision adds explicit enforcement and verification steps rather than declaring the original requirements satisfied.

## Master prompt for this workflow

```text
Use the existing domain/mailbox types and address construction. From a fresh compatible instance at g=1, admit an available local label, show one eligible live board, verify the exact final candidate and perform a single coordinated transition creating one domain and one owner mailbox with g=2. Validate label availability before unnecessary dealing and again inside the lock. Reserve g=2 for the subsequent envelope in this selected profile; do not create another domain or lift the horizon. Publish success only after the stored snapshot and operation receipt are acknowledged. Preserve valid legacy-incompatible registries read-only rather than erasing them. Reload and mailbox reading must not initiate another game.

Work only in the authorized copy. Preserve exact source/profile identities and
prior committed data. Record evidence under the run/workflow/attempt ID.
Do not change source-control assessments or report unexecuted work as PASS.
```

## Do — implementation and verification sequence

1. Create an explicitly synthetic ABSENT/fresh registry at the approved origin, or load a reviewed compatible fixture. Confirm g=1 and zero resources.

2. Normalize and validate the requested label, including reserved/duplicate checks. Freeze the normalized label into the domain intent before preparation.

3. Run exactly one fresh eligible board through the W01/W02 pipeline. Correlate the final rendered candidate, verifier result and one-use action handle.

4. Acquire the shared mutation lock, re-read the store and recheck instance, revision, label availability, g=1 and action policy.

5. Compute one pure domain-plus-owner-mailbox transition with g=2; attach its operation receipt and consumed challenge/run data in the same persisted snapshot.

6. Check read-back before showing Domain created. On failed/ambiguous persistence, refuse success and reconcile by the same operation ID.

7. Reload the same origin, inspect the owner address and confirm reads do not deal work. Preserve g=2 for W04/W05.

8. Run duplicate-label, wrong-batch, alternate topology/final-candidate and race/fault cases in separate precondition fixtures, never by corrupting the accepted journey state.

## Acceptance checklist

- [ ] **GV110-W03-T01 — One-board domain commit.** One studio.glyphoku.localhost domain, one owner mailbox, g=2 and exactly one accepted operation receipt.
- [ ] **GV110-W03-T02 — Label validation before work.** Specific label/duplicate refusal occurs before unnecessary dealing; no renamed fallback or extra domain.
- [ ] **GV110-W03-T03 — Wrong domain batch length.** Wrong-batch-length refusal and no ordinal/resource change.
- [ ] **GV110-W03-T04 — Final candidate binding.** Domain transition is denied even after animation termination; the final visible grid must match the verified candidate.
- [ ] **GV110-W03-T05 — Reserve envelope ordinal.** Wrong-action-for-ordinal refusal with g=2 preserved for the envelope; no hidden horizon extension.
- [ ] **GV110-W03-T06 — Persist before success.** No false created label; prior bytes remain intact or an ambiguous write is recovery-needed and reconciled by operation ID.
- [ ] **GV110-W03-T07 — Reload and read without work.** Same domain/mailbox and g=2 survive; mailbox read starts no puzzle.
- [ ] **GV110-W03-T08 — Racing domain submissions.** Only one new transition commits; exact retry retrieves it, incompatible contender is refused as stale or wrong action.

Each checkbox is evidence-backed acceptance, not a claim that its test has already run. Full fixture, stimulus and evidence requirements appear in [ACCEPTANCE_TEST_PLAN.md](ACCEPTANCE_TEST_PLAN.md) and [registers/ACCEPTANCE_CASES.json](registers/ACCEPTANCE_CASES.json).

## Pass

One and only one domain and owner mailbox are committed from a verified one-board action; g becomes 2, persistence survives same-origin reload, and every failed/racing/second-domain attempt preserves the valid state. Every listed mandatory case must have retained evidence for this target revision. Source controls remain NOT_ASSESSED; tests at the wrong precondition do not count.

## Fail

Premature UI success, unacknowledged write, orphan mailbox, wrong topology, second-domain consumption of g=2, duplicate ordinal increment or destructive reset is a blocking failure. Record the failing case and preserve its evidence. INCONCLUSIVE is used for insufficient observation, never silently converted into PASS.

## Evidence

Normalized label; one-board authorization; domain/mailbox IDs and address; receipt/revision; before/after and reload snapshots; failed-label/race/storage cases.

For each attempt use [templates/WORKFLOW_RUN_TEMPLATE.json](templates/WORKFLOW_RUN_TEMPLATE.json). Record exact command/action, fixture provenance, g/revision, source/profile hashes, expected/observed result, before/after state, affected identifiers, logs/captures and cleanup. Keep synthetic content distinct from any user data. Do not paste environment secrets or unrelated identity data into the record.

## Stop, rollback and checkpoint

Cancel uncommitted work. Preserve a committed domain and receipt; never decrement g or delete it to rerun the demo. Restore only an explicitly disposable test fixture, keeping the accepted journey evidence unchanged.

Checkpoint the workflow and case results, last committed revision/receipt, invalidated/pending run IDs, open findings and the next permitted action. Only a PASS gate authorizes the next dependent journey. If blocked, independent static work may continue without claiming dependent issuance or delivery has occurred.
