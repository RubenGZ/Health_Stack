"""
app/modules/security_lab/schemas.py
=====================================
Schemas para el módulo Security Lab — simulación de ataques Black Hat / White Hat.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel


class AttackStatus(str, Enum):
    BLOCKED = "BLOCKED"       # Ataque bloqueado correctamente — sistema seguro ✅
    VULNERABLE = "VULNERABLE"  # Ataque exitoso — vulnerabilidad real detectada ❌
    WARNING = "WARNING"        # Mitigado pero mejorable 🟡
    SKIPPED = "SKIPPED"        # No ejecutable en este entorno


class AttackSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


class AttackResult(BaseModel):
    id: str
    name: str
    category: str
    severity: AttackSeverity
    status: AttackStatus
    description: str           # Qué intentó el ataque
    finding: str               # Qué encontró (detalle técnico)
    recommendation: str        # Qué hacer si es VULNERABLE
    proof: dict[str, Any] | None = None   # Evidencia técnica (sin datos reales de usuarios)
    duration_ms: int = 0


class SecurityReport(BaseModel):
    total_attacks: int
    blocked: int
    vulnerable: int
    warning: int
    skipped: int
    score: int                 # 0-100
    grade: str                 # A, B, C, D, F
    results: list[AttackResult]
    summary: str
