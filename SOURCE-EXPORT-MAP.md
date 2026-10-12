# Blockchain-Mail publication map

## Windows-ready GitHub download

The raw source remains tracked and available in Git. GitHub's ZIP export
allowlist exposes only short launcher, documentation, license and build-tool
paths. Payload.dat retains all 15,125 files from published source revision
46ef49fcaa3f7fa46bb73e044bd8ecd14055953d, with a newly generated complete root
checksum inventory. First opening prepares these under system/ using the
verified extended-path extractor. No application file was removed or renamed
to accommodate Windows Explorer. New wrapper files and updated installation
documentation accompany the payload separately. The source-availability
limitation for the optional native utility below remains explicit.

The generated system/ tree and preparation staging directories are excluded
from Git because later opening creates private vault, Tor and browser state.

## Original source inventory

Audit input: `D:\Codex\2026-10-12\ca\work\Workspace391-Final-Mail.zip`.
SHA-256: `ecee39c316dbb028a21c98dc24eb809ca69ab34a3529de976a0ce0214bfb2a01`.
The inner `Workspace391/` payload contains 15,097 files. Use the audited sealed
allowlist, not an unrestricted copy of the live workspace.

| Material | Public export treatment |
| --- | --- |
| Root launchers and their PowerShell, C#, VBScript, command files; manifests and policy scripts | Include exact sealed files and editable source. Include rebuild/reseal instructions. |
| `app/src`, `app/web`, `app/desk`, tests, schemas and project documentation | Include source and data required to run, test, and modify the application. Preserve vendor licenses. |
| `app/provenance` | Include exact retained source, license files, extraction records, and authority records. Do not treat historical runtime pins as current. |
| `console/host`, `console/source`, `console/tools`, console manifests and scripts | Include, together with compiler/runtime assumptions and build/reseal steps. |
| `console/engine/df_medium/source`, `baseline`, `patches`, `DF_Medium.source.zip` | Include all. Identify the source that corresponds to the shipped 8.0.2 DLL separately from the optional staged 8.0.3 patch. |
| `console/helper/DF_Small`, `console/helper/source/DF_Small-source.zip`, `console/substrate` | Include the preserved corpora, VM/toolchain source, and all original notices. The user's GPL grant covers their own work, not unidentified foreign code. |
| `network` supervisors, Tor configuration templates, verification scripts and runtime pins | Include. Exclude generated live identity and account state. |
| `runtime/node.exe`, `runtime/Node-LICENSE.txt` | May keep the exact runtime for a ready checkout, with all original notices. Largest payload file is 92,825,416 bytes, below 100 MiB. It is not GPL-relicensed. |
| `network/tor/runtime` | May keep separately licensed Tor binaries/data and complete `docs` notices for ready private mail. Preserve verified publisher/version records. geoip/geoip6 headers identify IPFire Location Database CC BY-SA 4.0; retain this separate data license and original attribution/conversion/source links. |
| `network/tor/vendor/openpgp.min.mjs` | Keep its LGPL notices and add the downloaded exact preferred-source release v6.3.2 (91 src files, rollup.config.js, package.json/package-lock.json, tests, LGPL license), plus full GPLv3 text. Provide source alongside the minified library rather than only an upstream URL. Its package lock records the external build/dependency sources. |
| `console/runtime/webview2-sdk/1.0.4191.47/*.dll` | Ready checkout needs the three SDK DLLs. The exact NuGet LICENSE.txt is BSD-3-Clause, copyright Microsoft Corporation. Add the extracted exact LICENSE.txt and NOTICE.txt with the DLLs; preserve SDK terms. The installed Evergreen runtime is a separate Windows dependency. |
| `native/NativeCipherAdapter.cs`, `.exe`, build provenance; `protection` sources | Include editable adapter and project source if the optional native utility is distributed. |
| `native/engine/portal-cypher-windows-amd64.exe` | Preferred source and earlier explicit license were not found. The current copyright holder can grant their own supplied binary's rights, but the missing preferred source still limits any claim of complete GPL Corresponding Source for this optional utility. No independently identified foreign restriction was found for it. |

Exclude all live `state/`, `network-state/`, `work/`, `console/workspace/`, backups,
operator log files, caches, local environment files, `.git`, `.aws`, `.codex`, `.agents`,
private credentials, Tor control cookies and hidden-service keys. The sealed ZIP
has none of the audited sensitive path patterns. This is a path inventory finding,
not a claim that all historical file contents have been independently screened.

The two embedded source ZIPs were enumerated without execution: 365 files in
DF_Medium.source.zip and 142 files in DF_Small-source.zip. They contain no nested
archives or the audited live-state/private-key path patterns. Do not recursively
publish any additional archive from the live workspace merely because these two
were audited.

GPL Corresponding Source includes the material needed to build and modify the
covered program, including relevant build/install scripts. Preserve reseal and
manifest-generation tools so modified builds can run rather than being bound
only to the published byte hashes. Separate unmodified vendor executables keep
their vendor terms. GNU documents permissive-license compatibility and the
scope of source obligations in its [compatibility guide](https://www.gnu.org/licenses/license-compatibility.html)
and [GPLv3 guide](https://www.gnu.org/licenses/quick-guide-gplv3.html).
