"""
LLM provider router.

Reads API keys from environment variables and returns the first available
provider according to PROVIDER_PRIORITY (default: anthropic,openai,gemini,mistral).

Usage:
    provider = get_provider()          # raises NoProviderAvailableError if none configured
    names    = get_available_providers()  # list of configured provider names
"""

import logging
import os

from .base import AnalysisProvider

logger = logging.getLogger(__name__)

_PRIORITY_DEFAULT = "anthropic,openai,gemini,mistral"

_REGISTRY: dict[str, tuple[str, str]] = {
    "anthropic": ("ANTHROPIC_API_KEY", "providers.anthropic.AnthropicProvider"),
    "openai":    ("OPENAI_API_KEY",    "providers.openai.OpenAIProvider"),
    "gemini":    ("GEMINI_API_KEY",    "providers.gemini.GeminiProvider"),
    "mistral":   ("MISTRAL_API_KEY",   "providers.mistral.MistralProvider"),
}


class NoProviderAvailableError(RuntimeError):
    """Raised when no AI provider has a valid API key configured."""


def _load_class(dotted_path: str):
    module_path, class_name = dotted_path.rsplit(".", 1)
    import importlib
    module = importlib.import_module(module_path)
    return getattr(module, class_name)


def _build_providers() -> list[AnalysisProvider]:
    priority = [p.strip().lower() for p in os.getenv("PROVIDER_PRIORITY", _PRIORITY_DEFAULT).split(",")]
    available: list[AnalysisProvider] = []

    for name in priority:
        if name not in _REGISTRY:
            logger.warning("Unknown provider in PROVIDER_PRIORITY: %s", name)
            continue

        env_var, class_path = _REGISTRY[name]
        key = os.getenv(env_var, "").strip()

        if not key:
            logger.debug("Provider skipped — %s not set: %s", env_var, name)
            continue

        try:
            cls = _load_class(class_path)
            available.append(cls(key))
            logger.info("AI provider ready: %s", name)
        except Exception as exc:
            logger.warning("Failed to load provider %s: %s", name, exc)

    if not available:
        needed = ", ".join(v for v, _ in _REGISTRY.values())
        logger.warning("No AI provider configured. Set at least one of: %s", needed)

    return available


_providers: list[AnalysisProvider] | None = None


def _get_providers() -> list[AnalysisProvider]:
    global _providers
    if _providers is None:
        _providers = _build_providers()
    return _providers


def get_provider() -> AnalysisProvider:
    """Return the highest-priority available provider."""
    providers = _get_providers()
    if not providers:
        raise NoProviderAvailableError(
            "No AI provider configured — set at least one of: "
            "ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY"
        )
    return providers[0]


def get_available_providers() -> list[str]:
    """Return model names of all configured providers, in priority order."""
    return [p.name for p in _get_providers()]
