param([string]$Root)
$ErrorActionPreference='Stop'
if([string]::IsNullOrWhiteSpace($Root)){ $Root=Split-Path -Parent $PSScriptRoot }
$Root=[IO.Path]::GetFullPath($Root)
$Version=(Get-Content -LiteralPath (Join-Path $Root 'VERSION') -Raw -Encoding UTF8).Trim()
if($Version -ne '9.8.7'){ throw "Expected JA21 9.8.7, found '$Version'." }
$Workspace=if([string]::IsNullOrWhiteSpace($env:JA21_PORTABLE_ROOT)){Join-Path $Root 'workspace'}else{[IO.Path]::GetFullPath($env:JA21_PORTABLE_ROOT)}
if(!(Test-Path -LiteralPath $Workspace -PathType Container)){ throw "Portable workspace does not exist: $Workspace" }
$SnapshotDir=Join-Path $Workspace 'snapshots'; New-Item -ItemType Directory -Force -Path $SnapshotDir|Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$ExcludeTop=@('cache','temp','snapshots')
$files=@(Get-ChildItem -LiteralPath $Workspace -Recurse -Force -File | Where-Object {
  $rel=$_.FullName.Substring($Workspace.Length).TrimStart('\','/');
  $top=($rel -split '[\\/]')[0];
  $ExcludeTop -notcontains $top
} | Sort-Object FullName)
function Get-Sha256([string]$Path){
  $sha=[Security.Cryptography.SHA256]::Create(); try{$fs=[IO.File]::OpenRead($Path); try{return ([BitConverter]::ToString($sha.ComputeHash($fs))).Replace('-','').ToLowerInvariant()}finally{$fs.Dispose()}}finally{$sha.Dispose()}
}
$inventory=New-Object System.Collections.Generic.List[object]
foreach($f in $files){
  $rel=$f.FullName.Substring($Workspace.Length).TrimStart('\','/').Replace('\','/')
  $inventory.Add([ordered]@{path=$rel;bytes=[int64]$f.Length;sha256=(Get-Sha256 $f.FullName)})
}
$canonical=($inventory | ForEach-Object { $_.path+'|'+$_.bytes+'|'+$_.sha256 }) -join "`n"
$sha=[Security.Cryptography.SHA256]::Create(); try{$contentId=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
$manifest=[ordered]@{
 schema='JA21/PORTABLE_WORKSPACE_SNAPSHOT/1'; application_version=$Version; content_id=$contentId;
 excludes=$ExcludeTop; file_count=$inventory.Count; files=$inventory;
 fabric_claim='HOST_MEDIATED_PLACEMENT_ONLY'; fabric_verdict=$null;
 note='Close JA21 before snapshotting to avoid locked/in-flight WebView2 profile files. cache/temp/prior snapshots are intentionally excluded.'
}
$manifestJson=$manifest|ConvertTo-Json -Depth 8
$out=Join-Path $SnapshotDir ('JA21-Workspace-'+$Version+'-'+$contentId.Substring(0,16)+'.zip')
if(Test-Path -LiteralPath $out){ Remove-Item -LiteralPath $out -Force }
$fs=[IO.File]::Open($out,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try{
 $zip=New-Object IO.Compression.ZipArchive($fs,[IO.Compression.ZipArchiveMode]::Create,$true)
 try{
   foreach($f in $files){
     $rel=$f.FullName.Substring($Workspace.Length).TrimStart('\','/').Replace('\','/')
     $entry=$zip.CreateEntry($rel,[IO.Compression.CompressionLevel]::Optimal); $entry.LastWriteTime=[DateTimeOffset]::new(2000,1,1,0,0,0,[TimeSpan]::Zero)
     $src=[IO.File]::OpenRead($f.FullName); try{$dst=$entry.Open(); try{$src.CopyTo($dst)}finally{$dst.Dispose()}}finally{$src.Dispose()}
   }
   $me=$zip.CreateEntry('SNAPSHOT_MANIFEST.json',[IO.Compression.CompressionLevel]::Optimal); $me.LastWriteTime=[DateTimeOffset]::new(2000,1,1,0,0,0,[TimeSpan]::Zero)
   $sw=New-Object IO.StreamWriter($me.Open(),(New-Object Text.UTF8Encoding($false))); try{$sw.Write($manifestJson)}finally{$sw.Dispose()}
 }finally{$zip.Dispose()}
}finally{$fs.Dispose()}
$manifestPath=$out+'.manifest.json'; [IO.File]::WriteAllText($manifestPath,$manifestJson,(New-Object Text.UTF8Encoding($false)))
Write-Host 'JA21 portable workspace snapshot complete.' -ForegroundColor Green
Write-Host ('Content ID: '+$contentId)
Write-Host ('Files: '+$inventory.Count)
Write-Host ('Snapshot: '+$out)
Write-Host ('Manifest: '+$manifestPath)
