"""
QStash job queue client wrapper.

Provides a thin abstraction over the QStash SDK for enqueuing sync jobs.
Falls back gracefully when QStash is not configured (dev/test environments).
"""
import logging
from typing import Any, Dict, List, Optional

from api.config import settings

logger = logging.getLogger(__name__)


class QueueClient:
    """Wrapper around QStash SDK for enqueuing worker jobs."""

    def __init__(self) -> None:
        self._client: Optional[Any] = None
        self._available: Optional[bool] = None

    @property
    def available(self) -> bool:
        """Check if QStash is configured and usable."""
        if self._available is not None:
            return self._available

        if not settings.qstash_token or not settings.qstash_worker_url:
            self._available = False
            return False

        try:
            from qstash import QStash
            kwargs = {"token": settings.qstash_token}
            if settings.qstash_url:
                kwargs["base_url"] = settings.qstash_url
            self._client = QStash(**kwargs)
            self._available = True
        except Exception as e:
            logger.warning(f"QStash client init failed: {e}")
            self._available = False

        return self._available

    @property
    def client(self) -> Any:
        """Get the underlying QStash client, initializing if needed."""
        if self._client is None and self.available:
            pass  # available property initializes _client
        return self._client

    def enqueue(
        self,
        job_type: str,
        payload: Dict[str, Any],
        dedup_id: Optional[str] = None,
    ) -> bool:
        """
        Publish a job to QStash targeting /api/workers/{job_type}.

        Args:
            job_type: Worker endpoint name (e.g. "sync-gmail")
            payload: JSON-serializable dict for the worker
            dedup_id: Optional deduplication ID to prevent duplicate jobs

        Returns:
            True if enqueued successfully, False otherwise.
        """
        if not self.available:
            return False

        url = f"{settings.qstash_worker_url.rstrip('/')}/api/workers/{job_type}"

        try:
            kwargs: Dict[str, Any] = {
                "url": url,
                "body": payload,
                "retries": 3,
                "headers": {
                    "Authorization": f"Bearer {settings.cron_secret}",
                },
            }

            if dedup_id:
                kwargs["deduplication_id"] = dedup_id

            res = self.client.message.publish_json(**kwargs)
            logger.info(f"[Queue] Enqueued {job_type} → {res.message_id}")
            return True

        except Exception as e:
            logger.error(f"[Queue] Failed to enqueue {job_type}: {e}")
            return False

    def enqueue_sync_for_connection(
        self,
        connection_id: str,
        job_type: str,
        extra: Optional[Dict[str, Any]] = None,
        dedup_id: Optional[str] = None,
    ) -> bool:
        """
        Convenience method to enqueue a sync job for a single connection.

        Args:
            connection_id: The ext_connection ID
            job_type: Worker endpoint name (e.g. "sync-gmail")
            extra: Additional payload fields
            dedup_id: Optional custom deduplication ID

        Returns:
            True if enqueued successfully, False otherwise.
        """
        payload: Dict[str, Any] = {"connection_id": connection_id}
        if extra:
            payload.update(extra)

        resolved_dedup_id = dedup_id if dedup_id is not None else f"{job_type}-{connection_id}"
        return self.enqueue(job_type, payload, dedup_id=resolved_dedup_id)

    def enqueue_batch(
        self,
        job_type: str,
        connection_ids: List[str],
        extra: Optional[Dict[str, Any]] = None,
        dedup_id: Optional[str] = None,
    ) -> bool:
        """
        Convenience method to enqueue a batch sync job.

        Args:
            job_type: Worker endpoint name (e.g. "sync-gmail")
            connection_ids: List of ext_connection IDs
            extra: Additional payload fields
            dedup_id: Optional custom deduplication ID

        Returns:
            True if enqueued successfully, False otherwise.
        """
        if not connection_ids:
            return True

        payload: Dict[str, Any] = {"connection_ids": connection_ids}
        if extra:
            payload.update(extra)
        return self.enqueue(job_type, payload, dedup_id=dedup_id)


# Module-level singleton
queue_client = QueueClient()
