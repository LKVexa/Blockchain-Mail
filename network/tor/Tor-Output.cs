using System;
using System.IO;
using System.Text;
using System.Threading;

namespace PortableWorkspace
{
    // Keep draining a child's pipe while retaining only a small diagnostic tail.
    // No PowerShell script callback runs on the background reader thread.
    public sealed class TorOutput : IDisposable
    {
        private readonly TextReader input;
        private readonly int limit;
        private readonly object sync = new object();
        private readonly StringBuilder tail = new StringBuilder();
        private readonly Thread worker;
        private volatile bool disposed;
        private volatile bool ended;
        private volatile string failure;
        public TorOutput(TextReader reader, int maxChars)
        {
            if (reader == null || maxChars < 1 || maxChars > 16384)
                throw new ArgumentException("Invalid Tor output bound.");
            input = reader; limit = maxChars;
            worker = new Thread(Pump); worker.IsBackground = true; worker.Start();
        }
        private void Pump()
        {
            try
            {
                while (!disposed)
                {
                    int next = input.Read(); if (next < 0) break;
                    lock (sync)
                    {
                        if (tail.Length == limit) tail.Remove(0, 1);
                        tail.Append((char)next);
                    }
                }
            }
            catch (Exception) { if (!disposed) failure = "Tor startup output could not be read."; }
            finally { ended = true; }
        }
        public string Text { get { lock (sync) { return tail.ToString(); } } }
        public bool Ended { get { return ended; } }
        public string Failure { get { return failure; } }
        public void Dispose() { disposed = true; try { input.Dispose(); } catch { } }
    }
}
