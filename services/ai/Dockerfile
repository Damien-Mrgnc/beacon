FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --target=/deps -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /deps /deps
ENV PYTHONPATH=/deps:/app
COPY requirements.txt .
COPY api/       ./api/
COPY agents/    ./agents/
COPY prompts/   ./prompts/
COPY providers/ ./providers/
COPY tests/     ./tests/
RUN adduser --disabled-password --no-create-home appuser
USER appuser
CMD ["python", "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8002"]
