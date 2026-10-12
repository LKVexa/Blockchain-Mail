param([string]$StartUrl)
$ErrorActionPreference = 'Stop'

function Get-ConsoleLiteralUri([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -match '[\s\\\p{Cc}]' -or
        $Value -notmatch '\Ahttp://127\.0\.0\.1(?::([1-9][0-9]{0,4}))?(?=[/?#]|\z)') {
        throw 'Console addresses must use a literal 127.0.0.1 HTTP origin and a canonical decimal port.'
    }
    $consoleAuthorityPort = if ($Matches[1]) { [int]$Matches[1] } else { 80 }
    $consoleParsedUri = $null
    if ($consoleAuthorityPort -le 0 -or $consoleAuthorityPort -gt 65535 -or
        ![Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$consoleParsedUri) -or
        $consoleParsedUri.Scheme -ne 'http' -or $consoleParsedUri.DnsSafeHost -ne '127.0.0.1' -or
        $consoleParsedUri.Port -ne $consoleAuthorityPort -or $consoleParsedUri.UserInfo) {
        throw 'Console address is invalid or has credentials.'
    }
    return $consoleParsedUri
}

function Assert-ConsoleConfiguration([object[]]$Origins, [string]$Url) {
    $consolePorts = New-Object 'System.Collections.Generic.HashSet[int]'
    if ($Origins.Count -gt 32) { throw 'Console allows at most 32 explicitly configured origins.' }
    foreach ($consoleOriginText in $Origins) {
        if ($consoleOriginText -isnot [string]) { throw 'Console local origins must be strings.' }
        $consoleOrigin = Get-ConsoleLiteralUri $consoleOriginText
        if ($consoleOrigin.AbsolutePath -ne '/' -or $consoleOrigin.Query -or $consoleOrigin.Fragment) {
            throw 'A console origin must contain no path, query or fragment.'
        }
        [void]$consolePorts.Add($consoleOrigin.Port)
    }
    if ($Url -ceq 'about:blank') { return }
    $consoleTarget = Get-ConsoleLiteralUri $Url
    if (!$consolePorts.Contains($consoleTarget.Port)) { throw 'Console start_url is outside the configured local origins.' }
}

$consolePackageRoot = Split-Path -Parent $PSScriptRoot
$consoleSettings = Get-Content -LiteralPath (Join-Path $consolePackageRoot 'console.json') -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($StartUrl)) { $StartUrl = [string]$consoleSettings.start_url }
if ([string]::IsNullOrWhiteSpace($StartUrl)) { $StartUrl = 'about:blank' }
# Validate before the host launcher can create state, provision anything or start a process.
Assert-ConsoleConfiguration -Origins @($consoleSettings.local_origins) -Url $StartUrl
$env:JA21_CONSOLE_MODE = '1'
$env:JA21_REDUCED_MOTION = '1'
$env:JA21_ALLOW_PRIVATE_HOSTS = '0'
$env:JA21_CONSOLE_ORIGINS = @($consoleSettings.local_origins) -join ';'
$env:JA21_PORTABLE_ROOT = Join-Path $consolePackageRoot 'workspace'
try {
    & (Join-Path $PSScriptRoot 'Start-JA21Browser.ps1') -Root $consolePackageRoot -StartUrl $StartUrl
} catch {
    $consoleErrorPath = Join-Path $consolePackageRoot 'workspace\logs\console-error.txt'
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $consoleErrorPath) | Out-Null
    ($_ | Out-String) | Set-Content -LiteralPath $consoleErrorPath -Encoding UTF8
    throw
}
