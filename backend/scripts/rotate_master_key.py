#!/usr/bin/env python3
"""
scripts/rotate_master_key.py
==============================
Script de rotación de MASTER_KEY para datos de salud pseudonimizados.

CUÁNDO USAR:
    - Sospecha de compromiso de la MASTER_KEY actual
    - Política de rotación periódica (AEPD recomienda cada 12 meses mínimo)
    - Cambio de proveedor de secretos (HSM, Vault, etc.)

QUÉ HACE:
    1. Lee todos los `data_links` de la BD (tabla pública — solo ciphertext)
    2. Descifra cada `health_uuid_enc` con la CLAVE ANTIGUA
    3. Re-cifra el plaintext con la CLAVE NUEVA (nuevo nonce por registro)
    4. Actualiza el registro + `rotated_at = now()` en una transacción
    5. Procesa en batches de 100 para no saturar la BD

CÓMO USARLO:
    # Pasar ambas claves como variables de entorno — NUNCA como argv
    OLD_MASTER_KEY=<hex_antiguo> NEW_MASTER_KEY=<hex_nuevo> \\
        python scripts/rotate_master_key.py

    # Modo dry-run (no escribe en BD, solo verifica el descifrado):
    OLD_MASTER_KEY=<hex> NEW_MASTER_KEY=<hex> \\
        python scripts/rotate_master_key.py --dry-run

SEGURIDAD:
    - Nunca pases las claves como argumentos de línea de comandos (quedan en historial de shell)
    - Ejecutar con un usuario de BD de solo acceso a `public.data_links`
    - Hacer un backup de la BD ANTES de ejecutar
    - Verificar con --dry-run primero
    - Registrar la rotación en el log de auditoría (Art. 5.2 RGPD)

RGPD:
    - Art. 32: medidas técnicas para garantizar la seguridad del tratamiento
    - Art. 5.2: responsabilidad proactiva — registrar cuándo y quién rotó la clave
    - La columna `rotated_at` en `data_links` da trazabilidad por registro
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Añadir el directorio backend al path para importar los módulos de la app
sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("rotate_master_key")

BATCH_SIZE = 100  # Registros por transacción


async def rotate(dry_run: bool = False) -> None:
    """Función principal de rotación."""
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")

    # ── Validar claves ────────────────────────────────────────────────────────
    old_key_hex = os.environ.get("OLD_MASTER_KEY", "").strip()
    new_key_hex = os.environ.get("NEW_MASTER_KEY", "").strip()

    if not old_key_hex:
        logger.error("OLD_MASTER_KEY no está configurada. Abortando.")
        sys.exit(1)
    if not new_key_hex:
        logger.error("NEW_MASTER_KEY no está configurada. Abortando.")
        sys.exit(1)
    if old_key_hex == new_key_hex:
        logger.error(
            "OLD_MASTER_KEY y NEW_MASTER_KEY son idénticas. "
            "La rotación no tiene sentido. Abortando."
        )
        sys.exit(1)

    # ── Inicializar servicios de cifrado ──────────────────────────────────────
    from app.core.security.cryptoservice import CryptoService

    try:
        old_crypto = CryptoService(master_key_hex=old_key_hex)
        new_crypto = CryptoService(master_key_hex=new_key_hex)
    except Exception as exc:
        logger.error(f"Error inicializando CryptoService: {exc}")
        sys.exit(1)

    logger.info("CryptoService inicializado con claves OLD y NEW.")

    # ── Conectar a la BD ──────────────────────────────────────────────────────
    from sqlalchemy import select, update as sa_update
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        # Intentar construir desde variables individuales (como en .env)
        from app.core.config import get_settings
        settings = get_settings()
        db_url = settings.database_url

    engine = create_async_engine(db_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    # ── Importar modelos ──────────────────────────────────────────────────────
    import app.modules.identity.models  # noqa: F401 — registra mappers
    from app.modules.identity.models import DataLink

    # ── Contar registros ──────────────────────────────────────────────────────
    async with Session() as db:
        from sqlalchemy import func, select as sa_select
        result = await db.execute(sa_select(func.count()).select_from(DataLink))
        total = result.scalar_one()

    logger.info(f"Total de data_links a procesar: {total}")

    if total == 0:
        logger.info("No hay registros. Nada que rotar.")
        await engine.dispose()
        return

    if dry_run:
        logger.info("=== MODO DRY-RUN === No se escribirá nada en la BD.")

    # ── Procesar en batches ───────────────────────────────────────────────────
    processed = 0
    errors = 0
    offset = 0

    while offset < total:
        async with Session() as db:
            async with db.begin():
                # Cargar batch
                result = await db.execute(
                    select(DataLink)
                    .order_by(DataLink.user_id)
                    .offset(offset)
                    .limit(BATCH_SIZE)
                )
                links = list(result.scalars().all())

                if not links:
                    break

                now = datetime.now(timezone.utc)

                for link in links:
                    try:
                        # Descifrar con clave antigua
                        health_subject_id = old_crypto.decrypt_health_link(
                            link.health_uuid_enc
                        )

                        # Re-cifrar con clave nueva (nuevo nonce generado automáticamente)
                        new_encrypted = new_crypto.encrypt_health_link(health_subject_id)

                        if not dry_run:
                            # Actualizar en BD dentro de la transacción
                            link.health_uuid_enc = new_encrypted
                            link.rotated_at = now

                        processed += 1

                    except Exception as exc:
                        errors += 1
                        logger.error(
                            f"Error procesando DataLink user_id={str(link.user_id)[:8]}...: "
                            f"{type(exc).__name__}: {exc}"
                        )
                        if not dry_run:
                            # Si hay un error, no abortar — continuar con el siguiente
                            # Pero loguear para investigación posterior
                            pass

                if not dry_run:
                    # flush() dentro del context manager de begin() → commit automático
                    await db.flush()

        offset += BATCH_SIZE
        logger.info(
            f"Progreso: {min(offset, total)}/{total} "
            f"({'dry-run' if dry_run else 'escritos'})"
        )

    # ── Resumen ───────────────────────────────────────────────────────────────
    await engine.dispose()

    logger.info("=" * 60)
    logger.info("ROTACIÓN COMPLETADA")
    logger.info(f"  Procesados:  {processed}")
    logger.info(f"  Errores:     {errors}")
    logger.info(f"  Modo:        {'DRY-RUN (sin cambios en BD)' if dry_run else 'REAL (BD actualizada)'}")
    logger.info("=" * 60)

    if errors > 0:
        logger.warning(
            f"{errors} registros fallaron. Revisar logs antes de "
            "actualizar NEW_MASTER_KEY en el entorno de producción."
        )
        sys.exit(2)

    if not dry_run:
        logger.info(
            "ACCIÓN REQUERIDA: Actualizar HEALTH_LINK_MASTER_KEY en el entorno "
            "de producción con el valor de NEW_MASTER_KEY y reiniciar el servicio."
        )
        logger.info(
            "RGPD Art. 5.2: Registrar esta rotación en el libro de tratamiento "
            "de datos: fecha, responsable, motivo de la rotación."
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rota la MASTER_KEY re-cifrando todos los health_uuid_enc.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplo:
  OLD_MASTER_KEY=abc123... NEW_MASTER_KEY=def456... python scripts/rotate_master_key.py
  OLD_MASTER_KEY=abc123... NEW_MASTER_KEY=def456... python scripts/rotate_master_key.py --dry-run

Generar una clave nueva:
  python -c "import secrets; print(secrets.token_hex(32))"
        """,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Verificar descifrado sin escribir en la BD (recomendado antes de la rotación real)",
    )
    args = parser.parse_args()

    asyncio.run(rotate(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
