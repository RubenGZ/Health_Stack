# ============================================================
# start.ps1 — Arranca el backend FastAPI con venv automático
# Uso: powershell -ExecutionPolicy Bypass -File backend/start.ps1
# ============================================================

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot

# 1. Buscar Python
$PyCmd = $null
foreach ($cmd in @('python', 'python3', 'py')) {
  try {
    $ver = & $cmd --version 2>&1
    if ($ver -match 'Python 3') { $PyCmd = $cmd; break }
  } catch { }
}

if (-not $PyCmd) {
  Write-Host "[ERROR] Python 3 no encontrado. Instala Python desde https://python.org" -ForegroundColor Red
  exit 1
}

Write-Host "[OK] Python encontrado: $PyCmd" -ForegroundColor Green

# 2. Crear venv si no existe
$VenvDir = Join-Path $ScriptDir 'venv'
if (-not (Test-Path $VenvDir)) {
  Write-Host "[...] Creando entorno virtual en $VenvDir" -ForegroundColor Cyan
  & $PyCmd -m venv $VenvDir
}

# 3. Activar venv y obtener python/pip del venv
$VenvPython = Join-Path $VenvDir 'Scripts\python.exe'
$VenvPip    = Join-Path $VenvDir 'Scripts\pip.exe'

if (-not (Test-Path $VenvPython)) {
  Write-Host "[ERROR] No se pudo crear el venv correctamente." -ForegroundColor Red
  exit 1
}

# 4. Instalar dependencias si hace falta
$ReqFile = Join-Path $ScriptDir 'requirements.txt'
$MarkerFile = Join-Path $VenvDir '.installed'
if (-not (Test-Path $MarkerFile)) {
  Write-Host "[...] Instalando dependencias (primera vez, puede tardar)..." -ForegroundColor Cyan
  & $VenvPip install -r $ReqFile --quiet
  New-Item -ItemType File -Path $MarkerFile | Out-Null
  Write-Host "[OK] Dependencias instaladas" -ForegroundColor Green
}

# 5. Cargar .env si existe
$EnvFile = Join-Path $ScriptDir '.env'
if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^([^#][^=]*)=(.*)$') {
      [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), 'Process')
    }
  }
  Write-Host "[OK] Variables de entorno cargadas desde .env" -ForegroundColor Green
}

# 6. Arrancar uvicorn desde el venv
Write-Host "[...] Iniciando FastAPI en http://localhost:8000" -ForegroundColor Cyan
Set-Location $ScriptDir
& $VenvPython -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
