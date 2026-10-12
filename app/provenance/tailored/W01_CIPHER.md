# W01 — Enforce the cipher, budgets and fresh action-bound batches

**Series 1.1.0 · Profile `GLYPHOKU_VEM_127/1`**  
**Workflow status:** NOT_STARTED · **Assessment:** NOT_ASSESSED

[Master prompt](MASTER_PROMPT.md) · [Master workflow](MASTER_WORKFLOW.md) · [Technical contracts](INTEGRATION_CONTRACTS.md) · [Acceptance plan](ACCEPTANCE_TEST_PLAN.md)

## Entry gate

W00 PASS, locked topology/policy, approved preparation limits and a defined run-authorization boundary. If a prerequisite is missing, retain the current state and mark BLOCKED. A completed reading or baseline test does not satisfy this gate.

## Candidate binding and source adaptation

**Existing code to inspect:** src/lib/glyphoku/rules.ts: PLAYED, issuanceAllowed, scoreBand, verifyCandidate, countSolutions, dealGivens; deal.ts: dealPlayable; solver.ts: createSolver/replayBoard; registry.ts: commitDomain/issuePermit.

**Finding owners:** F01, F02, F10, F11. Consult the exact baseline observations in [CANDIDATE_AUDIT.md](CANDIDATE_AUDIT.md). Suggested helper adapters are new work only when present in the reviewed diff.

The original checked two representative boards. This revision additionally closes topology override, incomplete uniqueness, off-by-one event-cap, duplicate challenge and unbound solved-array acceptance.

The original dossier is retained at [source-series/W01_CIPHER.md](source-series/W01_CIPHER.md). Preserve its source identity and evidence boundary; this revision adds explicit enforcement and verification steps rather than declaring the original requirements satisfied.

## Master prompt for this workflow

```text
Retain the exact 16x16 mixed-glyph profile and independent empty bands. Harden mathematical acceptance and action authorization without weakening the puzzle to make generation succeed. Introduce a completed-versus-exhausted uniqueness result and enforce exact topology at resource entry. Keep preparation scoring distinct from the live run. Bind distinct challenge fingerprints to the action, ordinal, immutable intent and expected registry revision; reject raw grids and historical replay as authorization. Count INIT and terminal events inside the 12,000/18,000 budgets, require the existing minimum guesses and at least one retraction per g=2 board. Bound and cancel every expensive preparation stage. Produce reproducible positive/negative evidence; do not call a sampled seed a proof that every seed finishes.

Work only in the authorized copy. Preserve exact source/profile identities and
prior committed data. Record evidence under the run/workflow/attempt ID.
Do not change source-control assessments or report unexecuted work as PASS.
```

## Do — implementation and verification sequence

1. Preserve the alphabet, PLAYED, P(g), bands and horizon; assert their exact values in tests. Make resource entry reject caller-supplied alternate box geometry.

2. Validate givens for size, values and house conflicts before uniqueness work. Replace ambiguous count-only outcomes with complete, invalid, ambiguous and budget-exhausted states.

3. Bound fill, clue removal, uniqueness and candidate-selection work. Carry cancellation tokens through each stage and record refused seeds rather than loosening policy.

4. Enforce inclusive total-event caps and explicit minimum trace characteristics during selection and final live-run acceptance. Candidate selection returns givens only.

5. Define canonical board fingerprints and one-use run context tied to profile, action, instance, revision, ordinal and label/draft intent. Keep the active handle internal.

6. Reject repeated board arrays, copied challenges, prior domain work reused for an envelope, cancelled/stale contexts and replay-only submissions.

7. Independently verify the completed visible candidate and replayed event mutations. Never let the solver alone certify its own terminal result.

8. Run the eight cases with recorded fixtures and limits; retain unknown/exhausted outcomes. Hand an explicit authorization contract to W02/W03/W05.

## Acceptance checklist

- [ ] **GV110-W01-T01 — Exact played alphabet and bands.** Exact ordered 16-symbol alphabet, 256 cells, 4x4 boxes and the 124-132 / 133-140 bands.
- [ ] **GV110-W01-T02 — Complete uniqueness result.** Only complete valid enumeration with exactly one solution is eligible; invalid/ambiguous/incomplete search is refused.
- [ ] **GV110-W01-T03 — Grid and topology rejection.** Each fails its grid/topology validator without creating a resource; supplied topology cannot override PLAYED.
- [ ] **GV110-W01-T04 — Inclusive event budget.** INIT and terminal events count; cap+1 never succeeds; the instrumentation is test-only.
- [ ] **GV110-W01-T05 — Required live trace characteristics.** At least 8/12 guesses, at least one g=2 retraction, no given mutation, and a final board matching independent verification.
- [ ] **GV110-W01-T06 — Duplicate and reused challenge.** Duplicate/reused challenge refusal; two array entries do not count as fresh work.
- [ ] **GV110-W01-T07 — Action/revision/replay binding.** No resource is issued outside the exact current eligible run; reload cannot revive an unfinished authorization.
- [ ] **GV110-W01-T08 — Bounded cancellable preparation.** Structured failure or cancellation; no easier board, cap increase, late commit or unbounded UI-blocking loop.

Each checkbox is evidence-backed acceptance, not a claim that its test has already run. Full fixture, stimulus and evidence requirements appear in [ACCEPTANCE_TEST_PLAN.md](ACCEPTANCE_TEST_PLAN.md) and [registers/ACCEPTANCE_CASES.json](registers/ACCEPTANCE_CASES.json).

## Pass

All accepted boards meet the exact topology, band, complete uniqueness, terminal verification and trace budgets. Every batch is distinct, fresh and bound to the intended live action. Rejected input produces no resource or policy relaxation. Every listed mandatory case must have retained evidence for this target revision. Source controls remain NOT_ASSESSED; tests at the wrong precondition do not count.

## Fail

Any alternate topology, duplicated/replayed board, incomplete uniqueness result, cap+1 success, hidden answer authorization or unbounded preparation path blocks acceptance. Record the failing case and preserve its evidence. INCONCLUSIVE is used for insufficient observation, never silently converted into PASS.

## Evidence

Exact math/policy assertions; fixtures and seeds; typed uniqueness outcomes; per-board counters; trace/candidate hashes; duplicate/replay/override refusals; budget/cancellation logs.

For each attempt use [templates/WORKFLOW_RUN_TEMPLATE.json](templates/WORKFLOW_RUN_TEMPLATE.json). Record exact command/action, fixture provenance, g/revision, source/profile hashes, expected/observed result, before/after state, affected identifiers, logs/captures and cleanup. Keep synthetic content distinct from any user data. Do not paste environment secrets or unrelated identity data into the record.

## Stop, rollback and checkpoint

Cancel active preparation and live tickets; preserve tests and evidence. Do not persist partially selected boards as eligible permits or change bands/horizon to recover.

Checkpoint the workflow and case results, last committed revision/receipt, invalidated/pending run IDs, open findings and the next permitted action. Only a PASS gate authorizes the next dependent journey. If blocked, independent static work may continue without claiming dependent issuance or delivery has occurred.
