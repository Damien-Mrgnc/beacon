from __future__ import annotations

import hashlib
import logging

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.tenant import Tenant, TenantORM

logger = logging.getLogger(__name__)


def _hash_api_key(raw_key: str) -> str:
    """SHA-256 de la clé — on ne stocke jamais la clé en clair."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


async def verify_api_key(
    request: Request,
    db: AsyncSession,
    redis_client,
) -> Tenant:
    """
    Vérifie la clé API dans les headers.
    Cache Redis 5min pour éviter un hit DB à chaque requête.
    """
    api_key = request.headers.get("x-api-key")
    tenant_id = request.headers.get("x-tenant-id")

    if not api_key or not tenant_id:
        raise HTTPException(
            status_code=401,
            detail="Missing credentials — headers x-api-key and x-tenant-id are required",
        )

    # 1. Vérifier le cache Redis
    cache_key = f"apikey:{tenant_id}:{_hash_api_key(api_key)}"
    cached = await redis_client.get(cache_key)
    if cached:
        return Tenant.model_validate_json(cached)

    # 2. Vérifier en base
    result = await db.execute(
        select(TenantORM).where(
            TenantORM.id == tenant_id,
            TenantORM.api_key_hash == _hash_api_key(api_key),
            TenantORM.is_active.is_(True),
        )
    )
    tenant_orm = result.scalar_one_or_none()

    if tenant_orm is None:
        logger.warning("Invalid API key attempt for tenant_id=%s", tenant_id)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    tenant = Tenant.model_validate(tenant_orm)

    # 3. Mettre en cache 5 minutes
    await redis_client.setex(cache_key, 300, tenant.model_dump_json())

    return tenant
