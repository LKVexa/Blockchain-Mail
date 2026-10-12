# Third-party and platform notices — 9.0.0

This release does **not bundle Electron, Node, V8, MSHTML, or a standalone Chromium browser payload**.

For **Live Web** mode, the launcher provisions the pinned `Microsoft.Web.WebView2` SDK adapter version `1.0.4191.47` from the official NuGet package when needed and uses the Microsoft Edge WebView2 Runtime installed on Windows. The SDK/runtime remain Microsoft components and their own licenses and distribution terms apply. The downloaded adapter is placed under the mutable `runtime/webview2-sdk/` directory and is not part of this ZIP's sealed payload.

For **Native** mode, the Windows shell uses .NET Framework/WPF as the presentation adapter. HTTPS transport uses Windows/.NET networking primitives; image and direct-media presentation use OS codec/pixel primitives. HTML/CSS/resource/layout semantics in Native mode are handled by the DF_Medium JA21 Web Engine.

The exact DF_Medium source archive is retained under `engine/df_medium/DF_Medium.source.zip`; its own notices/licenses remain authoritative. DF_Small, DF_Large and DF_Xtra_Large are retained with their existing notices/licenses.
