#!/usr/bin/env python3
"""
test_launcher.py — HealthStack Pro
Abre con doble clic en: TESTS.bat
O desde terminal:  python test_launcher.py
"""

import os, sys, subprocess, time, socket, json
from pathlib import Path

# ── Encoding Windows ──────────────────────────────────────────────────────────
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    os.environ["PYTHONIOENCODING"] = "utf-8"
    os.system("color")  # activa colores ANSI en Windows

# ── Rutas del proyecto ────────────────────────────────────────────────────────
ROOT    = Path(__file__).parent
BACKEND = ROOT / "backend"
PYTHON  = BACKEND / ".venv" / "Scripts" / "python.exe"

# ── Colores ───────────────────────────────────────────────────────────────────
G  = "\033[92m"   # verde
R  = "\033[91m"   # rojo
Y  = "\033[93m"   # amarillo
C  = "\033[96m"   # cyan
W  = "\033[97m"   # blanco
DG = "\033[90m"   # gris
BO = "\033[1m"    # negrita
RS = "\033[0m"    # reset


# ─────────────────────────────────────────────────────────────────────────────
#  UTILIDADES
# ─────────────────────────────────────────────────────────────────────────────

def cls():
    os.system("cls" if sys.platform == "win32" else "clear")

def ok(msg):    print(f"  {G}[OK]{RS}  {msg}")
def fail(msg):  print(f"  {R}[!!]{RS}  {msg}")
def info(msg):  print(f"  {DG}[..]{RS}  {msg}")
def warn(msg):  print(f"  {Y}[??]{RS}  {msg}")

def pause():
    input(f"\n  {DG}Pulsa ENTER para continuar...{RS}")

def pg_up() -> bool:
    """True si PostgreSQL responde en localhost:5432."""
    try:
        with socket.create_connection(("localhost", 5432), timeout=2):
            return True
    except OSError:
        return False

def api_up() -> bool:
    """True si la API responde en localhost:8000."""
    try:
        with socket.create_connection(("localhost", 8000), timeout=1):
            return True
    except OSError:
        return False

def pytest(args: list[str]) -> int:
    """Ejecuta pytest con los argumentos dados. Devuelve el exit code."""
    cmd = [str(PYTHON), "-m", "pytest", "--tb=short"] + args
    print(f"\n  {DG}> {' '.join(cmd)}{RS}\n")
    return subprocess.run(cmd, cwd=BACKEND,
                          env={**os.environ, "PYTHONIOENCODING": "utf-8"}).returncode


# ─────────────────────────────────────────────────────────────────────────────
#  BANNER
# ─────────────────────────────────────────────────────────────────────────────

def banner(subtitle=""):
    cls()
    pg  = f"{G}PostgreSQL OK{RS}" if pg_up()  else f"{R}PostgreSQL OFF{RS}"
    api = f"{G}API OK{RS}"        if api_up() else f"{Y}API off{RS}"
    print(f"""
{C}{BO}  ==========================================
   HealthStack Pro  //  Test Launcher
  =========================================={RS}
  {pg}   {api}
""")
    if subtitle:
        print(f"  {W}{BO}{subtitle}{RS}\n")


# ─────────────────────────────────────────────────────────────────────────────
#  TESTS
# ─────────────────────────────────────────────────────────────────────────────

# Cada entrada: (descripcion, ruta_pytest, num_tests)
MODULES = [
    ("Todos los tests",       "tests/",                                      "52"),
    ("Auth  (registro/login)","tests/integration/test_auth.py",              "10"),
    ("Health (biometria)",    "tests/integration/test_health.py",             "9"),
    ("Routines",              "tests/integration/test_routines.py",           "6"),
    ("Community (posts/likes)","tests/integration/test_community.py",        "6"),
    ("Gamification (XP/nivel)","tests/integration/test_gamification.py",     "7"),
    ("Nutrition (recetas)",   "tests/integration/test_nutrition.py",          "5"),
    ("Unit (JWT + hashing)",  "tests/unit/",                                  "9"),
]

def run_tests_menu():
    banner("EJECUTAR TESTS")
    print(f"  {'N':>3}   {'Tests':<30} {'#':>5}")
    print(f"  {'---':>3}   {'-----':<30} {'---':>5}")
    for i, (desc, _, n) in enumerate(MODULES, 1):
        color = G if i == 1 else W
        print(f"  {color}{BO}[{i}]{RS}   {desc:<30} {DG}{n} tests{RS}")

    print(f"\n  {DG}[0]  Volver{RS}")
    print()
    choice = input(f"  Numero: ").strip()

    if choice == "0" or choice == "":
        return

    try:
        idx = int(choice) - 1
        desc, path, n = MODULES[idx]
    except (ValueError, IndexError):
        fail("Numero no valido")
        time.sleep(1)
        return

    banner(f"Ejecutando: {desc}")
    code = pytest(["-v", path])

    print()
    if code == 0:
        print(f"  {G}{BO}  TODOS LOS TESTS PASARON  {RS}")
    else:
        print(f"  {R}{BO}  ALGUNOS TESTS FALLARON   {RS}")
    pause()


def run_failed():
    """Re-ejecuta solo los tests que fallaron la ultima vez."""
    banner("RE-EJECUTAR TESTS FALLADOS")
    info("Buscando tests fallados en la cache de pytest...")

    # Leer cache de pytest
    cache_file = BACKEND / ".pytest_cache" / "v" / "cache" / "lastfailed"
    if cache_file.exists():
        try:
            data = json.loads(cache_file.read_text())
            if not data:
                ok("No habia tests fallados. Todo estaba verde.")
                pause()
                return
            print(f"\n  {Y}Tests fallados ({len(data)}):{RS}")
            for t in data:
                print(f"    {DG}- {t.split('::')[-1]}{RS}")
            print()
        except Exception:
            pass

    code = pytest(["--lf", "-v", "tests/"])
    print()
    if code == 0:
        print(f"  {G}{BO}  Todos los fallados ahora pasan  {RS}")
    elif code == 5:
        warn("No habia tests fallados registrados")
    else:
        print(f"  {R}{BO}  Aun hay tests fallando  {RS}")
    pause()


def run_single():
    """Ejecuta tests que coincidan con un nombre o palabra clave."""
    banner("BUSCAR Y EJECUTAR POR NOMBRE")
    print(f"  Ejemplos: {DG}register{RS}, {DG}health{RS}, {DG}like{RS}, {DG}jwt{RS}, {DG}xp{RS}")
    print()
    kw = input("  Nombre / keyword: ").strip()
    if not kw:
        return
    banner(f"Tests que contienen: '{kw}'")
    code = pytest(["-v", "-k", kw, "tests/"])
    print()
    if code == 0:
        print(f"  {G}{BO}  Pasaron  {RS}")
    else:
        print(f"  {R}{BO}  Fallaron  {RS}")
    pause()


# ─────────────────────────────────────────────────────────────────────────────
#  SERVICIOS
# ─────────────────────────────────────────────────────────────────────────────

def start_db():
    """Arranca solo PostgreSQL via Docker Compose."""
    banner("ARRANCAR BASE DE DATOS")
    if pg_up():
        ok("PostgreSQL ya esta corriendo en localhost:5432")
        pause()
        return

    info("Arrancando PostgreSQL con Docker Compose...")
    code = subprocess.run(
        ["docker", "compose", "up", "db", "-d"],
        cwd=ROOT
    ).returncode

    if code != 0:
        fail("Error al arrancar Docker. Comprueba que Docker Desktop este abierto.")
        pause()
        return

    info("Esperando que PostgreSQL este listo")
    for i in range(20):
        if pg_up():
            print()
            ok("PostgreSQL listo en localhost:5432")
            pause()
            return
        print(".", end="", flush=True)
        time.sleep(1)

    print()
    warn("PostgreSQL tarda mas de lo normal. Puede que aun este iniciando.")
    pause()


def start_api():
    """Arranca la API FastAPI en modo desarrollo (se recarga al guardar)."""
    banner("ARRANCAR API (modo desarrollo)")
    if not pg_up():
        warn("PostgreSQL no esta corriendo. La API puede fallar.")
        print()

    print(f"  {Y}Ctrl+C para detener la API{RS}\n")
    try:
        subprocess.run(
            [str(PYTHON), "-m", "uvicorn", "app.main:app",
             "--reload", "--port", "8000", "--host", "0.0.0.0"],
            cwd=BACKEND,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"}
        )
    except KeyboardInterrupt:
        print(f"\n  {Y}API detenida{RS}")
    pause()


def open_docs():
    """Abre Swagger UI en el navegador."""
    banner("ABRIR DOCUMENTACION API")
    if not api_up():
        warn("La API no esta corriendo en puerto 8000")
        info("Arrancala primero con la opcion [3] del menu")
        pause()
        return
    url = "http://localhost:8000/docs"
    ok(f"Abriendo {url}")
    if sys.platform == "win32":
        os.startfile(url)
    else:
        subprocess.run(["xdg-open", url])
    pause()


# ─────────────────────────────────────────────────────────────────────────────
#  SETUP INICIAL
# ─────────────────────────────────────────────────────────────────────────────

def setup_test_db():
    """Crea la BD de test si no existe."""
    banner("CREAR BASE DE DATOS DE TEST")
    if not pg_up():
        fail("PostgreSQL no esta corriendo. Arrancalo primero con la opcion [2].")
        pause()
        return

    info("Creando base de datos 'healthstack_test'...")
    result = subprocess.run(
        ["powershell", "-Command",
         "$env:PGPASSWORD='P@ssw0rd'; psql -h localhost -U postgres "
         "-c \"CREATE DATABASE healthstack_test;\" 2>&1"],
        capture_output=True, text=True, timeout=10
    )
    out = result.stdout + result.stderr
    if "already exists" in out or "ya existe" in out:
        ok("La BD 'healthstack_test' ya existia")
    elif result.returncode == 0:
        ok("BD 'healthstack_test' creada")
    else:
        warn("No se pudo crear via psql automaticamente")
        info("Ejecuta esto manualmente en psql:")
        print(f"\n    {W}CREATE DATABASE healthstack_test;{RS}\n")
    pause()


def run_migrations():
    """Aplica las migraciones de Alembic."""
    banner("APLICAR MIGRACIONES")
    if not pg_up():
        fail("PostgreSQL no esta corriendo.")
        pause()
        return
    info("Ejecutando: alembic upgrade head")
    code = subprocess.run(
        [str(PYTHON), "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"}
    ).returncode
    if code == 0:
        ok("Migraciones aplicadas")
    else:
        fail(f"Error en migraciones (code {code})")
    pause()


def run_seed():
    """Rellena la BD con datos de suplementos e ingredientes."""
    banner("SEED DE DATOS")
    seed = BACKEND / "scripts" / "seed_nutrition.py"
    if not seed.exists():
        fail(f"Script no encontrado: {seed}")
        pause()
        return
    code = subprocess.run(
        [str(PYTHON), str(seed)],
        cwd=BACKEND,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"}
    ).returncode
    if code == 0:
        ok("Seed completado")
    else:
        fail("Error en el seed")
    pause()


# ─────────────────────────────────────────────────────────────────────────────
#  ESTADO
# ─────────────────────────────────────────────────────────────────────────────

def show_status():
    banner("ESTADO DEL SISTEMA")

    # PostgreSQL
    if pg_up():
        ok("PostgreSQL    localhost:5432")
    else:
        fail("PostgreSQL    localhost:5432  (no accesible)")

    # API
    if api_up():
        ok("API FastAPI    localhost:8000  ->  http://localhost:8000/docs")
    else:
        warn("API FastAPI    localhost:8000  (no corriendo)")

    # Venv
    if PYTHON.exists():
        v = subprocess.run([str(PYTHON), "--version"], capture_output=True, text=True)
        ok(f"Venv           {v.stdout.strip()}")
    else:
        fail(f"Venv no encontrado en backend/.venv")

    # Ultimo resultado de tests
    cache = BACKEND / ".pytest_cache" / "v" / "cache" / "lastfailed"
    if cache.exists():
        try:
            data = json.loads(cache.read_text())
            if data:
                warn(f"Ultima ejecucion: {len(data)} test(s) fallaron")
                for t in list(data.keys())[:5]:
                    info(f"  {t.split('::')[-1]}")
            else:
                ok("Ultima ejecucion: todos los tests pasaron")
        except Exception:
            pass
    else:
        info("Sin resultados previos de tests")

    pause()


# ─────────────────────────────────────────────────────────────────────────────
#  MENU PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

MENU = [
    # (tecla, color, texto,                   funcion)
    ("1", G,  "Elegir modulo a testear",        run_tests_menu),
    ("2", G,  "Ejecutar TODOS los tests",        lambda: (banner("TODOS LOS TESTS"),
                                                  [pytest(["-v", "tests/"])],
                                                  pause())),
    ("3", Y,  "Re-ejecutar los que fallaron",    run_failed),
    ("4", Y,  "Buscar test por nombre",          run_single),
    None,   # separador
    ("5", C,  "Arrancar PostgreSQL (Docker)",    start_db),
    ("6", C,  "Arrancar API  (puerto 8000)",     start_api),
    ("7", C,  "Abrir Swagger UI en navegador",   open_docs),
    None,
    ("8", DG, "Crear BD de test",                setup_test_db),
    ("9", DG, "Aplicar migraciones (alembic)",   run_migrations),
    ("0", DG, "Seed de datos (nutricion)",       run_seed),
    None,
    ("s", W,  "Estado del sistema",              show_status),
    ("q", "",  "Salir",                          None),
]

def main():
    # Comprobar venv antes de nada
    if not PYTHON.exists():
        cls()
        print(f"""
  {R}{BO}ERROR: No se encontro el entorno virtual del backend.{RS}

  Solucion (una sola vez):

    {W}cd backend
    python -m venv .venv
    .venv\\Scripts\\pip install -r requirements.txt{RS}

""")
        input("  Pulsa ENTER para salir...")
        sys.exit(1)

    while True:
        banner()

        for item in MENU:
            if item is None:
                print()
                continue
            key, color, text, _ = item
            if key == "q":
                print(f"  {DG}[q]  Salir{RS}")
            else:
                print(f"  {color}{BO}[{key}]{RS}  {text}")

        print()
        choice = input("  Opcion: ").strip().lower()

        for item in MENU:
            if item is None:
                continue
            key, _, _, fn = item
            if choice == key:
                if fn is None:  # salir
                    cls()
                    print(f"\n  Hasta luego!\n")
                    sys.exit(0)
                fn()
                break
        else:
            if choice:
                fail("Opcion no valida")
                time.sleep(0.6)


# ─────────────────────────────────────────────────────────────────────────────
#  MODO CLI (sin menu interactivo)
#  Uso: python test_launcher.py all | auth | health | failed | status ...
# ─────────────────────────────────────────────────────────────────────────────

CLI_SHORTCUTS = {
    "all":          lambda: sys.exit(pytest(["-v", "tests/"])),
    "unit":         lambda: sys.exit(pytest(["-v", "tests/unit/"])),
    "auth":         lambda: sys.exit(pytest(["-v", "tests/integration/test_auth.py"])),
    "health":       lambda: sys.exit(pytest(["-v", "tests/integration/test_health.py"])),
    "routines":     lambda: sys.exit(pytest(["-v", "tests/integration/test_routines.py"])),
    "community":    lambda: sys.exit(pytest(["-v", "tests/integration/test_community.py"])),
    "gamification": lambda: sys.exit(pytest(["-v", "tests/integration/test_gamification.py"])),
    "nutrition":    lambda: sys.exit(pytest(["-v", "tests/integration/test_nutrition.py"])),
    "failed":       lambda: sys.exit(pytest(["--lf", "-v", "tests/"])),
    "status":       lambda: (show_status(), sys.exit(0)),
}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        if arg in CLI_SHORTCUTS:
            CLI_SHORTCUTS[arg]()
        else:
            print(f"\n  Comandos: {', '.join(CLI_SHORTCUTS)}\n")
            sys.exit(1)
    else:
        main()
