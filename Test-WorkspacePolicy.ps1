param([Parameter(Mandatory=$true)][string]$EvidencePath, [string]$CompanionRoot)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($CompanionRoot)) { $CompanionRoot = $PSScriptRoot }
$CompanionRoot = [IO.Path]::GetFullPath($CompanionRoot)
. (Join-Path $PSScriptRoot 'Workspace-Policy.ps1')
$workspaceChecks = New-Object 'System.Collections.Generic.List[object]'
function Check-Workspace([string]$Name,[scriptblock]$Action,[bool]$Expected=$true) {
    $workspaceActual=$false;$workspaceReason=$null
    try { $null=& $Action;$workspaceActual=$true } catch { $workspaceReason=$_.Exception.GetBaseException().Message }
    [void]$workspaceChecks.Add([ordered]@{name=$Name;passed=($workspaceActual-eq$Expected);skipped=$false;reason=$(if($workspaceActual-eq$Expected){$null}else{$workspaceReason})})
}
function Skip-Workspace([string]$Name,[string]$Reason) { [void]$workspaceChecks.Add([ordered]@{name=$Name;passed=$false;skipped=$true;reason=$Reason}) }
foreach($workspacePort in @('8787','2525','80','1','65535')) { Check-Workspace "Accept port $workspacePort" { ConvertTo-WorkspacePort $workspacePort 'Port' } }
foreach($workspacePort in @('0','-1','+1','08','65536','1.0',' 8787','8787 ','8787;whoami','example','')) { Check-Workspace "Reject port $workspacePort" { ConvertTo-WorkspacePort $workspacePort 'Port' } $false }
Check-Workspace 'Origin uses only the literal loopback host' { if((Get-WorkspaceOrigin '8787') -cne 'http://127.0.0.1:8787'){throw 'Origin mismatch'} }
Check-Workspace 'Port80 retains the explicit ready-contract port' { if((Get-WorkspaceOrigin '80') -cne 'http://127.0.0.1:80'){throw 'Origin mismatch'} }
Check-Workspace 'Contained package path' { $workspacePath=Get-WorkspaceContainedPath $PSScriptRoot 'test-fixture\state';if(!$workspacePath.StartsWith($PSScriptRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Path mismatch'} }
foreach($workspacePath in @('..\escape','state\..\escape','C:\Windows\win.ini','\\server\file','state:stream','')) { Check-Workspace "Reject package escape $workspacePath" { Get-WorkspaceContainedPath $PSScriptRoot $workspacePath } $false }
Check-Workspace 'Windows argument quoting handles a trailing slash' { if((ConvertTo-WorkspaceArgument 'C:\Space Name\') -cne '"C:\Space Name\\"'){throw 'Quote mismatch'} }
Check-Workspace 'Windows argument quoting escapes literal quotes' { if((ConvertTo-WorkspaceArgument 'a"b') -cne '"a\"b"'){throw 'Quote mismatch'} }
Check-Workspace 'Windows argument quoting preserves dollar/backtick literals' { if((ConvertTo-WorkspaceArgument 'literal$()`x') -cne '"literal$()`x"'){throw 'Quote mismatch'} }
Check-Workspace 'Windows argument quoting rejects controls' { ConvertTo-WorkspaceArgument "a`nb" } $false
$workspaceReady=[pscustomobject]@{version='3.9.1-local.1';event='ready';pid=123;http='http://127.0.0.1:8787';runId='0123456789abcdef0123456789abcdef';protected=$true}
Check-Workspace 'Matching protected startup record' { Assert-WorkspaceReadyRecord $workspaceReady 123 'http://127.0.0.1:8787' '3.9.1-local.1' }
Check-Workspace 'Wrong startup PID' { Assert-WorkspaceReadyRecord $workspaceReady 999 'http://127.0.0.1:8787' '3.9.1-local.1' } $false
Check-Workspace 'Wrong startup origin' { Assert-WorkspaceReadyRecord $workspaceReady 123 'http://example.invalid:8787' '3.9.1-local.1' } $false
Check-Workspace 'Wrong startup release' { Assert-WorkspaceReadyRecord $workspaceReady 123 'http://127.0.0.1:8787' 'other' } $false
Check-Workspace 'Plaintext server startup refused' { $workspacePlain=[pscustomobject]@{version='3.9.1-local.1';event='ready';pid=123;http='http://127.0.0.1:8787';runId='0123456789abcdef0123456789abcdef';protected=$false};Assert-WorkspaceReadyRecord $workspacePlain 123 'http://127.0.0.1:8787' '3.9.1-local.1' } $false
Check-Workspace 'Missing protected startup record field refused' { Assert-WorkspaceReadyRecord ([pscustomobject]@{version=1}) 123 'http://127.0.0.1:8787' '3.9.1-local.1' } $false
Check-Workspace 'Matching protected health record' { Assert-WorkspaceHealthRecord ([pscustomobject]@{ok=$true;protocol=1;protected=$true;version=$workspaceReady.version;runId=$workspaceReady.runId}) $workspaceReady }
Check-Workspace 'Unrelated protected health run refused' { Assert-WorkspaceHealthRecord ([pscustomobject]@{ok=$true;protocol=1;protected=$true;version=$workspaceReady.version;runId='another'}) $workspaceReady } $false
Check-Workspace 'Ordered ASCII recovery words normalized' { $workspaceWords=ConvertFrom-WorkspaceRecovery '  ONE Two Three Four  ';if(($workspaceWords -join ' ')-cne'one two three four'){throw 'Recovery normalization mismatch'} }
foreach($workspaceWords in @('one two three','one two three four five','one two th3ee four','one two thrée four')) { Check-Workspace 'Malformed recovery refused' { ConvertFrom-WorkspaceRecovery $workspaceWords } $false }
Check-Workspace 'Unicode lowercase alias is refused before normalization' { ConvertFrom-WorkspaceRecovery ('one two '+[char]0x212A+'ey four') } $false
Check-Workspace 'Separate canonical drive recovery path is accepted' { Get-WorkspaceExternalRecoveryPath $PSScriptRoot (Join-Path (Split-Path -Parent $PSScriptRoot) 'recovery-fixture-not-written.workspace-key.json') }
Check-Workspace 'Existing package directory cannot receive recovery file' { Get-WorkspaceExternalRecoveryPath $PSScriptRoot (Join-Path $PSScriptRoot 'recovery-fixture-not-written.json') } $false
Check-Workspace 'Unknown or short-name directory spelling is refused' { Get-WorkspaceCanonicalDirectory (Join-Path (Split-Path -Parent $PSScriptRoot) 'LAUNCH~9') } $false
foreach($workspaceKeyPath in @('C:\Package\recovery.json','C:\Package\..\Separate\recovery.json','C:\Separate.\recovery.json','C:\Separate \recovery.json','C:\Separate\key.json:stream','C:\Separate\CON.json','\\server\share\key.json','\\?\C:\Separate\key.json','C:/Separate/key.json')) { Check-Workspace "Recovery alias or package path refused: $workspaceKeyPath" { Get-WorkspaceExternalRecoveryPath 'C:\Package' $workspaceKeyPath } $false }
Check-Workspace 'Recovery reparse ancestor rejected with controlled filesystem metadata' {
    # This pure fixture supplies only metadata; no OS junction is created and no
    # existing file/host configuration is changed by the test.
    function Test-Path { param([string]$LiteralPath) return $LiteralPath-eq'C:\Separate' }
    function Get-Item { param([string]$LiteralPath,[switch]$Force) return [pscustomobject]@{Attributes=[IO.FileAttributes]::Directory-bor[IO.FileAttributes]::ReparsePoint} }
    function Get-WorkspaceCanonicalDirectory { param([string]$Directory) return $Directory }
    try { $workspaceRejected=$false;try{$null=Get-WorkspaceExternalRecoveryPath 'C:\Package' 'C:\Separate\key.json'}catch{$workspaceRejected=$true};if(!$workspaceRejected){throw 'Recovery reparse ancestor accepted'} }
    finally { Remove-Item Function:\Test-Path;Remove-Item Function:\Get-Item;Remove-Item Function:\Get-WorkspaceCanonicalDirectory }
}
Check-Workspace 'Child environment denies inherited hooks' { $workspaceEnv=Get-WorkspaceChildEnvironment @{Path='C:\Windows';NODE_OPTIONS='--require bad';JA21_ALLOW_ANY_FILE='1';WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-web-security';HTTP_PROXY='http://public.invalid';VEXA127_STATE='C:\unrelated'} 'C:\Package\console' 'http://127.0.0.1:8787' 'synthetic-session';if($workspaceEnv.ContainsKey('NODE_OPTIONS')-or$workspaceEnv.ContainsKey('HTTP_PROXY')-or$workspaceEnv.ContainsKey('VEXA127_STATE')){throw 'Inherited hook retained'};if($workspaceEnv.JA21_ALLOW_ANY_FILE-ne'0'-or$workspaceEnv.JA21_CONSOLE_ORIGINS-cne'http://127.0.0.1:8787'-or$workspaceEnv.Path-cne'C:\Windows'){throw 'Child environment mismatch'} }
Check-Workspace 'Only matching owned process qualifies for cleanup' { $workspaceStart=[datetime]'2026-10-11T00:00:00Z';$workspaceFake=[pscustomobject]@{HasExited=$false;Id=123;StartTime=$workspaceStart};if(!(Test-WorkspaceOwnedProcess $workspaceFake 123 $workspaceStart.ToUniversalTime())){throw 'Owned process mismatch'};if(Test-WorkspaceOwnedProcess $workspaceFake 124 $workspaceStart.ToUniversalTime()){throw 'Unrelated PID accepted'};$workspaceFake.HasExited=$true;if(Test-WorkspaceOwnedProcess $workspaceFake 123 $workspaceStart.ToUniversalTime()){throw 'Exited process accepted'} }
foreach($workspaceScript in @('Start-Workspace.ps1','Workspace-Policy.ps1','Test-WorkspacePolicy.ps1')){Check-Workspace "PowerShell AST parses $workspaceScript" {$workspaceTokens=$null;$workspaceParseErrors=$null;$workspaceScriptRoot=if($workspaceScript -eq 'Start-Workspace.ps1'){$CompanionRoot}else{$PSScriptRoot};$null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $workspaceScriptRoot $workspaceScript),[ref]$workspaceTokens,[ref]$workspaceParseErrors);if($workspaceParseErrors.Count){throw($workspaceParseErrors|Out-String)}}}
$workspaceLaunchAst=[Management.Automation.Language.Parser]::ParseFile((Join-Path $CompanionRoot 'Start-Workspace.ps1'),[ref]$null,[ref]$null)
$workspaceHashAst=$workspaceLaunchAst.Find({param($workspaceAst)$workspaceAst-is[Management.Automation.Language.FunctionDefinitionAst]-and$workspaceAst.Name-eq'Get-WorkspaceFileSha256'},$true)
. ([scriptblock]::Create($workspaceHashAst.Extent.Text))
$workspaceBootstrapAst=$workspaceLaunchAst.Find({param($workspaceAst)$workspaceAst-is[Management.Automation.Language.FunctionDefinitionAst]-and$workspaceAst.Name-eq'Assert-WorkspacePolicyBootstrap'},$true)
. ([scriptblock]::Create($workspaceBootstrapAst.Extent.Text))
$workspaceFixtureRoot=Join-Path (Split-Path -Parent $PSScriptRoot) ('launcher-policy-fixture-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $workspaceFixtureRoot
$workspaceFixturePolicy=Join-Path $workspaceFixtureRoot 'Workspace-Policy.ps1'
$workspaceFixtureManifest=Join-Path $workspaceFixtureRoot 'INTEGRATED_BUILD.json'
$workspaceFixtureText='throw "A policy fixture must not execute during bootstrap validation."'
[IO.File]::WriteAllText($workspaceFixturePolicy,$workspaceFixtureText)
$workspaceFixtureEntries=@([pscustomobject]@{path='Workspace-Policy.ps1';sha256=(Get-FileHash -LiteralPath $workspaceFixturePolicy -Algorithm SHA256).Hash.ToLowerInvariant()})
1..9|ForEach-Object{$workspaceFixtureEntries+=([pscustomobject]@{path=('fixture/'+$_);sha256=('0'*64)})}
$workspaceFixtureRecord=[ordered]@{schema='WORKSPACE-INTEGRATED/1';version='3.9.1-local.1';launch_files=$workspaceFixtureEntries}
function Write-WorkspaceBootstrapFixture { $workspaceFixtureRecord|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $workspaceFixtureManifest -Encoding UTF8 }
try {
    Write-WorkspaceBootstrapFixture
    Check-Workspace 'Bootstrap accepts exact manifest-bound helper without executing it' { if((Assert-WorkspacePolicyBootstrap $workspaceFixtureRoot)-cne$workspaceFixturePolicy){throw 'Bootstrap returned wrong helper'} }
    [IO.File]::WriteAllText($workspaceFixturePolicy,$workspaceFixtureText+' tampered')
    Check-Workspace 'Bootstrap rejects helper changed before dot-source' { Assert-WorkspacePolicyBootstrap $workspaceFixtureRoot } $false
    [IO.File]::WriteAllText($workspaceFixturePolicy,$workspaceFixtureText)
    $workspaceFixtureEntries[0].path='workspace-policy.ps1';Write-WorkspaceBootstrapFixture
    Check-Workspace 'Bootstrap rejects policy manifest case aliases' { Assert-WorkspacePolicyBootstrap $workspaceFixtureRoot } $false
    $workspaceFixtureEntries[0].path='Workspace-Policy.ps1';$workspaceFixtureRecord.launch_files=@($workspaceFixtureEntries+$workspaceFixtureEntries[0]);Write-WorkspaceBootstrapFixture
    Check-Workspace 'Bootstrap rejects duplicate policy bindings' { Assert-WorkspacePolicyBootstrap $workspaceFixtureRoot } $false
    $workspaceFixtureRecord.launch_files=$workspaceFixtureEntries;$workspaceFixtureRecord.version='wrong-release';Write-WorkspaceBootstrapFixture
    Check-Workspace 'Bootstrap rejects wrong integrated release' { Assert-WorkspacePolicyBootstrap $workspaceFixtureRoot } $false
} finally {
    # All three exact paths were created above under this task's workspace. No
    # recursive deletion or computed external target is used.
    Remove-Item -LiteralPath $workspaceFixturePolicy -Force
    Remove-Item -LiteralPath $workspaceFixtureManifest -Force
    Remove-Item -LiteralPath $workspaceFixtureRoot -Force
}
Check-Workspace 'Launcher loads the policy only after built-in bootstrap verification' { $workspaceSource=[IO.File]::ReadAllText((Join-Path $CompanionRoot 'Start-Workspace.ps1'));$workspaceVerify=$workspaceSource.IndexOf('    $workspacePolicyPath=Assert-WorkspacePolicyBootstrap $workspaceRoot');$workspaceLoad=$workspaceSource.IndexOf('    . $workspacePolicyPath');if($workspaceVerify-lt0-or$workspaceLoad-le$workspaceVerify-or$workspaceSource.Contains(". (Join-Path `$workspaceRoot 'Workspace-Policy.ps1')")){throw 'Policy executes before bootstrap verification'} }
Check-Workspace 'Managed pipe/job helper compiles without calling Win32 or process entries' { Add-Type -Path (Join-Path $CompanionRoot 'Workspace-Pipe.cs') }
Check-Workspace 'Bounded pipe consumes distinct protocol lines' { $workspacePipe=New-Object PortableWorkspace.PipeReader([IO.StringReader]::new("first`nsecond`n"),64);try{$workspaceDeadline=[Diagnostics.Stopwatch]::StartNew();while(!$workspacePipe.Ended-and$workspaceDeadline.Elapsed.TotalSeconds-lt2){Start-Sleep -Milliseconds 10};if($workspacePipe.Failure-or$workspacePipe.PollLine()-cne'first'-or$workspacePipe.PollLine()-cne'second'-or$null-ne$workspacePipe.PollLine()){throw 'Pipe protocol mismatch'}}finally{$workspacePipe.Dispose()} }
Check-Workspace 'Oversized child protocol line fails without returning its content' { $workspacePipe=New-Object PortableWorkspace.PipeReader([IO.StringReader]::new('x'*100),16);try{$workspaceDeadline=[Diagnostics.Stopwatch]::StartNew();while(!$workspacePipe.Ended-and$workspaceDeadline.Elapsed.TotalSeconds-lt2){Start-Sleep -Milliseconds 10};if(!$workspacePipe.Failure-or$null-ne$workspacePipe.PollLine()){throw 'Oversized line accepted'}}finally{$workspacePipe.Dispose()} }
Check-Workspace 'Excessive protocol lines fail closed' { $workspacePipe=New-Object PortableWorkspace.PipeReader([IO.StringReader]::new(('x'+"`n")*70),16);try{$workspaceDeadline=[Diagnostics.Stopwatch]::StartNew();while(!$workspacePipe.Ended-and$workspaceDeadline.Elapsed.TotalSeconds-lt2){Start-Sleep -Milliseconds 10};if(!$workspacePipe.Failure){throw 'Unbounded queue accepted'}}finally{$workspacePipe.Dispose()} }
Check-Workspace 'Owned WinPS child ignores inherited Core or user module paths' { $workspaceParentEnv=@{PSModulePath='D:\synthetic-untrusted-modules';PATH='synthetic-path'};$workspaceChildEnv=Get-WorkspaceChildEnvironment $workspaceParentEnv 'D:\synthetic-console' 'http://127.0.0.1:8787' 'synthetic-session';$workspaceOsModules=Join-Path ([Environment]::GetFolderPath('Windows')) 'System32\WindowsPowerShell\v1.0\Modules';if($workspaceChildEnv.PSModulePath-cne$workspaceOsModules){throw 'Inherited module path reached WinPS child'} }
Check-Workspace 'Module path restriction leaves the parent environment unchanged' { $workspaceParentEnv=@{PSModulePath='D:\synthetic-parent-modules'};$null=Get-WorkspaceChildEnvironment $workspaceParentEnv 'D:\synthetic-console' 'http://127.0.0.1:8787' 'synthetic-session';if($workspaceParentEnv.PSModulePath-cne'D:\synthetic-parent-modules'){throw 'Parent environment was changed'} }
$workspaceOriginalCases=$workspaceChecks.Count
# Preserve the prior implementation as a bounded equivalence oracle for ordinary
# fixture paths. It is never used by the launcher or trusted to check a package.
function Get-WorkspaceLegacyContainedPath([string]$Root,[string]$RelativePath) {
    if ([string]::IsNullOrWhiteSpace($RelativePath) -or [IO.Path]::IsPathRooted($RelativePath) -or
        $RelativePath -match '[:\p{Cc}]' -or ($RelativePath -split '[/\\]') -contains '..') { throw 'A package path must be relative and remain inside the workspace.' }
    $workspaceRootPath=[IO.Path]::GetFullPath($Root).TrimEnd('\','/')
    $workspaceFullPath=[IO.Path]::GetFullPath((Join-Path $workspaceRootPath $RelativePath))
    if (!$workspaceFullPath.StartsWith($workspaceRootPath+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'A package path escaped the workspace.' }
    $workspaceCurrent=$workspaceFullPath
    while ($workspaceCurrent -and $workspaceCurrent.Length -ge $workspaceRootPath.Length) {
        if(Test-Path -LiteralPath $workspaceCurrent){$workspaceItem=Get-Item -LiteralPath $workspaceCurrent -Force;if(($workspaceItem.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'Package paths cannot traverse a junction or symbolic link.'}}
        if($workspaceCurrent-eq$workspaceRootPath){break};$workspaceCurrent=Split-Path -Parent $workspaceCurrent
    }
    return $workspaceFullPath
}
# Clone only the actual production function, substituting its one metadata read.
# This exercises its unchanged control flow with errors/reparse metadata which
# cannot reliably be created under this Windows token. Production has no seam.
$workspacePolicyAst=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Workspace-Policy.ps1'),[ref]$null,[ref]$null)
$workspaceContainedAst=$workspacePolicyAst.Find({param($ast)$ast-is[Management.Automation.Language.FunctionDefinitionAst]-and$ast.Name-eq'Get-WorkspaceContainedPath'},$true)
$workspaceContainedFixture=$workspaceContainedAst.Extent.Text.Replace('function Get-WorkspaceContainedPath','function Invoke-WorkspaceContainedFixture')
if(([regex]::Matches($workspaceContainedFixture,[regex]::Escape('[IO.File]::GetAttributes($workspaceCurrent)'))).Count-ne1){throw 'Expected exactly one fresh production metadata read.'}
$workspaceContainedFixture=$workspaceContainedFixture.Replace('[IO.File]::GetAttributes($workspaceCurrent)','(Invoke-WorkspaceFixtureAttributes $workspaceCurrent)')
. ([scriptblock]::Create($workspaceContainedFixture))
function Invoke-WorkspaceFixtureAttributes([string]$Path) {
    [void]$script:workspaceAttributeReads.Add($Path)
    if($script:workspaceAttributeMetadata.ContainsKey($Path)){
        $workspaceFixtureValue=$script:workspaceAttributeMetadata[$Path]
        if($workspaceFixtureValue-is[Exception]){throw $workspaceFixtureValue}
        return $workspaceFixtureValue
    }
    throw [IO.FileNotFoundException]::new('Synthetic absent fixture entry.')
}
function Reset-WorkspaceAttributeFixture([string]$Root,[string]$Leaf) {
    $script:workspaceAttributeReads=New-Object 'System.Collections.Generic.List[string]'
    $script:workspaceAttributeMetadata=@{}
    $script:workspaceAttributeMetadata[$Root]=[IO.FileAttributes]::Directory
    $script:workspaceAttributeMetadata[[IO.Path]::GetDirectoryName($Leaf)]=[IO.FileAttributes]::Directory
    $script:workspaceAttributeMetadata[$Leaf]=[IO.FileAttributes]::Normal
}
function Assert-WorkspaceFixtureRefusal([scriptblock]$Action,[string]$Message) {
    try{$null=&$Action}catch{if($_.Exception.GetBaseException().Message.Contains($Message)){return};throw}
    throw 'The adversarial fixture was accepted.'
}
$workspacePathFixtureRoot=[IO.Path]::Combine([IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)),('contained-policy-fixture-'+[guid]::NewGuid().ToString('N')))
$workspacePathFixturePackage=[IO.Path]::Combine($workspacePathFixtureRoot,'package')
$workspacePathFixtureNested=[IO.Path]::Combine($workspacePathFixturePackage,'space name')
$workspacePathFixtureExternal=[IO.Path]::Combine($workspacePathFixtureRoot,'outside')
$workspacePathFixtureFile=[IO.Path]::Combine($workspacePathFixtureNested,'plain.txt')
$workspacePathFixtureLong=[IO.Path]::Combine($workspacePathFixtureNested,('a'*60),('b'*60),('c'*60))
$workspacePathFixtureJunction=[IO.Path]::Combine($workspacePathFixturePackage,'junction')
$workspacePathFixtureSymlink=[IO.Path]::Combine($workspacePathFixturePackage,'file-link.txt')
$workspaceCreatedReparse=New-Object 'System.Collections.Generic.List[string]'
$workspaceFixtureCleanupDirectories=New-Object 'System.Collections.Generic.List[string]'
try {
    $null=[IO.Directory]::CreateDirectory($workspacePathFixtureNested)
    $null=[IO.Directory]::CreateDirectory($workspacePathFixtureExternal)
    [IO.File]::WriteAllText($workspacePathFixtureFile,'Inert path-policy fixture. No key or user data.')
    foreach($workspaceRelative in @('space name\plain.txt','space name/plain.txt','space name\missing.txt','future\child\new.txt','space name\.\plain.txt')) {
        Check-Workspace ('Fast/legacy contained result agrees: '+$workspaceRelative) { if((Get-WorkspaceContainedPath $workspacePathFixturePackage $workspaceRelative)-cne(Get-WorkspaceLegacyContainedPath $workspacePathFixturePackage $workspaceRelative)){throw 'Contained path differs from preserved policy'} }
    }
    Check-Workspace 'Root with trailing separators has the same contained result' { if((Get-WorkspaceContainedPath ($workspacePathFixturePackage+'\') 'space name\plain.txt')-cne$workspacePathFixtureFile){throw 'Trailing root changed resolution'} }
    Check-Workspace 'Relative sibling-prefix escape stays refused' { Assert-WorkspaceFixtureRefusal {Get-WorkspaceContainedPath $workspacePathFixturePackage '..\package-sibling\file.txt'} 'must be relative' }
    Check-Workspace 'Drive-root package resolves relative paths without a drive-relative alias' { $workspaceDriveRoot=[IO.Path]::GetPathRoot($PSScriptRoot);$workspaceRelative='unwritten-'+[guid]::NewGuid().ToString('N')+'\new.txt';if((Get-WorkspaceContainedPath $workspaceDriveRoot $workspaceRelative)-cne[IO.Path]::Combine($workspaceDriveRoot,$workspaceRelative)){throw 'Drive root became drive-relative'} }
    $workspaceProbeRoot=$workspacePathFixturePackage;$workspaceProbeLeaf=[IO.Path]::Combine($workspaceProbeRoot,'probe','leaf.txt')
    foreach($workspaceReparseLocation in @($workspaceProbeLeaf,[IO.Path]::GetDirectoryName($workspaceProbeLeaf),$workspaceProbeRoot)) {
        Check-Workspace ('Every named component rejects a reparse flag: '+[IO.Path]::GetFileName($workspaceReparseLocation)) { Reset-WorkspaceAttributeFixture $workspaceProbeRoot $workspaceProbeLeaf;$script:workspaceAttributeMetadata[$workspaceReparseLocation]=[IO.FileAttributes]::Directory-bor[IO.FileAttributes]::ReparsePoint;Assert-WorkspaceFixtureRefusal {Invoke-WorkspaceContainedFixture $workspaceProbeRoot 'probe\leaf.txt'} 'junction or symbolic link' }
    }
    Check-Workspace 'Missing leaf is allowed and existing parent/root still checked' { Reset-WorkspaceAttributeFixture $workspaceProbeRoot $workspaceProbeLeaf;$script:workspaceAttributeMetadata[$workspaceProbeLeaf]=[IO.FileNotFoundException]::new('Synthetic absent leaf.');$null=Invoke-WorkspaceContainedFixture $workspaceProbeRoot 'probe\leaf.txt';if(($script:workspaceAttributeReads-join'|')-cne(@($workspaceProbeLeaf,[IO.Path]::GetDirectoryName($workspaceProbeLeaf),$workspaceProbeRoot)-join'|')){throw 'An ancestor metadata read was omitted'} }
    Check-Workspace 'Missing directory ancestor does not skip the existing root' { Reset-WorkspaceAttributeFixture $workspaceProbeRoot $workspaceProbeLeaf;$script:workspaceAttributeMetadata[$workspaceProbeLeaf]=[IO.DirectoryNotFoundException]::new('Synthetic absent parent.');$script:workspaceAttributeMetadata[[IO.Path]::GetDirectoryName($workspaceProbeLeaf)]=[IO.DirectoryNotFoundException]::new('Synthetic absent parent.');$null=Invoke-WorkspaceContainedFixture $workspaceProbeRoot 'probe\leaf.txt';if(!$script:workspaceAttributeReads.Contains($workspaceProbeRoot)){throw 'Existing root was not checked'} }
    foreach($workspaceMetadataError in @([UnauthorizedAccessException]::new('Synthetic access denied.'),[IO.IOException]::new('Synthetic sharing failure.'),[IO.PathTooLongException]::new('Synthetic long-path failure.'),[ArgumentException]::new('Synthetic invalid path.'))) {
        Check-Workspace ('Metadata failure is not treated as missing: '+$workspaceMetadataError.GetType().Name) { Reset-WorkspaceAttributeFixture $workspaceProbeRoot $workspaceProbeLeaf;$script:workspaceAttributeMetadata[$workspaceProbeLeaf]=$workspaceMetadataError;Assert-WorkspaceFixtureRefusal {Invoke-WorkspaceContainedFixture $workspaceProbeRoot 'probe\leaf.txt'} $workspaceMetadataError.Message }
    }
    Check-Workspace 'Every call rereads root and ancestors with no trust cache' { Reset-WorkspaceAttributeFixture $workspaceProbeRoot $workspaceProbeLeaf;$null=Invoke-WorkspaceContainedFixture $workspaceProbeRoot 'probe\leaf.txt';$null=Invoke-WorkspaceContainedFixture $workspaceProbeRoot 'probe\leaf.txt';if($script:workspaceAttributeReads.Count-ne6-or@($script:workspaceAttributeReads|Where-Object{$_-ceq$workspaceProbeRoot}).Count-ne2){throw 'Ancestor reads were cached or omitted'} }
    Check-Workspace 'A reparse replacement between calls is freshly rejected' { Reset-WorkspaceAttributeFixture $workspaceProbeRoot $workspaceProbeLeaf;$null=Invoke-WorkspaceContainedFixture $workspaceProbeRoot 'probe\leaf.txt';$script:workspaceAttributeMetadata[[IO.Path]::GetDirectoryName($workspaceProbeLeaf)]=[IO.FileAttributes]::Directory-bor[IO.FileAttributes]::ReparsePoint;Assert-WorkspaceFixtureRefusal {Invoke-WorkspaceContainedFixture $workspaceProbeRoot 'probe\leaf.txt'} 'junction or symbolic link' }
    Check-Workspace 'Real long contained metadata path stays accepted' { $null=[IO.Directory]::CreateDirectory($workspacePathFixtureLong);$workspaceLongFile=[IO.Path]::Combine($workspacePathFixtureLong,'long.txt');[IO.File]::WriteAllText($workspaceLongFile,'Inert long-path fixture.');if($workspaceLongFile.Length-le259-or(Get-WorkspaceContainedPath $workspacePathFixturePackage $workspaceLongFile.Substring($workspacePathFixturePackage.Length+1))-cne$workspaceLongFile){throw 'Existing long path was not checked and accepted'} }
    $workspaceJunctionAvailable=$false
    try { $null=New-Item -ItemType Junction -Path $workspacePathFixtureJunction -Target $workspacePathFixtureExternal -ErrorAction Stop;$workspaceCreatedReparse.Add($workspacePathFixtureJunction);$workspaceJunctionAvailable=$true } catch { $workspaceJunctionUnavailable=$_.Exception.GetBaseException().GetType().Name }
    if($workspaceJunctionAvailable){
        Check-Workspace 'Real File.GetAttributes observes directory junction and missing-child traversal is refused' { if(([IO.File]::GetAttributes($workspacePathFixtureJunction)-band[IO.FileAttributes]::ReparsePoint)-eq0){throw 'Junction metadata followed the target'};Assert-WorkspaceFixtureRefusal {Get-WorkspaceContainedPath $workspacePathFixturePackage 'junction\not-present\new.txt'} 'junction or symbolic link' }
        Check-Workspace 'Real junction used as package root is refused' { Assert-WorkspaceFixtureRefusal {Get-WorkspaceContainedPath $workspacePathFixtureJunction 'new.txt'} 'junction or symbolic link' }
    } else { Skip-Workspace 'Real directory junction metadata and root refusal' ('Junction creation unavailable under Windows policy: '+$workspaceJunctionUnavailable) }
    $workspaceFileLinkAvailable=$false
    try { $null=New-Item -ItemType SymbolicLink -Path $workspacePathFixtureSymlink -Target $workspacePathFixtureFile -ErrorAction Stop;$workspaceCreatedReparse.Add($workspacePathFixtureSymlink);$workspaceFileLinkAvailable=$true } catch { $workspaceFileLinkUnavailable=$_.Exception.GetBaseException().GetType().Name }
    if($workspaceFileLinkAvailable){
        Check-Workspace 'Real File.GetAttributes observes file symlink and refuses it' { if(([IO.File]::GetAttributes($workspacePathFixtureSymlink)-band[IO.FileAttributes]::ReparsePoint)-eq0){throw 'File link metadata followed the target'};Assert-WorkspaceFixtureRefusal {Get-WorkspaceContainedPath $workspacePathFixturePackage 'file-link.txt'} 'junction or symbolic link' }
        [IO.File]::Delete($workspacePathFixtureFile)
        Check-Workspace 'Real dangling file symlink still carries a refused reparse flag' { if(([IO.File]::GetAttributes($workspacePathFixtureSymlink)-band[IO.FileAttributes]::ReparsePoint)-eq0){throw 'Dangling link was hidden as absent'};Assert-WorkspaceFixtureRefusal {Get-WorkspaceContainedPath $workspacePathFixturePackage 'file-link.txt'} 'junction or symbolic link' }
    } else { Skip-Workspace 'Real file and dangling symlink metadata refusal' ('Symlink creation unavailable under Windows policy: '+$workspaceFileLinkUnavailable) }
} finally {
    # All fixtures are new inert entries under the task's boot-update directory.
    # Remove each link itself before recursively cleaning the owned fixture root.
    foreach($workspaceLink in $workspaceCreatedReparse){if($workspaceLink.StartsWith($workspacePathFixtureRoot+'\',[StringComparison]::OrdinalIgnoreCase)-and([IO.File]::GetAttributes($workspaceLink)-band[IO.FileAttributes]::ReparsePoint)-ne0){if(([IO.File]::GetAttributes($workspaceLink)-band[IO.FileAttributes]::Directory)-ne0){[IO.Directory]::Delete($workspaceLink)}else{[IO.File]::Delete($workspaceLink)}}else{throw 'Unsafe fixture link cleanup target.'}}
    $workspaceFixtureParent=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')+'\'
    if(!$workspacePathFixtureRoot.StartsWith($workspaceFixtureParent,[StringComparison]::OrdinalIgnoreCase)-or[IO.Path]::GetFullPath($workspacePathFixtureRoot)-cne$workspacePathFixtureRoot){throw 'Unsafe fixture cleanup root.'}
    if([IO.Directory]::Exists($workspacePathFixtureRoot)){[IO.Directory]::Delete($workspacePathFixtureRoot,$true)}
}
$workspaceSkipped=@($workspaceChecks|Where-Object{$_.skipped})
$workspaceFailed=@($workspaceChecks|Where-Object{!$_.passed-and!$_.skipped})
$workspaceHashes=@('Start-Workspace.ps1','Start-Workspace.cmd','Start-Workspace.vbs','Workspace-Policy.ps1','Workspace-Pipe.cs','Test-WorkspacePolicy.ps1')|ForEach-Object{$workspaceSourceRoot=if($_ -in @('Workspace-Policy.ps1','Test-WorkspacePolicy.ps1')){$PSScriptRoot}else{$CompanionRoot};[ordered]@{path=$_;source_root=$workspaceSourceRoot;sha256=(Get-FileHash -LiteralPath (Join-Path $workspaceSourceRoot $_) -Algorithm SHA256).Hash.ToLowerInvariant()}}
$workspaceRecord=[ordered]@{status=$(if($workspaceFailed.Count){'FAIL'}else{'PASS'});total=$workspaceChecks.Count;passed=($workspaceChecks.Count-$workspaceFailed.Count-$workspaceSkipped.Count);failed=$workspaceFailed.Count;skipped=$workspaceSkipped.Count;original_cases=$workspaceOriginalCases;scope='PURE_POLICY_AST_MANAGED_PIPE_AND_INERT_FILESYSTEM_FIXTURES_ONLY';backend_started=$false;console_started=$false;native_execution=$false;network_requests=$false;live_acceptance=$false;source_hashes=$workspaceHashes;cases=$workspaceChecks}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent ([IO.Path]::GetFullPath($EvidencePath))) | Out-Null
$workspaceRecord|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $EvidencePath -Encoding UTF8
Write-Output ([pscustomobject]$workspaceRecord|Select-Object status,total,passed,failed,skipped,original_cases|ConvertTo-Json -Compress)
if($workspaceFailed.Count){$workspaceFailed|ForEach-Object{Write-Output($_.name+': '+$_.reason)};exit 1}
