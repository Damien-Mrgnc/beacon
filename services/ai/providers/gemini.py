import asyncio

import google.generativeai as genai

from api.models.insights import ChurnInsight, TenantContext
from prompts.churn_analysis import SYSTEM_PROMPT, build_analysis_prompt

from .base import AnalysisProvider
from .utils import extract_json, parse_response

MODEL = "gemini-2.5-flash"


class GeminiProvider(AnalysisProvider):

    @property
    def name(self) -> str:
        return MODEL

    def _call_sync(self, prompt: str) -> str:
        genai.configure(api_key=self.api_key)
        model = genai.GenerativeModel(
            model_name=MODEL,
            system_instruction=SYSTEM_PROMPT,
            generation_config=genai.GenerationConfig(
                temperature=0.2,
                response_mime_type="application/json",
            ),
        )
        return model.generate_content(prompt).text

    async def analyze(self, ctx: TenantContext) -> ChurnInsight:
        prompt = build_analysis_prompt(ctx)
        # google-generativeai SDK is sync — offload to thread to avoid blocking the event loop
        text = await asyncio.to_thread(self._call_sync, prompt)
        raw = extract_json(text)
        return parse_response(raw, ctx, MODEL)
