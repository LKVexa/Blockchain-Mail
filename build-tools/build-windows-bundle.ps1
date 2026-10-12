[CmdletBinding()]
param(
 [string]$ProjectRoot='',
 [string]$InnerPackage='dist/Workspace391-Free-Torus-Mail.zip',
 [string]$Output='dist/W391.zip',
 [string]$BundleSource=''
)
$ErrorActionPreference='Stop'
if(!$ProjectRoot){$ProjectRoot=Join-Path $PSScriptRoot '..'}
Set-StrictMode -Version Latest
if(!$BundleSource){$BundleSource=Join-Path $PSScriptRoot 'windows-bundle'}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskProject=[IO.Path]::GetFullPath($ProjectRoot)
function Resolve-ProjectPath([string]$Value){if([IO.Path]::IsPathRooted($Value)){return [IO.Path]::GetFullPath($Value)};return [IO.Path]::GetFullPath((Join-Path $taskProject $Value))}
$taskInnerPath=Resolve-ProjectPath $InnerPackage
$taskOutput=Resolve-ProjectPath $Output
$taskSource=[IO.Path]::GetFullPath($BundleSource)
if([IO.Path]::GetExtension($taskOutput)-ne'.zip'-or$taskOutput-eq$taskInnerPath){throw 'Choose a new outer ZIP file separate from the inner package.'}
if((Test-Path -LiteralPath $taskOutput)-or(Test-Path -LiteralPath ($taskOutput+'.sha256'))){throw 'The output or its checksum already exists; preserve it and choose another output.'}
function Assert-RegularBundleFile([string]$Path){
 $taskFull=[IO.Path]::GetFullPath($Path);$taskInfo=Get-Item -LiteralPath $taskFull
 if($taskInfo.PSIsContainer-or($taskInfo.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'A bundle input is redirected or is not a file.'}
 $taskParent=$taskInfo.Directory
 while($taskParent){if($taskParent.Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'A bundle input directory is redirected.'};$taskParent=$taskParent.Parent}
 return $taskFull
}
function Get-WindowsBundleHash([string]$Path){$stream=[IO.File]::OpenRead((Assert-RegularBundleFile $Path));$hash=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$hash.Dispose()}}
$taskInner=[IO.Compression.ZipFile]::OpenRead((Assert-RegularBundleFile $taskInnerPath))
try{
 $taskLauncher=$taskInner.GetEntry('Workspace391/Start-Workspace.ps1');if(!$taskLauncher){throw 'The bundled application launcher is missing.'}
 $taskRead=$taskLauncher.Open();$taskHasher=[Security.Cryptography.SHA256]::Create()
 try{$taskLauncherHash=[BitConverter]::ToString($taskHasher.ComputeHash($taskRead)).Replace('-','').ToLowerInvariant()}finally{$taskRead.Dispose();$taskHasher.Dispose()}
 $taskEntries=$taskInner.Entries.Count
}finally{$taskInner.Dispose()}
$taskIdentity=[ordered]@{format='WORKSPACE391-WINDOWS-BUNDLE/1';payload_sha256=(Get-WindowsBundleHash $taskInnerPath);payload_entries=$taskEntries;extractor_sha256=(Get-WindowsBundleHash (Join-Path $taskSource 'Extract.cs'));launcher_sha256=$taskLauncherHash}
# Generate identity directly into the ZIP; build sources stay unchanged.
$taskIdentityBytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($taskIdentity|ConvertTo-Json))
$taskFileMap=[ordered]@{'Extract.cs'=(Join-Path $taskSource 'Extract.cs');'Start.ps1'=(Join-Path $taskSource 'Start.ps1');'Start-Workspace.cmd'=(Join-Path $taskSource 'Start-Workspace.cmd');'Open Workspace.vbs'=(Join-Path $taskSource 'Open Workspace.vbs');'READ-ME.txt'=(Join-Path $taskSource 'READ-ME.txt');'Payload.dat'=$taskInnerPath}
foreach($taskInputPath in $taskFileMap.Values){$null=Assert-RegularBundleFile $taskInputPath}
$taskOutputParent=Split-Path -Parent $taskOutput
if(!(Test-Path -LiteralPath $taskOutputParent -PathType Container)){[void][IO.Directory]::CreateDirectory($taskOutputParent)}
$taskParentInfo=Get-Item -LiteralPath $taskOutputParent
while($taskParentInfo){if($taskParentInfo.Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'The output directory is redirected.'};$taskParentInfo=$taskParentInfo.Parent}
$taskOutputStream=[IO.File]::Open($taskOutput,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$taskOuter=$null
try{
 $taskOuter=New-Object IO.Compression.ZipArchive($taskOutputStream,[IO.Compression.ZipArchiveMode]::Create,$false)
 $taskIdentityEntry=$taskOuter.CreateEntry('W391/Bundle.json',[IO.Compression.CompressionLevel]::Optimal);$taskIdentityStream=$taskIdentityEntry.Open()
 try{$taskIdentityStream.Write($taskIdentityBytes,0,$taskIdentityBytes.Length)}finally{$taskIdentityStream.Dispose()}
 foreach($taskPair in $taskFileMap.GetEnumerator()){
  $taskName='W391/'+$taskPair.Key;if($taskName.Length-gt40){throw 'The Windows download contains a long outer path.'}
  $taskCompression=if($taskPair.Key-eq'Payload.dat'){[IO.Compression.CompressionLevel]::NoCompression}else{[IO.Compression.CompressionLevel]::Optimal}
  $taskEntry=$taskOuter.CreateEntry($taskName,$taskCompression);$taskInput=[IO.File]::OpenRead($taskPair.Value);$taskDestination=$taskEntry.Open()
  try{$taskInput.CopyTo($taskDestination)}finally{$taskInput.Dispose();$taskDestination.Dispose()}
 }
}finally{if($taskOuter){$taskOuter.Dispose()};$taskOutputStream.Dispose()}
$taskZipHash=Get-WindowsBundleHash $taskOutput
$taskChecksum=[IO.File]::Open(($taskOutput+'.sha256'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$taskHashBytes=(New-Object Text.UTF8Encoding($false)).GetBytes($taskZipHash+'  '+[IO.Path]::GetFileName($taskOutput)+"`n");$taskChecksum.Write($taskHashBytes,0,$taskHashBytes.Length)}finally{$taskChecksum.Dispose()}
[ordered]@{package=$taskOutput;sha256=$taskZipHash;zip_entries=($taskFileMap.Count+1);maximum_entry_path_characters=24;application_files_preserved=$taskEntries;build_sources_changed=$false}|ConvertTo-Json