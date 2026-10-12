# Acceptance test plan — 72 newly authored candidate-integration scenarios

**Series 1.1.0 · All scenarios initially NOT_RUN**

These are the acceptance scenarios for this revision, not executed results and not replacements for the 4,800 source controls. The three recorded baseline tests and thirteen characterization probes are separate evidence in the audit. None automatically passes a case below. Run all mandatory cases against the same reviewed integrated revision/profile; preserve immutable attempt histories. No case is automatically optional merely because its environment is unavailable.

UNIT cases call real validators/transition adapters with synthetic inputs. INTEGRATION cases cross actual coordinator/store boundaries. HEADED cases require an observable browser. FAULT and CONCURRENCY cases use explicitly isolated fixtures. STATIC/CONTRACT/REPORT cases examine source or evidence and do not establish runtime delivery by themselves. REGRESSION cases consolidate already executed results plus named new interactions, not blanket certification.

For every refusal capture the intended validator, actual g/revision and exact reason, together with unchanged committed bytes/counts. Use saved g=1/g=2 fixtures instead of testing everything after g=3. Test-only known solutions or injected steppers cannot be counted as the headed authorization journey.

## W00 — Bind, preserve and isolate the real candidate

### GV110-W00-T01 — Candidate identity

**Level:** STATIC · **Status:** NOT_RUN  
**Precondition:** Unmodified extracted candidate and supplied archives.

**Stimulus:** Compare both archive digests and all selected target-file hashes; inspect route and imports.

**Expected:** Identities match, or a reviewed rebind records every changed file before any mutation.

**Evidence:** Hash report, actual root and scope decision.

### GV110-W00-T02 — Archive and source preservation

**Level:** STATIC · **Status:** NOT_RUN  
**Precondition:** Archives remain read-only; a disposable intake destination exists.

**Stimulus:** Check traversal, absolute/drive paths, symlinks, case collisions and bounded expansion; inventory nested ZIPs without executing them.

**Expected:** Unsafe inputs fail closed; originals remain byte-identical; nested packs are excluded from execution.

**Evidence:** Archive inventory, rejection fixtures and before/after original hashes.

### GV110-W00-T03 — Single authority

**Level:** STATIC · **Status:** NOT_RUN  
**Precondition:** Current Glyphoku, BEM/Obscura and storage paths have been inspected.

**Stimulus:** Trace route -> studio -> registry -> storage and inspect the proposed diff.

**Expected:** Exactly one Glyphoku registry/store; no BEM authority merge or second transport; helper modules have explicit responsibilities.

**Evidence:** Import map, storage ownership table and diff review.

### GV110-W00-T04 — Literal-loopback host

**Level:** INTEGRATION · **Status:** NOT_RUN  
**Precondition:** Reviewed local execution profile with approved fixed port.

**Stimulus:** Start that profile, inspect effective argv/config and its actual listener; challenge occupied port.

**Expected:** Listener is the approved literal 127.0.0.1 address; no wildcard bind or silent port fallback.

**Evidence:** Process identity, listener capture and failed-port log.

### GV110-W00-T05 — Runtime and dependency pinning

**Level:** STATIC · **Status:** NOT_RUN  
**Precondition:** Approved Node path and supplied lockfile.

**Stimulus:** Record versions/digests; check required engines and run the direct baseline test command.

**Expected:** No unnoticed runtime or lockfile upgrade; unavailable prerequisites are BLOCKED, not auto-installed.

**Evidence:** Runtime/lockfile record and exact baseline command/exit output.

### GV110-W00-T06 — Origin-bound data

**Level:** INTEGRATION · **Status:** NOT_RUN  
**Precondition:** Synthetic browser profiles at two distinct origins.

**Stimulus:** Create a harmless fixture at one origin, inspect the other, then follow only the authorized export/import path.

**Expected:** No assumption of shared localStorage; no automatic overwrite, disappearance-as-corruption claim or silent cross-origin merge.

**Evidence:** Origin identifiers and separate pre/post data snapshots.

### GV110-W00-T07 — Real-data exclusion

**Level:** STATIC · **Status:** NOT_RUN  
**Precondition:** Existing candidate may contain user changes or mail.

**Stimulus:** Review working copy and evidence destinations before test setup.

**Expected:** Only synthetic fixture state is used; original source and any live mail remain intact.

**Evidence:** Authorization scope, working-copy inventory and preservation record.

### GV110-W00-T08 — Mutation prerequisites

**Level:** CONTRACT · **Status:** NOT_RUN  
**Precondition:** Proposed schema, lock and operation contracts are available.

**Stimulus:** Review complete validation, single-writer design, migration, budgets and failure outcomes.

**Expected:** No journey starts until these contracts and bounded parameter choices are explicit; missing lock/storage policy blocks mutation.

**Evidence:** Approved integration contract, unresolved decisions and initial checkpoint.

## W01 — Enforce the cipher, budgets and fresh action-bound batches

### GV110-W01-T01 — Exact played alphabet and bands

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Fresh g=1 and g=2 test contexts.

**Stimulus:** Inspect glyphs, order and boxes; deal bounded fixtures and count blanks.

**Expected:** Exact ordered 16-symbol alphabet, 256 cells, 4x4 boxes and the 124-132 / 133-140 bands.

**Evidence:** Glyph vector, topology and per-board empty counts.

### GV110-W01-T02 — Complete uniqueness result

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Valid, invalid, ambiguous and budget-exhausted givens fixtures.

**Stimulus:** Run the independent uniqueness checker, including a case capped after one completion.

**Expected:** Only complete valid enumeration with exactly one solution is eligible; invalid/ambiguous/incomplete search is refused.

**Evidence:** Typed result, node budget, completion flag and fixture provenance.

### GV110-W01-T03 — Grid and topology rejection

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** An eligible g=1 or g=2 context before horizon.

**Stimulus:** Submit changed givens, duplicate values, bad lengths, nonintegers and a 1x16-box Latin square.

**Expected:** Each fails its grid/topology validator without creating a resource; supplied topology cannot override PLAYED.

**Evidence:** Exact validator reason and unchanged state hash.

### GV110-W01-T04 — Inclusive event budget

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Instrumented deterministic stepper boundary fixtures.

**Stimulus:** Exercise cap-1, cap and cap+1 terminal events for both ordinals.

**Expected:** INIT and terminal events count; cap+1 never succeeds; the instrumentation is test-only.

**Evidence:** Event counts, terminal order and expected-versus-observed assertions.

### GV110-W01-T05 — Required live trace characteristics

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Distinct accepted candidate boards for g=1 and g=2.

**Stimulus:** Verify event sequence, initial givens, replay integrity, terminal result and per-board GUESS/RETRACT counts.

**Expected:** At least 8/12 guesses, at least one g=2 retraction, no given mutation, and a final board matching independent verification.

**Evidence:** Per-board trace digest, counters and candidate digest.

### GV110-W01-T06 — Duplicate and reused challenge

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** g=2 instance and a run with two board slots.

**Stimulus:** Submit identical arrays as both boards, copied objects, and a previously used domain challenge.

**Expected:** Duplicate/reused challenge refusal; two array entries do not count as fresh work.

**Evidence:** Board fingerprints, consumed-set evidence and no mutation.

### GV110-W01-T07 — Action/revision/replay binding

**Level:** INTEGRATION · **Status:** NOT_RUN  
**Precondition:** Live coordinator plus stale, cancelled and historical-run fixtures.

**Stimulus:** Change action, draft/label intent, profile, instance, revision or run identity; submit raw solved arrays or replay.

**Expected:** No resource is issued outside the exact current eligible run; reload cannot revive an unfinished authorization.

**Evidence:** Bound intent, rejected handle/receipt and unchanged registry.

### GV110-W01-T08 — Bounded cancellable preparation

**Level:** INTEGRATION · **Status:** NOT_RUN  
**Precondition:** Recorded preparation deadline/node limits and worker or yielding job.

**Stimulus:** Force fill, uniqueness or playable-selection exhaustion; cancel during preparation.

**Expected:** Structured failure or cancellation; no easier board, cap increase, late commit or unbounded UI-blocking loop.

**Evidence:** Budget settings, cancellation acknowledgment and state snapshot.

## W02 — Make live solving, 24x pacing and cancellation observable

### GV110-W02-T01 — Givens rendered first

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** Empty synthetic instance and a new domain action.

**Stimulus:** Observe initial committed board before allowing the first search mutation.

**Expected:** Givens and blanks are visible; domain count remains zero; initial paint acknowledgment precedes live steps.

**Evidence:** Screenshot/video checkpoint and event/paint timestamps.

### GV110-W02-T02 — 24x default and invariant pace changes

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** Desk freshly loaded with a bound profile.

**Stimulus:** Inspect 24 default and 1/8/24/40 options; change speed during a supported live run.

**Expected:** Only pacing changes; g, bands, topology, intent and permit eligibility remain fixed.

**Evidence:** Control state plus before/after policy digest.

### GV110-W02-T03 — Real events and final display fence

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** Eligible live run with bounded event recording.

**Stimulus:** Follow guesses/retractions, inspect event log and stop at terminal candidate before commit.

**Expected:** Logical events are recorded without gaps; final visible candidate matches verification; no claim of one paint per event.

**Evidence:** Event trace, rendered checkpoints, final-frame acknowledgment and commit time.

### GV110-W02-T04 — Pause, resume and single-step

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** A live run paused at a recorded sequence number.

**Stimulus:** Wait while paused, perform one single step, then resume.

**Expected:** Pause changes no board; single step advances one logical event; resume continues the same bound run.

**Evidence:** Before/after board and event counters with pause interval.

### GV110-W02-T05 — Stop fences every phase

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** Runs stopped during PREPARING, LIVE SOLVING and VERIFYING.

**Stimulus:** Stop and then deliver a delayed preparation/solver result in the controlled fixture.

**Expected:** All late results are rejected; no resource or permit appears after cancellation.

**Evidence:** Generation/run IDs, stop acknowledgment and unchanged committed state.

### GV110-W02-T06 — Visibility, unmount and backlog

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** Live view with a bounded event queue.

**Stimulus:** Hide tab, unmount observer and simulate a full backlog in separate attempts.

**Expected:** Supported pause/cancel policy prevents unobserved authorization; events are not silently dropped.

**Evidence:** Visibility lifecycle, queue bound, sequence continuity and refusal/pause evidence.

### GV110-W02-T07 — Frozen active composition

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** Envelope intent prepared from the existing mailbox.

**Stimulus:** Try editing To/subject/body during preparation, solve, verification and READY review.

**Expected:** Active draft is locked and immutable; review shows its complete frozen contents, not a different editable draft.

**Evidence:** Control disabled/read-only state and canonical draft digest.

### GV110-W02-T08 — Timing and usable observation

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** Supported desktop and narrow viewport with 24x selected.

**Stimulus:** Record preparation, active/paused/visible time, events and checkpoints; inspect keyboard/scroll access to the 16x16 grid.

**Expected:** Measured fields are distinct and accurately labeled; board controls remain usable; no imported timing sample is presented as measured.

**Evidence:** Viewport captures and phase-specific measurement record.

## W03 — Create exactly one local domain through the coordinated store

### GV110-W03-T01 — One-board domain commit

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** Fresh compatible instance at g=1.

**Stimulus:** Request label studio, observe its eligible one-board live run and complete the coordinated transition.

**Expected:** One studio.glyphoku.localhost domain, one owner mailbox, g=2 and exactly one accepted operation receipt.

**Evidence:** Live trace, receipt and committed before/after snapshots.

### GV110-W03-T02 — Label validation before work

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Fresh and existing-label fixtures before the relevant horizon check.

**Stimulus:** Try reserved, malformed and duplicate labels; observe whether preparation starts.

**Expected:** Specific label/duplicate refusal occurs before unnecessary dealing; no renamed fallback or extra domain.

**Evidence:** Refusal code, dealer invocation count and state hash.

### GV110-W03-T03 — Wrong domain batch length

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** g=1 valid label and authorization test boundary.

**Stimulus:** Try zero and two boards where one is required.

**Expected:** Wrong-batch-length refusal and no ordinal/resource change.

**Evidence:** Batch size and unchanged registry snapshot.

### GV110-W03-T04 — Final candidate binding

**Level:** INTEGRATION · **Status:** NOT_RUN  
**Precondition:** Valid live domain run and independent final verifier.

**Stimulus:** Alter a given, a candidate cell or the candidate digest before commit.

**Expected:** Domain transition is denied even after animation termination; the final visible grid must match the verified candidate.

**Evidence:** Visible/final digests, verifier reason and no domain write.

### GV110-W03-T05 — Reserve envelope ordinal

**Level:** INTEGRATION · **Status:** NOT_RUN  
**Precondition:** One committed domain at g=2.

**Stimulus:** Request a second new domain through UI and the mutation API.

**Expected:** Wrong-action-for-ordinal refusal with g=2 preserved for the envelope; no hidden horizon extension.

**Evidence:** Admission response, zero new dealer work and unchanged counts.

### GV110-W03-T06 — Persist before success

**Level:** FAULT · **Status:** NOT_RUN  
**Precondition:** Eligible g=1 transition and controlled storage failure hooks.

**Stimulus:** Fail the snapshot write or read-back before domain success is announced.

**Expected:** No false created label; prior bytes remain intact or an ambiguous write is recovery-needed and reconciled by operation ID.

**Evidence:** Storage fault timeline, UI state and before/after bytes.

### GV110-W03-T07 — Reload and read without work

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** Successfully committed domain on the approved origin.

**Stimulus:** Reload and read the owner mailbox.

**Expected:** Same domain/mailbox and g=2 survive; mailbox read starts no puzzle.

**Evidence:** Same-origin reload snapshot and dealer invocation count.

### GV110-W03-T08 — Racing domain submissions

**Level:** CONCURRENCY · **Status:** NOT_RUN  
**Precondition:** Two contexts share a synthetic origin and the same current revision.

**Stimulus:** Race duplicate operation IDs and distinct domain intents.

**Expected:** Only one new transition commits; exact retry retrieves it, incompatible contender is refused as stale or wrong action.

**Evidence:** Lock/revision timeline, receipts and final resource counts.

## W04 — Freeze canonical message bytes and reject boundary mutation

### GV110-W04-T01 — Canonical draft reference vector

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Existing owner mailbox at g=2 and fixed synthetic input.

**Stimulus:** Freeze twice using subject spaces, CRLF body and duplicated/mixed-case recipient input.

**Expected:** Canonical bytes/digest are stable and match an independent SHA-256 implementation.

**Evidence:** Exact test preimage bytes, canonical object and two equal digests.

### GV110-W04-T02 — Subject/body boundary checks

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Valid local sender/recipient fixture.

**Stimulus:** Test empty/whitespace content, lengths at and around limits and CR/LF in subject.

**Expected:** Only the documented string-length and normalization policy is accepted; no solver starts for invalid input.

**Evidence:** Boundary matrix and pre-deal rejection evidence.

### GV110-W04-T03 — Local sender/recipient authority

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Valid g=2 registry.

**Stimulus:** Freeze with external recipient, unknown local mailbox and unregistered sender.

**Expected:** Specific local-membership refusal before preparation or DNS/MX work.

**Evidence:** Refusal codes, dealer/network invocation counts and state hash.

### GV110-W04-T04 — Deep frozen data ownership

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** A frozen draft with caller-owned recipient arrays or copied structures.

**Stimulus:** Mutate caller-held input/arrays after freeze and after permit construction.

**Expected:** Recorded canonical message and authorized recipient scope do not change through aliasing.

**Evidence:** Before/after bytes and reference/mutation assertions.

### GV110-W04-T05 — Stale digest cannot authorize edited body

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Valid frozen draft and isolated issuance/send fixtures.

**Stimulus:** Change body/subject/recipient values while retaining the original digest.

**Expected:** Digest/canonical-content mismatch is rejected at issue and at send with no committed rows.

**Evidence:** Expected rejection at each boundary and state hashes.

### GV110-W04-T06 — Unicode and canonicalization version

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Non-ASCII, surrogate-pair, bare-CR and reordered-recipient vectors.

**Stimulus:** Freeze and compare results under the documented v1 contract.

**Expected:** Code-unit limits and order sensitivity are explicit; no silent Unicode normalization, sorting or version change.

**Evidence:** Canonical vectors and version decision.

### GV110-W04-T07 — Bcc/recipient projection

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Explicitly labeled synthetic multi-mailbox fixture; baseline UI has no Bcc field.

**Stimulus:** Create To/Bcc overlap and inspect each delivery projection.

**Expected:** One row per unique recipient; unrelated recipients do not receive Bcc list disclosure through the projection; no claim of multi-user security.

**Evidence:** Synthetic-fixture declaration and per-recipient projection assertions.

### GV110-W04-T08 — Changed draft requires distinct authorization

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** Active frozen envelope run or READY permit, then g=3 state.

**Stimulus:** Attempt to alter its active draft or start a new message authorization.

**Expected:** Active draft cannot silently change; different new draft cannot use old permit and is paused for new issuance at g=3.

**Evidence:** Review display, digest comparison and horizon reason.

## W05 — Issue one draft-bound READY envelope from two fresh boards

### GV110-W05-T01 — Exactly two fresh boards issue READY

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** One domain at g=2 and a verified frozen self-message.

**Stimulus:** Play two distinct fresh boards to independently verified completion.

**Expected:** One READY permit bound to sender/draft/recipients, g=3, zero delivery rows, READY—NOT SENT shown.

**Evidence:** Per-board traces, permit object, receipt and state snapshot.

### GV110-W05-T02 — Wrong count and duplicate batch

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** g=2 before new issuance.

**Stimulus:** Try one/three boards and two copies of one otherwise valid board.

**Expected:** Correct count/distinctness failure, no permit or ordinal change.

**Evidence:** Specific reason for each case and unchanged snapshot.

### GV110-W05-T03 — No hidden/replayed authorization

**Level:** INTEGRATION · **Status:** NOT_RUN  
**Precondition:** g=2 with valid grids but no eligible live handle.

**Stimulus:** Submit a hidden completed solution, prior trace, cancelled run or stale handle.

**Expected:** No issuance; mathematical validity alone is insufficient.

**Evidence:** Coordinator refusal, input provenance and no resource mutation.

### GV110-W05-T04 — Revalidate frozen intent at issue

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Valid g=2 run and frozen draft.

**Stimulus:** Alter sender, recipients, digest, object shape or membership before issue.

**Expected:** Only the exact canonical local intent is eligible; forged FrozenDraft is refused.

**Evidence:** Canonical comparison and refusal/membership evidence.

### GV110-W05-T05 — Exact retry after horizon

**Level:** INTEGRATION · **Status:** NOT_RUN  
**Precondition:** A previously accepted envelope now at g=3.

**Stimulus:** Retrieve/retry the exact completed operation through the documented idempotent interface.

**Expected:** Same permit/receipt is returned, with no new board, resource, revision or g increment.

**Evidence:** Prior/new IDs, state identity and zero dealer calls.

### GV110-W05-T06 — Different draft at g=3

**Level:** INTEGRATION · **Status:** NOT_RUN  
**Precondition:** Completed issuance at g=3 and another frozen message.

**Stimulus:** Request new issuance for a different intent.

**Expected:** Issuance-paused refusal; no misleading old-permit match or replacement.

**Evidence:** Intent digests, horizon response and unchanged counts.

### GV110-W05-T07 — Duplicate completion callbacks

**Level:** CONCURRENCY · **Status:** NOT_RUN  
**Precondition:** Two verified-result callbacks for the same action arrive near-simultaneously.

**Stimulus:** Submit both through the shared coordinator; also try a conflicting operation ID.

**Expected:** At most one new permit and one ordinal increment; exact duplicate retrieves prior receipt; conflicting/stale intent is denied.

**Evidence:** Lock/revision timeline and final permits/receipts.

### GV110-W05-T08 — READY survives reload without send

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** A committed READY permit at g=3.

**Stimulus:** Reload the same origin and inspect its frozen message review.

**Expected:** Permit remains READY, no automatic delivery, no revived live run and no reset of the horizon.

**Evidence:** Post-reload snapshot, review screenshot and zero delivery count.

## W06 — Explicitly spend the selected permit into persisted local inbox rows

### GV110-W06-T01 — Explicit exact-permit send

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** A persisted READY permit for the frozen self-message.

**Stimulus:** Click Send for that specific permit ID after reviewing full content.

**Expected:** Exactly the reviewed bytes enter the owner inbox; permit becomes DELIVERED_LOCAL and spent once.

**Evidence:** Button/permit correlation, receipt and stored message bytes.

### GV110-W06-T02 — Per-recipient de-duplication

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Synthetic multi-mailbox fixture with To/Bcc overlap.

**Stimulus:** Send one permit through the real transition adapter.

**Expected:** Exactly one row per distinct authorized local mailbox, no duplicate from list overlap.

**Evidence:** Authorized set, resulting row keys and counts.

### GV110-W06-T03 — Repeat send before/after reload

**Level:** INTEGRATION · **Status:** NOT_RUN  
**Precondition:** Already delivered permit and consistent committed store.

**Stimulus:** Repeat the same send in current context and again after same-origin reload.

**Expected:** Same completed result with unchanged delivery count, revision policy and g; no new game.

**Evidence:** Before/after snapshot, operation ID and dealer calls.

### GV110-W06-T04 — Edited content or mismatched sender

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Valid READY and delivered fixtures.

**Stimulus:** Try different digest, changed content with old digest, or wrong sender.

**Expected:** Binding failure before any new delivery or spend mutation.

**Evidence:** Refusal reason and unchanged state at each permit state.

### GV110-W06-T05 — Recipient re-resolution at send

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** READY permit whose current registry or stored recipient scope is altered in a synthetic test.

**Stimulus:** Remove a recipient mailbox, insert an external string or change the authorized list.

**Expected:** Whole send is refused; no partial rows or spent permit.

**Evidence:** Current membership, rejection and zero transition.

### GV110-W06-T06 — Write/acknowledgment fault

**Level:** FAULT · **Status:** NOT_RUN  
**Precondition:** READY permit and storage adapter with controllable write/read-back failures.

**Stimulus:** Fail before write, after write or on acknowledgment; retry by exact operation ID.

**Expected:** No false success or duplicate spend; uncertainty is reconciled without creating another message.

**Evidence:** Fault/receipt timeline and final consistent snapshot.

### GV110-W06-T07 — Invalid permit/spend states

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Missing permit, unsupported QUEUED, invalid state and inconsistent spent/delivery fixtures.

**Stimulus:** Attempt send through the validated adapter.

**Expected:** Structured refusal/recovery-needed state, not silent success or invented queue completion.

**Evidence:** State-validation diagnostics and unchanged bytes.

### GV110-W06-T08 — Persisted inbox read is not issuance

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** Successful g=3 local delivery.

**Stimulus:** Read the recipient inbox, reload and read again.

**Expected:** Frozen subject/body remain visible and persisted; no puzzle or ordinal advance.

**Evidence:** Inbox and stored row snapshots, g and zero dealer work.

## W07 — Prove refusals at the correct validators and under hostile state

### GV110-W07-T01 — Validators are not masked by horizon

**Level:** REGRESSION · **Status:** NOT_RUN  
**Precondition:** Saved isolated g=1/g=2 fixtures for each negative validator.

**Stimulus:** Rerun all relevant bad-grid, label, batch, draft and recipient cases at the correct precondition.

**Expected:** Each reaches and fails its intended validator; ISSUANCE_PAUSED alone never passes another negative case.

**Evidence:** Per-case g, exact reason and before/after hashes.

### GV110-W07-T02 — Malformed JSON preservation

**Level:** FAULT · **Status:** NOT_RUN  
**Precondition:** Raw syntactically invalid storage and separately invalid top-level JSON fixtures.

**Stimulus:** Load, reload and attempt a permitted UI mutation.

**Expected:** Original bytes are preserved; mutation blocked; no automatic empty-instance overwrite, even if quarantine/export fails.

**Evidence:** Raw-byte hashes, recovery display and attempted-write log.

### GV110-W07-T03 — Nested schema and relation validation

**Level:** UNIT · **Status:** NOT_RUN  
**Precondition:** Fixtures missing spentPermits or containing duplicate IDs, orphan rows, invalid g/state/digest relationships.

**Stimulus:** Load each through the real validation boundary.

**Expected:** Structured corruption/incompatibility result; no uncaught TypeError or invented defaults that reopen spend.

**Evidence:** Schema diagnostics and unchanged raw state.

### GV110-W07-T04 — Cross-tab send race

**Level:** CONCURRENCY · **Status:** NOT_RUN  
**Precondition:** Two contexts share one origin, instance and READY permit.

**Stimulus:** Trigger simultaneous sends and delayed reads/writes under the selected lock.

**Expected:** One consistent final snapshot and one delivery per recipient; all cooperating writers share the same lock.

**Evidence:** Timeline with context IDs, revisions, receipts and final rows.

### GV110-W07-T05 — Stale-tab rollback prevention

**Level:** CONCURRENCY · **Status:** NOT_RUN  
**Precondition:** A newer committed revision plus a stale tab snapshot.

**Stimulus:** Attempt to write the stale state or revive a spent permit through normal application code.

**Expected:** Stale mutation denied; newer spend preserved. Manual hostile storage rollback is documented as outside the threat model, not falsely proven impossible.

**Evidence:** Revision checks, refusal and explicit residual-limit statement.

### GV110-W07-T06 — Storage/lock unavailable

**Level:** FAULT · **Status:** NOT_RUN  
**Precondition:** Quota exhaustion, denied storage, missing Web Locks and failed migration-backup fixtures.

**Stimulus:** Attempt domain/permit/send transitions separately.

**Expected:** Fail closed or read-only; no optimistic success, hidden unsafe lock fallback or source-byte destruction.

**Evidence:** Fault matrix, UI diagnostics and surviving bytes.

### GV110-W07-T07 — Runtime external-network boundary

**Level:** INTEGRATION · **Status:** NOT_RUN  
**Precondition:** Approved literal-loopback profile in a network-restricted synthetic environment.

**Stimulus:** Capture browser requests plus relevant process sockets/DNS while exercising required journeys.

**Expected:** No runtime external dependency or external mail lookup; activated auth/PWA/preview paths are either local and tested or disabled by the explicit profile.

**Evidence:** Browser/process network records and effective configuration.

### GV110-W07-T08 — Cross-platform and unchanged-neighbor regression

**Level:** REGRESSION · **Status:** NOT_RUN  
**Precondition:** Approved dependencies/runtimes and clean test copies.

**Stimulus:** Run typecheck, full relevant tests, build and normal-user Windows launch/error paths; inspect neighboring module diffs.

**Expected:** Actual results recorded; missing environments BLOCKED/NOT_RUN; no unrelated BEM/JA21/Penteract changes or source-control PASS propagation.

**Evidence:** Commands, exit codes, Windows diagnostics and scoped diff.

## W08 — Keep the horizon closed and issue an evidence-backed handoff

### GV110-W08-T01 — New issuance remains paused at g=3

**Level:** HEADED · **Status:** NOT_RUN  
**Precondition:** A valid completed envelope issuance at g=3.

**Stimulus:** Try another domain and another new envelope through UI and API.

**Expected:** No new game, resource, horizon lift or hidden smaller puzzle; a clear paused reason is displayed.

**Evidence:** Horizon state, attempted action and unchanged resource counts.

### GV110-W08-T02 — Existing resources remain usable

**Level:** INTEGRATION · **Status:** NOT_RUN  
**Precondition:** Separate persisted g=3 READY and DELIVERED fixtures from real accepted test runs.

**Stimulus:** Retrieve prior permit, send the existing READY message once, retry exact send and read inbox.

**Expected:** These existing operations remain available without new issuance or puzzles.

**Evidence:** Operation/receipt identities and unchanged g.

### GV110-W08-T03 — Measurements are scoped and honest

**Level:** REPORT · **Status:** NOT_RUN  
**Precondition:** Actual measurement records, including failures/timeouts.

**Stimulus:** Separate preparation, active solver, visible, paused and total time; report event and checkpoint counts.

**Expected:** Only measured samples are summarized; no historical sample or nominal 240 events/s is presented as guaranteed wall time.

**Evidence:** Sample table, sample sizes and excluded/failed attempt reasons.

### GV110-W08-T04 — Upstream assessment boundary

**Level:** STATIC · **Status:** NOT_RUN  
**Precondition:** Unchanged source-series records and authored local matrix.

**Stimulus:** Review every report for claimed control completion and parent installation.

**Expected:** All 4,800 source assessments remain NOT_ASSESSED absent separate per-ID evidence; 72 local cases are not a replacement inventory.

**Evidence:** Scope/status report and parent-pack non-execution record.

### GV110-W08-T05 — Diff and provenance handoff

**Level:** STATIC · **Status:** NOT_RUN  
**Precondition:** Reviewed completed or partial implementation workspace.

**Stimulus:** Hash final files, compare with baseline and list changes, outputs and evidence.

**Expected:** Original archives preserved; all edits attributable; no invented modified build or silently updated binding.

**Evidence:** Scoped diff, before/after hashes and artifact manifest.

### GV110-W08-T06 — Recovery checkpoint

**Level:** INTEGRATION · **Status:** NOT_RUN  
**Precondition:** Committed resources plus a deliberately interrupted uncommitted run.

**Stimulus:** Restart from the checkpoint and reconcile the store.

**Expected:** Committed operation receipts are retrieved; unfinished live tickets cancelled; no duplicate issuance/spend or guessed result.

**Evidence:** Checkpoint, restart log and reconciled state.

### GV110-W08-T07 — Evidence-backed release decision

**Level:** REPORT · **Status:** NOT_RUN  
**Precondition:** All workflow logs, 72 case results and finding dispositions.

**Stimulus:** Evaluate mandatory gates and missing/inconsistent evidence.

**Expected:** Release only with all mandatory passes and no unresolved blocker; otherwise an explicit partial/blocked decision with no fabricated approval.

**Evidence:** Signed/reviewer-attributed decision when available; absent reviewers remain unresolved.

### GV110-W08-T08 — Operator handoff and limitations

**Level:** REPORT · **Status:** NOT_RUN  
**Precondition:** Actual implemented behavior and measured platform results.

**Stimulus:** Write normal-user start, recovery, origin, freeze/send, horizon and shutdown instructions.

**Expected:** Instructions match the delivered diff; Windows/unobserved areas are labeled; browser-storage and same-origin trust limits are plain.

**Evidence:** Operator runbook, known limitations and next permitted checkpoint.
