import openai

from api.models.insights import ChurnInsight, TenantContext
from prompts.churn_analysis import SYSTEM_PROMPT, build_analysis_prompt

from .base import AnalysisProvider
from .utils import extract_json, parse_response

MODEL = "gpt-4o"


class OpenAIProvider(AnalysisProvider):

    @property
    def name(self) -> str:
        return MODEL

    async def analyze(self, ctx: TenantContext) -> ChurnInsight:
        client = openai.AsyncOpenAI(api_key=self.api_key)
        prompt = build_analysis_prompt(ctx)

        resp = await client.chat.completions.create(
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
