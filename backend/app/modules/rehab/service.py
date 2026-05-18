"""
app/modules/rehab/service.py
==============================
Lógica de negocio del módulo de rehabilitación.

Freemium logic:
    - Free:  Devuelve un protocolo estático predefinido basado en injury_type + body_area.
    - Pro:   Genera un protocolo personalizado vía AIRouter (Groq / Gemini fallback).

AVISO: Los protocolos son orientativos. Ver REHAB_DISCLAIMER en schemas.py.
"""

from __future__ import annotations

import json
import logging

from app.modules.rehab.schemas import (
    REHAB_DISCLAIMER,
    BodyArea,
    InjuryType,
    RehabExercise,
    RehabPhase,
    RehabProtocolRequest,
    RehabProtocolResponse,
)

logger = logging.getLogger(__name__)


# ── Presets estáticos (tier free) ─────────────────────────────────────────────
# Protocolo por (injury_type, body_area) — cobertura de las combinaciones más comunes.
# Si no hay preset exacto se usa el más cercano (mismo body_area o mismo injury_type).

_PRESETS: dict[tuple[str, str], RehabProtocolResponse] = {}


def _preset(injury: str, area: str, title: str, phases: list[RehabPhase],
            advice: str, red_flags: list[str]) -> RehabProtocolResponse:
    r = RehabProtocolResponse(
        title=title,
        injury_type=injury,
        body_area=area,
        tier="free",
        is_ai_generated=False,
        phases=phases,
        general_advice=advice,
        red_flags=red_flags,
    )
    _PRESETS[(injury, area)] = r
    return r


# ── RODILLA — tendinopatía ─────────────────────────────────────────────────────
_preset(
    injury="tendinopathy", area="knee",
    title="Protocolo Tendinopatía Patelar (Rodilla de Saltador)",
    phases=[
        RehabPhase(
            phase_name="Fase 1 — Control del dolor (semanas 1-2)",
            duration_weeks=2,
            goal="Reducir la carga en el tendón y el dolor agudo.",
            precautions=["Evitar ejercicios que reproduzcan el dolor > 4/10.",
                         "Sin impacto ni saltos."],
            exercises=[
                RehabExercise(name="Isométrico de cuádriceps en pared",
                              description="Mantén la posición de sentadilla media contra la pared.",
                              sets=4, reps="45 segundos", rest_seconds=120,
                              frequency_per_week=5),
                RehabExercise(name="Estiramiento suave de cuádriceps",
                              description="De pie, dobla la rodilla hacia los glúteos sin forzar.",
                              sets=3, reps="30 segundos", rest_seconds=30,
                              frequency_per_week=7),
            ],
        ),
        RehabPhase(
            phase_name="Fase 2 — Carga progresiva (semanas 3-6)",
            duration_weeks=4,
            goal="Recuperar fuerza excéntrica del cuádriceps.",
            precautions=["Dolor máximo 3/10 durante el ejercicio.",
                         "Aumenta carga solo si el dolor no empeora al día siguiente."],
            exercises=[
                RehabExercise(name="Sentadilla isométrica en pared (carga incrementada)",
                              description="Aumenta el ángulo de rodilla a 60-70°.",
                              sets=4, reps="60 segundos", rest_seconds=120,
                              frequency_per_week=4,
                              progression_note="Avanza al siguiente ejercicio si el dolor es < 2/10."),
                RehabExercise(name="Extensión excéntrica en máquina (o con peso corporal)",
                              description="Baja lentamente (4 segundos) desde extensión completa a 60°.",
                              sets=3, reps="15", rest_seconds=90,
                              frequency_per_week=3),
            ],
        ),
        RehabPhase(
            phase_name="Fase 3 — Retorno funcional (semanas 7-12)",
            duration_weeks=6,
            goal="Recuperar potencia y retornar a la actividad deportiva.",
            precautions=["Introduce saltos de baja intensidad progresivamente.",
                         "Consulta con fisioterapeuta antes de retomar impacto completo."],
            exercises=[
                RehabExercise(name="Sentadilla búlgara con peso corporal",
                              description="Eleva el pie trasero en un escalón; mantén la rodilla alineada.",
                              sets=3, reps="12", rest_seconds=60, frequency_per_week=3),
                RehabExercise(name="Saltos verticales de baja altura (box jumps bajos)",
                              description="Cajón de 20-30 cm; aterrizaje suave absorbiendo con rodilla.",
                              sets=3, reps="8", rest_seconds=90, frequency_per_week=2,
                              progression_note="Solo si el dolor es 0/10 en fases anteriores."),
            ],
        ),
    ],
    advice=(
        "Aplica hielo 10-15 min tras el ejercicio si hay molestias. "
        "La tendinopatía patelar responde mejor a la carga progresiva que al reposo absoluto. "
        "La constancia (≥ 3 días/semana) es más importante que la intensidad."
    ),
    red_flags=[
        "Dolor repentino y muy intenso tras un esfuerzo — posible rotura.",
        "Inflamación significativa, calor o enrojecimiento — descartar infección.",
        "Bloqueo articular o sensación de 'click' con dolor — consultar ortopedia.",
    ],
)

# ── HOMBRO — tendinopatía ──────────────────────────────────────────────────────
_preset(
    injury="tendinopathy", area="shoulder",
    title="Protocolo Tendinopatía de Manguito Rotador (Hombro)",
    phases=[
        RehabPhase(
            phase_name="Fase 1 — Reducción del dolor (semanas 1-3)",
            duration_weeks=3,
            goal="Controlar el dolor y recuperar el rango de movimiento básico.",
            precautions=["Evitar elevar el brazo por encima del hombro con carga.",
                         "Movimientos suaves, sin dolor > 4/10."],
            exercises=[
                RehabExercise(name="Péndulo de Codman",
                              description="Inclínate hacia delante y deja colgar el brazo; realiza círculos pequeños.",
                              sets=3, reps="30 segundos cada dirección", rest_seconds=30,
                              frequency_per_week=7),
                RehabExercise(name="Rotación externa isométrica con pared",
                              description="Codo a 90°, empuja el dorso de la mano contra la pared sin mover el brazo.",
                              sets=3, reps="10 segundos", rest_seconds=20, frequency_per_week=5),
            ],
        ),
        RehabPhase(
            phase_name="Fase 2 — Fortalecimiento (semanas 4-8)",
            duration_weeks=5,
            goal="Recuperar fuerza del manguito rotador y estabilizadores escapulares.",
            precautions=["Usa banda elástica de resistencia baja para comenzar."],
            exercises=[
                RehabExercise(name="Rotación externa con banda elástica",
                              description="Codo pegado al cuerpo a 90°, lleva la mano hacia fuera lentamente.",
                              sets=3, reps="15", rest_seconds=60, frequency_per_week=4),
                RehabExercise(name="Remo en W con banda",
                              description="Desde hombros elevados, baja escápulas y lleva codos atrás formando W.",
                              sets=3, reps="12", rest_seconds=60, frequency_per_week=3),
            ],
        ),
        RehabPhase(
            phase_name="Fase 3 — Integración funcional (semanas 9-14)",
            duration_weeks=6,
            goal="Retornar a la actividad normal / deportiva con hombro estable.",
            precautions=["Progresa la carga de forma gradual.",
                         "Consulta antes de retomar press de banca o ejercicios overhead."],
            exercises=[
                RehabExercise(name="Press de hombro con mancuerna ligera (90° de abducción)",
                              description="Posición neutra de codo; evita arco lumbar.",
                              sets=3, reps="12", rest_seconds=60, frequency_per_week=3),
                RehabExercise(name="Plancha con rotación (thread the needle)",
                              description="Desde plancha, lleva un brazo por debajo girando el torso.",
                              sets=3, reps="8 cada lado", rest_seconds=60, frequency_per_week=3),
            ],
        ),
    ],
    advice=(
        "La postura es fundamental en tendinopatías de hombro. "
        "Corrige la posición escapular en tu escritorio. "
        "Evita dormir apoyado sobre el hombro afectado."
    ),
    red_flags=[
        "Pérdida súbita de fuerza con dolor agudo — posible rotura completa.",
        "Fiebre con dolor articular — consultar médico urgente.",
        "Hormigueo que baja por el brazo — posible compresión nerviosa cervical.",
    ],
)

# ── LUMBAR — sobrecarga ────────────────────────────────────────────────────────
_preset(
    injury="overuse", area="lower_back",
    title="Protocolo Lumbalgia por Sobrecarga",
    phases=[
        RehabPhase(
            phase_name="Fase 1 — Manejo agudo (semanas 1-2)",
            duration_weeks=2,
            goal="Reducir el espasmo y recuperar movilidad básica.",
            precautions=["Evitar flexiones de tronco con carga.",
                         "Reposo relativo — el movimiento suave es mejor que el reposo total."],
            exercises=[
                RehabExercise(name="Rodillas al pecho alternadas (single knee-to-chest)",
                              description="Túmbate boca arriba, lleva una rodilla al pecho suavemente.",
                              sets=3, reps="10 cada lado", rest_seconds=30, frequency_per_week=7),
                RehabExercise(name="Puente de glúteos (glute bridge)",
                              description="Desde tumbado, eleva caderas apoyando pies en el suelo.",
                              sets=3, reps="12", rest_seconds=45, frequency_per_week=5),
                RehabExercise(name="Marcha en el sitio (caminata suave)",
                              description="10-20 minutos de caminata a ritmo cómodo.",
                              sets=1, reps="10-20 minutos", frequency_per_week=7),
            ],
        ),
        RehabPhase(
            phase_name="Fase 2 — Estabilización del core (semanas 3-6)",
            duration_weeks=4,
            goal="Activar la musculatura estabilizadora profunda del tronco.",
            precautions=["Mantén la columna en posición neutra durante los ejercicios."],
            exercises=[
                RehabExercise(name="Bird-dog",
                              description="A cuatro patas, extiende brazo y pierna opuestos manteniendo la espalda plana.",
                              sets=3, reps="10 cada lado", rest_seconds=45, frequency_per_week=4),
                RehabExercise(name="Plancha abdominal",
                              description="Apóyate en antebrazos y pies, mantén cuerpo recto.",
                              sets=3, reps="30 segundos", rest_seconds=60, frequency_per_week=4,
                              progression_note="Avanza a 45-60 segundos si no hay dolor."),
                RehabExercise(name="Dead bug",
                              description="Boca arriba con rodillas a 90°, baja brazo y pierna opuestos sin arquear la espalda.",
                              sets=3, reps="8 cada lado", rest_seconds=45, frequency_per_week=4),
            ],
        ),
        RehabPhase(
            phase_name="Fase 3 — Carga funcional (semanas 7-12)",
            duration_weeks=6,
            goal="Recuperar la capacidad de carga y prevenir recaídas.",
            precautions=["Introduce sentadilla y peso muerto solo con técnica correcta.",
                         "Prioriza la progresión de carga lenta."],
            exercises=[
                RehabExercise(name="Sentadilla goblet",
                              description="Con un peso delante del pecho, sentadilla profunda con espalda neutra.",
                              sets=3, reps="12", rest_seconds=60, frequency_per_week=3),
                RehabExercise(name="Peso muerto rumano con mancuernas",
                              description="Bisagra de cadera manteniendo espalda neutra; baja hasta sentir isquios.",
                              sets=3, reps="10", rest_seconds=75, frequency_per_week=2,
                              progression_note="Incrementa peso en 2-2.5 kg cada semana si el dolor es 0/10."),
            ],
        ),
    ],
    advice=(
        "El reposo prolongado empeora la lumbalgia. "
        "Muévete con frecuencia: levántate cada 45-60 minutos si trabajas sentado. "
        "El sueño de calidad y la gestión del estrés son parte del tratamiento."
    ),
    red_flags=[
        "Pérdida de control de vejiga o intestino — urgencias inmediatas (síndrome de cola de caballo).",
        "Dolor que irradia por debajo de la rodilla con entumecimiento — posible hernia discal con compresión.",
        "Fiebre con dolor lumbar — descartar espondilodiscitis.",
        "Dolor nocturno que no cede en reposo — consultar médico para descartar causa orgánica.",
    ],
)

# ── TOBILLO — esguince ────────────────────────────────────────────────────────
_preset(
    injury="joint_sprain", area="ankle",
    title="Protocolo Esguince de Tobillo (Ligamento Lateral)",
    phases=[
        RehabPhase(
            phase_name="Fase 1 — PRICE (días 1-5)",
            duration_weeks=1,
            goal="Controlar la inflamación y proteger el tejido dañado.",
            precautions=["Reposo relativo: evita apoyar peso si el dolor es > 6/10.",
                         "Aplica frío 15-20 min cada 2-3 horas las primeras 48 h."],
            exercises=[
                RehabExercise(name="Movimientos de tobillo sentado (ABCD)",
                              description="Dibuja las letras del abecedario con el pie sin apoyar carga.",
                              sets=3, reps="Alfabeto completo", frequency_per_week=7),
            ],
        ),
        RehabPhase(
            phase_name="Fase 2 — Recuperación funcional (semanas 1-3)",
            duration_weeks=3,
            goal="Recuperar el rango de movimiento y comenzar la carga controlada.",
            precautions=["Carga progresiva según tolerancia al dolor."],
            exercises=[
                RehabExercise(name="Elevaciones de talón en pared",
                              description="Apoyado en la pared, sube y baja sobre la punta de los pies.",
                              sets=3, reps="15", rest_seconds=60, frequency_per_week=5),
                RehabExercise(name="Equilibrio en un pie",
                              description="Mantente sobre el pie lesionado; con ojos cerrados para progresar.",
                              sets=3, reps="30 segundos", rest_seconds=30, frequency_per_week=5,
                              progression_note="Añade superficie inestable (cojín/bosu) en semana 2."),
            ],
        ),
        RehabPhase(
            phase_name="Fase 3 — Propiocepción y retorno deportivo (semanas 4-8)",
            duration_weeks=5,
            goal="Recuperar la estabilidad dinámica y retornar a la actividad deportiva.",
            precautions=["El retorno a deportes de impacto debe ser gradual.",
                         "Considera usar vendaje funcional o tobillera al principio."],
            exercises=[
                RehabExercise(name="Saltos laterales en un pie",
                              description="Salta lateralmente a una caja pequeña y aterriza con control.",
                              sets=3, reps="8 cada lado", rest_seconds=60, frequency_per_week=3),
                RehabExercise(name="Carrera en línea recta progresiva",
                              description="Comienza al 50% de velocidad y progresa semanalmente.",
                              sets=1, reps="10-15 min", frequency_per_week=3),
            ],
        ),
    ],
    advice=(
        "Los esguinces de tobillo tienen alta tasa de recurrencia si no se trabaja la propiocepción. "
        "No abandones la rehabilitación cuando el dolor desaparece — completa las fases."
    ),
    red_flags=[
        "Incapacidad total de apoyar peso — descartar fractura (criterios de Ottawa).",
        "Deformidad visible del tobillo.",
        "Ausencia de pulso o entumecimiento distal — urgencias.",
    ],
)

# ── Fallback genérico ──────────────────────────────────────────────────────────
_GENERIC_PRESET = RehabProtocolResponse(
    title="Protocolo General de Recuperación",
    injury_type="general_pain",
    body_area="lower_back",
    tier="free",
    is_ai_generated=False,
    phases=[
        RehabPhase(
            phase_name="Fase 1 — Manejo conservador (semanas 1-2)",
            duration_weeks=2,
            goal="Reducir el dolor y mantener la movilidad.",
            precautions=["Evitar actividades que aumenten el dolor más de 3/10."],
            exercises=[
                RehabExercise(name="Caminata suave",
                              description="20-30 minutos de caminata a ritmo cómodo.",
                              sets=1, reps="20-30 minutos", frequency_per_week=5),
                RehabExercise(name="Movilidad articular suave",
                              description="Movimientos lentos y controlados de la zona afectada dentro del rango indoloro.",
                              sets=3, reps="10 cada dirección", frequency_per_week=7),
            ],
        ),
        RehabPhase(
            phase_name="Fase 2 — Fortalecimiento básico (semanas 3-8)",
            duration_weeks=6,
            goal="Fortalecer la musculatura de soporte y prevenir recaídas.",
            precautions=["Consulta a un fisioterapeuta para un protocolo personalizado."],
            exercises=[
                RehabExercise(name="Ejercicios de estabilización core",
                              description="Plancha, bird-dog y puente de glúteos.",
                              sets=3, reps="10-15", rest_seconds=60, frequency_per_week=3),
            ],
        ),
    ],
    general_advice=(
        "Para un plan personalizado a tu lesión específica, considera actualizar a HealthStack Pro. "
        "Un fisioterapeuta puede diseñar un protocolo adaptado a tu caso concreto."
    ),
    red_flags=[
        "Empeoramiento progresivo del dolor.",
        "Síntomas neurológicos: entumecimiento, hormigueo o pérdida de fuerza.",
        "Fiebre asociada al dolor.",
    ],
)


# ── Service ────────────────────────────────────────────────────────────────────

class RehabService:
    """Servicio de rehabilitación — stateless."""

    @staticmethod
    def get_static_protocol(request: RehabProtocolRequest) -> RehabProtocolResponse:
        """
        Devuelve el protocolo estático más apropiado para el tier free.
        Estrategia: primero busca (injury_type, body_area) exacto;
        si no existe, busca solo por body_area; si tampoco, devuelve el genérico.
        """
        key = (request.injury_type, request.body_area)
        if key in _PRESETS:
            return _PRESETS[key]

        # Fallback por body_area
        for (inj, area), preset in _PRESETS.items():
            if area == request.body_area:
                return preset

        # Fallback por injury_type
        for (inj, area), preset in _PRESETS.items():
            if inj == request.injury_type:
                return preset

        return _GENERIC_PRESET

    @staticmethod
    async def generate_ai_protocol(
        request: RehabProtocolRequest,
        ai_router,
        user_context: dict,
    ) -> RehabProtocolResponse:
        """
        Genera un protocolo personalizado vía AIRouter (tier pro).
        Si la llamada a IA falla, hace fallback al preset estático.
        """
        pain_desc = f"{request.pain_level}/10"
        weeks_desc = (
            "lesión reciente (< 1 semana)"
            if request.weeks_since_injury == 0
            else f"{request.weeks_since_injury} semanas desde la lesión"
        )

        area_labels = {
            "shoulder": "hombro", "elbow": "codo", "wrist": "muñeca",
            "lower_back": "zona lumbar", "hip": "cadera", "knee": "rodilla",
            "ankle": "tobillo", "neck": "cuello", "thoracic": "zona torácica",
        }
        injury_labels = {
            "tendinopathy": "tendinopatía / tendinitis",
            "muscle_strain": "desgarro o rotura muscular parcial",
            "joint_sprain": "esguince articular",
            "overuse": "sobrecarga por uso repetitivo",
            "post_surgery": "rehabilitación post-quirúrgica",
            "general_pain": "dolor inespecífico",
        }

        user_sex   = user_context.get("biological_sex", "no especificado")
        user_level = user_context.get("gamification_level", "N/A")
        user_goal  = user_context.get("primary_fitness_goal", "no especificado")

        system_prompt = (
            "Eres un fisioterapeuta deportivo experto. "
            "Genera protocolos de rehabilitación progresivos, basados en evidencia y seguros. "
            "SIEMPRE incluye el aviso de que el protocolo es orientativo y no reemplaza la evaluación clínica. "
            "Responde SOLO con JSON válido siguiendo el esquema especificado."
        )

        user_prompt = f"""
Genera un protocolo de rehabilitación personalizado para:
- Lesión: {injury_labels.get(request.injury_type, request.injury_type)}
- Zona: {area_labels.get(request.body_area, request.body_area)}
- Dolor actual: {pain_desc}
- Tiempo desde la lesión: {weeks_desc}
- Sexo biológico del usuario: {user_sex}
- Nivel en app: {user_level}
- Objetivo fitness: {user_goal}
{"- Notas adicionales: " + request.notes if request.notes else ""}

Responde con este JSON exacto (sin markdown, sin explicaciones fuera del JSON):
{{
  "title": "...",
  "phases": [
    {{
      "phase_name": "...",
      "duration_weeks": <int>,
      "goal": "...",
      "precautions": ["..."],
      "exercises": [
        {{
          "name": "...",
          "description": "...",
          "sets": <int|null>,
          "reps": "...",
          "rest_seconds": <int|null>,
          "frequency_per_week": <int|null>,
          "progression_note": "...|null"
        }}
      ]
    }}
  ],
  "general_advice": "...",
  "red_flags": ["..."]
}}
Incluye entre 2 y 4 fases progresivas. Cada fase debe tener 2-4 ejercicios específicos.
"""

        try:
            response = await ai_router.complete(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
                max_tokens=1800,
                temperature=0.3,
            )
            content = response.get("content", "").strip()
            # Limpiar posibles bloques markdown
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            data = json.loads(content)

            phases = [
                RehabPhase(
                    phase_name=p["phase_name"],
                    duration_weeks=int(p["duration_weeks"]),
                    goal=p["goal"],
                    precautions=p.get("precautions", []),
                    exercises=[
                        RehabExercise(**{k: v for k, v in e.items() if v is not None})
                        for e in p.get("exercises", [])
                    ],
                )
                for p in data.get("phases", [])
            ]

            return RehabProtocolResponse(
                title=data.get("title", "Protocolo Personalizado"),
                injury_type=request.injury_type,
                body_area=request.body_area,
                tier="pro",
                is_ai_generated=True,
                phases=phases,
                general_advice=data.get("general_advice", ""),
                red_flags=data.get("red_flags", []),
            )

        except Exception as exc:
            logger.warning(
                "RehabService: AI protocol generation failed (%s), falling back to preset", exc
            )
            preset = RehabService.get_static_protocol(request)
            # Marcamos como pro pero indicamos que es fallback
            return RehabProtocolResponse(
                **preset.model_dump(exclude={"tier", "is_ai_generated"}),
                tier="pro",
                is_ai_generated=False,
            )

    @staticmethod
    def list_presets() -> list[dict]:
        """Lista todos los presets disponibles para el tier free."""
        result = []
        for (injury, area), preset in _PRESETS.items():
            total_weeks = sum(p.duration_weeks for p in preset.phases)
            result.append({
                "injury_type": injury,
                "body_area": area,
                "title": preset.title,
                "phases_count": len(preset.phases),
                "total_weeks": total_weeks,
            })
        return result
