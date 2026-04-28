from fastapi import APIRouter, HTTPException

from agents.churn_analyst import analyze_tenant
from api.models.insights import ChurnInsight, InsightRequest
from api.services.cache import get_cached_insight, set_cached_insight
from api.services.context import fetch_tenant_context

router = APIRouter(prefix="/insights", tags=["insights"])


@router.post("/{tenant_id}", response_model=ChurnInsight)
async def get_insight(tenant_id: str, body: InsightRequest | None = None) -> ChurnInsight:
    """
    Generate a churn risk analysis for a tenant.

    - Checks Redis cache first (30 min TTL)
    - Fetches context from ClickHouse
    - Calls Gemini for AI analysis
    - Caches and returns structured insight
    """
    force_refresh = body.force_refresh if body else False

    # Cache hit
    if not force_refresh:
        cached = await get_cached_insight(tenant_id)
        if cached is not None:
            return cached

    # Fetch context
    ctx = await fetch_tenant_context(tenant_id)
    if ctx is None:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_id}' not found")

    # AI analysis
    try:
        insight = await analyze_tenant(ctx)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Cache result
    await set_cached_insight(insight)
    return insight


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "beacon-ai"}
