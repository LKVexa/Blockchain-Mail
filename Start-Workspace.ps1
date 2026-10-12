param([string]$HttpPort='8787')
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$workspaceRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$workspaceBackend=$null;$workspaceConsole=$null;$workspaceJob=$null;$workspaceOutput=$null;$workspaceErrors=$null
$workspaceConsoleOutput=$null;$workspaceConsoleErrors=$null;$workspaceWords=$null;$workspaceSecret=$null
$workspaceChoice=$null;$workspaceKeyInput=$null;$workspaceKeyRecord=$null
$workspaceTor=$null;$workspaceTorStatus=$null
$workspaceExit=1
$script:workspaceStartup=$null;$script:workspaceStartupText=$null;$script:workspaceStartupBar=$null
$script:workspaceStartupCancelled=$false;$script:workspaceStartupClosing=$false
$script:workspaceStartupPump=[Diagnostics.Stopwatch]::StartNew()


function Invoke-WorkspaceStartupPump {
    if($script:workspaceStartup){
        $workspaceFrame=New-Object Windows.Threading.DispatcherFrame
        $workspaceCallback=[Windows.Threading.DispatcherOperationCallback]{param($frame)$frame.Continue=$false;return $null}
        # A high-priority timer bounds the nested pump even if rendering/input
        # keeps its Background callback queued. No application code is loaded.
        $workspacePumpTimer=[Windows.Threading.DispatcherTimer]::new([Windows.Threading.DispatcherPriority]::Send)
        $workspacePumpTimer.Interval=[TimeSpan]::FromMilliseconds(50)
        $workspacePumpTick=[EventHandler]({$workspaceFrame.Continue=$false}.GetNewClosure())
        $workspacePumpTimer.Add_Tick($workspacePumpTick)
        try{
            $workspacePumpTimer.Start()
            $null=[Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvoke([Windows.Threading.DispatcherPriority]::Background,$workspaceCallback,$workspaceFrame)
            [Windows.Threading.Dispatcher]::PushFrame($workspaceFrame)
        }finally{$workspacePumpTimer.Stop();$workspacePumpTimer.Remove_Tick($workspacePumpTick)}
        $script:workspaceStartupPump.Restart()
    }
    if($script:workspaceStartupCancelled){throw [OperationCanceledException]::new('Workspace startup cancelled.')}
}

function Show-WorkspaceStartup {
    if($script:workspaceStartup){return}
    $script:workspaceStartupCancelled=$false
    $script:workspaceStartup=New-Object Windows.Window
    $script:workspaceStartup.Title='Opening workspace';$script:workspaceStartup.Width=440;$script:workspaceStartup.SizeToContent='Height'
    $script:workspaceStartup.ResizeMode='NoResize';$script:workspaceStartup.WindowStartupLocation='CenterScreen';$script:workspaceStartup.FontFamily='Segoe UI';$script:workspaceStartup.FontSize=14
    $workspacePanel=New-Object Windows.Controls.StackPanel;$workspacePanel.Margin='24';$script:workspaceStartup.Content=$workspacePanel
    $workspaceHeading=New-Object Windows.Controls.TextBlock;$workspaceHeading.Text='Opening your local workspace';$workspaceHeading.FontSize=21;$workspaceHeading.FontWeight='SemiBold';$workspacePanel.Children.Add($workspaceHeading)|Out-Null
    $script:workspaceStartupText=New-Object Windows.Controls.TextBlock;$script:workspaceStartupText.Text='Preparing protection checks…';$script:workspaceStartupText.TextWrapping='Wrap';$script:workspaceStartupText.Margin='0,16,0,12';$workspacePanel.Children.Add($script:workspaceStartupText)|Out-Null
    $script:workspaceStartupBar=New-Object Windows.Controls.ProgressBar;$script:workspaceStartupBar.Height=8;$script:workspaceStartupBar.Minimum=0;$script:workspaceStartupBar.Maximum=100;$script:workspaceStartupBar.IsIndeterminate=$true;$workspacePanel.Children.Add($script:workspaceStartupBar)|Out-Null
    $workspaceNote=New-Object Windows.Controls.TextBlock;$workspaceNote.Text='Every packaged file is checked on each launch.';$workspaceNote.TextWrapping='Wrap';$workspaceNote.Margin='0,12,0,16';$workspacePanel.Children.Add($workspaceNote)|Out-Null
    $workspaceCancel=New-Object Windows.Controls.Button;$workspaceCancel.Content='_Cancel';$workspaceCancel.Padding='14,8';$workspaceCancel.HorizontalAlignment='Right';$workspacePanel.Children.Add($workspaceCancel)|Out-Null
    $workspaceCancel.Add_Click({$script:workspaceStartupCancelled=$true})
    $script:workspaceStartup.Add_Closing({if(!$script:workspaceStartupClosing){$script:workspaceStartupCancelled=$true}})
    $script:workspaceStartup.Show();Invoke-WorkspaceStartupPump
}

function Set-WorkspaceStartup([string]$Text,[int]$Checked=-1,[int]$Total=0) {
    if(!$script:workspaceStartup){return}
    $script:workspaceStartupText.Text=$Text
    $script:workspaceStartupBar.IsIndeterminate=($Checked-lt0-or$Total-le0)
    if($Checked-ge0-and$Total-gt0){$script:workspaceStartupBar.Value=[Math]::Min(100,100.0*$Checked/$Total)}
    Invoke-WorkspaceStartupPump
}

function Close-WorkspaceStartup {
    if($script:workspaceStartup){
        $script:workspaceStartupClosing=$true
        try{$script:workspaceStartup.Close()}finally{$script:workspaceStartup=$null;$script:workspaceStartupText=$null;$script:workspaceStartupBar=$null;$script:workspaceStartupClosing=$false}
    }
}

function Get-WorkspaceFileSha256([string]$Path) {
    # Built-in .NET only: Windows PowerShell may inherit a PSModulePath that
    # cannot discover Get-FileHash. Hash the file as a stream before imports.
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

function Assert-WorkspacePolicyBootstrap([string]$Root) {
    # Built-in-only preflight: no package helper executes until its exact manifest
    # entry and bytes have been checked. This is consistency, not publisher trust.
    $workspaceRootPath=[IO.Path]::GetFullPath($Root).TrimEnd('\','/')
    if($workspaceRootPath-cnotmatch'\A[A-Za-z]:\\'){throw 'The portable workspace requires an ordinary local drive directory.'}
    $workspaceCanonicalRoot=$workspaceRootPath.Substring(0,3)
    foreach($workspacePart in @($workspaceRootPath.Substring(3)-split'\\'|Where-Object{$_})) {
        $workspaceMatches=@([IO.Directory]::GetDirectories($workspaceCanonicalRoot)|Where-Object{[IO.Path]::GetFileName($_).Equals($workspacePart,[StringComparison]::OrdinalIgnoreCase)})
        if($workspaceMatches.Count-ne1){throw 'The workspace root must use its actual filesystem directory names.'}
        $workspaceCanonicalRoot=$workspaceMatches[0]
    }
    $workspaceRootPath=$workspaceCanonicalRoot.TrimEnd('\','/')
    foreach($workspaceBootstrapName in @('INTEGRATED_BUILD.json','Workspace-Policy.ps1')) {
        $workspaceCurrent=Join-Path $workspaceRootPath $workspaceBootstrapName
        while($workspaceCurrent) {
            if(Test-Path -LiteralPath $workspaceCurrent) {
                $workspaceItem=Get-Item -LiteralPath $workspaceCurrent -Force
                if(($workspaceItem.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'Bootstrap paths cannot traverse a junction or symbolic link.'}
            }
            $workspaceParent=Split-Path -Parent $workspaceCurrent
            if(!$workspaceParent-or$workspaceParent-eq$workspaceCurrent){break};$workspaceCurrent=$workspaceParent
        }
    }
    $workspaceManifestPath=Join-Path $workspaceRootPath 'INTEGRATED_BUILD.json'
    if(!(Test-Path -LiteralPath $workspaceManifestPath -PathType Leaf)-or(Get-Item -LiteralPath $workspaceManifestPath).Length-gt12000000){throw 'The integrated launch manifest is missing or too large.'}
    $workspaceManifest=Get-Content -LiteralPath $workspaceManifestPath -Raw -Encoding UTF8|ConvertFrom-Json
    if($workspaceManifest.schema-cne'WORKSPACE-INTEGRATED/1'-or$workspaceManifest.version-cne'3.9.1-local.1'-or$workspaceManifest.launch_files-isnot[Array]-or$workspaceManifest.launch_files.Count-lt10-or$workspaceManifest.launch_files.Count-gt12000){throw 'The integrated launch manifest is invalid.'}
    $workspacePolicyEntries=@($workspaceManifest.launch_files|Where-Object{$_.path-ieq'Workspace-Policy.ps1'})
    if($workspacePolicyEntries.Count-ne1-or$workspacePolicyEntries[0].path-isnot[string]-or$workspacePolicyEntries[0].path-cne'Workspace-Policy.ps1'-or$workspacePolicyEntries[0].sha256-isnot[string]-or$workspacePolicyEntries[0].sha256-cnotmatch'\A[0-9a-f]{64}\z'){throw 'The launch manifest does not bind the exact policy helper.'}
    $workspacePolicyPath=Join-Path $workspaceRootPath 'Workspace-Policy.ps1'
    if(!(Test-Path -LiteralPath $workspacePolicyPath -PathType Leaf)-or(Get-WorkspaceFileSha256 $workspacePolicyPath)-cne$workspacePolicyEntries[0].sha256){throw 'The policy helper is missing or changed. No helper was loaded.'}
    return $workspacePolicyPath
}

function Assert-WorkspacePackage {
    if($PSVersionTable.PSEdition-ne'Desktop'-or![Environment]::Is64BitProcess-or![Environment]::Is64BitOperatingSystem){throw 'Use the supplied launcher on Windows x64 with Windows PowerShell 5.x.'}
    if([Threading.Thread]::CurrentThread.GetApartmentState()-ne'STA'){throw 'The workspace launcher requires its supplied STA entry point.'}
    $workspaceManifestPath=Get-WorkspaceContainedPath $workspaceRoot 'INTEGRATED_BUILD.json'
    if([IO.FileInfo]::new($workspaceManifestPath).Length-gt12000000){throw 'The integrated launch manifest is too large.'}
    $workspaceManifest=[IO.File]::ReadAllText($workspaceManifestPath,[Text.Encoding]::UTF8)|ConvertFrom-Json
    if($workspaceManifest.schema-cne'WORKSPACE-INTEGRATED/1'-or$workspaceManifest.version-cne'3.9.1-local.1'-or$workspaceManifest.launch_files-isnot[Array]-or$workspaceManifest.launch_files.Count-lt10-or$workspaceManifest.launch_files.Count-gt12000){throw 'Integrated package launch manifest is missing or invalid.'}
    # Check original JSON types before converting to typed arrays. A number/object
    # must never become a trusted path or hash through PowerShell coercion.
    $workspacePaths=New-Object string[] $workspaceManifest.launch_files.Count
    $workspaceHashes=New-Object string[] $workspaceManifest.launch_files.Count
    $workspaceVerifierEntry=$null;$workspaceVerifierCount=0;$workspaceIndex=0
    foreach($workspaceEntry in $workspaceManifest.launch_files){
        if($null-eq$workspaceEntry-or$workspaceEntry.path-isnot[string]-or$workspaceEntry.sha256-isnot[string]-or$workspaceEntry.sha256-cnotmatch'\A[0-9a-f]{64}\z'){throw 'Integrated launch manifest contains malformed entries.'}
        $workspacePaths[$workspaceIndex]=$workspaceEntry.path;$workspaceHashes[$workspaceIndex]=$workspaceEntry.sha256;$workspaceIndex++
        if($workspaceEntry.path-ieq'Workspace-Verify.cs'){$workspaceVerifierEntry=$workspaceEntry;$workspaceVerifierCount++}
    }
    if($workspaceVerifierCount-ne1-or$workspaceVerifierEntry.path-cne'Workspace-Verify.cs'){throw 'The launch manifest must bind the exact verification helper.'}
    # Fresh containment and SHA-256 checks precede helper compilation. Its full
    # package inventory is then checked independently by the compiled gate.
    $workspaceVerifierPath=Get-WorkspaceContainedPath $workspaceRoot 'Workspace-Verify.cs'
    if((Get-WorkspaceFileSha256 $workspaceVerifierPath)-cne$workspaceVerifierEntry.sha256){throw 'The verification helper is missing or changed. No helper was loaded.'}
    Set-WorkspaceStartup 'Preparing full protection checks…'
    Add-Type -Path $workspaceVerifierPath
    $workspaceProgress=[Func[int,int,bool]]{
        param([int]$completed,[int]$total)
        if($script:workspaceStartupCancelled){return $false}
        try{Set-WorkspaceStartup ('Checking files: '+$completed+' of '+$total) $completed $total}
        catch [OperationCanceledException]{return $false}
        return !$script:workspaceStartupCancelled
    }
    $script:workspaceVerificationCounts=[PortableWorkspaceFast391.VerifyGate]::Validate($workspaceRoot,$workspacePaths,$workspaceHashes,$workspaceProgress)
    Set-WorkspaceStartup ('Checked all '+$workspaceManifest.launch_files.Count+' files.') $workspaceManifest.launch_files.Count $workspaceManifest.launch_files.Count
    return $workspaceManifest
}

function Show-WorkspaceKeyPrompt([string]$InitialPort,[bool]$HasState){
    $workspaceDialog=New-Object Windows.Window
    $workspaceDialog.Title='Open workspace';$workspaceDialog.Width=480;$workspaceDialog.SizeToContent='Height';$workspaceDialog.ResizeMode='NoResize';$workspaceDialog.WindowStartupLocation='CenterScreen';$workspaceDialog.FontFamily='Segoe UI';$workspaceDialog.FontSize=14
    $workspacePanel=New-Object Windows.Controls.StackPanel;$workspacePanel.Margin='24';$workspaceDialog.Content=$workspacePanel
    $workspaceHeading=New-Object Windows.Controls.TextBlock;$workspaceHeading.Text='Your local workspace';$workspaceHeading.FontSize=22;$workspaceHeading.FontWeight='SemiBold';$workspacePanel.Children.Add($workspaceHeading)|Out-Null
    $workspaceText=New-Object Windows.Controls.TextBlock;$workspaceText.Text='Enter the four-word recovery key. You will enter it once more inside the workspace to unlock mail. The key stays in memory.';$workspaceText.TextWrapping='Wrap';$workspaceText.Margin='0,12,0,14';$workspacePanel.Children.Add($workspaceText)|Out-Null
    $workspacePortLabel=New-Object Windows.Controls.Label;$workspacePortLabel.Content='_Local port';$workspacePanel.Children.Add($workspacePortLabel)|Out-Null
    $workspacePortBox=New-Object Windows.Controls.TextBox;$workspacePortBox.Text=$InitialPort;$workspacePortBox.Padding='8';$workspacePortLabel.Target=$workspacePortBox;$workspacePanel.Children.Add($workspacePortBox)|Out-Null
    $workspaceKeyLabel=New-Object Windows.Controls.Label;$workspaceKeyLabel.Content='_Recovery key';$workspaceKeyLabel.Margin='0,8,0,0';$workspacePanel.Children.Add($workspaceKeyLabel)|Out-Null
    $workspaceKeyBox=New-Object Windows.Controls.PasswordBox;$workspaceKeyBox.Padding='8';$workspaceKeyBox.MaxLength=259;$workspaceKeyLabel.Target=$workspaceKeyBox;$workspacePanel.Children.Add($workspaceKeyBox)|Out-Null
    $workspaceButtons=New-Object Windows.Controls.StackPanel;$workspaceButtons.Orientation='Horizontal';$workspaceButtons.Margin='0,20,0,0';$workspacePanel.Children.Add($workspaceButtons)|Out-Null
    $workspaceOpen=New-Object Windows.Controls.Button;$workspaceOpen.Content='_Open';$workspaceOpen.Padding='14,8';$workspaceOpen.IsDefault=$true;$workspaceButtons.Children.Add($workspaceOpen)|Out-Null
    $workspaceCreate=New-Object Windows.Controls.Button;$workspaceCreate.Content='_Create new workspace';$workspaceCreate.Padding='14,8';$workspaceCreate.Margin='8,0,0,0';$workspaceCreate.IsEnabled=!$HasState;$workspaceButtons.Children.Add($workspaceCreate)|Out-Null
    $workspaceCancel=New-Object Windows.Controls.Button;$workspaceCancel.Content='_Cancel';$workspaceCancel.Padding='14,8';$workspaceCancel.Margin='8,0,0,0';$workspaceCancel.IsCancel=$true;$workspaceButtons.Children.Add($workspaceCancel)|Out-Null
    $workspaceOpen.Add_Click({try{$null=ConvertTo-WorkspacePort $workspacePortBox.Text 'Local port';$workspaceDialog.Tag=[pscustomobject]@{Action='unlock';Port=$workspacePortBox.Text;Secret=$workspaceKeyBox.SecurePassword.Copy()};$workspaceDialog.DialogResult=$true}catch{[Windows.MessageBox]::Show('Choose a decimal local port from 1 to 65535.','Workspace')|Out-Null}})
    $workspaceCreate.Add_Click({try{$null=ConvertTo-WorkspacePort $workspacePortBox.Text 'Local port';$workspaceDialog.Tag=[pscustomobject]@{Action='create';Port=$workspacePortBox.Text;Secret=$null};$workspaceDialog.DialogResult=$true}catch{[Windows.MessageBox]::Show('Choose a decimal local port from 1 to 65535.','Workspace')|Out-Null}})
    $workspaceDialog.Add_ContentRendered({$workspaceKeyBox.Focus()|Out-Null})
    $workspaceOk=$workspaceDialog.ShowDialog();$workspaceKeyBox.Clear()
    if($workspaceOk-ne$true){return $null}
    $workspaceResult=$workspaceDialog.Tag;$workspaceDialog.Tag=$null
    return $workspaceResult
}

function Show-WorkspaceRecovery([string[]]$Words){
    $workspaceDialog=New-Object Windows.Window;$workspaceDialog.Title='Save your recovery key';$workspaceDialog.Width=520;$workspaceDialog.SizeToContent='Height';$workspaceDialog.ResizeMode='NoResize';$workspaceDialog.WindowStartupLocation='CenterScreen';$workspaceDialog.FontFamily='Segoe UI';$workspaceDialog.FontSize=14
    $workspacePanel=New-Object Windows.Controls.StackPanel;$workspacePanel.Margin='24';$workspaceDialog.Content=$workspacePanel
    $workspaceText=New-Object Windows.Controls.TextBlock;$workspaceText.Text='Keep this key separately from the workspace. It opens your data; a lost key cannot be recovered. You will enter it once more in the mail window.';$workspaceText.TextWrapping='Wrap';$workspacePanel.Children.Add($workspaceText)|Out-Null
    $workspaceKeyBox=New-Object Windows.Controls.TextBox;$workspaceKeyBox.Text=$Words-join' ';$workspaceKeyBox.IsReadOnly=$true;$workspaceKeyBox.Padding='12';$workspaceKeyBox.Margin='0,16,0,16';$workspaceKeyBox.FontSize=18;$workspaceKeyBox.TextWrapping='Wrap';$workspacePanel.Children.Add($workspaceKeyBox)|Out-Null
    $workspaceSave=New-Object Windows.Controls.Button;$workspaceSave.Content='_Save recovery file separately';$workspaceSave.Padding='12,8';$workspacePanel.Children.Add($workspaceSave)|Out-Null
    $workspaceSaved=New-Object Windows.Controls.CheckBox;$workspaceSaved.Content='I saved this key outside the workspace.';$workspaceSaved.Margin='0,16,0,16';$workspacePanel.Children.Add($workspaceSaved)|Out-Null
    $workspaceContinue=New-Object Windows.Controls.Button;$workspaceContinue.Content='_Continue';$workspaceContinue.Padding='12,8';$workspaceContinue.IsDefault=$true;$workspaceContinue.IsEnabled=$false;$workspacePanel.Children.Add($workspaceContinue)|Out-Null
    $workspaceSaved.Add_Checked({$workspaceContinue.IsEnabled=$true});$workspaceSaved.Add_Unchecked({$workspaceContinue.IsEnabled=$false})
    $workspaceContinue.Add_Click({$workspaceDialog.DialogResult=$true})
    $workspaceSave.Add_Click({
        $workspaceSaveDialog=New-Object Microsoft.Win32.SaveFileDialog;$workspaceSaveDialog.Title='Save key outside the workspace';$workspaceSaveDialog.Filter='Recovery key (*.workspace-key.json)|*.workspace-key.json';$workspaceSaveDialog.FileName='recovery.workspace-key.json';$workspaceSaveDialog.OverwritePrompt=$true
        if($workspaceSaveDialog.ShowDialog()-eq$true){try{
            $workspaceKeyPath=Get-WorkspaceExternalRecoveryPath $workspaceRoot $workspaceSaveDialog.FileName
            $workspaceKeyBytes=[Text.UTF8Encoding]::new($false).GetBytes(([ordered]@{version=1;recovery=@($Words)}|ConvertTo-Json -Compress))
            $workspaceKeyFile=$null
            try{$workspaceKeyFile=New-Object IO.FileStream($workspaceKeyPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);$workspaceKeyFile.Write($workspaceKeyBytes,0,$workspaceKeyBytes.Length)}finally{if($workspaceKeyFile){$workspaceKeyFile.Dispose()};[Array]::Clear($workspaceKeyBytes,0,$workspaceKeyBytes.Length);$workspaceKeyBytes=$null}
            $workspaceSaved.IsChecked=$true
        }catch{[Windows.MessageBox]::Show('The key was not saved. Choose a new filename outside this workspace.','Recovery key')|Out-Null}}
    })
    $workspaceOk=$workspaceDialog.ShowDialog();$workspaceKeyBox.Clear();return ($workspaceOk-eq$true)
}

function Start-WorkspaceOwnedChild([string]$Executable,[string[]]$Arguments,[string]$Directory,[hashtable]$Environment){
    $workspaceInfo=New-Object Diagnostics.ProcessStartInfo
    $workspaceInfo.FileName=$Executable;$workspaceInfo.Arguments=($Arguments|ForEach-Object{ConvertTo-WorkspaceArgument $_})-join' ';$workspaceInfo.WorkingDirectory=$Directory
    $workspaceInfo.UseShellExecute=$false;$workspaceInfo.CreateNoWindow=$true;$workspaceInfo.WindowStyle='Hidden'
    $workspaceInfo.RedirectStandardInput=$true;$workspaceInfo.RedirectStandardOutput=$true;$workspaceInfo.RedirectStandardError=$true
    $workspaceInfo.StandardOutputEncoding=[Text.UTF8Encoding]::new($false);$workspaceInfo.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
    $workspaceInfo.EnvironmentVariables.Clear();foreach($workspaceEnvName in $Environment.Keys){$workspaceInfo.EnvironmentVariables[$workspaceEnvName]=[string]$Environment[$workspaceEnvName]}
    $workspaceProcess=New-Object Diagnostics.Process;$workspaceProcess.StartInfo=$workspaceInfo
    if(!$workspaceProcess.Start()){throw 'An owned workspace process could not start.'}
    try{$workspaceJob.Attach($workspaceProcess)}catch{try{$workspaceProcess.Kill()}catch{};$workspaceProcess.Dispose();throw}
    return $workspaceProcess
}

function Read-WorkspaceControlLine([object]$Process,[object]$Output,[object]$Errors,[int]$TimeoutSeconds){
    $workspaceDeadline=[Diagnostics.Stopwatch]::StartNew()
    while($workspaceDeadline.Elapsed.TotalSeconds-lt$TimeoutSeconds){
        for($workspaceDrain=0;$workspaceDrain-lt64;$workspaceDrain++){if($null-eq$Errors.PollLine()){break}} # bounded discard without raw child output
        if($Output.Failure-or$Errors.Failure){throw 'Child output did not satisfy the bounded startup protocol.'}
        if($workspaceDeadline.Elapsed.TotalSeconds-ge$TimeoutSeconds){throw 'The protected process did not become ready in time.'}
        $workspaceLine=$Output.PollLine()
        if($null-ne$workspaceLine){return ($workspaceLine|ConvertFrom-Json)}
        if($Process.HasExited){throw 'The protected process stopped before opening. Check the recovery key or choose an unused local port.'}
        if($script:workspaceStartupPump.ElapsedMilliseconds-ge100){Invoke-WorkspaceStartupPump}
        Start-Sleep -Milliseconds 50
    }
    throw 'The protected process did not become ready in time.'
}

function Get-WorkspaceHealth([string]$Origin){
    $workspaceRequest=[Net.HttpWebRequest]::Create($Origin+'/health');$workspaceRequest.Proxy=$null;$workspaceRequest.Method='GET';$workspaceRequest.AllowAutoRedirect=$false;$workspaceRequest.Timeout=1200;$workspaceRequest.ReadWriteTimeout=1200
    $workspaceResponse=$workspaceRequest.GetResponse()
    try{
        if($workspaceResponse.StatusCode-ne[Net.HttpStatusCode]::OK){throw 'Protected health response failed.'}
        $workspaceReader=New-Object IO.StreamReader($workspaceResponse.GetResponseStream(),[Text.UTF8Encoding]::new($false,$true))
        try{$workspaceBuffer=New-Object Text.StringBuilder;while(($workspaceNext=$workspaceReader.Read())-ge 0){if($workspaceBuffer.Length-ge 16384){throw 'Protected health response exceeded its bound.'};[void]$workspaceBuffer.Append([char]$workspaceNext)};return($workspaceBuffer.ToString()|ConvertFrom-Json)}finally{$workspaceReader.Dispose()}
    }finally{$workspaceResponse.Dispose()}
}

function Stop-WorkspaceOwnedChild([object]$Process,[int]$ProcessId,[datetime]$StartedUtc,[bool]$Backend){
    if(!(Test-WorkspaceOwnedProcess $Process $ProcessId $StartedUtc)){return}
    try{if($Backend){$Process.StandardInput.WriteLine('{"command":"stop"}');$Process.StandardInput.Flush()}else{$null=$Process.CloseMainWindow()}}catch{}
    if(!$Process.WaitForExit(8000)-and(Test-WorkspaceOwnedProcess $Process $ProcessId $StartedUtc)){try{$Process.Kill();$null=$Process.WaitForExit(2000)}catch{}}
}

try{
    if($PSVersionTable.PSEdition-ne'Desktop'-or![Environment]::Is64BitProcess-or[Threading.Thread]::CurrentThread.GetApartmentState()-ne'STA'){throw 'Use the supplied Windows x64 launcher.'}
    Add-Type -AssemblyName PresentationFramework
    Show-WorkspaceStartup
    $workspacePolicyPath=Assert-WorkspacePolicyBootstrap $workspaceRoot
    . $workspacePolicyPath
    $null=ConvertTo-WorkspacePort $HttpPort 'Local port'
    $workspaceManifest=Assert-WorkspacePackage
    Set-WorkspaceStartup 'Preparing the protected launcher…'
    Add-Type -Path (Join-Path $workspaceRoot 'Workspace-Pipe.cs')
    $workspaceJob=New-Object PortableWorkspace.ChildJob
    $workspaceNode=Get-WorkspaceContainedPath $workspaceRoot 'runtime/node.exe'
    $workspaceApp=Get-WorkspaceContainedPath $workspaceRoot 'app'
    $workspaceConsoleRoot=Get-WorkspaceContainedPath $workspaceRoot 'console'
    $workspaceState=Get-WorkspaceContainedPath $workspaceRoot 'state\vault'
    $workspaceHasState=(Test-Path -LiteralPath (Join-Path $workspaceState 'vault.meta.json'))-or((Test-Path -LiteralPath $workspaceState)-and@(Get-ChildItem -LiteralPath $workspaceState -Force).Count-gt0)
    Close-WorkspaceStartup
    $workspaceChoice=Show-WorkspaceKeyPrompt $HttpPort $workspaceHasState
    if($null-eq$workspaceChoice){$workspaceExit=0;return}
    $workspaceOrigin=Get-WorkspaceOrigin $workspaceChoice.Port
    $workspaceChildEnv=Get-WorkspaceChildEnvironment ([Environment]::GetEnvironmentVariables()) $workspaceConsoleRoot $workspaceOrigin ([guid]::NewGuid().ToString('N'))
    if($workspaceChoice.Action-eq'create'){
        $workspaceKeygen=$null;$workspaceKeyOutput=$null;$workspaceKeyErrors=$null
        try{
            $workspaceKeygen=Start-WorkspaceOwnedChild $workspaceNode @((Join-Path $workspaceApp 'src\main.mjs'),'keygen') $workspaceApp $workspaceChildEnv
            $workspaceKeyOutput=New-Object PortableWorkspace.PipeReader($workspaceKeygen.StandardOutput,4096);$workspaceKeyErrors=New-Object PortableWorkspace.PipeReader($workspaceKeygen.StandardError,4096)
            $workspaceKeyRecord=Read-WorkspaceControlLine $workspaceKeygen $workspaceKeyOutput $workspaceKeyErrors 15
            if($workspaceKeyRecord.version-ne1-or$workspaceKeyRecord.recovery.Count-ne4){throw 'Recovery generation did not return the expected format.'}
            $workspaceWords=ConvertFrom-WorkspaceRecovery ($workspaceKeyRecord.recovery-join' ')
            [Array]::Clear($workspaceKeyRecord.recovery,0,$workspaceKeyRecord.recovery.Count);$workspaceKeyRecord=$null
            if(!$workspaceKeygen.WaitForExit(3000)-or$workspaceKeygen.ExitCode-ne0){throw 'Recovery generation did not finish successfully.'}
            if(!(Show-WorkspaceRecovery $workspaceWords)){$workspaceExit=0;return}
        }finally{$workspaceKeyRecord=$null;if($workspaceKeygen){if(!$workspaceKeygen.HasExited){try{$workspaceKeygen.Kill()}catch{}};$workspaceKeygen.Dispose()};if($workspaceKeyOutput){$workspaceKeyOutput.Dispose()};if($workspaceKeyErrors){$workspaceKeyErrors.Dispose()}}
    }else{
        $workspaceSecret=$workspaceChoice.Secret;$workspaceChoice.Secret=$null;$workspaceBstr=[IntPtr]::Zero
        try{$workspaceBstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($workspaceSecret);$workspaceWords=ConvertFrom-WorkspaceRecovery ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($workspaceBstr))}finally{if($workspaceBstr-ne[IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($workspaceBstr)};$workspaceSecret.Dispose();$workspaceSecret=$null}
    }
    Show-WorkspaceStartup
    if(Test-Path -LiteralPath (Join-Path $workspaceRoot 'network\tor\verified-runtime.json')){
        Set-WorkspaceStartup 'Opening the private mail connection…'
        . (Get-WorkspaceContainedPath $workspaceRoot 'network\tor\Workspace-Tor.ps1')
        $workspacePeerPort=8788
        if([int]$workspaceChoice.Port-eq$workspacePeerPort){$workspacePeerPort=8789}
        $workspaceTor=Start-WorkspaceTor -WorkspaceRoot $workspaceRoot -PeerPort $workspacePeerPort -SocksPort 19150 -ControlPort 19151 -OwnerProcessId $PID
        $workspaceTorStatus=Wait-WorkspaceTorIdentity $workspaceTor -TimeoutSeconds 30 -Pump {Invoke-WorkspaceStartupPump}
    }
    Set-WorkspaceStartup 'Opening encrypted mail and checking the ledger…'
    $workspaceBackendArgs=@((Join-Path $workspaceApp 'src\main.mjs'),'serve-protected','--state',$workspaceState,'--http-port',$workspaceChoice.Port,'--key-stdin','1')
    if($workspaceTor){$workspaceBackendArgs+=@('--tor-onion',$workspaceTorStatus.onion_host,'--tor-socks-port','19150','--tor-peer-port',[string]$workspacePeerPort)}
    $workspaceBackend=Start-WorkspaceOwnedChild $workspaceNode $workspaceBackendArgs $workspaceApp $workspaceChildEnv
    $workspaceChoice=$null
    $workspaceBackendId=$workspaceBackend.Id;$workspaceBackendStart=$workspaceBackend.StartTime.ToUniversalTime()
    $workspaceOutput=New-Object PortableWorkspace.PipeReader($workspaceBackend.StandardOutput,4096);$workspaceErrors=New-Object PortableWorkspace.PipeReader($workspaceBackend.StandardError,4096)
    $workspaceKeyInput=[ordered]@{version=1;recovery=@($workspaceWords)}|ConvertTo-Json -Compress
    $workspaceBackend.StandardInput.WriteLine($workspaceKeyInput);$workspaceBackend.StandardInput.Flush();$workspaceKeyInput=$null;$workspaceWords=$null
    $workspaceReady=Read-WorkspaceControlLine $workspaceBackend $workspaceOutput $workspaceErrors 30
    $null=Assert-WorkspaceReadyRecord $workspaceReady $workspaceBackend.Id $workspaceOrigin $workspaceManifest.version
    $null=Assert-WorkspaceHealthRecord (Get-WorkspaceHealth $workspaceOrigin) $workspaceReady
    $workspacePowerShell=Join-Path ([Environment]::GetFolderPath('Windows')) 'System32\WindowsPowerShell\v1.0\powershell.exe'
    Set-WorkspaceStartup 'Preparing the workspace window…'
    $workspaceConsole=Start-WorkspaceOwnedChild $workspacePowerShell @('-NoLogo','-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',(Join-Path $workspaceConsoleRoot 'host\Start-JA21Browser.ps1'),'-Root',$workspaceConsoleRoot,'-StartUrl',($workspaceOrigin+'/')) $workspaceConsoleRoot $workspaceChildEnv
    $workspaceConsoleId=$workspaceConsole.Id;$workspaceConsoleStart=$workspaceConsole.StartTime.ToUniversalTime()
    $workspaceConsoleOutput=New-Object PortableWorkspace.PipeReader($workspaceConsole.StandardOutput,8192);$workspaceConsoleErrors=New-Object PortableWorkspace.PipeReader($workspaceConsole.StandardError,8192)
    $workspaceWindowTimer=[Diagnostics.Stopwatch]::StartNew();$workspaceWindowVisible=$false
    while(!$workspaceConsole.HasExited){
        foreach($workspacePipe in @($workspaceOutput,$workspaceErrors,$workspaceConsoleOutput,$workspaceConsoleErrors)){
            for($workspaceDrain=0;$workspaceDrain-lt64;$workspaceDrain++){
                $workspaceStageLine=$workspacePipe.PollLine();if($null-eq$workspaceStageLine){break}
                # Only fixed known labels are displayed; child details are discarded.
                if(!$workspaceWindowVisible-and[object]::ReferenceEquals($workspacePipe,$workspaceConsoleOutput)){
                    if($workspaceStageLine-ceq'JA21 boot · presenter-compile-begin'){Set-WorkspaceStartup 'Preparing the workspace window…'}
                    elseif($workspaceStageLine-ceq'JA21 boot · presenter-run-begin'){Set-WorkspaceStartup 'Checking the console and opening its window…'}
                }
            }
        }
        if($workspaceOutput.Failure-or$workspaceErrors.Failure-or$workspaceConsoleOutput.Failure-or$workspaceConsoleErrors.Failure){throw 'A workspace process exceeded the bounded output protocol.'}
        if($workspaceBackend.HasExited){throw 'The protected mail process stopped. The workspace window will close safely.'}
        if(!$workspaceWindowVisible){
            if(!(Test-WorkspaceOwnedProcess $workspaceConsole $workspaceConsoleId $workspaceConsoleStart)){throw 'The owned workspace window could not be identified.'}
            $workspaceConsole.Refresh()
            if($workspaceConsole.MainWindowHandle-ne[IntPtr]::Zero){$workspaceWindowVisible=$true;Close-WorkspaceStartup}
            elseif($workspaceWindowTimer.Elapsed.TotalSeconds-ge60){throw 'The workspace window did not open in time.'}
            else{Invoke-WorkspaceStartupPump}
        }
        Start-Sleep -Milliseconds 100
    }
    if($workspaceConsole.ExitCode-ne0){throw 'The workspace window could not finish successfully. Verify the installed WebView2 runtime and packaged components.'}
    $workspaceExit=0
}catch [OperationCanceledException]{
    $workspaceExit=0
}catch{
    if($_.Exception.GetBaseException()-is[OperationCanceledException]){$workspaceExit=0;return}
    Close-WorkspaceStartup
    # No recovery words, credential values, raw child output or exception stacks
    # are written to logs. Show a bounded generic error in the supervisor UI.
    try{Add-Type -AssemblyName PresentationFramework;[Windows.MessageBox]::Show('The workspace could not open or continue. Check the recovery key, choose an unused local port, and verify the supplied package and WebView2 runtime. No pre-existing process was stopped.','Workspace',[Windows.MessageBoxButton]::OK,[Windows.MessageBoxImage]::Error)|Out-Null}catch{}
    $workspaceExit=1
}finally{
    Close-WorkspaceStartup
    if($workspaceSecret){$workspaceSecret.Dispose()};if($workspaceChoice-and$workspaceChoice.Secret){$workspaceChoice.Secret.Dispose()};$workspaceChoice=$null;$workspaceWords=$null;$workspaceKeyInput=$null;$workspaceKeyRecord=$null
    if($workspaceConsole){try{Stop-WorkspaceOwnedChild $workspaceConsole $workspaceConsoleId $workspaceConsoleStart $false}catch{};$workspaceConsole.Dispose()}
    if($workspaceBackend){try{Stop-WorkspaceOwnedChild $workspaceBackend $workspaceBackendId $workspaceBackendStart $true}catch{};$workspaceBackend.Dispose()}
    if($workspaceTor){try{Stop-WorkspaceTor $workspaceTor}catch{}}
    foreach($workspaceReader in @($workspaceOutput,$workspaceErrors,$workspaceConsoleOutput,$workspaceConsoleErrors)){if($workspaceReader){$workspaceReader.Dispose()}}
    if($workspaceJob){$workspaceJob.Dispose()}
}
exit $workspaceExit
