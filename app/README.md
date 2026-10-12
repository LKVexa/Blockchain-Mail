# Local workspace 3.9.1
One mailbox interface now sends to both local and Internet recipients. First login reserves an available virtual email address in the signed local127 register, or reuses an existing 127 mailbox. Enter a recipient and press Send; delivery follows its address automatically. Credentials remain valid, and each account has its own Inbox, sender settings, and Sent history. See [Internet email](docs/INTERNET_EMAIL.md).

## Glyphoku desk + Vexa127 local blockchain email

**Build:** `3.9.1-local.1` · **Integration profile:** `GLYPHOKU_VEXA127/2` · **Laboratory release, not production acceptance**

This is a working-copy integration of the supplied Glyphoku React/TypeScript candidate, its tailored v1.1.0 prompt/workflow, and the preceding Vexa127 2.1.0 mail server. It is not two independently running apps linked together: the game registry, real mailbox account, signed postage record, delivery objects, operation receipts and signed ledger are committed through the same SQLite transaction authority.


This integrated release starts through the parent Start-Workspace launcher with mandatory protected storage and private API frames. Node 24.19.0 Windows x64 is included. The inbound SMTP listener is disabled in protected mode; the unified compose form automatically routes outgoing Internet email. See [direct Internet email](docs/INTERNET_EMAIL.md). The documentation below describes retained puzzle and compatibility APIs; plaintext compatibility must be explicitly selected and is outside the protected release workflow. Current verification and remaining limits are recorded in the parent RELEASE_VERIFICATION.json and PROTECTION_STATUS.json.
[Start here](START_HERE.md) · [Integration report](docs/INTEGRATION_REPORT.md) · [Profile crosswalk](docs/PROFILE_CROSSWALK.md) · [Evidence and limits](docs/VERIFICATION.md) · [Acceptance index](assessment/INDEX.md)

### What to do

Open the workspace, unlock it, and open your mailbox. **New message** accepts local or Internet recipients in the same form. The root and saved mail/Internet/desk page URLs all serve the same mailbox. The retained puzzle APIs create the domain and owner mailbox from one live 16×16 board, and issue one READY envelope from two further live boards. They preserve signed game stamps and durable operation receipts. Exact retries return the existing receipt.

The supplied profile deliberately stops new issuance at **g=3**. It creates one domain/owner mailbox and one envelope, not an unlimited mail service driven by ever-growing puzzles. Consequently the locked game journey currently uses the generated owner mailbox as its local recipient (self-addressed mail). The independent legacy `@local.test` mailbox namespace remains usable at `/mail/`, including its credit-stamp flow (SMTP is disabled in protected mode). It is not silently added to the game recipient registry.

### Preserved puzzle and draft contract

- Exact alphabet: `1 2 3 4 5 6 A B C D E ★ ◆ ♠ ♣ ♥`; order 16; 4×4 boxes.
- g=1: one board, 124–132 blanks, at least eight GUESS events, at most 12,000 total events.
- g=2: two distinct fresh boards, each 133–140 blanks, at least twelve GUESS events and one RETRACT, at most 18,000 total events per board.
- Event budgets include INIT and the terminal event. Search is live, incremental and initialized from givens only. Dealer scoring is not playback or issuance proof.
- Default pace: 24 logical events per 100 ms; options 1/8/24/40. Pause, resume, one-step, stop, visibility hold, generation fences and initial/final frame acknowledgments are implemented.
- Frozen draft v1 hashes exact UTF-8 JSON `{from,to,bcc,subject,body}`. Issue and send recompute the digest and revalidate local recipients. READY is explicitly not a send.

### One local authority, with explicit limits

The server is a single-authority, signed hash-linked ledger with current-state commitments, not a distributed-consensus blockchain or public token network. From this build, every new block is header version 2: the signed header commits to the event count and to an exact digest of the event list, so an odd-leaf Merkle collision cannot swap the stored events. Blocks signed by 3.0.0 stay valid and are refused if a trailing duplicated event makes the older root ambiguous. Game postage has zero financial value and zero credit debit. The pre-existing local credits are nonredeemable laboratory counters, not currency. The puzzle is an authorization exercise, not public-chain nonce mining or a proven spam/Sybil deterrent.

Mail and the game registry are encrypted under server-held ChaCha20-Poly1305 storage keys. This is **not end-to-end encryption**. The operator can access the keys and correspondence. Ed25519 signatures and retained checkpoints detect the modeled alterations; a malicious authority holding all keys and checkpoints is not excluded by magic.

Ordinary startup has no dependency installation, public DNS/MX lookup, public RPC, hosted authentication, external relay or remote storage requirement. Runtime guards and loopback listeners are defense-in-depth code, not an operating-system egress sandbox. Sending to a public recipient in the shared compose form uses recipients' DNS MX servers through its own bounded outbound capability. Existing local mail and puzzle APIs retain their local contract.

### Historical evidence from the supplied candidate

The prior implementation suite passed 118 tests on Linux x64 / Node v22.16.0. Its separate real HTTP exercise passed 19 checks; a synthetic 2.1.0 upgrade exercise passed eight checks. The prior offline UI fixture passed fourteen checks with mocked responses. That fixture is **not** proof of browser-to-server delivery. Its headed browser navigation was blocked by administrator policy. These are historical results. The current Windows suite includes real command-launcher regressions; current counts and the unresolved browser navigation attempt are recorded in the root audit report. The optional Windows runtime installer has not been executed.

The original browser-only `GLYPHOKU_VEM_127/1` persistence contract is retained unchanged in provenance. Moving authority to Vexa is an explicit new integration profile, not an assertion that the old localStorage/Web Locks requirements passed. Old `glyphoku-local-127` data is read-only and never silently migrated or overwritten. All 72 source acceptance cases are preserved and mapped to bounded evidence; full source acceptance, independent review and production release remain blocked. No BVE source-control PASS is inherited from a test count.

### Development and package contents

The selected local UI is precompiled and bundled with the React wrapper already present in the supplied candidate. Ten selected modules were transpiled with TypeScript 5.8.3; the complete original hosted application and its unrelated authentication/routes were not rebuilt or type-checked. No npm package download is required to run the delivered local profile. Source copies, code diff, tooling and licenses are retained. See [third-party notices](THIRD_PARTY_NOTICES.md).

Use `TEST.cmd` or `node tools/run-tests.mjs`; `GLYPHOKU_CHECK.cmd` or `node tools/glyphoku-check.mjs` exercises disposable synthetic game-to-mail state. These drivers acknowledge frames programmatically and never claim human observation. `CHECK_PACKAGE.cmd` validates listed file hashes only. Optional UI tests require separately provided Playwright, Chromium and a headed display.

