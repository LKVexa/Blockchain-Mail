# Candidate audit and integration-gap register

**Prepared 6 October 2026 · Documentation baseline, not a full product-security audit**

## Provenance and actual inspection

The supplied small ZIP contains 12 Markdown files (13 ZIP entries including one directory). The candidate contains 291 regular files and 75 directory entries, totaling 129,679,987 uncompressed bytes. All outer ZIP members were inspected for traversal/absolute paths, backslash or drive-path ambiguity, symlink entries and case-insensitive name collisions; member data were read and hashed. No such rejected member was encountered in these archives. This is an archive-intake observation, not a malware scan or an exhaustive parser-security assessment. Nested BEM/Glyphoku/JA21 archives were hashed as opaque outer members and not expanded or executed.

Candidate archive SHA-256: `28313d7f5e05f5fdea31e2f4e615ead2a84aed4c9ae8bb6a28853a791b8b82fd`  
Source-series archive SHA-256: `3f2774b3f6b447af05b87d357b15c0aadf0838442dbdf0f57f252a8ba2b929df`

The route, studio, registry, rules, dealer, solver, glyph mapping, existing Glyphoku tests, package/lockfile, runtime configuration and neighboring boundaries were inspected. [Source excerpts](evidence/CANDIDATE_SOURCE_EXCERPTS.md) preserve the cited line references; [candidate member manifest](evidence/candidate_archive_manifest.json) and [binding](TARGET_BINDING.json) preserve exact file hashes. The original archives were not modified. No source parent pack was installed.

The referenced private chat produced a login page and no candidate transcript. Prior-context retrieval did not identify that conversation. Consequently, attachment-to-chat identity is unverified; the integration guidance is grounded in the attached build rather than unseen conversation content.

## Actual tests performed

The existing candidate test file was executed in an isolated extracted source copy using Node v22.16.0 on Linux, without installing application dependencies or starting the application:

```text
node --import ./scripts/register-tests.mjs --experimental-strip-types --test-concurrency=1 --test src/lib/glyphoku/glyphoku.test.ts
```

Result: **3 tests passed, 0 failed**, reported duration **20,422.7652 ms**. See [raw TAP output](evidence/glyphoku-tests.tap) and [exit status](evidence/glyphoku-tests.exit.txt). Type stripping is execution support, not a TypeScript typecheck.

Thirteen additional characterization probes ran against the unchanged registry/rules modules with synthetic in-memory records. Ten expose behavior inconsistent with the revised boundary contract; three reproduce expected existing behavior (repeat-send no-op, changed-digest refusal, and external-recipient refusal through freezeDraft). See [probe source](evidence/characterize.mjs) and [observed results](evidence/characterization.json). The known completed grids in these probes deliberately challenge the acceptance boundary; they are not evidence of genuine visible solving or valid issuance authorizations. No external mail, network listener or persistent browser state was used.

Not performed: full dependency installation, typecheck, full application test suite, production build, headed browser journey, Windows execution, runtime network capture, real-data migration, or any candidate patch. These remain NOT_RUN/NOT_STARTED as applicable, not inferred passes.

## Findings

All findings remain open for the implementation agent. A confirmed in-memory behavior is distinguished from a static gap or unobserved browser risk; no remote exploitability or user-facing failure is asserted without corresponding evidence.

### F01 — Live-run authorization is not bound

**Basis:** CONFIRMED_PROBE · **Workflow owners:** W01/W02/W03/W05 · **Evidence:** PR01  
**Source:** `src/lib/glyphoku/registry.ts:110-188`

commitDomain accepts a valid candidate and in-band givens without a live run, event trace, action binding or render observation. A completed synthetic grid produced a domain in the in-memory probe.

**Required integration result:** Put a one-use, action/revision/profile-bound run coordinator in front of the sole mutation boundary; do not accept arbitrary final grids or replay records as authorization.

### F02 — Duplicate boards count as two fresh boards

**Basis:** CONFIRMED_PROBE · **Workflow owners:** W01/W05 · **Evidence:** PR02  
**Source:** `src/lib/glyphoku/registry.ts:158-193`

Two copies of the same g=2 givens/candidate pair issued one READY envelope. Batch length is checked; distinctness and prior-use provenance are not.

**Required integration result:** Bind each board fingerprint and batch index; reject duplicates and cross-action reuse, then persist consumed authorization identifiers with the resource.

### F03 — Draft integrity is asserted by the caller

**Basis:** CONFIRMED_PROBE · **Workflow owners:** W04/W05/W06 · **Evidence:** PR03/PR04  
**Source:** `src/lib/glyphoku/registry.ts:67-92,158-193,195-234`

Changing the body while retaining the old digest was accepted by sendLocal and stored in a delivery row. issuePermit also accepted an unregistered sender and external recipient in a caller-forged FrozenDraft. TypeScript annotations do not perform runtime validation.

**Required integration result:** Centralize canonicalization and digest recomputation, copy frozen data, and validate the full draft and sender at issue/send. Compare against the recorded permit content, not only a supplied digest string.

### F04 — Send does not re-resolve recipient membership

**Basis:** CONFIRMED_PROBE · **Workflow owners:** W06/W07 · **Evidence:** PR05  
**Source:** `src/lib/glyphoku/registry.ts:195-234`

A synthetic READY permit edited to name outsider@example.com generated a local delivery row with that mailbox string. No network mail was sent; this is a registry-integrity failure, not a demonstrated SMTP relay.

**Required integration result:** Revalidate every unique recipient in the current locked instance immediately before spending; reject the whole transition when any membership or authorized-recipient binding differs.

### F05 — Horizon masks exact permit retry

**Basis:** CONFIRMED_PROBE · **Workflow owners:** W05/W08 · **Evidence:** PR06  
**Source:** `src/lib/glyphoku/registry.ts:158-177`

After issuance advances g to 3, calling issuePermit with the identical draft returns the horizon refusal before reaching its existing-permit lookup. The original W05 promise is not true on this path.

**Required integration result:** Separate exact read-only operation retrieval from new issuance, or perform validated idempotency lookup before the new-issuance gate. Never create a replacement or reset g.

### F06 — Invalid storage may become an empty writable instance

**Basis:** STATIC_AND_PROBE · **Workflow owners:** W00/W03/W07 · **Evidence:** PR10  
**Source:** `src/components/glyphoku/studio.tsx:32-53,90-99; src/lib/glyphoku/registry.ts:190-206`

loadInstance validates only selected top-level fields, not spentPermits or nested relations. Syntactically invalid JSON falls through catch to emptyInstance without quarantine. A structurally rejected value is copied to one overwriteable quarantine key, then empty state can be persisted. Missing spentPermits caused sendLocal to throw in the probe.

**Required integration result:** Version and validate the complete schema; distinguish absent storage from corrupt storage; preserve raw bytes without overwriting them; require recovery before writes; return structured failures rather than TypeError.

### F07 — UI success precedes coordinated persistence

**Basis:** STATIC_GAP · **Workflow owners:** W00/W03/W05/W06/W07 · **Evidence:** NOT_RUN_IN_BROWSER  
**Source:** `src/components/glyphoku/studio.tsx:95-99,149-185,461-473`

Registry transitions update React state and an effect writes localStorage later. There is no reviewed exclusive cross-tab writer, registry revision, atomic receipt boundary, write error handling or read-back decision. Inbox/send labels therefore do not establish successful persistence.

**Required integration result:** Centralize all mutations under an exclusive origin lock, re-read/revalidate, persist one snapshot plus receipt, read back, then render success. Treat ambiguous acknowledgment as recovery-needed, not a new send.

### F08 — Composition/cancellation lacks a full lifecycle fence

**Basis:** STATIC_GAP · **Workflow owners:** W02/W04 · **Evidence:** NOT_RUN_IN_BROWSER  
**Source:** `src/components/glyphoku/studio.tsx:235-321,438-450`

Recipient, subject and body controls remain editable during solving. Preparation is synchronous inside a delayed callback; stopRun does not invalidate that callback with a run generation token. Long preparation can block interaction.

**Required integration result:** Freeze or separate the active composer; use cancellable bounded preparation and a generation/run fence at each asynchronous result; cancel on stop/unmount and reject late commits.

### F09 — Event processing is not per-event visual evidence

**Basis:** STATIC_GAP · **Workflow owners:** W02 · **Evidence:** NOT_RUN_IN_BROWSER  
**Source:** `src/components/glyphoku/studio.tsx:109-125,188-224; src/lib/glyphoku/solver.ts:12-21`

The timer processes up to speed events synchronously while updating React state. The UI stores only a latest-event label and aggregate guesses/retractions, not a complete bounded audit trace or render acknowledgments. Separate DOM paints for every logical event were not observed.

**Required integration result:** Keep 24 logical events/tick, distinguish event records from rendered checkpoints, provide bounded trace/step access and initial/final paint gates, and test the headed view.

### F10 — Dealer budget and uniqueness outcomes need hardening

**Basis:** STATIC_AND_PROBE · **Workflow owners:** W01/W02 · **Evidence:** PR11  
**Source:** `src/lib/glyphoku/deal.ts:5-35; src/lib/glyphoku/rules.ts:98-167,207-248`

dealPlayable handles SEARCH_SOLVED before its events>cap check, and does not explicitly require g=2 retractions. countSolutions can return one after its node budget is exceeded if one solution was found, despite incomplete enumeration; it also returns one for a completed duplicate-filled grid. fill has no explicit node/deadline bound.

**Required integration result:** Return typed complete/incomplete uniqueness results, validate givens, make caps inclusive with no cap+1 acceptance, enforce retractions, and bound/cancel preparation. The uniqueness exhaustion path is a static finding; no budget-exhaustion seed was measured here.

### F11 — Caller can substitute a different box geometry

**Basis:** CONFIRMED_PROBE · **Workflow owners:** W01/W03/W05 · **Evidence:** PR09  
**Source:** `src/lib/glyphoku/registry.ts:110-131,158-175; src/lib/glyphoku/rules.ts:64-89`

A Latin-square candidate invalid under PLAYED was accepted for a domain when the caller supplied 1x16 boxes. The in-band test checks cell count rather than the required topology identity.

**Required integration result:** Require the exact profile topology at the issuance boundary and validate topology before helper searches. Utility topology support cannot override the played profile.

### F12 — A second domain can consume the only envelope ordinal

**Basis:** CONFIRMED_PROBE · **Workflow owners:** W03/W05 · **Evidence:** PR08  
**Source:** `src/components/glyphoku/studio.tsx:235-266,428; src/lib/glyphoku/registry.ts:110-150`

After creating one domain, another domain with two boards is accepted and moves g to 3. This prevents the requested domain-then-envelope journey. The series refinement reserves g=2 for that envelope rather than changing the horizon.

**Required integration result:** Enforce the selected action lifecycle in both UI admission and registry transition. Preserve already-existing incompatible states read-only; do not erase them to produce the happy path.

### F13 — Local mailbox labels do not enforce local hosting

**Basis:** STATIC_CONFIGURATION · **Workflow owners:** W00/W07 · **Evidence:** NO_NETWORK_CAPTURE  
**Source:** `package.json:scripts.dev; vite.config.ts:145-183; src/routes/__root.tsx:1-36`

The dev command and config bind 0.0.0.0:8080; preview is configured for 127.0.0.1:8081. Root auth/provider, preview bridge, PWA and server plugins remain in the app. No browser/process network capture was taken.

**Required integration result:** Add a separately selected literal-loopback runtime profile, preserve the hosted preview contract distinctly, and inspect activated browser/server dependencies. Do not certify egress denial from source labels.

### F14 — The aggregate test script assumes a POSIX shell

**Basis:** STATIC_CONFIGURATION · **Workflow owners:** W00/W07 · **Evidence:** WINDOWS_NOT_RUN  
**Source:** `package.json:scripts.test; scripts/with-app-env.mjs:108-136`

The npm test string uses semicolons, $?, shell assignments and a POSIX if expression. Its portability to ordinary Windows cmd.exe is not established. The direct Node Glyphoku test command did run on Linux.

**Required integration result:** Use direct Node test invocations or a reviewed cross-platform Node runner; verify Windows launch and exit propagation separately, without installing runtimes or bypassing OS security automatically.

### F15 — Legacy test/sample claims cannot certify the revision

**Basis:** EVIDENCE_BOUNDARY · **Workflow owners:** W07/W08 · **Evidence:** BASELINE_3_PASS  
**Source:** `src/lib/glyphoku/glyphoku.test.ts:20-85; source-series/MASTER_PROMPT.md; source-series/W07_REFUSE.md`

The three existing tests passed but omit the demonstrated gaps. Original W07 asks to use the post-send g=3 instance for validators that should be reached at g=1/g=2, allowing horizon refusal to mask defects. Historical timings and the 4,800-control declaration are not a new assessment.

**Required integration result:** Use validator-specific preconditions and exact refusal reasons; measure new timings separately; preserve source assessments as NOT_ASSESSED and keep baseline/test-plan/implementation results distinct.

## What already exists and should be preserved

The supplied root route renders GlyphokuStudio, the 16-symbol alphabet is explicit, the default speed state is 24, and the g=1/g=2 bands and horizon are implemented. freezeDraft already canonicalizes the principal message fields and rejects ordinary external-recipient input. verifyCandidate checks final grid completeness, unchanged givens and repeated row/column/box values for its supplied topology. sendLocal already no-ops a repeated send under a consistent in-memory state. These useful paths should remain covered while the missing authority, persistence and observation boundaries are added.

No finding here implies that the complete BEM, Glyphoku parent or Obscura research libraries have been assessed. Those packages are not installed by this revision, and the 4,800 source-control assessments remain NOT_ASSESSED.
