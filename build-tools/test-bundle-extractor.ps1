[CmdletBinding()]
param(
 [string]$WorkRoot='',
 [string]$Extractor='',
 [Alias('Report')][string]$OutputReport=''
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if(!$WorkRoot){$WorkRoot=Join-Path (Join-Path $PSScriptRoot '..') 'work'}
if(!$Extractor){$Extractor=Join-Path $PSScriptRoot 'windows-bundle/Extract.cs'}
$taskRoot = [IO.Path]::GetFullPath($WorkRoot)
$testRoot = Join-Path $taskRoot ('extractor-tests-' + [Guid]::NewGuid().ToString('N').Substring(0,12))
[void][IO.Directory]::CreateDirectory($testRoot)
$source = [IO.Path]::GetFullPath($Extractor)
$ownedSource = Join-Path $testRoot 'Extract.cs'
[IO.File]::Copy($source,$ownedSource)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -Path $ownedSource -ReferencedAssemblies @('System.dll','System.Core.dll','System.IO.Compression.dll','System.IO.Compression.FileSystem.dll')
Add-Type -TypeDefinition @'
using System; using System.IO; using System.ComponentModel; using System.Runtime.InteropServices; using Microsoft.Win32.SafeHandles;
public static class ExtractTestNative {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateDirectoryW(string path,IntPtr security);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFileAttributesW(string path);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
 public static bool Exists(string path){return GetFileAttributesW("\\\\?\\"+path)!=0xffffffff;}
 public static void Mkdir(string path){if(!Exists(path)&&!CreateDirectoryW("\\\\?\\"+path,IntPtr.Zero))throw new Win32Exception(Marshal.GetLastWin32Error());}
 public static string Read(string path){using(var handle=CreateFileW("\\\\?\\"+path,0x80000000,1,IntPtr.Zero,3,0x80,IntPtr.Zero)){if(handle.IsInvalid)throw new Win32Exception(Marshal.GetLastWin32Error());using(var stream=new FileStream(handle,FileAccess.Read))using(var reader=new StreamReader(stream))return reader.ReadToEnd();}}
}
'@
$script:results = New-Object 'System.Collections.Generic.List[object]'
function Hash-Bytes([byte[]]$Bytes) {
 $sha = [Security.Cryptography.SHA256]::Create()
 try { return [BitConverter]::ToString($sha.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
}
function New-Fixture([string]$Name,[string[]]$Extras=@(),[bool]$BadManifest=$false) {
 $path = Join-Path $testRoot ($Name+'.zip')
 $file = [IO.File]::Open($path,[IO.FileMode]::CreateNew)
 $zip = New-Object IO.Compression.ZipArchive($file,[IO.Compression.ZipArchiveMode]::Create,$false)
 $manifest = New-Object 'System.Collections.Generic.List[string]'
 try {
  $names = @(); for($i=0;$i -lt 9;$i++){ $names += ('file'+$i+'.txt') }; $names += $Extras
  foreach($entryName in $names) {
   $bytes = [Text.Encoding]::UTF8.GetBytes('payload: '+$entryName)
   # ZipArchive refuses control characters when authoring. Patch its two name records after authoring the fixture.
   $authoredName = $entryName.Replace([char]1,[char]'Q')
   $entry = $zip.CreateEntry('Workspace391/'+$authoredName)
   $stream = $entry.Open(); try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
   $digest = Hash-Bytes $bytes
   if($BadManifest -and $entryName -eq 'file0.txt') { $digest = '0'*64 }
   $manifest.Add($digest+'  '+$entryName)
  }
  $entry = $zip.CreateEntry('Workspace391/SHA256SUMS.txt')
  $bytes = [Text.Encoding]::UTF8.GetBytes(($manifest -join "`n")+"`n")
  $stream = $entry.Open(); try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
 } finally { $zip.Dispose(); $file.Dispose() }
 if($Name -eq 'control-character') {
  $archiveBytes=[IO.File]::ReadAllBytes($path)
  $needle=[Text.Encoding]::ASCII.GetBytes('Workspace391/ordinaryQ.txt')
  $controlOffset=[Text.Encoding]::ASCII.GetBytes('Workspace391/ordinary').Length
  $hits=0
  for($i=0;$i -le $archiveBytes.Length-$needle.Length;$i++) {
   $same=$true; for($j=0;$j -lt $needle.Length;$j++){if($archiveBytes[$i+$j] -ne $needle[$j]){$same=$false;break}}
   if($same){$archiveBytes[$i+$controlOffset]=1;$hits++}
  }
  if($hits -ne 2){throw 'Malformed fixture must patch exactly two ZIP name records.'}
  [IO.File]::WriteAllBytes($path,$archiveBytes)
 }
 return [pscustomobject]@{Path=$path;Hash=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant();Count=$names.Count+1}
}
function Test-Rejection([string]$Name,[string[]]$Extras=@(),[string]$MessagePattern='.',[bool]$BadManifest=$false,[bool]$WrongArchive=$false) {
 $fixture = New-Fixture $Name $Extras $BadManifest
 $destination = Join-Path $testRoot ($Name+'-application')
 $hash = $fixture.Hash; if($WrongArchive){$hash = '0'*64}
 $thrown = $null
 try { [void][Workspace391Bundle.Extract]::Prepare($fixture.Path,$destination,$hash,$fixture.Count) } catch { $thrown=$_.Exception.Message }
 $passed = ($null -ne $thrown) -and ($thrown -match $MessagePattern) -and -not [ExtractTestNative]::Exists($destination)
 $script:results.Add([pscustomobject]@{name=$Name;pass=$passed;expected='rejected without publishing destination';detail=$thrown;entries=$fixture.Count})
}
Test-Rejection 'dotdot-traversal' @('../escaped.txt') 'Invalid archive path'
Test-Rejection 'embedded-traversal' @('sub/../../escaped.txt') 'Invalid archive path'
Test-Rejection 'empty-component' @('sub//item.txt') 'Invalid archive path'
Test-Rejection 'backslash-name' @('sub\item.txt') 'Unexpected archive layout'
Test-Rejection 'absolute-drive-name' @('D:/escaped.txt') 'Invalid archive path character'
Test-Rejection 'alternate-data-stream' @('ordinary.txt:stream') 'Invalid archive path character'
Test-Rejection 'trailing-dot' @('ordinary.txt.') 'Invalid archive path'
Test-Rejection 'trailing-space' @('ordinary.txt ') 'Invalid archive path'
Test-Rejection 'control-character' @(('ordinary'+[char]1+'.txt')) 'Invalid archive path character|Illegal characters in path'
Test-Rejection 'oversized-component' @(('a'*256)+'.txt') 'Invalid archive path'
Test-Rejection 'duplicate-case' @('FILE0.TXT') 'Invalid or oversized package entry'
Test-Rejection 'duplicate-normalization' @(('caf'+[char]0xe9+'.txt'),('cafe'+[char]0x301+'.txt')) 'Invalid or oversized package entry'
Test-Rejection 'reserved-con' @('CON.txt') 'reserved Windows name'
Test-Rejection 'reserved-console-in' @('CONIN$.txt') 'reserved Windows name'
Test-Rejection 'reserved-console-out' @('CONOUT$') 'reserved Windows name'
Test-Rejection 'reserved-com' @('COM1.dat') 'reserved Windows name'
Test-Rejection 'reserved-superscript' @(('LPT'+[char]0xb2+'.dat')) 'reserved Windows name'
Test-Rejection 'file-directory-collision' @('thing','thing/child.txt') 'Conflicting archive paths'
Test-Rejection 'case-file-directory-collision' @('Thing','thing/child.txt') 'Conflicting archive paths'
Test-Rejection 'private-state' @('state/secrets') 'Private data'
Test-Rejection 'private-network-state' @('network-state/onion/private-key') 'Private data'
Test-Rejection 'private-work' @('work/private.txt') 'Private data'
Test-Rejection 'private-console-state' @('console/workspace/private.txt') 'Private data'
Test-Rejection 'completion-marker-injection' @('.bundle-complete') 'preparation marker'
Test-Rejection 'wrong-archive-hash' @() 'incomplete or changed' $false $true
Test-Rejection 'wrong-entry-hash' @() 'failed its integrity check' $true

$fixture = New-Fixture 'preexisting-destination'
$destination = Join-Path $testRoot 'existing application'
[void][IO.Directory]::CreateDirectory($destination)
$sentinel = Join-Path $destination 'preserve-me.txt'
[IO.File]::WriteAllText($sentinel,'original data')
$thrown = $null
try { [void][Workspace391Bundle.Extract]::Prepare($fixture.Path,$destination,$fixture.Hash,$fixture.Count) } catch { $thrown=$_.Exception.Message }
$script:results.Add([pscustomobject]@{name='preexisting-destination';pass=($thrown -match 'already exists') -and ([IO.File]::ReadAllText($sentinel) -eq 'original data') -and ([IO.Directory]::GetFileSystemEntries($destination).Length -eq 1);detail=$thrown})

function Test-Valid([string]$Name,[string]$Parent,[string[]]$Extras=@()) {
 $fixture = New-Fixture $Name $Extras
 $destination = $Parent+'\Application'
 $passed = $false; $detail = $null; $result = $null
 try {
  $result=[Workspace391Bundle.Extract]::Prepare($fixture.Path,$destination,$fixture.Hash,$fixture.Count)
  $passed=($result.Files -eq $fixture.Count) -and ([ExtractTestNative]::Read($destination+'\.bundle-complete') -ceq ($fixture.Hash+"`n")) -and ([ExtractTestNative]::Read($destination+'\file0.txt') -ceq 'payload: file0.txt')
  foreach($entryName in $Extras){if([ExtractTestNative]::Read($destination+'\'+$entryName.Replace('/','\')) -cne ('payload: '+$entryName)){$passed=$false}}
 } catch { $detail=$_.Exception.Message }
 $script:results.Add([pscustomobject]@{name=$Name;pass=$passed;expected='valid fixture published with stable completion marker and all hashes checked';detail=$detail;entries=$fixture.Count;result=$result})
}
$spaceParent = Join-Path $testRoot 'a folder with spaces'
[void][IO.Directory]::CreateDirectory($spaceParent)
Test-Valid 'valid-space-root' $spaceParent
$longRelative = ((1..7 | ForEach-Object { 'a'*48 }) -join '/')+'/deep.txt'
$archiveParent = Join-Path $testRoot 'archive long paths'
[void][IO.Directory]::CreateDirectory($archiveParent)
Test-Valid 'valid-long-archive-path' $archiveParent @($longRelative)
$longParent = $testRoot
for($i=0;$i -lt 6;$i++) { $longParent += '\'+('long folder '+('x'*35)+$i); [ExtractTestNative]::Mkdir($longParent) }
Test-Valid 'valid-long-destination-root' $longParent

$report = [pscustomobject]@{
 schema='workspace391-bundle-extractor-tests/1'; created_utc=[DateTime]::UtcNow.ToString('o'); powershell=$PSVersionTable.PSVersion.ToString(); test_root=$testRoot; extractor_sha256=(Get-FileHash -LiteralPath $ownedSource -Algorithm SHA256).Hash.ToLowerInvariant(); total=$script:results.Count; passed=@($script:results | Where-Object {$_.pass}).Count; failed=@($script:results | Where-Object {-not $_.pass}).Count; tests=$script:results
}
$reportPath = if($OutputReport){[IO.Path]::GetFullPath($OutputReport)}else{Join-Path $testRoot 'bundle-extractor-test-results.json'}
$reportFile=[IO.File]::Open($reportPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$reportBytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($report|ConvertTo-Json -Depth 8));$reportFile.Write($reportBytes,0,$reportBytes.Length)}finally{$reportFile.Dispose()}
$report | Select-Object total,passed,failed,powershell,test_root,extractor_sha256 | ConvertTo-Json
if($report.failed -ne 0) { $script:results | Where-Object {-not $_.pass} | ConvertTo-Json -Depth 6; exit 1 }
