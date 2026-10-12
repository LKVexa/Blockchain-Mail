# Dot-source after the workspace launcher has verified its sealed files.
# Mutable Tor identity and logs remain outside the packaged runtime.
$script:WorkspaceTorModuleRoot=$PSScriptRoot

function ConvertTo-WorkspaceTorConfigPath([string]$Path) {
    if(![IO.Path]::IsPathRooted($Path)-or$Path-match'[\x00-\x1f"]'){throw 'Tor requires a quoted absolute Windows path.'}
    return '"'+$Path.Replace('\','\\')+'"'
}

function Get-WorkspaceTorContainedPath([string]$Root,[string]$Relative) {
    $taskBase=[IO.Path]::GetFullPath($Root).TrimEnd('\')
    if($taskBase-match'[\x00-\x1f"]'-or[IO.Path]::IsPathRooted($Relative)){throw 'Invalid Tor workspace path.'}
    $taskPath=[IO.Path]::GetFullPath((Join-Path $taskBase $Relative))
    if(!$taskPath.StartsWith($taskBase+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Tor paths must stay inside this workspace.'}
    $taskCursor=$taskPath
    while($taskCursor-and$taskCursor.StartsWith($taskBase,[StringComparison]::OrdinalIgnoreCase)){
        if(Test-Path -LiteralPath $taskCursor){if((Get-Item -LiteralPath $taskCursor -Force).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'Tor paths cannot use junctions or symbolic links.'}}
        if($taskCursor-eq$taskBase){break};$taskCursor=[IO.Path]::GetDirectoryName($taskCursor)
    }
    return $taskPath
}

function Get-WorkspaceTorSha256([string]$Path) {
    $taskStream=[IO.File]::OpenRead($Path);$taskHasher=[Security.Cryptography.SHA256]::Create()
    try{return [BitConverter]::ToString($taskHasher.ComputeHash($taskStream)).Replace('-','').ToLowerInvariant()}finally{$taskHasher.Dispose();$taskStream.Dispose()}
}

function Set-WorkspaceTorPrivateDirectory([string]$Path) {
    $null=[IO.Directory]::CreateDirectory($Path)
    $taskUser=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $taskAcl=New-Object Security.AccessControl.DirectorySecurity
    $taskAcl.SetAccessRuleProtection($true,$false)
    $taskInheritance=[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
    $taskPropagation=[Security.AccessControl.PropagationFlags]::None
    foreach($taskSid in @($taskUser,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),(New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))){
        $taskRule=New-Object Security.AccessControl.FileSystemAccessRule($taskSid,[Security.AccessControl.FileSystemRights]::FullControl,$taskInheritance,$taskPropagation,[Security.AccessControl.AccessControlType]::Allow)
        $null=$taskAcl.AddAccessRule($taskRule)
    }
    $taskDirectory=New-Object IO.DirectoryInfo($Path)
    if($taskDirectory.PSObject.Methods['SetAccessControl']){$taskDirectory.SetAccessControl($taskAcl)}else{[IO.FileSystemAclExtensions]::SetAccessControl($taskDirectory,$taskAcl)}
}

function Get-WorkspaceTorPlan {
    param([Parameter(Mandatory=$true)][string]$WorkspaceRoot,[int]$PeerPort=8788,[int]$SocksPort=19150,[int]$ControlPort=19151,[int]$OwnerProcessId=$PID)
    foreach($taskPort in @($PeerPort,$SocksPort)){if($taskPort-lt1-or$taskPort-gt65535){throw 'Tor ports must be between 1 and 65535.'}}
    if($ControlPort-lt0-or$ControlPort-gt65535-or$PeerPort-eq$SocksPort-or($ControlPort-gt0-and($ControlPort-eq$PeerPort-or$ControlPort-eq$SocksPort))){throw 'Tor requires distinct local ports.'}
    if($OwnerProcessId-lt1){throw 'An owning launcher process is required.'}
    $taskState=Get-WorkspaceTorContainedPath $WorkspaceRoot 'network-state\tor'
    $taskRuntime=Get-WorkspaceTorContainedPath $WorkspaceRoot 'network\tor\runtime'
    $taskData=Get-WorkspaceTorContainedPath $WorkspaceRoot 'network-state\tor\data'
    $taskOnion=Get-WorkspaceTorContainedPath $WorkspaceRoot 'network-state\tor\onion-service'
    $taskLog=Get-WorkspaceTorContainedPath $WorkspaceRoot 'network-state\tor\notice.log'
    $taskConfig=Get-WorkspaceTorContainedPath $WorkspaceRoot 'network-state\tor\torrc'
    $taskCookie=Get-WorkspaceTorContainedPath $WorkspaceRoot 'network-state\tor\control_auth_cookie'
    $taskLines=@('ClientOnly 1','UseBridges 0','SafeSocks 1','SafeLogging 1','AvoidDiskWrites 1',('SocksPort 127.0.0.1:'+$SocksPort+' IsolateSOCKSAuth'),'SocksPolicy accept 127.0.0.1/32','SocksPolicy reject *',('DataDirectory '+(ConvertTo-WorkspaceTorConfigPath $taskData)),'Log notice stdout',('__OwningControllerProcess '+$OwnerProcessId))
    if($ControlPort-gt0){$taskLines+=@(('ControlPort 127.0.0.1:'+$ControlPort),'CookieAuthentication 1',('CookieAuthFile '+(ConvertTo-WorkspaceTorConfigPath $taskCookie)))}else{$taskLines+='ControlPort 0'}
    foreach($taskGeo in @(@('GeoIPFile','geoip'),@('GeoIPv6File','geoip6'))){$taskGeoPath=Join-Path $taskRuntime ('data\'+$taskGeo[1]);if(Test-Path -LiteralPath $taskGeoPath){$taskLines+=($taskGeo[0]+' '+(ConvertTo-WorkspaceTorConfigPath $taskGeoPath))}}
    $taskLines+=@(('HiddenServiceDir '+(ConvertTo-WorkspaceTorConfigPath $taskOnion)),'HiddenServiceVersion 3',('HiddenServicePort 80 127.0.0.1:'+$PeerPort))
    return [pscustomobject]@{WorkspaceRoot=[IO.Path]::GetFullPath($WorkspaceRoot);StateRoot=$taskState;RuntimeRoot=$taskRuntime;DataRoot=$taskData;OnionRoot=$taskOnion;LogPath=$taskLog;ConfigPath=$taskConfig;CookiePath=$taskCookie;PeerPort=$PeerPort;SocksPort=$SocksPort;ControlPort=$ControlPort;OwnerProcessId=$OwnerProcessId;Config=($taskLines-join"`r`n")+"`r`n"}
}

function Assert-WorkspaceTorRuntime([string]$WorkspaceRoot) {
    $taskRuntime=Get-WorkspaceTorContainedPath $WorkspaceRoot 'network\tor\runtime'
    $taskManifestPath=Get-WorkspaceTorContainedPath $WorkspaceRoot 'network\tor\verified-runtime.json'
    if(!(Test-Path -LiteralPath $taskManifestPath -PathType Leaf)){throw 'Install a verified Tor Expert Bundle before enabling private peer mail.'}
    $taskManifest=Get-Content -LiteralPath $taskManifestPath -Raw|ConvertFrom-Json
    if($taskManifest.version-ne1-or$taskManifest.signature_verified-ne$true-or$taskManifest.signature_primary_fingerprint-ne'EF6E286DDA85EA2A4BA7DE684E2C6E8793298290'-or!$taskManifest.files-or$taskManifest.files.Count-gt1024){throw 'Tor runtime verification record is invalid.'}
    $taskSeen=@{}
    foreach($taskEntry in $taskManifest.files){
        if($taskEntry.path-notmatch'^[A-Za-z0-9_./-]+$'-or$taskEntry.sha256-notmatch'^[a-f0-9]{64}$'-or$taskSeen.ContainsKey($taskEntry.path)){throw 'Tor runtime manifest entry is invalid.'}
        $taskSeen[$taskEntry.path]=$true
        $taskFile=Get-WorkspaceTorContainedPath $taskRuntime $taskEntry.path
        if(!(Test-Path -LiteralPath $taskFile -PathType Leaf)-or(Get-WorkspaceTorSha256 $taskFile)-ne$taskEntry.sha256){throw 'Tor runtime file failed its recorded integrity check.'}
    }
    $taskActual=@(Get-ChildItem -LiteralPath $taskRuntime -Recurse -File -Force)
    if($taskActual.Count-ne$taskSeen.Count){throw 'Tor runtime contains unrecorded files.'}
    foreach($taskFile in $taskActual){$taskRelative=$taskFile.FullName.Substring($taskRuntime.Length+1).Replace('\','/');if(!$taskSeen.ContainsKey($taskRelative)-or($taskFile.Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Tor runtime contains an unrecorded or linked file.'}}
    $taskExecutable=Get-WorkspaceTorContainedPath $taskRuntime 'tor\tor.exe'
    if(!$taskSeen.ContainsKey('tor/tor.exe')){throw 'The verified Tor executable is missing.'}
    return $taskExecutable
}

function Test-WorkspaceTorOwnedProcess($Handle) {
    try{if(!($Handle.Process-is[Diagnostics.Process])){return $false};$Handle.Process.Refresh();return !$Handle.Process.HasExited-and$Handle.Process.Id-eq$Handle.ProcessId-and$Handle.Process.StartTime.ToUniversalTime()-eq$Handle.StartedUtc-and[IO.Path]::GetFullPath($Handle.Process.MainModule.FileName)-eq$Handle.Executable}catch{return $false}
}

function Assert-WorkspaceTorPortAvailable([int]$Port) {
    if($Port-lt1-or$Port-gt65535){throw 'Tor ports must be between 1 and 65535.'}
    $taskProbe=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$Port)
    try{
        $taskProbe.Server.ExclusiveAddressUse=$true
        $taskProbe.Start(1)
    }catch{throw 'A requested Tor loopback port is unavailable. No existing process was stopped.'}finally{$taskProbe.Stop()}
}

function Start-WorkspaceTor {
    param([Parameter(Mandatory=$true)][string]$WorkspaceRoot,[int]$PeerPort=8788,[int]$SocksPort=19150,[int]$ControlPort=19151,[int]$OwnerProcessId=$PID)
    $taskPlan=Get-WorkspaceTorPlan -WorkspaceRoot $WorkspaceRoot -PeerPort $PeerPort -SocksPort $SocksPort -ControlPort $ControlPort -OwnerProcessId $OwnerProcessId
    $taskExecutable=Assert-WorkspaceTorRuntime $WorkspaceRoot
    if(!('PortableWorkspace.TorOutput'-as[type])){Add-Type -Path (Join-Path $script:WorkspaceTorModuleRoot 'Tor-Output.cs')}
    Set-WorkspaceTorPrivateDirectory $taskPlan.StateRoot
    $taskLockPath=Get-WorkspaceTorContainedPath $WorkspaceRoot 'network-state\tor\workspace-owner.lock'
    try{$taskLock=[IO.File]::Open($taskLockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{throw 'This workspace Tor identity already has an owning launcher. No existing process was stopped.'}
    $taskProcess=$null
    try{
        foreach($taskDirectory in @($taskPlan.DataRoot,$taskPlan.OnionRoot)){Set-WorkspaceTorPrivateDirectory $taskDirectory}
        # Probe only the intended loopback sockets. Global listener/process
        # enumeration is unnecessary and unavailable in restricted launchers.
        foreach($taskPort in @($SocksPort,$ControlPort)){if($taskPort-gt0){Assert-WorkspaceTorPortAvailable $taskPort}}
        [IO.File]::WriteAllText($taskPlan.ConfigPath,$taskPlan.Config,(New-Object Text.UTF8Encoding($false)))
        $taskInfo=New-Object Diagnostics.ProcessStartInfo
        $taskInfo.FileName=$taskExecutable;$taskInfo.WorkingDirectory=$taskPlan.RuntimeRoot;$taskInfo.UseShellExecute=$false;$taskInfo.CreateNoWindow=$true;$taskInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
        $taskInfo.RedirectStandardOutput=$true;$taskInfo.RedirectStandardError=$true
        $taskInfo.Arguments='-f "'+$taskPlan.ConfigPath+'"'
        $taskProcess=New-Object Diagnostics.Process;$taskProcess.StartInfo=$taskInfo
        if(!$taskProcess.Start()){throw 'The owned Tor process could not start.'}
        $taskHandle=[pscustomobject]@{Process=$taskProcess;ProcessId=$taskProcess.Id;StartedUtc=$taskProcess.StartTime.ToUniversalTime();Executable=$taskExecutable;Plan=$taskPlan;Lock=$taskLock;BootstrapPercent=0;Stdout=(New-Object PortableWorkspace.TorOutput($taskProcess.StandardOutput,8192));Stderr=(New-Object PortableWorkspace.TorOutput($taskProcess.StandardError,8192))}
        return $taskHandle
    }catch{if($taskProcess){try{$taskProcess.Dispose()}catch{}};$taskLock.Dispose();throw}
}

function Get-WorkspaceTorStatus($Handle) {
    $taskAlive=Test-WorkspaceTorOwnedProcess $Handle;$taskProgress=0;$taskOnion=$null
    if(!$taskAlive-and($Handle.Stdout-or$Handle.Stderr)){
        # An exited process can precede pipe EOF by a scheduler tick. Give the
        # bounded readers a short chance to retain the last startup diagnostic.
        $taskDrain=[Diagnostics.Stopwatch]::StartNew()
        while($taskDrain.ElapsedMilliseconds-lt200-and(($Handle.Stdout-and!$Handle.Stdout.Ended)-or($Handle.Stderr-and!$Handle.Stderr.Ended))){Start-Sleep -Milliseconds 10}
    }
    if($taskAlive){
        $taskProgress=[int]$Handle.BootstrapPercent
        if($Handle.Stdout){
            foreach($taskMatch in [Text.RegularExpressions.Regex]::Matches($Handle.Stdout.Text,'Bootstrapped ([0-9]{1,3})%')){$taskProgress=[Math]::Max($taskProgress,[Math]::Min(100,[int]$taskMatch.Groups[1].Value))}
        }
        $Handle.BootstrapPercent=$taskProgress
    }
    $taskHostPath=Get-WorkspaceTorContainedPath $Handle.Plan.WorkspaceRoot 'network-state\tor\onion-service\hostname'
    if($taskAlive-and(Test-Path -LiteralPath $taskHostPath -PathType Leaf)-and(Get-Item -LiteralPath $taskHostPath).Length-le128){$taskCandidate=[IO.File]::ReadAllText($taskHostPath).Trim();if($taskCandidate-cmatch'^[a-z2-7]{56}\.onion$'){$taskOnion=$taskCandidate}}
    $taskStatus=[pscustomobject]@{alive=$taskAlive;bootstrapped=($taskAlive-and$taskProgress-eq100);bootstrap_percent=$taskProgress;onion_host=$taskOnion;virtual_port=80;peer_port=$Handle.Plan.PeerPort;socks_host='127.0.0.1';socks_port=$Handle.Plan.SocksPort;startup_stdout=$(if($Handle.Stdout){$Handle.Stdout.Text}else{''});startup_stderr=$(if($Handle.Stderr){$Handle.Stderr.Text}else{''})}
    if($taskStatus.bootstrapped-and$taskOnion){$taskMeta=Get-WorkspaceTorContainedPath $Handle.Plan.WorkspaceRoot 'network-state\tor\peer-endpoint.json';$taskPublic=$taskStatus|Select-Object alive,bootstrapped,bootstrap_percent,onion_host,virtual_port,peer_port,socks_host,socks_port;[IO.File]::WriteAllText($taskMeta,($taskPublic|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))}
    return $taskStatus
}

function Wait-WorkspaceTorIdentity {
    param([Parameter(Mandatory=$true)]$Handle,[ValidateRange(1,60)][int]$TimeoutSeconds=30,[scriptblock]$Pump)
    $taskTimer=[Diagnostics.Stopwatch]::StartNew()
    while($taskTimer.Elapsed.TotalSeconds-lt$TimeoutSeconds){
        if($Pump){$null=& $Pump}
        $taskStatus=Get-WorkspaceTorStatus $Handle
        if(!$taskStatus.alive){
            $taskDiagnostic=($taskStatus.startup_stderr+"`n"+$taskStatus.startup_stdout).Trim()
            if($taskDiagnostic.Length-gt2048){$taskDiagnostic=$taskDiagnostic.Substring($taskDiagnostic.Length-2048)}
            throw ('The owned Tor process stopped before its private mail address became available.'+$(if($taskDiagnostic){"`n"+$taskDiagnostic}else{''}))
        }
        if($taskStatus.onion_host){return $taskStatus}
        Start-Sleep -Milliseconds 100
    }
    throw 'Tor did not create its private mail address within the startup time limit.'
}

function Read-WorkspaceTorControlLine($Stream,[DateTime]$Deadline) {
    $taskBytes=New-Object 'Collections.Generic.List[byte]'
    while($taskBytes.Count-lt512){
        if([DateTime]::UtcNow-ge$Deadline){throw 'Tor control response timed out.'}
        $taskByte=$Stream.ReadByte();if($taskByte-lt0){throw 'Tor control connection ended.'}
        if($taskByte-eq10){if(!$taskBytes.Count-or$taskBytes[$taskBytes.Count-1]-ne13){throw 'Invalid Tor control response.'};$taskBytes.RemoveAt($taskBytes.Count-1);return [Text.Encoding]::ASCII.GetString($taskBytes.ToArray())}
        if($taskByte-ne13-and($taskByte-lt32-or$taskByte-gt126)){throw 'Invalid Tor control response.'};$taskBytes.Add([byte]$taskByte)
    }
    throw 'Tor control response exceeded its limit.'
}

function Get-WorkspaceTorHmac([byte[]]$Bytes,[string]$Label) {
    $taskHmac=New-Object Security.Cryptography.HMACSHA256
    try{$taskHmac.Key=[Text.Encoding]::ASCII.GetBytes($Label);return ,$taskHmac.ComputeHash($Bytes)}finally{$taskHmac.Dispose()}
}
function ConvertFrom-WorkspaceTorHex([string]$Hex) {
    if($Hex-notmatch'^[a-fA-F0-9]{64}$'){throw 'Invalid Tor authentication challenge.'}
    $taskBytes=New-Object byte[] 32;for($taskIndex=0;$taskIndex-lt32;$taskIndex++){$taskBytes[$taskIndex]=[Convert]::ToByte($Hex.Substring($taskIndex*2,2),16)};return ,$taskBytes
}

function Invoke-WorkspaceTorShutdown($Handle) {
    if($Handle.Plan.ControlPort-le0-or!(Test-WorkspaceTorOwnedProcess $Handle)){return $false}
    $taskCookie=$null;$taskPayload=$null;$taskClient=New-Object Net.Sockets.TcpClient
    try{
        $taskCookiePath=Get-WorkspaceTorContainedPath $Handle.Plan.WorkspaceRoot 'network-state\tor\control_auth_cookie'
        if((Get-Item -LiteralPath $taskCookiePath).Length-ne32){return $false}
        $taskCookie=[IO.File]::ReadAllBytes($taskCookiePath);if($taskCookie.Length-ne32){return $false}
        $taskConnect=$taskClient.ConnectAsync('127.0.0.1',$Handle.Plan.ControlPort);if(!$taskConnect.Wait(2000)){return $false}
        $taskStream=$taskClient.GetStream();$taskStream.ReadTimeout=2000;$taskStream.WriteTimeout=2000;$taskDeadline=[DateTime]::UtcNow.AddSeconds(4)
        $taskNonce=New-Object byte[] 32;$taskRng=[Security.Cryptography.RandomNumberGenerator]::Create();try{$taskRng.GetBytes($taskNonce)}finally{$taskRng.Dispose()}
        $taskCommand=[Text.Encoding]::ASCII.GetBytes('AUTHCHALLENGE SAFECOOKIE '+[BitConverter]::ToString($taskNonce).Replace('-','')+"`r`n");$taskStream.Write($taskCommand,0,$taskCommand.Length)
        $taskReply=Read-WorkspaceTorControlLine $taskStream $taskDeadline
        if($taskReply-notmatch'^250 AUTHCHALLENGE SERVERHASH=([A-Fa-f0-9]{64}) SERVERNONCE=([A-Fa-f0-9]{64})$'){return $false}
        $taskServerHash=ConvertFrom-WorkspaceTorHex $Matches[1];$taskServerNonce=ConvertFrom-WorkspaceTorHex $Matches[2]
        $taskPayload=New-Object byte[] 96;[Array]::Copy($taskCookie,0,$taskPayload,0,32);[Array]::Copy($taskNonce,0,$taskPayload,32,32);[Array]::Copy($taskServerNonce,0,$taskPayload,64,32)
        $taskExpected=Get-WorkspaceTorHmac $taskPayload 'Tor safe cookie authentication server-to-controller hash';$taskDifference=0;for($taskIndex=0;$taskIndex-lt32;$taskIndex++){$taskDifference=$taskDifference-bor($taskExpected[$taskIndex]-bxor$taskServerHash[$taskIndex])};if($taskDifference-ne0){return $false}
        $taskProof=Get-WorkspaceTorHmac $taskPayload 'Tor safe cookie authentication controller-to-server hash'
        $taskCommand=[Text.Encoding]::ASCII.GetBytes('AUTHENTICATE '+[BitConverter]::ToString($taskProof).Replace('-','')+"`r`n");$taskStream.Write($taskCommand,0,$taskCommand.Length)
        if((Read-WorkspaceTorControlLine $taskStream $taskDeadline)-ne'250 OK'){return $false}
        if(!(Test-WorkspaceTorOwnedProcess $Handle)){return $false}
        $taskCommand=[Text.Encoding]::ASCII.GetBytes("SIGNAL SHUTDOWN`r`n");$taskStream.Write($taskCommand,0,$taskCommand.Length);$taskStream.Flush();return $true
    }catch{return $false}finally{if($taskCookie){[Array]::Clear($taskCookie,0,$taskCookie.Length)};if($taskPayload){[Array]::Clear($taskPayload,0,$taskPayload.Length)};$taskClient.Dispose()}
}

function Stop-WorkspaceTor($Handle) {
    $taskGraceful=$false;$taskForced=$false
    try{
        if(Test-WorkspaceTorOwnedProcess $Handle){
            $taskGraceful=Invoke-WorkspaceTorShutdown $Handle
            if(!$Handle.Process.WaitForExit(8000)-and(Test-WorkspaceTorOwnedProcess $Handle)){$Handle.Process.Kill();$taskForced=$true;$null=$Handle.Process.WaitForExit(2000)}
        }
        return [pscustomobject]@{stopped=(!(Test-WorkspaceTorOwnedProcess $Handle));graceful=($taskGraceful-and!$taskForced);forced=$taskForced}
    }finally{if($Handle.Stdout){$Handle.Stdout.Dispose()};if($Handle.Stderr){$Handle.Stderr.Dispose()};if($Handle.Lock){$Handle.Lock.Dispose()};if($Handle.Process){$Handle.Process.Dispose()}}
}
