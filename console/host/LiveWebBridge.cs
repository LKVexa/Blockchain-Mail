// JA21 9.8.7 live-web composition bridge. This is selected only when the Microsoft WebView2 SDK
// adapter has been provisioned. The browser shell, VEC1 lifecycle, policy and evidence
// remain JA21/VEC1; Edge WebView2 is used only as the modern document/media engine.
using System;
using System.IO;
using System.Diagnostics;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace VBJA21
{
    internal static class LiveWebFactory
    {
        public static bool IsAvailable(string root)
        {
            string sdk = PortablePaths.WebView2SdkRoot(root);
            if(!Directory.Exists(sdk) || String.Equals(Environment.GetEnvironmentVariable("JA21_NATIVE_ONLY"), "1", StringComparison.Ordinal)) return false;
            try { CoreWebView2Environment.GetAvailableBrowserVersionString(); return true; } catch { return false; }
        }

        public static string AdapterStatus(string root)
        {
            if (!IsAvailable(root)) return "native-only";
            try { return "WebView2 " + CoreWebView2Environment.GetAvailableBrowserVersionString(); }
            catch { return "WebView2 runtime unavailable"; }
        }

        public static ILiveWebSurface Create(string root, int tabId, bool isPrivate)
        {
            return new WebView2LiveWebSurface(root, tabId, isPrivate);
        }
    }

    // The blank console has no overlapping browser chrome and uses the standard
    // WPF HWND host. Full-browser mode retains its airspace-safe composition host.
    internal sealed class LiveWebControl : IDisposable
    {
        private readonly WebView2 _standard;
        private readonly WebView2CompositionControl _composition;
        public LiveWebControl(bool console)
        {
            if (console) _standard = new WebView2();
            else _composition = new WebView2CompositionControl();
        }
        public FrameworkElement View { get { return _standard != null ? (FrameworkElement)_standard : _composition; } }
        public HorizontalAlignment HorizontalAlignment { set { View.HorizontalAlignment = value; } }
        public VerticalAlignment VerticalAlignment { set { View.VerticalAlignment = value; } }
        public CoreWebView2 CoreWebView2 { get { return _standard != null ? _standard.CoreWebView2 : _composition.CoreWebView2; } }
        public Uri Source { get { return _standard != null ? _standard.Source : _composition.Source; } set { if (_standard != null) _standard.Source = value; else _composition.Source = value; } }
        public CoreWebView2CreationProperties CreationProperties { set { if (_standard != null) _standard.CreationProperties = value; else _composition.CreationProperties = value; } }
        public event EventHandler<CoreWebView2InitializationCompletedEventArgs> CoreWebView2InitializationCompleted
        {
            add { if (_standard != null) _standard.CoreWebView2InitializationCompleted += value; else _composition.CoreWebView2InitializationCompleted += value; }
            remove { if (_standard != null) _standard.CoreWebView2InitializationCompleted -= value; else _composition.CoreWebView2InitializationCompleted -= value; }
        }
        public event EventHandler<CoreWebView2NavigationStartingEventArgs> NavigationStarting
        {
            add { if (_standard != null) _standard.NavigationStarting += value; else _composition.NavigationStarting += value; }
            remove { if (_standard != null) _standard.NavigationStarting -= value; else _composition.NavigationStarting -= value; }
        }
        public event EventHandler<CoreWebView2NavigationCompletedEventArgs> NavigationCompleted
        {
            add { if (_standard != null) _standard.NavigationCompleted += value; else _composition.NavigationCompleted += value; }
            remove { if (_standard != null) _standard.NavigationCompleted -= value; else _composition.NavigationCompleted -= value; }
        }
        public void GoBack() { if (_standard != null) _standard.GoBack(); else _composition.GoBack(); }
        public void GoForward() { if (_standard != null) _standard.GoForward(); else _composition.GoForward(); }
        public void Reload() { if (_standard != null) _standard.Reload(); else _composition.Reload(); }
        public void Dispose() { if (_standard != null) _standard.Dispose(); else _composition.Dispose(); }
    }

    internal sealed class WebView2LiveWebSurface : ILiveWebSurface
    {
        private readonly LiveWebControl _view;
        private readonly string _root;
        private readonly string _dataDir;
        private readonly bool _private;
        private bool _ready;
        private bool _disposed;
        private bool _consolePolicyReady;
        private readonly ConsolePresentationState _consolePresentation = new ConsolePresentationState();
        private readonly Stopwatch _consoleClock = Stopwatch.StartNew();
        private readonly DispatcherTimer _consoleWatchdog = new DispatcherTimer();
        private bool _consoleNavigationSucceeded;
        private long _consoleProbeGeneration = -1;
        private ulong _consoleNavigationId;
        private readonly ConsoleProcessRecovery _consoleRecovery = new ConsoleProcessRecovery();
        private long _consoleRecoveryProbeGeneration = -1;
        private bool _consoleFailureEmitted;

        public event Action<string, string> NavigationCommitted;
        public event Action<string> StatusChanged;
        public event Action<bool> FullScreenChanged;
        public event Action<bool> ConsoleReadyChanged;
        public event Action<string> ConsoleFailed;

        public WebView2LiveWebSurface(string root, int tabId, bool isPrivate)
        {
            _root = root;
            _private = isPrivate;
            string state = Environment.GetEnvironmentVariable("JA21_WEB_DATA_ROOT");
            if(String.IsNullOrWhiteSpace(state)) state = PortablePaths.LiveWebState(root);
            Directory.CreateDirectory(state);
            _dataDir = isPrivate
                ? System.IO.Path.Combine(state, "private", "tab-" + tabId.ToString() + "-" + Guid.NewGuid().ToString("N"))
                : System.IO.Path.Combine(state, "profile");
            Directory.CreateDirectory(_dataDir);

            // CompositionControl is the WebView2 WPF airspace-safe host.  It permits the
            // JA21 optical rail, drawers and trust surfaces to remain in the same WPF window
            // above live web content.
            _view = new LiveWebControl(Ja21Design.ConsoleMode);
            _view.HorizontalAlignment = HorizontalAlignment.Stretch;
            _view.VerticalAlignment = VerticalAlignment.Stretch;
            CoreWebView2CreationProperties creation = new CoreWebView2CreationProperties { UserDataFolder = _dataDir };
            string fixedRuntime = PortablePaths.FixedWebView2Root(root);
            if(!String.IsNullOrWhiteSpace(fixedRuntime)) { var bp = creation.GetType().GetProperty("BrowserExecutableFolder"); if(bp != null && bp.CanWrite) bp.SetValue(creation, fixedRuntime, null); }
            _view.CreationProperties = creation;
            PortableFabric.Record("live.web", "surface-create", isPrivate ? "private WebView2 composition surface" : "persistent portable WebView2 composition surface");
            _view.CoreWebView2InitializationCompleted += OnInitialized;
            _consoleWatchdog.Interval = TimeSpan.FromMilliseconds(250);
            _consoleWatchdog.Tick += OnConsoleWatchdog;
            _view.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs e)
            {
                if (Ja21Design.ConsoleMode)
                {
                    try { if (!_consolePolicyReady) throw new Exception("Console request policy is not ready."); CheckConsoleNavigation(e.Uri); _consoleNavigationId = e.NavigationId; StartConsoleLoad(); Diagnostic("navigation-start", ConsoleDiagnostics.SafeRoute(e.Uri), null, null, null, null); }
                    catch(Exception policyEx) { e.Cancel = true; FailConsole("address-blocked"); EmitStatus("Console navigation blocked · " + policyEx.Message); }
                    return;
                }
                Uri target;
                if(Uri.TryCreate(e.Uri,UriKind.Absolute,out target) && (target.Scheme=="http" || target.Scheme=="https"))
                {
                    try { JaAddressPolicy.Check(target); }
                    catch(Exception policyEx) { e.Cancel=true; EmitStatus("Live web navigation blocked · "+policyEx.Message); return; }
                }
                else if(Uri.TryCreate(e.Uri,UriKind.Absolute,out target) && target.Scheme!="about")
                { e.Cancel=true; EmitStatus("Live web blocked a non-web navigation scheme."); return; }
                EmitStatus("Loading live web · " + SafeHost(e.Uri));
            };
            _view.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs e)
            {
                if (Ja21Design.ConsoleMode)
                {
                    if (e.NavigationId != _consoleNavigationId || !_consolePresentation.Waiting) return;
                    Diagnostic(e.IsSuccess ? "navigation-complete" : "navigation-failed", null, null, e.WebErrorStatus.ToString(), null, null);
                    if (!e.IsSuccess) FailConsole("navigation-failed");
                    else { _consoleNavigationSucceeded = true; _consoleRecovery.Healthy(); }
                }
                else EmitNavigation();
                EmitStatus(e.IsSuccess ? "Live web settled" : "Live web navigation failed · " + e.WebErrorStatus.ToString());
            };
        }

        private void OnInitialized(object sender, CoreWebView2InitializationCompletedEventArgs e)
        {
            if (_disposed) return;
            if (!e.IsSuccess || _view.CoreWebView2 == null)
            {
                Diagnostic("initialize-failed", null, null, null, null, e.InitializationException);
                if (Ja21Design.ConsoleMode) FailConsole("initialize-failed");
                EmitStatus("Live web engine could not initialize" + (e.InitializationException == null ? "" : " · " + e.InitializationException.Message));
                return;
            }
            // Install all required handlers before allowing the first console navigation.
            // The three-argument API includes iframe/dedicated-worker document requests,
            // shared workers and service workers. This is an HTTP/file request boundary,
            // not an OS firewall: WebSocket handshakes and browser background traffic are
            // not guaranteed to raise WebResourceRequested by the WebView2 API.
            if (Ja21Design.ConsoleMode)
            {
                try { InstallConsoleRequestPolicy(); _consolePolicyReady = true; }
                catch (Exception policyEx)
                {
                    _consolePolicyReady = false;
                    FailConsole("policy-unavailable");
                    Dispose();
                    EmitStatus("Console request policy unavailable · " + policyEx.Message);
                    return;
                }
            }
            CoreWebView2Settings s = _view.CoreWebView2.Settings;
            s.IsStatusBarEnabled = false;
            s.AreDevToolsEnabled = !Ja21Design.ConsoleMode && String.Equals(Environment.GetEnvironmentVariable("JA21_ENABLE_DEVTOOLS"), "1", StringComparison.Ordinal);
            s.IsPasswordAutosaveEnabled = false;
            s.IsGeneralAutofillEnabled = false;
            s.AreDefaultScriptDialogsEnabled = true;
            s.AreDefaultContextMenusEnabled = !Ja21Design.ConsoleMode;
            s.IsZoomControlEnabled = true;
            s.AreBrowserAcceleratorKeysEnabled = !Ja21Design.ConsoleMode;

            // Some video/player shells apply `cursor:none` while media is active. In a browser-owned
            // virtual desktop that can make the system pointer appear to fall behind the video surface.
            // Install a narrow guard that only overrides elements which explicitly compute to cursor:none;
            // ordinary link/text/resize cursor semantics remain site-controlled.
            string cursorGuard =
                "(function(){" +
                "function ja21CursorGuard(ev){var n=ev&&ev.target?ev.target:null;var hops=0;" +
                "while(n&&n.nodeType===1&&hops++<16){try{if(getComputedStyle(n).cursor==='none')n.style.setProperty('cursor','auto','important');}catch(e){}n=n.parentElement;}}" +
                "document.addEventListener('pointerover',ja21CursorGuard,true);" +
                "document.addEventListener('pointermove',ja21CursorGuard,true);" +
                "document.addEventListener('mousemove',ja21CursorGuard,true);" +
                "})();";
            try { _view.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(cursorGuard); } catch { }
            _view.CoreWebView2.NewWindowRequested += delegate(object o, CoreWebView2NewWindowRequestedEventArgs n)
            {
                // Keep web navigation in the omni surface rather than spawning external browser chrome.
                n.Handled = true;
                try
                {
                    if (Ja21Design.ConsoleMode) { CheckConsoleNavigation(n.Uri); if (n.Uri == "about:blank") return; }
                    Uri popup; if(!String.IsNullOrWhiteSpace(n.Uri) && Uri.TryCreate(n.Uri,UriKind.Absolute,out popup) && (popup.Scheme=="http" || popup.Scheme=="https")) Navigate(n.Uri);
                    else EmitStatus("Live web blocked a non-web popup target.");
                }
                catch(Exception policyEx) { EmitStatus("Live web popup blocked · " + policyEx.Message); }
            };
            _view.CoreWebView2.ContainsFullScreenElementChanged += delegate(object o, object args)
            {
                Action<bool> h=FullScreenChanged; if(h!=null)h(_view.CoreWebView2.ContainsFullScreenElement);
            };
            _view.CoreWebView2.PermissionRequested += delegate(object o, CoreWebView2PermissionRequestedEventArgs p)
            {
                // Camera, microphone, geolocation, notifications and clipboard escalation are denied
                // unless explicitly opted in for this launch. Ordinary video playback is unaffected.
                if (!Ja21Design.ConsoleMode && String.Equals(Environment.GetEnvironmentVariable("JA21_ALLOW_WEB_PERMISSIONS"), "1", StringComparison.Ordinal)) return;
                if (AllowConsoleFileAccess(p.Uri, p.IsUserInitiated, p.PermissionKind))
                {
                    p.State = CoreWebView2PermissionState.Allow;
                    return;
                }
                p.State = CoreWebView2PermissionState.Deny;
            };
            _view.CoreWebView2.ProcessFailed += delegate(object o, CoreWebView2ProcessFailedEventArgs p)
            {
                string kind = p.ProcessFailedKind.ToString();
                if (Ja21Design.ConsoleMode) HandleConsoleProcessFailure(kind, p.Reason.ToString(), p.ExitCode);
                else EmitStatus("Live web process needs recovery · " + kind);
            };
            _view.CoreWebView2.DownloadStarting += delegate(object o, CoreWebView2DownloadStartingEventArgs d)
            {
                try
                {
                    if (Ja21Design.ConsoleMode)
                    {
                        if (!_consolePolicyReady) throw new Exception("Console request policy is not ready.");
                        CheckConsoleDownload(d.DownloadOperation.Uri);
                    }
                    string path = PortablePaths.UniqueDownloadPath(_root, d.ResultFilePath);
                    d.ResultFilePath = path;
                    PortableFabric.Record("downloads", "download-route", System.IO.Path.GetFileName(path));
                    EmitStatus("Download routed to portable workspace · " + System.IO.Path.GetFileName(path));
                }
                catch(Exception ex) { d.Cancel = true; EmitStatus("Portable download path unavailable · " + ex.Message); }
            };
            _ready = true;
            EmitStatus("Live web engine ready · " + EngineLabel);
            // A requested Source is not a successful presentation. Console receipts
            // are emitted only by a successful NavigationCompleted event.
            if (!Ja21Design.ConsoleMode) EmitNavigation();
        }

        private void StartConsoleLoad()
        {
            if (!Ja21Design.ConsoleMode || _disposed) return;
            _consolePresentation.Begin(_consoleClock.ElapsedMilliseconds);
            _consoleNavigationSucceeded = false;
            _consoleWatchdog.Start();
            Action<bool> changed = ConsoleReadyChanged; if (changed != null) changed(false);
        }

        private void FailConsole(string code)
        {
            if (!Ja21Design.ConsoleMode || _disposed) return;
            if (_consoleFailureEmitted) return;
            if (!_consolePresentation.Waiting) _consolePresentation.Begin(_consoleClock.ElapsedMilliseconds);
            if (!_consolePresentation.Fail(_consolePresentation.Generation)) return;
            _consoleFailureEmitted = true;
            Diagnostic(code, null, null, null, null, null);
            _consoleRecovery.Healthy();
            _consoleWatchdog.Stop();
            try { if (_view.CoreWebView2 != null) _view.CoreWebView2.Stop(); } catch { }
            Action<string> failed = ConsoleFailed; if (failed != null) failed(code);
        }

        private void Diagnostic(string code, string route, string kind, string reason, int? exitCode, Exception error)
        {
            if (!Ja21Design.ConsoleMode) return;
            try
            {
                if (route == null) { try { route = ConsoleDiagnostics.SafeRoute(Source); } catch { route = "unknown"; } }
                ConsoleDiagnostics.Record(PortablePaths.Logs(_root), code, route, kind, reason, exitCode,
                    error == null ? null : error.GetType().Name, error == null ? (int?)null : error.HResult);
            }
            catch { /* even path/source inspection must not interrupt the interface */ }
        }

        private void HandleConsoleProcessFailure(string kind, string reason, int exitCode)
        {
            if (_disposed || _consoleFailureEmitted) return;
            bool fatal = _consoleRecovery.Observe(kind, _consoleClock.ElapsedMilliseconds);
            Diagnostic(fatal ? "process-fatal" : kind == "RenderProcessUnresponsive" ? "process-unresponsive" : "process-recoverable", null, kind, reason, exitCode, null);
            if (fatal) { FailConsole("renderer-failed"); EmitStatus("Live web process needs recovery · " + kind); }
            else if (_consoleRecovery.Waiting) _consoleWatchdog.Start();
        }

        private async System.Threading.Tasks.Task ProbeConsoleResponsiveness()
        {
            if (_consoleRecoveryProbeGeneration >= 0 || !_ready || !_consolePolicyReady || _view.CoreWebView2 == null) return;
            long generation = _consoleRecovery.Generation;
            _consoleRecoveryProbeGeneration = generation;
            try
            {
                string result = await _view.CoreWebView2.ExecuteScriptAsync("true");
                if (_disposed || !_consoleRecovery.IsCurrent(generation)) return;
                if (String.Equals(result, "true", StringComparison.Ordinal))
                {
                    _consoleRecovery.Healthy();
                    Diagnostic("process-responsive", null, null, null, null, null);
                }
            }
            catch (Exception error) { if (!_disposed && _consoleRecovery.IsCurrent(generation)) Diagnostic("probe-failed", null, null, null, null, error); }
            finally { if (_consoleRecoveryProbeGeneration == generation) _consoleRecoveryProbeGeneration = -1; }
        }

        private async void OnConsoleWatchdog(object sender, EventArgs args)
        {
            if (_disposed || !Ja21Design.ConsoleMode || (!_consolePresentation.Waiting && !_consoleRecovery.Waiting)) { _consoleWatchdog.Stop(); return; }
            if (_consoleRecovery.TimedOut(_consoleClock.ElapsedMilliseconds)) { Diagnostic("recovery-timeout", null, "RenderProcessUnresponsive", "Unresponsive", null, null); FailConsole("renderer-failed"); return; }
            if (!_consolePresentation.Waiting) { await ProbeConsoleResponsiveness(); return; }
            if (_consolePresentation.TimedOut(_consoleClock.ElapsedMilliseconds)) { FailConsole("timeout"); return; }
            long generation = _consolePresentation.Generation;
            if (!_ready || !_consolePolicyReady || !_consoleNavigationSucceeded || _consoleProbeGeneration >= 0) return;
            _consoleProbeGeneration = generation;
            try
            {
                // Read-only SDK inspection of the integrated application's mounted UI.
                // A complete HTML error page or empty JS root is not readiness. All
                // Both mailbox pages install the login handler before they are ready.
                // Traversed DOM nodes and text samples are bounded; this is availability,
                // not authentication, human attention, or a request security boundary.
                const string rendered = "(()=>{if(document.readyState!=='complete'||!document.body||typeof window.workspaceAccess!=='function')return false;var route=location.pathname,root=document.getElementById('root'),login=document.getElementById('login-form'),surface=null;if(((route==='/'||route==='/desk/index.html')&&login)||route==='/mail/'||route==='/internet/'){if(!login||typeof login.onsubmit!=='function')return false;var mailboxLogin=document.getElementById('login'),shell=document.getElementById('shell');surface=mailboxLogin&&!mailboxLogin.hidden?mailboxLogin:shell;if(!surface||surface.hidden)return false;}else if(route==='/'||route==='/desk/index.html'){surface=root&&root.firstElementChild;if(!surface||!surface.classList.contains('desk-shell'))return false;}else return false;var w=document.createTreeWalker(surface,NodeFilter.SHOW_ALL),n,c=0,controls=0;while(c++<512&&(n=w.nextNode())){var p=n.nodeType===3?n.parentElement:n.nodeType===1?n:null;if(!p||p.closest('script,style,noscript,[hidden]'))continue;var control=n.nodeType===1&&(n.nodeName==='INPUT'||n.nodeName==='TEXTAREA'||n.nodeName==='BUTTON');if(control){if(controls++>=128)continue;}else if(n.nodeType!==3||!n.nodeValue||!n.nodeValue.slice(0,128).trim())continue;if(p.getClientRects().length&&getComputedStyle(p).visibility!=='hidden')return true;}return false;})()";
                string result = await _view.CoreWebView2.ExecuteScriptAsync(rendered);
                if (_disposed || !_consolePresentation.IsCurrent(generation)) return;
                _consoleRecovery.Healthy();
                if (String.Equals(result, "true", StringComparison.Ordinal) && _consolePresentation.Complete(generation))
                {
                    _consoleWatchdog.Stop();
                    Diagnostic("load-ready", null, null, null, null, null);
                    Action<bool> changed = ConsoleReadyChanged; if (changed != null) changed(true);
                    EmitNavigation();
                }
            }
            catch (Exception error) { if (!_disposed && _consolePresentation.IsCurrent(generation)) { Diagnostic("probe-failed", null, null, null, null, error); FailConsole("renderer-failed"); } }
            finally { if (_consoleProbeGeneration == generation) _consoleProbeGeneration = -1; }
        }

        internal static void CheckConsoleNavigation(string raw)
        {
            if (String.Equals(raw, "about:blank", StringComparison.Ordinal)) return;
            Uri target;
            if (!Uri.TryCreate(raw, UriKind.Absolute, out target)) throw new Exception("Console address is not absolute.");
            JaAddressPolicy.Check(target);
        }

        internal static void CheckConsoleDownload(string raw)
        {
            // Browser-created blob exports retain their origin. Opaque data URLs,
            // local files and unconfigured origins have no allowed download provenance.
            if (raw != null && raw.StartsWith("blob:", StringComparison.Ordinal)) raw = raw.Substring(5);
            Uri target;
            if (!Uri.TryCreate(raw, UriKind.Absolute, out target)) throw new Exception("Console download has no allowed origin.");
            JaAddressPolicy.Check(target);
        }

        internal static void CheckConsoleResource(Uri target)
        {
            if (String.Equals(target.Scheme, "ws", StringComparison.Ordinal))
            {
                if (!System.Text.RegularExpressions.Regex.IsMatch(target.OriginalString,
                    @"\Aws://127\.0\.0\.1(?::[1-9][0-9]{0,4})?/api/mail/socket\z"))
                    throw new Exception("Console mail socket must use its literal local address.");
                if (!String.Equals(target.Host, "127.0.0.1", StringComparison.Ordinal) ||
                    target.AbsolutePath != "/api/mail/socket" || target.Query.Length != 0 ||
                    target.Fragment.Length != 0 || target.UserInfo.Length != 0)
                    throw new Exception("Console mail socket address is not allowed.");
                UriBuilder origin = new UriBuilder(target);
                origin.Scheme = "http";
                JaAddressPolicy.Check(origin.Uri);
                return;
            }
            JaAddressPolicy.Check(target);
        }

        internal static bool AllowConsoleFileAccess(string raw, bool userInitiated, CoreWebView2PermissionKind kind)
        {
            if (!Ja21Design.ConsoleMode || !userInitiated || kind != CoreWebView2PermissionKind.FileReadWrite) return false;
            try
            {
                Uri target;
                if (!Uri.TryCreate(raw, UriKind.Absolute, out target) || target.Scheme != "http") return false;
                JaAddressPolicy.Check(target);
                return true;
            }
            catch { return false; }
        }

        private void InstallConsoleRequestPolicy()
        {
            CoreWebView2 core = _view.CoreWebView2;
            core.WebResourceRequested += delegate(object sender, CoreWebView2WebResourceRequestedEventArgs request)
            {
                try
                {
                    if (!_consolePolicyReady) throw new Exception("Console request policy is not ready.");
                    Uri target;
                    if (!Uri.TryCreate(request.Request.Uri, UriKind.Absolute, out target)) throw new Exception("Invalid resource address.");
                    CheckConsoleResource(target);
                }
                catch(Exception policyEx)
                {
                    // Supplying a response prevents the intercepted request from reaching
                    // the network. Do not merely log an error and continue the request.
                    try { request.Response = core.Environment.CreateWebResourceResponse(new MemoryStream(new byte[0], false), 403, "Forbidden", "Content-Type: text/plain\r\nCache-Control: no-store\r\n"); }
                    catch { _consolePolicyReady = false; _ready = false; FailConsole("policy-unavailable"); Dispose(); }
                    EmitStatus("Console resource blocked · " + policyEx.Message);
                }
            };
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
            core.FrameNavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs frame)
            {
                try { if (!_consolePolicyReady) throw new Exception("Console request policy is not ready."); CheckConsoleNavigation(frame.Uri); }
                catch(Exception policyEx) { frame.Cancel = true; EmitStatus("Console frame blocked · " + policyEx.Message); }
            };
            core.LaunchingExternalUriScheme += delegate(object sender, CoreWebView2LaunchingExternalUriSchemeEventArgs external)
            {
                external.Cancel = true;
                EmitStatus("Console blocked an external application link.");
            };
        }

        private void EmitNavigation()
        {
            Action<string, string> h = NavigationCommitted;
            if (h == null) return;
            string src = Source;
            string title = DocumentTitle;
            h(src, title);
        }
        private void EmitStatus(string text) { Action<string> h = StatusChanged; if (h != null) h(text); }
        private static string SafeHost(string raw) { Uri u; return Uri.TryCreate(raw, UriKind.Absolute, out u) ? u.Host : "site"; }

        public FrameworkElement View { get { return _view.View; } }
        public bool Ready { get { return _ready; } }
        public string EngineLabel
        {
            get
            {
                try { return "Microsoft Edge WebView2 " + CoreWebView2Environment.GetAvailableBrowserVersionString(); }
                catch { return "Microsoft Edge WebView2"; }
            }
        }
        public string Source { get { return _view.Source == null ? "" : _view.Source.AbsoluteUri; } }
        public string DocumentTitle { get { try { return _view.CoreWebView2 == null ? "" : _view.CoreWebView2.DocumentTitle; } catch { return ""; } } }
        public bool CanGoBack { get { try { return _view.CoreWebView2 != null && _view.CoreWebView2.CanGoBack; } catch { return false; } } }
        public bool CanGoForward { get { try { return _view.CoreWebView2 != null && _view.CoreWebView2.CanGoForward; } catch { return false; } } }

        public void Navigate(string url)
        {
            if (_disposed) throw new InvalidOperationException("The live surface is no longer available.");
            Uri u;
            if (!Uri.TryCreate(url, UriKind.Absolute, out u)) throw new Exception("Live web address is not absolute.");
            if(u.Scheme!="http" && u.Scheme!="https") throw new Exception("Live web opens only HTTP or HTTPS addresses.");
            JaAddressPolicy.Check(u);
            StartConsoleLoad();
            PortableFabric.Record("live.web", "navigate", u.Host);
            _view.Source = u;
        }
        public void GoBack() { if (CanGoBack) _view.GoBack(); }
        public void GoForward() { if (CanGoForward) _view.GoForward(); }
        public void Reload() { try { if (_view.CoreWebView2 != null) _view.Reload(); } catch { } }
        public void Stop() { _consolePresentation.Cancel(); _consoleWatchdog.Stop(); _consoleRecovery.Healthy(); try { if (_view.CoreWebView2 != null) _view.CoreWebView2.Stop(); } catch { } }
        public void ClearBrowsingData() { try { if (_view.CoreWebView2 != null) _view.CoreWebView2.Profile.ClearBrowsingDataAsync(); } catch { } }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _ready = false;
            _consolePolicyReady = false;
            _consoleRecovery.Healthy();
            _consolePresentation.Cancel(); _consoleWatchdog.Stop(); _consoleWatchdog.Tick -= OnConsoleWatchdog;
            try { _view.Dispose(); } catch { }
            if (_private)
            {
                try { Directory.Delete(_dataDir, true); } catch { }
            }
        }
    }
}
