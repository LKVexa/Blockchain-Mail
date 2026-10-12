Option Explicit
Dim workspaceShell, workspaceFiles, workspaceRoot, workspacePowerShell, workspaceCommand, workspacePort, workspacePattern
Set workspaceShell = CreateObject("WScript.Shell")
Set workspaceFiles = CreateObject("Scripting.FileSystemObject")
workspaceRoot = workspaceFiles.GetParentFolderName(WScript.ScriptFullName)
workspacePowerShell = workspaceShell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
workspaceCommand = Chr(34) & workspacePowerShell & Chr(34) & " -NoLogo -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Chr(34) & workspaceRoot & "\Start-Workspace.ps1" & Chr(34)
If WScript.Arguments.Count > 1 Then WScript.Quit 2
If WScript.Arguments.Count = 1 Then
  workspacePort = WScript.Arguments(0)
  Set workspacePattern = New RegExp
  workspacePattern.Pattern = "^[1-9][0-9]{0,4}$"
  If Not workspacePattern.Test(workspacePort) Then WScript.Quit 2
  If CLng(workspacePort) > 65535 Then WScript.Quit 2
  workspaceCommand = workspaceCommand & " -HttpPort " & workspacePort
End If
workspaceShell.Run workspaceCommand, 0, False
