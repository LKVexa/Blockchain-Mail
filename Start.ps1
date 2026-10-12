param([switch]$PrepareOnly)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
function Get-BundleHash([string]$Path){$stream=[IO.File]::OpenRead($Path);$hash=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$hash.Dispose()}}
function Assert-BundleFile([string]$Path){$attributes=[IO.File]::GetAttributes($Path);if(($attributes-band([IO.FileAttributes]::ReparsePoint-bor[IO.FileAttributes]::Directory))-ne0){throw 'An application component is redirected or not a file.'}}
try {
 $bundleRoot=[IO.Path]::GetFullPath($PSScriptRoot)
 $bundleCurrent=$bundleRoot
 while($bundleCurrent){if(([IO.File]::GetAttributes($bundleCurrent)-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'The application folder cannot be a shortcut or redirected folder.'};$bundleParent=[IO.Path]::GetDirectoryName($bundleCurrent);if(!$bundleParent-or$bundleParent-eq$bundleCurrent){break};$bundleCurrent=$bundleParent}
 $bundleIdentityFile=Join-Path $bundleRoot 'Bundle.json'
 Assert-BundleFile $bundleIdentityFile
 if((Get-Item -LiteralPath $bundleIdentityFile).Length-gt16384){throw 'Invalid bundle identity.'}
 $bundleIdentity=Get-Content -LiteralPath $bundleIdentityFile -Raw | ConvertFrom-Json
 if($bundleIdentity.format-cne'WORKSPACE391-WINDOWS-BUNDLE/1'-or$bundleIdentity.payload_sha256-cnotmatch'\A[a-f0-9]{64}\z'-or$bundleIdentity.extractor_sha256-cnotmatch'\A[a-f0-9]{64}\z'-or$bundleIdentity.launcher_sha256-cnotmatch'\A[a-f0-9]{64}\z'){throw 'Invalid application bundle.'}
 $bundleExtractor=Join-Path $bundleRoot 'Extract.cs'
 Assert-BundleFile $bundleExtractor
 if((Get-BundleHash $bundleExtractor)-cne$bundleIdentity.extractor_sha256){throw 'The preparation component is incomplete or changed.'}
 $bundlePayload=Join-Path $bundleRoot 'Payload.dat'
 Assert-BundleFile $bundlePayload
 if((Get-BundleHash $bundlePayload)-cne$bundleIdentity.payload_sha256){throw 'The application download is incomplete or changed. Download the complete ZIP again.'}
 Add-Type -TypeDefinition ([IO.File]::ReadAllText($bundleExtractor)) -ReferencedAssemblies @('System.dll','System.Core.dll','System.IO.Compression.dll','System.IO.Compression.FileSystem.dll')
 [Workspace391Bundle.Extract]::CheckDirectory($bundleRoot)
 $bundleSystem=Join-Path $bundleRoot 'system'
 if(Test-Path -LiteralPath $bundleSystem){
  [Workspace391Bundle.Extract]::CheckDirectory($bundleSystem)
  $bundleMarker=Join-Path $bundleSystem '.bundle-complete'
  if(!(Test-Path -LiteralPath $bundleMarker -PathType Leaf)-or([IO.File]::GetAttributes($bundleMarker)-band[IO.FileAttributes]::ReparsePoint)-ne0-or[IO.File]::ReadAllText($bundleMarker).Trim()-cne$bundleIdentity.payload_sha256){throw 'An existing system folder was preserved. Extract this download into a new empty folder to prepare a fresh application.'}
 }else{
  Write-Host 'Preparing Workspace391 for the first time. All application files are being checked.'
  $bundleProgress=$null;$bundleForm=$null
  if(!$PrepareOnly){
   Add-Type -AssemblyName System.Windows.Forms
   $bundleForm=New-Object Windows.Forms.Form;$bundleForm.Text='Opening Workspace391';$bundleForm.ClientSize=New-Object Drawing.Size(440,115);$bundleForm.StartPosition='CenterScreen';$bundleForm.FormBorderStyle='FixedDialog';$bundleForm.ControlBox=$false
   $bundleText=New-Object Windows.Forms.Label;$bundleText.Text='Preparing your application. This only happens on first opening.';$bundleText.SetBounds(20,20,400,40);$bundleForm.Controls.Add($bundleText)
   $bundleBar=New-Object Windows.Forms.ProgressBar;$bundleBar.SetBounds(20,75,400,16);$bundleBar.Style='Marquee';$bundleForm.Controls.Add($bundleBar);$bundleForm.Show();[Windows.Forms.Application]::DoEvents()
   $bundleProgress=[Action[int,int]]({param($done,$total)$bundleBar.Style='Continuous';$bundleBar.Value=[Math]::Min(100,[int](100.0*$done/$total));[Windows.Forms.Application]::DoEvents()}.GetNewClosure())
  }
  try{$bundleResult=[Workspace391Bundle.Extract]::Prepare($bundlePayload,$bundleSystem,$bundleIdentity.payload_sha256,[int]$bundleIdentity.payload_entries,$bundleProgress)}finally{if($bundleForm){$bundleForm.Close();$bundleForm.Dispose()}}
 }
 $bundleLauncher=Join-Path $bundleSystem 'Start-Workspace.ps1'
 Assert-BundleFile $bundleLauncher
 if((Get-BundleHash $bundleLauncher)-cne$bundleIdentity.launcher_sha256){throw 'The application launcher is incomplete or changed.'}
 if($PrepareOnly){[ordered]@{prepared=$true;root=$bundleSystem;payload_sha256=$bundleIdentity.payload_sha256;preserved_existing_state=$true} | ConvertTo-Json;exit 0}
 & $bundleLauncher
 exit $LASTEXITCODE
}catch {
 $bundleMessage=$_.Exception.GetBaseException().Message
 Write-Error -Message $bundleMessage -ErrorAction Continue
 if(!$PrepareOnly){Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.MessageBox]::Show($bundleMessage,'Workspace391',[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Error)|Out-Null}
 exit 1
}
