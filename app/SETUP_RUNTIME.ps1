# Explicit ONLINE provisioning. RUN.cmd never invokes this script.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# Reproduction pin, not a claim that this is the latest security release.
$version = '24.19.0'
$pinnedArchive = '57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73'
$pinnedExecutable = '3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237' 
if (-not [Environment]::Is64BitOperatingSystem) { throw 'This optional runtime profile requires 64-bit Windows.' }
$target = Join-Path $PSScriptRoot 'runtime\win-x64'
if (Test-Path $target) { throw "Refusing to replace an existing runtime: $target" }
$work = Join-Path $PSScriptRoot ('runtime\setup-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -Force | Out-Null
$name = "node-v$version-win-x64.zip"
$base = "https://nodejs.org/download/release/v$version/"
Write-Host "Explicit online setup: official Node.js $version x64, private project directory only."
Write-Host 'No administrator rights, PATH changes, security-policy changes or npm installation.'
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $sums = Join-Path $work 'SHASUMS256.txt'
    $zip = Join-Path $work $name
    Invoke-WebRequest -UseBasicParsing -Uri ($base + 'SHASUMS256.txt') -OutFile $sums
    $lines = @(Get-Content $sums | Where-Object { $_ -match ('^([0-9a-f]{64})\s+' + [Regex]::Escape($name) + '$') })
    if ($lines.Count -ne 1) { throw 'Official checksum entry absent or ambiguous.' }
    $expected = ($lines[0] -split '\s+')[0].ToLowerInvariant()
    if ($expected -ne $pinnedArchive) { throw 'Official checksum differs from reviewed reproduction pin; stop and review.' }
    Invoke-WebRequest -UseBasicParsing -Uri ($base + $name) -OutFile $zip
    $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw 'Official archive SHA-256 mismatch. Nothing will be installed.' }
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $work 'expanded')
    $extracted = Join-Path $work ("expanded\node-v$version-win-x64")
    foreach ($required in @('node.exe','LICENSE')) { if (-not (Test-Path (Join-Path $extracted $required))) { throw "Missing $required" } }
    if ((Get-FileHash -Algorithm SHA256 (Join-Path $extracted 'node.exe')).Hash.ToLowerInvariant() -ne $pinnedExecutable) { throw 'Pinned executable digest mismatch; do not execute.' }
    $reported = & (Join-Path $extracted 'node.exe') --version
    if ($LASTEXITCODE -ne 0 -or $reported.Trim() -ne "v$version") { throw 'Verified archive runtime did not start with the pinned version. Check Windows security notices; do not disable protection.' }
    New-Item -ItemType Directory -Path $target | Out-Null
    Copy-Item (Join-Path $extracted 'node.exe') (Join-Path $target 'node.exe')
    Copy-Item (Join-Path $extracted 'LICENSE') (Join-Path $target 'LICENSE')
    @{ version=$version; source=($base+$name); archive_sha256=$expected; installed_at=[DateTime]::UtcNow.ToString('o'); verification='Archive digest matched the official HTTPS checksum document; not independent OpenPGP verification.' } | ConvertTo-Json | Set-Content (Join-Path $target 'PROVISIONING.json') -Encoding UTF8
    Write-Host 'Private runtime ready. Start RUN.cmd; subsequent server use is offline/loopback only.'
} finally {
    # Preserve downloaded material for diagnosis. No recursive deletion or unrelated path mutation.
    Write-Host "Setup evidence/cache retained: $work"
}

