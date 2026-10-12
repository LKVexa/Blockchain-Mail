# Threat model and residual limits

## Assets and boundaries

Protected within this laboratory model: mailbox access tokens, server signing/storage keys, frozen draft bytes, game issuance ordinal, single-use permits, encrypted objects, per-mailbox projections, signed state/ledger commitments, prior operation receipts, and observer capabilities. The local operator and OS user are trusted with the state directory. Server-held keys are not hidden from the operator. Filesystem access controls must be supplied by the host; Windows ACL enforcement has not been evaluated here.

All application listeners bind only `127.0.0.1`. A direct client must send Host and Origin for that exact loopback port. Hosted preview names are refused; the retired preview bridge cannot rewrite Host/Origin or disclose credentials. Cross-site requests from outside that preview and unsupported content types are refused. Bearer credentials are held in browser memory, not web storage, and authenticated responses use no-store. CSP excludes remote scripts, remote connections, object/frame embedding and web fonts. The original hosted auth/framework bundle is not the active entry point. Compromise of another local process, the browser, extensions, OS or authority keys is not solved by loopback binding.

## Authority and replay

Only authenticated operators can start and commit game runs. Run state is private to the server and binds instance/revision/action/ordinal/intent, random run and observer identities, fresh givens and the generation policy digest. Test-only deterministic seeds are internal constructor inputs; they are not accepted by the HTTP API. Public raw proof/solved-grid fields are rejected. Schema validation precedes transition logic; complete uniqueness, candidate validity, trace replay and inclusive caps are separate predicates.

A client acknowledgment states that the cooperating UI says it rendered a frame. A malicious token-holder can emulate that API; neither signatures nor a frame digest prove human attention. The real browser acceptance journey is currently blocked in the test environment. Do not call the API test driver's acknowledgments visible-solving evidence.

## Storage integrity, confidentiality and atomicity

Game registry and mail share SQLite transactions and the signed current-state root. Registry ciphertext is authenticated with instance/revision-specific associated data. Nonce histories include retired registry nonces, and new mail encryption rejects those values under the shared storage key. Existing mail objects retain their nonce uniqueness constraints. These checks do not replace sound randomness or prove immunity to every process/power failure.

A fault before transaction commit rolls back new resource/account/stamp/mail/registry changes. A lost response after commit is reconciled by immutable operation lookup; an uncertain operation is never blindly repeated to discover whether it happened. Backups contain private keys and must remain private. New blocks (header version 2) bind the exact event list inside the signed header. Older version-1 blocks remain verifiable, and a trailing event duplicated only to exploit the odd-leaf Merkle rule is refused. Retained checkpoints can detect the tested rollback/divergence relative to that checkpoint; an authority replacing all records, keys and reference checkpoints is outside the claimed trust model.

## Availability and costs

Preparation runs in a bounded worker with explicit node/time/attempt/memory limits. Live advancement is limited to at most 40 events and one outstanding frame. Listener connection, request-size and timeout limits are inherited from Vexa. All state checks and canonicalization are local. Adversarial input testing is finite, not a universal availability or side-channel proof. Revalidating stored traces has bounded but nonzero CPU cost. The one-active-run/two-issuance horizon is not a scalable multiparty mail architecture.

## Known restrictions

No Internet SMTP delivery, MX lookup, public-chain RPC, mining network, tradable coin, fiat payment, reward pool, anonymous-human uniqueness, MLS forward secrecy, Waku/RLN, ZK Email, public staking or regulatory certification is enabled. Storage encryption is not end-to-end encryption. A valid sender signature or puzzle completion does not make message contents safe. UI renders mail as text; attachments remain untrusted files when exported/opened.

The full legacy browser migration, cross-origin adoption, unavailable-Web-Locks alternative and real browser cross-tab journeys have not been accepted. The new SQLite alternative is explicitly documented, not presented as an implementation of those unchanged browser contracts. Windows and wider runtime/security-release qualification remain blocked pending real host testing and review.

