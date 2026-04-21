@echo off
title HealthStack Pro — Launcher
color 0A

echo.
echo  ██╗  ██╗███████╗ █████╗ ██╗  ████████╗██╗  ██╗███████╗████████╗ █████╗  ██████╗██╗  ██╗
echo  ██║  ██║██╔════╝██╔══██╗██║  ╚══██╔══╝██║  ██║██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝
echo  ███████║█████╗  ███████║██║     ██║   ███████║███████╗    ██║   ███████║██║     █████╔╝
echo  ██╔══██║██╔══╝  ██╔══██║██║     ██║   ██╔══██║╚════██║    ██║   ██╔══██║██║     ██╔═██╗
echo  ██║  ██║███████╗██║  ██║███████╗██║   ██║  ██║███████║    ██║   ██║  ██║╚██████╗██║  ██╗
echo  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝  ╚═╝╚══════╝    ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
echo.
echo  ============================================================
echo   Iniciando servidores de desarrollo...
echo  ============================================================
echo.

REM ── Directorio base del proyecto ──────────────────────────────
set ROOT=%~dp0

REM ── 1. Servidor de la APP (frontend vanilla JS) en puerto 3000 ──
echo  [1/2] Iniciando App (localhost:3000)...
start "HealthStack App" cmd /k "cd /d "%ROOT%frontend" && npx serve . --listen 3000 --no-clipboard"

REM ── 2. Servidor de la LANDING (Vite + React) en puerto 5174 ──────
echo  [2/2] Iniciando Landing (localhost:5174)...
start "HealthStack Landing" cmd /k "cd /d "%ROOT%landing" && npm run dev"

REM ── 3. Esperar a que los servidores arranquen (3 segundos) ────────
echo.
echo  Esperando que los servidores arranquen...
timeout /t 3 /nobreak >nul

REM ── 4. Abrir el navegador en ambas URLs ───────────────────────────
echo  Abriendo navegador...
start "" "http://localhost:3000"
timeout /t 1 /nobreak >nul
start "" "http://localhost:5174"

echo.
echo  ============================================================
echo   Servidores activos:
echo     App     → http://localhost:3000
echo     Landing → http://localhost:5174
echo.
echo   Cierra las ventanas de terminal para detener los servidores.
echo  ============================================================
echo.
pause
