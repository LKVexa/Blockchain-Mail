# Portable packaging and source preparation

The ordinary application opening workflow is **Open Workspace.vbs** in the downloaded ZIP or Git checkout. The complete application is prepared under `system/`. These tools are for reviewing, testing, modifying, resealing, and rebuilding a distribution.

GitHub's **Code → Download ZIP** export includes a short wrapper and `Payload.dat`, with the deeply nested tracked application corpus excluded from the outer archive by `.gitattributes`. The payload contains the complete published source/runtime baseline, including the original build tools, project documentation, licensing files, and separately supplied preferred-source archive. Git clones retain the raw tracked source at repository root. The export rules do not delete it or change its bytes.

## Choose the intended source root

From the extracted download or checkout root, prepare the bundled source without opening a protected workspace:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\Start.ps1 -PrepareOnly
$taskSourceRoot = (Resolve-Path -LiteralPath .\system).Path
```

For a deliberate developer build of the raw Git checkout instead, set `$taskSourceRoot = (Get-Location).Path` while in that checkout root. The raw source and prepared `system` source are separate trees. Use one consistently for editing, tests, resealing, and packaging.

The scripts accept explicit `-ProjectRoot` or `--root` arguments. Their historical default is the parent of the `build-tools` folder. A ZIP download has no raw application at that parent; use `-ProjectRoot .\system` or the explicit absolute `$taskSourceRoot` below. Relative package, guide, report, and additional-file paths resolve against the selected source root. Default output is its `dist/` folder, and existing ZIPs and checksum files are never overwritten.

Never copy a live vault, Tor identity, or browser profile into a staging tree. The complete baseline supplies its pinned Node, Tor, and WebView2 SDK assets together with their notices. A source-only variation must restore those exact licensed dependencies using their pins and provenance before building. The optional recovered native package engine's preferred source remains unavailable; inspect `native/NATIVE-INTEGRATION.md` under the selected application root.

## Verify, reseal, and build

Run the application regression suite and the applicable native source/policy checks before sealing. For the prepared `system` tree:

```powershell
& "$taskSourceRoot\runtime\node.exe" "$taskSourceRoot\app\tools\run-tests.mjs"
& "$taskSourceRoot\runtime\node.exe" .\build-tools\seal-private-mail.mjs --root $taskSourceRoot
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\build-tools\test-bundle-extractor.ps1
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\build-tools\build-free-ready-package.ps1 -ProjectRoot $taskSourceRoot -ValidateOnly
& .\build-tools\build-free-ready-package.ps1 -ProjectRoot $taskSourceRoot -AdditionalFiles @('README.md','LICENSE','NOTICE','COPYRIGHT','THIRD_PARTY_NOTICES.md','SOURCE-EXPORT-MAP.md','third-party/licenses/GPL-3.0.txt','third-party/licenses/OpenPGP-LGPL-3.0.txt','third-party/licenses/WebView2-LICENSE.txt','third-party/licenses/WebView2-NOTICE.txt','third-party/licenses/CC-BY-SA-4.0.txt','third-party/sources/openpgpjs-v6.3.2.zip')
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\build-tools\build-windows-bundle.ps1 -ProjectRoot $taskSourceRoot
```

This recipe builds the sealed application and the explicitly listed publication additions. It does not automatically include every unrelated tracked file. To reproduce a wrapper carrying the complete published baseline, construct a reviewed `-AdditionalFiles` inventory from that exact baseline commit, excluding its root `SHA256SUMS.txt`: the inner builder generates a new complete checksum manifest. Preserve all source, licenses, preferred-source archives, and build/install scripts needed by the distributed program. Do not recursively enumerate the live working folder or include the new payload inside itself.

Provide the reviewed public setup guide and verification report at `docs/release/Private-Mail-Setup.html` and `docs/release/Workspace391-Free-Torus-Verification.json` within the selected source tree, or use `-SetupGuide` and `-VerificationReport`. The prepared complete baseline contains these files. `-Output`, `-InnerPackage`, and `-BundleSource` are configurable. Absolute outputs can keep development artifacts outside the selected application tree.

The sealer retains the historical allowlist of reviewed changes and checks unrelated files against their previous hashes. For another reviewed edit, use `--changed path/to/file`; for a public report added to the release checksum inventory, use `--report path/to/report.json`. It updates the native runtime seal, exact app inventory, launch inventory, and root checksum inventory. SHA-256 consistency is not publisher authentication. Preserve third-party source and notices; do not treat resealing as permission to redistribute an artifact.

The outer builder emits seven short ZIP entries. It embeds the verified inner application as `Payload.dat` and generates `Bundle.json` inside the archive without modifying the build sources. This generated portable archive and GitHub's automatically generated repository ZIP are distinct archives; each needs its own acceptance check. The extractor regression driver exercises 30 valid/malformed/archive-path cases and creates a unique work directory and report. Use `-WorkRoot`, `-Extractor`, or `-Report` to choose test locations; existing reports are preserved.

Review the final archive inventory and checksums, verify it with Windows' ZIP extractor and the bundled preparation step, and test the packaged application before publication. A rebuilt payload changes its identity even when its visible version string is unchanged. Publish matching verification evidence and checksum files. The pinned runtime executables remain separately licensed.

Use `test-github-zip.ps1 -Archive <download.zip> -Destination <new-directory> -Report <new-report.json>` under Windows PowerShell 5.1 with `-STA` to check the actual GitHub download. It exercises Windows Shell extraction, exact outer bytes, complete preparation, application and launch hashes, and repeat preparation preserving private test state. It opens no mailbox or recovery dialog.

## Preserve private state

`system/`, `system.prepare-*/`, live `state/`, `network-state/`, `console/workspace/`, generated distributions, and new test histories are excluded from Git. Repeated opening preserves existing prepared application state. A changed payload refuses to overwrite an existing `system` folder with a different preparation marker; prepare a new application in a fresh destination instead. These exclusions protect private account credentials, message history, recovery material, Tor secret keys, and browser profiles from accidental publication.
