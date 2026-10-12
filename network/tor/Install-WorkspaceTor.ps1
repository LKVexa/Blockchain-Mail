param(
    [Parameter(Mandatory=$true)][string]$BundlePath,
    [Parameter(Mandatory=$true)][string]$SignaturePath,
    [Parameter(Mandatory=$true)][string]$KeyringPath,
    [string]$WorkspaceRoot=(Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
    [switch]$UseGpg,
    [string]$NodePath,
    [string]$GpgvPath,
    [string]$GpgPath
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Workspace-Tor.ps1')
$taskFingerprint='EF6E286DDA85EA2A4BA7DE684E2C6E8793298290'
$taskRuntime=Get-WorkspaceTorContainedPath $WorkspaceRoot 'network\tor\runtime'
$taskRecord=Get-WorkspaceTorContainedPath $WorkspaceRoot 'network\tor\verified-runtime.json'
if((Test-Path -LiteralPath $taskRuntime)-or(Test-Path -LiteralPath $taskRecord)){throw 'The verified Tor runtime already exists. Preserve it and use a separate staging workspace for an upgrade.'}
foreach($taskInput in @($BundlePath,$SignaturePath,$KeyringPath)){if(!(Test-Path -LiteralPath $taskInput -PathType Leaf)){throw 'A local Tor bundle, detached signature, and signing-key file are required.'}}
if((Get-Item -LiteralPath $BundlePath).Length-gt100MB-or(Get-Item -LiteralPath $SignaturePath).Length-gt64KB-or(Get-Item -LiteralPath $KeyringPath).Length-gt1MB){throw 'Tor verification inputs exceed their size limits.'}
if($UseGpg){
    if(!$GpgvPath){$GpgvPath=(Get-Command gpgv.exe -ErrorAction Stop).Source}
    if(!$GpgPath){$GpgPath=(Get-Command gpg.exe -ErrorAction Stop).Source}
}elseif(!$NodePath){$NodePath=Get-WorkspaceTorContainedPath $WorkspaceRoot 'runtime\node.exe'}
$taskTar=(Get-Command tar.exe -ErrorAction Stop).Source
$taskStage=Get-WorkspaceTorContainedPath $WorkspaceRoot ('network-state\tor-install-'+[Guid]::NewGuid().ToString('N'))
Set-WorkspaceTorPrivateDirectory $taskStage
$taskInstalled=$false
try{
    $taskOriginalBundleName=Split-Path -Leaf $BundlePath
    $taskInputs=@(@($BundlePath,'bundle.tar.gz'),@($SignaturePath,'bundle.tar.gz.asc'),@($KeyringPath,'tor.keyring'))
    foreach($taskInput in $taskInputs){Copy-Item -LiteralPath $taskInput[0] -Destination (Join-Path $taskStage $taskInput[1])}
    $BundlePath=Join-Path $taskStage 'bundle.tar.gz';$SignaturePath=Join-Path $taskStage 'bundle.tar.gz.asc';$KeyringPath=Join-Path $taskStage 'tor.keyring'
    if($UseGpg){
        $taskGpgHome=Join-Path $taskStage 'gnupg';Set-WorkspaceTorPrivateDirectory $taskGpgHome
        $taskKeys=@(& $GpgPath --batch --no-options --homedir $taskGpgHome --with-colons --show-keys --fingerprint -- $KeyringPath 2>$null)
        if($LASTEXITCODE-ne0){throw 'The Tor signing key could not be inspected.'}
        $taskPrimaryFingerprint=$null
        foreach($taskLine in $taskKeys){$taskFields=$taskLine-split':';if($taskFields[0]-eq'fpr'){$taskPrimaryFingerprint=$taskFields[9];break}}
        if($taskPrimaryFingerprint-ne$taskFingerprint){throw 'The signing key does not match the published Tor Browser Developers fingerprint.'}
        $taskStatus=@(& $GpgvPath --homedir $taskGpgHome --status-fd 1 --keyring ([IO.Path]::GetFullPath($KeyringPath)) -- ([IO.Path]::GetFullPath($SignaturePath)) ([IO.Path]::GetFullPath($BundlePath)) 2>$null)
        if($LASTEXITCODE-ne0){throw 'The Tor bundle detached signature failed verification.'}
        $taskValid=@($taskStatus|Where-Object {$_-match'^\[GNUPG:\] VALIDSIG '})
        if($taskValid.Count-ne1-or$taskValid[0]-notmatch('(?:^| )'+$taskFingerprint+'$')){throw 'The Tor signature was not made by the expected signing-key family.'}
        $taskVerifier='GnuPG';$taskVerification=$null
    }else{
        $taskVerificationLines=@(& $NodePath (Join-Path $PSScriptRoot 'Verify-TorBundle.mjs') $BundlePath $SignaturePath $KeyringPath)
        if($LASTEXITCODE-ne0-or$taskVerificationLines.Count-ne1){throw 'The Tor bundle detached signature failed strict verification.'}
        $taskVerification=$taskVerificationLines[0]|ConvertFrom-Json
        if($taskVerification.signature_verified-ne$true-or$taskVerification.signature_primary_fingerprint-ne$taskFingerprint){throw 'The Tor signature was not made by the expected signing-key family.'}
        $taskVerifier=$taskVerification.verification_tool
    }
    $taskEntries=@(& $taskTar -tf $BundlePath);if($LASTEXITCODE-ne0-or!$taskEntries.Count-or$taskEntries.Count-gt1024){throw 'The Tor archive inventory is invalid.'}
    foreach($taskEntry in $taskEntries){
        $taskName=$taskEntry.TrimEnd('/')-replace'^\./',''
        if(!$taskName-or$taskName-notmatch'^[A-Za-z0-9_./-]+$'-or$taskName-match'(^|/)\.\.(/|$)'-or$taskName.StartsWith('/')){throw 'The Tor archive contains an unsafe path.'}
    }
    $taskVerbose=@(& $taskTar -tvf $BundlePath);if($LASTEXITCODE-ne0-or@($taskVerbose|Where-Object {$_-notmatch'^[-d]'}).Count){throw 'The Tor archive contains links or unsupported entries.'}
    $taskExtract=Join-Path $taskStage 'payload';$null=[IO.Directory]::CreateDirectory($taskExtract)
    & $taskTar -xzf $BundlePath -C $taskExtract;if($LASTEXITCODE-ne0){throw 'The verified Tor archive could not be extracted.'}
    $taskExecutable=Get-WorkspaceTorContainedPath $taskExtract 'tor\tor.exe'
    if(!(Test-Path -LiteralPath $taskExecutable -PathType Leaf)){throw 'The signed archive does not contain the expected Windows Tor executable.'}
    $taskFiles=@(Get-ChildItem -LiteralPath $taskExtract -Recurse -File -Force)
    if(!$taskFiles.Count-or$taskFiles.Count-gt1024-or($taskFiles|Measure-Object Length -Sum).Sum-gt500MB){throw 'The extracted Tor runtime exceeds its limits.'}
    $taskRecords=@()
    foreach($taskFile in $taskFiles){
        if($taskFile.Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'A linked Tor runtime file was refused.'}
        $taskRecords+=[pscustomobject]@{path=$taskFile.FullName.Substring($taskExtract.Length+1).Replace('\','/');bytes=$taskFile.Length;sha256=(Get-WorkspaceTorSha256 $taskFile.FullName)}
    }
    $taskMetadata=[ordered]@{version=1;signature_primary_fingerprint=$taskFingerprint;signature_verified=$true;verification_tool=$taskVerifier;verification=$taskVerification;bundle_name=$taskOriginalBundleName;bundle_sha256=(Get-WorkspaceTorSha256 $BundlePath);signature_sha256=(Get-WorkspaceTorSha256 $SignaturePath);keyring_sha256=(Get-WorkspaceTorSha256 $KeyringPath);verified_utc=[DateTime]::UtcNow.ToString('o');files=@($taskRecords|Sort-Object path)}
    # Both destinations have been resolved inside the named workspace. Existing
    # runtimes are never replaced, and no supplied executable is run here.
    $null=[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($taskRuntime))
    Move-Item -LiteralPath $taskExtract -Destination $taskRuntime
    [IO.File]::WriteAllText($taskRecord,($taskMetadata|ConvertTo-Json -Depth 5),(New-Object Text.UTF8Encoding($false)))
    $null=Assert-WorkspaceTorRuntime $WorkspaceRoot
    $taskInstalled=$true
    [pscustomobject]@{installed=$true;runtime=$taskRuntime;manifest=$taskRecord;files=$taskRecords.Count;bundle_sha256=$taskMetadata.bundle_sha256;signing_fingerprint=$taskFingerprint}|ConvertTo-Json -Compress
}finally{
    # Only this freshly created, checked staging directory is removed. The
    # installed runtime, caller inputs, and persistent onion identity survive.
    $taskBase=[IO.Path]::GetFullPath($WorkspaceRoot).TrimEnd('\')
    $taskChecked=Get-WorkspaceTorContainedPath $WorkspaceRoot ($taskStage.Substring($taskBase.Length+1))
    if($taskChecked-eq$taskStage-and(Test-Path -LiteralPath $taskStage)){Remove-Item -LiteralPath $taskStage -Recurse -Force}
}
