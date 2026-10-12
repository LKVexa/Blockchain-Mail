param([string]$Root, [switch]$Quiet)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = Split-Path -Parent $PSScriptRoot }
$Root = [IO.Path]::GetFullPath($Root)
$Version = '1.0.4191.47'
$PortableRoot = if ([string]::IsNullOrWhiteSpace($env:JA21_PORTABLE_ROOT)) { Join-Path $Root 'workspace' } else { [IO.Path]::GetFullPath($env:JA21_PORTABLE_ROOT) }
$SealedSdkRoot = Join-Path $Root 'runtime\webview2-sdk'
$MutableSdkRoot = Join-Path $PortableRoot 'runtime\webview2-sdk'
$SdkRoot = if (Test-Path -LiteralPath (Join-Path $SealedSdkRoot $Version) -PathType Container) { $SealedSdkRoot } else { $MutableSdkRoot }
$VersionRoot = Join-Path $SdkRoot $Version
$Core = Join-Path $VersionRoot 'Microsoft.Web.WebView2.Core.dll'
$Wpf = Join-Path $VersionRoot 'Microsoft.Web.WebView2.Wpf.dll'
$Loader = Join-Path $VersionRoot 'WebView2Loader.dll'
$Manifest = Join-Path $VersionRoot 'PROVISIONED.json'
if ((Test-Path -LiteralPath $Core -PathType Leaf) -and (Test-Path -LiteralPath $Wpf -PathType Leaf) -and (Test-Path -LiteralPath $Loader -PathType Leaf)) {
    if (!$Quiet) { Write-Host "WebView2 SDK adapter $Version already provisioned." -ForegroundColor Green }
    return [pscustomobject]@{ Ready=$true; Version=$Version; Root=$VersionRoot; Core=$Core; Wpf=$Wpf; Loader=$Loader }
}
if ($env:JA21_DISABLE_LIVE_WEB -eq '1') {
    if (!$Quiet) { Write-Host 'Live web bridge disabled by JA21_DISABLE_LIVE_WEB=1.' -ForegroundColor Yellow }
    return [pscustomobject]@{ Ready=$false; Version=$Version; Root=$VersionRoot }
}
New-Item -ItemType Directory -Force -Path $VersionRoot | Out-Null
$PortableTemp = Join-Path $PortableRoot 'temp'
New-Item -ItemType Directory -Force -Path $PortableTemp | Out-Null
$tmp = Join-Path $PortableTemp ("ja21-webview2-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $pkg = Join-Path $tmp 'Microsoft.Web.WebView2.nupkg'
    $url = "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$Version"
    if (!$Quiet) { Write-Host "Provisioning Microsoft WebView2 SDK adapter $Version from NuGet..." -ForegroundColor Cyan }
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $pkg
    $zip = Join-Path $tmp 'Microsoft.Web.WebView2.zip'; Copy-Item -LiteralPath $pkg -Destination $zip
    $unpack = Join-Path $tmp 'unpack'; Expand-Archive -LiteralPath $zip -DestinationPath $unpack -Force
    $srcCore = Join-Path $unpack 'lib\net462\Microsoft.Web.WebView2.Core.dll'
    $srcWpf = Join-Path $unpack 'lib\net462\Microsoft.Web.WebView2.Wpf.dll'
    $srcLoader = Join-Path $unpack 'runtimes\win-x64\native\WebView2Loader.dll'
    foreach($p in @($srcCore,$srcWpf,$srcLoader)){ if(!(Test-Path -LiteralPath $p -PathType Leaf)){ throw "Required WebView2 SDK artifact missing after NuGet extraction: $p" } }
    Copy-Item $srcCore $Core -Force; Copy-Item $srcWpf $Wpf -Force; Copy-Item $srcLoader $Loader -Force
    $obj = [ordered]@{
      schema='VB-JA21/WEBVIEW2_ADAPTER/1'; version=$Version; source=$url; provisioned_utc=[DateTime]::UtcNow.ToString('o');
      package_sha256=(Get-FileHash -LiteralPath $pkg -Algorithm SHA256).Hash.ToLowerInvariant();
      files=@(
        [ordered]@{name='Microsoft.Web.WebView2.Core.dll';sha256=(Get-FileHash $Core -Algorithm SHA256).Hash.ToLowerInvariant()},
        [ordered]@{name='Microsoft.Web.WebView2.Wpf.dll';sha256=(Get-FileHash $Wpf -Algorithm SHA256).Hash.ToLowerInvariant()},
        [ordered]@{name='WebView2Loader.dll';sha256=(Get-FileHash $Loader -Algorithm SHA256).Hash.ToLowerInvariant()}
      )
    }
    $obj | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Manifest -Encoding UTF8
    if (!$Quiet) { Write-Host 'WebView2 SDK adapter provisioned. The Evergreen WebView2 Runtime must also be installed on Windows.' -ForegroundColor Green }
    return [pscustomobject]@{ Ready=$true; Version=$Version; Root=$VersionRoot; Core=$Core; Wpf=$Wpf; Loader=$Loader }
}
catch {
    if (!$Quiet) { Write-Warning "Live web adapter could not be provisioned; JA21 will continue in native DF_Medium mode. $($_.Exception.Message)" }
    return [pscustomobject]@{ Ready=$false; Version=$Version; Root=$VersionRoot; Error=$_.Exception.Message }
}
finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
