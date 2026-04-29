"""
Redis cache for AI insights — avoids calling Gemini on every request.
TTL default: 30 minutes (insights don't change that fast).
"""

import json
import os
import redis.asyncio as aioredis

from api.models.insights import ChurnInsight

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CACHE_TTL = int(os.getenv("INSIGHTS_CACHE_TTL", "1800"))  # 30 min
CACHE_PREFIX = "beacon:insight:"

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    return _redis


async def get_cached_insight(tenant_id: str) -> ChurnInsight | None:
    try:
        r = await get_redis()
        raw = await r.get(f"{CACHE_PREFIX}{tenant_id}")
        if raw is None:
            return None
        return ChurnInsight.model_validate_json(raw)
    except Exception:
        return None


async def set_cached_insight(insight: ChurnInsight) -> None:
    try:
        r = await get_redis()
        await r.setex(
            f"{CACHE_PREFIX}{insight.tenant_id}",
            CACHE_TTL,
            insight.model_dump_json(),
        )
    except Exception:
        pass
