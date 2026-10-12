# Source and platform references

**Checked 6 October 2026.** Candidate facts are grounded in the attached archives and retained manifests/excerpts. The following primary platform references support only the stated platform behavior; proposed integration contracts are authored engineering decisions, not claims copied from these pages.

## User-supplied sources

`ksxPB5t2PsP8KCqy-grok-workspace.zip`: original twelve-file Glyphoku VEM 1.0.0 series, preserved in `source-series/`. `B4PPUPFqdW8lePvv-grok-workspace.zip`: inspected candidate and nested attachments. Exact archive/member hashes are retained in `TARGET_BINDING.json` and `evidence/`. No unseen private-chat content has been cited.

## Primary platform documentation

**R1 — Vite, Server Options.** https://vite.dev/config/server-options  
Documents bind addresses and allowed-host configuration. `0.0.0.0` listens on all addresses; it is not a literal-loopback-only bind. This supports the need to distinguish the candidate's hosted dev profile from the proposed local profile.

**R2 — Vite, Preview Options.** https://vite.dev/config/preview-options  
Documents preview host behavior. A configuration value still requires effective-runtime verification in this candidate's Nitro/preview setup.

**R3 — React, Queueing a Series of State Updates.** https://react.dev/learn/queueing-a-series-of-state-updates  
Documents state-update batching and the requirement for pure updater functions. Repeated state setters in one synchronous tick are not proof of one separate browser paint per solver event.

**R4 — Node.js v22.16.0, Modules: TypeScript.** https://nodejs.org/download/release/v22.16.0/docs/api/typescript.html  
Documents native type stripping, its lack of typechecking, TSX limitations and import/alias constraints. The recorded baseline tests used this exact Node version and the candidate's explicit loader.

**R5 — MDN, Window.localStorage.** https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage  
Documents origin-specific browser storage and possible access exceptions. This does not establish server-grade durability, a cross-tab transaction protocol or authenticated mailbox ownership.

**R6 — MDN, Web Locks API.** https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API  
Documents coordination through named locks among same-origin contexts. The proposed adapter must feature-detect support and refuse unsafe fallback behavior; using this API does not defend against a malicious same-origin operator.

**R7 — User-specified ChatGPT conversation.** https://chatgpt.com/c/6ac52929-1378-83e8-b4e3-26dd5fd3f04d  
The retrieval returned a login page, not a transcript. It is retained only as an unresolved target-context reference, not as evidence for candidate behavior or requirements.
