from enum import Enum
from pydantic import BaseModel, Field


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TenantContext(BaseModel):
    """Raw data fetched from ClickHouse — input to the AI agent."""
    tenant_id: str
    health_score: float = Field(ge=0, le=1)
    tier: str
    score_7d_ago: float | None = None
    score_trend: float | None = None          # positive = improving
    dau: int
    dau_30d_avg: int
    error_rate: float = Field(ge=0, le=1)
    active_features: int
    total_features: int = 10
    last_login_days_ago: int | None = None
    event_count_24h: int


class RiskFactor(BaseModel):
    signal: str
    description: str
    severity: RiskLevel


class RecommendedAction(BaseModel):
    priority: int = Field(ge=1, le=3)        # 1 = urgent, 3 = low
    action: str
    rationale: str


class ChurnInsight(BaseModel):
    """Structured AI output for a tenant churn analysis."""
    tenant_id: str
    health_score: float
    tier: str
    diagnosis: str = Field(description="Root cause analysis in 2-3 sentences")
    risk_factors: list[RiskFactor]
    recommended_actions: list[RecommendedAction]
    confidence: float = Field(ge=0, le=1, description="Model confidence in this analysis")
    model_used: str = "gemini-1.5-flash"


class InsightRequest(BaseModel):
    tenant_id: str
    force_refresh: bool = False              # bypass Redis cache
