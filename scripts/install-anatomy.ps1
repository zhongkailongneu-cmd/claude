# Install the Anatomy skill (wheresryan22/anatomy) for Claude Code on Windows: %USERPROFILE%\.claude\skills\anatomy
# Run:  powershell -ExecutionPolicy Bypass -File scripts\install-anatomy.ps1          (latest from GitHub)
#       powershell -ExecutionPolicy Bypass -File scripts\install-anatomy.ps1 -Repo    (the copy pinned in this repo)
param([switch]$Repo)
$ErrorActionPreference = "Stop"
$skills = Join-Path $HOME ".claude\skills"
$dest = Join-Path $skills "anatomy"
New-Item -ItemType Directory -Force -Path $skills | Out-Null
if (Test-Path $dest) { Rename-Item $dest ("anatomy.bak-" + (Get-Date -Format yyyyMMddHHmmss)); Write-Host "existing copy moved aside" }
if ($Repo) {
  Copy-Item -Recurse (Join-Path $PSScriptRoot "..\.claude\skills\anatomy") $dest
} else {
  git clone --depth 1 https://github.com/wheresryan22/anatomy $dest
  Remove-Item -Recurse -Force (Join-Path $dest ".git")
}
if (Test-Path (Join-Path $dest "SKILL.md")) { Write-Host "installed: $dest" }
