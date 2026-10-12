[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Archive,
    [Parameter(Mandatory=$true)][string]$Destination,
    [Parameter(Mandatory=$true)][string]$Report,
    [switch]$SkipPrepare
)

# Disposable, noninteractive Windows 5.1 regression check. Does not launch mail,
# authenticate, modify the repository, overwrite a destination, or change OS policy.
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Full-LocalPath([string]$Value) {
    $full=[IO.Path]::GetFullPath($Value)
    if($full.Length -lt 3 -or $full[1] -ne ':' -or $full[2] -ne '\') {
        throw 'Use an absolute local-drive path.'
    }
    return $full
}
function Assert-WritePath([string]$Value) {
    $full=Full-LocalPath $Value
    if(!$full.StartsWith('D:\Codex\',[StringComparison]::OrdinalIgnoreCase)) {
        throw 'Test destinations and reports must remain under D:\Codex.'
    }
    if(Test-Path -LiteralPath $full) { throw ('An existing test path was preserved: '+$full) }
    return $full
}
function Assert-UnredirectedParents([string]$Value) {
    $parent=[IO.Path]::GetDirectoryName($Value)
    while($parent) {
        if(Test-Path -LiteralPath $parent) {
            $attributes=[IO.File]::GetAttributes($parent)
            if(($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'Test folders cannot be redirected.'
            }
        }
        $next=[IO.Path]::GetDirectoryName($parent)
        if(!$next -or $next -eq $parent) { break }
        $parent=$next
    }
}
function Stream-Hash([IO.Stream]$Stream) {
    $digest=[Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($digest.ComputeHash($Stream)).Replace('-','').ToLowerInvariant() }
    finally { $digest.Dispose() }
}
function File-Hash([string]$Path) {
    $stream=[IO.File]::OpenRead($Path)
    try { return Stream-Hash $stream } finally { $stream.Dispose() }
}
function Publish-Report([object]$Value,[string]$Path) {
    Assert-UnredirectedParents $Path
    $parent=[IO.Path]::GetDirectoryName($Path)
    if(!(Test-Path -LiteralPath $parent)) { [void][IO.Directory]::CreateDirectory($parent) }
    $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {
        $bytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($Value | ConvertTo-Json -Depth 8)+"`n")
        $stream.Write($bytes,0,$bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
}
function Invoke-Preparation([string]$Launcher,[string]$ExpectedSystem) {
    $output=@(& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File $Launcher -PrepareOnly 2>&1)
    if($LASTEXITCODE -ne 0) { throw ('Noninteractive preparation failed: '+($output -join "`n")) }
    $content=$output -join "`n"
    $first=$content.IndexOf('{');$last=$content.LastIndexOf('}')
    if($first -lt 0 -or $last -lt $first) { throw 'Preparation returned no machine-readable result.' }
    $result=$content.Substring($first,$last-$first+1) | ConvertFrom-Json
    if(!$result.prepared -or !([IO.Path]::GetFullPath([string]$result.root)).Equals($ExpectedSystem,[StringComparison]::OrdinalIgnoreCase)) {
        throw 'Preparation returned an unexpected application location.'
    }
    return $result
}

$taskArchive=Full-LocalPath $Archive
$taskDestination=Assert-WritePath $Destination
$taskReport=Assert-WritePath $Report
if([IO.Path]::GetExtension($taskArchive) -cne '.zip') { throw 'Use an actual ZIP archive.' }
if(!(Test-Path -LiteralPath $taskArchive -PathType Leaf)) { throw 'The test archive is missing.' }
Assert-UnredirectedParents $taskDestination
Assert-UnredirectedParents $taskReport
if(([IO.File]::GetAttributes($taskArchive) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'The archive cannot be redirected.' }

$taskResult=[ordered]@{
    schema='blockchain-mail-github-windows-zip-test/1'
    created_utc=[DateTime]::UtcNow.ToString('o')
    powershell=$PSVersionTable.PSVersion.ToString()
    framework=[Environment]::Version.ToString()
    status='PENDING'
    archive=$taskArchive
    archive_sha256=(File-Hash $taskArchive)
    archive_bytes=(Get-Item -LiteralPath $taskArchive).Length
    destination=$taskDestination
    maximum_zip_member_characters=0
    maximum_outer_destination_characters=0
    windows_zip_namespace_available=$false
    windows_zip_top_level_items=$null
    windows_zip_extraction='NOT_RUN'
    outer_files_verified=0
    full_application_preparation='NOT_RUN'
    application_payload_files=$null
    application_payload_sha256=$null
    application_inventory_hashes_verified=$null
    application_launch_hashes_verified=$null
    application_launch_paths_verified=$null
    longest_full_application_path_verified=$null
    repeat_preparation_preserves_private_state=$null
    existing_paths_overwritten=$false
    GUI_started=$false
    authentication_started=$false
    OS_settings_changed=$false
}
$taskZip=$null;$taskShell=$null
try {
    $taskZip=[IO.Compression.ZipFile]::OpenRead($taskArchive)
    $taskFileEntries=New-Object 'Collections.Generic.Dictionary[string,object]' ([StringComparer]::OrdinalIgnoreCase)
    $taskRoots=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach($entry in $taskZip.Entries) {
        $name=$entry.FullName
        if(!$name -or $name.Contains('\') -or $name.Contains(':') -or $name.StartsWith('/') -or $name -match '(^|/)\.{1,2}(/|$)') {
            throw 'Unsafe outer ZIP member.'
        }
        $trimmed=$name.TrimEnd('/')
        foreach($part in $trimmed.Split('/')) {
            if(!$part -or $part.Length -gt 255 -or $part -match '[<>:"|?*\x00-\x1f]' -or $part -match '[ .]$') { throw 'Invalid outer ZIP name.' }
        }
        [void]$taskRoots.Add($trimmed.Split('/')[0])
        $taskResult.maximum_zip_member_characters=[Math]::Max($taskResult.maximum_zip_member_characters,$name.Length)
        $targetLength=$taskDestination.TrimEnd('\').Length+1+$trimmed.Length
        $taskResult.maximum_outer_destination_characters=[Math]::Max($taskResult.maximum_outer_destination_characters,$targetLength)
        if(!$name.EndsWith('/')) {
            if($taskFileEntries.ContainsKey($name)) { throw 'Duplicate outer ZIP member.' }
            $taskFileEntries.Add($name,$entry)
        }
    }
    if($taskRoots.Count -ne 1 -or $taskFileEntries.Count -lt 1) { throw 'Expected one application folder in the ZIP.' }
    $taskRootName=@($taskRoots)[0]
    $taskShell=New-Object -ComObject Shell.Application
    $taskNamespace=$taskShell.NameSpace([string]$taskArchive)
    $taskResult.windows_zip_namespace_available=($null -ne $taskNamespace)
    if($taskNamespace) { $taskResult.windows_zip_top_level_items=$taskNamespace.Items().Count }
    if(!$taskNamespace -or $taskResult.windows_zip_top_level_items -lt 1) {
        $taskResult.status='WINDOWS_REJECTED_ARCHIVE'
        $taskResult.windows_zip_extraction='WINDOWS_REJECTED_ARCHIVE'
        if(!$SkipPrepare) { throw 'Windows Compressed Folders could not read ZIP contents before extraction.' }
        Publish-Report $taskResult $taskReport
        $taskResult | ConvertTo-Json -Depth 8
        exit 0
    }
    # A ZIP may expose its root while containing unusable nested long names.
    # Negative mode only probes archives that exceed the safe extraction boundary.
    if($taskResult.maximum_zip_member_characters -ge 260 -or $taskResult.maximum_outer_destination_characters -ge 260) {
        if($SkipPrepare) {
            $taskResult.status='OUTER_PATH_LIMIT_EXCEEDED'
            $taskResult.windows_zip_extraction='NOT_ATTEMPTED_LONG_PATHS'
            Publish-Report $taskResult $taskReport
            $taskResult | ConvertTo-Json -Depth 8
            exit 0
        }
        throw 'Outer ZIP members exceed the Windows extraction path boundary.'
    }
    if(Test-Path -LiteralPath $taskDestination) { throw 'A destination appeared during the test; it was preserved.' }
    [void][IO.Directory]::CreateDirectory($taskDestination)
    $taskTarget=$taskShell.NameSpace([string]$taskDestination)
    if(!$taskTarget) { throw 'Windows could not open the new test destination.' }
    $taskTarget.CopyHere($taskNamespace.Items(),(4+16+512+1024))
    $taskDeadline=[DateTime]::UtcNow.AddSeconds(55)
    $taskComplete=$false
    do {
        $taskComplete=$true
        foreach($pair in $taskFileEntries.GetEnumerator()) {
            $path=Join-Path $taskDestination ($pair.Key.Replace('/','\'))
            if(!(Test-Path -LiteralPath $path -PathType Leaf)) { $taskComplete=$false;break }
            $actual=Get-Item -LiteralPath $path
            if($actual.Length -ne $pair.Value.Length) { $taskComplete=$false;break }
            $source=$pair.Value.Open()
            try { $expectedHash=Stream-Hash $source } finally { $source.Dispose() }
            try { $actualHash=File-Hash $path } catch { $taskComplete=$false;break }
            if($actualHash -cne $expectedHash) { $taskComplete=$false;break }
        }
        if(!$taskComplete) { Start-Sleep -Milliseconds 250 }
    } while(!$taskComplete -and [DateTime]::UtcNow -lt $taskDeadline)
    if(!$taskComplete) { throw 'Windows extraction did not finish with identical outer file contents.' }
    $taskActualFiles=@(Get-ChildItem -LiteralPath $taskDestination -Recurse -File)
    if($taskActualFiles.Count -ne $taskFileEntries.Count) { throw 'Extraction contains unexpected files.' }
    foreach($file in $taskActualFiles) {
        if(($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Extraction contains a redirected file.' }
    }
    $taskResult.windows_zip_extraction='PASS'
    $taskResult.outer_files_verified=$taskFileEntries.Count
    $taskZip.Dispose();$taskZip=$null
    if(!$SkipPrepare) {
        $taskBundle=Join-Path $taskDestination $taskRootName
        $taskLauncher=Join-Path $taskBundle 'Start.ps1'
        $taskIdentity=Get-Content -LiteralPath (Join-Path $taskBundle 'Bundle.json') -Raw | ConvertFrom-Json
        $taskPayload=Join-Path $taskBundle 'Payload.dat'
        if((File-Hash $taskPayload) -cne $taskIdentity.payload_sha256) { throw 'The extracted payload differs from its bundle identity.' }
        $taskSystem=Join-Path $taskBundle 'system'
        $taskPrepare=Invoke-Preparation $taskLauncher $taskSystem
        if($taskPrepare.payload_sha256 -cne $taskIdentity.payload_sha256) { throw 'Preparation used an unexpected payload.' }
        $taskResult.full_application_preparation='PASS'
        $taskResult.application_payload_files=[int]$taskIdentity.payload_entries
        $taskResult.application_payload_sha256=[string]$taskIdentity.payload_sha256
        Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $taskSystem 'Workspace-Verify.cs')))
        $taskManifest=Get-Content -LiteralPath (Join-Path $taskSystem 'INTEGRATED_BUILD.json') -Raw | ConvertFrom-Json
        $taskGate=[PortableWorkspaceFast391.VerifyGate]::Validate($taskSystem,[string[]]@($taskManifest.launch_files.path),[string[]]@($taskManifest.launch_files.sha256),$null)
        $taskResult.application_launch_hashes_verified=$taskGate.Hashes
        $taskResult.application_launch_paths_verified=$taskGate.Paths
        Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Microsoft.Win32.SafeHandles;
public static class GithubZipLongPath391 {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
 static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
 public static int Verify(string root,string[] paths,string[] hashes) {
  if(paths==null||hashes==null||paths.Length!=hashes.Length)throw new InvalidDataException("Invalid app inventory.");
  string prefix=Path.GetFullPath(root).TrimEnd('\\')+"\\";
  for(int i=0;i<paths.Length;i++) {
   string full=Path.GetFullPath(Path.Combine(root,paths[i].Replace('/','\\')));
   if(!full.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("App path escaped its root.");
   SafeFileHandle handle=CreateFileW("\\\\?\\"+full,0x80000000,1,IntPtr.Zero,3,0x80,IntPtr.Zero);
   if(handle.IsInvalid){int error=Marshal.GetLastWin32Error();handle.Dispose();throw new Win32Exception(error);}
   using(var input=new FileStream(handle,FileAccess.Read,65536,false))using(var sha=SHA256.Create()) {
    string digest=BitConverter.ToString(sha.ComputeHash(input)).Replace("-","").ToLowerInvariant();
    if(digest!=hashes[i])throw new InvalidDataException("An app inventory hash failed: "+paths[i]);
   }
  }
  return paths.Length;
 }
}
'@
        $taskAppPaths=New-Object 'Collections.Generic.List[string]'
        $taskAppHashes=New-Object 'Collections.Generic.List[string]'
        $taskAppSeen=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        foreach($line in [IO.File]::ReadAllLines((Join-Path $taskSystem 'app\SHA256SUMS.txt'))) {
            if($line -cnotmatch '^([a-f0-9]{64})  (.+)$') { throw 'Invalid application checksum inventory.' }
            $appName='app/'+$Matches[2]
            if(!$taskAppSeen.Add($appName)) { throw 'Duplicate application checksum entry.' }
            $taskAppPaths.Add($appName);$taskAppHashes.Add($Matches[1])
        }
        $taskResult.application_inventory_hashes_verified=[GithubZipLongPath391]::Verify($taskSystem,$taskAppPaths.ToArray(),$taskAppHashes.ToArray())
        $taskLongest=0
        foreach($item in $taskManifest.launch_files) { $taskLongest=[Math]::Max($taskLongest,$taskSystem.Length+1+$item.path.Length) }
        foreach($appName in $taskAppPaths) { $taskLongest=[Math]::Max($taskLongest,$taskSystem.Length+1+$appName.Length) }
        $taskResult.longest_full_application_path_verified=$taskLongest
        $taskPrivate=Join-Path $taskSystem 'state'
        if(Test-Path -LiteralPath $taskPrivate) { throw 'Fresh preparation unexpectedly included private state.' }
        [void][IO.Directory]::CreateDirectory($taskPrivate)
        $taskSentinel=Join-Path $taskPrivate 'archive-repeat-preservation-sentinel.txt'
        $taskSentinelBytes=(New-Object Text.UTF8Encoding($false)).GetBytes('Disposable private-state preservation test; '+[Guid]::NewGuid().ToString())
        $taskSentinelStream=[IO.File]::Open($taskSentinel,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try { $taskSentinelStream.Write($taskSentinelBytes,0,$taskSentinelBytes.Length) } finally { $taskSentinelStream.Dispose() }
        $taskSentinelHash=File-Hash $taskSentinel
        $taskRepeat=Invoke-Preparation $taskLauncher $taskSystem
        if((File-Hash $taskSentinel) -cne $taskSentinelHash -or !$taskRepeat.preserved_existing_state) { throw 'Repeated preparation changed private test state.' }
        if(@(Get-ChildItem -LiteralPath $taskBundle -Directory | Where-Object {$_.Name -like 'system.prepare-*'}).Count -ne 0) { throw 'Repeated preparation left a new staging folder.' }
        $taskResult.repeat_preparation_preserves_private_state=$true
    }
    $taskResult.status='PASS'
    Publish-Report $taskResult $taskReport
    $taskResult | ConvertTo-Json -Depth 8
} catch {
    $taskResult.status='FAIL'
    $taskResult.error=$_.Exception.GetBaseException().Message
    if(!(Test-Path -LiteralPath $taskReport)) { Publish-Report $taskResult $taskReport }
    throw
} finally {
    if($taskZip) { $taskZip.Dispose() }
    if($taskShell) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskShell) }
}
