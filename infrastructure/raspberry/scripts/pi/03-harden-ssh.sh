#!/bin/bash
# Task 6: Reforzar seguridad SSH en la Raspberry Pi

set -e

SSHD_CONFIG="/etc/ssh/sshd_config"

echo "=== Backup de sshd_config ==="
sudo cp "$SSHD_CONFIG" "${SSHD_CONFIG}.backup"
echo "[OK] Backup guardado en ${SSHD_CONFIG}.backup"

echo ""
echo "=== Aplicando configuración segura ==="

apply_setting() {
    local key="$1"
    local value="$2"
    if sudo grep -q "^${key}" "$SSHD_CONFIG"; then
        sudo sed -i "s/^${key}.*/${key} ${value}/" "$SSHD_CONFIG"
    elif sudo grep -q "^#${key}" "$SSHD_CONFIG"; then
        sudo sed -i "s/^#${key}.*/${key} ${value}/" "$SSHD_CONFIG"
    else
        echo "${key} ${value}" | sudo tee -a "$SSHD_CONFIG" > /dev/null
    fi
    echo "[OK] ${key} ${value}"
}

apply_setting "PasswordAuthentication" "no"
apply_setting "PermitRootLogin" "no"
apply_setting "PubkeyAuthentication" "yes"
apply_setting "AuthorizedKeysFile" ".ssh/authorized_keys"

echo ""
echo "=== Verificando configuración ==="
sudo sshd -t && echo "[OK] Configuración SSH válida, sin errores de sintaxis"

echo ""
echo "=== Reiniciando SSH ==="
sudo systemctl restart ssh
echo "[OK] SSH reiniciado con configuración reforzada"

echo ""
echo ">>> IMPORTANTE: Antes de cerrar esta sesión, abre una NUEVA terminal"
echo "    y verifica que 'ssh raspi' sigue funcionando desde Windows. <<<"
