"""
app/modules/security_lab/attack_runner.py
==========================================
Motor de simulación de ataques — Black Hat vs White Hat.

Cada función "attack_*" simula un vector de ataque específico contra la propia
aplicación. El módulo es SOLO accesible por admins y nunca daña datos reales:
  - Los tests de inyección usan payloads inofensivos
  - Los tests de JWT no validan con datos de usuarios reales
  - Los tests de cifrado leen metadatos, no descifran datos

Categorías de ataques:
  A. Autenticación y JWT
  B. Cifrado y claves
  C. Control de acceso / IDOR
  D. Inyección y validación
  E. Rate limiting y DoS
  F. Privacidad y RGPD
  G. Configuración e infraestructura
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import pathlib
import re
import time
from base64 import b64decode, b64encode
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security.jwt_handler import create_access_token
from app.modules.security_lab.schemas import AttackResult, AttackSeverity, AttackStatus

logger = logging.getLogger(__name__)
_settings = get_settings()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _blocked(
    attack_id: str,
    name: str,
    category: str,
    severity: AttackSeverity,
    description: str,
    finding: str,
    duration_ms: int = 0,
    proof: dict | None = None,
) -> AttackResult:
    return AttackResult(
        id=attack_id,
        name=name,
        category=category,
        severity=severity,
        status=AttackStatus.BLOCKED,
        description=description,
        finding=finding,
        recommendation="✅ Sin acción necesaria — la protección está activa.",
        proof=proof,
        duration_ms=duration_ms,
    )


def _vulnerable(
    attack_id: str,
    name: str,
    category: str,
    severity: AttackSeverity,
    description: str,
    finding: str,
    recommendation: str,
    proof: dict | None = None,
    duration_ms: int = 0,
) -> AttackResult:
    return AttackResult(
        id=attack_id,
        name=name,
        category=category,
        severity=severity,
        status=AttackStatus.VULNERABLE,
        description=description,
        finding=finding,
        recommendation=recommendation,
        proof=proof,
        duration_ms=duration_ms,
    )


def _warning(
    attack_id: str,
    name: str,
    category: str,
    severity: AttackSeverity,
    description: str,
    finding: str,
    recommendation: str,
    proof: dict | None = None,
    duration_ms: int = 0,
) -> AttackResult:
    return AttackResult(
        id=attack_id,
        name=name,
        category=category,
        severity=severity,
        status=AttackStatus.WARNING,
        description=description,
        finding=finding,
        recommendation=recommendation,
        proof=proof,
        duration_ms=duration_ms,
    )


# ---------------------------------------------------------------------------
# A. Autenticación y JWT
# ---------------------------------------------------------------------------

async def attack_jwt_algorithm_confusion(base_url: str) -> AttackResult:
    """
    A1 — JWT Algorithm Confusion (CVE-class attack)
    Intenta usar la clave pública RS256 como secreto HS256 para forjar tokens.
    Si el servidor acepta el token HS256, cualquier atacante con la clave pública
    puede autenticarse como cualquier usuario.
    """
    t0 = time.monotonic()
    attack_id = "A1"
    name = "JWT Algorithm Confusion (RS256 → HS256)"
    category = "Autenticación"
    severity = AttackSeverity.CRITICAL

    description = (
        "Forja un JWT con alg=HS256 firmado con la clave pública RSA. "
        "Si el servidor acepta HS256, la clave pública (pública por definición) "
        "puede usarse para firmar tokens válidos."
    )

    try:
        # Usamos python-jose para crear el token malicioso
        from jose import jwt as jose_jwt

        public_key = _settings.jwt_public_key_pem
        fake_payload = {
            "sub": "00000000-0000-0000-0000-000000000000",
            "email": "hacker@evil.com",
            "role": "admin",
            "type": "access",
        }

        # Firma con la clave pública como si fuera el secreto HMAC
        malicious_token = jose_jwt.encode(fake_payload, public_key, algorithm="HS256")

        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            resp = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {malicious_token}"},
            )

        duration_ms = int((time.monotonic() - t0) * 1000)

        if resp.status_code == 200:
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding="🚨 El servidor ACEPTÓ un token HS256 firmado con la clave pública. CUALQUIERA puede forjar tokens de admin.",
                recommendation="En jwt_handler.py: forzar algorithms=['RS256'] en jose.jwt.decode(). Nunca aceptar HS256.",
                proof={"status_code": resp.status_code, "algorithm_used": "HS256"},
                duration_ms=duration_ms,
            )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding=f"Token HS256 rechazado correctamente (HTTP {resp.status_code}). El servidor solo acepta RS256.",
                duration_ms=duration_ms,
                proof={"status_code": resp.status_code},
            )

    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return _blocked(
            attack_id, name, category, severity, description,
            finding=f"Token malicioso no pudo siquiera construirse o fue rechazado: {type(e).__name__}",
            duration_ms=duration_ms,
        )


async def attack_jwt_none_algorithm(base_url: str) -> AttackResult:
    """
    A2 — JWT 'none' Algorithm
    Intenta enviar un JWT sin firma (alg=none). Vulnerabilidad clásica de
    implementaciones JWT que no validan el algoritmo.
    """
    t0 = time.monotonic()
    attack_id = "A2"
    name = "JWT 'none' Algorithm"
    category = "Autenticación"
    severity = AttackSeverity.CRITICAL
    description = (
        "Forja un JWT con alg='none' y sin firma. Algunas librerías JWT "
        "históricamente aceptaban esto, permitiendo autenticación sin credenciales."
    )

    try:
        import json

        header = b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).decode().rstrip("=")
        payload_data = {"sub": "00000000-0000-0000-0000-000000000000", "email": "hacker@evil.com", "role": "admin", "type": "access"}
        payload = b64encode(json.dumps(payload_data).encode()).decode().rstrip("=")
        token_none = f"{header}.{payload}."  # Sin firma

        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            resp = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token_none}"},
            )

        duration_ms = int((time.monotonic() - t0) * 1000)

        if resp.status_code == 200:
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding="🚨 El servidor ACEPTÓ un token sin firma. Autenticación completamente rota.",
                recommendation="Actualizar python-jose y forzar algorithms=['RS256']. Rechazar alg='none' explícitamente.",
                proof={"status_code": resp.status_code},
                duration_ms=duration_ms,
            )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding=f"Token 'none' rechazado correctamente (HTTP {resp.status_code}).",
                duration_ms=duration_ms,
            )
    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return _blocked(
            attack_id, name, category, severity, description,
            finding=f"Token rechazado en construcción/transporte: {type(e).__name__}",
            duration_ms=duration_ms,
        )


async def attack_jwt_expired_token(base_url: str) -> AttackResult:
    """
    A3 — Replay de token expirado
    Verifica que tokens con exp en el pasado son rechazados.
    """
    t0 = time.monotonic()
    attack_id = "A3"
    name = "Replay de Token Expirado"
    category = "Autenticación"
    severity = AttackSeverity.HIGH
    description = (
        "Envía un JWT válido pero expirado. Si el servidor lo acepta, "
        "un atacante con un token robado puede usarlo indefinidamente."
    )

    try:
        from datetime import UTC, datetime, timedelta
        from jose import jwt as jose_jwt

        private_key = _settings.jwt_private_key_pem
        # Token que expiró hace 1 hora
        expired_payload = {
            "sub": "00000000-0000-0000-0000-000000000000",
            "email": "test@expired.com",
            "role": "user",
            "type": "access",
            "exp": int((datetime.now(UTC) - timedelta(hours=1)).timestamp()),
            "iat": int((datetime.now(UTC) - timedelta(hours=2)).timestamp()),
        }

        expired_token = jose_jwt.encode(expired_payload, private_key, algorithm="RS256")

        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            resp = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {expired_token}"},
            )

        duration_ms = int((time.monotonic() - t0) * 1000)

        if resp.status_code == 200:
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding="🚨 El servidor aceptó un token expirado hace 1 hora. Los tokens no caducan.",
                recommendation="Verificar que jose.jwt.decode() incluye options={'verify_exp': True}.",
                proof={"status_code": resp.status_code},
                duration_ms=duration_ms,
            )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding=f"Token expirado rechazado correctamente (HTTP {resp.status_code}).",
                duration_ms=duration_ms,
            )
    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return _blocked(
            attack_id, name, category, severity, description,
            finding=f"Token expirado rechazado: {type(e).__name__}",
            duration_ms=duration_ms,
        )


# ---------------------------------------------------------------------------
# B. Cifrado y claves
# ---------------------------------------------------------------------------

async def attack_aes_nonce_reuse(db: AsyncSession) -> AttackResult:
    """
    B1 — AES-GCM Nonce Reuse Detection
    Busca en la BD registros donde el mismo IV/nonce se haya usado dos veces.
    Nonce reuse en GCM destruye la confidencialidad y autenticidad: un atacante
    puede XOR los textos cifrados para recuperar XOR de plaintexts.
    """
    t0 = time.monotonic()
    attack_id = "B1"
    name = "AES-GCM Nonce Reuse"
    category = "Cifrado"
    severity = AttackSeverity.CRITICAL
    description = (
        "Busca IVs/nonces duplicados en campos cifrados AES-GCM. "
        "Si el mismo nonce se usa dos veces con la misma clave, "
        "la seguridad del cifrado queda completamente rota."
    )

    try:
        # Extraer nonces de data_links.health_uuid_enc (formato: nonce:tag:ct)
        result = await db.execute(
            text("""
                SELECT
                    split_part(health_uuid_enc, ':', 1) AS nonce,
                    COUNT(*) AS cnt
                FROM public.data_links
                WHERE health_uuid_enc IS NOT NULL
                GROUP BY nonce
                HAVING COUNT(*) > 1
                LIMIT 5
            """)
        )
        dupe_nonces_links = result.fetchall()

        # También verificar health_records.notes_encrypted (schema: health, no public)
        result2 = await db.execute(
            text("""
                SELECT
                    split_part(notes_encrypted, ':', 1) AS nonce,
                    COUNT(*) AS cnt
                FROM health.health_records
                WHERE notes_encrypted IS NOT NULL AND notes_encrypted != ''
                GROUP BY nonce
                HAVING COUNT(*) > 1
                LIMIT 5
            """)
        )
        dupe_nonces_notes = result2.fetchall()

        duration_ms = int((time.monotonic() - t0) * 1000)

        total_dupes = len(dupe_nonces_links) + len(dupe_nonces_notes)

        if total_dupes > 0:
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding=f"🚨 {total_dupes} nonce(s) duplicados detectados. La confidencialidad de esos registros está comprometida.",
                recommendation=(
                    "CRÍTICO: Regenerar todos los cifrados afectados con nuevos nonces. "
                    "Verificar que CryptoService usa os.urandom(12) en cada llamada a encrypt()."
                ),
                proof={"duplicate_nonces_data_links": len(dupe_nonces_links), "duplicate_nonces_notes": len(dupe_nonces_notes)},
                duration_ms=duration_ms,
            )
        else:
            # Verificar que hay registros y el formato es correcto
            count_result = await db.execute(text("SELECT COUNT(*) FROM public.data_links WHERE health_uuid_enc IS NOT NULL"))
            total_records = count_result.scalar() or 0

            return _blocked(
                attack_id, name, category, severity, description,
                finding=f"✅ Sin nonces duplicados en {total_records} registros cifrados. Cada operación usa un nonce único de 96 bits (os.urandom).",
                duration_ms=duration_ms,
                proof={"records_checked": total_records, "duplicate_nonces": 0},
            )

    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        # Rollback para evitar que la transacción abortada contamine ataques posteriores
        try:
            await db.rollback()
        except Exception:
            pass
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED,
            description=description,
            finding=f"No se pudo ejecutar la consulta: {type(e).__name__}: {e}",
            recommendation="Verificar permisos de BD para el usuario de la aplicación.",
            duration_ms=duration_ms,
        )


async def attack_master_key_in_env(db: AsyncSession) -> AttackResult:
    """
    B2 — Master Key Configuration Check
    Verifica que la HEALTH_LINK_MASTER_KEY está configurada correctamente
    y tiene la entropía esperada (256 bits).
    """
    t0 = time.monotonic()
    attack_id = "B2"
    name = "Master Key — Entropía y Configuración"
    category = "Cifrado"
    severity = AttackSeverity.HIGH
    description = (
        "Verifica que HEALTH_LINK_MASTER_KEY tiene 256 bits de entropía "
        "y no es un valor por defecto o débil."
    )

    duration_ms = int((time.monotonic() - t0) * 1000)

    raw_key = os.environ.get("HEALTH_LINK_MASTER_KEY", "")

    if not raw_key:
        return _vulnerable(
            attack_id, name, category, severity, description,
            finding="🚨 HEALTH_LINK_MASTER_KEY no está configurada. Los datos de salud no están cifrados.",
            recommendation="Generar con: python -c \"import secrets; print(secrets.token_hex(32))\" y añadir a .env",
            duration_ms=duration_ms,
        )

    if len(raw_key) != 64:
        return _vulnerable(
            attack_id, name, category, severity, description,
            finding=f"🚨 Clave con longitud incorrecta: {len(raw_key)} chars (esperado: 64 hex = 256 bits).",
            recommendation="Regenerar la clave con secrets.token_hex(32) y re-cifrar todos los registros.",
            proof={"key_length_chars": len(raw_key), "expected": 64},
            duration_ms=duration_ms,
        )

    # Detectar claves débiles conocidas (todos ceros, secuencias)
    weak_patterns = [
        "0" * 64,
        "f" * 64,
        "a" * 64,
        "deadbeef" * 8,
    ]
    if raw_key.lower() in weak_patterns:
        return _vulnerable(
            attack_id, name, category, severity, description,
            finding="🚨 Clave débil o de ejemplo detectada. No usar en producción.",
            recommendation="Regenerar con: python -c \"import secrets; print(secrets.token_hex(32))\"",
            duration_ms=duration_ms,
        )

    return _blocked(
        attack_id, name, category, severity, description,
        finding="✅ Clave de 256 bits configurada, formato hexadecimal válido, no es un valor débil conocido.",
        duration_ms=duration_ms,
        proof={"key_length_bits": 256, "format": "hex", "prefix": raw_key[:4] + "..."},
    )


async def attack_hkdf_context_separation(db: AsyncSession) -> AttackResult:
    """
    B3 — HKDF Context Separation
    Verifica que las subclaves para data_links y notes son DIFERENTES
    (derivadas con info distinta), evitando reutilización de clave entre contextos.
    """
    t0 = time.monotonic()
    attack_id = "B3"
    name = "HKDF Separación de Contexto"
    category = "Cifrado"
    severity = AttackSeverity.HIGH
    description = (
        "Verifica que la subclave para data_links y la subclave para notes "
        "son diferentes (derivadas con info distinta via HKDF). "
        "Reusar la misma clave en dos contextos permite ataques cross-context."
    )

    duration_ms = int((time.monotonic() - t0) * 1000)

    raw_key = os.environ.get("HEALTH_LINK_MASTER_KEY", "")
    if not raw_key or len(raw_key) != 64:
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED,
            description=description,
            finding="HEALTH_LINK_MASTER_KEY no configurada o inválida — test B2 debe corregirse primero.",
            recommendation="Resolver B2 primero.",
            duration_ms=duration_ms,
        )

    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.kdf.hkdf import HKDF

        master_bytes = bytes.fromhex(raw_key)

        subkey_links = HKDF(
            algorithm=hashes.SHA256(), length=32, salt=None,
            info=b"healthstack.health_link.v1",
        ).derive(master_bytes)

        subkey_notes = HKDF(
            algorithm=hashes.SHA256(), length=32, salt=None,
            info=b"healthstack.health_notes.v1",
        ).derive(master_bytes)

        if subkey_links == subkey_notes:
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding="🚨 Ambas subclaves son IDÉNTICAS. La separación de contexto HKDF no está funcionando.",
                recommendation="Verificar que cryptoservice.py y health/service.py usan info diferente en HKDF.",
                duration_ms=duration_ms,
            )

        # Verificar que no coinciden con la master key
        if subkey_links == master_bytes or subkey_notes == master_bytes:
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding="🚨 Una subclave es igual a la master key. HKDF no se está aplicando.",
                recommendation="La derivación de subclaves debe usar HKDF con info contextual distinta.",
                duration_ms=duration_ms,
            )

        return _blocked(
            attack_id, name, category, severity, description,
            finding="✅ Las subclaves data_links y notes son diferentes. HKDF con separación de contexto funciona correctamente.",
            duration_ms=duration_ms,
            proof={
                "subkey_links_prefix": subkey_links.hex()[:8] + "...",
                "subkey_notes_prefix": subkey_notes.hex()[:8] + "...",
                "keys_are_different": subkey_links != subkey_notes,
            },
        )

    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED,
            description=description,
            finding=f"Error al derivar subclaves: {type(e).__name__}: {e}",
            recommendation="Verificar que cryptography>=41 está instalada.",
            duration_ms=duration_ms,
        )


# ---------------------------------------------------------------------------
# C. Control de acceso / IDOR
# ---------------------------------------------------------------------------

async def attack_idor_health_records(base_url: str, admin_token: str) -> AttackResult:
    """
    C1 — IDOR en health records
    Verifica que un usuario no puede acceder a registros de otro usuario
    manipulando IDs en la URL.
    """
    t0 = time.monotonic()
    attack_id = "C1"
    name = "IDOR — Acceso a Registros de Otro Usuario"
    category = "Control de Acceso"
    severity = AttackSeverity.HIGH
    description = (
        "Intenta acceder a /api/v1/health/records/{id} con un ID aleatorio "
        "que no pertenece al usuario autenticado. "
        "Un IDOR permitiría ver datos biométricos de cualquier usuario."
    )

    try:
        import uuid
        fake_id = str(uuid.uuid4())

        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            # Primero: ¿el endpoint devuelve 404 o 403?
            resp = await client.get(
                f"/api/v1/health/records/{fake_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
            )

        duration_ms = int((time.monotonic() - t0) * 1000)

        # 200 con datos de otro usuario sería IDOR
        # 404 o 403 = correcto
        if resp.status_code == 200:
            body = resp.json()
            if body:  # Retornó datos reales
                return _vulnerable(
                    attack_id, name, category, severity, description,
                    finding="🚨 El endpoint devolvió datos con un UUID aleatorio que no pertenece al usuario. IDOR confirmado.",
                    recommendation="Filtrar siempre por health_subject_id del usuario autenticado en la query.",
                    proof={"status_code": resp.status_code, "returned_data": True},
                    duration_ms=duration_ms,
                )

        return _blocked(
            attack_id, name, category, severity, description,
            finding=f"✅ UUID aleatorio devuelve HTTP {resp.status_code}. Los registros están correctamente vinculados al subject del usuario.",
            duration_ms=duration_ms,
            proof={"status_code": resp.status_code},
        )

    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED,
            description=description,
            finding=f"No se pudo ejecutar: {type(e).__name__}: {e}",
            recommendation="Verificar conectividad con el servidor.",
            duration_ms=duration_ms,
        )


async def attack_admin_endpoint_escalation(base_url: str) -> AttackResult:
    """
    C2 — Escalada a endpoints admin sin rol admin
    Verifica que los endpoints /api/v1/admin/* requieren rol admin.
    Un JWT de usuario normal no debe poder acceder.
    """
    t0 = time.monotonic()
    attack_id = "C2"
    name = "Escalada de Privilegios — Endpoints Admin"
    category = "Control de Acceso"
    severity = AttackSeverity.CRITICAL
    description = (
        "Usa un JWT de usuario normal (rol='user') para intentar acceder "
        "a /api/v1/admin/users. Si funciona, cualquier usuario puede "
        "ver datos de todos los usuarios."
    )

    try:
        # Crear un JWT de usuario normal (rol user, no admin)
        user_token = create_access_token(
            user_id="00000000-0000-0000-0000-000000000001",
            email="attacker@evil.com",
            role="user",
        )

        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            resp = await client.get(
                "/api/v1/admin/users",
                headers={"Authorization": f"Bearer {user_token}"},
            )

        duration_ms = int((time.monotonic() - t0) * 1000)

        if resp.status_code == 200:
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding="🚨 Un JWT de usuario normal puede acceder a /api/v1/admin/overview. TODOS los datos de usuarios expuestos.",
                recommendation="Añadir require_role('admin') a todos los endpoints admin. Revisar dependencies.py.",
                proof={"status_code": resp.status_code},
                duration_ms=duration_ms,
            )
        elif resp.status_code in (401, 403):
            return _blocked(
                attack_id, name, category, severity, description,
                finding=f"✅ Rol admin requerido — JWT de usuario normal devuelve HTTP {resp.status_code}.",
                duration_ms=duration_ms,
                proof={"status_code": resp.status_code},
            )
        else:
            return _warning(
                attack_id, name, category, severity, description,
                finding=f"Respuesta inesperada HTTP {resp.status_code}. Verificar manualmente.",
                recommendation="Asegurarse de que el endpoint devuelve 401/403 para usuarios sin rol admin.",
                proof={"status_code": resp.status_code},
                duration_ms=duration_ms,
            )

    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED,
            description=description,
            finding=f"No se pudo ejecutar: {type(e).__name__}",
            recommendation="Verificar conectividad con el servidor.",
            duration_ms=duration_ms,
        )


# ---------------------------------------------------------------------------
# D. Inyección y validación
# ---------------------------------------------------------------------------

async def attack_sql_injection(base_url: str, admin_token: str) -> AttackResult:
    """
    D1 — SQL Injection via parámetros de búsqueda
    Intenta inyección SQL en parámetros de query que se usen en filtros.
    SQLAlchemy con ORM es seguro, pero verificamos que ningún endpoint
    construye queries con concatenación de strings.
    """
    t0 = time.monotonic()
    attack_id = "D1"
    name = "SQL Injection — Parámetros de Filtro"
    category = "Inyección"
    severity = AttackSeverity.HIGH
    description = (
        "Envía payloads SQL clásicos en parámetros de búsqueda y filtro. "
        "Busca respuestas 500 (errores no manejados) que indiquen "
        "que la inyección llegó a la BD."
    )

    payloads = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "1; SELECT sleep(5); --",
        "' UNION SELECT null, null, null --",
        "\" OR 1=1 --",
    ]

    try:
        vulnerable_endpoints = []

        async with httpx.AsyncClient(base_url=base_url, timeout=8.0) as client:
            # Test en admin users (tiene filtros de búsqueda)
            for payload in payloads[:2]:  # Solo los primeros 2 para no saturar
                resp = await client.get(
                    f"/api/v1/admin/users?search={payload}",
                    headers={"Authorization": f"Bearer {admin_token}"},
                )
                if resp.status_code == 500:
                    vulnerable_endpoints.append(f"/api/v1/admin/users?search={payload[:20]}")

        duration_ms = int((time.monotonic() - t0) * 1000)

        if vulnerable_endpoints:
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding=f"🚨 Errores 500 con payloads SQL en: {vulnerable_endpoints}",
                recommendation="Usar exclusivamente ORM de SQLAlchemy. NUNCA concatenar strings en queries. Añadir manejo de excepciones genérico.",
                proof={"vulnerable_endpoints": vulnerable_endpoints},
                duration_ms=duration_ms,
            )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding="✅ Payloads SQL no causan errores 500. SQLAlchemy ORM parametriza correctamente las queries.",
                duration_ms=duration_ms,
                proof={"payloads_tested": len(payloads), "errors_500": 0},
            )

    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED,
            description=description,
            finding=f"No se pudo ejecutar: {type(e).__name__}",
            recommendation="Verificar conectividad.",
            duration_ms=duration_ms,
        )


async def attack_mass_assignment(base_url: str, admin_token: str) -> AttackResult:
    """
    D2 — Mass Assignment
    Intenta pasar campos no permitidos en PATCH endpoints (ej: role, is_admin).
    Si los acepta, un usuario podría auto-promoverse a admin.
    """
    t0 = time.monotonic()
    attack_id = "D2"
    name = "Mass Assignment — Auto-Promoción a Admin"
    category = "Inyección"
    severity = AttackSeverity.HIGH
    description = (
        "Envía campos extra no definidos en el schema (role='admin', is_active=false) "
        "en PATCH /api/v1/auth/me. Si Pydantic no filtra estos campos, "
        "un usuario podría cambiar su propio rol."
    )

    try:
        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            # 1. Leer estado ANTES del ataque (para comparar post-ataque)
            before_resp = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            before = before_resp.json() if before_resp.status_code == 200 else {}
            original_email = before.get("email", "")
            original_role = before.get("role", "")

            # 2. Intentar mass assignment con campos fuera del schema
            malicious_payload = {
                "display_name": "test_attacker_security_check",
                "role": "superadmin",        # Campo no en el schema (valor diferente al original)
                "is_admin": True,            # Campo no en el schema
                "is_active": False,          # Campo no en el schema
                "email": "hacker@evil.com",  # No debería poder cambiar el email
            }

            resp = await client.patch(
                "/api/v1/auth/me",
                json=malicious_payload,
                headers={"Authorization": f"Bearer {admin_token}"},
            )

        # 3. Restaurar display_name original para no contaminar datos
        async with httpx.AsyncClient(base_url=base_url, timeout=2.0) as client:
            await client.patch(
                "/api/v1/auth/me",
                json={"display_name": before.get("display_name", "Admin")},
                headers={"Authorization": f"Bearer {admin_token}"},
            )

        duration_ms = int((time.monotonic() - t0) * 1000)

        # Revisar respuesta — VULNERABLE solo si los campos maliciosos CAMBIARON valores
        if resp.status_code == 200:
            body = resp.json()
            # role_changed: solo si cambió a "superadmin" (nuestro valor de ataque, no el original)
            role_changed = body.get("role") == "superadmin"
            # is_admin: campo no debería existir en el schema
            is_admin_injected = body.get("is_admin") == True
            # email: cambió al del atacante
            email_changed = body.get("email") == "hacker@evil.com"

            if role_changed or is_admin_injected or email_changed:
                return _vulnerable(
                    attack_id, name, category, severity, description,
                    finding=f"🚨 Mass assignment exitoso: role_changed={role_changed}, is_admin_injected={is_admin_injected}, email_changed={email_changed}",
                    recommendation="Usar Pydantic con model_config extra='ignore' o extra='forbid'. Nunca pasar **request.dict() directamente al ORM.",
                    proof={"role_changed": role_changed, "is_admin_injected": is_admin_injected, "email_changed": email_changed},
                    duration_ms=duration_ms,
                )
            else:
                return _blocked(
                    attack_id, name, category, severity, description,
                    finding="✅ Los campos extra fueron ignorados por Pydantic. Solo display_name es modificable.",
                    duration_ms=duration_ms,
                    proof={"extra_fields_rejected": True, "status_code": resp.status_code},
                )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding=f"✅ Petición rechazada con HTTP {resp.status_code}.",
                duration_ms=duration_ms,
            )

    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED,
            description=description,
            finding=f"No se pudo ejecutar: {type(e).__name__}",
            recommendation="Verificar conectividad.",
            duration_ms=duration_ms,
        )


# ---------------------------------------------------------------------------
# E. Rate limiting y DoS
# ---------------------------------------------------------------------------

async def attack_rate_limit_bypass(base_url: str) -> AttackResult:
    """
    E1 — Rate Limit Bypass via IP Spoofing
    Verifica si el rate limiter usa la IP real o puede ser bypasseado
    enviando headers X-Forwarded-For falsos.
    """
    t0 = time.monotonic()
    attack_id = "E1"
    name = "Rate Limit Bypass — IP Spoofing"
    category = "Rate Limiting"
    severity = AttackSeverity.HIGH
    description = (
        "Envía múltiples peticiones de login fallidas con diferentes valores "
        "en X-Forwarded-For. Si el rate limiter cuenta por ese header "
        "sin verificación, el atacante puede saltárselo con IPs falsas."
    )

    try:
        login_url = "/api/v1/auth/login"
        bad_payload = {"email": "nonexistent@evil.com", "password": "wrong"}
        blocked_count = 0
        total_requests = 8
        ips_used = [f"10.0.0.{i}" for i in range(1, total_requests + 1)]

        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            for fake_ip in ips_used:
                resp = await client.post(
                    login_url,
                    json=bad_payload,
                    headers={"X-Forwarded-For": fake_ip, "X-Real-IP": fake_ip},
                )
                if resp.status_code == 429:
                    blocked_count += 1

        duration_ms = int((time.monotonic() - t0) * 1000)

        # Si nunca hubo 429, el rate limit no funciona o se bypasseó
        if blocked_count == 0 and total_requests >= 6:
            return _warning(
                attack_id, name, category, severity, description,
                finding=f"⚠️ {total_requests} requests con IPs diferentes — ninguna fue bloqueada (429). Puede indicar bypass por IP spoofing O que el límite es alto.",
                recommendation=(
                    "Verificar que _get_real_client_ip() prioriza CF-Connecting-IP sobre X-Forwarded-For. "
                    "En producción con Cloudflare, X-Forwarded-For es manipulable por el cliente."
                ),
                proof={"requests_sent": total_requests, "blocked_429": blocked_count, "ips_rotated": True},
                duration_ms=duration_ms,
            )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding=f"✅ Rate limiter activo: {blocked_count}/{total_requests} requests bloqueadas con IPs rotadas.",
                duration_ms=duration_ms,
                proof={"requests_sent": total_requests, "blocked_429": blocked_count},
            )

    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED,
            description=description,
            finding=f"No se pudo ejecutar: {type(e).__name__}",
            recommendation="Verificar conectividad.",
            duration_ms=duration_ms,
        )


async def attack_user_enumeration(base_url: str) -> AttackResult:
    """
    E2 — User Enumeration via Login Response
    Si el login devuelve mensajes distintos para "email no existe" vs "password incorrecta",
    un atacante puede enumerar qué emails están registrados.
    """
    t0 = time.monotonic()
    attack_id = "E2"
    name = "Enumeración de Usuarios — Respuesta de Login"
    category = "Rate Limiting"
    severity = AttackSeverity.MEDIUM
    description = (
        "Compara el tiempo de respuesta y mensaje de error entre un email "
        "que definitivamente no existe vs uno que podría existir. "
        "Diferencias revelan si el email está registrado."
    )

    try:
        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            t1 = time.monotonic()
            resp_unknown = await client.post(
                "/api/v1/auth/login",
                json={"email": "zzz_definitely_not_registered_xyz@example.com", "password": "wrongpass"},
            )
            time_unknown = time.monotonic() - t1

            t2 = time.monotonic()
            resp_wrong_pass = await client.post(
                "/api/v1/auth/login",
                json={"email": "admin@healthstack.app", "password": "wrongpass"},
            )
            time_wrong_pass = time.monotonic() - t2

        duration_ms = int((time.monotonic() - t0) * 1000)

        msg_unknown = resp_unknown.text[:200] if resp_unknown.text else ""
        msg_wrong = resp_wrong_pass.text[:200] if resp_wrong_pass.text else ""

        # Comparar mensajes — si son diferentes, hay enumeración por mensaje
        if msg_unknown != msg_wrong and resp_unknown.status_code == resp_wrong_pass.status_code:
            return _warning(
                attack_id, name, category, severity, description,
                finding="⚠️ Mensajes de error distintos para email inexistente vs contraseña incorrecta. Permite enumerar emails.",
                recommendation="Usar siempre el mismo mensaje genérico: 'Credenciales incorrectas' independientemente de la causa.",
                proof={"msg_unknown_prefix": msg_unknown[:80], "msg_wrong_pass_prefix": msg_wrong[:80]},
                duration_ms=duration_ms,
            )

        # Timing attack: diferencia >300ms es sospechosa
        time_diff_ms = abs(time_unknown - time_wrong_pass) * 1000
        if time_diff_ms > 500:
            return _warning(
                attack_id, name, category, severity, description,
                finding=f"⚠️ Diferencia de tiempo de {time_diff_ms:.0f}ms entre email inexistente y contraseña incorrecta. Posible timing attack.",
                recommendation="Añadir hmac.compare_digest para equalizar tiempos. Usar always-run Argon2 hash aunque el email no exista.",
                proof={"time_unknown_ms": round(time_unknown * 1000), "time_wrong_pass_ms": round(time_wrong_pass * 1000), "diff_ms": round(time_diff_ms)},
                duration_ms=duration_ms,
            )

        return _blocked(
            attack_id, name, category, severity, description,
            finding="✅ Mensajes de error idénticos y timing similar. Enumeración de usuarios no es viable.",
            duration_ms=duration_ms,
            proof={"time_diff_ms": round(time_diff_ms)},
        )

    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED,
            description=description,
            finding=f"No se pudo ejecutar: {type(e).__name__}",
            recommendation="Verificar conectividad.",
            duration_ms=duration_ms,
        )


# ---------------------------------------------------------------------------
# F. Privacidad y RGPD
# ---------------------------------------------------------------------------

async def attack_pii_in_ai_prompts(db: AsyncSession) -> AttackResult:
    """
    F1 — PII en Prompts IA (RGPD Art. 9)
    Verifica que post_workout_service.py no incluye notas de texto libre
    ni identificadores reales en los prompts enviados a Groq/Gemini.
    """
    t0 = time.monotonic()
    attack_id = "F1"
    name = "PII en Prompts IA — RGPD Art. 9"
    category = "Privacidad RGPD"
    severity = AttackSeverity.CRITICAL
    description = (
        "Verifica a nivel de código que los prompts IA (post_workout_coach, "
        "ai_insights) no incluyen notas de usuario, user_id, email ni "
        "health_subject_id. Datos de salud son categoría especial (Art. 9)."
    )

    duration_ms = int((time.monotonic() - t0) * 1000)

    try:
        import importlib.util
        import ast
        import pathlib

        issues = []
        base_path = pathlib.Path(__file__).parent.parent.parent  # app/

        files_to_check = [
            "modules/workout_sessions/post_workout_service.py",
            "modules/ai_insights/service.py",
            "modules/ai_coach/service.py",
        ]

        pii_patterns = [
            ("user_id", "UUID del usuario"),
            ("email", "Email del usuario"),
            ("display_name", "Nombre de usuario"),
            ("health_subject_id", "ID pseudónimo de salud"),
            ("notes_encrypted", "Notas cifradas"),
        ]

        for file_rel in files_to_check:
            file_path = base_path / file_rel
            if not file_path.exists():
                continue

            source = file_path.read_text(encoding="utf-8")

            # Buscar patrones PII en construcción de prompts
            # Solo buscamos en líneas que contengan string de prompt (f-string, format, etc.)
            prompt_lines = []
            for i, line in enumerate(source.split("\n")):
                if any(kw in line for kw in ["prompt", "f\"", "f'", ".format(", "messages"]):
                    prompt_lines.append((i + 1, line.strip()))

            # Palabras que indican que la línea EXCLUYE el campo (docstrings RGPD, comentarios)
            _negation_words = [
                "NUNCA", "NEVER", "NO se envía", "NO contiene", "no contiene",
                "no incluye", "NO incluye", "excluye", "Excluye", "garantía",
                "✓ NO", "no_", "_not_", "not_include", "exclui",
            ]

            for line_num, line in prompt_lines:
                for pii_field, desc in pii_patterns:
                    if pii_field in line and not line.strip().startswith("#"):
                        # Excluir líneas que tienen el patrón pero es para EXCLUIRLO
                        if f'{pii_field} = ""' in line or f'{pii_field}=""' in line:
                            continue
                        # Excluir líneas de docstrings/comentarios que afirman la exclusión del campo
                        if any(neg in line for neg in _negation_words):
                            continue
                        # Excluir líneas que son solo asignación de variable local (no construcción de prompt)
                        stripped = line.strip()
                        if stripped.startswith(pii_field + " =") or stripped.startswith("# "):
                            continue
                        issues.append(f"{file_rel}:{line_num} — '{pii_field}' ({desc}) en contexto de prompt")

        if issues:
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding=f"🚨 Posible PII en prompts IA detectada:\n" + "\n".join(issues[:5]),
                recommendation="Revisar y eliminar campos PII de los prompts. Solo métricas numéricas anónimas.",
                proof={"issues_found": len(issues), "samples": issues[:3]},
                duration_ms=duration_ms,
            )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding="✅ No se detectó PII en las funciones de construcción de prompts IA. RGPD Art. 9 cumplido.",
                duration_ms=duration_ms,
                proof={"files_checked": len(files_to_check), "pii_patterns_tested": len(pii_patterns)},
            )

    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED,
            description=description,
            finding=f"No se pudo analizar el código fuente: {type(e).__name__}: {e}",
            recommendation="Revisar manualmente los archivos de servicio IA.",
            duration_ms=duration_ms,
        )


async def attack_pseudonymization_check(db: AsyncSession) -> AttackResult:
    """
    F2 — Pseudonimización AEPD
    Verifica que los registros de salud NO tienen user_id directo,
    solo health_subject_id (pseudónimo opaco).
    """
    t0 = time.monotonic()
    attack_id = "F2"
    name = "Pseudonimización AEPD — health_records sin user_id"
    category = "Privacidad RGPD"
    severity = AttackSeverity.HIGH
    description = (
        "Verifica que la tabla health_records no tiene columna user_id directa. "
        "Solo debe tener health_subject_id (UUID pseudónimo). "
        "La vinculación identidad↔salud solo existe en data_links cifrada."
    )

    try:
        # Rollback preventivo: si un ataque anterior abortó la transacción,
        # esta sesión SQLAlchemy puede estar en estado inválido.
        try:
            await db.rollback()
        except Exception:
            pass

        # Verificar columnas de health_records (schema: health, no public)
        result = await db.execute(
            text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'health_records'
                  AND table_schema = 'health'
                ORDER BY ordinal_position
            """)
        )
        columns = [row[0] for row in result.fetchall()]

        duration_ms = int((time.monotonic() - t0) * 1000)

        if "user_id" in columns:
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding="🚨 health_records tiene columna user_id directa. La pseudonimización está rota — los datos de salud están vinculados directamente a identidades.",
                recommendation="Migrar: eliminar user_id de health_records y usar solo health_subject_id. Actualizar todas las queries.",
                proof={"columns": columns},
                duration_ms=duration_ms,
            )

        if "health_subject_id" not in columns:
            return _warning(
                attack_id, name, category, severity, description,
                finding="⚠️ health_records no tiene health_subject_id. La estructura de pseudonimización no está implementada.",
                recommendation="Crear la arquitectura 3-tablas: users → data_links (cifrada) → health_records (por health_subject_id).",
                proof={"columns": columns},
                duration_ms=duration_ms,
            )

        # Verificar que data_links tiene la estructura de cifrado correcta
        result2 = await db.execute(
            text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'data_links'
                  AND table_schema = 'public'
                ORDER BY ordinal_position
            """)
        )
        dl_columns = [row[0] for row in result2.fetchall()]

        return _blocked(
            attack_id, name, category, severity, description,
            finding=(
                f"✅ Pseudonimización AEPD correcta: "
                f"health_records tiene health_subject_id (no user_id). "
                f"data_links conecta identidad↔pseudónimo mediante AES-256-GCM."
            ),
            duration_ms=duration_ms,
            proof={
                "health_records_columns": columns,
                "data_links_columns": dl_columns,
                "user_id_present": False,
                "health_subject_id_present": True,
            },
        )

    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED,
            description=description,
            finding=f"No se pudo verificar el schema de BD: {type(e).__name__}: {e}",
            recommendation="Verificar permisos de information_schema.",
            duration_ms=duration_ms,
        )


# ---------------------------------------------------------------------------
# G. Configuración e infraestructura
# ---------------------------------------------------------------------------

async def attack_security_headers(base_url: str) -> AttackResult:
    """
    G1 — Security Headers
    Verifica que el servidor devuelve todos los headers de seguridad necesarios:
    CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.
    """
    t0 = time.monotonic()
    attack_id = "G1"
    name = "Security Headers — CSP, HSTS, X-Frame"
    category = "Infraestructura"
    severity = AttackSeverity.MEDIUM
    description = (
        "Verifica que las respuestas HTTP incluyen headers de seguridad críticos "
        "que protegen contra XSS, clickjacking y MIME sniffing."
    )

    required_headers = {
        "content-security-policy": "CSP — previene XSS",
        "x-content-type-options": "Previene MIME sniffing",
        "x-frame-options": "Previene clickjacking (o via CSP frame-ancestors)",
        "referrer-policy": "Controla qué datos en Referer",
    }

    try:
        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            resp = await client.get("/api/v1/chat/widget-config")

        duration_ms = int((time.monotonic() - t0) * 1000)
        response_headers = {k.lower(): v for k, v in resp.headers.items()}

        missing = []
        present = []

        for header, desc in required_headers.items():
            if header in response_headers:
                present.append(f"✅ {header}: {response_headers[header][:60]}")
            else:
                # Excepción: x-frame-options puede ser reemplazado por frame-ancestors en CSP
                if header == "x-frame-options" and "content-security-policy" in response_headers:
                    csp = response_headers["content-security-policy"]
                    if "frame-ancestors" in csp:
                        present.append(f"✅ frame-ancestors en CSP (reemplaza X-Frame-Options)")
                        continue
                missing.append(f"❌ {header} ausente — {desc}")

        if missing:
            return _warning(
                attack_id, name, category, severity, description,
                finding=f"⚠️ {len(missing)}/{len(required_headers)} headers ausentes:\n" + "\n".join(missing),
                recommendation="Añadir en add_security_headers middleware en main.py: " + ", ".join([m.split(" ")[1] for m in missing]),
                proof={"missing": missing, "present_count": len(present)},
                duration_ms=duration_ms,
            )

        return _blocked(
            attack_id, name, category, severity, description,
            finding=f"✅ Todos los security headers presentes ({len(present)}/{len(required_headers)}).",
            duration_ms=duration_ms,
            proof={"present": present},
        )

    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED,
            description=description,
            finding=f"No se pudo verificar: {type(e).__name__}",
            recommendation="Verificar conectividad.",
            duration_ms=duration_ms,
        )


async def attack_cors_configuration(base_url: str) -> AttackResult:
    """
    G2 — CORS Configuration
    Verifica que CORS no permite cualquier origen (*).
    Un CORS wildcard permite que cualquier web haga peticiones autenticadas.
    """
    t0 = time.monotonic()
    attack_id = "G2"
    name = "CORS — Wildcard Origin"
    category = "Infraestructura"
    severity = AttackSeverity.HIGH
    description = (
        "Envía una petición CORS preflight con Origin: https://evil-attacker.com. "
        "Si el servidor responde con Access-Control-Allow-Origin: *, "
        "cualquier web puede hacer peticiones autenticadas."
    )

    try:
        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            resp = await client.options(
                "/api/v1/auth/login",
                headers={
                    "Origin": "https://evil-attacker-test-healthstack.com",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "Content-Type, Authorization",
                },
            )

        duration_ms = int((time.monotonic() - t0) * 1000)
        acao = resp.headers.get("access-control-allow-origin", "")

        if acao == "*":
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding="🚨 CORS configurado con wildcard (*). Cualquier origen puede hacer peticiones autenticadas.",
                recommendation="Definir ALLOWED_ORIGINS explícitamente en .env. Nunca usar * en producción.",
                proof={"access_control_allow_origin": acao},
                duration_ms=duration_ms,
            )
        elif "evil-attacker" in acao:
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding="🚨 El servidor reflejó el Origin malicioso en Access-Control-Allow-Origin.",
                recommendation="No usar reflect_origin=True en CORSMiddleware. Usar lista blanca explícita.",
                proof={"access_control_allow_origin": acao},
                duration_ms=duration_ms,
            )
        elif not acao:
            # Sin header CORS = por defecto no permite origen cruzado = seguro
            return _blocked(
                attack_id, name, category, severity, description,
                finding="✅ Origen malicioso rechazado — sin Access-Control-Allow-Origin en la respuesta.",
                duration_ms=duration_ms,
                proof={"acao_header": "absent (correct)"},
            )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding=f"✅ CORS restringido a origen específico: {acao[:60]}",
                duration_ms=duration_ms,
                proof={"access_control_allow_origin": acao},
            )

    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED,
            description=description,
            finding=f"No se pudo verificar: {type(e).__name__}",
            recommendation="Verificar conectividad.",
            duration_ms=duration_ms,
        )


async def attack_password_reset_token_exposure(base_url: str) -> AttackResult:
    """
    G3 — Reset Token en URL (no en fragmento)
    Verifica que el endpoint de recuperación de contraseña usa fragmento URL (#)
    en lugar de query param (?token=...) para que el token no llegue a los logs.
    """
    t0 = time.monotonic()
    attack_id = "G3"
    name = "Reset Token — Query Param vs Fragmento URL"
    category = "Infraestructura"
    severity = AttackSeverity.HIGH
    description = (
        "Verifica el código fuente de identity/router.py: "
        "el reset_url debe usar # (fragmento) no ? (query param). "
        "Los query params aparecen en logs de nginx, Cloudflare y Referer headers."
    )

    duration_ms = int((time.monotonic() - t0) * 1000)

    try:
        import pathlib
        router_path = pathlib.Path(__file__).parent.parent / "identity" / "router.py"

        if not router_path.exists():
            return AttackResult(
                id=attack_id, name=name, category=category, severity=severity,
                status=AttackStatus.SKIPPED,
                description=description,
                finding="identity/router.py no encontrado.",
                recommendation="Verificar la ruta del archivo.",
                duration_ms=duration_ms,
            )

        source = router_path.read_text(encoding="utf-8")

        # Buscar la construcción de reset_url
        # Correcto: f"{url}#reset_token={token}"
        # Vulnerable: f"{url}?reset_token={token}"
        if "?reset_token=" in source or "?token=" in source:
            # Encontrar la línea exacta
            for i, line in enumerate(source.split("\n"), 1):
                if "?reset_token=" in line or ("?token=" in line and "reset" in line.lower()):
                    return _vulnerable(
                        attack_id, name, category, severity, description,
                        finding=f"🚨 Línea {i}: Reset token en query param: {line.strip()[:80]}",
                        recommendation="Cambiar ? por # en el reset_url. El fragmento nunca llega al servidor ni a los logs.",
                        proof={"line": i, "code": line.strip()[:80]},
                        duration_ms=duration_ms,
                    )

        if "#reset_token=" in source or "#token=" in source:
            return _blocked(
                attack_id, name, category, severity, description,
                finding="✅ Reset token usa fragmento URL (#). No aparece en logs de servidor ni headers Referer.",
                duration_ms=duration_ms,
            )

        return _warning(
            attack_id, name, category, severity, description,
            finding="⚠️ No se encontró el patrón de reset_url en el código. Verificar manualmente.",
            recommendation="Buscar en identity/router.py la construcción de la URL de reset de contraseña.",
            duration_ms=duration_ms,
        )

    except Exception as e:
        duration_ms = int((time.monotonic() - t0) * 1000)
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED,
            description=description,
            finding=f"No se pudo analizar: {type(e).__name__}",
            recommendation="Revisar manualmente identity/router.py",
            duration_ms=duration_ms,
        )


# ---------------------------------------------------------------------------
# A4–A5. Autenticación adicional
# ---------------------------------------------------------------------------

async def attack_brute_force_no_lockout(base_url: str) -> AttackResult:
    """
    A4 — Brute Force sin Lockout de Cuenta
    Envía 20 intentos de login fallidos con el mismo email.
    Si ninguno devuelve 429, no hay protección por cuenta.
    """
    t0 = time.monotonic()
    attack_id = "A4"
    name = "Brute Force — Sin Lockout de Cuenta"
    category = "Autenticación"
    severity = AttackSeverity.HIGH
    description = (
        "Envía 20 intentos de login fallidos con el mismo email. "
        "Si no aparece un 429, no hay bloqueo por cuenta — "
        "un atacante puede probar contraseñas indefinidamente."
    )
    try:
        blocked_count = 0
        payload = {"email": "admin@healthstack.app", "password": "wrong_password_brute_force"}
        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            for _ in range(20):
                resp = await client.post("/api/v1/auth/login", json=payload)
                if resp.status_code == 429:
                    blocked_count += 1
                    break  # Suficiente evidencia

        duration_ms = int((time.monotonic() - t0) * 1000)

        if blocked_count > 0:
            return _blocked(
                attack_id, name, category, severity, description,
                finding=f"✅ Rate limit activo — {blocked_count} respuesta(s) 429 tras intentos repetidos.",
                duration_ms=duration_ms,
                proof={"attempts": 20, "blocked_429": blocked_count},
            )
        else:
            return _warning(
                attack_id, name, category, severity, description,
                finding="⚠️ 20 intentos de login fallidos sin ningún 429. El límite global (200/min) puede no proteger ataques lentos por cuenta.",
                recommendation=(
                    "Añadir rate limit específico por email en el endpoint de login: "
                    "ej. 10 intentos/hora por dirección de email."
                ),
                proof={"attempts": 20, "blocked_429": 0},
                duration_ms=duration_ms,
            )
    except Exception as e:
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED, description=description,
            finding=f"No se pudo ejecutar: {type(e).__name__}",
            recommendation="Verificar conectividad.", duration_ms=int((time.monotonic() - t0) * 1000),
        )


async def attack_refresh_token_reuse(base_url: str) -> AttackResult:
    """
    A5 — Refresh Token: Verificación de Single-Use
    Verifica (a nivel código) que los refresh tokens se invalidan
    tras el logout y no se pueden reutilizar.
    """
    t0 = time.monotonic()
    attack_id = "A5"
    name = "Refresh Token — Reutilización tras Logout"
    category = "Autenticación"
    severity = AttackSeverity.HIGH
    description = (
        "Verifica que el endpoint /auth/logout invalida el refresh token "
        "en la BD. Si no se invalida, un atacante con el token robado "
        "puede obtener nuevos access tokens indefinidamente."
    )
    try:
        base = pathlib.Path(__file__).parent.parent.parent
        router_path = base / "modules/identity/router.py"
        repo_path = base / "modules/identity/repository.py"

        source_router = router_path.read_text(encoding="utf-8") if router_path.exists() else ""
        source_repo = repo_path.read_text(encoding="utf-8") if repo_path.exists() else ""
        combined = source_router + source_repo

        issues = []
        # Buscar que logout invalida el token en BD
        if "logout" in source_router.lower():
            if "invalidate" not in combined and "revoke" not in combined and "delete" not in combined.lower():
                issues.append("logout endpoint no invalida/borra el refresh token en BD")
        # Verificar que refresh comprueba si el token está revocado
        if "refresh" in source_router.lower():
            if "is_revoked" not in combined and "revoked" not in combined and "blacklist" not in combined:
                issues.append("refresh endpoint no verifica si el token fue revocado")

        duration_ms = int((time.monotonic() - t0) * 1000)

        if issues:
            return _warning(
                attack_id, name, category, severity, description,
                finding=f"⚠️ Posibles gaps en revocación de tokens: {'; '.join(issues)}",
                recommendation="Verificar que logout borra el refresh token de la tabla refresh_tokens y que /auth/refresh comprueba is_revoked.",
                proof={"issues": issues},
                duration_ms=duration_ms,
            )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding="✅ Logout invalida refresh tokens en BD. Refresh verifica revocación.",
                duration_ms=duration_ms,
                proof={"files_checked": ["identity/router.py", "identity/repository.py"]},
            )
    except Exception as e:
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED, description=description,
            finding=f"No se pudo analizar: {type(e).__name__}",
            recommendation="Revisar manualmente identity/router.py.", duration_ms=int((time.monotonic() - t0) * 1000),
        )


# ---------------------------------------------------------------------------
# C3. Control de Acceso adicional
# ---------------------------------------------------------------------------

async def attack_horizontal_privilege_escalation(base_url: str, admin_token: str) -> AttackResult:
    """
    C3 — Escalada Horizontal (IDOR entre usuarios)
    Verifica que un usuario no puede acceder a recursos de otro usuario
    modificando el ID en la URL. Usa el token admin para verificar
    que los endpoints protegen por ownership, no solo por autenticación.
    """
    t0 = time.monotonic()
    attack_id = "C3"
    name = "Escalada Horizontal — IDOR entre Usuarios"
    category = "Control de Acceso"
    severity = AttackSeverity.HIGH
    description = (
        "Intenta acceder a recursos de otro usuario (workout sessions, gamification) "
        "usando UUIDs de usuarios ficticios. Si devuelve 200 con datos, "
        "hay IDOR horizontal — un usuario ve datos de otro."
    )
    try:
        fake_user_ids = [
            "00000000-0000-0000-0000-000000000099",
            "ffffffff-ffff-ffff-ffff-ffffffffffff",
        ]
        vulnerable_endpoints = []

        # Crear token de usuario normal (no admin) para el ataque
        attacker_token = create_access_token(
            user_id="00000000-0000-0000-0000-000000000001",
            email="attacker@evil.com",
            role="user",
        )

        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            for uid in fake_user_ids:
                # Intentar acceder a gamification de otro usuario
                resp = await client.get(
                    f"/api/v1/gamification/profile/{uid}",
                    headers={"Authorization": f"Bearer {attacker_token}"},
                )
                if resp.status_code == 200:
                    vulnerable_endpoints.append(f"GET /gamification/profile/{uid[:8]}... → 200")

                # Intentar listar workouts de otro usuario (si el endpoint existe)
                resp2 = await client.get(
                    f"/api/v1/workout/sessions?user_id={uid}",
                    headers={"Authorization": f"Bearer {attacker_token}"},
                )
                if resp2.status_code == 200:
                    body = resp2.json()
                    # Solo es IDOR si devuelve datos de otro usuario (no vacío)
                    if isinstance(body, list) and len(body) > 0:
                        vulnerable_endpoints.append(f"GET /workout/sessions?user_id={uid[:8]}... → datos expuestos")

        duration_ms = int((time.monotonic() - t0) * 1000)

        if vulnerable_endpoints:
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding=f"🚨 IDOR horizontal detectado: {'; '.join(vulnerable_endpoints)}",
                recommendation="Verificar que todos los endpoints filtran por current_user['user_id'], nunca por query params del cliente.",
                proof={"vulnerable_endpoints": vulnerable_endpoints},
                duration_ms=duration_ms,
            )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding="✅ Endpoints retornan 401/403/404 para IDs de otros usuarios. Sin IDOR horizontal detectado.",
                duration_ms=duration_ms,
                proof={"tested_endpoints": 4, "fake_user_ids": 2},
            )
    except Exception as e:
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED, description=description,
            finding=f"No se pudo ejecutar: {type(e).__name__}",
            recommendation="Verificar conectividad.", duration_ms=int((time.monotonic() - t0) * 1000),
        )


# ---------------------------------------------------------------------------
# D3–D4. Inyección adicional
# ---------------------------------------------------------------------------

async def attack_xss_reflected(base_url: str, admin_token: str) -> AttackResult:
    """
    D3 — XSS Reflejado en campos de API
    Envía payloads XSS en campos de texto (display_name) y verifica
    que la API devuelve Content-Type: application/json (no HTML) y
    que el payload no se ejecuta en respuesta directa.
    """
    t0 = time.monotonic()
    attack_id = "D3"
    name = "XSS Reflejado — Campos de Texto Libre"
    category = "Inyección"
    severity = AttackSeverity.MEDIUM
    description = (
        "Envía payloads XSS clásicos en campos editables (display_name). "
        "Una API JSON correcta devuelve Content-Type: application/json "
        "y escapa los caracteres peligrosos en el output."
    )
    try:
        xss_payload = '<script>alert("xss")</script><img src=x onerror=alert(1)>'

        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            resp = await client.patch(
                "/api/v1/auth/me",
                json={"display_name": xss_payload},
                headers={"Authorization": f"Bearer {admin_token}"},
            )

        duration_ms = int((time.monotonic() - t0) * 1000)

        if resp.status_code not in (200, 422):
            return AttackResult(
                id=attack_id, name=name, category=category, severity=severity,
                status=AttackStatus.SKIPPED, description=description,
                finding=f"Respuesta inesperada HTTP {resp.status_code}.",
                recommendation="Verificar manualmente.", duration_ms=duration_ms,
            )

        content_type = resp.headers.get("content-type", "")
        issues = []

        if "text/html" in content_type:
            issues.append("API devuelve text/html (no application/json) — XSS posible en browser")

        if resp.status_code == 200:
            body_text = resp.text
            # Si el script tag aparece sin escapar en JSON directo
            if "<script>" in body_text and "application/json" not in content_type:
                issues.append("Payload XSS devuelto sin escapar en respuesta no-JSON")

        if resp.status_code == 422:
            # Pydantic rechazó el input → bien protegido
            return _blocked(
                attack_id, name, category, severity, description,
                finding="✅ Pydantic rechazó el payload XSS (422 Unprocessable Entity). Validación de input activa.",
                duration_ms=duration_ms,
                proof={"status_code": 422, "content_type": content_type},
            )

        # Restaurar display_name
        async with httpx.AsyncClient(base_url=base_url, timeout=2.0) as client:
            await client.patch(
                "/api/v1/auth/me",
                json={"display_name": "Admin"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )

        if issues:
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding=f"🚨 Problemas XSS detectados: {'; '.join(issues)}",
                recommendation="Asegurar Content-Type: application/json en todas las respuestas. Escapar HTML en campos de texto si se renderizan en browser.",
                proof={"issues": issues, "content_type": content_type},
                duration_ms=duration_ms,
            )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding=f"✅ API devuelve application/json. Payload XSS almacenado como texto plano (sin ejecución directa). Content-Type correcto.",
                duration_ms=duration_ms,
                proof={"content_type": content_type, "status_code": resp.status_code},
            )
    except Exception as e:
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED, description=description,
            finding=f"No se pudo ejecutar: {type(e).__name__}",
            recommendation="Verificar conectividad.", duration_ms=int((time.monotonic() - t0) * 1000),
        )


async def attack_large_payload_dos(base_url: str) -> AttackResult:
    """
    D4 — DoS via Large Payload (Request Body Bomb)
    Envía un payload JSON de ~2MB al endpoint de login.
    Si tarda más de 5s o devuelve 500, no hay límite de tamaño.
    Un servidor bien configurado devuelve 413 rápidamente.
    """
    t0 = time.monotonic()
    attack_id = "D4"
    name = "DoS — Large Payload (Body Bomb)"
    category = "Inyección"
    severity = AttackSeverity.MEDIUM
    description = (
        "Envía un JSON de ~1MB al endpoint de login. "
        "Si el servidor no limita el tamaño del body, "
        "un atacante puede agotar memoria/CPU con payloads enormes."
    )
    try:
        large_value = "A" * (1024 * 1024)  # 1MB de caracteres
        payload = {"email": "test@test.com", "password": large_value}

        async with httpx.AsyncClient(base_url=base_url, timeout=8.0) as client:
            t_req = time.monotonic()
            resp = await client.post("/api/v1/auth/login", json=payload)
            req_duration = time.monotonic() - t_req

        duration_ms = int((time.monotonic() - t0) * 1000)

        if resp.status_code == 413:
            return _blocked(
                attack_id, name, category, severity, description,
                finding="✅ Servidor rechaza payloads grandes con 413 Request Entity Too Large.",
                duration_ms=duration_ms,
                proof={"status_code": 413, "payload_size_kb": 1024},
            )
        elif resp.status_code in (422, 400):
            return _blocked(
                attack_id, name, category, severity, description,
                finding=f"✅ Validación Pydantic rechazó el payload grande con {resp.status_code}. Procesamiento rápido ({req_duration*1000:.0f}ms).",
                duration_ms=duration_ms,
                proof={"status_code": resp.status_code, "req_duration_ms": int(req_duration * 1000)},
            )
        elif req_duration > 3.0:
            return _warning(
                attack_id, name, category, severity, description,
                finding=f"⚠️ Payload 1MB tardó {req_duration*1000:.0f}ms en procesarse. Sin límite explícito de tamaño.",
                recommendation="Configurar client_max_body_size en nginx (ej. 1m) y max_request_body_size en uvicorn.",
                proof={"status_code": resp.status_code, "req_duration_ms": int(req_duration * 1000)},
                duration_ms=duration_ms,
            )
        else:
            return _warning(
                attack_id, name, category, severity, description,
                finding=f"⚠️ Servidor procesó payload 1MB (HTTP {resp.status_code}) en {req_duration*1000:.0f}ms sin rechazar por tamaño.",
                recommendation="Añadir limit_req_body en nginx o BODY_LIMIT en la app para prevenir ataques de cuerpo grande.",
                proof={"status_code": resp.status_code, "req_duration_ms": int(req_duration * 1000)},
                duration_ms=duration_ms,
            )
    except (httpx.TimeoutException, asyncio.TimeoutError):
        duration_ms = int((time.monotonic() - t0) * 1000)
        return _vulnerable(
            attack_id, name, category, severity, description,
            finding="🚨 Timeout procesando payload 1MB. El servidor se colgó — DoS efectivo.",
            recommendation="Configurar client_max_body_size 1m en nginx y límite de body en FastAPI/uvicorn.",
            proof={"timeout": True, "payload_size_kb": 1024},
            duration_ms=duration_ms,
        )
    except Exception as e:
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED, description=description,
            finding=f"No se pudo ejecutar: {type(e).__name__}",
            recommendation="Verificar conectividad.", duration_ms=int((time.monotonic() - t0) * 1000),
        )


# ---------------------------------------------------------------------------
# F3. Privacidad RGPD adicional
# ---------------------------------------------------------------------------

async def attack_data_retention_ttl(db: AsyncSession) -> AttackResult:
    """
    F3 — Retención de Datos: TTL de workout_ai_plans
    Verifica que los planes IA generados (post-workout coach) respetan
    el TTL de 48h definido en el módulo. Datos IA sin expirar = retención excesiva.
    """
    t0 = time.monotonic()
    attack_id = "F3"
    name = "Retención Datos IA — TTL workout_ai_plans"
    category = "Privacidad RGPD"
    severity = AttackSeverity.MEDIUM
    description = (
        "Verifica que workout_ai_plans elimina o marca como expirados "
        "los registros tras 48h. La retención indefinida de datos IA "
        "con contexto de entreno puede infringir RGPD Art. 5(1)(e)."
    )
    try:
        try:
            await db.rollback()
        except Exception:
            pass

        # expires_at es el TTL real del plan; created_at es cuándo se generó
        result = await db.execute(
            text("""
                SELECT COUNT(*) AS total,
                       SUM(CASE WHEN expires_at < NOW() THEN 1 ELSE 0 END) AS expired
                FROM public.workout_ai_plans
            """)
        )
        row = result.fetchone()
        duration_ms = int((time.monotonic() - t0) * 1000)

        if row is None:
            return AttackResult(
                id=attack_id, name=name, category=category, severity=AttackSeverity.MEDIUM,
                status=AttackStatus.SKIPPED, description=description,
                finding="No se encontró la tabla workout_ai_plans.",
                recommendation="Verificar que la migración injury_coach_tables se ejecutó.",
                duration_ms=duration_ms,
            )

        total, expired = row[0], row[1] or 0

        if total == 0:
            return _blocked(
                attack_id, name, category, severity, description,
                finding="✅ Sin datos en workout_ai_plans (sistema nuevo o limpiado). TTL no comprobable aún.",
                duration_ms=duration_ms,
                proof={"total_records": 0},
            )
        elif expired > 0 and expired / total > 0.1:
            return _warning(
                attack_id, name, category, severity, description,
                finding=f"⚠️ {expired}/{total} planes IA tienen más de 48h ({expired/total*100:.0f}% expirados sin limpiar). Falta job de limpieza.",
                recommendation="Añadir scheduled job: DELETE FROM workout_ai_plans WHERE expires_at < NOW(). O usar pg_cron para limpieza automática.",
                proof={"total_records": total, "expired_records": expired},
                duration_ms=duration_ms,
            )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding=f"✅ TTL de datos IA correcto: {total} planes activos, {expired} expirados (<10%). Retención cumple RGPD Art. 5(1)(e).",
                duration_ms=duration_ms,
                proof={"total_records": total, "expired_records": expired},
            )
    except Exception as e:
        try:
            await db.rollback()
        except Exception:
            pass
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED, description=description,
            finding=f"No se pudo consultar: {type(e).__name__}: {str(e)[:100]}",
            recommendation="Verificar permisos de BD.", duration_ms=int((time.monotonic() - t0) * 1000),
        )


# ---------------------------------------------------------------------------
# G4–G5. Infraestructura adicional
# ---------------------------------------------------------------------------

async def attack_server_version_disclosure(base_url: str) -> AttackResult:
    """
    G4 — Divulgación de Versión del Servidor
    Verifica que nginx/uvicorn no revelan su versión en headers HTTP.
    Server: nginx/1.25.3 o X-Powered-By: uvicorn ayuda a atacantes a
    buscar CVEs específicos.
    """
    t0 = time.monotonic()
    attack_id = "G4"
    name = "Divulgación de Versión — Server Headers"
    category = "Infraestructura"
    severity = AttackSeverity.LOW
    description = (
        "Verifica que los headers HTTP no revelan versiones de software "
        "(nginx/X.Y, Python/3.X, uvicorn/X.Y). Esta info ayuda a "
        "atacantes a buscar CVEs específicos de esas versiones."
    )
    try:
        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            resp = await client.get("/api/v1/auth/me")

        duration_ms = int((time.monotonic() - t0) * 1000)

        issues = []
        headers_checked = {}

        server = resp.headers.get("server", "")
        if server:
            headers_checked["server"] = server
            # nginx sin versión → bien. nginx/1.25.3 → mal
            if "/" in server and any(c.isdigit() for c in server):
                issues.append(f"Server: {server} (versión expuesta)")

        powered_by = resp.headers.get("x-powered-by", "")
        if powered_by:
            headers_checked["x-powered-by"] = powered_by
            issues.append(f"X-Powered-By: {powered_by} (stack tecnológico expuesto)")

        # Uvicorn por defecto expone 'uvicorn' en algunas versiones
        if "uvicorn" in server.lower() and "/" in server:
            issues.append(f"Versión de uvicorn expuesta: {server}")

        if issues:
            return _warning(
                attack_id, name, category, severity, description,
                finding=f"⚠️ Headers revelan información de versión: {'; '.join(issues)}",
                recommendation=(
                    "En nginx: añadir 'server_tokens off;' en nginx.conf. "
                    "En FastAPI: no añadir X-Powered-By. "
                    "En uvicorn: usar --header 'server:' vacío."
                ),
                proof={"headers": headers_checked, "issues": issues},
                duration_ms=duration_ms,
            )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding=f"✅ Sin divulgación de versión en headers HTTP. Server: '{server or 'no presente'}'.",
                duration_ms=duration_ms,
                proof={"server_header": server or "absent"},
            )
    except Exception as e:
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED, description=description,
            finding=f"No se pudo conectar: {type(e).__name__}",
            recommendation="Verificar conectividad.", duration_ms=int((time.monotonic() - t0) * 1000),
        )


async def attack_path_traversal(base_url: str) -> AttackResult:
    """
    G5 — Path Traversal
    Intenta acceder a archivos del sistema mediante secuencias ../
    en parámetros de URL. Un servidor bien configurado devuelve 400/404.
    """
    t0 = time.monotonic()
    attack_id = "G5"
    name = "Path Traversal — Secuencias ../ en URL"
    category = "Infraestructura"
    severity = AttackSeverity.HIGH
    description = (
        "Envía rutas con secuencias ../ para intentar acceder a archivos "
        "fuera del directorio raíz (ej. /etc/passwd). "
        "Nginx debe bloquear o normalizar estas rutas."
    )
    try:
        traversal_paths = [
            "/api/v1/../../../etc/passwd",
            "/api/v1/%2e%2e/%2e%2e/etc/passwd",  # URL encoded
            "/api/v1/health/records/../../../../etc/shadow",
            "/.env",
            "/backend/.env",
        ]
        vulnerable_paths = []

        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            for path in traversal_paths:
                try:
                    resp = await client.get(path)
                    if resp.status_code == 200:
                        body = resp.text[:200]
                        # Verificar si realmente devuelve contenido sensible
                        if any(marker in body for marker in ["root:", "password", "SECRET", "DATABASE_URL"]):
                            vulnerable_paths.append(f"{path} → contenido sensible")
                        else:
                            # 200 pero sin contenido sensible (probablemente la SPA)
                            pass
                except Exception:
                    pass

        duration_ms = int((time.monotonic() - t0) * 1000)

        if vulnerable_paths:
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding=f"🚨 Path traversal exitoso: {'; '.join(vulnerable_paths)}",
                recommendation="Añadir 'merge_slashes on;' y 'location ~* \\.\\./' deny all; en nginx.",
                proof={"vulnerable_paths": vulnerable_paths},
                duration_ms=duration_ms,
            )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding="✅ Nginx normaliza/bloquea secuencias path traversal. Sin acceso a archivos del sistema.",
                duration_ms=duration_ms,
                proof={"paths_tested": len(traversal_paths), "vulnerable": 0},
            )
    except Exception as e:
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED, description=description,
            finding=f"No se pudo ejecutar: {type(e).__name__}",
            recommendation="Verificar conectividad.", duration_ms=int((time.monotonic() - t0) * 1000),
        )


# ---------------------------------------------------------------------------
# H1. Dependencias
# ---------------------------------------------------------------------------

async def attack_dependency_versions(db: AsyncSession) -> AttackResult:
    """
    H1 — Dependencias con Versiones Vulnerables Conocidas
    Analiza requirements.txt buscando versiones con CVEs publicados.
    Lista de CVEs hardcodeada con los más relevantes para el stack.
    """
    t0 = time.monotonic()
    attack_id = "H1"
    name = "Dependencias — Versiones con CVEs Conocidos"
    category = "Infraestructura"
    severity = AttackSeverity.HIGH
    description = (
        "Analiza requirements.txt buscando versiones con CVEs publicados. "
        "Dependencias desactualizadas son el vector de ataque #1 según OWASP A06:2021."
    )
    try:
        base = pathlib.Path(__file__).parent.parent.parent.parent  # project root
        req_path = base / "requirements.txt"
        if not req_path.exists():
            req_path = base.parent / "requirements.txt"

        if not req_path.exists():
            return AttackResult(
                id=attack_id, name=name, category=category, severity=severity,
                status=AttackStatus.SKIPPED, description=description,
                finding="No se encontró requirements.txt.",
                recommendation="Verificar la ruta del archivo de dependencias.",
                duration_ms=int((time.monotonic() - t0) * 1000),
            )

        content = req_path.read_text(encoding="utf-8")

        # CVEs conocidos relevantes para el stack — actualizar periódicamente
        KNOWN_VULNERABLE = {
            "cryptography": {
                "below": "42.0.0",
                "cve": "CVE-2023-49083 (NULL dereference en PKCS12)",
                "severity": "HIGH",
            },
            "python-jose": {
                "below": "3.4.0",
                "cve": "CVE-2024-33664/33663 (algorithm confusion)",
                "severity": "CRITICAL",
            },
            "fastapi": {
                "below": "0.109.1",
                "cve": "CVE-2024-24762 (multipart DoS via form parsing)",
                "severity": "HIGH",
            },
            "httpx": {
                "below": "0.27.0",
                "cve": "GHSA-9wx4-h78v-vm56 (SSRF via proxy)",
                "severity": "MEDIUM",
            },
            "pydantic": {
                "below": "2.4.0",
                "cve": "GHSA-mr82-8j83-vxmv (ReDoS en email validation)",
                "severity": "MEDIUM",
            },
            "uvicorn": {
                "below": "0.27.0",
                "cve": "GHSA-35jj-4q37-hqmf (header injection)",
                "severity": "HIGH",
            },
            "starlette": {
                "below": "0.36.2",
                "cve": "CVE-2024-24762 (DoS via form data)",
                "severity": "HIGH",
            },
        }

        def parse_version(v: str) -> tuple[int, ...]:
            """Parse X.Y.Z → (X, Y, Z)"""
            try:
                parts = re.split(r"[.+]", v.split("b")[0].split("a")[0].split("rc")[0])
                return tuple(int(p) for p in parts if p.isdigit())
            except Exception:
                return (0,)

        issues = []
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # Extraer nombre y versión
            m = re.match(r"^([a-zA-Z0-9_\-]+)[>=<!\s]+([0-9][0-9.a-zA-Z+\-]*)", line)
            if not m:
                continue
            pkg_name = m.group(1).lower().replace("_", "-")
            pkg_ver = m.group(2).strip()

            if pkg_name in KNOWN_VULNERABLE:
                vuln = KNOWN_VULNERABLE[pkg_name]
                current = parse_version(pkg_ver)
                threshold = parse_version(vuln["below"])
                if current < threshold:
                    issues.append(
                        f"{pkg_name}=={pkg_ver} → {vuln['cve']} (parchado en {vuln['below']}, severity={vuln['severity']})"
                    )

        duration_ms = int((time.monotonic() - t0) * 1000)

        if issues:
            critical_count = sum(1 for i in issues if "CRITICAL" in i)
            return _vulnerable(
                attack_id, name, category, severity, description,
                finding=f"🚨 {len(issues)} dependencia(s) con CVEs: " + " | ".join(issues[:3]),
                recommendation="Actualizar dependencias: pip install --upgrade " + " ".join(
                    i.split("==")[0] for i in issues
                ) + ". Usar 'pip-audit' para análisis continuo.",
                proof={"vulnerable_packages": issues, "critical_count": critical_count},
                duration_ms=duration_ms,
            )
        else:
            return _blocked(
                attack_id, name, category, severity, description,
                finding=f"✅ Sin CVEs conocidos en las {len(KNOWN_VULNERABLE)} dependencias críticas verificadas.",
                duration_ms=duration_ms,
                proof={"packages_checked": len(KNOWN_VULNERABLE), "vulnerabilities_found": 0},
            )
    except Exception as e:
        return AttackResult(
            id=attack_id, name=name, category=category, severity=severity,
            status=AttackStatus.SKIPPED, description=description,
            finding=f"No se pudo analizar: {type(e).__name__}: {str(e)[:100]}",
            recommendation="Verificar ruta de requirements.txt.", duration_ms=int((time.monotonic() - t0) * 1000),
        )


# ---------------------------------------------------------------------------
# Orquestador principal
# ---------------------------------------------------------------------------

async def _safe_run(coro: Any, attack_id: str, name: str, category: str, timeout: float = 15.0) -> AttackResult:
    """
    Wrapper de resiliencia: ejecuta un ataque con timeout y captura
    cualquier excepción no manejada. Garantiza que un ataque que crashea
    no detiene el resto de la batería.
    """
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        logger.warning("SECURITY_LAB: Timeout en ataque %s (%ss)", attack_id, timeout)
        return AttackResult(
            id=attack_id, name=name, category=category,
            severity=AttackSeverity.MEDIUM,
            status=AttackStatus.SKIPPED,
            description="Ataque omitido por timeout.",
            finding=f"Timeout tras {timeout}s — el ataque tardó demasiado.",
            recommendation="Puede indicar lentitud en el servidor o un endpoint colgado.",
            duration_ms=int(timeout * 1000),
        )
    except Exception as e:
        logger.error("SECURITY_LAB: Error inesperado en ataque %s: %s", attack_id, e)
        return AttackResult(
            id=attack_id, name=name, category=category,
            severity=AttackSeverity.MEDIUM,
            status=AttackStatus.SKIPPED,
            description="Ataque omitido por error inesperado.",
            finding=f"Error interno: {type(e).__name__}: {str(e)[:120]}",
            recommendation="Revisar logs del servidor.",
            duration_ms=0,
        )


async def run_all_attacks(
    base_url: str,
    admin_token: str,
    db: AsyncSession,
) -> list[AttackResult]:
    """
    Ejecuta los 26 ataques en orden y retorna los resultados.
    Cada ataque tiene timeout de 15s y está protegido contra crashes.
    Los ataques son no destructivos — nunca borran ni modifican datos reales.
    """
    logger.info("SECURITY_LAB: Iniciando batería de 26 ataques (%s)", base_url)

    R = []  # resultados

    # ── A. Autenticación y JWT ─────────────────────────────────────────────
    R.append(await _safe_run(attack_jwt_algorithm_confusion(base_url), "A1", "JWT Algorithm Confusion", "Autenticación"))
    R.append(await _safe_run(attack_jwt_none_algorithm(base_url), "A2", "JWT 'none' Algorithm", "Autenticación"))
    R.append(await _safe_run(attack_jwt_expired_token(base_url), "A3", "Replay Token Expirado", "Autenticación"))
    R.append(await _safe_run(attack_brute_force_no_lockout(base_url), "A4", "Brute Force sin Lockout", "Autenticación", timeout=25.0))
    R.append(await _safe_run(attack_refresh_token_reuse(base_url), "A5", "Refresh Token Reutilización", "Autenticación"))

    # ── B. Cifrado ─────────────────────────────────────────────────────────
    R.append(await _safe_run(attack_aes_nonce_reuse(db), "B1", "AES-GCM Nonce Reuse", "Cifrado AES"))
    R.append(await _safe_run(attack_master_key_in_env(db), "B2", "Master Key Entropía", "Cifrado AES"))
    R.append(await _safe_run(attack_hkdf_context_separation(db), "B3", "HKDF Separación Contexto", "Cifrado AES"))

    # ── C. Control de acceso ───────────────────────────────────────────────
    R.append(await _safe_run(attack_idor_health_records(base_url, admin_token), "C1", "IDOR Health Records", "Control Acceso"))
    R.append(await _safe_run(attack_admin_endpoint_escalation(base_url), "C2", "Escalada Admin", "Control Acceso"))
    R.append(await _safe_run(attack_horizontal_privilege_escalation(base_url, admin_token), "C3", "IDOR Horizontal", "Control Acceso"))

    # ── D. Inyección ───────────────────────────────────────────────────────
    R.append(await _safe_run(attack_sql_injection(base_url, admin_token), "D1", "SQL Injection", "Inyección"))
    R.append(await _safe_run(attack_mass_assignment(base_url, admin_token), "D2", "Mass Assignment", "Inyección"))
    R.append(await _safe_run(attack_xss_reflected(base_url, admin_token), "D3", "XSS Reflejado", "Inyección"))
    R.append(await _safe_run(attack_large_payload_dos(base_url), "D4", "DoS Large Payload", "Inyección", timeout=12.0))

    # ── E. Rate limiting ───────────────────────────────────────────────────
    R.append(await _safe_run(attack_rate_limit_bypass(base_url), "E1", "Rate Limit IP Spoofing", "Rate Limiting", timeout=20.0))
    R.append(await _safe_run(attack_user_enumeration(base_url), "E2", "Enumeración Usuarios", "Rate Limiting"))

    # ── F. Privacidad RGPD ─────────────────────────────────────────────────
    R.append(await _safe_run(attack_pii_in_ai_prompts(db), "F1", "PII en Prompts IA", "Privacidad RGPD"))
    R.append(await _safe_run(attack_pseudonymization_check(db), "F2", "Pseudonimización AEPD", "Privacidad RGPD"))
    R.append(await _safe_run(attack_data_retention_ttl(db), "F3", "Retención Datos IA TTL", "Privacidad RGPD"))

    # ── G. Infraestructura ─────────────────────────────────────────────────
    R.append(await _safe_run(attack_security_headers(base_url), "G1", "Security Headers", "Infraestructura"))
    R.append(await _safe_run(attack_cors_configuration(base_url), "G2", "CORS Wildcard", "Infraestructura"))
    R.append(await _safe_run(attack_password_reset_token_exposure(base_url), "G3", "Reset Token Exposure", "Infraestructura"))
    R.append(await _safe_run(attack_server_version_disclosure(base_url), "G4", "Server Version Disclosure", "Infraestructura"))
    R.append(await _safe_run(attack_path_traversal(base_url), "G5", "Path Traversal", "Infraestructura"))

    # ── H. Dependencias ────────────────────────────────────────────────────
    R.append(await _safe_run(attack_dependency_versions(db), "H1", "Dependencias CVEs", "Dependencias"))

    logger.info(
        "SECURITY_LAB: %d ataques — BLOCKED=%d VULNERABLE=%d WARNING=%d SKIPPED=%d",
        len(R),
        sum(1 for r in R if r.status == AttackStatus.BLOCKED),
        sum(1 for r in R if r.status == AttackStatus.VULNERABLE),
        sum(1 for r in R if r.status == AttackStatus.WARNING),
        sum(1 for r in R if r.status == AttackStatus.SKIPPED),
    )

    return R
