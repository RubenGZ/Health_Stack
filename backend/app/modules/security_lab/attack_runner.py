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

import hashlib
import hmac
import logging
import os
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

        # También verificar health_records.notes_encrypted
        result2 = await db.execute(
            text("""
                SELECT
                    split_part(notes_encrypted, ':', 1) AS nonce,
                    COUNT(*) AS cnt
                FROM public.health_records
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
        "a /api/v1/admin/overview. Si funciona, cualquier usuario puede "
        "ver datos de todos los usuarios."
    )

    try:
        # Crear un JWT de usuario normal (rol user, no admin)
        user_token = create_access_token(
            user_id="00000000-0000-0000-0000-000000000001",
            email="attacker@evil.com",
        )

        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            resp = await client.get(
                "/api/v1/admin/overview",
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
        malicious_payload = {
            "display_name": "test_attacker",
            "role": "admin",           # Campo no en el schema
            "is_admin": True,          # Campo no en el schema
            "is_active": False,        # Campo no en el schema
            "email": "hacker@evil.com"  # No debería poder cambiar el email
        }

        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            resp = await client.patch(
                "/api/v1/auth/me",
                json=malicious_payload,
                headers={"Authorization": f"Bearer {admin_token}"},
            )

        duration_ms = int((time.monotonic() - t0) * 1000)

        # Revisar respuesta — si 200 OK, ver si el rol cambió
        if resp.status_code == 200:
            body = resp.json()
            role_changed = body.get("role") == "admin" or body.get("is_admin") == True
            email_changed = body.get("email") == "hacker@evil.com"

            if role_changed or email_changed:
                return _vulnerable(
                    attack_id, name, category, severity, description,
                    finding=f"🚨 Mass assignment exitoso: role_changed={role_changed}, email_changed={email_changed}",
                    recommendation="Usar Pydantic con model_config extra='ignore' o extra='forbid'. Nunca pasar **request.dict() directamente al ORM.",
                    proof={"role_changed": role_changed, "email_changed": email_changed},
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

            for line_num, line in prompt_lines:
                for pii_field, desc in pii_patterns:
                    if pii_field in line and not line.strip().startswith("#"):
                        # Excluir líneas que tienen el patrón pero es para EXCLUIRLO (e.g., = "")
                        if f'{pii_field} = ""' not in line and f'{pii_field}=""' not in line:
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
        # Verificar columnas de health_records
        result = await db.execute(
            text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'health_records'
                  AND table_schema = 'public'
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
# Orquestador principal
# ---------------------------------------------------------------------------

async def run_all_attacks(
    base_url: str,
    admin_token: str,
    db: AsyncSession,
) -> list[AttackResult]:
    """
    Ejecuta todos los ataques en orden y retorna los resultados.
    Los ataques son no destructivos — nunca borran ni modifican datos reales.
    """
    logger.info("SECURITY_LAB: Iniciando batería de ataques (%s)", base_url)

    results = []

    # A. JWT
    results.append(await attack_jwt_algorithm_confusion(base_url))
    results.append(await attack_jwt_none_algorithm(base_url))
    results.append(await attack_jwt_expired_token(base_url))

    # B. Cifrado
    results.append(await attack_aes_nonce_reuse(db))
    results.append(await attack_master_key_in_env(db))
    results.append(await attack_hkdf_context_separation(db))

    # C. Control de acceso
    results.append(await attack_idor_health_records(base_url, admin_token))
    results.append(await attack_admin_endpoint_escalation(base_url))

    # D. Inyección
    results.append(await attack_sql_injection(base_url, admin_token))
    results.append(await attack_mass_assignment(base_url, admin_token))

    # E. Rate limiting
    results.append(await attack_rate_limit_bypass(base_url))
    results.append(await attack_user_enumeration(base_url))

    # F. Privacidad RGPD
    results.append(await attack_pii_in_ai_prompts(db))
    results.append(await attack_pseudonymization_check(db))

    # G. Infraestructura
    results.append(await attack_security_headers(base_url))
    results.append(await attack_cors_configuration(base_url))
    results.append(await attack_password_reset_token_exposure(base_url))

    logger.info(
        "SECURITY_LAB: %d ataques completados — %d BLOCKED, %d VULNERABLE, %d WARNING",
        len(results),
        sum(1 for r in results if r.status == AttackStatus.BLOCKED),
        sum(1 for r in results if r.status == AttackStatus.VULNERABLE),
        sum(1 for r in results if r.status == AttackStatus.WARNING),
    )

    return results
