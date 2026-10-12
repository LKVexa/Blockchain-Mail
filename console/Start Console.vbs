Option Explicit
Dim consoleShell, consoleFiles, consoleRoot, consoleCommand
Set consoleShell = CreateObject("WScript.Shell")
Set consoleFiles = CreateObject("Scripting.FileSystemObject")
consoleRoot = consoleFiles.GetParentFolderName(WScript.ScriptFullName)
consoleShell.CurrentDirectory = consoleRoot
consoleCommand = "powershell.exe -NoLogo -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Chr(34) & consoleRoot & "\host\Start-Console.ps1" & Chr(34)
consoleShell.Run consoleCommand, 0, False
