$ErrorActionPreference = 'Stop'
$taskName = 'MaowCoreBot'
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
Write-Host "✕  Removed scheduled task '$taskName'." -ForegroundColor Magenta
