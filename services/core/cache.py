"""
Redis async client — optional. Returns None when REDIS_URL is unset or unreachable.

Usage:
    redis = await get_redis()
    if redis:
        await redis.setex("key", 300, "value")
    else:
        # fall back to in-memory or DB-backed storage
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_redis = None


async def get_redis():
    global _redis
    if _redis is not None:
        return _redis

    from services.core.settings import settings
    if not settings.REDIS_URL:
        return None

    try:
        from redis.asyncio import Redis
        client = Redis.from_url(settings.REDIS_URL, decode_responses=True)
        await client.ping()
        _redis = client
        logger.info("Redis connected: %s", settings.REDIS_URL)
    except Exception as e:
        logger.warning("Redis unavailable (%s) — falling back to in-memory", e)

    return _redis
