# ── Stage 1 : builder ────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Installer les dépendances dans un dossier isolé
COPY requirements.txt .
RUN pip install --no-cache-dir --target=/deps -r requirements.txt

# ── Stage 2 : runtime ─────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Copier uniquement les dépendances installées
COPY --from=builder /deps /deps
ENV PYTHONPATH=/deps

# Copier le code source
COPY api/ ./api/

# Créer un user non-root (bonne pratique sécurité)
RUN adduser --disabled-password --no-create-home appuser
USER appuser

EXPOSE 8000

# 4 workers uvicorn — ajuster selon le CPU Fargate alloué
CMD ["python", "-m", "uvicorn", "api.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--log-level", "info"]
