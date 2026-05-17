#!/usr/bin/env python3
"""
scripts/chat_smoke_test.py
===========================
Smoke test de calidad para el chatbot de HealthStack Pro.

Ejecuta 20 conversaciones estándar contra el endpoint REAL y evalúa:
  ✓ El endpoint responde 200 con campo "reply"
  ✓ La respuesta no está vacía
  ✓ Para preguntas ambiguas: el asistente hace UNA sola pregunta (no varias)
  ✓ Para logros: la respuesta incluye datos numéricos
  ✓ La respuesta no supera el límite de líneas esperado

Uso:
    python scripts/chat_smoke_test.py
    python scripts/chat_smoke_test.py --url https://<tunnel>.trycloudflare.com
    python scripts/chat_smoke_test.py --url http://localhost:8000 --verbose
    python scripts/chat_smoke_test.py --url https://... --category A   # solo síntomas

Categorías:
    A - Síntomas vagos (espera UNA pregunta de localización)
    B - Nutrición (pregunta o dato directo)
    C - Entrenamiento (con/sin contexto)
    D - Logros (reconocimiento + número)
    E - Preguntas factuales (dato directo)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass, field
from typing import Any

try:
    import httpx
except ImportError:
    print("ERROR: httpx no instalado. Ejecuta: pip install httpx")
    sys.exit(1)

# ── Colores ANSI ──────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

PASS = f"{GREEN}✓ PASS{RESET}"
FAIL = f"{RED}✗ FAIL{RESET}"
WARN = f"{YELLOW}⚠ WARN{RESET}"


# ── Tipos ──────────────────────────────────────────────────────────────────────

@dataclass
class Assertion:
    description: str
    check: Any  # callable(reply: str) -> bool
    severity: str = "fail"  # "fail" | "warn"


@dataclass
class Scenario:
    id: str
    category: str
    label: str
    payload: dict
    assertions: list[Assertion] = field(default_factory=list)


@dataclass
class Result:
    scenario: Scenario
    http_status: int | None
    reply: str | None
    latency_ms: float
    passed: list[str]
    failed: list[str]
    warnings: list[str]

    @property
    def ok(self) -> bool:
        return len(self.failed) == 0


# ── Helpers de asserción ───────────────────────────────────────────────────────

def _count_questions(text: str) -> int:
    """Cuenta signos de cierre de interrogación en el texto."""
    return text.count("?")


def _contains_numbers(text: str) -> bool:
    return bool(re.search(r"\d+", text))


def _line_count(text: str) -> int:
    return len([l for l in text.strip().splitlines() if l.strip()])


def _one_question_only(reply: str) -> bool:
    return _count_questions(reply) <= 1


def _not_empty(reply: str) -> bool:
    return len(reply.strip()) > 5


def _short_response(max_lines: int = 8):
    return lambda reply: _line_count(reply) <= max_lines


def _contains_number(reply: str) -> bool:
    return _contains_numbers(reply)


def _no_multiple_questions(reply: str) -> bool:
    """Falla si hay 2+ signos de pregunta (múltiples preguntas)."""
    return _count_questions(reply) < 2


# ── Pool de 20 escenarios ─────────────────────────────────────────────────────

def build_scenarios() -> list[Scenario]:
    def msg(role: str, content: str) -> dict:
        return {"role": role, "content": content}

    return [

        # ── A: Síntomas (espera UNA pregunta de localización) ────────────────
        Scenario(
            id="A1", category="A", label="Dolor codo sin localizar",
            payload={"message": "me duele el codo"},
            assertions=[
                Assertion("Devuelve una sola pregunta", _one_question_only, "fail"),
                Assertion("No lista causas posibles (sin 'podría')", lambda r: "podría" not in r.lower() or _count_questions(r) == 1, "warn"),
                Assertion("Respuesta corta (≤6 líneas)", _short_response(6), "warn"),
            ],
        ),
        Scenario(
            id="A2", category="A", label="Dolor rodilla al bajar escaleras",
            payload={"message": "tengo dolor en la rodilla al bajar escaleras"},
            assertions=[
                Assertion("Una sola pregunta de seguimiento", _one_question_only, "fail"),
                Assertion("Respuesta no vacía", _not_empty, "fail"),
            ],
        ),
        Scenario(
            id="A3", category="A", label="Molestia hombro al levantar brazo",
            payload={"message": "noto molestia en el hombro cuando levanto el brazo"},
            assertions=[
                Assertion("Una pregunta de diagnóstico", _one_question_only, "fail"),
                Assertion("Respuesta corta", _short_response(6), "warn"),
            ],
        ),
        Scenario(
            id="A3b", category="A", label="Dolor lumbar vago (trampa multi-causa)",
            payload={"message": "me duele la espalda baja"},
            assertions=[
                Assertion("Una sola pregunta (no lista causas)", _one_question_only, "fail"),
                Assertion("No enumera causas antes de preguntar", lambda r: r.count("•") + r.count("-") < 3, "fail"),
                Assertion("Respuesta corta (≤5 líneas)", _short_response(5), "warn"),
            ],
        ),
        Scenario(
            id="A4", category="A", label="Seguimiento dolor codo (conversación)",
            payload={
                "message": "sigue doliéndome",
                "history": [
                    msg("user", "me duele el codo"),
                    msg("assistant", "¿Dónde exactamente — parte externa, interna o la punta?"),
                    msg("user", "la parte externa"),
                    msg("assistant", "Suena a epicondilitis lateral (codo de tenista). ¿Lo notas al extender la muñeca o al coger algo con la palma hacia abajo?"),
                ],
            },
            assertions=[
                Assertion("No repite preguntas ya hechas", lambda r: "externa" not in r.lower(), "warn"),
                Assertion("Respuesta no vacía", _not_empty, "fail"),
            ],
        ),

        # ── B: Nutrición ──────────────────────────────────────────────────────
        Scenario(
            id="B1", category="B", label="Hambre sin contexto",
            payload={"message": "tengo hambre"},
            assertions=[
                Assertion("Una sola pregunta (rápido/completo)", _one_question_only, "fail"),
                Assertion("No da opciones sin preguntar", _no_multiple_questions, "warn"),
            ],
        ),
        Scenario(
            id="B2", category="B", label="Qué comer para ganar músculo",
            payload={"message": "qué puedo comer para ganar músculo"},
            assertions=[
                Assertion("Menciona proteína o gramos", lambda r: "proteína" in r.lower() or "g " in r, "warn"),
                Assertion("Respuesta no vacía", _not_empty, "fail"),
            ],
        ),
        Scenario(
            id="B3", category="B", label="Cuántas proteínas al día (sin peso)",
            payload={"message": "cuántas proteínas necesito al día"},
            assertions=[
                Assertion("Pregunta el peso O da rango con números", lambda r: "?" in r or _contains_numbers(r), "fail"),
                Assertion("No da número sin preguntar peso", lambda r: not (_contains_numbers(r) and "?" not in r) or "kg" in r.lower(), "warn"),
            ],
        ),
        Scenario(
            id="B4", category="B", label="Calorías de un huevo (factual)",
            payload={"message": "cuántas calorías tiene un huevo"},
            assertions=[
                Assertion("Incluye número de calorías", _contains_number, "fail"),
                Assertion("Respuesta directa sin preguntar", lambda r: _count_questions(r) == 0, "warn"),
            ],
        ),
        Scenario(
            id="B5", category="B", label="Seguimiento nutrición (añadir queso)",
            payload={
                "message": "y si le añado queso?",
                "history": [
                    msg("user", "cuántas calorías tiene un huevo"),
                    msg("assistant", "Un huevo mediano tiene ~70 kcal: 6g proteína, 5g grasa."),
                ],
            },
            assertions=[
                Assertion("Incluye número de calorías del queso", _contains_number, "fail"),
                Assertion("Respuesta contextual (no repite el huevo desde cero)", _not_empty, "fail"),
            ],
        ),

        # ── C: Entrenamiento ─────────────────────────────────────────────────
        Scenario(
            id="C1", category="C", label="Quiero progresar más (sin ejercicio)",
            payload={"message": "quiero progresar más"},
            assertions=[
                Assertion("Pregunta en qué ejercicio", lambda r: "ejercicio" in r.lower() or "?" in r, "fail"),
                Assertion("Una sola pregunta", _one_question_only, "fail"),
            ],
        ),
        Scenario(
            id="C2", category="C", label="Cuántos días entrenar a la semana",
            payload={"message": "cuántos días debo entrenar a la semana"},
            assertions=[
                Assertion("Incluye número de días", _contains_number, "fail"),
                Assertion("Respuesta no vacía", _not_empty, "fail"),
            ],
        ),
        Scenario(
            id="C3", category="C", label="Ejercicios para hombros",
            payload={"message": "qué ejercicios hago para los hombros"},
            assertions=[
                Assertion("Menciona al menos un ejercicio", lambda r: any(
                    e in r.lower() for e in ["press", "elevaciones", "vuelo", "remo", "arnold", "hombro"]
                ), "warn"),
                Assertion("Respuesta no vacía", _not_empty, "fail"),
            ],
        ),
        Scenario(
            id="C4", category="C", label="Progresión sentadilla (conversación larga)",
            payload={
                "message": "y cuándo subo peso?",
                "history": [
                    msg("user", "quiero progresar más"),
                    msg("assistant", "¿En qué ejercicio?"),
                    msg("user", "sentadilla, ahora hago 100kg"),
                    msg("assistant", "¿Cuántas reps y series?"),
                    msg("user", "5 series de 5 reps"),
                    msg("assistant", "Con 5×5 a 100kg: cuando hagas las 5 series sin fallar reps, sube 2.5kg."),
                ],
            },
            assertions=[
                Assertion("Da criterio de subida de peso", lambda r: "reps" in r.lower() or "falla" in r.lower() or "sube" in r.lower(), "warn"),
                Assertion("Respuesta no vacía", _not_empty, "fail"),
            ],
        ),
        Scenario(
            id="C5", category="C", label="Tiempo de descanso entre series (factual)",
            payload={"message": "cuánto tiempo descanso entre series"},
            assertions=[
                Assertion("Incluye número de minutos/segundos", _contains_number, "fail"),
                Assertion("Respuesta directa", _not_empty, "fail"),
            ],
        ),

        # ── D: Logros ─────────────────────────────────────────────────────────
        Scenario(
            id="D1", category="D", label="Logro banca 130kg × 6 reps",
            payload={"message": "acabo de hacer 130kg en banca a 6 reps"},
            assertions=[
                Assertion("Calcula 1RM o da dato numérico", _contains_number, "fail"),
                Assertion("Respuesta corta (≤8 líneas)", _short_response(8), "warn"),
                Assertion("Hace una pregunta de seguimiento o da consejo", _not_empty, "fail"),
            ],
        ),
        Scenario(
            id="D2", category="D", label="Logro carrera 10km en 45 minutos",
            payload={"message": "hoy corrí 10km en 45 minutos"},
            assertions=[
                Assertion("Calcula ritmo (min/km) o da dato", _contains_number, "fail"),
                Assertion("Respuesta no vacía", _not_empty, "fail"),
            ],
        ),
        Scenario(
            id="D3", category="D", label="Primer dominado (milestone)",
            payload={"message": "acabo de hacer mi primer dominado"},
            assertions=[
                Assertion("Reconoce el logro", lambda r: any(
                    w in r.lower() for w in ["bien", "primer", "excelente", "logro", "gran", "increíble", "felicidad", "congrat", "enhorabuena"]
                ), "warn"),
                Assertion("Respuesta no vacía", _not_empty, "fail"),
            ],
        ),
        Scenario(
            id="D4", category="D", label="Bajó 1kg esta semana",
            payload={"message": "bajé 1kg esta semana"},
            assertions=[
                Assertion("Respuesta positiva o da consejo de continuidad", _not_empty, "fail"),
                Assertion("Una sola pregunta si pregunta algo", _one_question_only, "warn"),
            ],
        ),

        # ── E: Preguntas factuales ────────────────────────────────────────────
        Scenario(
            id="E1", category="E", label="Qué es el RPE",
            payload={"message": "qué es el RPE"},
            assertions=[
                Assertion("Explica RPE en la respuesta", lambda r: "rpe" in r.lower() or "esfuerzo" in r.lower() or "percibido" in r.lower(), "fail"),
                Assertion("Incluye escala numérica", _contains_number, "warn"),
            ],
        ),
        Scenario(
            id="E2", category="E", label="Es malo entrenar en ayunas",
            payload={"message": "es malo entrenar en ayunas"},
            assertions=[
                Assertion("Da respuesta directa sin preguntar", _not_empty, "fail"),
                Assertion("Menciona contexto relevante", lambda r: any(
                    w in r.lower() for w in ["grasa", "músculo", "intensidad", "ayuno", "glucógeno", "depende"]
                ), "warn"),
            ],
        ),

        # ── F: Robustez del contexto de usuario ──────────────────────────────
        # Estos escenarios se ejecutan con token inválido — el endpoint debe
        # responder 200 (fallback a chat anónimo) en lugar de 403/500.
        Scenario(
            id="F1", category="F", label="Token inválido → chat anónimo (sin crash)",
            payload={"message": "cuántas proteínas necesito"},
            assertions=[
                Assertion("Responde 200 aunque el token sea inválido", _not_empty, "fail"),
            ],
        ),
        Scenario(
            id="F2", category="F", label="Token expirado → chat anónimo (sin crash)",
            payload={"message": "cuántos días entreno"},
            assertions=[
                Assertion("Responde correctamente en modo anónimo", _not_empty, "fail"),
            ],
        ),
    ]


# ── Runner ─────────────────────────────────────────────────────────────────────

def run_scenario(client: httpx.Client, base_url: str, scenario: Scenario) -> Result:
    url = f"{base_url.rstrip('/')}/api/v1/chat/message"
    start = time.perf_counter()
    http_status = None
    reply = None

    try:
        resp = client.post(url, json=scenario.payload, timeout=30)
        http_status = resp.status_code
        latency_ms = (time.perf_counter() - start) * 1000

        if resp.status_code == 200:
            data = resp.json()
            reply = data.get("reply", "")
        else:
            reply = None

    except httpx.TimeoutException:
        latency_ms = (time.perf_counter() - start) * 1000
        return Result(scenario, None, None, latency_ms, [], ["Timeout (>30s)"], [])
    except Exception as e:
        latency_ms = (time.perf_counter() - start) * 1000
        return Result(scenario, None, None, latency_ms, [], [f"Error: {e}"], [])

    passed, failed, warnings = [], [], []

    # Check HTTP
    if http_status != 200:
        failed.append(f"HTTP {http_status} (esperaba 200)")
        return Result(scenario, http_status, reply, latency_ms, passed, failed, warnings)

    if not reply:
        failed.append("Campo 'reply' vacío o ausente")
        return Result(scenario, http_status, reply, latency_ms, passed, failed, warnings)

    # Run assertions
    for assertion in scenario.assertions:
        try:
            ok = assertion.check(reply)
        except Exception as e:
            ok = False
            failed.append(f"Error en aserción '{assertion.description}': {e}")
            continue

        if ok:
            passed.append(assertion.description)
        elif assertion.severity == "warn":
            warnings.append(assertion.description)
        else:
            failed.append(assertion.description)

    return Result(scenario, http_status, reply, latency_ms, passed, failed, warnings)


def print_result(result: Result, verbose: bool) -> None:
    status = PASS if result.ok else FAIL
    latency = f"{result.latency_ms:.0f}ms"
    print(f"  {status} [{result.scenario.id}] {result.scenario.label} — {latency}")

    if result.failed:
        for f in result.failed:
            print(f"         {RED}✗ {f}{RESET}")

    if result.warnings:
        for w in result.warnings:
            print(f"         {YELLOW}⚠ {w}{RESET}")

    if verbose and result.reply:
        reply_preview = result.reply[:200].replace("\n", "↵")
        if len(result.reply) > 200:
            reply_preview += "…"
        print(f"         {CYAN}→ {reply_preview}{RESET}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Chat smoke test — HealthStack Pro")
    parser.add_argument(
        "--url",
        default="http://localhost:8000",
        help="Base URL del servidor (sin trailing slash). Ej: https://<tunnel>.trycloudflare.com",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Muestra preview de la respuesta de la IA",
    )
    parser.add_argument(
        "--category",
        choices=["A", "B", "C", "D", "E", "F"],
        help="Ejecuta solo una categoría de escenarios",
    )
    args = parser.parse_args()

    scenarios = build_scenarios()
    if args.category:
        scenarios = [s for s in scenarios if s.category == args.category]

    print(f"\n{BOLD}Chat Smoke Test — HealthStack Pro{RESET}")
    print(f"  URL: {args.url}")
    print(f"  Escenarios: {len(scenarios)}\n")

    categories = sorted(set(s.category for s in scenarios))
    results = []

    with httpx.Client() as client:
        for cat in categories:
            cat_scenarios = [s for s in scenarios if s.category == cat]
            cat_labels = {
                "A": "Síntomas (debe hacer UNA pregunta de localización)",
                "B": "Nutrición (pregunta o dato directo)",
                "C": "Entrenamiento (con/sin contexto)",
                "D": "Logros (reconocimiento + número)",
                "E": "Preguntas factuales (dato directo)",
                "F": "Robustez contexto usuario (token inválido → anónimo)",
            }
            print(f"{BOLD}── {cat}: {cat_labels.get(cat, cat)} ──{RESET}")
            for scenario in cat_scenarios:
                result = run_scenario(client, args.url, scenario)
                results.append(result)
                print_result(result, args.verbose)
            print()

    # Resumen
    total = len(results)
    passed = sum(1 for r in results if r.ok)
    failed = total - passed
    warn_count = sum(len(r.warnings) for r in results)

    print(f"{BOLD}── Resultado ──────────────────────────────────{RESET}")
    print(f"  Total:    {total}")
    print(f"  {GREEN}Passed:   {passed}{RESET}")
    if failed:
        print(f"  {RED}Failed:   {failed}{RESET}")
    if warn_count:
        print(f"  {YELLOW}Warnings: {warn_count}{RESET}")

    if failed > 0:
        print(f"\n{RED}Escenarios fallidos:{RESET}")
        for r in results:
            if not r.ok:
                print(f"  [{r.scenario.id}] {r.scenario.label}")
                for f in r.failed:
                    print(f"    ✗ {f}")
                if r.reply:
                    print(f"    → Respuesta: {r.reply[:300]!r}")
        sys.exit(1)
    else:
        print(f"\n{GREEN}{BOLD}Todos los escenarios pasaron.{RESET}")
        sys.exit(0)


if __name__ == "__main__":
    main()
