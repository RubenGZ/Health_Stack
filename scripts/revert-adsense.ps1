# scripts/revert-adsense.ps1
# Revierte index.html a los placeholders de AdSense (para poder hacer git commit limpio)
# Uso: powershell -ExecutionPolicy Bypass -File scripts/revert-adsense.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$EnvFile = Join-Path $Root "frontend\.env.adsense"
$IndexFile = Join-Path $Root "frontend\index.html"

# Leer Publisher ID real del .env.adsense para poder revertirlo
$vars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^([^#][^=]*)=(.+)$') {
        $vars[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}

$pubId = $vars['ADSENSE_PUBLISHER_ID']
$slotDashboard = $vars['ADSENSE_SLOT_DASHBOARD']
$slotFooter = $vars['ADSENSE_SLOT_FOOTER']

$content = Get-Content $IndexFile -Raw -Encoding UTF8
$content = $content -replace [regex]::Escape($pubId), 'ca-pub-XXXXXXXXXXXXXXXX'
$content = $content -replace "data-ad-slot=`"$slotDashboard`"", 'data-ad-slot="0987654321"'
$content = $content -replace "data-ad-slot=`"$slotFooter`"", 'data-ad-slot="1234567890"'

Set-Content $IndexFile -Value $content -Encoding UTF8 -NoNewline

Write-Host "[OK] AdSense revertido a placeholders — index.html listo para git commit" -ForegroundColor Green
