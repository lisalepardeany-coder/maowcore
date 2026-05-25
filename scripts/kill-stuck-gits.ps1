# Kills any git.exe processes leaked by Claude Code's repo-state poller.
#
# Background: Claude's harness runs `git ls-files --others` on every turn to
# detect file changes. On Windows + this repo (heavy node_modules + a 59KB
# data/config.json), child processes occasionally hang and pile up. They're
# read-only ls-files queries — killing them mid-flight is completely safe.
#
# Usage:
#   Right-click this file → Run with PowerShell
#   OR pin a shortcut to it on your Start Menu / Taskbar
#   OR run from any terminal: powershell -File scripts/kill-stuck-gits.ps1

$gits = Get-Process git -ErrorAction SilentlyContinue
if (-not $gits) {
    Write-Host "[gits-killer] No stuck git processes — nothing to do." -ForegroundColor Green
    Start-Sleep -Seconds 2
    exit 0
}

$count = $gits.Count
Write-Host "[gits-killer] Killing $count git.exe process$(if ($count -eq 1) { '' } else { 'es' })..." -ForegroundColor Yellow
$gits | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

$remaining = (Get-Process git -ErrorAction SilentlyContinue | Measure-Object).Count
if ($remaining -eq 0) {
    Write-Host "[gits-killer] Cleared all $count git processes." -ForegroundColor Green
} else {
    Write-Host "[gits-killer] Cleared $($count - $remaining), $remaining still running (may be active git operations)." -ForegroundColor Yellow
}
Start-Sleep -Seconds 2
