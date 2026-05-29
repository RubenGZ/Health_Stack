"""
tests/integration/test_security_lab.py
========================================
Tests de integración para el Security Lab.

Verifica:
1. El endpoint /run-audit requiere autenticación admin
2. El endpoint retorna el schema correcto
3. El score calculado es coherente con los resultados
4. Ningún ataque retorna datos sensibles de usuarios reales
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


class TestSecurityLabAuth:
    """El Security Lab solo es accesible para admins."""

    async def test_run_audit_requires_auth(self, client: AsyncClient):
        resp = await client.post("/api/v1/security-lab/run-audit")
        assert resp.status_code == 401

    async def test_run_audit_requires_admin_role(
        self, client: AsyncClient, auth_headers: dict
    ):
        resp = await client.post(
            "/api/v1/security-lab/run-audit",
            headers=auth_headers,
        )
        assert resp.status_code == 403

    async def test_list_attacks_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get(
            "/api/v1/security-lab/attacks",
            headers=auth_headers,
        )
        assert resp.status_code == 403


class TestSecurityLabSchema:
    """El reporte de auditoría tiene el schema correcto."""

    async def test_list_attacks_returns_17_attacks(
        self, client: AsyncClient, admin_headers: dict
    ):
        resp = await client.get(
            "/api/v1/security-lab/attacks",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        attacks = resp.json()
        assert len(attacks) == 17

    async def test_run_audit_returns_valid_schema(
        self, client: AsyncClient, admin_headers: dict
    ):
        resp = await client.post(
            "/api/v1/security-lab/run-audit",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        report = resp.json()

        # Schema básico
        assert "total_attacks" in report
        assert "blocked" in report
        assert "vulnerable" in report
        assert "warning" in report
        assert "skipped" in report
        assert "score" in report
        assert "grade" in report
        assert "results" in report
        assert "summary" in report

        # Score coherente
        assert 0 <= report["score"] <= 100
        assert report["grade"] in ("A", "B", "C", "D", "F")

        # Totales coherentes
        total = report["blocked"] + report["vulnerable"] + report["warning"] + report["skipped"]
        assert total == report["total_attacks"]
        assert report["total_attacks"] == len(report["results"])

    async def test_run_audit_results_have_required_fields(
        self, client: AsyncClient, admin_headers: dict
    ):
        resp = await client.post(
            "/api/v1/security-lab/run-audit",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        report = resp.json()

        for result in report["results"]:
            assert "id" in result
            assert "name" in result
            assert "category" in result
            assert "severity" in result
            assert "status" in result
            assert "description" in result
            assert "finding" in result
            assert "recommendation" in result
            assert result["status"] in ("BLOCKED", "VULNERABLE", "WARNING", "SKIPPED")
            assert result["severity"] in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO")

    async def test_run_audit_no_sensitive_data_in_proof(
        self, client: AsyncClient, admin_headers: dict
    ):
        """Los campos proof no deben contener datos de usuarios (passwords, secrets, etc.)."""
        resp = await client.post(
            "/api/v1/security-lab/run-audit",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        report = resp.json()

        sensitive_patterns = ["password", "secret", "health_uuid_enc"]

        for result in report["results"]:
            proof_str = str(result.get("proof", ""))
            for pattern in sensitive_patterns:
                if pattern in proof_str.lower():
                    pytest.fail(
                        f"Dato sensible '{pattern}' encontrado en proof del ataque {result['id']}: {proof_str[:100]}"
                    )


class TestSecurityLabCriticalChecks:
    """Los ataques más importantes retornan BLOCKED en un sistema bien configurado."""

    async def test_jwt_algorithm_confusion_blocked(
        self, client: AsyncClient, admin_headers: dict
    ):
        """El ataque JWT HS256 debe estar bloqueado."""
        resp = await client.post(
            "/api/v1/security-lab/run-audit",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        report = resp.json()

        a1 = next((r for r in report["results"] if r["id"] == "A1"), None)
        assert a1 is not None, "Ataque A1 no encontrado"
        assert a1["status"] == "BLOCKED", f"JWT Algorithm Confusion no está bloqueado: {a1['finding']}"

    async def test_admin_escalation_blocked(
        self, client: AsyncClient, admin_headers: dict
    ):
        """Un usuario normal no puede acceder a endpoints admin."""
        resp = await client.post(
            "/api/v1/security-lab/run-audit",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        report = resp.json()

        c2 = next((r for r in report["results"] if r["id"] == "C2"), None)
        assert c2 is not None, "Ataque C2 no encontrado"
        assert c2["status"] == "BLOCKED", f"Admin escalation no está bloqueado: {c2['finding']}"

    async def test_master_key_configured(
        self, client: AsyncClient, admin_headers: dict
    ):
        """La HEALTH_LINK_MASTER_KEY debe estar configurada."""
        resp = await client.post(
            "/api/v1/security-lab/run-audit",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        report = resp.json()

        b2 = next((r for r in report["results"] if r["id"] == "B2"), None)
        assert b2 is not None, "Ataque B2 no encontrado"
        # En entorno de test el key puede ser de test — BLOCKED o SKIPPED son válidos
        assert b2["status"] in ("BLOCKED", "SKIPPED"), (
            f"Master key no configurada o débil: {b2['finding']}"
        )

    async def test_pseudonymization_correct(
        self, client: AsyncClient, admin_headers: dict
    ):
        """health_records no debe tener user_id directo."""
        resp = await client.post(
            "/api/v1/security-lab/run-audit",
            headers=admin_headers,
        )
        assert resp.status_code == 200
        report = resp.json()

        f2 = next((r for r in report["results"] if r["id"] == "F2"), None)
        assert f2 is not None, "Ataque F2 no encontrado"
        assert f2["status"] in ("BLOCKED", "SKIPPED"), (
            f"Pseudonimización incorrecta: {f2['finding']}"
        )
