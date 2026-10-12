# Master prompt — integrate against the actual Glyphoku candidate

**Series 1.1.0 · Integration policy revision 1.1.0 · Profile `GLYPHOKU_VEM_127/1`**  
**Starting workflow state:** `NOT_STARTED` · **Starting assessment:** `NOT_ASSESSED`

## 1. Assignment and execution authority

Act as the integration engineer and verification author for the supplied Glyphoku local-mail candidate. Retain its existing React/TypeScript desk and browser registry; repair the boundaries between puzzle generation, visible solving, verification, capability issuance, storage, and explicit local delivery. Authoring this package does not authorize deployment or silently execute the revised workflows. When subsequently asked to implement it, work only in the named authorized copy and preserve the supplied baseline.

The attached candidate is `B4PPUPFqdW8lePvv-grok-workspace.zip`, SHA-256 `28313d7f5e05f5fdea31e2f4e615ead2a84aed4c9ae8bb6a28853a791b8b82fd`. The original small series is `ksxPB5t2PsP8KCqy-grok-workspace.zip`, SHA-256 `3f2774b3f6b447af05b87d357b15c0aadf0838442dbdf0f57f252a8ba2b929df`. Use [TARGET_BINDING.json](TARGET_BINDING.json) for the selected file identities. The private conversation was not readable; treat any later-retrieved transcript as a new source to reconcile, never as permission to invent its contents.

Resolve conflicts explicitly: the current task defines the deliverable; the small supplied series defines this local two-journey profile; inspected code establishes what exists, not what is acceptable. Adjacent historical master prompts, BEM parent archives, Glyphoku parent archives, JA21 tools and Obscura remediation documents remain reference material, not automatic execution authority. Preserve all originals and record every changed predicate in [SOURCE_CROSSWALK.md](SOURCE_CROSSWALK.md).

Before modifying code, record a run ID, actual target root and source revision, approved output/evidence roots, browser origin, local instance ID, selected profile digest, operator authorization, permitted file changes, runtime identity and permitted network actions. Do not interpret a ChatGPT sandbox path or a remembered Windows directory as the deployment root. Do not deploy, send external email, migrate real mail, install parent archives, alter licenses, weaken operating-system security, or reconfigure unrelated services.

## 2. Bind the existing implementation, rather than inventing it

| Boundary | Existing file / symbol | Integration instruction |
|---|---|---|
| Entry route | `src/routes/index.tsx`, `GlyphokuStudio` | Keep `/` wired to the current desk. No parallel replacement app. |
| Operator desk | `src/components/glyphoku/studio.tsx` | Repair run lifecycle, freeze controls, visible evidence and persistence handoff. |
| Registry | `src/lib/glyphoku/registry.ts` | Retain domain/mailbox/permit/delivery ownership here; harden acceptance. |
| Puzzle policy | `src/lib/glyphoku/rules.ts` | Enforce `PLAYED`, horizon, exact batch count, band and complete verification. |
| Dealer | `src/lib/glyphoku/deal.ts` | Return givens, not an issuance-ready hidden answer; harden budgets and eligibility. |
| Live solver | `src/lib/glyphoku/solver.ts` | Preserve incremental events and independently verifiable final candidate. |
| Alphabet | `src/lib/glyphoku/glyphs.ts` | Preserve the exact 16-symbol display mapping. |
| Digest primitive | `src/lib/sha256.ts` | Cross-check against a standard implementation in tests; no invented crypto. |
| Baseline tests | `src/lib/glyphoku/glyphoku.test.ts` | Preserve useful tests; add missing boundary coverage rather than weakening assertions. |
| Host/runtime | `package.json`, `vite.config.ts`, existing wrappers | Separate local-only execution from hosted preview. |

Small helper modules under `src/lib/glyphoku/` are allowed when they consolidate persistence or run ownership. They must remain adapters to **one** registry, not another mail stack. Any new file is a proposed implementation target until it exists in the reviewed diff. Preserve neighboring `src/lib/bem-mail.ts`, `src/components/obscura/`, `src/lib/ja21.ts` and `src/lib/penteract.ts` unless a narrowly justified nonbehavioral import or build fix is separately recorded.

The actual active mail store is browser `localStorage` at `glyphoku-local-127`. The presence of auth migrations, PostgreSQL/PGlite libraries or server scaffolding elsewhere does not make this store a server mailbox or authorize a database migration.

## 3. Non-negotiable puzzle and lifecycle policy

Use `PLAYED={order:16,boxRows:4,boxCols:4}` at the authoritative boundary, even when a caller supplies a different topology. Candidate values are integer indexes 1–16; zero is an unfilled given. Render, in order:

```text
1 2 3 4 5 6 A B C D E ★ ◆ ♠ ♣ ♥
```

Each row, column and 4×4 box contains every symbol exactly once. A mixed-glyph rendering remains a constraint puzzle; do not claim the displayed alphabet provides cryptographic encryption.

Use one global local-instance issuance ordinal. For this selected two-journey profile, g=1 authorizes one domain action; g=2 authorizes the subsequent envelope action. `P(g)=2^(g−1)` gives one board and two boards, respectively. Every board is 256 cells. The g=1 empty band is 124–132, minimum guesses 8, total event cap 12,000. The g=2 band is 133–140, minimum guesses 12, at least one `RETRACT` per board, total event cap 18,000. Count `INIT` and the terminal event in the cap; an event at cap+1 is not eligible. The profile horizon stays `HORIZON_G=2`.

Reject missing, repeated, reused, stale, wrong-action, wrong-ordinal or malformed board authorizations. Do not let a second domain consume the only envelope ordinal in this profile. Preserve older incompatible registries read-only with a recovery explanation; never delete or rewrite them merely to obtain the desired journey.

The empty bands and measured trace thresholds are policy predicates, not a theorem of psychological difficulty or a certification. The dealer's uniqueness search must distinguish complete enumeration from exhausted budget. Finding one completion and then exhausting the budget is **not** proof of uniqueness. Validate givens before searching; duplicate-filled grids are not unique valid puzzles. Do not lower bands, widen event caps, hide unbounded fill/search work, or substitute a smaller digit board to finish a demonstration.

## 4. Bind real solving to resource acceptance

The baseline `commitDomain` and `issuePermit` accept arrays without evidence that a current visible run produced them. Introduce a single run coordinator owning a fresh run ID, expected registry revision, action, g, profile digest, exact frozen label or draft digest, ordered batch of distinct challenge fingerprints, and per-board event counters. Keep the live authorization handle internal to the application; do not accept arbitrary caller-assembled trace JSON as equivalent to that handle.

A complete run starts from givens, yields `INIT` before placements, performs actual solver mutations, and ends in a final candidate independently checked against the locked topology, unchanged givens, band, terminal status, event budget and required search characteristics. A prior scoring solve inside the dealer is selection work only. A stored replay, supplied completed grid, unit-test fixture or historical event log is never an issuance authorization. Persist consumed challenge/run fingerprints with the successful registry transition so reload does not reopen replay eligibility. An in-flight run interrupted by restart is cancelled, not recreated from a receipt as if it were live.

Use hashes and one-use run IDs to enforce the cooperative application's integrity contract, not to assert tamper resistance against someone controlling the same origin, developer tools or browser profile. Trace validity does not prove that a person watched it. Headed observation is separately required for the visible-solving claim.

## 5. Make visible search and cancellation truthful

Retain default speed 24, options 1/8/24/40, and the 100 ms logical tick. A 24× setting permits up to 24 solver events per tick; it does not promise 240 screen refreshes per second. React may batch state updates. Record each solver event in a bounded audit stream, render current progression and branch/retraction indicators, and allow pause plus single-step inspection of each transition. Record solver-event count, rendered-checkpoint count and paint acknowledgments separately.

Display a committed initial givens frame before allowing search to advance. At completion, pause the authorization boundary until the final candidate has a render acknowledgment and independent verification completes. Neither acknowledgment nor `SEARCH_SOLVED` alone authorizes a registry write. When a tab hides, the observer unmounts, the event backlog exceeds its bound, or a stop command occurs, immediately suspend or invalidate the live run. A delayed callback or worker result from a cancelled run must never commit.

The baseline dealer runs synchronously after a timeout. Move expensive preparation to a cancellable worker or a cooperatively yielding bounded job, without shipping answers to be replayed as live work. Record explicit preparation wall-time/node limits in the run binding before execution; this series does not invent empirical safe limits. Fail closed when limits cannot be selected or enforced. Show PREPARING separately from LIVE SOLVING. Freeze composition throughout preparation, solving, verification and the READY permit review. Do not claim a UI stop can interrupt a synchronous blocked main thread unless that has been implemented and tested.

## 6. Freeze and validate the exact message at every trust boundary

Preserve the existing version-1 canonicalization unless a versioned migration is separately approved: trimmed subject, no CR/LF in subject, body CRLF normalized to LF, recipient strings split on commas/whitespace, lowercase and de-duplicated within each list in first-seen order, and the sender equal to an existing mailbox address. Subject length 1–120 and body length at most 4,000 use the current JavaScript string-length semantics; do not claim byte or grapheme limits. No Unicode normalization or recipient sorting is added invisibly.

The digest preimage is the UTF-8 encoding of `JSON.stringify({from,to,bcc,subject,body})` in that key order; `digest` itself is excluded. Deep-copy the arrays and body into the frozen value. Recompute this digest at freeze, issue and send, rather than trusting the caller's `digest` field. Compare canonical bytes and authorized recipients as well as the digest, and reject extra or malformed values at the schema boundary. Re-resolve sender and each distinct recipient against the same registry instance at issuance and delivery. No external DNS/MX fallback exists.

Display the exact frozen subject, body and recipient scope beside READY—NOT SENT. The baseline UI has no Bcc input; its helper supports Bcc. Test Bcc through controlled fixtures without pretending the field exists on screen. Do not expose Bcc recipients to unrelated recipient views. This single-operator browser desk is not a confidentiality boundary between authenticated users.

## 7. Commit and send through one coordinated browser store

Implement the versioned schema, validation, lock and read-back contract in [INTEGRATION_CONTRACTS.md](INTEGRATION_CONTRACTS.md). Validate every persisted array, identifier, relationship, ordinal, digest, permit state and spent/delivery relationship. Malformed JSON, unsupported schema, denied storage access, failed write, quota exhaustion or impossible relationships must preserve existing bytes and block mutation. Do not convert unreadable data into a new empty instance that overwrites it.

All writers must use one same-origin exclusive mutation coordinator. Re-read and validate the latest snapshot inside that boundary, enforce the expected instance/revision and action state, compute a pure transition, persist the entire next snapshot with its receipt, and verify read-back before announcing success. Browser persistence has a limited failure model: do not call it fsync-backed, externally tamper-evident, or safe against manual rollback. A plain `localStorage` read/write sequence, checksum or storage event is not a cross-tab lock. If the required lock mechanism is unavailable, refuse mutation rather than degrade silently.

Create exactly one domain and owner mailbox when the domain authorization commits. Issue exactly one sender/draft/recipient-bound READY permit after the two-board authorization. The new issuance horizon does not block a read-only retrieval of an already accepted operation. Return the exact existing permit/receipt on an exact matching retry, with unchanged g and no new puzzle. Never mint a replacement for an already delivered permit.

Send only the explicitly selected permit ID and its verified frozen draft. Revalidate before spending; then append one row for each distinct authorized recipient, mark the permit DELIVERED_LOCAL and record its ID as spent in the same stored transition. A repeated same-content send returns the prior result with no extra rows. A changed message, missing mailbox, inconsistent spend record or stale snapshot is a structured refusal. The baseline type contains QUEUED but implements no queue: do not turn an unexplained QUEUED state into success or invent a transport.

## 8. Keep local HTTP separate from local mailbox names

The registry itself performs no SMTP conversation or DNS/MX lookup, but the surrounding app is still served over HTTP. The candidate's default development command/configuration bind `0.0.0.0:8080`; preview configuration names `127.0.0.1:8081`. Do not call the default development profile loopback-only. Create a clearly selected local profile with a literal `127.0.0.1` bind, fixed approved port, strict-port failure, bounded allowed hosts/origins and no runtime external network dependencies. Keep the hosted Grok preview contract separately labeled if retained; it must not be the acceptance environment for the local-only claim.

Pin one browser origin: scheme, address and port are part of storage identity. Changing from a hosted site or from localhost to 127.0.0.1 does not automatically transfer its browser registry. A separately authorized export/import can preserve data; absence of data at a different origin is not evidence of corruption.

Inspect root auth/provider, preview bridge, PWA, server and asset paths for activated network dependencies. Do not infer network isolation from the absence of `fetch` in registry.ts. Do not weaken host security, broaden firewall rules, disable Smart App Control, use admin launch as the default, or deploy to Vercel. Existing package-lock versions remain the baseline; verify local dependencies and runtime compatibility rather than substituting a latest version.

## 9. Evidence and release rules

Read each W00–W08 dossier before its work. Develop negative tests alongside changes and run the complete acceptance matrix again in W07. Reuse saved **synthetic precondition snapshots**, not g=3 indiscriminately: an out-of-band or changed-given test must reach that validator at g=1 or g=2, not merely hit the horizon first. Every failed operation must prove unchanged resource counts and committed state, not just show an error string.

Do not reuse the historical five-deal timing sample as new evidence. Measure preparation, active solver time, visible elapsed time, paused/hidden time, event count and render checkpoints separately. Do not turn the baseline three passing tests or thirteen characterization probes into PASS for revised workflows. All 72 newly authored acceptance cases start NOT_RUN. All source controls remain NOT_ASSESSED until a separate control-specific assessment identifies their exact source record and evidence.

After an authorized run, return the reviewed diff; actual before/after target identities; all commands, exit codes and logs; observed domain/permit/delivery transitions; headed traces and viewport evidence; post-reload inbox data; external-recipient refusal; exact repeated-send result; horizon refusal; corruption/concurrency/failure-injection results; local network observations; Windows results or explicit NOT_RUN; and a resumable checkpoint. Separate **implemented**, **tested**, **observed**, **blocked**, and **not assessed**. A missing gate blocks release; it does not authorize weakening the profile to produce a story.
