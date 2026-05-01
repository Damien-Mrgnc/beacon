# Beacon — Suivi du projet

## Légende
- ✅ Terminé + commité
- 🔵 En cours / bloqué
- 🔴 Non commencé

---

## Modules

| # | Module | Status | Notes |
|---|--------|--------|-------|
| M01 | Monorepo setup (Turborepo, pnpm, Docker Compose, CI) | ✅ | `1fea836` |
| M02 | SDK `@beacon/sdk` — stubs TypeScript | ✅ | `ed3cbf2` — stubs, implem M02 complète à venir |
| M03 | Ingestion API (FastAPI, Kafka, Redis auth, OTEL) | ✅ | `0b28a37` — 21 tests |
| M04 | Stream Processor (consumer Kafka + scoring santé) | ✅ | `1b0545f` — 17 tests |
| M05 | ClickHouse schema (migrations, vues matérialisées, seeds) | ✅ | `50da8a0` |
| M06 | Temporal Workflows | ✅ | Commité — 7 tests |
| M07 | AI Layer (Gemini API) | ✅ | `feat/M07` — 11 tests, gemini-2.5-flash |
| M08 | tRPC API (`@beacon/api`) — implem complète | ✅ | Commité — 6 procédures |
| M09 | Next.js Frontend (`@beacon/web`) — implem complète | ✅ | `1ec0491` — build vert, 5 pages, dark theme |
| M10 | Pulumi IaC (AWS) | ✅ | Pulumi preview validé — 66 ressources, 0 erreur (voir `infra/PREVIEW.txt`) |
| M11 | Tests d'intégration + README final | ✅ | E2E Playwright 8/8 ✅ · k6 load test (1 550 events/s, 0% errors) · README enrichi |

---

## CI/CD GitHub Actions

| Job | Status | Notes |
|-----|--------|-------|
| TypeScript (typecheck + build) | ✅ | Build validé en local |
| Python ingestion | ✅ | `python -m pytest` — 21 tests |
| Python processor | ✅ | `python -m pytest` — 17 tests |
| Security (Trivy) | ✅ | Passe |
| Docker ingestion | ✅ | Passe |
| Docker processor | ✅ | Passe |

---

## Tests unitaires

| Service | Fichier | Tests | Status |
|---------|---------|-------|--------|
| ingestion | `tests/unit/test_models.py` | 13 | ✅ |
| ingestion | `tests/unit/test_enricher.py` | 8 | ✅ |
| processor | `tests/test_scoring.py` | 17 | ✅ |
| temporal | `tests/churnRisk.test.ts` | 7 | ✅ |
| ai | `tests/test_churn_analyst.py` | 11 | ✅ |

---

## Commits

| Hash | Module | Message |
|------|--------|---------|
| `1fea836` | M01 | monorepo setup |
| `0b28a37` | M03 | ingestion API |
| `50da8a0` | M05 | ClickHouse schema |
| `1b0545f` | M04 | stream processor |
| `ed3cbf2` | M02 | package stubs |
| `3e072e2` | CI | python -m pytest, pnpm fix, Next.js stubs |

---

## Stack locale vs AWS

| Composant | Local | Prod AWS |
|-----------|-------|----------|
| Kafka | Docker (Confluent) | MSK |
| ClickHouse | Docker | ClickHouse Cloud ou EC2 |
| Redis | Docker | ElastiCache |
| PostgreSQL | Docker | RDS |
| Temporal | Docker | Temporal Cloud |
| FastAPI | local/Docker | ECS Fargate |
| Next.js | `next dev` | Vercel / ECS |

---

## M09 — Direction artistique frontend

### Ambiance
Dark theme, sobre, dense en data. Référence : Linear, Vercel dashboard, Palantir Foundry.

### Couleurs
| Rôle | Valeur |
|------|--------|
| Background | `#0a0a0a` |
| Surface (cards) | `#111111` |
| Bordures | `#222222` |
| Texte principal | `#f5f5f5` |
| Texte secondaire | `#666666` |
| Accent | `#ffffff` |
| Healthy | `#22c55e` |
| At risk | `#f59e0b` |
| Critical | `#ef4444` |

### Typographie
- Font : **Geist** (Vercel)
- Chiffres/data : `font-mono`

### Layout
```
┌──────────────────────────────────────────┐
│  Sidebar fixe 240px   │  Main (fluid)    │
│  - Overview           │                  │
│  - Customers          │  Stat grid       │
│  - Alerts             │  Score cards     │
│  - Events             │  Customer table  │
└──────────────────────────────────────────┘
```

### Composants
- **Score card** — grand chiffre, couleur selon tier, tendance (↑ +0.05)
- **Sparkline** — graphe minimaliste inline dans les listes
- **Stat grid** — 4 metrics en haut (DAU, events/h, error rate, active features)
- **Customer table** — score coloré, tier badge, dernière activité
- **Alert banner** — clients en churn risk (score < 0.40)

### Règles
- Pas d'animations complexes
- Pas de gradients
- Couleurs vives uniquement pour les status (healthy / at_risk / critical)

---

*Dernière mise à jour : 2026-04-30*
