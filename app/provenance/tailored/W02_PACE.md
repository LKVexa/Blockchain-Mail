# W02 — Make live solving, 24x pacing and cancellation observable

**Series 1.1.0 · Profile `GLYPHOKU_VEM_127/1`**  
**Workflow status:** NOT_STARTED · **Assessment:** NOT_ASSESSED

[Master prompt](MASTER_PROMPT.md) · [Master workflow](MASTER_WORKFLOW.md) · [Technical contracts](INTEGRATION_CONTRACTS.md) · [Acceptance plan](ACCEPTANCE_TEST_PLAN.md)

## Entry gate

W01 PASS and a headed browser on the approved local profile. Use an isolated observation fixture; do not spend the real W03 acceptance domain during preliminary control testing. If a prerequisite is missing, retain the current state and mark BLOCKED. A completed reading or baseline test does not satisfy this gate.

## Candidate binding and source adaptation

**Existing code to inspect:** src/components/glyphoku/studio.tsx: beginPuzzle, stepOnce, timer effect, startDomain, startEnvelope, stopRun, controls; src/lib/glyphoku/solver.ts.

**Finding owners:** F08, F09, F10. Consult the exact baseline observations in [CANDIDATE_AUDIT.md](CANDIDATE_AUDIT.md). Suggested helper adapters are new work only when present in the reviewed diff.

The original equated event processing with per-event painting and relied on a synchronous delayed dealer. This dossier distinguishes logical events from browser paints, adds initial/final display gates and fences late/cancelled results.

The original dossier is retained at [source-series/W02_PACE.md](source-series/W02_PACE.md). Preserve its source identity and evidence boundary; this revision adds explicit enforcement and verification steps rather than declaring the original requirements satisfied.

## Master prompt for this workflow

```text
Implement truthful visible solving in the existing desk. Preserve 24 logical events per 100 ms default tick and the 1/8/24/40 controls, but do not promise 240 distinct frames per second. The display must show givens before search, genuine evolving solver state, guesses and retractions, bounded trace inspection and the final verified candidate. Keep preparation and active search distinct, freeze the active intent, and move long preparation into a cancellable bounded job. A hidden or unmounted observation view, excessive backlog or stop command must prevent unauthorized completion. A render acknowledgment is necessary for this UX contract but is not sufficient authorization or proof that a human watched. Record actual headed evidence, not screenshots supplied by the old candidate.

Work only in the authorized copy. Preserve exact source/profile identities and
prior committed data. Record evidence under the run/workflow/attempt ID.
Do not change source-control assessments or report unexecuted work as PASS.
```

## Do — implementation and verification sequence

1. Introduce an explicit run lifecycle and generation token covering preparation, live search, verification, commit eligibility, failure and cancellation.

2. Make preparation yield or run in a terminable worker. Preserve givens-only output and discard dealer scoring solutions; no stored answer enters the live controller.

3. Render and acknowledge the initial givens frame before stepping. Keep no resource writes in preparation or initial display.

4. Retain 24/100 ms nominal event pacing while recording all authorization-relevant events in a bounded sequence. Render checkpoints and trace counts separately.

5. Hold final commit eligibility until a final-frame acknowledgment and independent verifier result agree with the bound candidate and policy.

6. Implement immediate pause/step semantics and cancellation fencing for timeout/worker results. Hiding pauses; unmount/restart cancels uncommitted live authority.

7. Lock active composition through preparation, solve, verification and READY review. Give clear action status without changing g, bands or digest on speed changes.

8. Observe the eight cases in a headed browser, including narrow view, branch visibility and late callbacks. Separate phase timing from historical sample claims.

## Acceptance checklist

- [ ] **GV110-W02-T01 — Givens rendered first.** Givens and blanks are visible; domain count remains zero; initial paint acknowledgment precedes live steps.
- [ ] **GV110-W02-T02 — 24x default and invariant pace changes.** Only pacing changes; g, bands, topology, intent and permit eligibility remain fixed.
- [ ] **GV110-W02-T03 — Real events and final display fence.** Logical events are recorded without gaps; final visible candidate matches verification; no claim of one paint per event.
- [ ] **GV110-W02-T04 — Pause, resume and single-step.** Pause changes no board; single step advances one logical event; resume continues the same bound run.
- [ ] **GV110-W02-T05 — Stop fences every phase.** All late results are rejected; no resource or permit appears after cancellation.
- [ ] **GV110-W02-T06 — Visibility, unmount and backlog.** Supported pause/cancel policy prevents unobserved authorization; events are not silently dropped.
- [ ] **GV110-W02-T07 — Frozen active composition.** Active draft is locked and immutable; review shows its complete frozen contents, not a different editable draft.
- [ ] **GV110-W02-T08 — Timing and usable observation.** Measured fields are distinct and accurately labeled; board controls remain usable; no imported timing sample is presented as measured.

Each checkbox is evidence-backed acceptance, not a claim that its test has already run. Full fixture, stimulus and evidence requirements appear in [ACCEPTANCE_TEST_PLAN.md](ACCEPTANCE_TEST_PLAN.md) and [registers/ACCEPTANCE_CASES.json](registers/ACCEPTANCE_CASES.json).

## Pass

The headed view demonstrates initial givens, real evolving search and final candidate with trace correlation. Default 24x and all controls behave as specified, while stop/observer loss prevent late issuance and pace never alters resource policy. Every listed mandatory case must have retained evidence for this target revision. Source controls remain NOT_ASSESSED; tests at the wrong precondition do not count.

## Fail

Hidden answer replay, an unresponsive uncancellable dealer, editable active intent, dropped trace events, missing initial/final display evidence or any post-stop resource commit blocks the workflow. Record the failing case and preserve its evidence. INCONCLUSIVE is used for insufficient observation, never silently converted into PASS.

## Evidence

Headed video/screenshots; event and paint sequences; policy/draft digests; timing breakdown; pause/single-step/stop and hidden-view outcomes; late-result rejection record.

For each attempt use [templates/WORKFLOW_RUN_TEMPLATE.json](templates/WORKFLOW_RUN_TEMPLATE.json). Record exact command/action, fixture provenance, g/revision, source/profile hashes, expected/observed result, before/after state, affected identifiers, logs/captures and cleanup. Keep synthetic content distinct from any user data. Do not paste environment secrets or unrelated identity data into the record.

## Stop, rollback and checkpoint

Cancel and invalidate every observation run, terminate only its owned worker/job, preserve evidence and discard synthetic uncommitted tickets. Restarting never promotes a replay to live authority.

Checkpoint the workflow and case results, last committed revision/receipt, invalidated/pending run IDs, open findings and the next permitted action. Only a PASS gate authorizes the next dependent journey. If blocked, independent static work may continue without claiming dependent issuance or delivery has occurred.
