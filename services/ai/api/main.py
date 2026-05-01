import logging
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers.insights import router as insights_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from providers.router import get_available_providers
    providers = get_available_providers()
    if providers:
        logger.info("Beacon AI service starting — active provider: %s", providers[0])
        if len(providers) > 1:
            logger.info("Fallback providers available: %s", ", ".join(providers[1:]))
    else:
        logger.warning(
            "Beacon AI service starting with NO provider configured. "
            "Set ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or MISTRAL_API_KEY."
        )
    yield
    logger.info("Beacon AI service shutting down")


app = FastAPI(
    title="Beacon AI",
    description="Churn risk analysis — provider-agnostic LLM router (Anthropic · OpenAI · Gemini · Mistral)",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(insights_router)


@app.get("/health")
async def health():
    from providers.router import get_available_providers
    providers = get_available_providers()
    return {
        "status": "ok" if providers else "degraded",
        "service": "beacon-ai",
        "active_provider": providers[0] if providers else None,
        "available_providers": providers,
    }
