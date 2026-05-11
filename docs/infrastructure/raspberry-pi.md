# Raspberry Pi — Guía de despliegue y comandos esenciales

Referencia rápida para el equipo de dev. Guárdala, no la memorices.

---

## 1. Conectarse a la Pi

```bash
ssh raspi
```

> **Este es el comando.** Si no funciona, el alias no está configurado en tu `~/.ssh/config` — ver sección "Primera vez" al final.

También funciona:

```bash
ssh pi@healthstack-pi.local
```

---

## 2. Primera vez — Clonar el proyecto

El proyecto vive en `~/health-stack` en la Pi. Si es una Pi nueva y no está clonado:

```bash
cd ~
git clone https://github.com/RubenGZ/Health_Stack health-stack
cd health-stack
```

> ⚠️ La carpeta es `~/health-stack` (con guión), no `healthstack-pro`.

---

## 3. Desplegar nueva versión (flujo habitual)

```bash
# 1. Ir al proyecto
cd ~/health-stack

# 2. Traer los últimos cambios
git pull origin main

# 3. Build de la landing (genera landing/dist/ que sirve Nginx)
cd landing
npm install
npm run build
cd ..

# 4. Recargar Nginx para servir el nuevo dist (sin downtime)
docker exec healthstack_nginx nginx -s reload
```

> No hace falta reconstruir los contenedores para cambios de frontend — solo rebuild + reload nginx.

---

## 4. Ver la URL activa del túnel

El túnel Cloudflare genera una URL pública. Para verla:

```bash
docker logs healthstack_tunnel_quick 2>&1 | grep "trycloudflare"
```

---

## 5. Gestión de contenedores

```bash
# Ver estado de todos los servicios
docker ps

# Logs en tiempo real (todos los servicios)
docker compose -f docker-compose.pi.yml logs -f

# Logs de un servicio concreto
docker compose -f docker-compose.pi.yml logs -f backend
docker compose -f docker-compose.pi.yml logs -f nginx
docker compose -f docker-compose.pi.yml logs -f db

# Parar todo
docker compose -f docker-compose.pi.yml down

# Levantar todo (rebuild completo — solo si cambia el backend)
docker compose -f docker-compose.pi.yml up -d --build

# Reiniciar un servicio concreto
docker compose -f docker-compose.pi.yml restart backend
```

---

## 6. Nginx

```bash
# Recargar config sin downtime (tras cambios de frontend)
docker exec healthstack_nginx nginx -s reload

# Verificar que la config no tiene errores
docker exec healthstack_nginx nginx -t

# Ver access log
docker exec healthstack_nginx tail -f /var/log/nginx/access.log
```

---

## 7. Base de datos (PostgreSQL)

```bash
# Entrar a la shell de PostgreSQL
docker exec -it healthstack_db psql -U postgres -d healthstack

# Crear la BD de tests (solo la primera vez)
docker exec healthstack_db psql -U postgres -c "CREATE DATABASE healthstack_test;"

# Ver tablas
docker exec -it healthstack_db psql -U postgres -d healthstack -c "\dt"

# Backup manual
docker exec healthstack_db pg_dump -U postgres healthstack > backup_$(date +%Y%m%d).sql
```

---

## 8. Backend FastAPI

```bash
# Entrar al contenedor del backend
docker exec -it healthstack_backend bash

# Revisar la API está viva
curl http://localhost:8000/health
curl http://localhost:8000/docs   # Swagger UI
```

---

## 9. Comandos útiles de la Pi

```bash
# Ver uso de disco
df -h

# Ver uso de RAM y CPU
htop

# Ver temperatura del procesador (importante en Pi)
vcgencmd measure_temp

# Ver IP local
hostname -I

# Reiniciar la Pi (con cuidado)
sudo reboot

# Ver uptime
uptime
```

---

## 10. Cloudflare Tunnel

El túnel arranca automáticamente como contenedor. Si el dominio no responde:

```bash
# Ver URL activa del túnel
docker logs healthstack_tunnel_quick 2>&1 | grep "trycloudflare"

# Reiniciar el túnel
docker compose -f docker-compose.pi.yml restart cloudflared
```

---

## 11. Troubleshooting rápido

| Síntoma | Comando de diagnóstico |
|---------|----------------------|
| Landing no actualiza | `cd ~/health-stack/landing && npm run build && cd .. && docker exec healthstack_nginx nginx -s reload` |
| API no responde | `docker compose -f docker-compose.pi.yml logs backend` |
| Landing en blanco | `docker compose -f docker-compose.pi.yml logs nginx` |
| Dominio no carga | `docker logs healthstack_tunnel_quick 2>&1 \| grep trycloudflare` |
| BD no arranca | `docker compose -f docker-compose.pi.yml logs db` |
| Todo roto | `docker compose -f docker-compose.pi.yml down && docker compose -f docker-compose.pi.yml up -d --build` |

---

## 12. Primera vez — Configurar el alias `ssh raspi`

Para que `ssh raspi` funcione desde cualquier máquina Windows/Mac/Linux, añade esto a `~/.ssh/config`:

```
Host raspi
    HostName ⚠️INSERTAR_IP_DE_LA_PI⚠️    ← ej: 192.168.1.42 o healthstack-pi.local
    User pi
    IdentityFile ~/.ssh/id_rsa
```

Luego copia tu clave pública para no meter contraseña cada vez:

```bash
# Mac / Linux
ssh-copy-id pi@⚠️INSERTAR_IP_DE_LA_PI⚠️

# Windows (PowerShell)
type $env:USERPROFILE\.ssh\id_rsa.pub | ssh pi@⚠️INSERTAR_IP_DE_LA_PI⚠️ "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

Desde ese momento: `ssh raspi` y listo.

---

## Estructura de servicios (resumen)

| Servicio | Contenedor | Descripción |
|----------|-----------|-------------|
| PostgreSQL | `healthstack_db` | Base de datos |
| FastAPI backend | `healthstack_backend` | API REST |
| Nginx | `healthstack_nginx` | Sirve landing/dist + frontend |
| Cloudflare Tunnel | `healthstack_tunnel_quick` | HTTPS externo sin abrir puertos |
