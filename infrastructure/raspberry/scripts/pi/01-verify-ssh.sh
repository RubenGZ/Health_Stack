#!/bin/bash
# Task 1: Verificar SSH en la Raspberry Pi

set -e

echo "=== Verificando openssh-server ==="
if systemctl is-active --quiet ssh; then
    echo "[OK] SSH está activo y corriendo"
else
    echo "[INFO] SSH no está activo. Instalando y activando..."
    sudo apt update
    sudo apt install -y openssh-server
    sudo systemctl enable --now ssh
    echo "[OK] SSH instalado y activado"
fi

echo ""
echo "=== Info del sistema ==="
echo "Usuario:  $(whoami)"
echo "Hostname: $(hostname)"
echo "IP local: $(hostname -I | awk '{print $1}')"

echo ""
echo "=== Estado SSH ==="
sudo systemctl status ssh --no-pager -l
