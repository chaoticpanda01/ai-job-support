"""
Celery application configuration.

Two queues:
  documents — PDF generation tasks (Phase 2)
  analysis  — resume AI analysis tasks (Phase 1)

Workers are started with:
  celery -A app.workers.celery_app worker --queues=documents,analysis --concurrency=2
"""

from __future__ import annotations

from celery import Celery

from app.config import settings

celery_app = Celery(
    "ai_job_support",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.workers.analysis_tasks",
        "app.workers.document_tasks",
    ],
)

celery_app.conf.update(
    # Serialisation
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Timezone
    timezone="UTC",
    enable_utc=True,
    # Routing
    task_routes={
        "app.workers.analysis_tasks.*": {"queue": "analysis"},
        "app.workers.document_tasks.*": {"queue": "documents"},
    },
    # Results expire after 24 hours — clients should fetch and store results
    result_expires=86400,
    # Acknowledge tasks only after completion (safer for idempotent tasks)
    task_acks_late=True,
    # Retry connection to broker on startup
    broker_connection_retry_on_startup=True,
    # Visibility timeout: 10 minutes — tasks taking longer are re-queued
    broker_transport_options={"visibility_timeout": 600},
)
