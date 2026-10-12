param([string]$WorkspaceRoot=(Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Workspace-Tor.ps1')
$taskResults=New-Object 'Collections.Generic.List[object]'
function Check-Tor([string]$Name,[scriptblock]$Test){try{& $Test;$taskResults.Add([pscustomobject]@{name=$Name;passed=$true})}catch{$taskResults.Add([pscustomobject]@{name=$Name;passed=$false;detail=$_.Exception.Message})}}
function Assert-Tor([bool]$Condition,[string]$Detail){if(!$Condition){throw $Detail}}
function Rejects-Tor([scriptblock]$Operation){$taskRejected=$false;try{& $Operation|Out-Null}catch{$taskRejected=$true};Assert-Tor $taskRejected 'The invalid operation was accepted.'}
$taskTestRelative='network-state\tor-supervisor-tests\'+[Guid]::NewGuid().ToString('N')
$taskTestRoot=Get-WorkspaceTorContainedPath $WorkspaceRoot $taskTestRelative
Set-WorkspaceTorPrivateDirectory $taskTestRoot
try{
    Check-Tor 'loopback-only SOCKS/control and v3 onion mapping' {
        $taskPlan=Get-WorkspaceTorPlan $taskTestRoot
        Assert-Tor ($taskPlan.Config-match'(?m)^SocksPort 127\.0\.0\.1:19150 IsolateSOCKSAuth\r?$') 'SOCKS binding changed.'
        Assert-Tor ($taskPlan.Config-match'(?m)^ControlPort 127\.0\.0\.1:19151\r?$') 'Control binding changed.'
        Assert-Tor ($taskPlan.Config-match'(?m)^CookieAuthentication 1\r?$') 'Control authentication missing.'
        Assert-Tor ($taskPlan.Config-match'(?m)^HiddenServiceVersion 3\r?$'-and$taskPlan.Config-match'(?m)^HiddenServicePort 80 127\.0\.0\.1:8788\r?$') 'Onion mapping changed.'
        Assert-Tor ($taskPlan.Config-match'(?m)^UseBridges 0\r?$'-and$taskPlan.Config-notmatch'(?m)^(Bridge|ClientTransportPlugin|ORPort|DirPort)\b') 'Old bridges or public relay listeners enabled.'
    }
    Check-Tor 'mutable identity stays outside runtime and has owning controller' {
        $taskPlan=Get-WorkspaceTorPlan $taskTestRoot -OwnerProcessId $PID
        Assert-Tor ($taskPlan.OnionRoot.StartsWith($taskTestRoot+'\network-state\')) 'Onion keys are inside runtime.'
        Assert-Tor ($taskPlan.Config-match('__OwningControllerProcess '+$PID+'\r?\n')) 'Owning controller missing.'
        $taskOff=Get-WorkspaceTorPlan $taskTestRoot -ControlPort 0
        Assert-Tor ($taskOff.Config-match'(?m)^ControlPort 0\r?$'-and$taskOff.Config-notmatch'CookieAuthentication') 'Optional disabled control port changed.'
    }
    Check-Tor 'Windows configuration paths retain absolute drive syntax and escaped backslashes' {
        $taskQuoted=ConvertTo-WorkspaceTorConfigPath 'D:\Codex\A path with spaces\network-state\tor'
        Assert-Tor ($taskQuoted-ceq'"D:\\Codex\\A path with spaces\\network-state\\tor"') 'Windows Tor path encoding changed.'
        $taskPlan=Get-WorkspaceTorPlan $taskTestRoot
        Assert-Tor ($taskPlan.Config-notmatch'[A-Z]:/') 'Tor config contains forward-slash drive paths.'
        foreach($taskLine in ($taskPlan.Config-split"`r?`n"|Where-Object {$_-match'^(DataDirectory|CookieAuthFile|HiddenServiceDir) '})) {Assert-Tor ($taskLine-match'"[A-Z]:\\\\') 'Tor config path lost its absolute Windows drive prefix.'}
        Assert-Tor ($taskPlan.Config-match'(?m)^Log notice stdout\r?$'-and$taskPlan.Config-notmatch'Log notice file') 'Tor notice logging must use bounded stdout.'
        Rejects-Tor {ConvertTo-WorkspaceTorConfigPath 'relative\data'};Rejects-Tor {ConvertTo-WorkspaceTorConfigPath "D:\bad`npath"}
    }
    Check-Tor 'startup output capture retains a bounded tail and drains to EOF' {
        if(!('PortableWorkspace.TorOutput'-as[type])){Add-Type -Path (Join-Path $PSScriptRoot 'Tor-Output.cs')}
        $taskReader=New-Object PortableWorkspace.TorOutput((New-Object IO.StringReader(('a'*10000)+'end')),8192)
        try{
            $taskDeadline=[Diagnostics.Stopwatch]::StartNew();while(!$taskReader.Ended-and$taskDeadline.ElapsedMilliseconds-lt2000){Start-Sleep -Milliseconds 10}
            Assert-Tor $taskReader.Ended 'Output capture failed to drain.'
            Assert-Tor ($taskReader.Text.Length-eq8192-and$taskReader.Text.EndsWith('end')) 'Output diagnostic tail exceeded its bound.'
            Assert-Tor (!$taskReader.Failure) 'Output capture reported an unexpected failure.'
        }finally{$taskReader.Dispose()}
    }
    Check-Tor 'bootstrap progress survives output-tail rotation and public metadata omits diagnostics' {
        $taskProcess=[Diagnostics.Process]::GetCurrentProcess()
        try{
            $taskPlan=Get-WorkspaceTorPlan $taskTestRoot
            $null=[IO.Directory]::CreateDirectory($taskPlan.OnionRoot);[IO.File]::WriteAllText((Join-Path $taskPlan.OnionRoot 'hostname'),(('a'*56)+'.onion'))
            $taskOut=[pscustomobject]@{Text='[notice] Bootstrapped 100% (done): Done';Ended=$true}
            $taskHandle=[pscustomobject]@{Process=$taskProcess;ProcessId=$taskProcess.Id;StartedUtc=$taskProcess.StartTime.ToUniversalTime();Executable=[IO.Path]::GetFullPath($taskProcess.MainModule.FileName);Plan=$taskPlan;BootstrapPercent=0;Stdout=$taskOut;Stderr=[pscustomobject]@{Text='Synthetic private startup diagnostic';Ended=$true}}
            $taskFirst=Get-WorkspaceTorStatus $taskHandle;Assert-Tor ($taskFirst.bootstrapped-and$taskFirst.bootstrap_percent-eq100) 'Completed bootstrap was not observed.'
            $taskOut.Text='x'*8192;$taskNext=Get-WorkspaceTorStatus $taskHandle;Assert-Tor ($taskNext.bootstrapped-and$taskNext.bootstrap_percent-eq100) 'Output-tail rotation forgot completed bootstrap.'
            $taskPublic=[IO.File]::ReadAllText((Join-Path $taskPlan.StateRoot 'peer-endpoint.json'))
            Assert-Tor ($taskPublic-notmatch'startup_stdout|startup_stderr|Synthetic private') 'Private diagnostic entered public endpoint metadata.'
        }finally{$taskProcess.Dispose()}
    }
    Check-Tor 'invalid and duplicate ports rejected' {
        foreach($taskValue in @(-1,0,65536)){Rejects-Tor {Get-WorkspaceTorPlan $taskTestRoot -PeerPort $taskValue};Rejects-Tor {Get-WorkspaceTorPlan $taskTestRoot -SocksPort $taskValue}}
        Rejects-Tor {Get-WorkspaceTorPlan $taskTestRoot -ControlPort 65536}
        Rejects-Tor {Get-WorkspaceTorPlan $taskTestRoot -PeerPort 19150}
        Rejects-Tor {Get-WorkspaceTorPlan $taskTestRoot -ControlPort 8788}
        Rejects-Tor {Get-WorkspaceTorPlan $taskTestRoot -OwnerProcessId 0}
    }
    Check-Tor 'loopback probe rejects occupied ports and releases its own socket' {
        $taskListener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0)
        try{
            $taskListener.Server.ExclusiveAddressUse=$true;$taskListener.Start(1);$taskPort=$taskListener.LocalEndpoint.Port
            Rejects-Tor {Assert-WorkspaceTorPortAvailable $taskPort}
            Assert-Tor $taskListener.Server.IsBound 'Probe disturbed the existing listener.'
        }finally{$taskListener.Stop()}
        Assert-WorkspaceTorPortAvailable $taskPort
        $taskReplacement=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$taskPort)
        try{$taskReplacement.Server.ExclusiveAddressUse=$true;$taskReplacement.Start(1);Assert-Tor $taskReplacement.Server.IsBound 'Probe retained its socket.'}finally{$taskReplacement.Stop()}
        Rejects-Tor {Assert-WorkspaceTorPortAvailable 0};Rejects-Tor {Assert-WorkspaceTorPortAvailable 65536}
    }
    Check-Tor 'path escapes and config injection rejected' {
        Rejects-Tor {Get-WorkspaceTorContainedPath $taskTestRoot '..\outside'}
        Rejects-Tor {Get-WorkspaceTorContainedPath $taskTestRoot 'D:\outside'}
        Rejects-Tor {Get-WorkspaceTorPlan ($taskTestRoot+"`r`nControlPort 0")}
    }
    Check-Tor 'private directory ACL removes inherited broad access' {
        $taskAcl=Get-Acl -LiteralPath $taskTestRoot
        Assert-Tor $taskAcl.AreAccessRulesProtected 'Directory inherited broad access.'
        foreach($taskRule in $taskAcl.Access){Assert-Tor ($taskRule.AccessControlType-eq'Allow'-and$taskRule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value-in@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')) 'Unexpected private-directory principal.'}
    }
    Check-Tor 'SAFECOOKIE HMAC primitive matches standard known answer' {
        $taskHash=Get-WorkspaceTorHmac ([Text.Encoding]::ASCII.GetBytes('The quick brown fox jumps over the lazy dog')) 'key'
        Assert-Tor ([BitConverter]::ToString($taskHash).Replace('-','').ToLowerInvariant()-eq'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8') 'HMAC result changed.'
    }
    Check-Tor 'challenge hex is exact 32 bytes' {
        Assert-Tor ((ConvertFrom-WorkspaceTorHex ('ab'*32)).Length-eq32) 'Challenge length changed.'
        Rejects-Tor {ConvertFrom-WorkspaceTorHex ('ab'*31)};Rejects-Tor {ConvertFrom-WorkspaceTorHex ('gg'*32)}
    }
    Check-Tor 'control replies require CRLF and bounded printable lines' {
        $taskStream=New-Object IO.MemoryStream(,[Text.Encoding]::ASCII.GetBytes("250 OK`r`n"));try{Assert-Tor ((Read-WorkspaceTorControlLine $taskStream ([DateTime]::UtcNow.AddSeconds(2)))-eq'250 OK') 'Control reply changed.'}finally{$taskStream.Dispose()}
        foreach($taskText in @("250 OK`n",(('a'*513)+"`r`n"),"250`0bad`r`n")){$taskStream=New-Object IO.MemoryStream(,[Text.Encoding]::ASCII.GetBytes($taskText));try{Rejects-Tor {Read-WorkspaceTorControlLine $taskStream ([DateTime]::UtcNow.AddSeconds(2))}}finally{$taskStream.Dispose()}}
    }
    Check-Tor 'process guards reject mismatched PID/start/executable and fabricated processes' {
        $taskProcess=[Diagnostics.Process]::GetCurrentProcess()
        try{
            $taskHandle=[pscustomobject]@{Process=$taskProcess;ProcessId=$taskProcess.Id;StartedUtc=$taskProcess.StartTime.ToUniversalTime();Executable=[IO.Path]::GetFullPath($taskProcess.MainModule.FileName)}
            Assert-Tor (Test-WorkspaceTorOwnedProcess $taskHandle) 'Current-process test control failed.'
            $taskHandle.ProcessId++;Assert-Tor (!(Test-WorkspaceTorOwnedProcess $taskHandle)) 'Wrong PID accepted.';$taskHandle.ProcessId--
            $taskHandle.StartedUtc=$taskHandle.StartedUtc.AddSeconds(1);Assert-Tor (!(Test-WorkspaceTorOwnedProcess $taskHandle)) 'Wrong start time accepted.';$taskHandle.StartedUtc=$taskProcess.StartTime.ToUniversalTime()
            $taskHandle.Executable='D:\unrelated.exe';Assert-Tor (!(Test-WorkspaceTorOwnedProcess $taskHandle)) 'Wrong executable accepted.'
            Assert-Tor (!(Test-WorkspaceTorOwnedProcess ([pscustomobject]@{Process=@{Id=$PID}}))) 'Fabricated process accepted.'
        }finally{$taskProcess.Dispose()}
    }
    Check-Tor 'runtime requires publisher verification and exact file hashes/inventory' {
        $taskRuntime=Get-WorkspaceTorContainedPath $taskTestRoot 'network\tor\runtime';$taskExe=Get-WorkspaceTorContainedPath $taskTestRoot 'network\tor\runtime\tor\tor.exe'
        $null=[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($taskExe));[IO.File]::WriteAllText($taskExe,'Non-executable deterministic integrity fixture.')
        $taskManifestPath=Get-WorkspaceTorContainedPath $taskTestRoot 'network\tor\verified-runtime.json'
        $taskManifest=@{version=1;signature_verified=$true;signature_primary_fingerprint='EF6E286DDA85EA2A4BA7DE684E2C6E8793298290';files=@(@{path='tor/tor.exe';sha256=(Get-FileHash -LiteralPath $taskExe -Algorithm SHA256).Hash.ToLowerInvariant()})}
        [IO.File]::WriteAllText($taskManifestPath,($taskManifest|ConvertTo-Json -Depth 5))
        Assert-Tor ((Assert-WorkspaceTorRuntime $taskTestRoot)-eq$taskExe) 'Valid inventory rejected.'
        [IO.File]::AppendAllText($taskExe,'tampered');Rejects-Tor {Assert-WorkspaceTorRuntime $taskTestRoot}
        [IO.File]::WriteAllText($taskExe,'Non-executable deterministic integrity fixture.');[IO.File]::WriteAllText((Join-Path $taskRuntime 'unlisted.dll'),'fixture');Rejects-Tor {Assert-WorkspaceTorRuntime $taskTestRoot}
        $taskManifest.signature_verified=$false;[IO.File]::WriteAllText($taskManifestPath,($taskManifest|ConvertTo-Json -Depth 5));Rejects-Tor {Assert-WorkspaceTorRuntime $taskTestRoot}
    }
}finally{
    $taskChecked=Get-WorkspaceTorContainedPath $WorkspaceRoot $taskTestRelative
    if($taskChecked-eq$taskTestRoot-and(Test-Path -LiteralPath $taskTestRoot)){Remove-Item -LiteralPath $taskTestRoot -Recurse -Force}
}
$taskFailures=@($taskResults|Where-Object {!$_.passed})
[pscustomobject]@{tests=$taskResults.Count;passed=$taskResults.Count-$taskFailures.Count;failed=$taskFailures.Count;external_network_started=$false;tor_executed=$false;results=$taskResults.ToArray()}|ConvertTo-Json -Depth 5 -Compress
if($taskFailures.Count){exit 1}
