# W06 — Explicitly spend the selected permit into persisted local inbox rows

**Series 1.1.0 · Profile `GLYPHOKU_VEM_127/1`**  
**Workflow status:** NOT_STARTED · **Assessment:** NOT_ASSESSED

[Master prompt](MASTER_PROMPT.md) · [Master workflow](MASTER_WORKFLOW.md) · [Technical contracts](INTEGRATION_CONTRACTS.md) · [Acceptance plan](ACCEPTANCE_TEST_PLAN.md)

## Entry gate

W05 PASS and its persisted READY permit at g=3. No new game or resource issuance is allowed in this workflow. If a prerequisite is missing, retain the current state and mark BLOCKED. A completed reading or baseline test does not satisfy this gate.

## Candidate binding and source adaptation

**Existing code to inspect:** src/lib/glyphoku/registry.ts: sendLocal, Permit, Delivery; studio.tsx: Send Local Email handler and inbox; shared schema/mutation adapter.

**Finding owners:** F03, F04, F06, F07. Consult the exact baseline observations in [CANDIDATE_AUDIT.md](CANDIDATE_AUDIT.md). Suggested helper adapters are new work only when present in the reviewed diff.

The source explicit-send journey is retained, with canonical-content revalidation, recipient re-resolution, exact permit selection and a coordinated persistence/receipt boundary. Unsupported queue states no longer silently look successful.

The original dossier is retained at [source-series/W06_DELIVER.md](source-series/W06_DELIVER.md). Preserve its source identity and evidence boundary; this revision adds explicit enforcement and verification steps rather than declaring the original requirements satisfied.

## Master prompt for this workflow

```text
Send only after an explicit operator action selecting the reviewed permit ID and its complete frozen message. At the locked mutation boundary, revalidate storage, canonical digest/content, sender, authorized recipients, current mailbox membership and permit/spend consistency. Append exactly one delivery per distinct local recipient, mark DELIVERED_LOCAL and record the spend and receipt in one stored transition. Announce success only after acknowledgment. Repeated exact sends return the prior result without additional rows or puzzle work. Any content mismatch, missing recipient, unsupported state or persistence ambiguity must refuse or enter documented recovery; it must not create partial mail or reopen READY. Do not invent SMTP, queue transport or server-grade durability.

Work only in the authorized copy. Preserve exact source/profile identities and
prior committed data. Record evidence under the run/workflow/attempt ID.
Do not change source-control assessments or report unexecuted work as PASS.
```

## Do — implementation and verification sequence

1. Load and validate the exact W05 READY permit at g=3. Display full subject/body and authorized recipients before the user chooses Send.

2. Pass the selected permit ID explicitly, not a generic first-ready lookup. Acquire the shared writer lock and re-read the authoritative snapshot.

3. Recompute canonical draft bytes/digest; match the permit and operator intent; re-resolve sender and every distinct recipient in the same current instance.

4. If the exact operation was already delivered consistently, return its existing receipt with no write or extra row. Inconsistent state is a failure, not an idempotent success.

5. For an eligible READY permit, compute all recipient rows, spent ID, DELIVERED_LOCAL state and operation receipt together, with g unchanged.

6. Persist/read back the complete transition before rendering DELIVERED LOCAL. Reconcile uncertain acknowledgments by operation ID without blindly re-spending.

7. Read the recipient inbox and reload the same origin; compare stored frozen bytes. Verify read and repeat send do not deal another board or advance g.

8. Run recipient-overlap, edited-message, removed-mailbox, unsupported-state and write-fault cases using isolated fixtures that cannot corrupt the accepted journey state.

## Acceptance checklist

- [ ] **GV110-W06-T01 — Explicit exact-permit send.** Exactly the reviewed bytes enter the owner inbox; permit becomes DELIVERED_LOCAL and spent once.
- [ ] **GV110-W06-T02 — Per-recipient de-duplication.** Exactly one row per distinct authorized local mailbox, no duplicate from list overlap.
- [ ] **GV110-W06-T03 — Repeat send before/after reload.** Same completed result with unchanged delivery count, revision policy and g; no new game.
- [ ] **GV110-W06-T04 — Edited content or mismatched sender.** Binding failure before any new delivery or spend mutation.
- [ ] **GV110-W06-T05 — Recipient re-resolution at send.** Whole send is refused; no partial rows or spent permit.
- [ ] **GV110-W06-T06 — Write/acknowledgment fault.** No false success or duplicate spend; uncertainty is reconciled without creating another message.
- [ ] **GV110-W06-T07 — Invalid permit/spend states.** Structured refusal/recovery-needed state, not silent success or invented queue completion.
- [ ] **GV110-W06-T08 — Persisted inbox read is not issuance.** Frozen subject/body remain visible and persisted; no puzzle or ordinal advance.

Each checkbox is evidence-backed acceptance, not a claim that its test has already run. Full fixture, stimulus and evidence requirements appear in [ACCEPTANCE_TEST_PLAN.md](ACCEPTANCE_TEST_PLAN.md) and [registers/ACCEPTANCE_CASES.json](registers/ACCEPTANCE_CASES.json).

## Pass

The exact reviewed frozen message persists in the intended local inbox, one row per unique authorized recipient. The permit is spent once, g stays 3, repeat send/read/reload require no game, and all fault/mismatch cases preserve a consistent store. Every listed mandatory case must have retained evidence for this target revision. Source controls remain NOT_ASSESSED; tests at the wrong precondition do not count.

## Fail

Any body/digest substitution, external or missing mailbox row, duplicate delivery, partial spend, unsupported-state success or optimistic sent label before storage acknowledgment blocks acceptance. Record the failing case and preserve its evidence. INCONCLUSIVE is used for insufficient observation, never silently converted into PASS.

## Evidence

Selected permit and canonical message; recipient set; delivery IDs; spent state and receipt; before/after/reload snapshots; repeated-send result; failure-injection timeline.

For each attempt use [templates/WORKFLOW_RUN_TEMPLATE.json](templates/WORKFLOW_RUN_TEMPLATE.json). Record exact command/action, fixture provenance, g/revision, source/profile hashes, expected/observed result, before/after state, affected identifiers, logs/captures and cleanup. Keep synthetic content distinct from any user data. Do not paste environment secrets or unrelated identity data into the record.

## Stop, rollback and checkpoint

Never roll back a committed spend into READY to recover. Resolve ambiguity from the committed receipt under the lock. Preserve the accepted message; reset only explicitly disposable fault fixtures.

Checkpoint the workflow and case results, last committed revision/receipt, invalidated/pending run IDs, open findings and the next permitted action. Only a PASS gate authorizes the next dependent journey. If blocked, independent static work may continue without claiming dependent issuance or delivery has occurred.
