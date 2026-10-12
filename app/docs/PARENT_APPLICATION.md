# Parent-system application

Original parent identifiers and names are retained. These candidate-specific implementation dispositions are not source-control PASS or blanket exclusions.

| Parent | Workstream | Disposition | Exact boundary |
|---|---|---|---|
| P01 | Architectural scope, economic objectives, and policy authority | LOCAL_IMPLEMENTATION | New-profile boundary, single authority, exact parameters and evidence limits; independent policy review pending. |
| P02 | Historical postage baselines and delegated payment authorization | NOT_SELECTED | No Hashcash miner or micropayment authorization added. Puzzle authorization is labeled separately. |
| P03 | Physical crypto stamps and postal delivery integration | DEFERRED | No postal issuance, NFT stamp, CASS or physical delivery provider. |
| P04 | Common virtual-envelope and postage lifecycle contracts | LOCAL_IMPLEMENTATION | Game-tagged envelope, frozen draft, single-use READY/spent state and shared atomic delivery. |
| P05 | UTXO conditional-penalty virtual postage | DEFERRED | No UTXOs, OP_RETURN, public burn or complaint broadcast; game stamp is not a substitute. |
| P06 | ERC-4337 smart accounts and Paymaster sponsorship | DEFERRED_NATIVE_PROTOCOL | Existing local credit/sponsor accounting retained; no ERC-4337 wallet, bundler, EntryPoint or Paymaster deployed. |
| P07 | Consensual paid inbox access and attention rewards | DEFERRED | No EMT/EMC, advertiser funding, Read2Earn or attention reward. |
| P08 | Addressing, interoperability, and message transport | LOCAL_IMPLEMENTATION | Literal-loopback HTTP, virtual game namespace and retained authenticated @local.test SMTP; no public DNS/MX or ENS/DID. |
| P09 | Storage durability, retrieval, and provider exit | LOCAL_IMPLEMENTATION | Encrypted local SQLite objects, signed references and tested backup/restore; no decentralized permanence claim. |
| P10 | MLS and the article-described XMTP cryptographic profile | DEFERRED_NATIVE_PROTOCOL | Ed25519 ledger/stamp signatures and ChaCha20-Poly1305 storage; no MLS/XMTP, post-quantum or end-to-end guarantee. |
| P11 | Waku relay, RLN membership, and stake-based rate limits | DEFERRED | Bounded requests and observer run limits are not RLN membership, proof generation or slashing. |
| P12 | L3 appchain, settlement, and decentralization economics | DEFERRED_NATIVE_PROTOCOL | Single-authority hash-linked local ledger; no L3, sequencer network, Base settlement or token emissions. |
| P13 | ZK Email authentication and selective-disclosure execution | DEFERRED | Exact SHA256 draft/trace commitments only; no DKIM circuit, SNARK or email-driven public contract. |
| P14 | Sybil resistance and reward-abuse controls | PARTIAL_LOCAL_CONTROLS | Authentication, resource caps and one-run/horizon restrictions; no unique-human or economic-deterrence proof. |
| P15 | Griefing, smart-contract resource safety, and trusted-infrastructure abuse | PARTIAL_LOCAL_CONTROLS | Bounded worker/events, transactional rollback, nonce history, stale-run and replay rejection; no HTLC or game-theory guarantee. |
| P16 | Programmable finance within the inbox | DEFERRED | Nonredeemable credits retained, game postage zero cost; no real invoice payments or external transfers. |
| P17 | Correspondence evidence, privacy, erasure, and regulated-domain profiles | PARTIAL_LOCAL_CONTROLS | Encrypted correspondence, signed receipt/event separation and private backup; no legal delivery, GDPR erasure or clinical certification. |
| P18 | Research validation and institutional acceptance | PARTIAL_EVIDENCE | 113 executed tests plus bounded HTTP/upgrade/UI records; independent review, source acceptance and production gates not cleared. |

The original BVE control and component identities remain in `provenance/vexa-assessment`. No test result grants PASS to an entire parent.
