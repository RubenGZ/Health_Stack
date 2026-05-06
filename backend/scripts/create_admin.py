"""
scripts/create_admin.py
========================
Crea (o actualiza) la cuenta de administrador en la base de datos.

Uso:
    cd backend
    python -m scripts.create_admin

Qué hace:
  - Si el email no existe → crea el usuario con rol 'admin' + llave de cruce
  - Si el email ya existe → eleva su rol a 'admin' y activa la cuenta
  - Muestra las credenciales al final (guardarlas en un gestor de contraseñas)

Credenciales por defecto:
  Email:    admin@healthstack.app
  Password: HS_Admin_2026!

⚠️  Cambia la contraseña en la primera sesión o edita las constantes abajo.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import UTC, datetime
from pathlib import Path

# Añadir raíz del proyecto al path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.security.cryptoservice import CryptoService
from app.core.security.hashing import hash_password
from app.modules.identity.repository import UserRepository
from app.modules.identity.models import Base, DataLink, User

# ── Credenciales del admin ─────────────────────────────────────────────────────
ADMIN_EMAIL        = "admin@healthstack.app"
ADMIN_PASSWORD     = "HS_Admin_2026!"
ADMIN_DISPLAY_NAME = "Administrador HS"
# ──────────────────────────────────────────────────────────────────────────────


async def create_or_promote_admin() -> None:
    cfg     = get_settings()
    engine  = create_async_engine(cfg.database_url, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    crypto  = CryptoService(cfg)

    async with Session() as db:
        existing = await UserRepository.get_by_email(db, ADMIN_EMAIL)

        if existing is not None:
            # Ya existe — elevar a admin y asegurar que está activo
            existing.role      = "admin"
            existing.is_active = True
            await db.flush()
            await db.commit()
            print(f"✅  Usuario existente elevado a admin:")
            print(f"    ID:    {existing.id}")
            print(f"    Email: {existing.email}")
            print(f"    Rol:   {existing.role}")
            return

        # Crear nuevo usuario admin
        password_hash = hash_password(ADMIN_PASSWORD)
        user = User(
            email=ADMIN_EMAIL,
            password_hash=password_hash,
            display_name=ADMIN_DISPLAY_NAME,
            role="admin",
            is_active=True,
            consent_gdpr=True,
            consent_date=datetime.now(UTC),
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)

        # Crear llave de cruce cifrada (AEPD)
        health_subject_id = await crypto.create_health_link_for_user(
            user_id=str(user.id),
            db=db,
        )

        await db.commit()

        print()
        print("╔══════════════════════════════════════════════════════╗")
        print("║         CUENTA DE ADMINISTRADOR CREADA               ║")
        print("╠══════════════════════════════════════════════════════╣")
        print(f"║  Email:    {ADMIN_EMAIL:<40}║")
        print(f"║  Password: {ADMIN_PASSWORD:<40}║")
        print(f"║  Rol:      admin                                     ║")
        print(f"║  UUID:     {str(user.id):<40}║")
        print("╠══════════════════════════════════════════════════════╣")
        print("║  ⚠️  Cambia la contraseña en producción              ║")
        print("║  ⚠️  Guarda estas credenciales en un gestor seguro   ║")
        print("╚══════════════════════════════════════════════════════╝")
        print()

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(create_or_promote_admin())
