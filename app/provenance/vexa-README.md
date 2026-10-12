# Vexa127 — Local Blockchain Email Server

**Release:** `2.1.0-local.1` · **Runtime profile:** `LOCAL127_CREDIT_V1`  
**Delivery class:** Working, tested local laboratory implementation. Not a production or independently certified mail service.

Vexa127 is an executable upgrade path from the supplied Vexa durable local-mail candidate. It preserves its local mailbox model and VEM-OBJECT/2 payload framing while replacing the deployment, authentication, persistence and postage paths. A browser mailbox and authenticated SMTP listener communicate with a single local authority. Sending consumes a signed local postage stamp and records delivery, encrypted storage and replay state in the same database transaction as a signed block.

**This is a single-authority local blockchain, not a distributed-consensus network.** Credits are nonredeemable laboratory counters—not cryptocurrency, money, ERC-20 tokens or public postage. Nothing sends mail to Gmail, Outlook or the public Internet.

## Changes in 2.1.0

This continuation fixes reproduced MIME and read-integrity failures, adds snapshot-aware mailbox pagination, and prevents obsolete browser-session work from publishing late results. It also supplies an actual synthetic 2.0.0-to-2.1.0 compatibility exercise. The database schema, authority keys and `LOCAL127_CREDIT_V1` financial semantics are unchanged.

The 86-test implementation suite passes on the recorded Linux runtime. A separate 48-observation HTTP exercise, seven upgrade checks, and twelve **offline mock-DOM** checks also pass. Direct browser networking remains blocked by the managed test environment; Windows and independent institutional acceptance are not claimed. [Continuation report](docs/CONTINUATION_REPORT.md) distinguishes every evidence class.

## Start on Windows

Extract the folder to a short path, such as `D:\Vexa127`. Keep the entire folder together. No administrator window is required.

1. Run `RUN.cmd`. It checks for `runtime\win-x64\node.exe`, then an available `node.exe` on PATH. It does not install packages, download dependencies, modify PATH, disable security controls, or open a public listener.
2. A compatible Node.js runtime is required. When none is available, run `SETUP_RUNTIME.cmd` explicitly for the optional private Windows x64 runtime, or supply a suitable runtime yourself. **This separate setup operation requires Internet access.** It targets official Node.js 24.21.0, verifies its archive against the official HTTPS SHA-256 document and keeps it inside this folder. It does not silently execute as part of startup. Setup and Windows execution were not run in the delivery environment.
3. Once both listeners are ready, the launcher prints the address and attempts to open the browser. Open `http://127.0.0.1:8787` manually when necessary.
4. Open `state\credentials.secret.json` locally. Paste the token for `postmaster@local.test` into the login screen. This account has operator tools. The second account is `user@local.test`. Send from one account and sign into the other to read the delivered message.

The first start generates new random tokens, an authority key, an encryption key and a fresh local chain on **your** machine. The release includes no working mailbox tokens, private keys, test database or prepopulated user correspondence. After rotation, the original credentials file is stale for that account; retain the newly returned token.

The actual test environment was **Linux x64, Node.js v22.16.0, SQLite 3.49.1**. The code requires Node.js 22.16 or newer with the built-in `node:sqlite`, Ed25519 and ChaCha20-Poly1305 capabilities; `tools/preflight.mjs` checks these. Passing preflight on another version or OS is not equivalent to the delivered test run. Run `TEST.cmd` on the target Windows machine before relying on it.

## Commands

| Launcher | Action |
|---|---|
| `RUN.cmd` | Preflight and start the local web/SMTP server; keep the console open. |
| `INIT.cmd` | Create local state and credentials without listeners. |
| `STATUS.cmd` | Query actual loopback health, not just the presence of a marker file. |
| `VERIFY.cmd` | Verify persisted block signatures, links, event roots, current state, credit conservation and encrypted objects. |
| `TEST.cmd` | Run the isolated synthetic test suite and write a new timestamped evidence directory. |
| `BACKTEST.cmd` | Run the synthetic chronological HTTP send/replay/recovery exercise; not a historical-data backtest. |
| `CHECK_PACKAGE.cmd` | Check delivered file digests; not a security certification. |
| `DEMO.cmd` | Send one synthetic local demonstration message using the original operator token. |
| `STOP.cmd` | Request authenticated shutdown; after token rotation use Ctrl+C in the server console. |
| `SETUP_RUNTIME.cmd` | Explicit optional ONLINE private-runtime provisioning. Never part of ordinary startup. |

For Linux/macOS with a compatible Node runtime, run `./START.sh`. Direct commands work from the extracted project folder:

```sh
node tools/preflight.mjs
node src/main.mjs serve
node tools/run-tests.mjs
node tools/backtest.mjs
node src/main.mjs verify
```

No `npm install`, React compilation, Python installation, blockchain daemon or C toolchain is required to run the server. Python/Playwright were used only for one separately documented delivery-environment UI test, not by the application.

## Ports and private state

The only bind address is the literal **127.0.0.1**. IPv6, wildcard, LAN and external binds are unsupported. Default web port is **8787**; SMTP is **2525**. Local SMTP uses `AUTH PLAIN` with the mailbox token and **does not provide TLS**; it must never be exposed or tunneled onto an untrusted network.

When Windows reserves or another process uses a port, startup fails visibly and does not kill that process or change the firewall. In a Command Prompt opened in the extracted folder:

```bat
set VEXA127_HTTP_PORT=18887
set VEXA127_SMTP_PORT=12525
set VEXA127_STATE=D:\Vexa127-State
RUN.cmd
```

These variables affect that shell and child processes only. Do not point the new server at the old candidate's catalogue directory. The default state folder is local to the extracted release, not a hard-coded `/workspace` or a user-specific Windows path. Full Windows filesystem ACL and Smart App Control behavior remain target-machine verification work.

## Delivered behavior

The mailbox offers compose, Inbox, Sent, Quarantine, Trash, attachment and `.eml` download, a chain explorer, local directory, parent-status view, policy settings and operator tools. Tokens stay in page memory. Message bodies are rendered as text, not executable HTML. HTTP requests require a bearer token; state-changing requests additionally require JSON and a custom request header. Exact Host/Origin checks reject the tested cross-origin and rebinding-style requests.

SMTP requires authentication, binds both the envelope sender and any supplied From header to the account, and refuses external or unknown recipients. It accepts a bounded subset of text/plain MIME and multipart/mixed attachments. An optional `X-BVE-Request-ID` supports persistent idempotent retries. Unrecognized MIME structures are refused rather than silently misinterpreted. SMTP accepts concrete mailbox addresses; web/API aliases expand to a deduplicated recipient set.

The operator may provision up to 64 local accounts, issue explicitly nonfinancial credits, set an optional local sponsorship allowance, define local aliases, release held messages and create private backups. This does not implement an autonomous-agent permission class, a financial wallet, ERC-4337 or any real-world reward pool.

## Postage and the signed local chain

Each ordinary send costs one local credit per distinct recipient. Accounts initially receive 100 credits; the disabled-by-default sponsor pool starts with 1,000. The principal's default daily authorization limit is 20 credits. These are versioned **laboratory design choices**, not source-proven economic thresholds or institutional approvals.

The server canonicalizes the message, recipients and attachments, binds them to `LOCAL127_CREDIT_V1`, the chain and sender, and issues an Ed25519-signed stamp. The same SQLite transaction consumes the stamp, stores the authenticated ciphertext, updates mailbox copies and credit state, persists the request outcome, and appends a signed block. Failure before commit rolls all of that back. Loss of the response after commit is handled by retrying the **same request ID and same payload**, not by inventing a new request.

A separately reserved stamp expires after five minutes. Cancellation/refund is explicit, authorized and idempotent; a consumed stamp cannot be refunded. Cancellation does not replenish the day's authorization counter. Expired reservations remain visible until canceled—there is no hidden background refund worker.

See [the exact profile specification](docs/LOCAL_PROFILE.md) and [security boundaries](docs/SECURITY.md). Blocks use hashes and signatures; they do not provide independent consensus, public finality, proof of human reading or externally certified time. Keeping the authority key and database together means a compromised host remains a major trust boundary. An externally retained checkpoint can detect a conflicting or missing pinned history; it cannot cure host compromise.

## Backup and recovery

Use **Settings & operator → Create private backup**. The resulting directory contains a consistent SQLite copy, its authority/encryption key, the original credential file, file digests and a chain checkpoint. **The backup is sensitive and includes usable secrets.** Encryption of message objects is not a substitute for protecting the backup keys.

Restore only into a new, nonexistent directory:

```sh
node src/main.mjs restore --source "PATH_TO_BACKUP" --destination "NEW_STATE_DIRECTORY"
node src/main.mjs verify --state "NEW_STATE_DIRECTORY"
node src/main.mjs serve --state "NEW_STATE_DIRECTORY" --http-port 8787 --smtp-port 2525
```

For an externally retained checkpoint:

```sh
node src/main.mjs checkpoint --state "STATE_DIRECTORY" > checkpoint.json
node src/main.mjs verify --state "STATE_DIRECTORY" --checkpoint checkpoint.json
```

No restore overwrites an existing state directory. Missing authority keys, an incomplete existing state, altered objects and failed checkpoints do not trigger automatic reinitialization or false success.

## Existing-candidate correspondence

The original upload is preserved separately by the user and identified in `provenance/BASELINE.json`; selected source code is also archived in this release. This application does not silently transform or delete an existing catalogue. To export the original candidate's supported schema-2/VEM-OBJECT/2 mail to a new plaintext `.eml` archive:

```sh
node tools/export-legacy.mjs "OLD_CANDIDATE_STATE" "NEW_EXPORT_DIRECTORY"
```

The exporter checks object identities and bindings and retains original IDs/folders in its manifest. It does **not** import credentials, fabricate historical blockchain receipts, migrate unsupported formats or resend mail. Importing historic correspondence into the new live chain requires a separately approved migration specification; this release does not falsely present export as a completed import.

## Workflow application and limitations

All **18 parents, 136 components and 6,800 original controls** are accounted for in the assessment overlay. Selected local obligations have actual candidate-bound evidence; remaining items retain explicit unstarted/unassessed states. The article, source register and supplied master documents remain preserved and are not rewritten to fit the result. Consult [parent application](docs/PARENT_APPLICATION.md), [the execution report](docs/EXECUTION_REPORT.md) and [assessment index](assessment/INDEX.md).

Physical postal integration, actual UTXO penalties, EVM/Paymasters, reward pools, wallet identities, decentralized object storage, MLS/XMTP, Waku/RLN, L3/Base settlement, ZK Email, HTLCs and clinical integration are **not implemented**. The local analogues are named as such. No component is silently certified because a shared test passed.

This release has no IMAP/POP3, Internet MX routing, DKIM verification, TLS, public relay, public consensus, human-attention verification or automatic erasure. The UI retrieves 25 messages per page and reports the range and total. Older/Newer controls traverse beyond 100 messages; any signed-head change invalidates a continuation cursor and requires a fresh snapshot. The legacy `/api/messages` endpoint retains its 100-message cap; the new `/api/mailbox-page` endpoint is bounded and owner-scoped. A full mailbox export includes retained messages. Trash retains data and consumes quota. Resource ceilings are deliberate lab limits, not production sizing or benchmark claims. Independent reviewer assignment, full control evaluation, target Windows execution, direct-browser loopback acceptance and production approval remain open.

## Evidence and provenance

`evidence/delivery/` contains the fixed delivery-run reports. `evidence/history/` retains baseline and intermediate observations, including failures. Reruns write under `evidence/runs/` without overwriting the delivered reports. Checksums identify files; they are not publisher signatures. No live keys or private test-state folders are included.

Direct loopback navigation remains blocked by the managed Chromium policy. This continuation's browser fixture uses **mock responses only**, no API bridge and no policy bypass. It tests packaged DOM/CSS/JavaScript on `about:blank`, with browser networking denied. Its visibly labeled screenshots are not live browser-delivery evidence. Node HTTP/SMTP tests and the chronological exercise do contact the actual local server. Browser CSP, secure-context/module loading and Windows acceptance remain target-environment work.

The candidate did not establish a redistribution license for every inherited file. No new GPL/Apache claim is invented here; review provenance and third-party licensing before publishing. The private Node installer obtains its runtime license from the official archive.

## Upgrade from Vexa127 2.0.0

Back up and stop the old service first. Extract this release into a **different folder**, retaining the old archive and backup. Point `VEXA127_STATE` at the existing 2.0.0 state directory, run `VERIFY.cmd`, then `RUN.cmd`. Do not run both releases against the same state. Do not copy fresh keys over existing keys or initialize an incomplete old state. No original-Grok catalogue import is implied. See [START_HERE.md](START_HERE.md) for exact commands and credential handling.

The reproducible compatibility tool is `node tools/upgrade-check.mjs "PATH_TO_EXTRACTED_2.0.0_SOURCE"`; `provenance/PRIOR_RELEASE_CODE.zip` supplies the needed prior source. It creates only disposable synthetic state, not a copy of your correspondence.
