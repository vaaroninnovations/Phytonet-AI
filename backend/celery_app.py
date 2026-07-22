"""Celery scaffolding for PhytoNet AI.

This is a *scaffold*: broker and result backend are wired to Redis, but no
tasks are registered yet. Long-running jobs (Molecular Dynamics execution,
large docking batches, PDF report post-processing, etc.) can be added under
the ``backend.tasks`` package and auto-discovered by the ``include`` list
below.

Boot commands (docker-compose does this for you):

    celery -A backend.celery_app worker --loglevel=info --concurrency=2
    celery -A backend.celery_app beat   --loglevel=info

Environment variables:
    CELERY_BROKER_URL       (default: redis://redis:6379/0)
    CELERY_RESULT_BACKEND   (default: redis://redis:6379/1)
"""
from __future__ import annotations

import os

from celery import Celery

BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://redis:6379/0")
RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://redis:6379/1")

celery_app = Celery(
    "phytonet",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
    include=[],  # Add "backend.tasks.md", "backend.tasks.docking", ... here.
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=60 * 60,            # 1 h hard cap per task
    task_soft_time_limit=55 * 60,       # graceful cleanup 5 min before hard cap
    worker_prefetch_multiplier=1,       # long tasks — one at a time
    result_expires=60 * 60 * 24 * 7,    # keep results for 7 days
    broker_connection_retry_on_startup=True,
)

# Empty beat schedule — populate once periodic tasks exist.
celery_app.conf.beat_schedule = {}


@celery_app.task(name="phytonet.ping")
def ping() -> str:
    """Health-check task: `celery_app.send_task('phytonet.ping').get()` → 'pong'."""
    return "pong"


if __name__ == "__main__":  # pragma: no cover
    celery_app.start()
