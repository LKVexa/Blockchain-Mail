[CmdletBinding()]
param(
 [string]$ProjectRoot='',
 [string]$Output='dist/Workspace391-Free-Torus-Mail.zip',
 [string]$VerificationReport='docs/release/Workspace391-Free-Torus-Verification.json',
 [string]$SetupGuide='docs/release/Private-Mail-Setup.html',
 [string[]]$AdditionalFiles=@(),
 [switch]$ValidateOnly
)
$ErrorActionPreference='Stop'
if(!$ProjectRoot){$ProjectRoot=Join-Path $PSScriptRoot '..'}
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskProject=[IO.Path]::GetFullPath($ProjectRoot)
function Resolve-ProjectPath([string]$Value){if([IO.Path]::IsPathRooted($Value)){return [IO.Path]::GetFullPath($Value)};return [IO.Path]::GetFullPath((Join-Path $taskProject $Value))}
$taskPackage=Resolve-ProjectPath $Output
$taskReport=Resolve-ProjectPath $VerificationReport
$taskGuide=Resolve-ProjectPath $SetupGuide
if([IO.Path]::GetExtension($taskPackage)-ne'.zip'){throw 'Output must be a new ZIP file.'}
if((Test-Path -LiteralPath $taskPackage)-or(Test-Path -LiteralPath ($taskPackage+'.sha256'))){throw 'The output or its checksum already exists; preserve it and choose another output.'}

function Assert-PackageName([string]$Name){
 if(!$Name-or$Name.Contains('\')-or$Name.Contains(':')-or[IO.Path]::IsPathRooted($Name)-or$Name-match'(^|/)\.{1,2}(/|$)'-or$Name-match'(^|/)(state|network-state|work)(/|$)'-or$Name.StartsWith('console/workspace/',[StringComparison]::OrdinalIgnoreCase)-or$Name-match'(^|/)evidence/runs(/|$)'){throw 'Unsafe, mutable or private package path.'}
 foreach($taskPart in $Name.Split('/')){if(!$taskPart-or$taskPart-match'[<>:"|?*\x00-\x1f]'-or$taskPart-match'[ .]$'-or$taskPart-match'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)'-or$taskPart-match'^(hs_ed25519_secret_key|control_auth_cookie|workspace-owner\.lock|peer-endpoint\.json|server\.lock|listener\.json)$'-or$taskPart-match'\.secret\.json$|\.workspace-key\.json$|\.sqlite(?:[.-].*)?$|^\.env(?:\.|$)'){throw 'Unsafe or private package filename.'}}
}
function Assert-RegularFile([string]$File){
 $taskResolved=[IO.Path]::GetFullPath($File)
 $taskInfo=Get-Item -LiteralPath $taskResolved
 if($taskInfo.PSIsContainer-or($taskInfo.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'A packaged source is redirected or is not a file.'}
 $taskParent=$taskInfo.Directory
 while($null-ne$taskParent){if($taskParent.Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'A packaged source directory is redirected.'};$taskParent=$taskParent.Parent}
 return $taskResolved
}
function Get-PackageHash([string]$File){
 $taskInput=[IO.File]::OpenRead($File);$taskDigest=[Security.Cryptography.SHA256]::Create()
 try{return [BitConverter]::ToString($taskDigest.ComputeHash($taskInput)).Replace('-','').ToLowerInvariant()}finally{$taskInput.Dispose();$taskDigest.Dispose()}
}
$taskFiles=New-Object 'Collections.Generic.Dictionary[string,string]' ([StringComparer]::OrdinalIgnoreCase)
$taskExpected=New-Object 'Collections.Generic.Dictionary[string,string]' ([StringComparer]::OrdinalIgnoreCase)
function Add-PackageSource([string]$Name,[string]$File,[string]$Expected=''){
 Assert-PackageName $Name
 $taskResolved=Assert-RegularFile $File
 if($taskFiles.ContainsKey($Name)){
  if($taskFiles[$Name]-cne$taskResolved){throw 'Duplicate package name refers to another source.'}
 }else{$taskFiles.Add($Name,$taskResolved)}
 if($Expected){if($Expected-notmatch'^[a-f0-9]{64}$'){throw 'Invalid sealed source hash.'};if($taskExpected.ContainsKey($Name)-and$taskExpected[$Name]-cne$Expected){throw 'Launch and app seals disagree.'};$taskExpected[$Name]=$Expected}
}
$taskManifest=Get-Content -LiteralPath (Join-Path $taskProject 'INTEGRATED_BUILD.json') -Raw | ConvertFrom-Json
foreach($taskItem in $taskManifest.launch_files){Add-PackageSource $taskItem.path (Join-Path $taskProject $taskItem.path) $taskItem.sha256}
foreach($taskLine in [IO.File]::ReadAllLines((Join-Path $taskProject 'app\SHA256SUMS.txt'))){
 if($taskLine-notmatch'^([a-f0-9]{64})  (.+)$'){throw 'Invalid app manifest.'}
 $taskDigest=$Matches[1];$taskRelative='app/'+$Matches[2];Add-PackageSource $taskRelative (Join-Path $taskProject $taskRelative) $taskDigest
}
foreach($taskName in @('INTEGRATED_BUILD.json','app/SHA256SUMS.txt','PRIVATE-MAIL.txt','READ-ME.txt','PROTECTION_STATUS.json')){Add-PackageSource $taskName (Join-Path $taskProject $taskName)}
foreach($taskName in $AdditionalFiles){Add-PackageSource $taskName (Join-Path $taskProject $taskName)}
Add-PackageSource 'Private-Mail-Setup.html' $taskGuide
Add-PackageSource 'Workspace391-Free-Torus-Verification.json' $taskReport
$null=Get-Content -LiteralPath $taskReport -Raw | ConvertFrom-Json
$taskNames=@($taskFiles.Keys | Sort-Object)
foreach($taskName in $taskNames){
 $taskActual=Get-PackageHash $taskFiles[$taskName]
 if($taskExpected.ContainsKey($taskName)-and$taskActual-cne$taskExpected[$taskName]){throw ('Source does not match its seal: '+$taskName)}
 $taskExpected[$taskName]=$taskActual
}
if($ValidateOnly){[ordered]@{status='VALIDATED';output=$taskPackage;verification_report=$taskReport;payload_files=$taskNames.Count;private_state_included=$false;output_created=$false}|ConvertTo-Json;return}

$taskOutputParent=Split-Path -Parent $taskPackage
if(!(Test-Path -LiteralPath $taskOutputParent -PathType Container)){[void][IO.Directory]::CreateDirectory($taskOutputParent)}
$taskParentInfo=Get-Item -LiteralPath $taskOutputParent
while($null-ne$taskParentInfo){if($taskParentInfo.Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'The output directory is redirected.'};$taskParentInfo=$taskParentInfo.Parent}
$taskChecksums=New-Object 'Collections.Generic.List[string]'
$taskStream=[IO.File]::Open($taskPackage,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$taskZip=$null;$taskBytes=0L
try{
 $taskZip=New-Object IO.Compression.ZipArchive($taskStream,[IO.Compression.ZipArchiveMode]::Create,$false)
 foreach($taskName in $taskNames){
  $taskFile=Assert-RegularFile $taskFiles[$taskName]
  $taskEntry=$taskZip.CreateEntry(('Workspace391/'+$taskName),[IO.Compression.CompressionLevel]::Optimal)
  $taskInput=[IO.File]::OpenRead($taskFile);$taskEntryStream=$taskEntry.Open();$taskHasher=[Security.Cryptography.SHA256]::Create();$taskBuffer=New-Object byte[] (1024*1024)
  try{
   while(($taskCount=$taskInput.Read($taskBuffer,0,$taskBuffer.Length))-gt0){$taskEntryStream.Write($taskBuffer,0,$taskCount);[void]$taskHasher.TransformBlock($taskBuffer,0,$taskCount,$taskBuffer,0);$taskBytes+=$taskCount}
   [void]$taskHasher.TransformFinalBlock((New-Object byte[] 0),0,0)
   $taskActual=[BitConverter]::ToString($taskHasher.Hash).Replace('-','').ToLowerInvariant()
   if($taskActual-cne$taskExpected[$taskName]){throw ('Source changed while packaging: '+$taskName)}
   $taskChecksums.Add($taskActual+'  '+$taskName)
  }finally{$taskInput.Dispose();$taskEntryStream.Dispose();$taskHasher.Dispose()}
 }
 $taskEntry=$taskZip.CreateEntry('Workspace391/SHA256SUMS.txt',[IO.Compression.CompressionLevel]::Optimal)
 $taskWriter=New-Object IO.StreamWriter($taskEntry.Open(),(New-Object Text.UTF8Encoding($false)))
 try{$taskWriter.Write(($taskChecksums -join "`n")+"`n")}finally{$taskWriter.Dispose()}
}finally{if($null-ne$taskZip){$taskZip.Dispose()};$taskStream.Dispose()}
$taskHash=Get-PackageHash $taskPackage
$taskChecksum=[IO.File]::Open(($taskPackage+'.sha256'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$taskHashBytes=(New-Object Text.UTF8Encoding($false)).GetBytes($taskHash+'  '+[IO.Path]::GetFileName($taskPackage)+"`n");$taskChecksum.Write($taskHashBytes,0,$taskHashBytes.Length)}finally{$taskChecksum.Dispose()}
[ordered]@{package=$taskPackage;sha256=$taskHash;verification_report=$taskReport;files=$taskChecksums.Count+1;input_bytes=$taskBytes;zip_bytes=(Get-Item -LiteralPath $taskPackage).Length;private_state_included=$false}|ConvertTo-Json
