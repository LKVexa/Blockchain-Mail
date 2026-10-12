# Executed verification and evidence boundaries

## Historical Linux baseline and integration results

The table below preserves the earlier Linux verification. Current Windows
3.9.0-local.1 checks are recorded in the parent package's
`RELEASE_VERIFICATION.json` and `verification/`. Read its individual statuses:
backend/native-archive tests do not establish full native console interaction
or a complete 8Sphere numerical cipher.

| Exercise | Actual outcome | Evidence |
|---|---|---|
| Untouched Glyphoku baseline | 3 tests passed | `evidence/baseline/glyphoku.tap` |
| Untouched Vexa127 baseline | 86 tests passed | `evidence/baseline/vexa.tap` |
| Integrated implementation suite | 113 passed, 0 failed | `evidence/delivery/TEST_SUMMARY.json`, `TESTS.tap` |
| Real local HTTP integration | 19 checks passed | `evidence/delivery/HTTP_SUMMARY.json`, retained full trace files |
| Synthetic 2.1.0-to-3.0.0 compatibility | 8 checks passed | `evidence/delivery/UPGRADE_SUMMARY.json` |
| Offline React UI fixture | 14 checks passed | `evidence/delivery/UI_FIXTURE_REPORT.json`, labeled screenshots in `evidence/browser` |
| Direct headed browser navigation | BLOCKED by administrator policy | `evidence/delivery/BROWSER_NAVIGATION.json` |
| Unselected random-seed preparation sample | Four eligible batches / six unique boards; hidden preparation only | `evidence/delivery/GENERATION_SAMPLE.json` |
| Read-only source archive audit | 3 exact archives, 7 unsafe-input fixtures rejected | `evidence/delivery/INTAKE_AUDIT.json` |

The 113-test suite includes one composite HTTP exercise and one composite upgrade exercise. Their checks are not counted again as additional independent unit tests. The baseline runs are historical evidence, not an extra 89 current tests. A fresh-extraction rerun, when reported in the external delivery-validation file, is reproduction of the same suite, not another 113 distinct tests.

## Method and environment

Actual Node execution: v22.16.0, Linux x64. Node's experimental SQLite warning is retained. All runtime fixtures use synthetic accounts/messages/keys and disposable state. Real HTTP tests bind literal loopback and use ephemeral test ports explicitly; this is not ordinary startup silently falling back. They run the real worker, solver, HTTP routes, authorization, SQLite, cryptography and mailbox reads. The driver acknowledges frame messages programmatically; its result is not evidence that a person saw the server game in a browser.

The UI fixture uses actual delivered JavaScript/React on a headed Chromium process with a virtual X display and **in-memory mocked fetch responses only**. It verifies selected controls and DOM behavior, including 256 cells, pace controls, pause/step/stop, locked composition, READY/explicit Send, logout and narrow-screen overflow. It neither navigates to nor proxies the server. All screenshots are visibly labeled mock/not-live-delivery. The first real browser navigation returned `ERR_BLOCKED_BY_ADMINISTRATOR`; no browser policy was bypassed. Visible observation time is unmeasured (`visible_time_ms:null`), not inferred from event counts or hidden search duration.

Runtime bounded experiments do not establish all source acceptance cases, a universal cryptographic proof, high-load capacity, unbiased difficulty progression, Sybil deterrence, real money behavior or legal compliance. No independent reviewer or owner signature is fabricated. Windows startup/setup, full hosted-app dependency installation/typecheck/build, mobile-device execution, and actual browser-to-server reload/multitab/visibility journeys remain unperformed.

## Preserved failures and corrections

The evidence directory retains failed attempts before fixes. These include preparation hitting a resource bound; canonical JSON property-order assumptions across encrypted serialization; a trace events-array being confused with its count; integer-only ledger serialization rejecting floating timing metrics; and UI-harness/module/UUID/accessibility issues. The corrections preserve exact source difficulty and do not turn preparation failure into an easier puzzle.

A reproduced folder-state failure was fixed by checking immutable original Inbox/Sent delivery roles rather than mutable current folders. A refined nonce fixture exposed reuse of a retired registry nonce by mail encryption under the same key; new mail now checks the registry nonce history before encryption. The initial broader nonce fixture passed because a later registry write already rejected the constant nonce; that insufficient first fixture is retained alongside the refined failing test and corrected result. These distinctions matter: a passed unrelated rejection is not the requested negative oracle.

## Reproduction commands

```sh
node tools/preflight.mjs
node tools/check-package.mjs
node tools/run-tests.mjs
node tools/glyphoku-check.mjs
node tools/glyphoku-upgrade-check.mjs
```

Optional, only in an approved environment with installed Playwright/Chromium and a display:

```sh
xvfb-run -a python tools/glyphoku-ui-fixture.py
```

Set `CHROMIUM_PATH` for that optional fixture when needed. No tool silently installs it. The main package runs without these Python/browser test dependencies. `tools/build.mjs` requires separately supplied TypeScript 5.8.3 to reproduce the ten selected UI modules; it is transpilation, not the full hosted application build or type checking.

Results are bound to listed source digests. `CANDIDATE_MANIFEST.json` records current code identity; `CHANGE_MANIFEST.json` and `SOURCE_CHANGES.diff` record baseline deltas. Document/file checksum validation is only artifact integrity, not a signature or acceptance decision.
