# Starts the local Pic It stack in one shot:
#   1. npm install             (stops the script if it fails)
#   2. Docker Desktop          (starts it when the engine is not already up)
#   3. supabase start          (blocks until containers are healthy, then returns)
#   4. npm run dev             (this window, stays open)
#
# Usage from the repo root:
#   npm run stack
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1
#
# Stop it from a second terminal:
#   npm run stop
#
# Skip a piece that's already running:
#   npm run stack -- -SkipSupabase
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1 -SkipSupabase

param(
  [switch]$SkipSupabase
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing '$Name'. Install it, then run this script again."
  }
}

function Get-DockerDesktopPath {
  $candidates = @(
    (Join-Path $Env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path ${Env:ProgramFiles(x86)} 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path $Env:LocalAppData 'Docker\Docker Desktop.exe')
  )
  foreach ($path in $candidates) {
    if ($path -and (Test-Path -LiteralPath $path)) { return $path }
  }
  return $null
}

function Test-DockerEngine {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & docker info --format '{{.ServerVersion}}' 1>$null 2>$null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Wait-DockerEngine {
  param([int]$TimeoutSeconds = 180)

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-DockerEngine) { return }
    Start-Sleep -Seconds 3
  }
  throw "Docker Desktop did not become ready within $TimeoutSeconds seconds."
}

function Start-DockerDesktop {
  if (Test-DockerEngine) {
    Write-Host 'Docker is already running.'
    return
  }

  $dockerDesktop = Get-DockerDesktopPath
  if (-not $dockerDesktop) {
    throw "Docker is not running, and Docker Desktop was not found. Start it manually, then run this script again."
  }

  Write-Host 'Starting Docker Desktop...'
  Start-Process -FilePath $dockerDesktop
  Write-Host 'Waiting for the Docker engine...'
  Wait-DockerEngine
  Write-Host 'Docker is ready.'
}

function Test-SupabaseApi {
  $client = $null
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $connected = $client.BeginConnect('127.0.0.1', 54321, $null, $null)
    $ready = $connected.AsyncWaitHandle.WaitOne(3000, $false)
    if (-not $ready) { return $false }
    $client.EndConnect($connected)
    return $true
  } catch {
    return $false
  } finally {
    if ($client) { $client.Close() }
  }
}

function Get-DotEnvValue([string]$Path, [string]$Key) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match "^\s*#") { continue }
    if ($line -match "^\s*$Key=(.*)$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

Assert-Command 'npm'
if (-not $SkipSupabase) {
  Assert-Command 'docker'
  Assert-Command 'supabase'
}

Write-Host 'Installing dependencies...'
Push-Location (Join-Path $repoRoot 'web')
try {
  & npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'npm install failed. Not starting Supabase or web.' -ForegroundColor Red
    exit 1
  }
} finally {
  Pop-Location
}

if (-not $SkipSupabase) {
  Start-DockerDesktop

  Write-Host 'Starting Supabase...'
  & supabase start
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Supabase failed to start. Not starting web' -ForegroundColor Red
    exit 1
  }
}

if (-not (Test-SupabaseApi)) {
  Write-Host 'Supabase is not running on 127.0.0.1:54321. Not starting web.' -ForegroundColor Red
  exit 1
}

Write-Host 'Starting web...'
Set-Location (Join-Path $repoRoot 'web')
& npm run dev
exit $LASTEXITCODE
