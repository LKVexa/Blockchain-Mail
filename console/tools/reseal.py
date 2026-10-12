#!/usr/bin/env python3
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[1]
def h(p):
    s=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): s.update(b)
    return s.hexdigest()
runtime_paths=[
 'source/browser.ja','source/renderer.ja','source/web_engine.ja','source/browser.jaui','source/browser.jasec','source/browser.jasp','source/browser.jaops','source/browser.jxd',
 'engine/ja21/browser.ir.json','engine/ja21/renderer.ir.json','engine/ja21/web_engine.ir.json','engine/ja21/corpus.lock.json','engine/ja21/profile.json',
 'engine/df_medium/native/win-x64/dfmedium-ja21-web.dll','engine/df_medium/source/brvm.c','engine/df_medium/source/brvm.h','engine/df_medium/source/brtrust.c','engine/df_medium/source/brtrust.h','engine/df_medium/source/ja21_webengine.c','engine/df_medium/source/ja21_webengine.h','engine/df_medium/ENGINE_PROVENANCE.json','engine/df_medium/DF_Medium.source.zip',
 'host/JA21VirtualBrowser.cs','host/Vec1Substrate.cs','host/PortableDesktop.cs','host/LiveWebContracts.cs','host/LiveWebBridge.cs','host/LiveWebBridgeStub.cs','host/Ensure-WebView2Bridge.ps1','host/Import-WebView2Adapter.ps1','host/Start-JA21Browser.ps1','host/Wpf-CompileReferences.ps1',
 'host/Start-Console.ps1','Start Console.cmd','Start Console.vbs',
 'runtime/webview2-sdk/1.0.4191.47/Microsoft.Web.WebView2.Core.dll',
 'runtime/webview2-sdk/1.0.4191.47/Microsoft.Web.WebView2.Wpf.dll',
 'runtime/webview2-sdk/1.0.4191.47/WebView2Loader.dll',
 'runtime/webview2-sdk/1.0.4191.47/PROVISIONED.json',
 # VEC1 substrate: the control plane, its policy and the canonical vectors the presenter
 # checks itself against are all load-bearing at startup, so they are runtime-sealed too.
 'substrate/NODES.json','substrate/config/vec1.json','substrate/config/ja21_portable_placement.json','engine/ja21/portable.runtime.json','host/portable-env.cmd','substrate/config/security_policy.json','substrate/config/CONFIG_SEAL.json',
 'substrate/evidence/presenter/CANONICAL_VECTORS.json',
 'substrate/vec1/__init__.py','substrate/vec1/common.py','substrate/vec1/core.py','substrate/vec1/ledger.py',
 'substrate/vec1/binding.py','substrate/vec1/presenter.py','substrate/vec1/dfbridge.py','substrate/vec1/vecctl.py'
]
runtime={'format':'vb-ja21-runtime-seal/4','product':'JA21 Portable Optical Instrument Desktop','version':'9.8.7','files':[]}
for rel in runtime_paths:
    p=ROOT/rel; runtime['files'].append({'path':rel,'bytes':p.stat().st_size,'sha256':h(p)})
(ROOT/'engine/ja21/runtime.integrity.json').write_text(json.dumps(runtime,indent=2)+'\n',encoding='utf-8')
files=[]
for p in sorted(ROOT.rglob('*')):
    if not p.is_file(): continue
    rel=p.relative_to(ROOT).as_posix()
    if rel in ('package.integrity.json', 'console.json') or '__pycache__/' in rel or rel.endswith('.pyc'): continue
    # Substrate runtime state is written while the browser runs; sealing it would make the
    # manifest fail the moment a tab is opened.
    if rel.startswith('substrate/runtime/') or rel.startswith('runtime/') or rel.startswith('workspace/'): continue
    if rel.endswith('.tmp') or '/.vec1.lock' in rel: continue
    files.append({'path':rel,'bytes':p.stat().st_size,'sha256':h(p)})
manifest={'format':'vb-ja21-package/5','product':'JA21 Portable Optical Instrument Desktop','version':'9.8.7','files':files}
(ROOT/'package.integrity.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('runtime-seal',len(runtime['files']),'package-files',len(files))
