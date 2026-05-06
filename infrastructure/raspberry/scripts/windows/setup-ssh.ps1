# Tasks 4+5: Generar claves SSH y crear alias de conexion a la Pi
# Ejecutar en Windows Terminal (PowerShell)
# PREREQUISITO: Tailscale instalado y conectado, Pi visible en red Tailscale

param(
    [Parameter(Mandatory=$true)]
    [string]$PiTailscaleIP,

    [string]$PiUser = "pi",
    [string]$KeyComment = "raspberry-access"
)

$SshDir = "$env:USERPROFILE\.ssh"
$KeyPath = "$SshDir\id_ed25519"
$ConfigPath = "$SshDir\config"

# --- Crear directorio .ssh si no existe ---
if (-not (Test-Path $SshDir)) {
    New-Item -ItemType Directory -Path $SshDir -Force | Out-Null
    Write-Host "[OK] Creado directorio $SshDir"
}

# --- Generar par de claves SSH ---
if (Test-Path $KeyPath) {
    Write-Host "[INFO] Ya existe clave SSH en $KeyPath. Saltando generacion."
} else {
    Write-Host "=== Generando par de claves SSH (ed25519) ==="
    ssh-keygen -t ed25519 -C $KeyComment -f $KeyPath -N '""'
    Write-Host "[OK] Claves generadas en $KeyPath"
}

# --- Mostrar clave publica ---
Write-Host ""
Write-Host "=== Clave publica (copia esta linea si necesitas añadirla manualmente) ==="
$PubKey = Get-Content "$KeyPath.pub"
Write-Host $PubKey

# --- Copiar clave publica a la Pi via SSH ---
Write-Host ""
Write-Host "=== Copiando clave publica a la Pi ($PiUser@$PiTailscaleIP) ==="
Write-Host "[ACCION] Introduce la contraseña de la Pi cuando se solicite (ultima vez)"
$RemoteCmd = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$PubKey' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
ssh "$PiUser@$PiTailscaleIP" $RemoteCmd

# --- Crear o actualizar ~/.ssh/config con alias raspi ---
Write-Host ""
Write-Host "=== Configurando alias SSH 'raspi' ==="

$ConfigBlock = @"

Host raspi
    HostName $PiTailscaleIP
    User $PiUser
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
    ServerAliveCountMax 3
"@

# Evitar duplicados
if (Test-Path $ConfigPath) {
    $existing = Get-Content $ConfigPath -Raw
    if ($existing -match "Host raspi") {
        Write-Host "[INFO] El alias 'raspi' ya existe en $ConfigPath. Revísalo manualmente si cambió la IP."
    } else {
        Add-Content -Path $ConfigPath -Value $ConfigBlock
        Write-Host "[OK] Alias 'raspi' añadido a $ConfigPath"
    }
} else {
    Set-Content -Path $ConfigPath -Value $ConfigBlock.TrimStart()
    Write-Host "[OK] Creado $ConfigPath con alias 'raspi'"
}

# --- Verificacion final ---
Write-Host ""
Write-Host "=== Verificando conexion por clave publica ==="
Write-Host "Ejecutando: ssh raspi"
ssh raspi -o ConnectTimeout=10 "echo '[OK] Conexion SSH exitosa como usuario: \$(whoami) en \$(hostname)'"

Write-Host ""
Write-Host "=== LISTO ==="
Write-Host "Desde ahora usa: ssh raspi"
Write-Host "Desde cualquier red, sin contraseña."
