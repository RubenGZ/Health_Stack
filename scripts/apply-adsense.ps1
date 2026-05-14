# scripts/apply-adsense.ps1
# Aplica los IDs reales de AdSense al index.html
# Uso: powershell -ExecutionPolicy Bypass -File scripts/apply-adsense.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$EnvFile = Join-Path $Root "frontend\.env.adsense"
$IndexFile = Join-Path $Root "frontend\index.html"

if (-not (Test-Path $EnvFile)) {
    Write-Host "[ERROR] No existe frontend\.env.adsense" -ForegroundColor Red
    Write-Host "        Crea el archivo con tus IDs de AdSense reales." -ForegroundColor Yellow
    exit 1
}

# Leer variables del .env.adsense
$vars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^([^#][^=]*)=(.+)$') {
        $vars[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}

$pubId = $vars['ADSENSE_PUBLISHER_ID']
$slotDashboard = $vars['ADSENSE_SLOT_DASHBOARD']
$slotFooter = $vars['ADSENSE_SLOT_FOOTER']

if ($pubId -like '*XXXX*' -or -not $pubId) {
    Write-Host "[ERROR] ADSENSE_PUBLISHER_ID no configurado en frontend\.env.adsense" -ForegroundColor Red
    exit 1
}

# Leer index.html
$content = Get-Content $IndexFile -Raw -Encoding UTF8

# Reemplazar placeholders
$content = $content -replace 'ca-pub-XXXXXXXXXXXXXXXX', $pubId
$content = $content -replace 'data-ad-slot="0987654321"', "data-ad-slot=`"$slotDashboard`""
$content = $content -replace 'data-ad-slot="1234567890"', "data-ad-slot=`"$slotFooter`""

# Guardar
Set-Content $IndexFile -Value $content -Encoding UTF8 -NoNewline

Write-Host "[OK] AdSense aplicado a frontend\index.html" -ForegroundColor Green
Write-Host "     Publisher: $pubId" -ForegroundColor Cyan
Write-Host "     Slot dashboard: $slotDashboard" -ForegroundColor Cyan
Write-Host "     Slot footer: $slotFooter" -ForegroundColor Cyan
Write-Host ""
Write-Host "[AVISO] index.html ahora tiene IDs reales. No hagas git add de este archivo" -ForegroundColor Yellow
Write-Host "        sin revertirlos primero con: scripts\revert-adsense.ps1" -ForegroundColor Yellow
