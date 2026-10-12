using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Workspace391Bundle {
 public sealed class Result { public int Files; public long Bytes; public int LongestPath; public string Root; }
 public static class Extract {
  const uint Invalid=0xffffffff, Reparse=0x400, DirectoryFlag=0x10;
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFileAttributesW(string path);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateDirectoryW(string path,IntPtr security);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool MoveFileW(string source,string destination);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
  static string Native(string path) { return "\\\\?\\"+path; }
  static uint Attributes(string path) {
   uint value=GetFileAttributesW(Native(path));if(value!=Invalid)return value;int error=Marshal.GetLastWin32Error();if(error==2||error==3)return Invalid;throw new Win32Exception(error);
  }
  static string Root(string value) {
   string path=Path.GetFullPath(value);if(path.Length>3)path=path.TrimEnd('\\');if(path.Length<3||path[1]!=':'||path[2]!='\\'||path.StartsWith("\\\\"))throw new IOException("Use a local drive folder for this application.");
   return path;
  }
  public static void CheckDirectory(string value) {
   string path=Root(value),drive=path.Substring(0,3);string current=drive;
   foreach(string part in path.Substring(3).Split(new char[]{'\\'},StringSplitOptions.RemoveEmptyEntries)) { Component(part);current=Path.Combine(current,part);uint attributes=Attributes(current);if(attributes==Invalid||(attributes&DirectoryFlag)==0||(attributes&Reparse)!=0)throw new IOException("Application folders cannot be redirected or missing."); }
  }
  static void Component(string part) {
   if(String.IsNullOrEmpty(part)||part=="."||part==".."||part.Length>255||part.TrimEnd(' ','.')!=part)throw new IOException("Invalid archive path.");
   foreach(char c in part)if(c<32||"<>:\"|?*\\/".IndexOf(c)>=0)throw new IOException("Invalid archive path character.");
   string stem=part.Split('.')[0].ToUpperInvariant();if(stem=="CON"||stem=="PRN"||stem=="AUX"||stem=="NUL"||stem=="CONIN$"||stem=="CONOUT$"||(stem.Length==4&&(stem.StartsWith("COM")||stem.StartsWith("LPT"))&&(stem[3]>='0'&&stem[3]<='9'||stem[3]=='\u00b9'||stem[3]=='\u00b2'||stem[3]=='\u00b3')))throw new IOException("Archive contains a reserved Windows name.");
  }
  static string Relative(string entry) {
   const string prefix="Workspace391/";if(entry==null||!entry.StartsWith(prefix,StringComparison.Ordinal)||entry.Length>2048||entry.IndexOf('\\')>=0)throw new IOException("Unexpected archive layout.");
   string relative=entry.Substring(prefix.Length);foreach(string part in relative.Split('/'))Component(part);if(relative.Equals(".bundle-complete",StringComparison.OrdinalIgnoreCase))throw new IOException("The archive cannot supply a preparation marker.");
   string lower=relative.ToLowerInvariant();if(lower=="state"||lower.StartsWith("state/")||lower=="network-state"||lower.StartsWith("network-state/")||lower=="work"||lower.StartsWith("work/")||lower=="console/workspace"||lower.StartsWith("console/workspace/"))throw new IOException("Private data cannot be installed from a package.");
   return relative;
  }
  static string Hash(Stream stream) { using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-","").ToLowerInvariant(); }
  static bool Digest(string value) { if(value==null||value.Length!=64)return false;foreach(char c in value)if(!(c>='0'&&c<='9')&&!(c>='a'&&c<='f'))return false;return true; }
  static FileStream NewFile(string path) {
   SafeFileHandle handle=CreateFileW(Native(path),0x40000000,0,IntPtr.Zero,1,0x80,IntPtr.Zero);if(handle.IsInvalid){int error=Marshal.GetLastWin32Error();handle.Dispose();throw new Win32Exception(error);}return new FileStream(handle,FileAccess.Write,65536,false);
  }
  static void Directories(string root,string relative) {
   string current=root;string[] parts=relative.Split('/');for(int i=0;i<parts.Length-1;i++){current=Path.Combine(current,parts[i]);uint attributes=Attributes(current);if(attributes==Invalid){if(!CreateDirectoryW(Native(current),IntPtr.Zero))throw new Win32Exception(Marshal.GetLastWin32Error());attributes=Attributes(current);}if((attributes&DirectoryFlag)==0||(attributes&Reparse)!=0)throw new IOException("Extraction path was redirected.");}
  }
  public static Result Prepare(string payload,string destination,string payloadHash,int expectedCount) {
   return Prepare(payload,destination,payloadHash,expectedCount,null);
  }
  public static Result Prepare(string payload,string destination,string payloadHash,int expectedCount,Action<int,int> progress) {
   if(!Digest(payloadHash)||expectedCount<10||expectedCount>20000)throw new IOException("Invalid package identity.");string final=Root(destination),parent=Path.GetDirectoryName(final);CheckDirectory(parent);
   if(Attributes(final)!=Invalid)throw new IOException("The application folder already exists. It will not be overwritten.");
   using(var input=File.OpenRead(payload)) {
    if(Hash(input)!=payloadHash)throw new IOException("The application download is incomplete or changed.");input.Position=0;
    using(var zip=new ZipArchive(input,ZipArchiveMode.Read,true)) {
     if(zip.Entries.Count!=expectedCount)throw new IOException("The application download has missing files.");
     var entries=new Dictionary<string,ZipArchiveEntry>(StringComparer.OrdinalIgnoreCase);long total=0;
     foreach(var entry in zip.Entries){string relative=Relative(entry.FullName);string key=relative.Normalize(NormalizationForm.FormC);if(entries.ContainsKey(key)||entry.Length>256L*1024*1024)throw new IOException("Invalid or oversized package entry.");entries.Add(key,entry);total=checked(total+entry.Length);if(total>1024L*1024*1024)throw new IOException("Package storage bound exceeded.");}
     // File/directory collisions are refused before any destination is created.
     foreach(string name in entries.Keys){string ancestor=name;while(ancestor.LastIndexOf('/')>=0){ancestor=ancestor.Substring(0,ancestor.LastIndexOf('/'));if(entries.ContainsKey(ancestor))throw new IOException("Conflicting archive paths.");}}
     ZipArchiveEntry manifest;if(!entries.TryGetValue("SHA256SUMS.txt",out manifest)||manifest.Length>8*1024*1024)throw new IOException("Package integrity record is missing.");
     var expected=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);using(var reader=new StreamReader(manifest.Open(),new UTF8Encoding(false,true))){string line;while((line=reader.ReadLine())!=null){if(line.Length==0)continue;if(line.Length<67||line.Substring(64,2)!="  "||!Digest(line.Substring(0,64)))throw new IOException("Invalid package integrity record.");string relative=Relative("Workspace391/"+line.Substring(66)).Normalize(NormalizationForm.FormC);if(expected.ContainsKey(relative)||!entries.ContainsKey(relative))throw new IOException("Package integrity paths disagree.");expected.Add(relative,line.Substring(0,64));}}
     if(expected.Count+1!=entries.Count||expected.ContainsKey("SHA256SUMS.txt"))throw new IOException("Package contains unrecorded files.");
     string stage=Path.Combine(parent,Path.GetFileName(final)+".prepare-"+Guid.NewGuid().ToString("N").Substring(0,12));if(Attributes(stage)!=Invalid||!CreateDirectoryW(Native(stage),IntPtr.Zero))throw new IOException("Could not create a fresh application folder.");
     var result=new Result{Root=final};byte[] buffer=new byte[65536];
     foreach(var pair in entries){string relative=Relative(pair.Value.FullName),target=Path.Combine(stage,relative.Replace('/','\\'));if(!target.StartsWith(stage+"\\",StringComparison.OrdinalIgnoreCase)||target.Length>30000)throw new IOException("Archive path escaped the application folder.");Directories(stage,relative);long length=0;using(var source=pair.Value.Open())using(var output=NewFile(target))using(var hash=SHA256.Create()){int count;while((count=source.Read(buffer,0,buffer.Length))!=0){length=checked(length+count);if(length>pair.Value.Length)throw new IOException("Package entry length mismatch.");output.Write(buffer,0,count);hash.TransformBlock(buffer,0,count,null,0);}hash.TransformFinalBlock(buffer,0,0);output.Flush(true);if(length!=pair.Value.Length)throw new IOException("Package entry is incomplete.");string digest=BitConverter.ToString(hash.Hash).Replace("-","").ToLowerInvariant();if(relative!="SHA256SUMS.txt"&&digest!=expected[pair.Key])throw new IOException("Package file failed its integrity check.");}result.Files++;result.Bytes+=length;result.LongestPath=Math.Max(result.LongestPath,final.Length+1+relative.Length);if(progress!=null&&result.Files%50==0)progress(result.Files,entries.Count);}
     if(progress!=null)progress(result.Files,entries.Count);
     using(var marker=NewFile(Path.Combine(stage,".bundle-complete"))){byte[] bytes=Encoding.ASCII.GetBytes(payloadHash+"\n");marker.Write(bytes,0,bytes.Length);marker.Flush(true);}
     CheckDirectory(stage);if(Attributes(final)!=Invalid||!MoveFileW(Native(stage),Native(final)))throw new IOException("Could not finish preparation. Existing folders were preserved.");return result;
    }
   }
  }
 }
}
