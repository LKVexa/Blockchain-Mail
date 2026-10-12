using System;
using System.IO;
using System.Threading;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace PortableWorkspace
{
    // Bounded output consumption: no unbounded ReadLine/ReadToEnd accumulation,
    // and no PowerShell callbacks on background threads without a runspace.
    public sealed class PipeReader : IDisposable
    {
        private readonly TextReader reader;
        private readonly int maxChars;
        private readonly ConcurrentQueue<string> lines = new ConcurrentQueue<string>();
        private readonly Thread thread;
        private volatile bool disposed;
        private volatile bool ended;
        private volatile string failure;
        public PipeReader(TextReader input, int limit)
        {
            if (input == null || limit < 1 || limit > 65536) throw new ArgumentException("Invalid pipe reader.");
            reader = input; maxChars = limit;
            thread = new Thread(Pump); thread.IsBackground = true; thread.Start();
        }
        private void Pump()
        {
            var buffer = new System.Text.StringBuilder();
            try
            {
                while (!disposed)
                {
                    int next = reader.Read();
                    if (next < 0) { if (buffer.Length > 0) Publish(buffer.ToString()); break; }
                    if (next == '\n') { Publish(buffer.ToString().TrimEnd('\r')); buffer.Clear(); }
                    else { if (buffer.Length >= maxChars) throw new IOException("Output line exceeded its bound."); buffer.Append((char)next); }
                }
            }
            catch (Exception) { if (!disposed) failure = "Child output exceeded its bounds or could not be read."; }
            finally { ended = true; }
        }
        private void Publish(string line)
        {
            if (lines.Count >= 64) throw new IOException("Output queue exceeded its bound.");
            lines.Enqueue(line);
        }
        public string PollLine() { string value; return lines.TryDequeue(out value) ? value : null; }
        public bool Ended { get { return ended; } }
        public string Failure { get { return failure; } }
        public void Dispose() { disposed = true; try { reader.Dispose(); } catch { } }
    }

    // This managed source is compiled in source-only tests. Win32 entries run
    // only when the reviewed launcher is deliberately used, not in those tests.
    // The job constrains child lifetime; it is not an OS network sandbox.
    public sealed class ChildJob : IDisposable
    {
        [StructLayout(LayoutKind.Sequential)] private struct BasicLimits
        {
            public long ProcessTime, JobTime;
            public uint Flags;
            public UIntPtr MinWorkingSet, MaxWorkingSet;
            public uint ActiveProcesses;
            public UIntPtr Affinity;
            public uint Priority, Scheduling;
        }
        [StructLayout(LayoutKind.Sequential)] private struct IoCounters
        {
            public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes;
        }
        [StructLayout(LayoutKind.Sequential)] private struct ExtendedLimits
        {
            public BasicLimits Basic;
            public IoCounters Io;
            public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
        }
        [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
        [DllImport("kernel32.dll", SetLastError=true)] private static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits info, uint length);
        [DllImport("kernel32.dll", SetLastError=true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", SetLastError=true)] private static extern bool CloseHandle(IntPtr handle);
        private IntPtr handle;
        public ChildJob()
        {
            handle = CreateJobObject(IntPtr.Zero, null);
            if (handle == IntPtr.Zero) throw new IOException("Unable to create the private child-lifetime job.");
            var limits = new ExtendedLimits(); limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if (!SetInformationJobObject(handle, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))))
            { Dispose(); throw new IOException("Unable to establish child-lifetime cleanup."); }
        }
        public void Attach(Process process)
        {
            if (handle == IntPtr.Zero || process == null || !AssignProcessToJobObject(handle, process.Handle))
                throw new IOException("Unable to attach the owned child to lifetime cleanup.");
        }
        public void Dispose() { var old = handle; handle = IntPtr.Zero; if (old != IntPtr.Zero) CloseHandle(old); }
    }
}
