"""
app/core/security/hashing.py
=============================
Hashing de contraseñas con Argon2id.

Por qué Argon2id sobre bcrypt:
- Ganador del Password Hashing Competition (PHC) 2015
- Resistente a ataques GPU/ASIC (memory-hard por diseño)
- OWASP recomienda Argon2id como primera opción en 2024
- Parámetros: time_cost=3, memory_cost=65536 (64MB), parallelism=1
  → ~200ms por hash en hardware moderno → aceptable para login, lento para ataques

Referencia: OWASP Password Storage Cheat Sheet 2024
"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError

# Instancia global — los parámetros están ajustados para equilibrar
# seguridad y UX (login < 500ms en un VPS de 2 vCPU)
_ph = PasswordHasher(
    time_cost=3,        # Número de iteraciones
    memory_cost=65536,  # 64 MB de RAM por operación de hash
    parallelism=1,      # Threads — 1 es suficiente con memory_cost alto
    hash_len=32,        # Longitud del hash output en bytes
    salt_len=16,        # Salt aleatorio de 128 bits
)


def hash_password(plain_password: str) -> str:
    """
    Hashea una contraseña con Argon2id.
    El salt está incluido en el string de salida (formato PHC string format).
    """
    return _ph.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifica una contraseña contra su hash.
    Timing-safe: argon2-cffi garantiza tiempo constante para evitar timing attacks.

    Returns False (no lanza excepción) para que el caller decida la respuesta HTTP.
    """
    try:
        _ph.verify(hashed_password, plain_password)
        return True
    except VerifyMismatchError:
        # Contraseña incorrecta — respuesta esperada, no un error
        return False
    except VerificationError:
        # Hash malformado — puede indicar corrupción de BD
        return False


def needs_rehash(hashed_password: str) -> bool:
    """
    Verifica si el hash fue creado con parámetros desactualizados.
    Útil para actualizar hashes al cambiar time_cost o memory_cost
    sin forzar un reset de contraseña.
    """
    return _ph.check_needs_rehash(hashed_password)
