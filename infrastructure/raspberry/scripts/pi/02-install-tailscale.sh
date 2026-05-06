#!/bin/bash
# Task 2: Instalar y configurar Tailscale en la Raspberry Pi

set -e

echo "=== Instalando Tailscale ==="
curl -fsSL https://tailscale.com/install.sh | sh

echo ""
echo "=== Habilitando servicio tailscaled ==="
sudo systemctl enable --now tailscaled
sudo systemctl status tailscaled --no-pager

echo ""
echo "=== Autenticando con Tailscale ==="
echo "[ACCION REQUERIDA] Abre la URL que aparece a continuación en tu navegador"
echo "e inicia sesión con tu cuenta Tailscale (o crea una gratis en tailscale.com)"
echo ""
sudo tailscale up

echo ""
echo "=== IP Tailscale asignada a esta Pi ==="
tailscale ip
echo ""
echo ">>> IMPORTANTE: Anota esta IP. La necesitarás en los siguientes pasos. <<<"

echo ""
echo "=== Estado Tailscale ==="
tailscale status
