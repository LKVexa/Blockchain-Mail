# Source-control assessment index — LOCAL127-R03

**2.1.0-local.1** · 18 parents · 136 components · 6,800 original controls

Nine current bounded packets are BLOCKED at full source acceptance. Twenty-eight earlier blocked records are historical-only and require current re-assessment. The other 6,763 remain NOT_ASSESSED/NOT_STARTED. No source control is PASS; no independent approval exists. Full technical test results are a separate evidence category.

[Summary](SUMMARY.json) · [All control results](CONTROL_RESULTS.jsonl) · [Component register](COMPONENT_STATUS.json) · [Gates](GATES.json) · [Resume checkpoint](PROGRAM_CHECKPOINT.json)

## Current bounded evidence packets

| Control | Source requirement | Current scope |
|---|---|---|
| [BVE-C056-K012](active/BVE-C056-K012/WORK_PRODUCT.md) | Parse a valid multipart fixture. | Valid bounded multipart text/plain-plus-binary-attachment fixtures and delimiter variations parse and round-trip. |
| [BVE-C056-K014](active/BVE-C056-K014/WORK_PRODUCT.md) | Handle a message with no attachments or no HTML part. | Text-only/no-attachment messages and multipart text without HTML are handled; unsupported HTML-only bodies are rejected. |
| [BVE-C063-K012](active/BVE-C063-K012/WORK_PRODUCT.md) | Resolve an authorized mailbox entry. | Authenticated mailbox IDs resolve to the proper owner and retained encrypted objects; the API returns the owner-scoped first page. |
| [BVE-C063-K017](active/BVE-C063-K017/WORK_PRODUCT.md) | Reject unauthorized listing or object-reference enumeration. | Cross-owner mailbox and pagination cursors are rejected; invalid tokens cannot enumerate the page endpoint. |
| [BVE-C063-K018](active/BVE-C063-K018/WORK_PRODUCT.md) | Apply access revocation consistently to cached results. | Session logout/identity change aborts pending requests and rejects late data, file preparation and obsolete UI errors. Server token rotation refuses the old bearer. |
| [BVE-C063-K026](active/BVE-C063-K026/WORK_PRODUCT.md) | Handle partial mailbox retrieval with explicit completeness reporting. | 105 retained messages are enumerated exactly once over five 25-item pages. Totals/ranges are explicit; changed heads stop continuation. |
| [BVE-C124-K045](active/BVE-C124-K045/WORK_PRODUCT.md) | Select metrics, reason codes, and diagnostic records sufficient to explain Personal-data placement and visibility register without unnecessarily disclosing message content, secrets, or identity linkage. | State-derived read/export/checkpoint paths reject tested state-root mutation. Late UI data is suppressed and tokens are not put in browser persistent storage. |
| [BVE-C135-K016](active/BVE-C135-K016/WORK_PRODUCT.md) | Validate a complete supported migration. | The separate actual 2.0.0-to-2.1.0 exercise reconciles eight messages/attachments, balances, old checkpoint, retry and old reserved stamp, then restores nine deliveries. |
| [BVE-C136-K041](active/BVE-C136-K041/WORK_PRODUCT.md) | Identify the exact candidate artifacts used to assess Reproducible specifications and institutional release review: specifications, executable code or model where applicable, configuration, and fixture versions. | Source/candidate/workflow digests are rebound; actual final-source tests and local service startup are recorded. |

## Parent indexes

[P01 — Architectural scope, economic objectives, and policy authority](parents/P01.md)

[P02 — Historical postage baselines and delegated payment authorization](parents/P02.md)

[P03 — Physical crypto stamps and postal delivery integration](parents/P03.md)

[P04 — Common virtual-envelope and postage lifecycle contracts](parents/P04.md)

[P05 — UTXO conditional-penalty virtual postage](parents/P05.md)

[P06 — ERC-4337 smart accounts and Paymaster sponsorship](parents/P06.md)

[P07 — Consensual paid inbox access and attention rewards](parents/P07.md)

[P08 — Addressing, interoperability, and message transport](parents/P08.md)

[P09 — Storage durability, retrieval, and provider exit](parents/P09.md)

[P10 — MLS and the article-described XMTP cryptographic profile](parents/P10.md)

[P11 — Waku relay, RLN membership, and stake-based rate limits](parents/P11.md)

[P12 — L3 appchain, settlement, and decentralization economics](parents/P12.md)

[P13 — ZK Email authentication and selective-disclosure execution](parents/P13.md)

[P14 — Sybil resistance and reward-abuse controls](parents/P14.md)

[P15 — Griefing, smart-contract resource safety, and trusted-infrastructure abuse](parents/P15.md)

[P16 — Programmable finance within the inbox](parents/P16.md)

[P17 — Correspondence evidence, privacy, erasure, and regulated-domain profiles](parents/P17.md)

[P18 — Research validation and institutional acceptance](parents/P18.md)

