param([string]$Root,[string]$EvidencePath,[switch]$SkipIntegrity)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
if(!$Root){$Root=[IO.Path]::GetFullPath([IO.Path]::Combine($PSScriptRoot,'..'))}
if(!$EvidencePath){$EvidencePath=[IO.Path]::GetFullPath([IO.Path]::Combine($Root,'..','..','verification','console-presentation-verification.json'))}
function Get-PresentationHash([string]$Path){$stream=[IO.File]::OpenRead($Path);$sha=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose();$stream.Dispose()}}
$checks=New-Object 'System.Collections.Generic.List[object]'
function Check-Presentation([string]$Name,[scriptblock]$Action){try{&$Action;[void]$checks.Add([ordered]@{name=$Name;passed=$true})}catch{[void]$checks.Add([ordered]@{name=$Name;passed=$false;reason=$_.Exception.GetBaseException().Message})}}
function Require-Presentation([bool]$Value){if(!$Value){throw 'Presentation assertion failed.'}}
$sourceNames=@('host/JA21VirtualBrowser.cs','host/Vec1Substrate.cs','host/PortableDesktop.cs','host/LiveWebContracts.cs','host/LiveWebBridge.cs','host/Start-JA21Browser.ps1','tools/Test-ConsolePresentation.ps1','tools/CONSOLE_PRESENTATION.txt','READ ME - Console.txt','tools/Test-ConsoleReadiness.mjs')
$sourcePins=@($sourceNames|ForEach-Object{$path=[IO.Path]::Combine($Root,$_.Replace('/','\'));[ordered]@{path=$_;sha256=(Get-PresentationHash $path)}})
$scriptTokens=$null;$scriptErrors=$null
$launcherAst=[Management.Automation.Language.Parser]::ParseFile([IO.Path]::Combine($Root,'host','Start-JA21Browser.ps1'),[ref]$scriptTokens,[ref]$scriptErrors)
if($scriptErrors.Count){throw 'Console launcher does not parse.'}
$joinFunction=@($launcherAst.FindAll({param($node)$node-is[Management.Automation.Language.FunctionDefinitionAst]-and$node.Name-eq'Join-JA21CompilationUnits'},$false))[0]
. ([scriptblock]::Create($joinFunction.Extent.Text))
. ([IO.Path]::Combine($Root,'host','Wpf-CompileReferences.ps1'))
$refs=@(Get-JA21WpfCompileReferences)+@([IO.Path]::Combine($Root,'runtime','webview2-sdk','1.0.4191.47','Microsoft.Web.WebView2.Core.dll'),[IO.Path]::Combine($Root,'runtime','webview2-sdk','1.0.4191.47','Microsoft.Web.WebView2.Wpf.dll'))
$units=@($sourceNames|Select-Object -First 5|ForEach-Object{[IO.File]::ReadAllText([IO.Path]::Combine($Root,$_.Replace('/','\')),[Text.Encoding]::UTF8)})
Add-Type -TypeDefinition (Join-JA21CompilationUnits $units) -Language CSharp -ReferencedAssemblies $refs
Check-Presentation 'Exact five product units compile against pinned standard/composition SDK APIs' {Require-Presentation ($null-ne[VBJA21.BrowserWindow].Assembly)}
$surfaceType=[VBJA21.BrowserWindow].Assembly.GetType('VBJA21.WebView2LiveWebSurface',$true)
$resourcePolicy=$surfaceType.GetMethod('CheckConsoleResource',[Reflection.BindingFlags]'Static,NonPublic')
$navigationPolicy=$surfaceType.GetMethod('CheckConsoleNavigation',[Reflection.BindingFlags]'Static,NonPublic')
$filePermissionPolicy=$surfaceType.GetMethod('AllowConsoleFileAccess',[Reflection.BindingFlags]'Static,NonPublic')
$coreSdkAssembly=[Reflection.Assembly]::LoadFrom([IO.Path]::Combine($Root,'runtime','webview2-sdk','1.0.4191.47','Microsoft.Web.WebView2.Core.dll'))
$permissionKindType=$coreSdkAssembly.GetType('Microsoft.Web.WebView2.Core.CoreWebView2PermissionKind',$true)
$permissionEventType=$coreSdkAssembly.GetType('Microsoft.Web.WebView2.Core.CoreWebView2PermissionRequestedEventArgs',$true)
$filePermissionKind=[Enum]::Parse($permissionKindType,'FileReadWrite')
function Invoke-ConsoleResourcePolicy([string]$Address){$null=$resourcePolicy.Invoke($null,[object[]]@([Uri]$Address))}
function Denies-ConsoleResource([string]$Address){$denied=$false;try{Invoke-ConsoleResourcePolicy $Address}catch{$denied=$true};Require-Presentation $denied}
function Denies-ConsoleNavigation([string]$Address){$denied=$false;try{$null=$navigationPolicy.Invoke($null,[object[]]@($Address))}catch{$denied=$true};Require-Presentation $denied}
function Allows-ConsoleFileAccess([string]$Address,[bool]$UserInitiated,$Kind){return [bool]$filePermissionPolicy.Invoke($null,[object[]]@($Address,$UserInitiated,$Kind))}
$savedConsoleMode=[Environment]::GetEnvironmentVariable('JA21_CONSOLE_MODE')
$savedConsoleOrigins=[Environment]::GetEnvironmentVariable('JA21_CONSOLE_ORIGINS')
try{
    [Environment]::SetEnvironmentVariable('JA21_CONSOLE_MODE','1')
    [Environment]::SetEnvironmentVariable('JA21_CONSOLE_ORIGINS','http://127.0.0.1:8787')
    Check-Presentation 'Native resource policy admits only the configured local mailbox WebSocket endpoint' {Invoke-ConsoleResourcePolicy 'ws://127.0.0.1:8787/api/mail/socket';Invoke-ConsoleResourcePolicy 'http://127.0.0.1:8787/mail/'}
    Check-Presentation 'Native mailbox WebSocket policy denies unconfigured port path query fragment and credentials' {
        foreach($address in @('ws://127.0.0.1:8788/api/mail/socket','ws://127.0.0.1/api/mail/socket','ws://127.0.0.1:8787/','ws://127.0.0.1:8787/api/mail/socket/','ws://127.0.0.1:8787/api/terminal','ws://127.0.0.1:8787/api/mail/socket?ticket=synthetic','ws://127.0.0.1:8787/api/mail/socket?','ws://127.0.0.1:8787/api/mail/socket#synthetic','ws://synthetic@127.0.0.1:8787/api/mail/socket','wss://127.0.0.1:8787/api/mail/socket')){Denies-ConsoleResource $address}
    }
    Check-Presentation 'Native mailbox WebSocket policy rejects hostname aliases and noncanonical IPv4 or URL spellings' {
        foreach($address in @('ws://localhost:8787/api/mail/socket','ws://127.1:8787/api/mail/socket','ws://2130706433:8787/api/mail/socket','ws://0x7f000001:8787/api/mail/socket','ws://0177.0.0.1:8787/api/mail/socket','ws://127.000.0.1:8787/api/mail/socket','ws://127.0.0.1.:8787/api/mail/socket','ws://[::1]:8787/api/mail/socket','WS://127.0.0.1:8787/api/mail/socket','ws://127.0.0.1:08787/api/mail/socket','ws://127.0.0.1:8787/api/%6dail/socket','ws://127.0.0.1:8787/api/mail/./socket','ws://127.0.0.1:8787/api/mail/other/../socket','ws://127.0.0.1:8787\api\mail\socket')){Denies-ConsoleResource $address}
    }
    Check-Presentation 'Mailbox WebSocket resource allowance never permits top-level WebSocket navigation' {Denies-ConsoleNavigation 'ws://127.0.0.1:8787/api/mail/socket';Denies-ConsoleNavigation 'wss://127.0.0.1:8787/api/mail/socket'}
    Check-Presentation 'Mailbox WebSocket admission follows the currently configured console origin' {
        [Environment]::SetEnvironmentVariable('JA21_CONSOLE_ORIGINS','http://127.0.0.1:9898')
        try{Denies-ConsoleResource 'ws://127.0.0.1:8787/api/mail/socket';Invoke-ConsoleResourcePolicy 'ws://127.0.0.1:9898/api/mail/socket'}finally{[Environment]::SetEnvironmentVariable('JA21_CONSOLE_ORIGINS','http://127.0.0.1:8787')}
    }
    Check-Presentation 'Pinned SDK exposes user-initiation and FileReadWrite permission APIs used by native save flows' {
        Require-Presentation ([Enum]::IsDefined($permissionKindType,'FileReadWrite'))
        Require-Presentation ($null-ne$permissionEventType.GetProperty('IsUserInitiated'))
    }
    Check-Presentation 'Native file picker permission requires an explicit user action from its allowed console HTTP origin' {
        $fileKind=$filePermissionKind
        Require-Presentation (Allows-ConsoleFileAccess 'http://127.0.0.1:8787/' $true $fileKind)
        Require-Presentation (Allows-ConsoleFileAccess 'http://127.0.0.1:8787/mail/' $true $fileKind)
        Require-Presentation (!(Allows-ConsoleFileAccess 'http://127.0.0.1:8787/' $false $fileKind))
        foreach($address in @('about:blank','data:text/html,synthetic','file:///D:/Codex/fixture.txt','blob:http://127.0.0.1:8787/synthetic','https://127.0.0.1:8787/','http://localhost:8787/','http://2130706433:8787/','http://127.1:8787/','http://127.0.0.1:8788/','http://synthetic@127.0.0.1:8787/','ws://127.0.0.1:8787/api/mail/socket','http://127.0.0.1:08787/','http://example.org/','not-an-address')){Require-Presentation (!(Allows-ConsoleFileAccess $address $true $fileKind))}
    }
    Check-Presentation 'Native save-file allowance does not grant any other WebView permission kind' {
        foreach($kind in [Enum]::GetValues($permissionKindType)){if($kind-ne$filePermissionKind){Require-Presentation (!(Allows-ConsoleFileAccess 'http://127.0.0.1:8787/' $true $kind))}}
    }
    Check-Presentation 'Native file access permission is disabled outside console mode' {
        [Environment]::SetEnvironmentVariable('JA21_CONSOLE_MODE','0')
        try{Require-Presentation (!(Allows-ConsoleFileAccess 'http://127.0.0.1:8787/' $true $filePermissionKind))}finally{[Environment]::SetEnvironmentVariable('JA21_CONSOLE_MODE','1')}
    }
}finally{
    [Environment]::SetEnvironmentVariable('JA21_CONSOLE_MODE',$savedConsoleMode)
    [Environment]::SetEnvironmentVariable('JA21_CONSOLE_ORIGINS',$savedConsoleOrigins)
}
if(!$SkipIntegrity){Check-Presentation 'Complete55file current runtime seal passes actual managedcrypto verifier' {[VBJA21.RuntimeSeal]::Verify($Root);$seal=Get-Content -LiteralPath ([IO.Path]::Combine($Root,'engine','ja21','runtime.integrity.json')) -Raw | ConvertFrom-Json;Require-Presentation ($seal.files.Count-eq55)}}
$type=[VBJA21.BrowserWindow].Assembly.GetType('VBJA21.ConsolePresentationState',$true)
function New-PresentationState(){return [Activator]::CreateInstance($type,$true)}
function Invoke-State($State,[string]$Method,[object[]]$Arguments){return $type.GetMethod($Method).Invoke($State.PSObject.BaseObject,$Arguments)}
function Get-State($State,[string]$Property){return $type.GetProperty($Property).GetValue($State.PSObject.BaseObject,$null)}
Check-Presentation 'Fresh model is neither waiting nor ready' {$state=New-PresentationState;Require-Presentation (!(Get-State $state 'Waiting')-and!(Get-State $state 'Ready'))}
Check-Presentation 'Begin enables waiting and clears ready' {$state=New-PresentationState;$generation=Invoke-State $state 'Begin' @([long]100);Require-Presentation ((Get-State $state 'Waiting')-and!(Get-State $state 'Ready')-and$generation-eq1)}
Check-Presentation 'Only current generation can commit readiness' {$state=New-PresentationState;$one=Invoke-State $state 'Begin' @([long]100);$two=Invoke-State $state 'Begin' @([long]200);Require-Presentation (!(Invoke-State $state 'Complete' @([long]$one)));Require-Presentation (Invoke-State $state 'Complete' @([long]$two));Require-Presentation ((Get-State $state 'Ready')-and!(Get-State $state 'Waiting'))}
Check-Presentation 'Readiness completion cannot repeat' {$state=New-PresentationState;$generation=Invoke-State $state 'Begin' @([long]0);$null=Invoke-State $state 'Complete' @([long]$generation);Require-Presentation (!(Invoke-State $state 'Complete' @([long]$generation)))}
Check-Presentation 'Failure clears waiting without reporting ready' {$state=New-PresentationState;$generation=Invoke-State $state 'Begin' @([long]0);Require-Presentation (Invoke-State $state 'Fail' @([long]$generation));Require-Presentation (!(Get-State $state 'Ready')-and!(Get-State $state 'Waiting'))}
Check-Presentation 'Obsolete failure cannot stop a replacement load' {$state=New-PresentationState;$one=Invoke-State $state 'Begin' @([long]0);$two=Invoke-State $state 'Begin' @([long]1);Require-Presentation (!(Invoke-State $state 'Fail' @([long]$one)));Require-Presentation (Invoke-State $state 'IsCurrent' @([long]$two))}
Check-Presentation 'Timeout begins at30seconds exactly and redirects cannot extend it' {$state=New-PresentationState;$null=Invoke-State $state 'Begin' @([long]100);$null=Invoke-State $state 'Begin' @([long]20000);Require-Presentation (!(Invoke-State $state 'TimedOut' @([long]30099)));Require-Presentation (Invoke-State $state 'TimedOut' @([long]30100))}
Check-Presentation 'A new load after completion receives a new deadline' {$state=New-PresentationState;$generation=Invoke-State $state 'Begin' @([long]0);$null=Invoke-State $state 'Complete' @([long]$generation);$null=Invoke-State $state 'Begin' @([long]50000);Require-Presentation (!(Invoke-State $state 'TimedOut' @([long]79999)));Require-Presentation (Invoke-State $state 'TimedOut' @([long]80000))}
Check-Presentation 'Cancel invalidates pending success/failure and stops waiting' {$state=New-PresentationState;$generation=Invoke-State $state 'Begin' @([long]0);$null=Invoke-State $state 'Cancel' @();Require-Presentation (!(Invoke-State $state 'Complete' @([long]$generation)));Require-Presentation (!(Invoke-State $state 'Fail' @([long]$generation)));Require-Presentation (!(Get-State $state 'Waiting')-and!(Get-State $state 'Ready'))}
$recoveryType=[VBJA21.BrowserWindow].Assembly.GetType('VBJA21.ConsoleProcessRecovery',$true)
function New-RecoveryState(){return [Activator]::CreateInstance($recoveryType,$true)}
function Invoke-Recovery($State,[string]$Method,[object[]]$Arguments){return $recoveryType.GetMethod($Method).Invoke($State.PSObject.BaseObject,$Arguments)}
function Get-Recovery($State,[string]$Property){return $recoveryType.GetProperty($Property).GetValue($State.PSObject.BaseObject,$null)}
Check-Presentation 'Main browser and renderer exits request immediate recovery' {foreach($kind in @('BrowserProcessExited','RenderProcessExited')){$state=New-RecoveryState;Require-Presentation (Invoke-Recovery $state 'Observe' @($kind,[long]0))}}
Check-Presentation 'Automatically restarted subordinate processes preserve the main UI' {foreach($kind in @('GpuProcessExited','UtilityProcessExited','SandboxHelperProcessExited','PpapiPluginProcessExited','PpapiBrokerProcessExited')){$state=New-RecoveryState;Require-Presentation (!(Invoke-Recovery $state 'Observe' @($kind,[long]0)));Require-Presentation (!(Get-Recovery $state 'Waiting'))}}
Check-Presentation 'Frame-only and unknown process exits do not dispose the main surface' {foreach($kind in @('FrameRenderProcessExited','UnknownProcessExited','future-process-kind')){$state=New-RecoveryState;Require-Presentation (!(Invoke-Recovery $state 'Observe' @($kind,[long]0)));Require-Presentation (!(Get-Recovery $state 'Waiting'))}}
Check-Presentation 'First renderer unresponsive notification receives a recovery grace period' {$state=New-RecoveryState;Require-Presentation (!(Invoke-Recovery $state 'Observe' @('RenderProcessUnresponsive',[long]100)));Require-Presentation (Get-Recovery $state 'Waiting');Require-Presentation (!(Invoke-Recovery $state 'TimedOut' @([long]45099)));Require-Presentation (Invoke-Recovery $state 'TimedOut' @([long]45100))}
Check-Presentation 'Repeated notifications cannot trigger an immediate fatal error during grace' {$state=New-RecoveryState;foreach($time in @(0,1,2,100,29999)){Require-Presentation (!(Invoke-Recovery $state 'Observe' @('RenderProcessUnresponsive',[long]$time)))}}
Check-Presentation 'Three continued unresponsive notifications after30seconds request recovery' {$state=New-RecoveryState;Require-Presentation (!(Invoke-Recovery $state 'Observe' @('RenderProcessUnresponsive',[long]100)));Require-Presentation (!(Invoke-Recovery $state 'Observe' @('RenderProcessUnresponsive',[long]15100)));Require-Presentation (Invoke-Recovery $state 'Observe' @('RenderProcessUnresponsive',[long]30100))}
Check-Presentation 'Silenced SDK notifications still have a45second watchdog deadline' {$state=New-RecoveryState;$null=Invoke-Recovery $state 'Observe' @('RenderProcessUnresponsive',[long]100);Require-Presentation (Invoke-Recovery $state 'TimedOut' @([long]45100))}
Check-Presentation 'Successful navigation or SDK response invalidates pending recovery probes' {$state=New-RecoveryState;$null=Invoke-Recovery $state 'Observe' @('RenderProcessUnresponsive',[long]100);$generation=Get-Recovery $state 'Generation';$null=Invoke-Recovery $state 'Healthy' @();Require-Presentation (!(Get-Recovery $state 'Waiting'));Require-Presentation (!(Invoke-Recovery $state 'IsCurrent' @([long]$generation)));Require-Presentation (!(Invoke-Recovery $state 'TimedOut' @([long]100000)))}
Check-Presentation 'A recovered renderer receives a fresh grace period for a later event' {$state=New-RecoveryState;$null=Invoke-Recovery $state 'Observe' @('RenderProcessUnresponsive',[long]0);$null=Invoke-Recovery $state 'Observe' @('RenderProcessUnresponsive',[long]15000);$null=Invoke-Recovery $state 'Healthy' @();Require-Presentation (!(Invoke-Recovery $state 'Observe' @('RenderProcessUnresponsive',[long]30000)));Require-Presentation (!(Invoke-Recovery $state 'TimedOut' @([long]74999)));Require-Presentation (Invoke-Recovery $state 'TimedOut' @([long]75000))}
$diagnosticType=[VBJA21.BrowserWindow].Assembly.GetType('VBJA21.ConsoleDiagnostics',$true)
$diagnosticRoot=[string](Join-Path ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($EvidencePath))) ('console-diagnostics-test-'+[guid]::NewGuid().ToString('N')))
[IO.Directory]::CreateDirectory($diagnosticRoot)|Out-Null
function Write-Diagnostic([string]$Code,[string]$Route,[string]$Kind,[string]$Reason,$ExitCode,[string]$ExceptionType,$HResult){$null=$diagnosticType.GetMethod('Record').Invoke($null,[object[]]@($diagnosticRoot,$Code,$Route,$Kind,$Reason,$ExitCode,$ExceptionType,$HResult))}
Check-Presentation 'Diagnostic routes retain only known paths and discard host query and fragment' {$routeMethod=$diagnosticType.GetMethod('SafeRoute',[Reflection.BindingFlags]'Static,NonPublic');Require-Presentation ($routeMethod.Invoke($null,[object[]]@('http://127.0.0.1:8788/internet/?token=private-marker#private-marker'))-ceq'/internet/');Require-Presentation ($routeMethod.Invoke($null,[object[]]@('http://127.0.0.1:8788/private-marker'))-ceq'unknown')}
Check-Presentation 'Diagnostics preserve fixed SDK values and numeric error metadata' {Write-Diagnostic 'process-fatal' '/internet/' 'RenderProcessExited' 'Crashed' ([int]-1) 'COMException' ([int]-2147467259);$row=Get-Content -LiteralPath (Join-Path $diagnosticRoot 'console-diagnostics.jsonl') -Tail 1|ConvertFrom-Json;Require-Presentation ($row.code-ceq'process-fatal'-and$row.route-ceq'/internet/'-and$row.process_kind-ceq'RenderProcessExited'-and$row.reason-ceq'Crashed'-and$row.exit_code-eq-1-and$row.hresult-eq-2147467259)}
Check-Presentation 'Arbitrary diagnostic text cannot leak credentials subjects or exception messages' {Write-Diagnostic 'private-marker' 'http://127.0.0.1/internet/?token=private-marker' 'private-marker' 'private-marker' $null 'private-marker' $null;$text=Get-Content -LiteralPath (Join-Path $diagnosticRoot 'console-diagnostics.jsonl') -Raw;Require-Presentation (!$text.Contains('private-marker'));$row=($text.Trim()-split"`r?`n")[-1]|ConvertFrom-Json;Require-Presentation ($row.code-ceq'unknown'-and$row.route-ceq'unknown'-and$row.process_kind-ceq'unknown'-and$row.reason-ceq'unknown'-and$row.exception_type-ceq'unknown')}
Check-Presentation 'Rotating diagnostics retain at most two64KiB files' {for($i=0;$i-lt550;$i++){Write-Diagnostic 'process-recoverable' '/mail/' 'GpuProcessExited' 'Crashed' ([int]$i) '' $null};$files=@(Get-ChildItem -LiteralPath $diagnosticRoot -File);Require-Presentation ($files.Count-eq2);foreach($file in $files){Require-Presentation ($file.Length-le65536)}}
Check-Presentation 'Diagnostic storage failure never reaches the application' {$blocked=[string](Join-Path $diagnosticRoot 'blocked');[IO.File]::WriteAllText($blocked,'synthetic');$null=$diagnosticType.GetMethod('Record').Invoke($null,[object[]]@($blocked,'timeout','/mail/',$null,$null,$null,$null,$null));Remove-Item -LiteralPath $blocked}
foreach($diagnosticName in @('console-diagnostics.jsonl','console-diagnostics.previous.jsonl','blocked')){$diagnosticPath=Join-Path $diagnosticRoot $diagnosticName;if(Test-Path -LiteralPath $diagnosticPath){Remove-Item -LiteralPath $diagnosticPath}}
[IO.Directory]::Delete($diagnosticRoot)
$browser=$units[0];$contracts=$units[3];$bridge=$units[4]
Check-Presentation 'Console uses standard WebView2 while full browser retains CompositionControl' {Require-Presentation ($bridge.Contains('if (console) _standard = new WebView2();')-and$bridge.Contains('else _composition = new WebView2CompositionControl();')-and$bridge.Contains('_view = new LiveWebControl(Ja21Design.ConsoleMode);'))}
Check-Presentation 'Status text is attached to transient console notice outside HWND content row' {Require-Presentation ($browser.Contains('notice.Children.Add(_status)')-and$browser.Contains('Grid.SetRow(_consoleNotice,0)')-and$browser.Contains('Grid.SetRow(_contentFrame,1)')-and$browser.Contains('console.Children.Add(_consoleNotice)'))}
Check-Presentation 'Console cannot fall back to inert inspection after live surface creation failure' {Require-Presentation ($browser.Contains('if(Ja21Design.ConsoleMode){ShowConsoleFailure(t,"live-unavailable");return;}t.PreferLiveWeb=false')-and$browser.Contains('t.LogicalUrl=u.AbsoluteUri;ShowConsoleFailure(t,"live-unavailable");return;'))}
Check-Presentation 'Fixed console status prevents exposing arbitrary engine diagnostics' {Require-Presentation ($browser.Contains('private void Status(string text){if(!Ja21Design.ConsoleMode)_status.Text=text;}')-and$browser.Contains('_status.Text="Local workspace unavailable";'))}
Check-Presentation 'Retry revalidates the same allowed URL and uses the existing navigate gate' {Require-Presentation ($browser.Contains('JaAddressPolicy.Check(target);t.PreferLiveWeb=true;Navigate(t,target.AbsoluteUri,false);')-and$browser.Contains('ILiveWebSurface previous=t.LiveWeb;t.LiveWeb=null;t.RenderMode="FAILED";'))}
Check-Presentation 'Presentation probe requires native navigation success and configured request policy' {Require-Presentation ($bridge.Contains('if (!_ready || !_consolePolicyReady || !_consoleNavigationSucceeded || _consoleProbeGeneration >= 0) return;')-and$bridge.Contains('ExecuteScriptAsync(rendered)')-and$bridge.Contains('_consolePresentation.IsCurrent(generation)'))}
Check-Presentation 'Readiness requires mounted protected app and bounds every visited node/control/text sample' {Require-Presentation ($bridge.Contains('c++<512')-and$bridge.Contains('NodeFilter.SHOW_ALL')-and$bridge.Contains('controls++>=128')-and$bridge.Contains("script,style,noscript,[hidden]")-and$bridge.Contains('nodeValue.slice(0,128)')-and$bridge.Contains("typeof window.workspaceAccess!=='function'")-and$bridge.Contains("surface.classList.contains('desk-shell')")-and$bridge.Contains("typeof login.onsubmit!=='function'")-and!$bridge.Contains('Array.from(document.querySelectorAll'))}
Check-Presentation 'Policy failures use central idempotent disposal to cancel work and clean owned surface once' {Require-Presentation ($bridge.Contains('FailConsole("timeout")')-and$bridge.Contains('_consoleWatchdog.Tick -= OnConsoleWatchdog')-and$bridge.Contains('public void Stop() { _consolePresentation.Cancel(); _consoleWatchdog.Stop();')-and$bridge.Contains('FailConsole("policy-unavailable"); Dispose();')-and$bridge.Contains('if (!Ja21Design.ConsoleMode || _disposed) return;')-and([regex]::Matches($bridge,'_disposed = true;').Count-eq1))}
Check-Presentation 'Original HTTP request deny, frame checks, permissions and devtools restrictions remain' {Require-Presentation ($bridge.Contains('CoreWebView2WebResourceRequestSourceKinds.All')-and$bridge.Contains('403, "Forbidden"')-and$bridge.Contains('CheckConsoleNavigation(frame.Uri)')-and$bridge.Contains('p.State = CoreWebView2PermissionState.Deny')-and$bridge.Contains('s.AreDevToolsEnabled = !Ja21Design.ConsoleMode')-and$browser.Contains('if (Ja21Design.ConsoleMode) req.Proxy = null;'))}
Check-Presentation 'Actual native permission event uses the tested origin and user-action file-access gate' {Require-Presentation ($bridge.Contains('AllowConsoleFileAccess(p.Uri, p.IsUserInitiated, p.PermissionKind)')-and$bridge.Contains('p.State = CoreWebView2PermissionState.Allow')-and$bridge.Contains('p.State = CoreWebView2PermissionState.Deny'))}
Check-Presentation 'Actual ProcessFailed handler uses SDK metadata and the recovery model' {Require-Presentation ($bridge.Contains('HandleConsoleProcessFailure(kind, p.Reason.ToString(), p.ExitCode)')-and$bridge.Contains('_consoleRecovery.Observe(kind, _consoleClock.ElapsedMilliseconds)')-and$bridge.Contains('_consoleRecovery.TimedOut(_consoleClock.ElapsedMilliseconds)')-and$bridge.Contains('ExecuteScriptAsync("true")')-and!$bridge.Contains('p.ProcessDescription'))}
Check-Presentation 'Repeated fatal callbacks cannot dispose the same owned surface twice' {Require-Presentation ($bridge.Contains('if (_consoleFailureEmitted) return;')-and$bridge.Contains('_consoleFailureEmitted = true;')-and$bridge.Contains('if (_disposed || _consoleFailureEmitted) return;'))}
Check-Presentation 'Source pins remain unchanged after pure compilation/model checks' {foreach($pin in $sourcePins){Require-Presentation ((Get-PresentationHash ([IO.Path]::Combine($Root,$pin.path.Replace('/','\'))))-ceq$pin.sha256)}}
$failed=@($checks|Where-Object{!$_.passed})
$record=[ordered]@{schema='CONSOLE-PRESENTATION-TESTS/1';console_version='1.0.2';status=$(if($failed.Count){'FAIL'}else{'PASS'});createdUtc=[DateTime]::UtcNow.ToString('o');scope='EXACT_SOURCE_WPF_SDK_COMPILE_AND_PURE_PRESENTATION_RECOVERY_RESOURCE_PERMISSION_POLICIES';runtime_integrity_checked=(!$SkipIntegrity);total=$checks.Count;passed=$checks.Count-$failed.Count;failed=$failed.Count;GUI_started=$false;native_presenter_run=$false;webview_constructed=$false;backend_started=$false;network_requests=$false;live_render_acceptance=$false;sourcePins=$sourcePins;checks=$checks.ToArray()}
[IO.File]::WriteAllText([IO.Path]::GetFullPath($EvidencePath),($record|ConvertTo-Json -Depth 8)+"`n",[Text.UTF8Encoding]::new($false))
[pscustomobject]$record|Select-Object status,total,passed,failed,scope|ConvertTo-Json -Compress
if($failed.Count){$failed|ForEach-Object{Write-Output($_.name+': '+$_.reason)};exit 1}
