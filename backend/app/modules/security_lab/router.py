"""
app/modules/security_lab/router.py
=====================================
Endpoints del Security Lab — solo accesibles por admins.

POST /api/v1/security-lab/run-audit   → Ejecuta todos los ataques
GET  /api/v1/security-lab/attacks     → Lista los ataques disponibles
"""

from __future__ import annotations

import logging
import os
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.dependencies import require_role
from app.modules.security_lab.attack_runner import run_all_attacks
from app.modules.security_lab.schemas import (
    AttackStatus,
    SecurityReport,
)
from app.session import get_db

logger = logging.getLogger(__name__)
router = APIRouter(tags=["security-lab"])

_CurrentAdmin = Annotated[dict, Depends(require_role("admin"))]


def _build_base_url(request: Request) -> str:
    """Construye la URL base del servidor actual para los ataques self-hosted."""
    # En Docker: el backend se llama a sí mismo via localhost
    return f"http://localhost:{os.environ.get('PORT', '8000')}"


def _calculate_score(results: list) -> tuple[int, str]:
    """
    Calcula puntuación de seguridad 0-100.
    Penalización: CRITICAL=-20, HIGH=-10, MEDIUM=-5, WARNING=-3
    """
    score = 100
    penalties = {"CRITICAL": 20, "HIGH": 10, "MEDIUM": 5, "INFO": 0}
    warning_penalty = 3

    for r in results:
        if r.status == AttackStatus.VULNERABLE:
            penalty = penalties.get(r.severity.value, 5)
            score -= penalty
        elif r.status == AttackStatus.WARNING:
            score -= warning_penalty

    score = max(0, score)

    if score >= 90:
        grade = "A"
    elif score >= 80:
        grade = "B"
    elif score >= 65:
        grade = "C"
    elif score >= 50:
        grade = "D"
    else:
        grade = "F"

    return score, grade


def _build_summary(blocked: int, vulnerable: int, warning: int, total: int, grade: str) -> str:
    if vulnerable == 0 and warning == 0:
        return f"🛡️ Excelente. {blocked}/{total} ataques bloqueados. Sin vulnerabilidades detectadas. Grado {grade}."
    elif vulnerable == 0:
        return f"✅ Sin vulnerabilidades críticas. {warning} advertencias a revisar. Grado {grade}."
    elif vulnerable <= 2:
        return f"⚠️ {vulnerable} vulnerabilidad(es) encontrada(s). Requieren atención inmediata. Grado {grade}."
    else:
        return f"🚨 ALERTA: {vulnerable} vulnerabilidades encontradas. Sistema comprometido hasta corregirlas. Grado {grade}."


@router.post(
    "/run-audit",
    response_model=SecurityReport,
    summary="Ejecutar auditoría de seguridad completa",
    description=(
        "Lanza 17 ataques automatizados contra la propia aplicación. "
        "Solo accesible por admins. Los ataques son no destructivos — "
        "no modifican ni eliminan datos reales."
    ),
)
async def run_security_audit(
    request: Request,
    current_admin: _CurrentAdmin,
    db: AsyncSession = Depends(get_db),
) -> SecurityReport:
    # Reconstruir el token admin del header para usarlo en ataques que requieren auth
    auth_header = request.headers.get("authorization", "")
    admin_token = auth_header.replace("Bearer ", "").replace("bearer ", "").strip()

    base_url = _build_base_url(request)

    logger.warning(
        "SECURITY_LAB: Auditoría iniciada por admin %s desde %s",
        current_admin.get("sub", "unknown")[:8],
        request.client.host if request.client else "unknown",
    )

    results = await run_all_attacks(
        base_url=base_url,
        admin_token=admin_token,
        db=db,
    )

    blocked = sum(1 for r in results if r.status == AttackStatus.BLOCKED)
    vulnerable = sum(1 for r in results if r.status == AttackStatus.VULNERABLE)
    warning = sum(1 for r in results if r.status == AttackStatus.WARNING)
    skipped = sum(1 for r in results if r.status == AttackStatus.SKIPPED)

    score, grade = _calculate_score(results)
    summary = _build_summary(blocked, vulnerable, warning, len(results), grade)

    logger.warning(
        "SECURITY_LAB: Auditoría completada — score=%d grade=%s vulnerable=%d",
        score, grade, vulnerable,
    )

    return SecurityReport(
        total_attacks=len(results),
        blocked=blocked,
        vulnerable=vulnerable,
        warning=warning,
        skipped=skipped,
        score=score,
        grade=grade,
        results=results,
        summary=summary,
    )


@router.get(
    "/attacks",
    summary="Listar ataques disponibles",
    description="Devuelve la lista de ataques que se ejecutarán en la auditoría.",
)
async def list_attacks(current_admin: _CurrentAdmin) -> list[dict]:
    return [
        {"id": "A1", "name": "JWT Algorithm Confusion (RS256 → HS256)", "category": "Autenticación", "severity": "CRITICAL"},
        {"id": "A2", "name": "JWT 'none' Algorithm", "category": "Autenticación", "severity": "CRITICAL"},
        {"id": "A3", "name": "Replay de Token Expirado", "category": "Autenticación", "severity": "HIGH"},
        {"id": "B1", "name": "AES-GCM Nonce Reuse", "category": "Cifrado", "severity": "CRITICAL"},
        {"id": "B2", "name": "Master Key — Entropía y Configuración", "category": "Cifrado", "severity": "HIGH"},
        {"id": "B3", "name": "HKDF Separación de Contexto", "category": "Cifrado", "severity": "HIGH"},
        {"id": "C1", "name": "IDOR — Acceso a Registros de Otro Usuario", "category": "Control de Acceso", "severity": "HIGH"},
        {"id": "C2", "name": "Escalada de Privilegios — Endpoints Admin", "category": "Control de Acceso", "severity": "CRITICAL"},
        {"id": "D1", "name": "SQL Injection — Parámetros de Filtro", "category": "Inyección", "severity": "HIGH"},
        {"id": "D2", "name": "Mass Assignment — Auto-Promoción a Admin", "category": "Inyección", "severity": "HIGH"},
        {"id": "E1", "name": "Rate Limit Bypass — IP Spoofing", "category": "Rate Limiting", "severity": "HIGH"},
        {"id": "E2", "name": "Enumeración de Usuarios — Respuesta de Login", "category": "Rate Limiting", "severity": "MEDIUM"},
        {"id": "F1", "name": "PII en Prompts IA — RGPD Art. 9", "category": "Privacidad RGPD", "severity": "CRITICAL"},
        {"id": "F2", "name": "Pseudonimización AEPD — health_records sin user_id", "category": "Privacidad RGPD", "severity": "HIGH"},
        {"id": "G1", "name": "Security Headers — CSP, HSTS, X-Frame", "category": "Infraestructura", "severity": "MEDIUM"},
        {"id": "G2", "name": "CORS — Wildcard Origin", "category": "Infraestructura", "severity": "HIGH"},
        {"id": "G3", "name": "Reset Token — Query Param vs Fragmento URL", "category": "Infraestructura", "severity": "HIGH"},
    ]
