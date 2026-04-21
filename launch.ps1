#Requires -Version 5.1
<#
  .SYNOPSIS
    HealthStack Pro — Launcher
    Arranca App (puerto 3000) + Landing (puerto 5174) y abre el navegador.

  .DESCRIPTION
    Ejecutar con:  .\launch.ps1
    Si sale el error "scripts deshabilitados", ejecutar primero:
      Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#>

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

# ── Banner ──────────────────────────────────────────────────────
Clear-Host
Write-Host ""
Write-Host "  HealthStack Pro — Dev Launcher" -ForegroundColor Cyan
Write-Host "  ==============================" -ForegroundColor DarkCyan
Write-Host ""

# ── Función: comprobar si un puerto está ocupado ─────────────────
function Test-Port($port) {
  $conn = (New-Object System.Net.Sockets.TcpClient)
  try {
    $conn.Connect("127.0.0.1", $port)
    $conn.Close()
    return $true
  } catch { return $false }
}

# ── 1. App (frontend vanilla JS) — puerto 3000 ──────────────────
if (Test-Port 3000) {
  Write-Host "  [App] Puerto 3000 ya en uso — asumiendo servidor activo." -ForegroundColor Yellow
} else {
  Write-Host "  [1/2] Iniciando App en localhost:3000..." -ForegroundColor Green
  Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "Set-Location '$ROOT\frontend'; npx serve . --listen 3000 --no-clipboard" `
    -WindowStyle Normal
}

# ── 2. Landing (Vite + React) — puerto 5174 ─────────────────────
if (Test-Port 5174) {
  Write-Host "  [Landing] Puerto 5174 ya en uso — asumiendo servidor activo." -ForegroundColor Yellow
} else {
  Write-Host "  [2/2] Iniciando Landing en localhost:5174..." -ForegroundColor Green
  Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "Set-Location '$ROOT\landing'; npm run dev" `
    -WindowStyle Normal
}

# ── 3. Esperar a que los servidores respondan (máx. 15 s) ────────
Write-Host ""
Write-Host "  Esperando servidores" -NoNewline -ForegroundColor DarkGray
$waited = 0
while (-not ((Test-Port 3000) -and (Test-Port 5174))) {
  Start-Sleep -Milliseconds 800
  Write-Host "." -NoNewline -ForegroundColor DarkGray
  $waited += 0.8
  if ($waited -ge 15) { break }
}
Write-Host " listo!" -ForegroundColor Green

# ── 4. Abrir navegador ───────────────────────────────────────────
Write-Host ""
Write-Host "  Abriendo navegador..." -ForegroundColor Cyan
Start-Process "http://localhost:3000"
Start-Sleep -Milliseconds 600
Start-Process "http://localhost:5174"

# ── 5. Resumen ───────────────────────────────────────────────────
Write-Host ""
Write-Host "  ==============================" -ForegroundColor DarkCyan
Write-Host "  App     → " -NoNewline -ForegroundColor White
Write-Host "http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Landing → " -NoNewline -ForegroundColor White
Write-Host "http://localhost:5174" -ForegroundColor Cyan
Write-Host "  ==============================" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  Cierra las ventanas de PowerShell para detener los servidores." -ForegroundColor DarkGray
Write-Host ""
