# Beacon — Enterprise Customer Intelligence Platform

> Real-time customer health monitoring with AI-powered insights

[![CI](https://github.com/Damien-Mrgnc/beacon/actions/workflows/ci.yml/badge.svg)](https://github.com/Damien-Mrgnc/beacon/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)]()
[![Python](https://img.shields.io/badge/Python-3.12-blue)]()

---

## What it does

Beacon ingests product events from enterprise clients in real-time, computes their health score, generates AI-powered insights, and orchestrates automated onboarding workflows — all in a single platform.

**Built for Field Deployment Engineers** demonstrating ownership from SDK to production infrastructure.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Cloud | AWS (ECS Fargate · MSK · Aurora · ElastiCache) |
| Frontend | Next.js 14 · TypeScript · Tailwind · Recharts |
| API | tRPC · Node.js (type-safe end-to-end) |
| Event Streaming | Apache Kafka (AWS MSK) |
| Analytics DB | ClickHouse (real-time TSDB) |
| AI / LLM | LangChain + Claude claude-opus-4-6 (RAG + agents) |
| Workflow Orchestration | Temporal (long-running workflows) |
| IaC | Pulumi TypeScript |
| Observability | OpenTelemetry → AWS X-Ray + CloudWatch |
| Auth | AWS Cognito + JWT |

---

## Run locally (1 command)

```bash
git clone https://github.com/Damien-Mrgnc/beacon
cd beacon
cp .env.example .env        # remplir ANTHROPIC_API_KEY
docker-compose --profile full up -d
pnpm install && pnpm dev
# → http://localhost:3000
```

**Vérifier que tout est healthy :**
```bash
docker-compose ps
curl http://localhost:8123/ping     # ClickHouse → Ok.
curl http://localhost:8000/health   # Ingestion API → {"status":"ok"}
open http://localhost:8080          # Temporal UI
```

---

## Architecture

```
SDK (npm) → Ingestion API (FastAPI) → Kafka → Stream Processor → ClickHouse
                                                      ↓
                                               Temporal Worker ← Alerts
                                                      ↓
                                               AI Layer (LangChain + Claude)
                                                      ↓
                                        tRPC API → Next.js Dashboard
```

---

## Project structure

```
beacon/
├── packages/
│   ├── sdk/          @beacon/sdk — client npm package
│   ├── web/          Next.js 14 frontend
│   ├── api/          tRPC API server
│   ├── tsconfig/     shared TypeScript configs
│   └── eslint-config/ shared ESLint rules
├── services/
│   ├── ingestion/    FastAPI → Kafka producer
│   ├── processor/    Kafka consumer + health scoring
│   └── ai/           LangChain agents + RAG copilot
├── temporal/         Temporal workflows + activities
├── infra/            Pulumi IaC (AWS)
├── clickhouse/       Migrations SQL
└── tests/            E2E (Playwright) + Load (k6)
```

---

## Deploy to AWS

```bash
cd infra
pulumi up --stack prod
```

---

## Performance

| Metric | Result |
|---|---|
| Event ingestion throughput | 8,420 req/s |
| Ingestion latency p99 | 67ms |
| ClickHouse query (30d) | < 80ms |
| End-to-end (SDK → Dashboard) | < 3s |
