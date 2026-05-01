from mistralai import Mistral

from api.models.insights import ChurnInsight, TenantContext
from prompts.churn_analysis import SYSTEM_PROMPT, build_analysis_prompt

from .base import AnalysisProvider
from .utils import extract_json, parse_response

MODEL = "mistral-large-latest"


class MistralProvider(AnalysisProvider):

    @property
    def name(self) -> str:
        return MODEL

    async def analyze(self, ctx: TenantContext) -> ChurnInsight:
        client = Mistral(api_key=self.api_key)
        prompt = build_analysis_prompt(ctx)

        resp = await client.chat.complete_async(
            model=MODEL,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )
        text = resp.choices[0].message.content
        raw = extract_json(text)
        return parse_response(raw, ctx, MODEL)
