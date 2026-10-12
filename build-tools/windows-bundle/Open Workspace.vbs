Set taskShell = CreateObject("WScript.Shell")
Set taskFiles = CreateObject("Scripting.FileSystemObject")
taskRoot = taskFiles.GetParentFolderName(WScript.ScriptFullName)
taskPowerShell = taskShell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
taskShell.Run """" & taskPowerShell & """ -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File """ & taskRoot & "\Start.ps1""", 0, False
