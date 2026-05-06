# Acceso Remoto SSH a Raspberry Pi via Tailscale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar acceso SSH permanente y seguro desde un portátil Windows (Casa 2) a una Raspberry Pi 3 (Casa 1) a través de Tailscale, sin abrir puertos en el router ni pagar infraestructura.

**Architecture:** Tailscale crea una red privada WireGuard entre la Pi y el portátil Windows. Ambos dispositivos se autentican contra los servidores de coordinación de Tailscale y reciben IPs fijas en el rango `100.x.x.x`. La conexión SSH usa siempre esa IP fija interna, independientemente de la IP pública dinámica del router.

**Tech Stack:** Tailscale (WireGuard), openssh-server (Raspberry Pi OS), OpenSSH client (Windows 10+), systemd.

---

## Archivos que se crean o modifican

| Archivo | Dispositivo | Acción |
|---|---|---|
| `/etc/ssh/sshd_config` | Raspberry Pi | Modificar — deshabilitar auth por contraseña, deshabilitar root login |
| `~/.ssh/authorized_keys` | Raspberry Pi | Crear — añadir clave pública desde Windows |
| `~/.ssh/id_ed25519` + `id_ed25519.pub` | Windows (`%USERPROFILE%\.ssh\`) | Crear — par de claves SSH |
| `~/.ssh/config` | Windows (`%USERPROFILE%\.ssh\`) | Crear — alias de conexión a la Pi |

---

## Task 1: Verificar SSH en la Raspberry Pi

**Objetivo:** Confirmar que openssh-server está activo y funcionando antes de tocar nada más.

**Dispositivo:** Raspberry Pi (acceso local — teclado+monitor o red local)

- [ ] **Step 1: Verificar que openssh-server está instalado y activo**

```bash
sudo systemctl status ssh
```

Resultado esperado: línea con `Active: active (running)`. Si no está activo:

```bash
sudo apt update && sudo apt install -y openssh-server
sudo systemctl enable --now ssh
```

- [ ] **Step 2: Anotar el usuario y hostname actuales de la Pi**

```bash
whoami
hostname
```

Ejemplo de salida:
```
pi
raspberrypi
```

Guarda este usuario — lo usarás en los pasos de SSH. Si usas un usuario distinto a `pi`, sustituye `pi` por el tuyo en todos los comandos de este plan.

- [ ] **Step 3: Commit del estado inicial**

```bash
git init
git add .
git commit -m "chore: init repo — raspberry pi ssh tunnel project"
```

---

## Task 2: Instalar y configurar Tailscale en la Raspberry Pi

**Dispositivo:** Raspberry Pi

- [ ] **Step 1: Instalar Tailscale**

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

Resultado esperado: el script detecta Raspberry Pi OS (Debian-based), añade el repositorio APT e instala `tailscale` y `tailscaled`. Última línea: `Installation complete!`

- [ ] **Step 2: Habilitar el servicio para que arranque con la Pi**

```bash
sudo systemctl enable --now tailscaled
```

Verificar:

```bash
sudo systemctl status tailscaled
```

Resultado esperado: `Active: active (running)`

- [ ] **Step 3: Autenticar la Pi con tu cuenta Tailscale**

```bash
sudo tailscale up
```

El comando imprime una URL del estilo:
```
To authenticate, visit:
https://login.tailscale.com/a/xxxxxxxxxxxxxx
```

Abre esa URL en cualquier navegador (puede ser desde el portátil Windows), inicia sesión o crea una cuenta gratuita en tailscale.com, y autoriza el dispositivo.

- [ ] **Step 4: Verificar la IP Tailscale asignada a la Pi**

```bash
tailscale ip
```

Resultado esperado: una IP del rango `100.x.x.x`, por ejemplo:
```
100.94.12.45
```

**Anota esta IP** — es la que usarás siempre desde Windows para conectarte. No cambia aunque el router renueve su IP pública.

- [ ] **Step 5: Verificar conectividad Tailscale desde la propia Pi**

```bash
tailscale status
```

Resultado esperado: la Pi aparece como `online` en la lista. Aún no verás el portátil Windows porque lo configuramos en el siguiente Task.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: instalar y autenticar tailscale en raspberry pi"
```

---

## Task 3: Instalar y autenticar Tailscale en Windows

**Dispositivo:** Portátil Windows (Casa 2)

- [ ] **Step 1: Descargar el instalador de Tailscale para Windows**

Ve a: `https://tailscale.com/download/windows`

Descarga el instalador `.exe` y ejecútalo. Sigue el asistente (Next → Install → Finish).

- [ ] **Step 2: Iniciar sesión con la misma cuenta Tailscale**

Al terminar la instalación, Tailscale abre el navegador para autenticación. Inicia sesión con **la misma cuenta** que usaste en la Pi.

Tailscale aparece en la bandeja del sistema (icono en la barra de tareas). El estado debe ser `Connected`.

- [ ] **Step 3: Verificar que la Pi aparece en la red Tailscale**

Haz clic en el icono de Tailscale en la bandeja → verás la lista de dispositivos de tu red. La Pi debe aparecer como online con su IP `100.x.x.x`.

Alternativamente, desde PowerShell o Windows Terminal:

```powershell
ping 100.94.12.45
```

(Sustituye por la IP real de tu Pi anotada en Task 2, Step 4)

Resultado esperado:
```
Reply from 100.94.12.45: bytes=32 time=15ms TTL=64
```

Si responde al ping, el túnel Tailscale está funcionando correctamente.

---

## Task 4: Generar par de claves SSH en Windows y copiarlas a la Pi

**Objetivo:** Configurar autenticación por clave pública para no usar contraseña.

**Dispositivo:** Portátil Windows → luego Raspberry Pi

- [ ] **Step 1: Generar par de claves SSH en Windows**

Abre Windows Terminal (o PowerShell) y ejecuta:

```powershell
ssh-keygen -t ed25519 -C "raspberry-access"
```

Cuando pregunte la ruta, pulsa Enter para aceptar el valor por defecto (`C:\Users\TuUsuario\.ssh\id_ed25519`).

Cuando pregunte passphrase: puedes dejarla vacía (Enter) para acceso sin contraseña, o añadir una frase si prefieres más seguridad.

Resultado esperado:
```
Your identification has been saved in C:\Users\TuUsuario\.ssh\id_ed25519
Your public key has been saved in C:\Users\TuUsuario\.ssh\id_ed25519.pub
```

- [ ] **Step 2: Ver el contenido de la clave pública**

```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub"
```

Resultado esperado (una línea larga):
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... raspberry-access
```

Copia toda esa línea al portapapeles.

- [ ] **Step 3: Añadir la clave pública a la Pi**

Desde Windows Terminal, usando la IP Tailscale de la Pi (y aún autenticándote con contraseña por última vez):

```powershell
ssh pi@100.94.12.45 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo 'PEGA_AQUI_TU_CLAVE_PUBLICA' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Sustituye `PEGA_AQUI_TU_CLAVE_PUBLICA` por la línea completa del Step 2, y `100.94.12.45` por la IP real de tu Pi.

Introduce la contraseña de la Pi cuando la pida.

- [ ] **Step 4: Verificar que el login por clave funciona**

```powershell
ssh pi@100.94.12.45
```

Resultado esperado: acceso directo a la Pi **sin pedir contraseña**. El prompt debe ser algo como:

```
pi@raspberrypi:~ $
```

Si pide contraseña, el archivo `authorized_keys` no se creó correctamente — repite el Step 3.

Una vez dentro, escribe `exit` para salir.

---

## Task 5: Crear alias SSH en Windows para conexión rápida

**Dispositivo:** Portátil Windows

- [ ] **Step 1: Crear o editar el fichero de configuración SSH**

Abre Windows Terminal y ejecuta:

```powershell
New-Item -ItemType File -Path "$env:USERPROFILE\.ssh\config" -Force
notepad "$env:USERPROFILE\.ssh\config"
```

- [ ] **Step 2: Añadir el bloque de configuración para la Pi**

Escribe en el fichero (sustituye la IP por la real de tu Pi):

```
Host raspi
    HostName 100.94.12.45
    User pi
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

Guarda y cierra el editor.

- [ ] **Step 3: Verificar conexión con el alias**

```powershell
ssh raspi
```

Resultado esperado: acceso directo a la Pi sin contraseña ni IP. El prompt:

```
pi@raspberrypi:~ $
```

A partir de ahora, `ssh raspi` es el único comando necesario desde cualquier red.

---

## Task 6: Reforzar la seguridad SSH en la Raspberry Pi

**Objetivo:** Deshabilitar autenticación por contraseña y login de root.

**Dispositivo:** Raspberry Pi (conéctate con `ssh raspi` desde Windows)

- [ ] **Step 1: Hacer backup del fichero de configuración SSH**

```bash
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup
```

- [ ] **Step 2: Editar la configuración SSH**

```bash
sudo nano /etc/ssh/sshd_config
```

Localiza y cambia (o añade si no existen) estas líneas:

```
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
```

Para buscar en nano: `Ctrl+W` → escribe el texto → Enter. Para guardar: `Ctrl+O` → Enter. Para salir: `Ctrl+X`.

- [ ] **Step 3: Reiniciar el servicio SSH para aplicar cambios**

```bash
sudo systemctl restart ssh
```

- [ ] **Step 4: Verificar que la conexión por clave sigue funcionando**

**Sin cerrar la sesión SSH actual**, abre una NUEVA ventana de Windows Terminal y ejecuta:

```powershell
ssh raspi
```

Resultado esperado: acceso directo sin contraseña. Si funciona, los cambios son correctos.

Solo cierra la sesión anterior cuando confirmes que la nueva conexión funciona.

- [ ] **Step 5: Commit**

En la Pi:

```bash
git add .
git commit -m "feat: reforzar ssh — deshabilitar auth por contraseña y root login"
```

---

## Task 7: Configurar expiración de sesión Tailscale en "never expire"

**Objetivo:** Evitar que Tailscale pida re-autenticación cada 180 días en la Pi (modo servidor headless).

**Dispositivo:** Navegador web (cualquier dispositivo)

- [ ] **Step 1: Abrir el panel de administración de Tailscale**

Ve a: `https://login.tailscale.com/admin/machines`

- [ ] **Step 2: Deshabilitar la expiración de clave en la Pi**

Localiza la Raspberry Pi en la lista de máquinas. Haz clic en los tres puntos (`...`) a la derecha → selecciona **"Disable key expiry"**.

Resultado esperado: la columna de expiración de la Pi muestra `Key expiry disabled`.

Esto evita que la Pi quede desconectada de Tailscale tras 180 días sin re-autenticación manual — crítico para un servidor headless.

---

## Task 8: Verificación final — test desde red diferente

**Objetivo:** Confirmar que todo funciona desde una red completamente distinta a Casa 1.

- [ ] **Step 1: Conecta el portátil Windows a una red diferente**

Opciones:
- Hotspot del móvil
- WiFi de otro lugar (oficina, cafetería)
- Desconectar de Casa 2 y reconectar a otra red

- [ ] **Step 2: Verificar que Tailscale sigue conectado en Windows**

Icono de Tailscale en la bandeja → estado `Connected`.

- [ ] **Step 3: Conectar por SSH a la Pi**

```powershell
ssh raspi
```

Resultado esperado: acceso al terminal de la Pi desde una red completamente diferente, sin cambiar ninguna configuración.

- [ ] **Step 4: Ejecutar comandos de verificación en la Pi**

```bash
hostname
uptime
tailscale status
```

Resultado esperado:
```
raspberrypi
 10:23:45 up 2 days, 3:12, ...
# Ambos dispositivos aparecen como online en tailscale status
```

- [ ] **Step 5: Reiniciar la Pi y verificar recuperación automática**

```bash
sudo reboot
```

Espera 60 segundos y vuelve a conectar:

```powershell
ssh raspi
```

Resultado esperado: la Pi vuelve a estar accesible tras el reinicio sin intervención manual. Tailscale y SSH arrancan solos vía systemd.

---

## Criterios de éxito finales

- [ ] `ssh raspi` funciona desde cualquier red sin contraseña
- [ ] La Pi es accesible tras un reinicio sin intervención manual
- [ ] El login por contraseña está deshabilitado (`PasswordAuthentication no`)
- [ ] El login de root está deshabilitado (`PermitRootLogin no`)
- [ ] La expiración de clave Tailscale está deshabilitada en la Pi
- [ ] La IP Tailscale de la Pi no cambia entre sesiones

---

## Troubleshooting rápido

| Síntoma | Causa probable | Solución |
|---|---|---|
| `ssh raspi` no conecta | Tailscale no está activo en Windows | Clic en icono Tailscale → Connect |
| `ssh raspi` no conecta | Pi apagada o tailscaled parado | Acceso local a Pi: `sudo systemctl start tailscaled && sudo tailscale up` |
| Pide contraseña al hacer SSH | `authorized_keys` mal configurado | Repetir Task 4, Step 3 |
| Pi no aparece en `tailscale status` | Sesión expirada en la Pi | Acceso local: `sudo tailscale up` y re-autenticar |
| Ping a IP Tailscale no responde | Tailscale no conectado en alguno de los dos lados | Verificar estado en ambos dispositivos |
