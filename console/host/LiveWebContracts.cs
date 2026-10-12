using System;
using System.Globalization;
using System.IO;
using System.Text;
using System.Windows;

namespace VBJA21
{
    internal interface ILiveWebSurface : IDisposable
    {
        FrameworkElement View { get; }
        bool Ready { get; }
        string EngineLabel { get; }
        string Source { get; }
        string DocumentTitle { get; }
        bool CanGoBack { get; }
        bool CanGoForward { get; }
        event Action<string, string> NavigationCommitted;
        event Action<string> StatusChanged;
        event Action<bool> FullScreenChanged;
        event Action<bool> ConsoleReadyChanged;
        event Action<string> ConsoleFailed;
        void Navigate(string url);
        void GoBack();
        void GoForward();
        void Reload();
        void Stop();
        void ClearBrowsingData();
    }

    // Presentation availability only; this is not authentication, human-attention
    // proof, request enforcement, or an alternative to the console origin policy.
    internal sealed class ConsolePresentationState
    {
        private long _started;
        public long Generation { get; private set; }
        public bool Waiting { get; private set; }
        public bool Ready { get; private set; }
        public long Begin(long now)
        {
            if (!Waiting) _started = now; // redirects cannot extend the deadline
            Generation++; Waiting = true; Ready = false;
            return Generation;
        }
        public bool IsCurrent(long generation) { return Waiting && generation == Generation; }
        public bool Complete(long generation)
        {
            if (!IsCurrent(generation)) return false;
            Waiting = false; Ready = true; return true;
        }
        public bool Fail(long generation)
        {
            if (!IsCurrent(generation)) return false;
            Waiting = false; Ready = false; return true;
        }
        public bool TimedOut(long now) { return Waiting && now >= _started && now - _started >= 30000; }
        public void Cancel() { Generation++; Waiting = false; Ready = false; }
    }

    // WebView2 automatically restarts GPU, utility and other subordinate processes.
    // Only the main browser/renderer exits invalidate the whole surface. An
    // unresponsive renderer receives time to answer a read-only responsiveness
    // probe; repeated notifications or a bounded deadline can request recovery.
    internal sealed class ConsoleProcessRecovery
    {
        private long _started;
        private int _notifications;
        public long Generation { get; private set; }
        public bool Waiting { get; private set; }
        public bool Observe(string kind, long now)
        {
            if (kind == "BrowserProcessExited" || kind == "RenderProcessExited") return true;
            if (kind != "RenderProcessUnresponsive") return false;
            if (!Waiting) { Generation++; Waiting = true; _started = now; _notifications = 0; }
            _notifications++;
            return _notifications >= 3 && now >= _started && now - _started >= 30000;
        }
        public bool IsCurrent(long generation) { return Waiting && Generation == generation; }
        public bool TimedOut(long now) { return Waiting && now >= _started && now - _started >= 45000; }
        public void Healthy() { Generation++; Waiting = false; _notifications = 0; }
    }

    // Diagnostics must never contain page URLs, credentials, request bodies or
    // arbitrary exception messages. Two bounded files retain only fixed enum
    // values, a known application route, time and numeric SDK error metadata.
    internal static class ConsoleDiagnostics
    {
        public const int MaximumFileBytes = 65536;
        private static readonly object Gate = new object();
        private static string OneOf(string value, string choices)
        {
            foreach (string choice in choices.Split('|')) if (String.Equals(value, choice, StringComparison.Ordinal)) return choice;
            return "unknown";
        }
        internal static string SafeRoute(string raw)
        {
            Uri uri;
            if (!Uri.TryCreate(raw, UriKind.Absolute, out uri)) return "unknown";
            return OneOf(uri.AbsolutePath, "/|/desk/index.html|/mail/|/internet/");
        }
        public static void Record(string directory, string code, string route, string kind, string reason, int? exitCode, string exceptionType, int? hresult)
        {
            try
            {
                code = OneOf(code, "navigation-start|navigation-complete|navigation-failed|load-ready|process-recoverable|process-unresponsive|process-responsive|process-fatal|recovery-timeout|probe-failed|renderer-failed|policy-unavailable|timeout|address-blocked|initialize-failed|live-unavailable");
                route = OneOf(route, "/|/desk/index.html|/mail/|/internet/");
                kind = OneOf(kind, "BrowserProcessExited|RenderProcessExited|RenderProcessUnresponsive|FrameRenderProcessExited|UtilityProcessExited|SandboxHelperProcessExited|GpuProcessExited|PpapiPluginProcessExited|PpapiBrokerProcessExited|UnknownProcessExited");
                reason = OneOf(reason, "Unexpected|Unresponsive|Terminated|Crashed|LaunchFailed|OutOfMemory|ProfileDeleted|Unknown|UnexpectedError|CertificateCommonNameIsIncorrect|CertificateExpired|ClientCertificateContainsErrors|CertificateRevoked|CertificateIsInvalid|ServerUnreachable|Timeout|ErrorHttpInvalidServerResponse|ConnectionAborted|ConnectionReset|Disconnected|CannotConnect|HostNameNotResolved|OperationCanceled|RedirectFailed|ValidAuthenticationCredentialsRequired|ValidProxyAuthenticationRequired");
                exceptionType = OneOf(exceptionType, "Exception|COMException|InvalidOperationException|ArgumentException|ArgumentNullException|ObjectDisposedException|TaskCanceledException|OperationCanceledException|NotImplementedException|NotSupportedException");
                string line = "{\"schema\":\"JA21/CONSOLE-DIAGNOSTIC/1\",\"observed_utc\":\"" + DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) +
                    "\",\"code\":\"" + code + "\",\"route\":\"" + route + "\",\"process_kind\":\"" + kind + "\",\"reason\":\"" + reason +
                    "\",\"exit_code\":" + (exitCode.HasValue ? exitCode.Value.ToString(CultureInfo.InvariantCulture) : "null") +
                    ",\"exception_type\":\"" + exceptionType + "\",\"hresult\":" + (hresult.HasValue ? hresult.Value.ToString(CultureInfo.InvariantCulture) : "null") + "}" + Environment.NewLine;
                lock (Gate)
                {
                    Directory.CreateDirectory(directory);
                    string path = System.IO.Path.Combine(directory, "console-diagnostics.jsonl");
                    if (File.Exists(path) && new FileInfo(path).Length + Encoding.UTF8.GetByteCount(line) > MaximumFileBytes)
                    {
                        string previous = System.IO.Path.Combine(directory, "console-diagnostics.previous.jsonl");
                        if (File.Exists(previous)) File.Delete(previous);
                        File.Move(path, previous);
                    }
                    File.AppendAllText(path, line, new UTF8Encoding(false));
                }
            }
            catch { /* diagnostic storage cannot interrupt the protected application */ }
        }
    }
}
