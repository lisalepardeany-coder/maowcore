# Registers a Windows scheduled task that auto-starts MaowCore on user logon.
# Run from PowerShell:  .\scripts\install-startup.ps1

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$taskName = 'MaowCoreBot'

# Build a hidden launcher (cmd /c start /min) so no console window pops up on login
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { throw "Node.js not found in PATH. Install Node first or fix your PATH." }

$action = New-ScheduledTaskAction `
    -Execute $nodeExe `
    -Argument 'index.js' `
    -WorkingDirectory $projectDir

$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

# Unregister an existing copy first so re-running is idempotent
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'Starts the MaowCore Discord music bot at user logon.' | Out-Null

Write-Host "✦  Installed scheduled task '$taskName'. Bot will auto-start on next logon." -ForegroundColor Magenta
Write-Host "    Start it now with:  Start-ScheduledTask -TaskName $taskName"
Write-Host "    Uninstall later with: .\scripts\uninstall-startup.ps1"
