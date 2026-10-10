# Stops the local stack started by scripts/dev.ps1:
#   1. Closes the terminal that is running the stack, including the web dev process
#   2. supabase stop
#   3. Frees the web and Supabase ports if anything is still listening
#   4. Quits Docker Desktop
#
# Run this from a second terminal. The first one stays occupied by npm run stack.
#
# Usage from the repo root:
#   npm run stop
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop.ps1

$ErrorActionPreference = 'Continue'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

$StackPorts = @(4321, 54320, 54321, 54322, 54323, 54324, 54327, 54329, 8083)
$HostProcessNames = @(
  'WindowsTerminal.exe',
  'OpenConsole.exe',
  'Cursor.exe',
  'Code.exe',
  'explorer.exe',
  'conhost.exe'
)
$ShellProcessNames = @('powershell.exe', 'pwsh.exe', 'cmd.exe', 'node.exe')

$script:Processes = @()
$script:ProtectedIds = @()
$script:StoppedIds = @()

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

function Get-ProcessRecord([int]$ProcessId) {
  return $script:Processes | Where-Object { [int]$_.ProcessId -eq $ProcessId } | Select-Object -First 1
}

function Get-AncestorProcessIds([int]$ProcessId) {
  $ids = @($ProcessId)
  $current = $ProcessId
  $guard = 0
  while ($guard -lt 25) {
    $guard++
    $record = Get-ProcessRecord $current
    if (-not $record -or -not $record.ParentProcessId) { break }
    $parentId = [int]$record.ParentProcessId
    if ($parentId -le 0 -or $parentId -eq $current) { break }
    $ids += $parentId
    $current = $parentId
  }
  return $ids
}

function Test-StackCommandLine([string]$CommandLine) {
  if (-not $CommandLine) { return $false }
  if ($CommandLine -match 'scripts[\\/]stop\.ps1') { return $false }
  if ($CommandLine -match 'scripts[\\/]dev\.ps1') { return $true }
  if ($CommandLine -match 'npm-cli\.js' -and $CommandLine -match '\brun\s+stack\b') { return $true }

  $rootPattern = [regex]::Escape($repoRoot)
  return ($CommandLine -match $rootPattern -and $CommandLine -match '\b(node|npm|astro)\b')
}

function Get-HostingShellProcessId([int]$ProcessId) {
  $current = Get-ProcessRecord $ProcessId
  $candidate = $null
  $guard = 0
  while ($current -and $guard -lt 25) {
    $guard++
    $currentId = [int]$current.ProcessId
    if ($script:ProtectedIds -contains $currentId) { return $null }

    $parent = $null
    if ($current.ParentProcessId) {
      $parent = Get-ProcessRecord ([int]$current.ParentProcessId)
    }

    if ($ShellProcessNames -contains $current.Name) {
      $candidate = $currentId
      if (-not $parent -or ($HostProcessNames -contains $parent.Name)) {
        return $candidate
      }
    }

    if (-not $parent -or [int]$parent.ProcessId -eq $currentId) { break }
    $current = $parent
  }
  return $candidate
}

function Stop-ProcessTree([int]$ProcessId) {
  if ($ProcessId -le 4) { return }
  if ($script:ProtectedIds -contains $ProcessId) { return }
  if ($script:StoppedIds -contains $ProcessId) { return }

  $script:StoppedIds += $ProcessId
  & taskkill.exe /F /T /PID $ProcessId 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Close-StackTerminals {
  $targets = @($script:Processes | Where-Object { Test-StackCommandLine $_.CommandLine })
  $terminalProcessIds = @()
  foreach ($target in $targets) {
    $targetId = [int]$target.ProcessId
    $terminalProcessId = Get-HostingShellProcessId $targetId
    if ($terminalProcessId) {
      $terminalProcessIds += $terminalProcessId
    } elseif ($script:ProtectedIds -notcontains $targetId) {
      $terminalProcessIds += $targetId
    }
  }

  $terminalProcessIds = @($terminalProcessIds | Select-Object -Unique)
  if (-not $terminalProcessIds) {
    Write-Host 'No stack terminal is running.'
    return
  }

  foreach ($terminalProcessId in $terminalProcessIds) {
    $name = (Get-Process -Id $terminalProcessId -ErrorAction SilentlyContinue).ProcessName
    Write-Host "Closing stack terminal $name ($terminalProcessId)..."
    Stop-ProcessTree $terminalProcessId
  }
}

function Get-ListeningProcessIds([int]$Port) {
  $ids = @()
  $needle = ":$Port "
  foreach ($line in (& netstat.exe -ano -p tcp)) {
    if ($line -notmatch 'LISTENING') { continue }
    if ($line -notlike "*$needle*") { continue }
    $parts = @($line -split '\s+' | Where-Object { $_ })
    $procId = 0
    if ([int]::TryParse([string]$parts[-1], [ref]$procId) -and $procId -gt 4) {
      $ids += $procId
    }
  }
  return @($ids | Select-Object -Unique)
}

function Test-DockerOwnedProcess([int]$ProcessId) {
  $record = Get-ProcessRecord $ProcessId
  $name = $null
  if ($record) {
    $name = $record.Name
  } else {
    $name = (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue).ProcessName
  }
  if (-not $name) { return $false }
  return $name -match '^(Docker Desktop|com\.docker|docker|docker-proxy|wslrelay)'
}

function Stop-PortOwners {
  param(
    [int[]]$Ports,
    [switch]$IncludeDocker
  )

  foreach ($port in $Ports) {
    foreach ($procId in @(Get-ListeningProcessIds $port)) {
      if ($script:ProtectedIds -contains $procId) { continue }
      if (-not $IncludeDocker -and (Test-DockerOwnedProcess $procId)) { continue }
      $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
      Write-Host "Freeing port $port by stopping $name ($procId)..."
      Stop-ProcessTree $procId
    }
  }
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

function Get-DockerCliPath {
  $candidates = @(
    (Join-Path $Env:ProgramFiles 'Docker\Docker\DockerCli.exe'),
    (Join-Path ${Env:ProgramFiles(x86)} 'Docker\Docker\DockerCli.exe')
  )
  foreach ($path in $candidates) {
    if ($path -and (Test-Path -LiteralPath $path)) { return $path }
  }
  return $null
}

function Stop-DockerDesktop {
  $running = @(Get-Process -Name 'Docker Desktop', 'com.docker.backend' -ErrorAction SilentlyContinue)
  if (-not $running) {
    Write-Host 'Docker Desktop is already quit.'
    return
  }

  $dockerCli = Get-DockerCliPath
  if ($dockerCli) {
    Write-Host 'Quitting Docker Desktop...'
    & $dockerCli -Shutdown
  } else {
    $dockerDesktop = Get-DockerDesktopPath
    if ($dockerDesktop) {
      Write-Host 'Quitting Docker Desktop...'
      Start-Process -FilePath $dockerDesktop -ArgumentList '-Quit' | Out-Null
    } else {
      Write-Host 'Docker Desktop was not found. Stopping Docker processes...'
    }
  }

  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    $running = @(Get-Process -Name 'Docker Desktop', 'com.docker.backend' -ErrorAction SilentlyContinue)
    if (-not $running) {
      Write-Host 'Docker Desktop has quit.'
      return
    }
    Start-Sleep -Seconds 2
  }

  Write-Host 'Docker Desktop did not quit in time. Stopping its processes...'
  foreach ($name in @(
      'Docker Desktop',
      'com.docker.backend',
      'com.docker.build',
      'com.docker.dev-envs',
      'com.docker.extensions',
      'DockerCli'
    )) {
    Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

$script:Processes = @(Get-CimInstance Win32_Process)
$script:ProtectedIds = @(Get-AncestorProcessIds -ProcessId $PID)

Write-Host 'Closing stack terminals...'
Close-StackTerminals

Write-Host 'Freeing the web port...'
Stop-PortOwners -Ports @(4321)

if (Get-Command supabase -ErrorAction SilentlyContinue) {
  if (Test-DockerEngine) {
    Write-Host 'Stopping Supabase...'
    & supabase stop
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'supabase stop did not succeed. Stack ports will still be cleared.' -ForegroundColor Yellow
    }
  } else {
    Write-Host 'Docker engine is not running. Skipping supabase stop.'
  }
} else {
  Write-Host 'supabase was not found. Skipping supabase stop.' -ForegroundColor Yellow
}

Write-Host 'Freeing stack ports...'
Stop-PortOwners -Ports $StackPorts

Stop-DockerDesktop

Write-Host 'Clearing any ports still left open...'
$script:Processes = @(Get-CimInstance Win32_Process)
Stop-PortOwners -Ports $StackPorts -IncludeDocker

$busy = @()
foreach ($port in $StackPorts) {
  foreach ($procId in @(Get-ListeningProcessIds $port)) {
    $busy += "$port (PID $procId)"
  }
}

if ($busy) {
  Write-Host ("Some stack ports are still in use: " + ($busy -join ', ')) -ForegroundColor Yellow
  exit 1
}

Write-Host 'Stack stopped.'
exit 0
