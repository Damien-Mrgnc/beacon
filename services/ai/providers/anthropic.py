import anthropic

from api.models.insights import ChurnInsight, TenantContext
from prompts.churn_analysis import SYSTEM_PROMPT, build_analysis_prompt

from .base import AnalysisProvider
from .utils import extract_json, parse_response

MODEL = "claude-opus-4-6"


class AnthropicProvider(AnalysisProvider):

    @property
    def name(self) -> str:
        return MODEL

    async def analyze(self, ctx: TenantContext) -> ChurnInsight:
        client = anthropic.AsyncAnthropic(api_key=self.api_key)
        prompt = build_analysis_prompt(ctx)

        message = await client.messages.create(
            model=MODEL,
            max_tokens=1024,
            temperature=0.2,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        text = message.content[0].text
        raw = extract_json(text)
        return parse_response(raw, ctx, MODEL)
