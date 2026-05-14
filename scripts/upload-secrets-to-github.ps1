# =============================================================================
# scripts/upload-secrets-to-github.ps1
# Sube los secrets de backend/.env.production.local a GitHub Actions Secrets
#
# Uso:
#   1. Abre PowerShell en la raíz del proyecto
#   2. gh auth login   (solo la primera vez)
#   3. powershell -ExecutionPolicy Bypass -File scripts\upload-secrets-to-github.ps1
# =============================================================================

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$EnvFile = Join-Path $Root "backend\.env.production.local"
$Repo = "RubenGZ/Health_Stack"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " HealthStack — Subida de Secrets a GitHub  " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# 1. Verificar gh auth
Write-Host "`n[1/4] Verificando autenticacion de gh..." -ForegroundColor Yellow
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] gh CLI no autenticado. Ejecuta primero:" -ForegroundColor Red
    Write-Host "        gh auth login" -ForegroundColor White
    exit 1
}
Write-Host "       OK" -ForegroundColor Green

# 2. Leer .env.production.local
Write-Host "`n[2/4] Leyendo backend\.env.production.local..." -ForegroundColor Yellow
if (-not (Test-Path $EnvFile)) {
    Write-Host "[ERROR] No existe $EnvFile" -ForegroundColor Red
    exit 1
}

$vars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^([^#\s][^=]*)=(.+)$') {
        $vars[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}

# Reconstruir PEM multilínea (reemplazar \n literal por saltos reales)
$privateKeyPem = $vars['JWT_PRIVATE_KEY_PEM'] -replace '\\n', "`n"
$publicKeyPem  = $vars['JWT_PUBLIC_KEY_PEM']  -replace '\\n', "`n"
$masterKey     = $vars['HEALTH_LINK_MASTER_KEY']

if (-not $privateKeyPem -or -not $publicKeyPem -or -not $masterKey) {
    Write-Host "[ERROR] Faltan valores en .env.production.local" -ForegroundColor Red
    exit 1
}
Write-Host "       OK — 3 secrets listos para subir" -ForegroundColor Green

# 3. Subir secrets
Write-Host "`n[3/4] Subiendo secrets a $Repo..." -ForegroundColor Yellow

Write-Host "       JWT_PRIVATE_KEY_PEM..." -NoNewline
$privateKeyPem | gh secret set JWT_PRIVATE_KEY_PEM --repo $Repo
Write-Host " OK" -ForegroundColor Green

Write-Host "       JWT_PUBLIC_KEY_PEM..." -NoNewline
$publicKeyPem | gh secret set JWT_PUBLIC_KEY_PEM --repo $Repo
Write-Host " OK" -ForegroundColor Green

Write-Host "       HEALTH_LINK_MASTER_KEY..." -NoNewline
gh secret set HEALTH_LINK_MASTER_KEY --body $masterKey --repo $Repo
Write-Host " OK" -ForegroundColor Green

# 4. Verificar
Write-Host "`n[4/4] Secrets activos en el repo:" -ForegroundColor Yellow
gh secret list --repo $Repo

Write-Host "`n============================================" -ForegroundColor Green
Write-Host " Completado. CI/CD ya tiene las claves." -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Pendiente (rellena en backend\.env.production.local):" -ForegroundColor Yellow
Write-Host "  - DATABASE_URL       (password real de PostgreSQL)" -ForegroundColor White
Write-Host "  - ALLOWED_ORIGINS    (tu dominio de produccion)" -ForegroundColor White
Write-Host "  - GROK_API_KEY       (si usas AI Coach/Insights)" -ForegroundColor White
Write-Host "  - SENTRY_DSN         (opcional, monitorización)" -ForegroundColor White
Write-Host "  - GOOGLE_CLIENT_ID   (si activas OAuth Google)" -ForegroundColor White
