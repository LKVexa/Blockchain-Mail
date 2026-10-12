param([string]$Root, [Parameter(Mandatory=$true)][string]$EvidencePath, [switch]$CompileWpf)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = Split-Path -Parent $PSScriptRoot }

# This test compiles only pure policy functions and optionally the managed source
# closure. It never invokes Program.Run, RuntimeSeal, VEC1, WebView initialization,
# a supplied EXE/DLL entry point, a launcher, DNS or an HTTP request.
function Get-SourceBlock([string]$Text, [string]$Marker) {
    $consoleBlockStart = $Text.IndexOf($Marker, [StringComparison]::Ordinal)
    if ($consoleBlockStart -lt 0) { throw "Source marker missing: $Marker" }
    $consoleBraceStart = $Text.IndexOf('{', $consoleBlockStart)
    $consoleDepth = 0
    for ($consoleIndex = $consoleBraceStart; $consoleIndex -lt $Text.Length; $consoleIndex++) {
        if ($Text[$consoleIndex] -eq '{') { $consoleDepth++ }
        if ($Text[$consoleIndex] -eq '}') {
            $consoleDepth--
            if ($consoleDepth -eq 0) { return $Text.Substring($consoleBlockStart, $consoleIndex - $consoleBlockStart + 1) }
        }
    }
    throw "Unclosed source block: $Marker"
}
function Join-ConsoleCompilationUnits([string[]]$Sources) {
    $consoleUsings = New-Object 'System.Collections.Generic.List[string]'
    $consoleBodies = New-Object 'System.Collections.Generic.List[string]'
    foreach ($consoleSource in $Sources) {
        $consoleBody = New-Object Text.StringBuilder
        foreach ($consoleLine in ($consoleSource -split "`r?`n")) {
            if ($consoleLine -match '^\s*using\s+(static\s+)?[A-Za-z_@][^();{}]*;\s*$') {
                if (!$consoleUsings.Contains($consoleLine.Trim())) { [void]$consoleUsings.Add($consoleLine.Trim()) }
            } else { [void]$consoleBody.AppendLine($consoleLine) }
        }
        [void]$consoleBodies.Add($consoleBody.ToString())
    }
    return (($consoleUsings -join "`r`n") + "`r`n" + ($consoleBodies -join "`r`n"))
}
$consoleResults = New-Object 'System.Collections.Generic.List[object]'
function Add-PolicyCase([string]$Label, [scriptblock]$Action, [bool]$Allowed) {
    $consoleSucceeded = $false; $consoleReason = $null
    try { $null = & $Action; $consoleSucceeded = $true } catch { $consoleReason = $_.Exception.GetBaseException().Message }
    [void]$consoleResults.Add([ordered]@{ label=$Label; expected_allowed=$Allowed; allowed=$consoleSucceeded; passed=($Allowed -eq $consoleSucceeded); reason=$consoleReason })
}

$consoleBrowserSource = Get-Content -LiteralPath (Join-Path $Root 'host\JA21VirtualBrowser.cs') -Raw -Encoding UTF8
$consoleBridgeSource = Get-Content -LiteralPath (Join-Path $Root 'host\LiveWebBridge.cs') -Raw -Encoding UTF8
$consolePolicy = Get-SourceBlock $consoleBrowserSource 'internal static class JaAddressPolicy'
$consoleNavigation = Get-SourceBlock $consoleBridgeSource 'internal static void CheckConsoleNavigation'
$consoleDownload = Get-SourceBlock $consoleBridgeSource 'internal static void CheckConsoleDownload'
$consoleHarness = @"
using System;
namespace ConsolePolicyTest {
internal static class Ja21Design { public static bool ConsoleMode { get { return Environment.GetEnvironmentVariable("JA21_CONSOLE_MODE") == "1"; } } }
$consolePolicy
public static class Harness {
$consoleNavigation
$consoleDownload
public static void Address(string url) { JaAddressPolicy.Check(new Uri(url)); JaAddressPolicy.CheckResolved(new Uri(url)); }
public static void UnresolvedAddress(string url) { JaAddressPolicy.Check(new Uri(url)); }
public static void Navigation(string url) { CheckConsoleNavigation(url); }
public static void Download(string url) { CheckConsoleDownload(url); }
public static void File(string url, string root) { JaAddressPolicy.CheckFile(new Uri(url), root); }
}
}
"@
Add-Type -TypeDefinition $consoleHarness -Language CSharp -ErrorAction Stop

# Obtain function definitions from the PowerShell parser, without running its
# top-level launcher body or reproducing the implementation in the tests.
$consoleParseErrors = $null; $consoleTokens = $null
$consoleStartAst = [Management.Automation.Language.Parser]::ParseFile((Join-Path $Root 'host\Start-Console.ps1'), [ref]$consoleTokens, [ref]$consoleParseErrors)
if ($consoleParseErrors.Count -ne 0) { throw ($consoleParseErrors | Out-String) }
foreach ($consoleFunctionName in @('Get-ConsoleLiteralUri','Assert-ConsoleConfiguration')) {
    $consoleFunction = $consoleStartAst.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $consoleFunctionName }, $true)
    if ($null -eq $consoleFunction) { throw "Launcher policy function missing: $consoleFunctionName" }
    . ([scriptblock]::Create($consoleFunction.Extent.Text))
}
$consoleOldEnv = @{}
foreach ($consoleName in @('JA21_CONSOLE_MODE','JA21_CONSOLE_ORIGINS','JA21_ALLOW_PRIVATE_HOSTS','JA21_ALLOW_ANY_FILE')) { $consoleOldEnv[$consoleName] = [Environment]::GetEnvironmentVariable($consoleName) }
try {
    $env:JA21_CONSOLE_MODE = '1'
    $env:JA21_CONSOLE_ORIGINS = 'http://127.0.0.1:8788;http://127.0.0.1:8791'
    $env:JA21_ALLOW_PRIVATE_HOSTS = '1'
    $env:JA21_ALLOW_ANY_FILE = '1'
    foreach ($consoleUrl in @('http://127.0.0.1:8788/','http://127.0.0.1:8791/api?q=one#two')) {
        Add-PolicyCase "C# allow $consoleUrl" { [ConsolePolicyTest.Harness]::Address($consoleUrl) } $true
        Add-PolicyCase "Launcher allow $consoleUrl" { Assert-ConsoleConfiguration @('http://127.0.0.1:8788','http://127.0.0.1:8791') $consoleUrl } $true
    }
    foreach ($consoleUrl in @('https://127.0.0.1:8788/','http://127.0.0.1:8790/','http://127.0.0.2:8788/','http://localhost:8788/','http://example.invalid/','https://example.invalid/','http://8.8.8.8/','http://192.168.0.1/','http://[::1]:8788/','http://user@127.0.0.1:8788/','http://2130706433:8788/','http://0x7f000001:8788/','http://127.1:8788/','http://127.0.0.01:8788/','http://127.0.0.1:08788/','http://127.0.0.1:0/','http://127.0.0.1:65536/','http://127.0.0.1.:8788/','http://127.0.0.1:8788\@example.invalid/','file:///C:/Windows/win.ini','data:text/html,hello','ws://127.0.0.1:8788/','about:config')) {
        Add-PolicyCase "C# deny $consoleUrl" { [ConsolePolicyTest.Harness]::Address($consoleUrl) } $false
        Add-PolicyCase "Launcher deny $consoleUrl" { Assert-ConsoleConfiguration @('http://127.0.0.1:8788','http://127.0.0.1:8791') $consoleUrl } $false
    }
    Add-PolicyCase 'Exact blank navigation' { [ConsolePolicyTest.Harness]::Navigation('about:blank') } $true
    Add-PolicyCase 'Exact blank launcher' { Assert-ConsoleConfiguration @() 'about:blank' } $true
    Add-PolicyCase 'Blank query denied' { [ConsolePolicyTest.Harness]::Navigation('about:blank?x=1') } $false
    Add-PolicyCase 'Null navigation denied' { [ConsolePolicyTest.Harness]::Navigation($null) } $false
    Add-PolicyCase 'Local blob export allowed' { [ConsolePolicyTest.Harness]::Download('blob:http://127.0.0.1:8788/00000000-0000-0000-0000-000000000001') } $true
    Add-PolicyCase 'Public blob export denied' { [ConsolePolicyTest.Harness]::Download('blob:https://example.invalid/id') } $false
    Add-PolicyCase 'Opaque blob export denied' { [ConsolePolicyTest.Harness]::Download('blob:null/id') } $false
    Add-PolicyCase 'Data download denied' { [ConsolePolicyTest.Harness]::Download('data:text/plain,hello') } $false
    Add-PolicyCase 'File opt-out ignored in console' { [ConsolePolicyTest.Harness]::File('file:///C:/Windows/win.ini',$Root) } $false
    Add-PolicyCase 'Malformed configured origin denied' { Assert-ConsoleConfiguration @('http://2130706433:8788') 'about:blank' } $false
    Add-PolicyCase 'Configured origin path denied' { Assert-ConsoleConfiguration @('http://127.0.0.1:8788/app') 'about:blank' } $false
    Add-PolicyCase 'Configured origin query denied' { Assert-ConsoleConfiguration @('http://127.0.0.1:8788/?x=1') 'about:blank' } $false
    Add-PolicyCase 'Configured origin fragment denied' { Assert-ConsoleConfiguration @('http://127.0.0.1:8788/#x') 'about:blank' } $false
    Add-PolicyCase 'Absent allowlist denies network' { $env:JA21_CONSOLE_ORIGINS=''; try { [ConsolePolicyTest.Harness]::Address('http://127.0.0.1:8788/') } finally { $env:JA21_CONSOLE_ORIGINS='http://127.0.0.1:8788;http://127.0.0.1:8791' } } $false
    $env:JA21_CONSOLE_MODE = '0'; $env:JA21_ALLOW_PRIVATE_HOSTS='0'
    Add-PolicyCase 'Full browser public HTTP policy preserved without DNS' { [ConsolePolicyTest.Harness]::UnresolvedAddress('https://example.invalid/') } $true
    Add-PolicyCase 'Full browser default localhost block preserved' { [ConsolePolicyTest.Harness]::UnresolvedAddress('http://localhost/') } $false
    $env:JA21_ALLOW_PRIVATE_HOSTS='1'
    Add-PolicyCase 'Full browser explicit private opt-in preserved' { [ConsolePolicyTest.Harness]::UnresolvedAddress('http://localhost/') } $true
    if ($CompileWpf) {
        if ($PSVersionTable.PSEdition -ne 'Desktop') { throw 'Managed WPF source compilation requires Windows PowerShell 5.x/.NET Framework.' }
        . (Join-Path $Root 'host\Wpf-CompileReferences.ps1')
        $consoleCompileRefs = @(Get-JA21WpfCompileReferences) + @((Join-Path $Root 'runtime\webview2-sdk\1.0.4191.47\Microsoft.Web.WebView2.Core.dll'), (Join-Path $Root 'runtime\webview2-sdk\1.0.4191.47\Microsoft.Web.WebView2.Wpf.dll'))
        $consoleUnits = @('host\JA21VirtualBrowser.cs','host\Vec1Substrate.cs','host\PortableDesktop.cs','host\LiveWebContracts.cs','host\LiveWebBridge.cs') | ForEach-Object { Get-Content -LiteralPath (Join-Path $Root $_) -Raw -Encoding UTF8 }
        Add-PolicyCase 'Five managed source units compile against pinned SDK without execution' { Add-Type -TypeDefinition (Join-ConsoleCompilationUnits $consoleUnits) -Language CSharp -ReferencedAssemblies $consoleCompileRefs -ErrorAction Stop } $true
    }
} finally {
    foreach ($consoleName in $consoleOldEnv.Keys) { [Environment]::SetEnvironmentVariable($consoleName, $consoleOldEnv[$consoleName]) }
}
$consoleFailed = @($consoleResults | Where-Object { !$_.passed })
$consoleSourceHashes = @('host\JA21VirtualBrowser.cs','host\LiveWebBridge.cs','host\Start-Console.ps1','tools\Test-ConsolePolicy.ps1','tools\CONSOLE_HARDENING.txt') | ForEach-Object { [ordered]@{ path=($_ -replace '\\','/'); sha256=(Get-FileHash -LiteralPath (Join-Path $Root $_) -Algorithm SHA256).Hash.ToLowerInvariant() } }
$consoleEvidence = [ordered]@{ status=$(if($consoleFailed.Count){'FAIL'}else{'PASS'}); total=$consoleResults.Count; passed=($consoleResults.Count-$consoleFailed.Count); failed=$consoleFailed.Count; native_execution=$false; browser_execution=$false; network_requests=$false; os_confinement_verified=$false; websocket_interception_verified=$false; managed_source_compile_requested=[bool]$CompileWpf; source_hashes=$consoleSourceHashes; cases=$consoleResults }
$consoleEvidenceDir = Split-Path -Parent ([IO.Path]::GetFullPath($EvidencePath))
New-Item -ItemType Directory -Force -Path $consoleEvidenceDir | Out-Null
$consoleEvidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
Write-Output ([pscustomobject]$consoleEvidence | Select-Object status,total,passed,failed | ConvertTo-Json -Compress)
if ($consoleFailed.Count) { $consoleFailed | ForEach-Object { Write-Output ($_.label + ': ' + $_.reason) }; exit 1 }
