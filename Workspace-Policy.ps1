Set-StrictMode -Version 2.0

function ConvertTo-WorkspacePort([string]$Value, [string]$Label) {
    if ($Value -notmatch '\A[1-9][0-9]{0,4}\z') { throw "$Label must be a decimal port from 1 to 65535." }
    $workspacePort = [int]$Value
    if ($workspacePort -gt 65535) { throw "$Label must be a decimal port from 1 to 65535." }
    return $workspacePort
}

function Get-WorkspaceOrigin([string]$Port) {
    $workspaceValidatedPort = ConvertTo-WorkspacePort $Port 'HTTP port'
    return ('http://127.0.0.1:' + $workspaceValidatedPort)
}

function Get-WorkspaceContainedPath([string]$Root, [string]$RelativePath) {
    if ([string]::IsNullOrWhiteSpace($RelativePath) -or [IO.Path]::IsPathRooted($RelativePath) -or
        $RelativePath -match '[:\p{Cc}]' -or ($RelativePath -split '[/\\]') -contains '..') {
        throw 'A package path must be relative and remain inside the workspace.'
    }
    $workspaceRootPath = [IO.Path]::GetFullPath($Root)
    if ($workspaceRootPath.Length -gt 3) { $workspaceRootPath = $workspaceRootPath.TrimEnd('\','/') }
    $workspaceFullPath = [IO.Path]::GetFullPath([IO.Path]::Combine($workspaceRootPath, $RelativePath))
    $workspaceRootPrefix = $workspaceRootPath.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
    if (!$workspaceFullPath.StartsWith($workspaceRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'A package path escaped the workspace.'
    }
    # Refuse existing reparse ancestors; lexical containment does not confine a
    # junction/symlink. No target is removed or rewritten here.
    $workspaceCurrent = $workspaceFullPath
    while ($workspaceCurrent -and $workspaceCurrent.Length -ge $workspaceRootPath.Length) {
        # File.GetAttributes inspects the named entry itself, including its
        # reparse flag. Unlike File.Exists/Test-Path it does not turn access or
        # I/O failures into an absent-path result. Read EVERY ancestor afresh on
        # EVERY call; only genuinely absent components may be future outputs.
        try { $workspaceAttributes = [IO.File]::GetAttributes($workspaceCurrent) }
        catch {
            $workspaceAttributeError = $_.Exception.GetBaseException()
            if ($workspaceAttributeError -isnot [IO.FileNotFoundException] -and
                $workspaceAttributeError -isnot [IO.DirectoryNotFoundException]) { throw }
            $workspaceAttributes = 0
        }
        if (($workspaceAttributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Package paths cannot traverse a junction or symbolic link.' }
        if ($workspaceCurrent.Equals($workspaceRootPath, [StringComparison]::OrdinalIgnoreCase)) { break }
        $workspaceCurrent = [IO.Path]::GetDirectoryName($workspaceCurrent)
    }
    return $workspaceFullPath
}

function Get-WorkspaceCanonicalDirectory([string]$Directory) {
    $workspaceDirectory = [IO.Path]::GetFullPath($Directory)
    if ($workspaceDirectory.Length -gt 3) { $workspaceDirectory = $workspaceDirectory.TrimEnd('\','/') }
    if ($workspaceDirectory -cnotmatch '\A[A-Za-z]:\\') { throw 'A canonical local drive directory is required.' }
    $workspaceCurrent = $workspaceDirectory.Substring(0,3)
    foreach ($workspacePart in @($workspaceDirectory.Substring(3) -split '\\' | Where-Object { $_ })) {
        # Enumerating actual directory names rejects NTFS short-name aliases,
        # including custom aliases without a tilde, without a native helper.
        $workspaceMatch = @([IO.Directory]::GetDirectories($workspaceCurrent) | Where-Object { [IO.Path]::GetFileName($_).Equals($workspacePart,[StringComparison]::OrdinalIgnoreCase) })
        if ($workspaceMatch.Count -ne 1) { throw 'Choose an existing directory using its actual filesystem name.' }
        $workspaceCurrent = $workspaceMatch[0]
        $workspaceItem = Get-Item -LiteralPath $workspaceCurrent -Force
        if (($workspaceItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Canonical directories cannot traverse a junction or symbolic link.' }
    }
    if ($workspaceCurrent.Length -gt 3) { return $workspaceCurrent.TrimEnd('\','/') }
    return $workspaceCurrent
}

function Get-WorkspaceExternalRecoveryPath([string]$Root, [string]$Path) {
    # A key destination must be an ordinary canonical drive path. Refuse device,
    # UNC, stream and Windows alias spellings before checking lexical separation.
    if ([string]::IsNullOrWhiteSpace($Path) -or $Path -cnotmatch '\A[A-Za-z]:\\' -or $Path.Length -gt 259) { throw 'Choose an ordinary drive path outside the workspace.' }
    $workspaceParts = @($Path.Substring(3) -split '\\')
    foreach ($workspacePart in $workspaceParts) {
        if (!$workspacePart -or $workspacePart -in @('.','..') -or $workspacePart -match '[<>:"/|?*\p{Cc}]' -or
            $workspacePart -match '[. ]\z' -or $workspacePart -match '\A(?:CON|CONIN\$|CONOUT\$|PRN|AUX|NUL|COM[0-9\u00b9\u00b2\u00b3]|LPT[0-9\u00b9\u00b2\u00b3])(?:\.|\z)') { throw 'Recovery paths cannot use Windows aliases or device names.' }
    }
    $workspaceFullPath = [IO.Path]::GetFullPath($Path)
    $workspaceRootPath = Get-WorkspaceCanonicalDirectory $Root
    $workspaceParentPath = Get-WorkspaceCanonicalDirectory ([IO.Path]::GetDirectoryName($workspaceFullPath))
    $workspaceFullPath = Join-Path $workspaceParentPath ([IO.Path]::GetFileName($workspaceFullPath))
    if ($workspaceFullPath.Equals($workspaceRootPath,[StringComparison]::OrdinalIgnoreCase) -or
        $workspaceFullPath.StartsWith($workspaceRootPath.TrimEnd('\','/')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Choose a location outside the workspace.' }
    # Walk the chosen file and every ancestor, including ancestors outside this
    # package. A junction outside the package can otherwise lead back into it.
    $workspaceCurrent = $workspaceFullPath
    while ($workspaceCurrent) {
        if (Test-Path -LiteralPath $workspaceCurrent) {
            $workspaceItem = Get-Item -LiteralPath $workspaceCurrent -Force
            if (($workspaceItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Recovery paths cannot traverse a junction or symbolic link.' }
        }
        $workspaceParent = Split-Path -Parent $workspaceCurrent
        if (!$workspaceParent -or $workspaceParent -eq $workspaceCurrent) { break }
        $workspaceCurrent = $workspaceParent
    }
    return $workspaceFullPath
}

function ConvertTo-WorkspaceArgument([string]$Value) {
    # Windows CRT argument quoting, used only with UseShellExecute=false.
    if ($null -eq $Value) { $Value = '' }
    if ($Value -match '[\p{Cc}]') { throw 'Process arguments cannot contain control characters.' }
    $workspaceQuoted = New-Object Text.StringBuilder
    [void]$workspaceQuoted.Append('"')
    $workspaceSlashes = 0
    foreach ($workspaceChar in $Value.ToCharArray()) {
        if ($workspaceChar -eq '\') { $workspaceSlashes++; continue }
        if ($workspaceChar -eq '"') {
            [void]$workspaceQuoted.Append(('\' * ($workspaceSlashes * 2 + 1)))
            [void]$workspaceQuoted.Append('"')
        } else {
            [void]$workspaceQuoted.Append(('\' * $workspaceSlashes))
            [void]$workspaceQuoted.Append($workspaceChar)
        }
        $workspaceSlashes = 0
    }
    [void]$workspaceQuoted.Append(('\' * ($workspaceSlashes * 2)))
    [void]$workspaceQuoted.Append('"')
    return $workspaceQuoted.ToString()
}

function Assert-WorkspaceReadyRecord([object]$Record, [int]$ExpectedPid, [string]$ExpectedOrigin, [string]$ExpectedVersion) {
    if ($null -eq $Record -or $Record.version -cne $ExpectedVersion -or $Record.event -cne 'ready' -or
        $Record.pid -ne $ExpectedPid -or $Record.http -cne $ExpectedOrigin -or
        $Record.runId -notmatch '\A[0-9a-f]{32}\z' -or $Record.protected -ne $true) {
        throw 'The protected mail process did not return a matching authenticated startup record.'
    }
    return $true
}

function Assert-WorkspaceHealthRecord([object]$Health, [object]$Ready) {
    if ($null -eq $Health -or $Health.ok -ne $true -or $Health.protocol -ne 1 -or
        $Health.protected -ne $true -or $Health.runId -cne $Ready.runId -or $Health.version -cne $Ready.version) {
        throw 'The loopback health response did not match the owned protected process.'
    }
    return $true
}

function ConvertFrom-WorkspaceRecovery([string]$Value) {
    $workspaceWords = @($Value.Trim() -split '\s+')
    if ($workspaceWords.Count -ne 4) { throw 'The recovery key must contain exactly four ordered words.' }
    foreach ($workspaceWord in $workspaceWords) { if ($workspaceWord -cnotmatch '\A[A-Za-z]{1,64}\z') { throw 'Recovery words must contain ASCII letters only.' } }
    $workspaceWords = @($workspaceWords | ForEach-Object { $_.ToLowerInvariant() })
    return ,$workspaceWords
}

function Test-WorkspaceOwnedProcess([object]$Process, [int]$WorkspaceProcessId, [datetime]$StartedUtc) {
    if ($null -eq $Process) { return $false }
    try {
        return !$Process.HasExited -and $Process.Id -eq $WorkspaceProcessId -and $Process.StartTime.ToUniversalTime() -eq $StartedUtc
    } catch { return $false }
}

function Get-WorkspaceChildEnvironment([System.Collections.IDictionary]$Parent, [string]$ConsoleRoot, [string]$Origin, [string]$Session) {
    $workspaceEnvironment = @{}
    foreach ($workspaceEntry in $Parent.GetEnumerator()) { $workspaceEnvironment[[string]$workspaceEntry.Key] = [string]$workspaceEntry.Value }
    # Remove executable hooks, runtime/source overrides, browser debugging and
    # ambient proxy variables. This controls our children, not global OS settings.
    foreach ($workspaceName in @($workspaceEnvironment.Keys)) {
        if ($workspaceName -match '\A(?:NODE_.*|OPENSSL_CONF|OPENSSL_ENGINES|SSLKEYLOGFILE|VEXA127_.*|JA21_.*|WEBVIEW2_.*|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)\z') { $workspaceEnvironment.Remove($workspaceName) }
    }
    $workspaceEnvironment['VEXA127_OPEN_BROWSER']='0'
    # Our console child is Windows PowerShell 5, even when the supervisor is
    # launched from PowerShell Core. Use its OS modules, not inherited user or
    # Core module directories. This changes only the owned child environment.
    $workspaceEnvironment['PSModulePath']=Join-Path ([Environment]::GetFolderPath('Windows')) 'System32\WindowsPowerShell\v1.0\Modules'
    $workspaceEnvironment['WORKSPACE_SESSION']=$Session
    $workspaceEnvironment['JA21_CONSOLE_MODE']='1'
    $workspaceEnvironment['JA21_CONSOLE_ORIGINS']=$Origin
    $workspaceEnvironment['JA21_ALLOW_PRIVATE_HOSTS']='0'
    $workspaceEnvironment['JA21_ALLOW_ANY_FILE']='0'
    $workspaceEnvironment['JA21_ALLOW_WEB_PERMISSIONS']='0'
    $workspaceEnvironment['JA21_ENABLE_DEVTOOLS']='0'
    $workspaceEnvironment['JA21_REDUCED_MOTION']='1'
    # Shipped SDK is used first; if absent, this flag prevents provisioning.
    $workspaceEnvironment['JA21_DISABLE_LIVE_WEB']='1'
    $workspaceEnvironment['JA21_PORTABLE_ROOT']=Join-Path $ConsoleRoot 'workspace'
    return $workspaceEnvironment
}
