"""
app/core/mailer.py
==================
Envío de emails transaccionales via Resend API (httpx, sin SDK extra).

Si RESEND_API_KEY no está configurado, las funciones loguean una advertencia
y devuelven False — la app funciona sin emails (degraded mode).
"""

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


async def send_password_reset_email(to_email: str, reset_url: str) -> bool:
    """
    Envía un email de restablecimiento de contraseña vía Resend API.

    Args:
        to_email: Dirección de destino.
        reset_url: URL completa con el token de reset embebido.

    Returns:
        True si el email fue aceptado por Resend, False en cualquier error.
        No lanza excepciones — el flujo de reset debe continuar aunque el email falle.
    """
    settings = get_settings()

    if not settings.resend_api_key:
        logger.warning(
            "RESEND_API_KEY no configurado — email de reset no enviado para %s",
            to_email,
        )
        return False

    html = f"""
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0c0c1e;color:#fff;border-radius:12px">
      <h2 style="color:#7c6bff;margin-bottom:8px">Restablecer contraseña</h2>
      <p style="color:rgba(255,255,255,0.7);margin-bottom:24px">
        Recibiste este email porque solicitaste restablecer tu contraseña en HealthStack Pro.
      </p>
      <a href="{reset_url}"
         style="display:inline-block;background:#7c6bff;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
        Restablecer contraseña
      </a>
      <p style="color:rgba(255,255,255,0.4);font-size:12px;margin-top:24px">
        Este enlace expira en 1 hora. Si no solicitaste el cambio, ignora este email.
      </p>
    </div>
    """

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": settings.resend_from,
                    "to": [to_email],
                    "subject": "Restablecer contraseña — HealthStack Pro",
                    "html": html,
                },
            )
            resp.raise_for_status()
            logger.info("Email de reset enviado correctamente a %s", to_email)
            return True
    except Exception as e:
        logger.error("Error enviando email de reset a %s: %s", to_email, e)
        return False
