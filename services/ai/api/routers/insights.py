from fastapi import APIRouter, HTTPException

from agents.churn_analyst import analyze_tenant
from api.models.insights import ChurnInsight, InsightRequest
from api.services.cache import get_cached_insight, set_cached_insight
from api.services.context import fetch_tenant_context
from providers.router import NoProviderAvailableError, get_available_providers

router = APIRouter(prefix="/insights", tags=["insights"])


@router.post("/{tenant_id}", response_model=ChurnInsight)
async def get_insight(tenant_id: str, body: InsightRequest | None = None) -> ChurnInsight:
    """
    Generate a churn risk analysis for a tenant.

    - Checks Redis cache first (30 min TTL)
    - Fetches context from ClickHouse
    - Calls the active AI provider (anthropic > openai > gemini > mistral)
    - Caches and returns structured insight
    """
    force_refresh = body.force_refresh if body else False

    if not force_refresh:
        cached = await get_cached_insight(tenant_id)
        if cached is not None:
            return cached

    try:
        ctx = await fetch_tenant_context(tenant_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Context fetch failed: {type(e).__name__}: {e}")
    if ctx is None:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_id}' not found")

    try:
        insight = await analyze_tenant(ctx)
    except NoProviderAvailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"{type(e).__name__}: {e}")

    await set_cached_insight(insight)
    return insight


@router.get("/health")
async def health() -> dict:
    providers = get_available_providers()
    return {
        "status": "ok" if providers else "degraded",
        "service": "beacon-ai",
        "active_provider": providers[0] if providers else None,
        "available_providers": providers,
    }
