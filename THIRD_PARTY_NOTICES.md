# Third-party notices and source availability

Blockchain Mail preserves the licenses and attribution of separately supplied components. The project's GNU GPL-3.0-only grant, Copyright (C) 2026 RUSSELL PHILIP SMITHSON, covers the copyright holder's original project work. It does not relicense vendor libraries, runtime executables, data, or retained reference material. Read [NOTICE](NOTICE), [COPYRIGHT](COPYRIGHT), and the full component notices rather than treating this inventory as a replacement license.

## Component inventory

| Component | Distribution and license | Retained notices and evidence |
| --- | --- | --- |
| Console shell and Apache-licensed JA21 reference material | Apache License 2.0; attribution and upstream notices retained | [console/LICENSE](console/LICENSE), [console/NOTICE](console/NOTICE), [JA21 corpora license](console/licenses/JA21-Corpora-Apache-2.0.txt) |
| DF_Fabric, DF_Small, DF_Medium, DF_Large and DF_Xtra_Large project material | The copyright holder's current GPL-3.0-only designation applies to their original supplied work. Earlier rights-reserved notices remain historical attribution records. Embedded third-party material retains its own terms. | Respective `console/helper`, `console/engine/df_medium` and `console/substrate` LICENSE files, editable source, preserved source archives and provenance |
| HERMIT RAMWS WebSocket framing | The current project licensing selection applies to the copyright holder's supplied framing work; historical attribution is **Copyright (c) 2026 David Paul Russell**. The earlier choose-a-license placeholder is retained as provenance. | [source record](app/provenance/hermit-ramws/SOURCE.json), [historical notice](app/provenance/hermit-ramws/LICENSE), [framing source](app/src/ramws-framing.cjs) |
| TORUS RAMWS readers and JA reference | Reference source retains Apache-2.0 where expressly identified; the supplied project's original integration follows the current project grant. This does not assign one license indiscriminately to the entire historical archive. | [source record](app/provenance/torus-ramws/SOURCE.json), [JA reference license](app/provenance/torus-ramws/JA-REFERENCE-LICENSE.txt) |
| React, ReactDOM and Scheduler | MIT; Copyright (c) Meta Platforms, Inc. and affiliates. The supplied compiled vendor self-reports 19.3.0; that version string is not independent package authentication. | [full MIT notice](app/desk/vendor/LICENSE.react.txt), [historical extraction notice](app/THIRD_PARTY_NOTICES.md), extraction digests in `app/provenance` |
| Node.js 24.19.0 Windows x64 runtime and dependencies | Separately supplied MIT-licensed Node runtime with individual dependency terms retained in its full license file | [Node license and dependency notices](runtime/Node-LICENSE.txt), [current runtime pin](app/RUNTIME_PIN.json); [upstream source](https://github.com/nodejs/node/tree/v24.19.0) |
| Tor Expert Bundle 15.0.24, Tor 0.4.9.13 and tor-gencert | Tor BSD-3-Clause, including Roger Dingledine, Nick Mathewson, The Tor Project, Inc. and other named contributors. Companion libraries and transports retain their individual terms. | [publisher verification and exact file pins](network/tor/verified-runtime.json), complete `network/tor/runtime/docs` notice files; [Tor source](https://gitlab.torproject.org/tpo/core/tor) |
| libevent, OpenSSL, zlib, lyrebird and conjure | Individual BSD, MIT, ISC, Apache-2.0, zlib, CC0 and other notices identified in the bundled upstream notice files; preserve the entire files | [libevent](network/tor/runtime/docs/libevent.txt), [OpenSSL](network/tor/runtime/docs/openssl.txt), [zlib](network/tor/runtime/docs/zlib.txt), [lyrebird](network/tor/runtime/docs/lyrebird.txt), [conjure](network/tor/runtime/docs/conjure.txt), [Tor](network/tor/runtime/docs/tor.txt) |
| IPv4/IPv6 geolocation databases | IPFire Project Location Database under **CC BY-SA 4.0**, converted by Tor's geoip-db-tool. Original attribution headers are preserved; generated database date 2026-09-23. These data are not relicensed GPL. | `network/tor/runtime/data/geoip` and `geoip6`, [source and attribution](https://location.ipfire.org/), [full license](third-party/licenses/CC-BY-SA-4.0.txt) |
| OpenPGP.js 6.3.2 | **LGPL-3.0-or-later**; separately replaceable verification library. Its later-version permission does not extend the project's GPL-3.0-only selection. | [vendor LGPL notice](network/tor/vendor/OPENPGP-LICENSE), [complete preferred-source archive](third-party/sources/openpgpjs-v6.3.2.zip), [GPL text](third-party/licenses/GPL-3.0.txt); [exact upstream tag](https://github.com/openpgpjs/openpgpjs/tree/v6.3.2) |
| Microsoft.Web.WebView2 SDK 1.0.4191.47 Core, WPF and Loader DLLs | The exact supplied NuGet SDK license is **BSD-3-Clause**, Copyright (C) Microsoft Corporation; accompanying ANTLR Project notices are retained. The installed Evergreen runtime is a separate dependency and is not bundled here. | [exact SDK license](third-party/licenses/WebView2-LICENSE.txt), [SDK NOTICE](third-party/licenses/WebView2-NOTICE.txt), `console/runtime/webview2-sdk/1.0.4191.47/PROVISIONED.json`; [upstream package](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4191.47) |
| NativeCipherAdapter | Project integration source and compiled adapter are present | [editable source](native/NativeCipherAdapter.cs), [build record](native/NATIVE_ADAPTER_BUILD.json) |
| Recovered portal-cypher outer-package utility | Separately supplied optional native executable. The copyright holder's publication/license designation cannot provide source that was absent from the recovered material. No claim of complete preferred-source availability is made for this component. Ordinary mail uses other source-present implementations. | [exact scope and known source limitation](native/NATIVE-INTEGRATION.md), `native/engine/portal-cypher-windows-amd64.exe` and its pin in `native/NATIVE_ADAPTER_BUILD.json` |

## Preferred-source archive and SDK verification

The OpenPGP.js source archive was obtained from the upstream `v6.3.2` tag. It contains `src`, tests, the package manifest, dependency lockfile, Rollup build configuration and the original LGPL text. Its SHA-256 is:

```text
68104e7be8955e55b149da214de53ab42969722f6177e597b8ed8d58d80f0cf7  openpgpjs-v6.3.2.zip
```

The Microsoft SDK license and NOTICE were extracted from the exact official NuGet package matching the existing provisioned SDK pin:

```text
f492bbf547d0da329553b6727435b677579b1e9f91cc9e4a1ad029366d5f23d0  Microsoft.Web.WebView2.1.0.4191.47.nupkg
```

The NuGet archive is a verification input, not an additional runtime installation. Its LICENSE and NOTICE accompany the distributed SDK DLLs here. No bundled runtime bytes were changed to add these notices.

## Scope and modification procedure

See [SOURCE-EXPORT-MAP.md](SOURCE-EXPORT-MAP.md) for the source boundary and [build-tools/README.md](build-tools/README.md) for inventory and packaging procedures. Exact-byte integrity checks protect against accidental changes; they are not an independent publisher signature. A developer modifying a library or project component must deliberately rebuild and update the appropriate manifests. A historical binary pin is not a promise of current security support.

Original `app` and `console` notices describe earlier packages without the later bundled runtimes. They remain preserved historical records. This current inventory states which runtime, SDK, data and source components the public distribution actually includes. The repository does not claim that all bundled objects are GPL-authored project code or that the recovered optional native engine can be rebuilt from the available source.
