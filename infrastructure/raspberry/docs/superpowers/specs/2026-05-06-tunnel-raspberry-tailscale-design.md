# Diseño: Acceso Remoto SSH a Raspberry Pi via Tailscale

**Fecha:** 2026-05-06  
**Estado:** Aprobado

---

## Contexto y objetivo

Acceder por SSH a una Raspberry Pi 3 en Casa 1 (detrás de NAT doméstico, sin port forwarding) desde un portátil Windows en Casa 2, en cualquier red, sin depender de IP pública fija.

**Restricciones:**
- Sin abrir puertos en el router
- Sin VPS ni servidor externo de pago
- Solución gratuita
- Cliente: Windows
- Acceso necesario: solo SSH (terminal)

---

## Arquitectura

```
[Casa 2 — Windows]                        [Casa 1 — Raspberry Pi 3]
  SSH client (Windows Terminal / PuTTY)       openssh-server
  Tailscale Windows app                       tailscaled (systemd)
  IP Tailscale: 100.x.y.z        ←P2P→       IP Tailscale: 100.a.b.c
                        │                │
                 [Tailscale coordination servers]
                 Solo coordinan el handshake.
                 Tráfico va P2P directo cuando es posible.
                 Relay DERP cifrado como fallback.
```

Ambos dispositivos se unen a la misma red Tailscale (vinculada a una cuenta gratuita). Tailscale asigna a cada dispositivo una IP fija en el rango `100.x.x.x` que no cambia aunque la IP pública del router sea dinámica. La conexión SSH usa siempre esa IP fija interna.

---

## Componentes

| Componente | Dispositivo | Rol |
|---|---|---|
| `openssh-server` | Raspberry Pi | Acepta conexiones SSH entrantes |
| `tailscaled` | Raspberry Pi | Daemon Tailscale, servicio systemd |
| Tailscale Windows App | Portátil Windows | Cliente Tailscale, corre en background |
| Windows Terminal / PuTTY | Portátil Windows | Cliente SSH para ejecutar comandos |
| Cuenta Tailscale (free) | — | Vincula ambos dispositivos a la misma red privada |

---

## Flujo de conexión

1. Pi arranca → `tailscaled` inicia automáticamente vía systemd
2. Pi se autentica con los servidores de coordinación Tailscale y anuncia su presencia
3. Portátil Windows con Tailscale activo ve la Pi en la red privada como `100.a.b.c`
4. Desde Windows Terminal: `ssh pi@100.a.b.c` (o el usuario que corresponda)
5. Tailscale establece túnel WireGuard cifrado P2P entre ambos dispositivos
6. Si NAT impide P2P directo, usa relay DERP (también cifrado E2E, Tailscale no puede leer el contenido)

---

## Configuración de seguridad SSH

Para reforzar el SSH de la Pi una vez accesible via Tailscale:

- Autenticación por clave pública (deshabilitar contraseña)
- Generar par de claves en Windows, copiar clave pública a la Pi
- Deshabilitar login de root por SSH
- Opcionalmente: restringir SSH solo a la interfaz Tailscale (`ListenAddress 100.a.b.c`)

---

## Persistencia y arranque automático

- `tailscaled` se configura como servicio systemd con `enable` para arrancar con la Pi
- Una vez autenticado con `tailscale up`, no requiere re-autenticación en reinicios
- La Pi no necesita monitor ni teclado conectado (modo headless)

---

## Pasos de implementación de alto nivel

### En la Raspberry Pi (Casa 1)
1. Instalar Tailscale (`curl -fsSL https://tailscale.com/install.sh | sh`)
2. Arrancar y habilitar el servicio (`sudo systemctl enable --now tailscaled`)
3. Autenticar con la cuenta Tailscale (`sudo tailscale up`)
4. Verificar IP asignada (`tailscale ip`)
5. Verificar que openssh-server está activo (`sudo systemctl status ssh`)
6. Generar y configurar clave SSH pública desde Windows
7. Reforzar `/etc/ssh/sshd_config` (deshabilitar PasswordAuthentication)

### En el portátil Windows (Casa 2)
1. Descargar e instalar Tailscale para Windows desde tailscale.com
2. Iniciar sesión con la misma cuenta Tailscale
3. Verificar que la Pi aparece en la lista de dispositivos
4. Generar par de claves SSH (`ssh-keygen` en PowerShell/Windows Terminal)
5. Copiar clave pública a la Pi (`ssh-copy-id` o manualmente)
6. Conectar: `ssh pi@<IP-tailscale-de-la-pi>`

---

## Criterios de éxito

- Desde Casa 2 (o cualquier red) se puede ejecutar `ssh pi@100.a.b.c` y llegar a la Pi
- La conexión funciona sin modificar nada en el router de Casa 1
- La Pi es accesible tras un reinicio sin intervención manual
- La autenticación es por clave pública (no por contraseña)
- La IP de acceso es siempre la misma independientemente de la IP pública de Casa 1

---

## Limitaciones conocidas

- Si la Pi está apagada, no hay acceso (obvio, pero documentado)
- Tailscale free requiere re-autenticación cada 180 días (se puede extender a "never expire" en el panel web)
- El tráfico pasa por servidores relay DERP de Tailscale si P2P falla, aunque siempre cifrado E2E
