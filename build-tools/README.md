Place this folder at `build-tools/` in the repository root. Scripts also accept an explicit `-ProjectRoot` or `--root`.

These tools build a portable Windows distribution from a complete staging tree. The published full checkout includes its pinned Node, Tor and WebView2 SDK assets. If preparing a source-only variant, restore those exact licensed dependencies using their pins and provenance before building. Never copy a live vault, Tor identity, or browser profile. Run the app and native checks before sealing. The optional recovered native package engine's preferred source remains unavailable; see `native/NATIVE-INTEGRATION.md`.

From the repository root:

```powershell
& .\runtime\node.exe app/tools/run-tests.mjs
& .\runtime\node.exe build-tools/seal-private-mail.mjs --root .
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File build-tools/test-bundle-extractor.ps1
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File build-tools/build-free-ready-package.ps1 -ValidateOnly
& .\build-tools\build-free-ready-package.ps1 -AdditionalFiles @('README.md','LICENSE','NOTICE','COPYRIGHT','THIRD_PARTY_NOTICES.md','SOURCE-EXPORT-MAP.md','third-party/licenses/GPL-3.0.txt','third-party/licenses/OpenPGP-LGPL-3.0.txt','third-party/licenses/WebView2-LICENSE.txt','third-party/licenses/WebView2-NOTICE.txt','third-party/licenses/CC-BY-SA-4.0.txt','third-party/sources/openpgpjs-v6.3.2.zip')
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File build-tools/build-windows-bundle.ps1
```

Provide the reviewed public setup guide and verification report at `docs/release/Private-Mail-Setup.html` and `docs/release/Workspace391-Free-Torus-Verification.json`, or use `-SetupGuide` and `-VerificationReport`. `-Output`, `-InnerPackage`, and `-BundleSource` are configurable. Relative package, guide, and report paths resolve against the project root. Outputs default to `dist/`; existing ZIPs and checksums are never overwritten.

The sealer retains the historical allowlist of reviewed changes and checks unrelated files against their previous hashes. For another reviewed edit, use `--changed path/to/file`; for a public report added to the release checksum inventory, use `--report path/to/report.json`. It updates the native runtime seal, exact app inventory, launch inventory, and root checksum inventory. SHA-256 consistency is not publisher authentication. Preserve third-party source and notices; do not treat resealing as permission to redistribute an artifact.

The outer builder emits seven short ZIP entries. It embeds the verified inner application as `Payload.dat` and generates `Bundle.json` inside the archive, without modifying build sources. The extractor regression driver exercises 30 valid/malformed/archive-path cases and creates a unique work directory and report. Use `-WorkRoot`, `-Extractor`, or `-Report` to choose test locations; existing reports are preserved.

Review the final archive inventory and checksums, verify it with Windows' ZIP extractor and the bundled preparation step, and test the packaged application before publication. Attach the tested portable ZIP and its checksum to a GitHub release. The pinned runtime executables in this full checkout remain separately licensed; generated distribution archives, private state and new test histories are excluded from Git.
