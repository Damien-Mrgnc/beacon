from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from aiokafka import AIOKafkaProducer
from clickhouse_driver import Client

from config import settings

logger = logging.getLogger(__name__)

TOPIC_ALERTS = "beacon.alerts"


async def get_previous_score(tenant_id: str, ch: Client) -> float | None:
    """Récupère le score précédent depuis ClickHouse."""
    result = ch.execute(
        """
        SELECT score
        FROM beacon.health_scores
        WHERE tenant_id = %(tenant_id)s
        ORDER BY computed_at DESC
        LIMIT 1
        """,
        {"tenant_id": tenant_id},
    )
    return result[0][0] if result else None


async def maybe_alert(
    tenant_id: str,
    score: float,
    producer: AIOKafkaProducer,
    ch: Client,
) -> None:
    """
    Publie une alerte dans beacon.alerts si :
    - Le score vient de passer sous le seuil critique (churn_risk)
    - Le score vient de remonter au-dessus du seuil de récupération (score_recovery)
    """
    prev_score = await get_previous_score(tenant_id, ch)

    # Déclenchement : score passe sous le seuil pour la première fois
    if score < settings.CHURN_THRESHOLD and (
        prev_score is None or prev_score >= settings.CHURN_THRESHOLD
    ):
        payload = {
            "type": "churn_risk",
            "tenant_id": tenant_id,
            "score": score,
            "previous_score": prev_score,
            "triggered_at": datetime.now(tz=timezone.utc).isoformat(),
        }
        await producer.send(
            TOPIC_ALERTS,
            key=tenant_id.encode(),
            value=json.dumps(payload).encode(),
        )
        logger.warning("CHURN RISK alert triggered for tenant=%s score=%.3f", tenant_id, score)

    # Récupération : score repasse au-dessus du seuil
    elif (
        prev_score is not None
        and prev_score < settings.RECOVERY_THRESHOLD
        and score >= settings.RECOVERY_THRESHOLD
    ):
        payload = {
            "type": "score_recovery",
            "tenant_id": tenant_id,
            "score": score,
            "previous_score": prev_score,
            "triggered_at": datetime.now(tz=timezone.utc).isoformat(),
        }
        await producer.send(
            TOPIC_ALERTS,
            key=tenant_id.encode(),
            value=json.dumps(payload).encode(),
        )
        logger.info("Score recovery for tenant=%s score=%.3f", tenant_id, score)
