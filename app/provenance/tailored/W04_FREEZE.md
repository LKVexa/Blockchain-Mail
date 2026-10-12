# W04 — Freeze canonical message bytes and reject boundary mutation

**Series 1.1.0 · Profile `GLYPHOKU_VEM_127/1`**  
**Workflow status:** NOT_STARTED · **Assessment:** NOT_ASSESSED

[Master prompt](MASTER_PROMPT.md) · [Master workflow](MASTER_WORKFLOW.md) · [Technical contracts](INTEGRATION_CONTRACTS.md) · [Acceptance plan](ACCEPTANCE_TEST_PLAN.md)

## Entry gate

W03 PASS and its existing owner mailbox at g=2; canonicalization v1 fixed and test-only multi-mailbox fixtures separated from the headed journey. If a prerequisite is missing, retain the current state and mark BLOCKED. A completed reading or baseline test does not satisfy this gate.

## Candidate binding and source adaptation

**Existing code to inspect:** src/lib/glyphoku/registry.ts: FrozenDraft, freezeDraft, splitAddresses, resolveMailbox; src/lib/sha256.ts; studio.tsx: composer and startEnvelope.

**Finding owners:** F03, F04, F08. Consult the exact baseline observations in [CANDIDATE_AUDIT.md](CANDIDATE_AUDIT.md). Suggested helper adapters are new work only when present in the reviewed diff.

The source freeze contract is retained and extended across issue/send trust boundaries. The baseline editable fields and caller-trusted digest are explicitly repaired; Bcc helper tests are not misreported as UI functionality.

The original dossier is retained at [source-series/W04_FREEZE.md](source-series/W04_FREEZE.md). Preserve its source identity and evidence boundary; this revision adds explicit enforcement and verification steps rather than declaring the original requirements satisfied.

## Master prompt for this workflow

```text
Centralize exact canonical draft validation for freeze, issuance and send. Preserve the existing version-1 normalization and key order, verify types before serialization, deep-copy data and recompute SHA-256 rather than trusting FrozenDraft.digest. Bind sender and all recipients to the current local registry. Use the domain owner's self-address for the headed journey; no new mailbox is minted for this test. Lock the active composer and show its full frozen review. Changing any authorized content requires a different intent and cannot use the old permit. At g=3, new issuance for a changed draft stays paused. Document code-unit limits, order sensitivity and absent Bcc UI honestly.

Work only in the authorized copy. Preserve exact source/profile identities and
prior committed data. Record evidence under the run/workflow/attempt ID.
Do not change source-control assessments or report unexecuted work as PASS.
```

## Do — implementation and verification sequence

1. Select the owner mailbox from W03 and set To to that same registered address. Record a synthetic subject/body and current instance/revision.

2. Validate subject/body and all address fields before any deal call. Reject unknown or external recipients and unregistered senders locally.

3. Apply only the documented v1 normalization; produce the exact ordered JSON preimage and UTF-8 digest. Cross-check SHA-256 against a standard implementation in tests.

4. Deep-copy frozen values and recipient arrays; make active composition read-only throughout its lifecycle. Display full frozen content and recipient scope.

5. Use the same validation/canonicalization routine at issue and send, recomputing digest and comparing authorized canonical content rather than trusting field equality alone.

6. Exercise stale-digest content mutation, array aliasing, Unicode/CRLF/boundary-length and ordering vectors with exact expected results.

7. Test To/Bcc overlap and projection with labeled isolated multi-mailbox fixtures, without claiming a Bcc control or authenticated multi-user privacy exists in the current UI.

8. Hand the immutable intent/draft digest to W05 and retain an explicit rule for changed-draft refusal at g=3. Do not send or issue during the freeze workflow.

## Acceptance checklist

- [ ] **GV110-W04-T01 — Canonical draft reference vector.** Canonical bytes/digest are stable and match an independent SHA-256 implementation.
- [ ] **GV110-W04-T02 — Subject/body boundary checks.** Only the documented string-length and normalization policy is accepted; no solver starts for invalid input.
- [ ] **GV110-W04-T03 — Local sender/recipient authority.** Specific local-membership refusal before preparation or DNS/MX work.
- [ ] **GV110-W04-T04 — Deep frozen data ownership.** Recorded canonical message and authorized recipient scope do not change through aliasing.
- [ ] **GV110-W04-T05 — Stale digest cannot authorize edited body.** Digest/canonical-content mismatch is rejected at issue and at send with no committed rows.
- [ ] **GV110-W04-T06 — Unicode and canonicalization version.** Code-unit limits and order sensitivity are explicit; no silent Unicode normalization, sorting or version change.
- [ ] **GV110-W04-T07 — Bcc/recipient projection.** One row per unique recipient; unrelated recipients do not receive Bcc list disclosure through the projection; no claim of multi-user security.
- [ ] **GV110-W04-T08 — Changed draft requires distinct authorization.** Active draft cannot silently change; different new draft cannot use old permit and is paused for new issuance at g=3.

Each checkbox is evidence-backed acceptance, not a claim that its test has already run. Full fixture, stimulus and evidence requirements appear in [ACCEPTANCE_TEST_PLAN.md](ACCEPTANCE_TEST_PLAN.md) and [registers/ACCEPTANCE_CASES.json](registers/ACCEPTANCE_CASES.json).

## Pass

Canonicalization is deterministic and versioned, independent digest checks agree, mutation cannot alter the frozen content or bypass issue/send validation, and all external/unknown input fails before puzzle preparation. Every listed mandatory case must have retained evidence for this target revision. Source controls remain NOT_ASSESSED; tests at the wrong precondition do not count.

## Fail

Trusting a supplied digest, aliasing frozen arrays, silently changing normalization, accepting unregistered addresses or showing editable text as if it were the authorized message blocks acceptance. Record the failing case and preserve its evidence. INCONCLUSIVE is used for insufficient observation, never silently converted into PASS.

## Evidence

Canonical test vectors and preimage bytes; digest comparisons; readonly review captures; membership refusals; alias/mutation and Unicode boundary results; frozen W05 intent.

For each attempt use [templates/WORKFLOW_RUN_TEMPLATE.json](templates/WORKFLOW_RUN_TEMPLATE.json). Record exact command/action, fixture provenance, g/revision, source/profile hashes, expected/observed result, before/after state, affected identifiers, logs/captures and cleanup. Keep synthetic content distinct from any user data. Do not paste environment secrets or unrelated identity data into the record.

## Stop, rollback and checkpoint

Discard only uncommitted draft/run state. Preserve the committed W03 mailbox and prior accepted data. A changed draft is a new intent, not a patch to an already issued permit.

Checkpoint the workflow and case results, last committed revision/receipt, invalidated/pending run IDs, open findings and the next permitted action. Only a PASS gate authorizes the next dependent journey. If blocked, independent static work may continue without claiming dependent issuance or delivery has occurred.
