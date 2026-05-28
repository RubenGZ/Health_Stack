"""
app/shared/cache.py
====================
Utilidad de caché Redis con patrón cache-aside.

Diseño:
- Cliente Redis asíncrono (redis.asyncio) inicializado en el primer uso.
- Serialización JSON (segura y debuggeable, sin pickle).
- Fallback graceful: si Redis no está disponible, las funciones retornan None
  (cache miss) y loguean a WARNING. La lógica de negocio no se interrumpe.
- Sin TTL por defecto (catálogos estáticos). Pasar ttl en segundos para datos
  con expiración (ej: insights → 86400).

Uso básico:
    from app.shared.cache import cache_get, cache_set, cache_delete

    # Leer
    cached = await cache_get("catalog:supplements")
    if cached is not None:
        return cached

    # Calcular y guardar
    result = await db_query(...)
    await cache_set("catalog:supplements", result)
    return result

Invalidación:
    await cache_delete("catalog:supplements")
    await cache_delete_pattern("catalog:*")  # glob pattern

NOTA SOBRE LA PI:
    En la Pi el redis_url apunta a 'redis://localhost:6379/0' dentro del
    container de backend. Redis está en el mismo Docker network, accesible
    como 'redis:6379'. Asegurarse de que REDIS_URL en .env sea correcto.
    Si Redis no responde, el fallback a BD es automático.
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Cliente Redis lazy-initialized (None hasta el primer uso)
_redis_client = None


async def _get_client():
    """
    Devuelve el cliente Redis, creándolo en el primer uso.
    Retorna None si Redis no está disponible o la URL no está configurada.
    """
    global _redis_client
    if _redis_client is not None:
        return _redis_client

    try:
        import redis.asyncio as aioredis
        from app.core.config import get_settings
        settings = get_settings()
        url = settings.redis_url
        if not url:
            return None
        _redis_client = aioredis.from_url(
            url,
            socket_connect_timeout=1,   # falla rápido si Redis no responde
            socket_timeout=1,
            decode_responses=True,       # devuelve str en lugar de bytes
        )
        # Ping de verificación
        await _redis_client.ping()
        logger.debug("[Cache] Redis client initialized: %s", url.split("@")[-1])
        return _redis_client
    except Exception as exc:
        logger.warning("[Cache] Redis no disponible, cache desactivado: %s", exc)
        _redis_client = None
        return None


async def cache_get(key: str) -> Any | None:
    """
    Obtiene un valor de Redis.
    Retorna el objeto Python deserializado, o None si no existe o hay error.
    """
    client = await _get_client()
    if client is None:
        return None
    try:
        raw = await client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("[Cache] GET error key=%s: %s", key, exc)
        return None


async def cache_set(key: str, value: Any, ttl: int | None = None) -> bool:
    """
    Guarda un valor en Redis serializado como JSON.

    Args:
        key:   Clave Redis.
        value: Objeto Python serializable a JSON.
        ttl:   Segundos hasta expiración. None = sin expiración.

    Returns:
        True si se guardó correctamente, False si Redis no está disponible.
    """
    client = await _get_client()
    if client is None:
        return False
    try:
        payload = json.dumps(value, ensure_ascii=False, default=str)
        if ttl is not None:
            await client.setex(key, ttl, payload)
        else:
            await client.set(key, payload)
        return True
    except Exception as exc:
        logger.warning("[Cache] SET error key=%s: %s", key, exc)
        return False


async def cache_delete(key: str) -> bool:
    """Elimina una clave de Redis. Útil para invalidar catálogos."""
    client = await _get_client()
    if client is None:
        return False
    try:
        await client.delete(key)
        return True
    except Exception as exc:
        logger.warning("[Cache] DELETE error key=%s: %s", key, exc)
        return False


async def cache_delete_pattern(pattern: str) -> int:
    """
    Elimina todas las claves que coincidan con el patrón glob.
    Retorna el número de claves eliminadas.

    Uso: await cache_delete_pattern("catalog:*")
    """
    client = await _get_client()
    if client is None:
        return 0
    try:
        keys = await client.keys(pattern)
        if not keys:
            return 0
        return await client.delete(*keys)
    except Exception as exc:
        logger.warning("[Cache] DELETE PATTERN error pattern=%s: %s", pattern, exc)
        return 0


async def reset_client() -> None:
    """
    Fuerza la re-inicialización del cliente Redis.
    Útil en tests o si la conexión se cae y queremos reintentar.
    """
    global _redis_client
    if _redis_client is not None:
        try:
            await _redis_client.aclose()
        except Exception:
            pass
    _redis_client = None
