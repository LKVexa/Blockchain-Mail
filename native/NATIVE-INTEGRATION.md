# Native package utility — 3.9.0-local.1 working derivative

This is an explicit outer ZIP/package utility. It does not replace the existing
workspace vault, encrypted browser channel, ChaCha20-Poly1305 storage sealing or
Ed25519 signatures. It does not export live rows or extract a recovered ZIP.
The complete 8Sphere mathematical law remains unresolved: the reviewed source
does not supply the complete numerical coefficients, metrics, projections,
solver, Classify/Score definitions or law-to-cipher binding.

## Actions

- `Protect-Native-Package.cmd`: select an existing ZIP package or encrypted
  backup ZIP and a new `.ja21pkg` outside the workspace package.
- `Open-Native-Package.cmd`: select an existing `.ja21pkg` and a new `.zip`
  outside the workspace package. The outer package is decrypted; any encrypted
  vault data already inside that ZIP remains encrypted. Nothing is extracted.

Both actions use the existing vault's four-ordered-word format and derivation.
Protect a new archive with fresh generated words; recover it with that archive's
original words, which need not be your live vault's key. No key is passed in a
URL, process argument or environment variable, and
no plaintext key file is created. The words are normalized by the existing
vault implementation and SHA-256 domain/order, then the derived 32 bytes go to
the reviewed adapter through standard input. The adapter delivers them through
one random local named pipe after checking the exact owned native child PID.

The supervisor checks every integrated launch-manifest entry and the separate
Node 24.19.0/native-engine/tuple pins before importing package helpers or asking
for the key. This is consistency checking, not publisher signature verification.
The protected pipe grants the current user access; if Windows reports a current
AppContainer, only that exact package SID receives read/synchronize access. It
does not grant Everyone, Authenticated Users or ALL APPLICATION PACKAGES access.

Protect accepts ZIPs up to **252 MiB** and publishes packages up to **256 MiB**.
Open accepts packages up to **256 MiB** and publishes recovered ZIPs up to
**260 MiB**. A successful protected package therefore fits the open input bound.
Ordinary local canonical paths are required; operation paths retain a 259
character bound. Existing output files, UNC/device/stream paths, short-name
aliases and symbolic links/junctions are refused. The source utility monitors
private temporary files and deadlines; it is not a hard disk quota or OS sandbox.

## Packaging map

At the integrated package root: `Native-Protection-Tools.ps1`,
`Protect-Native-Package.cmd`, `Open-Native-Package.cmd`.

Under `protection/`: `native-archive.mjs`, `native-protected-tools.mjs`.

Under `native/`: `NativeCipherAdapter.cs`, `NativeCipherAdapter.exe`,
`NATIVE_ADAPTER_BUILD.json`; under `native/engine/` the pinned
`portal-cypher-windows-amd64.exe` and `r12_tuple.json`.

Existing root `Workspace-Policy.ps1`, `Workspace-Pipe.cs`, vendored
`runtime/node.exe`, and `app/src/{vault,crypto,policy}.mjs` are required unchanged
for the key derivation and supervised process lifetime. The full integrated
manifest must include the new files; the utility fails closed without them.
`NativeBoundaryProbe.*` is diagnostic-only and is not a shipping dependency.

## Current evidence and limits

The working records are `native-adapter-policy-verification.json` (105/105),
`native-adapter-runtime-verification.json` (9/9),
`native-bridge-verification.json` (38/38), and
`native-protection-tools-verification.json` (89/89). These include actual
synthetic private-pipe/job protection and byte-exact 512 KiB ZIP recovery,
wrong-key/tamper/overwrite refusal, ordered word derivation, bounded child
output/deadlines, and source/pin/manifest/path checks. Source hashes bind the
records to the tested bytes. No real user key or supplied live state was used.

The recovered native engine describes AES-256-GCM as its confidentiality and
integrity boundary and CC12-PFF as experimental 5D provenance only. Its source
is not available in the reviewed material. This utility does not establish a
complete 8Sphere codec, mining/coin mechanism, complete console GUI acceptance,
different-user pipe-ACL penetration test, hostile-local-user filesystem-race
resistance, secure memory erasure, Windows OS isolation or network confinement.
The key and selected plaintext ZIP exist in memory; an explicitly recovered ZIP
is written to the selected new file. Timing, size and OS/process metadata remain
visible. Quarantine snapshots and published 3.8 outputs are preserved.
