# Beacon — Architecture Decisions

> Five key technical decisions, the alternatives considered, and why we chose what we chose.

---

## 1. Event Streaming — Kafka (MSK) vs SQS vs EventBridge

**Chosen: Apache Kafka (AWS MSK)**

| Criterion | Kafka | SQS | EventBridge |
|-----------|-------|-----|-------------|
| Multiple consumers | ✅ Consumer groups | ❌ One consumer per message | ✅ Fan-out |
| Message replay | ✅ Offset seek | ❌ Deleted on consume | ❌ No replay |
| Throughput | ✅ >1M msg/s | ✅ ~10k msg/s | ⚠️ ~10k/s |
| Partitioning by tenant | ✅ Native | ❌ Not supported | ❌ Not supported |
| Local dev | ✅ Docker image | ❌ Requires AWS | ❌ Requires AWS |

**Why Kafka:** Beacon needs three independent consumers on the same event stream — the stream processor, the audit logger, and future analytics consumers. Kafka's consumer groups allow adding new consumers without modifying producers. Replay from offset is essential for backfilling health scores after schema changes.

SQS would have been simpler for a single consumer, but the multi-consumer requirement and the need for replay ruled it out.

---

## 2. Analytics DB — ClickHouse vs BigQuery vs TimescaleDB

**Chosen: ClickHouse**

| Criterion | ClickHouse | BigQuery | TimescaleDB |
|-----------|-----------|---------|------------|
| Query latency (1M rows) | ✅ < 80ms | ⚠️ 1-3s | ⚠️ 200ms-1s |
| Cost model | ✅ Fixed (EC2) | ⚠️ Per-query | ✅ Fixed (RDS) |
| Materialized views | ✅ Real-time refresh | ⚠️ Scheduled | ✅ Continuous agg |
| Self-hosted | ✅ Yes | ❌ GCP only | ✅ Yes |
| TSDB-native compression | ✅ Column-store | ✅ Column-store | ✅ Chunks |

**Why ClickHouse:** Health score history queries span 30-90 days of per-tenant time series. ClickHouse's columnar engine and MergeTree table family compress this data 10-20x and answer aggregation queries in <80ms — required for real-time dashboard loads. BigQuery matches on query power but adds 1-3s latency per query (cold start) and would make the dashboard unusable for live updates. TimescaleDB is close but lacks ClickHouse's materialized view refresh granularity.

---

## 3. Workflow Orchestration — Temporal vs AWS Step Functions vs BullMQ

**Chosen: Temporal**

| Criterion | Temporal | Step Functions | BullMQ |
|-----------|----------|---------------|--------|
| Language | ✅ TypeScript native | ❌ JSON/YAML ASL | ✅ TypeScript |
| Deterministic replay | ✅ Yes | ✅ Yes | ❌ No |
| Local dev | ✅ Docker (auto-setup) | ❌ AWS only | ✅ Redis |
| Long-running (days/months) | ✅ Yes | ✅ Yes | ⚠️ TTL-limited |
| Visibility UI | ✅ Temporal UI | ⚠️ CloudWatch | ❌ None built-in |
| Vendor lock-in | ✅ Open source | ❌ AWS only | ✅ Open source |

**Why Temporal:** Onboarding workflows in Beacon can last weeks (wait for customer action → send reminder → escalate). Temporal's deterministic replay makes these workflows resumable after crashes without data loss. The TypeScript SDK means workflow code shares types with the rest of the monorepo. Step Functions would work but forces ASL JSON for all logic, losing type safety and making local development difficult.

BullMQ (Redis queues) was considered for simplicity but lacks durable state for multi-step workflows that span days.

---

## 4. IaC — Pulumi (TypeScript) vs Terraform vs CDK

**Chosen: Pulumi TypeScript**

| Criterion | Pulumi TS | Terraform | AWS CDK |
|-----------|-----------|-----------|---------|
| Language | ✅ TypeScript | ⚠️ HCL | ✅ TypeScript |
| Type safety | ✅ Full | ❌ None | ✅ Full |
| Shared types with app code | ✅ Yes (monorepo) | ❌ No | ⚠️ AWS only |
| Ecosystem maturity | ⚠️ Growing | ✅ Dominant | ✅ AWS native |
| Multi-cloud | ✅ Yes | ✅ Yes | ❌ AWS only |
| Conditional logic | ✅ Native `if/for` | ⚠️ `count`/`for_each` hacks | ✅ Native |

**Why Pulumi:** The monorepo structure allows Pulumi code in `infra/` to import types from `packages/` and `services/` directly. Complex conditional logic (e.g., different capacity per environment) is plain TypeScript, not HCL workarounds. The `pulumi.Output<T>` type system surfaces async resource dependencies at compile time.

Terraform is the industry standard and would be the safer choice for a team with existing TF knowledge. Pulumi is chosen here to demonstrate TypeScript-first infrastructure as a differentiator for FDE roles.

---

## 5. AI / LLM — Provider-agnostic router vs single-provider lock-in

**Chosen: LLM router with runtime provider selection**

Rather than hardcoding a single provider, Beacon implements a lightweight router in `services/ai/providers/` that selects the active model at startup based on which API key is present in the environment.

| Provider | Model | Context | Speed (p50) | Cost / 1M tokens | Structured output |
|----------|-------|---------|-------------|------------------|-------------------|
| Anthropic | claude-opus-4-6 | 200k tokens | ~3s | ~$15 | Yes |
| OpenAI | gpt-4o | 128k tokens | ~2s | ~$5 | Yes (JSON mode) |
| Google | gemini-2.5-flash | 1M tokens | ~1s | ~$0.15 | Yes |
| Mistral | mistral-large-latest | 128k tokens | ~2s | ~$2 | Yes (JSON mode) |

**Priority order (default):** `anthropic > openai > gemini > mistral` — overridable via `PROVIDER_PRIORITY` env var.

**Why a router instead of a fixed provider:**

1. **Enterprise deployments have provider constraints.** Customers may have existing contracts with OpenAI or Anthropic, data residency requirements that exclude certain providers, or security policies that forbid external API calls to specific vendors. A router makes Beacon deployable in any of these contexts without code changes.

2. **No single provider is dominant across all criteria.** Gemini Flash wins on cost and context length; Claude Opus wins on reasoning quality; GPT-4o wins on ecosystem tooling. The optimal choice depends on the deployment scenario.

3. **Graceful degradation.** If a key expires or a provider has an outage, changing `PROVIDER_PRIORITY` in the environment file is sufficient to switch — no rebuild required.

**What single-provider lock-in would have cost:** Every enterprise customer with a different AI vendor preference would require a code fork. The abstraction layer prevents this at the cost of one extra indirection in `providers/router.py`.

---

## Data Flow Diagram

```
┌─────────────┐     HTTPS      ┌──────────────────┐
│ @beacon/sdk │ ─────────────► │ Ingestion API    │
│  (npm pkg)  │                │ FastAPI :8000     │
└─────────────┘                └────────┬─────────┘
                                        │ Kafka topic
                                        │ beacon.events
                               ┌────────▼─────────┐
                               │ Stream Processor  │
                               │ Python consumer   │
                               └──┬────────────┬──┘
                                  │ writes      │ alerts
                         ┌────────▼──────┐  ┌──▼──────────────┐
                         │  ClickHouse   │  │ Temporal Worker  │
                         │  beacon DB    │  │ workflows        │
                         └────────┬──────┘  └──────────────────┘
                                  │ SQL via tRPC
                         ┌────────▼──────┐
                         │ tRPC API      │  ◄── AI Service (Gemini)
                         │ @beacon/api   │      FastAPI :8002
                         └────────┬──────┘
                                  │
                         ┌────────▼──────┐
                         │ Next.js Web   │
                         │ :3000         │
                         └───────────────┘
```

---

