param([ValidateSet('native-protect','native-open')][string]$Action='native-open',[string]$InputFile,[string]$OutputFile)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$workspaceRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$workspaceProcess=$null;$workspaceSecret=$null;$workspaceBstr=[IntPtr]::Zero
$workspaceJob=$null;$workspaceOutput=$null;$workspaceErrors=$null;$workspaceWords=$null;$workspaceKeyInput=$null;$workspaceExit=1

function Get-ProtectionFileSha256([string]$Path) {
    # Built-in .NET only; no module discovery or package helper is needed.
    $workspaceHashStream=$null;$workspaceHasher=$null
    try {
        $workspaceHashStream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
        $workspaceHasher=[Security.Cryptography.SHA256]::Create()
        return [BitConverter]::ToString($workspaceHasher.ComputeHash($workspaceHashStream)).Replace('-','').ToLowerInvariant()
    } finally {
        if($workspaceHasher){$workspaceHasher.Dispose()}
        if($workspaceHashStream){$workspaceHashStream.Dispose()}
    }
}

function Get-ProtectionCanonicalDirectory([string]$Directory) {
    $workspaceDirectory=[IO.Path]::GetFullPath($Directory)
    if($workspaceDirectory.Length-gt3){$workspaceDirectory=$workspaceDirectory.TrimEnd('\','/')}
    if($workspaceDirectory-cnotmatch'\A[A-Za-z]:\\'){throw 'Choose an ordinary local drive directory.'}
    $workspaceCurrent=$workspaceDirectory.Substring(0,3)
    foreach($workspacePart in @($workspaceDirectory.Substring(3)-split'\\'|Where-Object{$_})) {
        $workspaceMatches=@([IO.Directory]::GetDirectories($workspaceCurrent)|Where-Object{[IO.Path]::GetFileName($_).Equals($workspacePart,[StringComparison]::OrdinalIgnoreCase)})
        if($workspaceMatches.Count-ne1){throw 'Use actual existing directory names, without path aliases.'}
        $workspaceCurrent=$workspaceMatches[0]
        $workspaceItem=Get-Item -LiteralPath $workspaceCurrent -Force
        if(($workspaceItem.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'Paths cannot traverse a junction or symbolic link.'}
    }
    return $workspaceCurrent
}

function Get-ProtectionCheckedFilePath([string]$Path,[ValidateSet('existing','new')][string]$Mode,[string]$OutsideRoot='',[ValidateRange(259,4096)][int]$MaximumPathLength=259) {
    if([string]::IsNullOrWhiteSpace($Path)-or$Path-cnotmatch'\A[A-Za-z]:\\'-or$Path.Length-gt$MaximumPathLength){throw 'Choose an ordinary canonical local filename.'}
    foreach($workspacePart in @($Path.Substring(3)-split'\\')) {
        if(!$workspacePart-or$workspacePart-in@('.','..')-or$workspacePart-match'[<>:"/|?*\p{Cc}]'-or$workspacePart-match'[. ]\z'-or$workspacePart-match'\A(?:CON|CONIN\$|CONOUT\$|PRN|AUX|NUL|COM[0-9\u00b9\u00b2\u00b3]|LPT[0-9\u00b9\u00b2\u00b3])(?:\.|\z)'){throw 'Device names, streams and Windows path aliases are refused.'}
    }
    $workspaceFullPath=[IO.Path]::GetFullPath($Path)
    $workspaceParent=Get-ProtectionCanonicalDirectory ([IO.Path]::GetDirectoryName($workspaceFullPath))
    $workspaceName=[IO.Path]::GetFileName($workspaceFullPath)
    $workspaceFullPath=Join-Path $workspaceParent $workspaceName
    if($OutsideRoot) {
        $workspaceCanonicalRoot=Get-ProtectionCanonicalDirectory $OutsideRoot
        if($workspaceFullPath.Equals($workspaceCanonicalRoot,[StringComparison]::OrdinalIgnoreCase)-or$workspaceFullPath.StartsWith($workspaceCanonicalRoot.TrimEnd('\','/')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Save recovered or protected output outside this workspace package.'}
    }
    if($Mode-eq'new') {
        if(Test-Path -LiteralPath $workspaceFullPath){throw 'Choose a new output file; existing files are never overwritten.'}
    } else {
        $workspaceMatches=@([IO.Directory]::GetFiles($workspaceParent)|Where-Object{[IO.Path]::GetFileName($_).Equals($workspaceName,[StringComparison]::OrdinalIgnoreCase)})
        if($workspaceMatches.Count-ne1){throw 'Choose an existing file using its actual filesystem name.'}
        $workspaceFullPath=$workspaceMatches[0]
        $workspaceItem=Get-Item -LiteralPath $workspaceFullPath -Force
        if(($workspaceItem.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0-or($workspaceItem.Attributes-band[IO.FileAttributes]::Directory)-ne0){throw 'Only an ordinary file is allowed.'}
    }
    return $workspaceFullPath
}

function Assert-ProtectionPackage([string]$Root) {
    # All checks below use built-ins in this supervisor. No package helper,
    # managed source or protection module executes before the complete check.
    $workspaceCanonicalRoot=Get-ProtectionCanonicalDirectory $Root
    $workspaceManifestPath=Get-ProtectionCheckedFilePath (Join-Path $workspaceCanonicalRoot 'INTEGRATED_BUILD.json') 'existing'
    if((Get-Item -LiteralPath $workspaceManifestPath).Length-gt12000000){throw 'The launch manifest exceeds its bound.'}
    $workspaceManifest=Get-Content -LiteralPath $workspaceManifestPath -Raw -Encoding UTF8|ConvertFrom-Json
    if($workspaceManifest.schema-cne'WORKSPACE-INTEGRATED/1'-or$workspaceManifest.version-cne'3.9.0-local.1'-or$workspaceManifest.launch_files-isnot[Array]-or$workspaceManifest.launch_files.Count-lt10-or$workspaceManifest.launch_files.Count-gt12000){throw 'The integrated launch manifest is invalid.'}
    $workspaceSeen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach($workspaceEntry in $workspaceManifest.launch_files) {
        if($workspaceEntry.path-isnot[string]-or$workspaceEntry.sha256-isnot[string]-or$workspaceEntry.sha256-cnotmatch'\A[0-9a-f]{64}\z'-or!$workspaceSeen.Add($workspaceEntry.path)-or$workspaceEntry.path-match'[:\\\p{Cc}]'){throw 'Malformed, aliased or duplicate launch entries are refused.'}
        foreach($workspacePart in @($workspaceEntry.path-split'/')) {
            if(!$workspacePart-or$workspacePart-in@('.','..')-or$workspacePart-match'[<>:"|?*\p{Cc}]'-or$workspacePart-match'[. ]\z'-or$workspacePart-match'\A(?:CON|CONIN\$|CONOUT\$|PRN|AUX|NUL|COM[0-9\u00b9\u00b2\u00b3]|LPT[0-9\u00b9\u00b2\u00b3])(?:\.|\z)'){throw 'The launch manifest contains a noncanonical path.'}
        }
        if($workspaceEntry.path-match'\A(?:state|console/workspace)(?:/|\z)'){throw 'Mutable state is not a launch component.'}
        # Retained source/provenance names may be long under an extraction root.
        # Only contained launch metadata receives the larger bound; operation
        # input/output and recovery saves retain their default 259-char limits.
        $workspaceFile=Get-ProtectionCheckedFilePath (Join-Path $workspaceCanonicalRoot $workspaceEntry.path.Replace('/','\')) 'existing' -MaximumPathLength 4096
        if((Get-ProtectionFileSha256 $workspaceFile)-cne$workspaceEntry.sha256){throw 'A launch component is changed; no component was imported or started.'}
    }
    foreach($workspaceRequired in @('runtime/node.exe','app/src/main.mjs','app/src/http.mjs','app/src/vault.mjs','app/src/crypto.mjs','app/src/policy.mjs','app/desk/index.html','app/web/index.html','app/web/protected-export.mjs','app/web/protected-wire.mjs','console/host/Start-JA21Browser.ps1','console/host/JA21VirtualBrowser.cs','console/host/LiveWebBridge.cs','console/runtime/webview2-sdk/1.0.4191.47/Microsoft.Web.WebView2.Core.dll','console/runtime/webview2-sdk/1.0.4191.47/Microsoft.Web.WebView2.Wpf.dll','console/runtime/webview2-sdk/1.0.4191.47/WebView2Loader.dll','Workspace-Policy.ps1','Workspace-Pipe.cs','Start-Workspace.ps1','Protection-Tools.ps1','protection/protected-tools.mjs','protection/archive.mjs','Native-Protection-Tools.ps1','native/NATIVE_ADAPTER_BUILD.json','native/NativeCipherAdapter.exe','native/NativeCipherAdapter.cs','native/engine/portal-cypher-windows-amd64.exe','native/engine/r12_tuple.json','protection/native-archive.mjs','protection/native-protected-tools.mjs')) {
        if(!$workspaceSeen.Contains($workspaceRequired)){throw 'The launch manifest omits a required protection or integrated component.'}
    }
    $workspaceNode=Join-Path $workspaceCanonicalRoot 'runtime\node.exe'
    if((Get-ProtectionFileSha256 $workspaceNode)-cne'3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'){throw 'The private Node runtime differs from its independent 24.19.0 pin.'}
    $null=Assert-ProtectionNativePins $workspaceCanonicalRoot
    return $workspaceManifest
}

function Assert-ProtectionNativePins([string]$Root) {
    $workspacePinPath=Get-ProtectionCheckedFilePath (Join-Path $Root 'native\NATIVE_ADAPTER_BUILD.json') 'existing'
    if((Get-Item -LiteralPath $workspacePinPath).Length-gt8192){throw 'The native pin record exceeds its bound.'}
    $workspacePins=Get-Content -LiteralPath $workspacePinPath -Raw -Encoding UTF8|ConvertFrom-Json
    if((@($workspacePins.PSObject.Properties.Name|Sort-Object)-join',')-cne'adapter,architecture,engine,framework,schema,source,tuple'-or$workspacePins.schema-cne'WORKSPACE-NATIVE-ADAPTER/1'-or$workspacePins.architecture-cne'x64'-or$workspacePins.framework-cne'NET_FRAMEWORK_4_8'){throw 'Native pin record is invalid.'}
    foreach($workspacePair in @(@('adapter','NativeCipherAdapter.exe'),@('source','NativeCipherAdapter.cs'),@('engine','engine/portal-cypher-windows-amd64.exe'),@('tuple','engine/r12_tuple.json'))) {
        $workspacePin=$workspacePins.($workspacePair[0])
        if((@($workspacePin.PSObject.Properties.Name|Sort-Object)-join',')-cne'bytes,path,sha256'-or$workspacePin.path-cne$workspacePair[1]-or$workspacePin.sha256-cnotmatch'\A[0-9a-f]{64}\z'-or($workspacePin.bytes-isnot[int]-and$workspacePin.bytes-isnot[long]-and$workspacePin.bytes-isnot[double])-or$workspacePin.bytes-lt1-or$workspacePin.bytes-ge4194304-or$workspacePin.bytes-ne[math]::Truncate($workspacePin.bytes)){throw 'A native pin entry is invalid.'}
        $workspaceNativePath=Get-ProtectionCheckedFilePath (Join-Path $Root ('native\'+$workspacePair[1].Replace('/','\'))) 'existing'
        if((Get-Item -LiteralPath $workspaceNativePath).Length-ne$workspacePin.bytes-or(Get-ProtectionFileSha256 $workspaceNativePath)-cne$workspacePin.sha256){throw 'A native source or runtime pin has changed.'}
    }
    if($workspacePins.engine.sha256-cne'17004f15b0689090169593ee0fc7268457a918c7c259483f0a7713d46d0ea5fe'-or$workspacePins.engine.bytes-ne2542080-or$workspacePins.tuple.sha256-cne'4b0ff9c6d460d1dc8485015d38d95c03bf92cbad2666b771791a13dfb33de688'-or$workspacePins.tuple.bytes-ne284){throw 'The recovered native engine or tuple differs from its independent pin.'}
    return $true
}

function Assert-ProtectionNativeNames([string]$Action,[string]$InputFile,[string]$OutputFile) {
    if($Action-eq'native-protect'){$workspaceInputExtension='.zip';$workspaceOutputExtension='.ja21pkg'}elseif($Action-eq'native-open'){$workspaceInputExtension='.ja21pkg';$workspaceOutputExtension='.zip'}else{throw 'Choose an explicit native action.'}
    if(![IO.Path]::GetExtension($InputFile).Equals($workspaceInputExtension,[StringComparison]::OrdinalIgnoreCase)-or![IO.Path]::GetExtension($OutputFile).Equals($workspaceOutputExtension,[StringComparison]::OrdinalIgnoreCase)){throw 'Use ZIP input and JA21 package output for protect; JA21 package input and ZIP output for open. No format fallback is performed.'}
    return $true
}

function Assert-ProtectionCompletion([object]$Record,[string]$ExpectedAction,[string]$ExpectedOutput) {
    if($null-eq$Record-or(@($Record.PSObject.Properties.Name|Sort-Object)-join',')-cne'action,event,output'-or$Record.event-cne'complete'-or$Record.action-cne$ExpectedAction-or$Record.output-isnot[string]-or!$Record.output.Equals($ExpectedOutput,[StringComparison]::OrdinalIgnoreCase)){throw 'The protection tool did not return a matching completion record.'}
    return $true
}

function Read-ProtectionCompletion([object]$Process,[object]$Output,[object]$Errors,[string]$ExpectedAction,[string]$ExpectedOutput,[int]$TimeoutMilliseconds=120000) {
    if($TimeoutMilliseconds-lt1-or$TimeoutMilliseconds-gt120000){throw 'Invalid operation deadline.'}
    $workspaceDeadline=[Diagnostics.Stopwatch]::StartNew();$workspaceCompletion=$null
    while($workspaceDeadline.ElapsedMilliseconds-lt$TimeoutMilliseconds) {
        for($workspaceDrain=0;$workspaceDrain-lt64;$workspaceDrain++){if($null-eq$Errors.PollLine()){break}} # bounded discard without key/stack logging
        if($Output.Failure-or$Errors.Failure){throw 'Protection output exceeded the bounded protocol.'}
        $workspaceLine=$Output.PollLine()
        if($null-ne$workspaceLine) {
            if($null-ne$workspaceCompletion){throw 'The protection tool returned multiple completion records.'}
            $workspaceCompletion=$workspaceLine|ConvertFrom-Json
            $null=Assert-ProtectionCompletion $workspaceCompletion $ExpectedAction $ExpectedOutput
        }
        if($Process.HasExited-and$Output.Ended-and$Errors.Ended) {
            # Failure can become visible between the earlier check and pipe
            # EOF. Never accept a completion after either reader failed.
            if($Output.Failure-or$Errors.Failure){throw 'Protection output failed before its final EOF.'}
            if($Process.ExitCode-ne0-or$null-eq$workspaceCompletion){throw 'The protection operation did not complete successfully.'}
            # Drain final queued stdout after pipe EOF, even if the process
            # already exited before the first record was consumed.
            if($null-ne$Output.PollLine()){throw 'The protection tool returned extra output.'}
            return $workspaceCompletion
        }
        Start-Sleep -Milliseconds 20
    }
    throw 'The protection operation exceeded its deadline.'
}

try {
    if($PSVersionTable.PSEdition-ne'Desktop'-or![Environment]::Is64BitProcess-or![Environment]::Is64BitOperatingSystem-or[Threading.Thread]::CurrentThread.GetApartmentState()-ne'STA'){throw 'Use the supplied Windows x64 STA utility entry point.'}
    Write-Host 'Checking the supplied workspace package...'
    $workspaceManifest=Assert-ProtectionPackage $workspaceRoot
    . (Join-Path $workspaceRoot 'Workspace-Policy.ps1')
    Add-Type -Path (Join-Path $workspaceRoot 'Workspace-Pipe.cs')
    Add-Type -AssemblyName System.Windows.Forms
    if(!$InputFile){$workspaceOpen=New-Object Windows.Forms.OpenFileDialog;try{$workspaceOpen.Title=if($Action-eq'native-protect'){'Choose a ZIP package or encrypted backup ZIP'}else{'Choose a native JA21 package'};$workspaceOpen.Filter=if($Action-eq'native-protect'){'ZIP package (*.zip)|*.zip'}else{'Native JA21 package (*.ja21pkg)|*.ja21pkg'};$workspaceOpen.CheckFileExists=$true;if($workspaceOpen.ShowDialog()-ne'OK'){$workspaceExit=0;return};$InputFile=$workspaceOpen.FileName}finally{$workspaceOpen.Dispose()}}
    if(!$OutputFile){$workspaceSave=New-Object Windows.Forms.SaveFileDialog;try{$workspaceSave.Title='Choose a new output filename outside the workspace';$workspaceSave.OverwritePrompt=$true;$workspaceSave.FileName=if($Action-eq'native-open'){'Recovered-package.zip'}else{'Protected-package.ja21pkg'};$workspaceSave.Filter=if($Action-eq'native-open'){'ZIP package (*.zip)|*.zip'}else{'Native JA21 package (*.ja21pkg)|*.ja21pkg'};if($workspaceSave.ShowDialog()-ne'OK'){$workspaceExit=0;return};$OutputFile=$workspaceSave.FileName}finally{$workspaceSave.Dispose()}}
    $InputFile=Get-ProtectionCheckedFilePath $InputFile 'existing'
    $OutputFile=Get-ProtectionCheckedFilePath $OutputFile 'new' $workspaceRoot
    $null=Assert-ProtectionNativeNames $Action $InputFile $OutputFile
    Write-Host 'This explicit native archive utility does not change the live workspace vault or browser encryption.'
    if($Action-eq'native-open'){Write-Host 'The selected new ZIP is decrypted from its outer native package. Keep it private; an encrypted backup inside remains encrypted.'}
    $workspaceSecret=Read-Host 'Enter your four recovery words, separated by spaces' -AsSecureString
    try{$workspaceBstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($workspaceSecret);$workspaceWords=ConvertFrom-WorkspaceRecovery ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($workspaceBstr))}finally{if($workspaceBstr-ne[IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($workspaceBstr);$workspaceBstr=[IntPtr]::Zero};$workspaceSecret.Dispose();$workspaceSecret=$null}
    # Recheck destinations after interactive input. This remains application
    # preflight; it does not defeat hostile local users racing filesystem paths.
    $InputFile=Get-ProtectionCheckedFilePath $InputFile 'existing'
    $OutputFile=Get-ProtectionCheckedFilePath $OutputFile 'new' $workspaceRoot
    $workspaceJob=New-Object PortableWorkspace.ChildJob
    $workspaceEnvironment=Get-WorkspaceChildEnvironment ([Environment]::GetEnvironmentVariables()) (Join-Path $workspaceRoot 'console') 'http://127.0.0.1:8787' ([guid]::NewGuid().ToString('N'))
    $workspaceInfo=New-Object Diagnostics.ProcessStartInfo;$workspaceInfo.FileName=Join-Path $workspaceRoot 'runtime\node.exe';$workspaceInfo.WorkingDirectory=$workspaceRoot
    $workspaceInfo.UseShellExecute=$false;$workspaceInfo.CreateNoWindow=$true;$workspaceInfo.WindowStyle='Hidden';$workspaceInfo.RedirectStandardInput=$true;$workspaceInfo.RedirectStandardOutput=$true;$workspaceInfo.RedirectStandardError=$true
    $workspaceInfo.StandardOutputEncoding=[Text.UTF8Encoding]::new($false);$workspaceInfo.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
    $workspaceInfo.EnvironmentVariables.Clear();foreach($workspaceName in $workspaceEnvironment.Keys){$workspaceInfo.EnvironmentVariables[$workspaceName]=[string]$workspaceEnvironment[$workspaceName]}
    $workspaceInfo.Arguments=(@((Join-Path $workspaceRoot 'protection\native-protected-tools.mjs'),$Action,$InputFile,$OutputFile)|ForEach-Object{ConvertTo-WorkspaceArgument $_})-join' '
    $workspaceProcess=New-Object Diagnostics.Process;$workspaceProcess.StartInfo=$workspaceInfo
    if(!$workspaceProcess.Start()){throw 'The owned protection process could not start.'}
    $workspaceProcessId=$workspaceProcess.Id;$workspaceProcessStart=$workspaceProcess.StartTime.ToUniversalTime()
    $workspaceJob.Attach($workspaceProcess)
    $workspaceOutput=New-Object PortableWorkspace.PipeReader($workspaceProcess.StandardOutput,4096);$workspaceErrors=New-Object PortableWorkspace.PipeReader($workspaceProcess.StandardError,4096)
    $workspaceKeyInput=[ordered]@{version=1;recovery=@($workspaceWords)}|ConvertTo-Json -Compress
    $workspaceProcess.StandardInput.WriteLine($workspaceKeyInput);$workspaceProcess.StandardInput.Close();$workspaceWords=$null;$workspaceKeyInput=$null
    $workspaceRecord=Read-ProtectionCompletion $workspaceProcess $workspaceOutput $workspaceErrors $Action $OutputFile
    $null=Get-ProtectionCheckedFilePath $OutputFile 'existing' $workspaceRoot
    Write-Host ('Saved: '+$OutputFile)
    if($Action-eq'native-open'){Write-Host 'The outer native package is decrypted to your selected ZIP; no contents were automatically extracted.'}
    $workspaceExit=0
} catch {
    Write-Host 'Could not complete the operation. Check the package, four words, source file and a new output filename outside this workspace.'
    $workspaceExit=1
} finally {
    if($workspaceBstr-ne[IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($workspaceBstr)}
    if($workspaceSecret){$workspaceSecret.Dispose()};$workspaceWords=$null;$workspaceKeyInput=$null
    if($workspaceProcess) {
        try{if($workspaceProcess.HasExited-eq$false-and(Test-WorkspaceOwnedProcess $workspaceProcess $workspaceProcessId $workspaceProcessStart)){try{$workspaceProcess.Kill();$null=$workspaceProcess.WaitForExit(2000)}catch{}}}catch{}
        $workspaceProcess.Dispose()
    }
    foreach($workspaceReader in @($workspaceOutput,$workspaceErrors)){if($workspaceReader){$workspaceReader.Dispose()}}
    if($workspaceJob){$workspaceJob.Dispose()}
}
exit $workspaceExit
