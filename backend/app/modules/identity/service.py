"""
app/modules/identity/service.py
=================================
Capa de lógica de negocio para el módulo de identidad.

Responsabilidades:
- Orquestar el flujo de registro: crear usuario + llave de cruce cifrada
- Orquestar el flujo de login: verificar credenciales + emitir tokens
- Emitir access token y refresh token JWT

NO hace:
- Acceso directo a BD (delega en UserRepository / DataLinkRepository)
- Operaciones criptográficas directas (delega en CryptoService y HashingService)
- Formateo de respuestas HTTP (delega en el router)

IMPORTANTE — Timing attack en login:
    Aunque el usuario no exista, se ejecuta `verify_password` con un hash
    ficticio para que la respuesta tarde lo mismo. Esto evita user enumeration
    mediante diferencias de tiempo de respuesta.
"""

from __future__ import annotations

from datetime import UTC, datetime
import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.cryptoservice import CryptoService
from app.core.security.hashing import hash_password, needs_rehash, verify_password
from app.core.security.jwt_handler import create_access_token, create_refresh_token, decode_token
import json
from decimal import Decimal

from app.modules.identity.repository import RefreshTokenRepository, UserHealthProfileRepository, UserRepository
from app.modules.identity.schemas import (
    LoginRequest,
    LoginResponse,
    OnboardingRequest,
    OnboardingResponse,
    OnboardingV2In,
    OnboardingV2Macros,
    OnboardingV2Result,
    RegisterRequest,
    RegisterResponse,
    UserPublicResponse,
)
from app.services.ai_router.dependencies import get_ai_router
from app.services.ai_router.schemas import AIMessage, AIRequest, AIUseCase
from app.shared.exceptions import InvalidCredentialsError, UserAlreadyExistsError, UserNotFoundError

logger = logging.getLogger(__name__)

# Hash ficticio para uso en timing-safe login (mismo coste que un hash real)
# Se calcula una vez al cargar el módulo para no pagar el coste en cada request
_DUMMY_HASH: str = hash_password("HealthStack_dummy_2024!")


class IdentityService:
    """
    Servicio de identidad — stateless, todos los métodos son estáticos.
    Se puede instanciar o usar directamente con los métodos de clase.
    """

    # ── REGISTRO ──────────────────────────────────────────────────────────────

    @staticmethod
    async def register(
        db: AsyncSession,
        request: RegisterRequest,
        crypto: CryptoService,
    ) -> RegisterResponse:
        """
        Registra un nuevo usuario y genera su llave de cruce cifrada.

        Flujo:
            1. Verificar que el email no está registrado
            2. Hashear la contraseña con Argon2id
            3. Crear el registro de usuario en `public.users`
            4. Generar health_subject_id (UUID aleatorio) y cifrarlo en `public.data_links`
            5. Emitir access token + refresh token JWT
            6. Devolver la respuesta

        El consentimiento RGPD ya fue validado por el schema Pydantic (RegisterRequest).
        Si consent_gdpr=False, Pydantic lanza ValidationError antes de llegar aquí.

        Args:
            db: Sesión de BD inyectada por get_db().
            request: Body del POST /auth/register validado por Pydantic.
            crypto: CryptoService inyectado para crear la llave de cruce.

        Raises:
            UserAlreadyExistsError: El email ya está registrado. → HTTP 409
        """
        # 1. Verificar unicidad de email ANTES de hashear la contraseña
        #    (ahorra ~200ms de Argon2 si el email ya existe)
        existing = await UserRepository.get_by_email(db, request.email)
        if existing is not None:
            logger.info(
                f"Intento de registro con email ya registrado: {request.email[:3]}***"
            )
            raise UserAlreadyExistsError(
                "Este email ya está registrado. ¿Quieres iniciar sesión?"
            )

        # 2. Hashear contraseña (operación costosa ~200ms — solo si el email es nuevo)
        password_hash = hash_password(request.password)

        # 3. Crear usuario
        try:
            user = await UserRepository.create(
                db=db,
                email=request.email,
                password_hash=password_hash,
                display_name=request.display_name,
                consent_gdpr=request.consent_gdpr,
            )
        except IntegrityError:
            # Condición de carrera: dos requests simultáneos con el mismo email
            # El UNIQUE constraint de PostgreSQL atrapa este caso
            await db.rollback()
            raise UserAlreadyExistsError(
                "Este email ya está registrado. ¿Quieres iniciar sesión?"
            )

        # 4. Crear llave de cruce cifrada (seudonimización AEPD)
        #    Este paso vincula user.id con un health_subject_id aleatorio
        health_subject_id = await crypto.create_health_link_for_user(
            user_id=str(user.id),
            db=db,
        )
        logger.info(
            f"Registro completado: user={str(user.id)[:8]}... "
            f"health_subject={health_subject_id[:8]}..."
        )

        # 5. Emitir tokens JWT
        access_token = create_access_token(
            user_id=str(user.id),
            email=user.email,
            role=user.role,
            plan=getattr(user, "plan", "free"),
        )
        refresh_token = create_refresh_token(user_id=str(user.id))

        # 5b. Persistir JTI del refresh token en BD (ADR-001-B)
        try:
            _rt_payload = decode_token(refresh_token)
            await RefreshTokenRepository.create(
                db=db,
                jti=_rt_payload["jti"],
                user_id=str(user.id),
                expires_at=datetime.fromtimestamp(_rt_payload["exp"], tz=UTC),
            )
        except Exception as _exc:
            logger.warning(f"No se pudo persistir refresh token JTI en registro: {_exc}")
            await db.rollback()

        # 6. Construir respuesta
        return RegisterResponse(
            user=UserPublicResponse.model_validate(user),
            access_token=access_token,
            refresh_token=refresh_token,
        )

    # ── LOGIN ─────────────────────────────────────────────────────────────────

    @staticmethod
    async def login(
        db: AsyncSession,
        request: LoginRequest,
    ) -> LoginResponse:
        """
        Verifica credenciales y emite tokens JWT.

        Flujo:
            1. Buscar usuario por email
            2. Verificar contraseña (timing-safe: misma duración si el usuario no existe)
            3. Verificar que la cuenta está activa
            4. Actualizar last_login_at
            5. Rehashear si los parámetros de Argon2 cambiaron (opcional)
            6. Emitir access token + refresh token

        Seguridad:
            - Mismo mensaje de error para "email no encontrado" y "contraseña incorrecta"
              → evita user enumeration attacks
            - verify_password() es timing-safe (argon2-cffi garantiza tiempo constante)
            - Si el usuario no existe, se ejecuta `verify_password(_DUMMY_HASH)` para
              igualar el tiempo de respuesta y no filtrar si el email existe

        Args:
            db: Sesión de BD.
            request: Body del POST /auth/login validado por Pydantic.

        Raises:
            InvalidCredentialsError: Email o contraseña incorrectos. → HTTP 401
        """
        # 1. Buscar usuario
        user = await UserRepository.get_by_email(db, request.email)

        # 2. Verificar contraseña (timing-safe)
        if user is None:
            # Ejecutar verify_password con un hash ficticio para igualar tiempos
            # y no revelar mediante timing si el email existe en el sistema
            verify_password(request.password, _DUMMY_HASH)
            raise InvalidCredentialsError("Credenciales incorrectas.")

        password_ok = verify_password(request.password, user.password_hash)
        if not password_ok:
            raise InvalidCredentialsError("Credenciales incorrectas.")

        # 3. Verificar cuenta activa
        if not user.is_active:
            # Mismo mensaje genérico — no revelar si la cuenta está suspendida
            raise InvalidCredentialsError("Credenciales incorrectas.")

        # 4. Actualizar last_login_at (no crítico — no bloquea el login si falla)
        await UserRepository.update_last_login(db, str(user.id))

        # 5. Rehash si los parámetros de Argon2 han cambiado
        #    (ejemplo: si se sube time_cost de 3 a 4 en una actualización de seguridad)
        if needs_rehash(user.password_hash):
            new_hash = hash_password(request.password)
            user.password_hash = new_hash
            await db.flush()
            logger.info(f"Contraseña re-hasheada para user={str(user.id)[:8]}...")

        # 6. Emitir tokens
        access_token = create_access_token(
            user_id=str(user.id),
            email=user.email,
            role=user.role,
            plan=getattr(user, "plan", "free"),
        )
        refresh_token = create_refresh_token(user_id=str(user.id))

        # 6b. Persistir JTI del refresh token en BD (ADR-001-B)
        try:
            _rt_payload = decode_token(refresh_token)
            await RefreshTokenRepository.create(
                db=db,
                jti=_rt_payload["jti"],
                user_id=str(user.id),
                expires_at=datetime.fromtimestamp(_rt_payload["exp"], tz=UTC),
            )
        except Exception as _exc:
            # La tabla refresh_tokens puede no existir si las migraciones no se han ejecutado.
            # El login sigue siendo válido; el refresh token no podrá renovarse hasta que
            # se ejecute `alembic upgrade head` en el servidor.
            logger.warning(f"No se pudo persistir refresh token JTI: {_exc}")
            await db.rollback()

        logger.info(f"Login exitoso: user={str(user.id)[:8]}...")

        return LoginResponse(
            user=UserPublicResponse.model_validate(user),
            access_token=access_token,
            refresh_token=refresh_token,
        )

    # ── ONBOARDING ────────────────────────────────────────────────────────────

    @staticmethod
    async def complete_onboarding(
        db: AsyncSession,
        user_id: str,
        request: OnboardingRequest,
        crypto: CryptoService,
    ) -> OnboardingResponse:
        """
        Guarda el perfil de onboarding del usuario y siembra un health record baseline.

        Flujo:
            1. Actualizar columnas de perfil en public.users
            2. Resolver health_subject_id del usuario (via CryptoService)
            3. Crear HealthRecord baseline con weight_kg + height_cm de hoy
            4. Marcar onboarding_completed = True

        Los datos de peso/altura se guardan en DOS lugares:
            - public.users.current_weight_kg → baseline rápido para cálculos (no histórico)
            - health.health_records          → registro histórico seudonimizado (Art. 9 RGPD)
        """
        from datetime import date as date_type
        from app.modules.health.models import HealthRecord

        # 1. Obtener usuario
        user = await UserRepository.get_by_id(db, user_id)
        if user is None:
            raise UserNotFoundError(f"Usuario {user_id[:8]}... no encontrado.")

        # 2. Actualizar perfil
        user.biological_sex = request.biological_sex
        user.birth_date = request.birth_date
        user.current_weight_kg = request.current_weight_kg
        user.height_cm = request.height_cm
        user.activity_level = request.activity_level
        user.primary_fitness_goal = request.primary_fitness_goal
        user.onboarding_completed = True
        await db.flush()

        # 3. Sembrar health record baseline (seudonimizado)
        health_record_seeded = False
        try:
            subject_id = await crypto.resolve_health_subject_id(user_id, db)
            baseline = HealthRecord(
                health_subject_id=subject_id,
                recorded_date=date_type.today(),
                weight_kg=request.current_weight_kg,
                height_cm=request.height_cm,
            )
            db.add(baseline)
            health_record_seeded = True
        except Exception as exc:
            logger.warning(
                "Onboarding: no se pudo crear health record baseline para user=%s: %s",
                user_id[:8], exc,
            )

        await db.commit()
        logger.info("Onboarding completado: user=%s", user_id[:8])

        return OnboardingResponse(
            onboarding_completed=True,
            health_record_seeded=health_record_seeded,
        )

    # ── ONBOARDING V2 ─────────────────────────────────────────────────────────

    @staticmethod
    async def complete_onboarding_v2(
        db: AsyncSession,
        user_id: str,
        request: OnboardingV2In,
        crypto: CryptoService,
    ) -> OnboardingV2Result:
        """
        Onboarding v2 — análisis metabólico con NEAT real + IA opcional.

        Flujo (patrón dos commits — D3):
        1. Guardar campos no sensibles en public.users + commit (libera conexión)
        2. Llamar a Groq fuera de la transacción (timeout 5s, 1 retry, fallback)
        3. Cifrar + guardar health.user_health_profiles + commit final
        4. Devolver OnboardingV2Result al frontend

        RGPD: solo se llama a Groq si ai_consent=True.
        AAD: b"healthstack.health_profile.v1" (contexto separado de data_links).
        """
        from datetime import UTC, datetime as dt

        user = await UserRepository.get_by_id(db, user_id)
        if user is None:
            raise UserNotFoundError(f"Usuario {user_id[:8]}... no encontrado.")

        ai_consent_at = dt.now(UTC) if request.ai_consent else None

        # ── Commit 1: campos no sensibles ──────────────────────────────────────
        user.work_type = request.work_type
        user.daily_steps_range = request.daily_steps_range
        user.sport_activities = [s.model_dump() for s in request.sport_activities]
        user.strength_experience = request.strength_experience
        user.strength_consistency = request.strength_consistency
        user.eating_style = request.eating_style
        user.ai_consent_at = ai_consent_at
        # onboarding_v2_completed se marca en el commit final (tras éxito de todo el flujo)
        await db.commit()  # libera la conexión del pool antes de llamar a Groq

        # ── Groq call (fuera de transacción) ──────────────────────────────────
        groq_result = None
        if request.ai_consent:
            try:
                groq_result = await _call_groq_onboarding(user, request)
            except Exception as exc:
                logger.warning("Onboarding v2 Groq call raised: %s — using fallback", type(exc).__name__)

        # ── Resultado final: Groq o fallback ──────────────────────────────────
        if groq_result is None:
            result_data = _fallback_estimate(user, request)
            ai_used = False
        else:
            result_data = groq_result
            ai_used = True

        # ── Commit 2: datos Art.9 cifrados + flag completado ──────────────────
        import uuid as _uuid_mod
        health_subject_id_str = await crypto.resolve_health_subject_id(user_id, db)
        health_subject_id = _uuid_mod.UUID(health_subject_id_str)
        _HEALTH_PROFILE_AAD = b"healthstack.health_profile.v1"

        enc_bfp: str | None = None
        if request.body_fat_pct is not None:
            enc_bfp = crypto.encrypt_text(str(request.body_fat_pct), aad=_HEALTH_PROFILE_AAD)

        enc_visual: str | None = None
        if request.body_fat_visual:
            enc_visual = crypto.encrypt_text(request.body_fat_visual, aad=_HEALTH_PROFILE_AAD)

        enc_intolerances: str | None = None
        if request.food_intolerances:
            enc_intolerances = crypto.encrypt_text(
                json.dumps(request.food_intolerances), aad=_HEALTH_PROFILE_AAD
            )

        enc_ai_profile: str | None = None
        ai_profile_generated_at = None
        if ai_used and result_data:
            enc_ai_profile = crypto.encrypt_text(
                json.dumps(result_data), aad=_HEALTH_PROFILE_AAD
            )
            ai_profile_generated_at = dt.now(UTC)

        await UserHealthProfileRepository.upsert(
            db,
            health_subject_id=health_subject_id,
            body_fat_pct=enc_bfp,
            body_fat_visual=enc_visual,
            food_intolerances=enc_intolerances,
            ai_profile=enc_ai_profile,
            ai_profile_generated_at=ai_profile_generated_at,
        )

        user.onboarding_v2_completed = True
        await db.commit()

        logger.info("Onboarding v2 completado: user=%s ai_used=%s", user_id[:8], ai_used)

        # Construir respuesta
        macros = result_data.get("macros", {})
        return OnboardingV2Result(
            tdee_kcal=result_data.get("tdee_kcal", 2000),
            target_kcal=result_data.get("target_kcal", result_data.get("tdee_kcal", 2000)),
            formula_used=result_data.get("formula_used", "mifflin_fallback"),
            confidence=result_data.get("confidence", "low"),
            confidence_reason=result_data.get("confidence_reason"),
            estimated_body_fat_pct=result_data.get("estimated_body_fat_pct"),
            lean_mass_kg=result_data.get("lean_mass_kg"),
            macros=OnboardingV2Macros(
                protein_g=macros.get("protein_g", 100),
                carbs_g=macros.get("carbs_g", 200),
                fat_g=macros.get("fat_g", 60),
            ),
            protein_sources=result_data.get("protein_sources", []),
            carb_sources=result_data.get("carb_sources", []),
            neat_assessment=result_data.get("neat_assessment"),
            recomp_potential=result_data.get("recomp_potential"),
            diagnosis=result_data.get("diagnosis", "Estimación calculada con fórmula estándar."),
            action_steps=result_data.get("action_steps", []),
            diet_alert=result_data.get("diet_alert"),
            ai_used=ai_used,
        )


# ── NEAT + Groq helpers ───────────────────────────────────────────────────────

# Factores NEAT: trabajo × pasos → multiplicador TDEE
_NEAT_FACTORS: dict[str, dict[str, float]] = {
    "desk":     {"lt4k": 1.20, "4k7k": 1.30, "7k10k": 1.40, "gt10k": 1.45},
    "remote":   {"lt4k": 1.20, "4k7k": 1.30, "7k10k": 1.40, "gt10k": 1.45},
    "standing": {"lt4k": 1.35, "4k7k": 1.45, "7k10k": 1.50, "gt10k": 1.55},
    "physical": {"lt4k": 1.55, "4k7k": 1.60, "7k10k": 1.65, "gt10k": 1.70},
    "none":     {"lt4k": 1.20, "4k7k": 1.30, "7k10k": 1.40, "gt10k": 1.45},
}

_VISUAL_BF_MIDPOINTS: dict[str, float] = {
    "lean_soft": 0.22,
    "belly_main": 0.27,
    "uniform": 0.25,
    "high_volume": 0.32,
}


def _mifflin_tdee(weight_kg: float, height_cm: float, age: int, sex: str,
                  work_type: str, steps_range: str) -> float:
    """Mifflin-St Jeor × factor NEAT."""
    tmb = 10 * weight_kg + 6.25 * height_cm - 5 * age + (5 if sex == "male" else -161)
    neat = _NEAT_FACTORS.get(work_type, _NEAT_FACTORS["desk"]).get(steps_range, 1.30)
    return tmb * neat


def _fallback_estimate(user: object, req: OnboardingV2In) -> dict:
    """
    Mifflin-St Jeor + NEAT cuando Groq no está disponible o no hay consentimiento.
    """
    from datetime import date as date_type

    weight_kg = float(getattr(user, "current_weight_kg", None) or 70)
    height_cm = float(getattr(user, "height_cm", None) or 170)
    sex = getattr(user, "biological_sex", None) or "male"
    birth_date = getattr(user, "birth_date", None)
    age = 30
    if birth_date:
        today = date_type.today()
        age = today.year - birth_date.year - (
            (today.month, today.day) < (birth_date.month, birth_date.day)
        )

    tdee = _mifflin_tdee(weight_kg, height_cm, age, sex, req.work_type, req.daily_steps_range)

    # Proteína: lean mass si hay BF%, sino 1.6g/kg
    if req.body_fat_pct is not None:
        lean_kg = weight_kg * (1 - float(req.body_fat_pct) / 100)
    elif req.body_fat_visual:
        lean_kg = weight_kg * (1 - _VISUAL_BF_MIDPOINTS.get(req.body_fat_visual, 0.25))
    else:
        lean_kg = None

    protein_g = round(lean_kg * 2.1) if lean_kg else round(weight_kg * 1.6)
    tdee_int = round(tdee)

    return {
        "tdee_kcal": tdee_int,
        "target_kcal": tdee_int,
        "formula_used": "mifflin_fallback",
        "confidence": "low",
        "confidence_reason": "Estimación con fórmula estándar. Activa el análisis IA para mayor precisión.",
        "estimated_body_fat_pct": float(req.body_fat_pct) if req.body_fat_pct else None,
        "lean_mass_kg": round(lean_kg, 1) if lean_kg else None,
        "macros": {
            "protein_g": protein_g,
            "carbs_g": round((tdee * 0.45) / 4),
            "fat_g": round((tdee * 0.25) / 9),
        },
        "diagnosis": (
            "Estimación calculada con fórmula estándar Mifflin-St Jeor. "
            "Activa el análisis con IA en Ajustes > Privacidad para un diagnóstico metabólico completo."
        ),
        "action_steps": [
            "Completa tu perfil para recibir recomendaciones personalizadas con IA.",
        ],
        "protein_sources": [],
        "carb_sources": [],
    }


async def _call_groq_onboarding(user: object, req: OnboardingV2In) -> dict | None:
    """
    Llama a Groq para análisis metabólico onboarding v2.
    Timeout 5s, 1 retry en timeout/429. Devuelve dict o None si falla.

    RGPD: NUNCA incluye user_id, email, display_name en el prompt.
    Solo métricas numéricas anónimas.
    """
    from datetime import date as date_type

    weight_kg = float(getattr(user, "current_weight_kg", None) or 70)
    height_cm = float(getattr(user, "height_cm", None) or 170)
    sex = getattr(user, "biological_sex", None) or "male"
    birth_date = getattr(user, "birth_date", None)
    age = 30
    if birth_date:
        today = date_type.today()
        age = today.year - birth_date.year - (
            (today.month, today.day) < (birth_date.month, birth_date.day)
        )

    sports_lines = ""
    for s in req.sport_activities:
        sports_lines += (
            f"  - {s.sport}: {s.days_per_week} días/semana, "
            f"{s.duration_min} min/sesión, intensidad {s.intensity}\n"
        )

    intolerancias = ", ".join(req.food_intolerances) if req.food_intolerances else "ninguna"

    bf_info = ""
    if req.body_fat_pct is not None:
        lean_kg = weight_kg * (1 - float(req.body_fat_pct) / 100)
        bf_info = f"% grasa corporal: {req.body_fat_pct}% (lean mass: {lean_kg:.1f} kg)"
    elif req.body_fat_visual:
        midpoint = _VISUAL_BF_MIDPOINTS.get(req.body_fat_visual, 0.25)
        lean_kg = weight_kg * (1 - midpoint)
        bf_info = f"Estimación visual: {req.body_fat_visual} (~{round(midpoint*100)}% grasa estimado, lean ~{lean_kg:.1f} kg)"

    system_prompt = """Eres un nutricionista deportivo de élite. Analiza el perfil metabólico y devuelve EXACTAMENTE este JSON sin texto adicional:
{
  "tdee_kcal": <integer>,
  "target_kcal": <integer>,
  "formula_used": "<groq_katch_mcardle|groq_mifflin>",
  "confidence": "<high|medium|low>",
  "confidence_reason": "<string>",
  "estimated_body_fat_pct": <number|null>,
  "lean_mass_kg": <number|null>,
  "macros": {"protein_g": <int>, "carbs_g": <int>, "fat_g": <int>},
  "protein_sources": ["<string>", ...],
  "carb_sources": ["<string>", ...],
  "neat_assessment": "<string>",
  "recomp_potential": "<string>",
  "diagnosis": "<párrafo narrativo 3-4 frases>",
  "action_steps": ["<acción 1>", "<acción 2>", "<acción 3>"],
  "diet_alert": "<string|null>"
}"""

    user_prompt = f"""Perfil metabólico para análisis:
- Sexo: {sex} | Edad: {age} años | Peso: {weight_kg} kg | Altura: {height_cm} cm
- {bf_info if bf_info else 'Sin datos de composición corporal'}
- Trabajo: {req.work_type} | Pasos diarios: {req.daily_steps_range}
- Deportes:
{sports_lines if sports_lines else '  - Ninguno declarado'}
- Fuerza: experiencia {req.strength_experience}, consistencia {req.strength_consistency}
- Alimentación: {req.eating_style} | Intolerancias: {intolerancias}
- Objetivo fitness: {getattr(user, 'primary_fitness_goal', None) or 'no declarado'}

Calcula el TDEE real usando {"Katch-McArdle" if req.body_fat_pct or req.body_fat_visual else "Mifflin-St Jeor"} + NEAT real.
Ajusta target_kcal según el objetivo. Responde SOLO en español."""

    try:
        router = get_ai_router()
        ai_request = AIRequest(
            messages=[
                AIMessage(role="system", content=system_prompt),
                AIMessage(role="user", content=user_prompt),
            ],
            max_tokens=1500,
            temperature=0.2,
            timeout_s=5.0,
            response_format="json_object",
        )
        response = await router.chat(ai_request, use_case=AIUseCase.ONBOARDING_ANALYSIS)
        result = json.loads(response.content)
        return result
    except Exception as exc:
        logger.warning("Onboarding v2 Groq call failed, using fallback: %s", type(exc).__name__)
        return None
