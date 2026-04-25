@echo off
title HealthStack Pro — Dev Stack
color 0A
setlocal EnableDelayedExpansion

set ROOT=%~dp0

cls
echo.
echo  =========================================================
echo   HealthStack Pro  ^|  Dev Stack Launcher
echo  =========================================================
echo.

REM ── 1. Docker corriendo? ──────────────────────────────────────
echo  [1/4] Comprobando Docker...
docker info >nul 2>&1
if errorlevel 1 (
  color 0C
  echo.
  echo  ERROR: Docker Desktop no esta corriendo.
  echo  Arranca Docker Desktop y vuelve a ejecutar este script.
  echo.
  pause
  exit /b 1
)
echo        OK - Docker activo
echo.

REM ── 2. Backend (PostgreSQL + FastAPI via docker compose) ────────
echo  [2/4] Arrancando backend (puerto 8000)...
cd /d "%ROOT%"
docker compose up -d >nul 2>&1
if errorlevel 1 (
  color 0C
  echo.
  echo  ERROR: Fallo docker compose up.
  echo  Ejecuta manualmente:  docker compose up -d
  echo.
  pause
  exit /b 1
)
echo        OK - Backend arrancando...
echo.

REM ── 3. Esperar a que el backend responda (max 30s) ──────────────
echo  [3/4] Esperando que el backend este listo...
set /a attempts=0
:WAIT_BACKEND
set /a attempts+=1
if %attempts% gtr 30 (
  echo.
  echo  AVISO: Backend tardo mas de 30s. Puede que aun este iniciando.
  echo  Comprueba: http://localhost:8000/docs
  echo.
  goto START_FRONTENDS
)
curl -sf http://localhost:8000/health >nul 2>&1
if errorlevel 1 (
  timeout /t 1 /nobreak >nul
  set /B /A "PCT=attempts*100/30" >nul 2>&1
  <nul set /p ".=."
  goto WAIT_BACKEND
)
echo.
echo        OK - Backend listo en %attempts%s

:START_FRONTENDS
echo.

REM ── 4a. Frontend SPA (vanilla JS) — puerto 3000 ─────────────────
echo  [4/4] Arrancando frontends...
echo        App  (puerto 3000)...
start "HealthStack App" cmd /k "cd /d "%ROOT%frontend" && npx serve . --listen 3000 --no-clipboard"

REM ── 4b. Landing (Vite + React) — puerto 5174 ────────────────────
echo        Landing (puerto 5174)...
start "HealthStack Landing" cmd /k "cd /d "%ROOT%landing" && npm run dev"

REM ── 5. Esperar a que los frontends arranquen ─────────────────────
echo.
echo  Esperando frontends
set /a fw=0
:WAIT_FRONT
set /a fw+=1
if %fw% gtr 20 goto OPEN_BROWSER
curl -sf http://localhost:3000 >nul 2>&1
if errorlevel 1 (
  timeout /t 1 /nobreak >nul
  <nul set /p ".=."
  goto WAIT_FRONT
)
echo.

:OPEN_BROWSER
echo.
echo  Abriendo navegador...
timeout /t 1 /nobreak >nul
start "" "http://localhost:3000"
timeout /t 1 /nobreak >nul
start "" "http://localhost:5174"
timeout /t 1 /nobreak >nul
start "" "http://localhost:8000/docs"

echo.
echo  =========================================================
echo   SERVICIOS ACTIVOS
echo  ---------------------------------------------------------
echo   App (SPA)    ^|  http://localhost:3000
echo   Landing      ^|  http://localhost:5174
echo   Backend API  ^|  http://localhost:8000
echo   Swagger UI   ^|  http://localhost:8000/docs
echo   Health check ^|  http://localhost:8000/health
echo  ---------------------------------------------------------
echo   BRIDGE: App -> Backend    CORS OK (puerto 3000)
echo   BRIDGE: Landing -> Backend CORS OK (puerto 5174)
echo  =========================================================
echo.
echo  Cierra las ventanas de cmd para detener los frontends.
echo  Para detener el backend:  docker compose down
echo.
pause
