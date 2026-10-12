using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;

namespace PortableWorkspaceFast391
{
    public sealed class VerificationCounts
    {
        public int Paths { get; internal set; }
        public long AncestorReads { get; internal set; }
        public int Hashes { get; internal set; }
    }

    // Pure file/crypto gate. The launcher must verify this source's manifest
    // binding before compiling it, and must finish this gate before starting
    // any backend, native component, GUI console or key prompt. This does not
    // authenticate the publisher or freeze all files after they are checked.
    public static class VerifyGate
    {
        private const string NodePath = "runtime/node.exe";
        private const string NodeSha256 = "3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237";
        private static readonly string[] Required = {
            NodePath, "app/package.json", "app/src/main.mjs", "app/src/http.mjs", "app/desk/index.html", "app/web/index.html",
            "console/host/Start-JA21Browser.ps1", "console/host/JA21VirtualBrowser.cs", "console/host/LiveWebBridge.cs",
            "console/runtime/webview2-sdk/1.0.4191.47/Microsoft.Web.WebView2.Core.dll",
            "console/runtime/webview2-sdk/1.0.4191.47/Microsoft.Web.WebView2.Wpf.dll",
            "console/runtime/webview2-sdk/1.0.4191.47/WebView2Loader.dll",
            "Workspace-Policy.ps1", "Workspace-Pipe.cs", "Start-Workspace.ps1", "Workspace-Verify.cs"
        };

        public static VerificationCounts Validate(string root, string[] paths, string[] hashes, Func<int, int, bool> progress)
        {
            if (String.IsNullOrWhiteSpace(root) || paths == null || hashes == null ||
                paths.Length != hashes.Length || paths.Length < 10 || paths.Length > 12000)
                throw new ArgumentException("The launch inventory is missing or malformed.");
            string fullRoot = Path.GetFullPath(root);
            if (fullRoot.Length > 3) fullRoot = fullRoot.TrimEnd('\u005c', '/');
            string prefix = fullRoot.TrimEnd('\u005c', '/') + Path.DirectorySeparatorChar;
            var counts = new VerificationCounts();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var canonicalSeen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var clock = Stopwatch.StartNew();
            byte[] hashBuffer = new byte[65536];
            long lastProgress = 0;
            Notify(progress, 0, paths.Length);
            for (int i = 0; i < paths.Length; i++)
            {
                string relative = paths[i];
                if (!ValidHash(hashes[i]) || relative == null || !seen.Add(relative))
                    throw new ArgumentException("The launch inventory contains malformed or duplicate entries.");
                string file = ContainedPath(fullRoot, prefix, relative, counts);
                if (!canonicalSeen.Add(file))
                    throw new ArgumentException("The launch inventory repeats a canonical file path.");
                string canonicalRelative = file.Substring(prefix.Length).Replace('\u005c', '/');
                if (IsMutable(canonicalRelative))
                    throw new ArgumentException("Mutable data cannot be a launch component.");
                string digest = HashFile(file, hashBuffer, progress, i, paths.Length, clock, ref lastProgress);
                counts.Hashes++;
                if (!String.Equals(digest, hashes[i], StringComparison.Ordinal))
                    throw new InvalidDataException("A launch component is missing or changed. No component was started.");
                if ((i + 1) % 100 == 0 || clock.ElapsedMilliseconds - lastProgress >= 100)
                {
                    Notify(progress, i + 1, paths.Length);
                    lastProgress = clock.ElapsedMilliseconds;
                }
            }
            foreach (string required in Required)
                if (!seen.Contains(required))
                    throw new InvalidDataException("The launch inventory omits a required component.");
            // Independently pin Node after the complete inventory, even when a
            // changed manifest consistently describes a different executable.
            string node = ContainedPath(fullRoot, prefix, NodePath, counts);
            string nodeDigest = HashFile(node, hashBuffer, progress, paths.Length, paths.Length, clock, ref lastProgress);
            counts.Hashes++;
            if (!String.Equals(nodeDigest, NodeSha256, StringComparison.Ordinal))
                throw new InvalidDataException("The private Node runtime is not the verified 24.19.0 executable.");
            Notify(progress, paths.Length, paths.Length);
            return counts;
        }

        private static bool ValidHash(string value)
        {
            if (value == null || value.Length != 64) return false;
            for (int i = 0; i < value.Length; i++)
                if (!(value[i] >= '0' && value[i] <= '9') && !(value[i] >= 'a' && value[i] <= 'f')) return false;
            return true;
        }

        private static bool IsMutable(string relative)
        {
            return String.Equals(relative, "state", StringComparison.OrdinalIgnoreCase) ||
                relative.StartsWith("state/", StringComparison.OrdinalIgnoreCase) ||
                String.Equals(relative, "network-state", StringComparison.OrdinalIgnoreCase) ||
                relative.StartsWith("network-state/", StringComparison.OrdinalIgnoreCase) ||
                String.Equals(relative, "console/workspace", StringComparison.OrdinalIgnoreCase) ||
                relative.StartsWith("console/workspace/", StringComparison.OrdinalIgnoreCase);
        }

        private static string ContainedPath(string root, string prefix, string relative, VerificationCounts counts)
        {
            if (String.IsNullOrWhiteSpace(relative) || Path.IsPathRooted(relative))
                throw new ArgumentException("A package path must be relative and contained.");
            foreach (char value in relative)
                if (value == ':' || Char.GetUnicodeCategory(value) == System.Globalization.UnicodeCategory.Control)
                    throw new ArgumentException("A package path cannot contain a stream or control character.");
            foreach (string part in relative.Split(new char[] { '\u005c', '/' }))
                if (part == "..") throw new ArgumentException("A package path cannot traverse a parent.");
            string full = Path.GetFullPath(Path.Combine(root, relative));
            if (!full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("A package path escaped the workspace.");
            string current = full;
            while (!String.IsNullOrEmpty(current) && current.Length >= root.Length)
            {
                FileAttributes attributes = 0;
                counts.AncestorReads++;
                try { attributes = File.GetAttributes(current); }
                catch (FileNotFoundException) { }
                catch (DirectoryNotFoundException) { }
                if ((attributes & FileAttributes.ReparsePoint) != 0)
                    throw new IOException("Package paths cannot traverse a junction or symbolic link.");
                if (String.Equals(current, root, StringComparison.OrdinalIgnoreCase)) break;
                current = Path.GetDirectoryName(current);
            }
            counts.Paths++;
            return full;
        }

        private static string HashFile(string file, byte[] buffer, Func<int, int, bool> progress, int completed, int total,
            Stopwatch clock, ref long lastProgress)
        {
            if ((File.GetAttributes(file) & FileAttributes.Directory) != 0)
                throw new InvalidDataException("A launch component is not a file.");
            using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.SequentialScan))
            using (var sha = SHA256.Create())
            {
                int read;
                while ((read = stream.Read(buffer, 0, buffer.Length)) != 0)
                {
                    sha.TransformBlock(buffer, 0, read, null, 0);
                    if (clock.ElapsedMilliseconds - lastProgress >= 100)
                    {
                        Notify(progress, completed, total);
                        lastProgress = clock.ElapsedMilliseconds;
                    }
                }
                sha.TransformFinalBlock(buffer, 0, 0);
                return BitConverter.ToString(sha.Hash).Replace("-", "").ToLowerInvariant();
            }
        }

        private static void Notify(Func<int, int, bool> progress, int completed, int total)
        {
            if (progress != null && !progress(completed, total))
                throw new OperationCanceledException("Workspace verification was cancelled. No component was started.");
        }
    }
}
