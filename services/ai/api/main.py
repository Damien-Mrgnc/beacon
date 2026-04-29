import logging
import os
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
    logger.info("Beacon AI service starting — model: %s", os.getenv("GEMINI_MODEL", "gemini-1.5-flash"))
    yield
    logger.info("Beacon AI service shutting down")


app = FastAPI(
    title="Beacon AI",
    description="Churn risk analysis powered by Gemini",
    version="0.1.0",
    lifespan=lifespan,
    debug=True,
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
    return {"status": "ok", "service": "beacon-ai"}
