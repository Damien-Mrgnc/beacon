from abc import ABC, abstractmethod

from api.models.insights import ChurnInsight, TenantContext


class AnalysisProvider(ABC):
    """Common interface for all LLM providers."""

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    @property
    @abstractmethod
    def name(self) -> str:
        """Model identifier returned in ChurnInsight.model_used."""

    @abstractmethod
    async def analyze(self, ctx: TenantContext) -> ChurnInsight:
        """Run churn analysis for a tenant and return a structured insight."""
