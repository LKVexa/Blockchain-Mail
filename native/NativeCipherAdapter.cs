// Independently review this source before running its native operation path.
// stdin contains exactly 32 raw key bytes followed by EOF. No key file is made.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32.SafeHandles;
using System.Web.Script.Serialization;

namespace WorkspaceNative
{
    public static class AdapterPolicy
    {
        public const string EngineName = "portal-cypher-windows-amd64.exe";
        public const string TupleName = "r12_tuple.json";
        public const string EngineHash = "17004f15b0689090169593ee0fc7268457a918c7c259483f0a7713d46d0ea5fe";
        public const string TupleHash = "4b0ff9c6d460d1dc8485015d38d95c03bf92cbad2666b771791a13dfb33de688";
        public const long MaximumInputBytes = 268435456;
        public const long MaximumProtectInputBytes = MaximumInputBytes - 4194304;
        public const long MaximumOutputBytes = MaximumInputBytes + 4194304;
        public const int MaximumChildOutputBytes = 65536;
        private static readonly Regex Device = new Regex(@"\A(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[0-9\u00b9\u00b2\u00b3]|LPT[0-9\u00b9\u00b2\u00b3])(?:\.|\z)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        public static void ValidateMode(string mode)
        { if (mode != "protect" && mode != "open") throw new ArgumentException("Unsupported native archive action."); }
        public static void ValidateInputSize(string mode, long size)
        { ValidateMode(mode); if (size < 1 || size > (mode == "protect" ? MaximumProtectInputBytes : MaximumInputBytes)) throw new IOException("Native input size exceeded its action bound."); }
        public static void ValidateOutputSize(string mode, long size)
        { ValidateMode(mode); if (size < 1 || size > (mode == "protect" ? MaximumInputBytes : MaximumOutputBytes)) throw new IOException("Native output size exceeded its action bound."); }
        public static void ValidateKey(byte[] key)
        {
            if (key == null || key.Length != 32) throw new ArgumentException("Expected32raw key bytes.");
            bool nonzero = false; foreach (byte value in key) nonzero |= value != 0;
            if (!nonzero) throw new ArgumentException("Invalid zero key.");
        }

        public static string QuoteArgument(string value)
        {
            if (value == null || value.IndexOf('\0') >= 0) throw new ArgumentException("Invalid process argument.");
            var result = new StringBuilder("\""); int slashes = 0;
            foreach (char c in value)
            {
                if (c == '\\') { slashes++; continue; }
                if (c == '"') result.Append('\\', slashes * 2 + 1).Append(c);
                else result.Append('\\', slashes).Append(c);
                slashes = 0;
            }
            return result.Append('\\', slashes * 2).Append('"').ToString();
        }

        public static string CheckedPath(string raw, bool directory, bool mustExist)
        {
            if (raw == null || raw.Length < 3 || raw.Length > 259 || !Regex.IsMatch(raw, @"\A[A-Za-z]:\\") || raw.IndexOf('/') >= 0)
                throw new ArgumentException("Choose an ordinary local path within the path bound.");
            foreach (char c in raw) if (Char.IsControl(c) || Char.IsSurrogate(c)) throw new ArgumentException("Invalid path character.");
            if (raw.Substring(2).IndexOf(':') >= 0) throw new ArgumentException("Alternate streams are refused.");
            string full = Path.GetFullPath(raw);
            if (!String.Equals(raw.TrimEnd('\\'), full.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Noncanonical path.");
            string current = full.Substring(0, 3); CheckOrdinaryDirectory(current);
            string[] parts = full.Substring(3).Split(new char[] { '\\' }, StringSplitOptions.None);
            if (parts.Length == 1 && parts[0] == "") return directory && mustExist ? current : ThrowPath();
            if (parts.Length > 64) throw new ArgumentException("Path nesting exceeded.");
            for (int i = 0; i < parts.Length; i++)
            {
                string part = parts[i];
                if (part.Length == 0 || part == "." || part == ".." || part.EndsWith(".") || part.EndsWith(" ") || part.IndexOfAny(new char[] { '<', '>', '"', '|', '?', '*' }) >= 0 || Device.IsMatch(part))
                    throw new ArgumentException("Unsafe or reserved path component.");
                bool last = i == parts.Length - 1;
                if (last && !mustExist)
                {
                    string destination = Path.Combine(current, part);
                    if (File.Exists(destination) || Directory.Exists(destination)) throw new IOException("Output already exists.");
                    return destination;
                }
                string matching = null; int scanned = 0;
                foreach (string candidate in Directory.EnumerateFileSystemEntries(current))
                {
                    if (++scanned > 16384) throw new IOException("Directory entry bound exceeded.");
                    if (String.Equals(Path.GetFileName(candidate), part, StringComparison.OrdinalIgnoreCase))
                    { if (matching != null) throw new IOException("Ambiguous case-sensitive path."); matching = candidate; }
                }
                if (matching == null) throw new IOException("Path is absent or uses a short-name alias.");
                FileAttributes attr = File.GetAttributes(matching);
                if ((attr & FileAttributes.ReparsePoint) != 0) throw new IOException("Reparse paths are refused.");
                bool isDirectory = (attr & FileAttributes.Directory) != 0;
                if ((!last || directory) != isDirectory) throw new IOException("Unexpected path type.");
                current = matching;
            }
            return current;
        }
        private static string ThrowPath() { throw new ArgumentException("Invalid root file path."); }
        private static void CheckOrdinaryDirectory(string path)
        {
            FileAttributes attr = File.GetAttributes(path);
            if ((attr & FileAttributes.Directory) == 0 || (attr & FileAttributes.ReparsePoint) != 0) throw new IOException("Invalid directory.");
        }
        public static string Hash(Stream stream)
        { stream.Position = 0; using (var sha = SHA256.Create()) { string value = Hex(sha.ComputeHash(stream)); stream.Position = 0; return value; } }
        public static string Hex(byte[] bytes) { return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant(); }
        public static PipeSecurity PipeAcl(SecurityIdentifier sid)
        { return PipeAcl(sid, null); }
        public static PipeSecurity PipeAcl(SecurityIdentifier sid, SecurityIdentifier appContainer)
        {
            if (sid == null) throw new ArgumentNullException("sid");
            var acl = new PipeSecurity(); acl.SetAccessRuleProtection(true, false); acl.SetOwner(sid);
            acl.AddAccessRule(new PipeAccessRule(sid, PipeAccessRights.FullControl, AccessControlType.Allow));
            if (appContainer != null) { CheckContainerSid(appContainer); acl.AddAccessRule(new PipeAccessRule(appContainer, PipeAccessRights.Read | PipeAccessRights.Synchronize, AccessControlType.Allow)); }
            return acl;
        }
        public static DirectorySecurity DirectoryAcl(SecurityIdentifier sid)
        { return DirectoryAcl(sid, null); }
        public static DirectorySecurity DirectoryAcl(SecurityIdentifier sid, SecurityIdentifier appContainer)
        {
            var acl = new DirectorySecurity(); acl.SetAccessRuleProtection(true, false); acl.SetOwner(sid);
            acl.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            if (appContainer != null) { CheckContainerSid(appContainer); acl.AddAccessRule(new FileSystemAccessRule(appContainer, FileSystemRights.Modify, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow)); }
            return acl;
        }
        private static void CheckContainerSid(SecurityIdentifier sid) { if (!Regex.IsMatch(sid.Value, @"\AS-1-15-2-(?:[0-9]+-){6}[0-9]+\z")) throw new ArgumentException("Expected exact current AppContainer SID."); }
        public static string EngineArguments(string mode, string tuple, string input, string output, string pipe)
        {
            ValidateMode(mode);
            var args = new List<string>(); args.Add(mode == "protect" ? "zip-protect" : "zip-open");
            if (mode == "protect") { args.Add("-tuple"); args.Add(tuple); }
            args.Add("-in"); args.Add(input); args.Add("-out"); args.Add(output); args.Add("-key-file"); args.Add(pipe);
            if (mode == "protect") { args.Add("-chunk-size"); args.Add("1048576"); }
            var quoted = new List<string>(); foreach (string arg in args) quoted.Add(QuoteArgument(arg)); return String.Join(" ", quoted.ToArray());
        }
    }

    // Only fixed diagnostic categories leave this bounded rolling classifier.
    // Native output, paths, arguments and potential key text are never returned.
    public sealed class NativeDiagnosticClassifier
    {
        private string tail = ""; private string category = "native_other"; private string target = "native_unknown"; private int rank, targetRank;
        public string Category { get { lock (this) { return category; } } }
        public string Target { get { lock (this) { return target; } } }
        public void Observe(byte[] bytes, int count)
        {
            if (bytes == null || count < 0 || count > bytes.Length || count > 4096) throw new ArgumentException("Invalid diagnostic chunk.");
            lock (this)
            {
                for (int i = 0; i < count; i++)
                {
                    char c = bytes[i] >= 32 && bytes[i] <= 126 ? Char.ToLowerInvariant((char)bytes[i]) : ' ';
                    tail = tail + c; if (tail.Length > 96) tail = tail.Substring(tail.Length - 96);
                    if (tail.Contains(@"\\.\pipe\")) SelectTarget("native_key_pipe", 3);
                    else if (tail.Contains(".workspace-native-")) SelectTarget("native_private_operation", 2);
                    else if (tail.Contains("r12_tuple.json")) SelectTarget("native_tuple", 1);
                    if (tail.Contains("out of memory") || tail.Contains("cannot allocate memory") || tail.Contains("failed to reserve") || tail.Contains("virtualalloc")) Select("native_memory_limit", 9);
                    else if (tail.Contains("access is denied") || tail.Contains("permission denied")) Select("native_access_denied", 8);
                    else if (tail.Contains("sharing violation") || tail.Contains("being used by another process")) Select("native_sharing_violation", 7);
                    else if (tail.Contains("cannot find the file") || tail.Contains("no such file") || tail.Contains("cannot find the path")) Select("native_path_absent", 6);
                    else if (tail.Contains("all pipe instances are busy") || tail.Contains("pipe is busy")) Select("native_pipe_busy", 5);
                    else if (tail.Contains("authentication failed") || tail.Contains("message authentication failed")) Select("native_authentication_rejected", 4);
                    else if (tail.Contains("invalid zip") || tail.Contains("not a valid zip")) Select("native_zip_rejected", 3);
                    else if (tail.Contains("key-file") || tail.Contains("key file")) Select("native_key_read_rejected", 2);
                    else if (tail.Contains("usage:") || tail.Contains("flag provided but not defined")) Select("native_arguments_rejected", 1);
                }
            }
        }
        private void Select(string value, int priority) { if (priority > rank) { category = value; rank = priority; } }
        private void SelectTarget(string value, int priority) { if (priority > targetRank) { target = value; targetRank = priority; } }
    }

    // Fixed-size readers discard native diagnostics after fixed classification.
    public sealed class NativeOutputBudget
    {
        private int bytes;
        public void Observe(int count)
        {
            if (count < 0 || count > 4096 || Interlocked.Add(ref bytes, count) > AdapterPolicy.MaximumChildOutputBytes) throw new IOException("Combined native output exceeded its bound.");
        }
    }
    internal sealed class BoundedDrain : IDisposable
    {
        private readonly Stream stream; private readonly NativeOutputBudget budget; private readonly NativeDiagnosticClassifier diagnostic; private volatile bool ended, failed;
        public BoundedDrain(Stream input, NativeOutputBudget sharedBudget, NativeDiagnosticClassifier classifier)
        {
            stream = input; budget = sharedBudget; diagnostic = classifier; var thread = new Thread(Pump); thread.IsBackground = true; thread.Start();
        }
        private void Pump()
        {
            byte[] bytes = new byte[4096];
            try { int n; while ((n = stream.Read(bytes, 0, bytes.Length)) > 0) { budget.Observe(n); if (diagnostic != null) diagnostic.Observe(bytes, n); } }
            catch { failed = true; } finally { Array.Clear(bytes, 0, bytes.Length); ended = true; }
        }
        public bool Ended { get { return ended; } } public bool Failed { get { return failed; } }
        public void Dispose() { try { stream.Dispose(); } catch { } }
    }

    internal sealed class PrivateKeyPipe : IDisposable
    {
        [StructLayout(LayoutKind.Sequential)] private struct SecurityAttributes { public uint Length; public IntPtr Descriptor; [MarshalAs(UnmanagedType.Bool)] public bool Inherit; }
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern SafePipeHandle CreateNamedPipe(string name, uint openMode, uint pipeMode, uint instances, uint outSize, uint inSize, uint timeout, ref SecurityAttributes attributes);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe, out uint processId);
        private NamedPipeServerStream pipe;
        public readonly string Name;
        public PrivateKeyPipe(SecurityIdentifier sid) : this(sid, null) { }
        public PrivateKeyPipe(SecurityIdentifier sid, SecurityIdentifier appContainer)
        {
            byte[] random = new byte[16]; using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(random);
            Name = @"\\.\pipe\workspace-native-key-" + AdapterPolicy.Hex(random); Array.Clear(random, 0, random.Length);
            byte[] descriptor = AdapterPolicy.PipeAcl(sid, appContainer).GetSecurityDescriptorBinaryForm(); GCHandle pinned = GCHandle.Alloc(descriptor, GCHandleType.Pinned);
            SafePipeHandle handle = null;
            try
            {
                var sa = new SecurityAttributes { Length = (uint)Marshal.SizeOf(typeof(SecurityAttributes)), Descriptor = pinned.AddrOfPinnedObject(), Inherit = false };
                // Outbound byte pipe, overlapped, first-instance only, local
                // clients only. Protected DACL admits the current user, plus
                // exact current AppContainer read access when that second
                // Windows token check is required. No broad package SID grant.
                handle = CreateNamedPipe(Name, 0x00000002 | 0x40000000 | 0x00080000, 0x00000008, 1, 64, 0, 1000, ref sa);
                if (handle == null || handle.IsInvalid) throw new IOException("Unable to create private key pipe.");
                pipe = new NamedPipeServerStream(PipeDirection.Out, true, false, handle); handle = null;
            }
            finally { if (handle != null) handle.Dispose(); pinned.Free(); }
        }
        public void Deliver(byte[] key, Process owned, Stopwatch deadline, int limit, string operation)
        {
            var current = pipe;
            NativeAdapter.SetPhase("pipe connection start");
            IAsyncResult connected = current.BeginWaitForConnection(null, null);
            NativeAdapter.SetPhase("pipe connection wait");
            WaitHandle wait = connected.AsyncWaitHandle; bool completed = false;
            try
            {
                while (!wait.WaitOne(25)) { NativeAdapter.CheckDeadline(deadline, limit); NativeAdapter.CheckOperationBudget(operation); if (owned.HasExited) { NativeAdapter.SetPhase("native reader exited before connection"); throw new IOException("Native key reader exited."); } }
                NativeAdapter.SetPhase("pipe connection completion");
                current.EndWaitForConnection(connected); completed = true;
            }
            finally { if (!completed) FinishWait(wait); }
            NativeAdapter.SetPhase("pipe reader identity");
            uint pid; if (!GetNamedPipeClientProcessId(pipe.SafePipeHandle, out pid) || pid != (uint)owned.Id || owned.HasExited) throw new IOException("Unexpected native key reader.");
            NativeAdapter.SetPhase("pipe key write");
            IAsyncResult written = pipe.BeginWrite(key, 0, key.Length, null, null); wait = written.AsyncWaitHandle; completed = false;
            try
            {
                while (!wait.WaitOne(25)) { NativeAdapter.CheckDeadline(deadline, limit); NativeAdapter.CheckOperationBudget(operation); if (owned.HasExited) throw new IOException("Native key reader exited."); }
                pipe.EndWrite(written); completed = true;
            }
            finally { if (!completed) FinishWait(wait); }
            // Closing the server after exactly32bytes provides the EOF needed
            // by the native engine's actual ReadFile implementation.
            Dispose();
        }
        private void FinishWait(WaitHandle wait)
        {
            // Pending CLR pipe callbacks still need their event. Cancel the
            // owned pipe first and close the event only once signaled. Keeping
            // an uncompleted event until process exit is safer than a callback
            // touching an already-disposed SafeWaitHandle.
            try { if (!wait.WaitOne(0)) Dispose(); if (wait.WaitOne(500)) wait.Dispose(); }
            catch (ObjectDisposedException) { } // End* already owns completed-event cleanup.
        }
        public void Dispose() { if (pipe != null) { pipe.Dispose(); pipe = null; } }
    }

    internal sealed class PrivateChildJob : IDisposable
    {
        [StructLayout(LayoutKind.Sequential)] private struct Basic { public long ProcessTime, JobTime; public uint Flags; public UIntPtr MinWorkingSet, MaxWorkingSet; public uint ActiveProcesses; public UIntPtr Affinity; public uint Priority, Scheduling; }
        [StructLayout(LayoutKind.Sequential)] private struct Io { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
        [StructLayout(LayoutKind.Sequential)] private struct Extended { public Basic Basic; public Io Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory; }
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr job, int kind, ref Extended limits, uint size);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CloseHandle(IntPtr handle);
        private IntPtr handle;
        public PrivateChildJob()
        {
            handle = CreateJobObject(IntPtr.Zero, null); if (handle == IntPtr.Zero) throw new IOException("Unable to create native lifetime job.");
            var limits = new Extended(); limits.Basic.Flags = 0x2000 | 0x0008 | 0x0100; // kill-on-close, active-process limit, process memory
            limits.Basic.ActiveProcesses = 1; limits.ProcessMemory = new UIntPtr(536870912);
            if (!SetInformationJobObject(handle, 9, ref limits, (uint)Marshal.SizeOf(typeof(Extended)))) { Dispose(); throw new IOException("Unable to establish native lifetime bounds."); }
        }
        public void Attach(Process process) { if (!AssignProcessToJobObject(handle, process.Handle)) throw new IOException("Unable to attach owned native process."); }
        public void Dispose() { IntPtr old = handle; handle = IntPtr.Zero; if (old != IntPtr.Zero) CloseHandle(old); }
    }

    public static class NativeAdapter
    {
        private static string phase = "preflight";
        private static int? nativeExitCode;
        private static NativeDiagnosticClassifier diagnostic = new NativeDiagnosticClassifier();
        internal static void SetPhase(string fixedPhase) { phase = fixedPhase; }
        [DllImport("advapi32.dll", SetLastError = true)] private static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr value, int length, out int needed);
        internal static SecurityIdentifier CurrentAppContainer(WindowsIdentity identity)
        {
            IntPtr value = Marshal.AllocHGlobal(4); int needed;
            try { if (!GetTokenInformation(identity.Token, 29, value, 4, out needed) || needed != 4) throw new IOException("Unable to classify current process token."); int flag = Marshal.ReadInt32(value); if (flag == 0) return null; if (flag != 1) throw new IOException("Unexpected process token classification."); }
            finally { Marshal.FreeHGlobal(value); }
            GetTokenInformation(identity.Token, 31, IntPtr.Zero, 0, out needed);
            if (needed < IntPtr.Size || needed > 4096) throw new IOException("Unexpected AppContainer information bound.");
            int length = needed; value = Marshal.AllocHGlobal(length);
            try { if (!GetTokenInformation(identity.Token, 31, value, length, out needed) || needed > length || Marshal.ReadIntPtr(value) == IntPtr.Zero) throw new IOException("Unable to identify current AppContainer."); return new SecurityIdentifier(Marshal.ReadIntPtr(value)); }
            finally { Marshal.FreeHGlobal(value); }
        }
        public static void CheckDeadline(Stopwatch clock, int limit) { if (clock.ElapsedMilliseconds >= limit) throw new TimeoutException("Native operation deadline exceeded."); }
        public static void CheckOperationBudget(string operation)
        {
            if ((File.GetAttributes(operation) & FileAttributes.ReparsePoint) != 0) throw new IOException("Operation directory changed type.");
            int count = 0; long bytes = 0;
            foreach (string entry in Directory.EnumerateFileSystemEntries(operation))
            {
                if (++count > 64) throw new IOException("Native temporary file count exceeded.");
                FileAttributes attributes;
                try { attributes = File.GetAttributes(entry); } catch (FileNotFoundException) { continue; }
                if ((attributes & (FileAttributes.Directory | FileAttributes.ReparsePoint)) != 0) throw new IOException("Unexpected native temporary path.");
                try { bytes = checked(bytes + new FileInfo(entry).Length); } catch (FileNotFoundException) { continue; }
                // Native package operations can hold one stream temporary and
                // one final file at once. This is monitored, not a disk quota.
                if (bytes > 2 * AdapterPolicy.MaximumOutputBytes) throw new IOException("Native temporary byte budget exceeded.");
            }
        }
        private static byte[] ReadKey(Stopwatch clock, int limit)
        {
            byte[] record = new byte[33]; Exception failure = null; int count = 0; bool ended = false;
            var stream = Console.OpenStandardInput();
            var thread = new Thread(delegate() { try { int n; while (count < record.Length && (n = stream.Read(record, count, record.Length - count)) > 0) count += n; } catch (Exception e) { failure = e; } finally { Volatile.Write(ref ended, true); } });
            thread.IsBackground = true; thread.Start();
            try
            {
                while (!Volatile.Read(ref ended)) { CheckDeadline(clock, Math.Min(limit, 10000)); Thread.Sleep(10); }
                if (failure != null || count != 32) throw new IOException("Expected exactly32raw key bytes followed byEOF.");
                byte[] key = new byte[32]; Buffer.BlockCopy(record, 0, key, 0, 32);
                try { AdapterPolicy.ValidateKey(key); return key; } catch { Array.Clear(key, 0, key.Length); throw; }
            }
            finally { try { stream.Dispose(); } catch { } Array.Clear(record, 0, record.Length); }
        }
        private static ProcessStartInfo StartInfo(string engine, string arguments, string working)
        {
            var info = new ProcessStartInfo(engine, arguments) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = working, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
            info.EnvironmentVariables.Clear();
            string systemRoot = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            info.EnvironmentVariables["SystemRoot"] = systemRoot; info.EnvironmentVariables["WINDIR"] = systemRoot;
            info.EnvironmentVariables["TEMP"] = working; info.EnvironmentVariables["TMP"] = working;
            info.EnvironmentVariables["PATH"] = Path.Combine(systemRoot, "System32"); return info;
        }
        private static void CleanupDirectory(string operation)
        {
            if (operation == null || !Directory.Exists(operation)) return;
            if ((File.GetAttributes(operation) & FileAttributes.ReparsePoint) != 0) return;
            // Remove only bounded direct regular files inside our random owned
            // operation directory. Never recursively follow native-created paths.
            int count = 0; foreach (string file in Directory.EnumerateFiles(operation)) { if (++count > 64) return; if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) == 0) try { File.Delete(file); } catch { } }
            try { Directory.Delete(operation, false); } catch { }
        }
        private static int Run(string[] args)
        {
            if (args.Length != 5) throw new ArgumentException("Use action,input,new output,asset directory,deadline milliseconds.");
            AdapterPolicy.ValidateMode(args[0]); int limit;
            if (!Int32.TryParse(args[4], out limit) || limit < 1000 || limit > 120000) throw new ArgumentException("Invalid deadline.");
            var clock = Stopwatch.StartNew();
            string input = AdapterPolicy.CheckedPath(args[1], false, true), output = AdapterPolicy.CheckedPath(args[2], false, false), assets = AdapterPolicy.CheckedPath(args[3], true, true);
            string outputParent = Path.GetDirectoryName(output); if (outputParent.Length > 180) throw new ArgumentException("Output parent exceeds private operation path bound.");
            string engine = AdapterPolicy.CheckedPath(Path.Combine(assets, AdapterPolicy.EngineName), false, true), tuple = AdapterPolicy.CheckedPath(Path.Combine(assets, AdapterPolicy.TupleName), false, true);
            byte[] key = null; string operation = null; Process child = null; DateTime childStarted = default(DateTime); PrivateChildJob job = null; BoundedDrain stdout = null, stderr = null;
            using (var engineLock = new FileStream(engine, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var tupleLock = new FileStream(tuple, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var inputLock = new FileStream(input, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                if (engineLock.Length != 2542080 || AdapterPolicy.Hash(engineLock) != AdapterPolicy.EngineHash || tupleLock.Length != 284 || AdapterPolicy.Hash(tupleLock) != AdapterPolicy.TupleHash) throw new IOException("Native asset pin mismatch.");
                AdapterPolicy.ValidateInputSize(args[0], inputLock.Length);
                string sourceHash = AdapterPolicy.Hash(inputLock); CheckDeadline(clock, limit);
                try
                {
                    SecurityIdentifier sid, appContainer; using(var identity = WindowsIdentity.GetCurrent()) { sid = identity.User; appContainer = CurrentAppContainer(identity); } if (sid == null) throw new IOException("No current-user SID.");
                    operation = Path.Combine(outputParent, ".workspace-native-" + Guid.NewGuid().ToString("N"));
                    if (Directory.Exists(operation) || File.Exists(operation)) throw new IOException("Operation directory collision.");
                    phase = "private directory"; Directory.CreateDirectory(operation, AdapterPolicy.DirectoryAcl(sid, appContainer));
                    operation = AdapterPolicy.CheckedPath(operation, true, true); string nativeOutput = Path.Combine(operation, args[0] == "protect" ? "result.ja21pkg" : "result.zip");
                    phase = "private job";
                    job = new PrivateChildJob();
                    phase = "private pipe";
                    using (var pipe = new PrivateKeyPipe(sid, appContainer))
                    {
                        phase = "key input";
                        key = ReadKey(clock, limit);
                        child = new Process { StartInfo = StartInfo(engine, AdapterPolicy.EngineArguments(args[0], tuple, input, nativeOutput, pipe.Name), operation) };
                        phase = "native start"; if (!child.Start()) throw new IOException("Unable to start native engine."); childStarted = child.StartTime;
                        // Immediate attachment; no complete OS-sandbox claim.
                        phase = "native job attachment"; job.Attach(child); child.StandardInput.Close(); var outputBudget = new NativeOutputBudget(); stdout = new BoundedDrain(child.StandardOutput.BaseStream, outputBudget, null); stderr = new BoundedDrain(child.StandardError.BaseStream, outputBudget, diagnostic);
                        phase = "key pipe delivery";
                        pipe.Deliver(key, child, clock, limit, operation); Array.Clear(key, 0, key.Length); key = null;
                        phase = "native completion";
                        while (true)
                        {
                            CheckDeadline(clock, limit); CheckOperationBudget(operation); if (stdout.Failed || stderr.Failed) throw new IOException("Native diagnostics exceeded bound.");
                            if (child.HasExited && stdout.Ended && stderr.Ended)
                            { if (stdout.Failed || stderr.Failed || child.ExitCode != 0) throw new IOException("Native engine rejected the operation."); break; }
                            Thread.Sleep(10);
                        }
                    }
                    phase = "output validation"; CheckDeadline(clock, limit); AdapterPolicy.CheckedPath(nativeOutput, false, true); AdapterPolicy.CheckedPath(output, false, false);
                    long bytes; string resultHash;
                    using (var result = new FileStream(nativeOutput, FileMode.Open, FileAccess.Read, FileShare.Read)) { bytes = result.Length; AdapterPolicy.ValidateOutputSize(args[0], bytes); resultHash = AdapterPolicy.Hash(result); }
                    // Same-directory-volume rename refuses a preexisting user
                    // output. The native engine never receives that final path.
                    phase = "new output commit"; CheckDeadline(clock, limit); File.Move(nativeOutput, output);
                    var complete = new Dictionary<string, object> { { "event", "complete" }, { "protocol", 1 }, { "action", args[0] }, { "output", output }, { "bytes", bytes }, { "sha256", resultHash }, { "inputSha256", sourceHash }, { "nativeEngineSha256", AdapterPolicy.EngineHash } };
                    Console.Out.WriteLine(new JavaScriptSerializer().Serialize(complete)); return 0;
                }
                finally
                {
                    if (key != null) Array.Clear(key, 0, key.Length);
                    if (child != null) try { if (child.HasExited) { nativeExitCode = child.ExitCode; var drainDeadline = Stopwatch.StartNew(); while (stderr != null && !stderr.Ended && drainDeadline.ElapsedMilliseconds < 200) Thread.Sleep(5); } } catch { }
                    if (child != null) { try { if (!child.HasExited && child.StartTime == childStarted) { child.Kill(); child.WaitForExit(2000); } } catch { } }
                    if (job != null) job.Dispose(); if (stdout != null) stdout.Dispose(); if (stderr != null) stderr.Dispose(); if (child != null) child.Dispose();
                    try { CleanupDirectory(operation); } catch { }
                }
            }
        }
        public static int Main(string[] args)
        {
            try { return Run(args); }
            catch (Exception failure) { Console.Error.WriteLine("Native archive operation failed during " + phase + " [" + failure.GetType().Name + ":" + failure.HResult.ToString("x8") + "; nativeExit=" + (nativeExitCode.HasValue ? nativeExitCode.Value.ToString(System.Globalization.CultureInfo.InvariantCulture) : "unknown") + "; category=" + diagnostic.Category + "; target=" + diagnostic.Target + "]; no key or native diagnostic is disclosed."); return 1; }
        }
    }
}
