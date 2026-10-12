# Licensing map — 9.0.0

- Product shell / integration files: see top-level `LICENSE` and `NOTICE`.
- DF_Medium web-engine source baseline: preserved exactly in `engine/df_medium/DF_Medium.source.zip` and extracted under `engine/df_medium/baseline/`; retain its included licensing/provenance.
- DF_Small / DF_Large / DF_Xtra_Large: vendored as supplied from the VEC1 candidate and retained under their existing licensing/provenance.
- JA21 corpora: represented through the existing corpus lock and retained notices.
- Microsoft WebView2 SDK/Runtime: not redistributed as part of the sealed ZIP. Live Web provisioning retrieves the pinned Microsoft NuGet SDK adapter at first use; the Windows-installed Evergreen Runtime supplies the browser engine. Microsoft licensing/distribution terms apply to those components.

Electron and Node are not required by this package.
