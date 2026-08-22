"""
S3 / Cloudflare R2 file storage service.

All resume files are stored in a private bucket. Browsers never get direct
S3 credentials — only presigned URLs with a 15-minute TTL are returned.

Cloudflare R2 is API-compatible with S3: set CLOUDFLARE_R2_ENDPOINT_URL in
your .env and boto3 will route there instead of AWS.
"""

from __future__ import annotations

import logging
import mimetypes
import os
from typing import Any
from uuid import UUID, uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level client — created once, reused across requests.
# boto3 clients are thread-safe for read operations and generally safe
# for concurrent use; see boto3 docs.
# ---------------------------------------------------------------------------

_s3_client: Any = None


def _get_client() -> Any:
    global _s3_client
    if _s3_client is None:
        kwargs: dict[str, Any] = {
            "service_name": "s3",
            "region_name": settings.aws_region,
            "aws_access_key_id": settings.aws_access_key_id,
            "aws_secret_access_key": settings.aws_secret_access_key,
            "config": Config(
                signature_version="s3v4",
                retries={"max_attempts": 3, "mode": "standard"},
            ),
        }
        # Cloudflare R2 / Backblaze B2 / MinIO: set CLOUDFLARE_R2_ENDPOINT_URL in .env.
        # Read from `settings`, not os.environ directly — pydantic-settings parses
        # .env into its own model without exporting to the process environment, so
        # a raw os.environ.get() here only ever sees this var in Docker/Render
        # (which set real OS env vars), never in local dev.
        if settings.cloudflare_r2_endpoint_url:
            kwargs["endpoint_url"] = settings.cloudflare_r2_endpoint_url

        _s3_client = boto3.client(**kwargs)
    return _s3_client


class StorageError(Exception):
    """Raised when an S3 operation fails after retries."""


class FileStorage:
    """
    Thin wrapper around boto3 S3 operations.

    Key structure:  resumes/{user_id}/{uuid}.{ext}
    """

    bucket: str = settings.s3_bucket_name

    # ------------------------------------------------------------------
    # Upload
    # ------------------------------------------------------------------

    def upload_resume(
        self,
        *,
        file_bytes: bytes,
        user_id: UUID,
        original_filename: str,
        mime_type: str,
    ) -> str:
        """
        Upload a resume file to S3. Returns the S3 object key (not the full URL).
        The key is stored in resumes.file_url and used to generate presigned URLs.
        """
        ext = _extension_for(mime_type, original_filename)
        key = f"resumes/{user_id}/{uuid4().hex}{ext}"

        try:
            _get_client().put_object(
                Bucket=self.bucket,
                Key=key,
                Body=file_bytes,
                ContentType=mime_type,
                # Deny all public access — objects are only reachable via presigned URL
                ACL="private",
            )
        except (BotoCoreError, ClientError) as exc:
            logger.error("S3 upload failed: key=%s error=%s", key, exc)
            raise StorageError(f"Upload failed: {exc}") from exc

        logger.info("Uploaded resume: key=%s size=%d", key, len(file_bytes))
        return key

    def upload_document(
        self,
        *,
        file_bytes: bytes,
        user_id: UUID,
        document_type: str,
    ) -> str:
        """
        Upload a generated PDF document to S3.
        Key structure: documents/{user_id}/{document_type}/{uuid}.pdf
        Returns the S3 object key.
        """
        key = f"documents/{user_id}/{document_type}/{uuid4().hex}.pdf"

        try:
            _get_client().put_object(
                Bucket=self.bucket,
                Key=key,
                Body=file_bytes,
                ContentType="application/pdf",
                ACL="private",
            )
        except (BotoCoreError, ClientError) as exc:
            logger.error("S3 upload failed: key=%s error=%s", key, exc)
            raise StorageError(f"Upload failed: {exc}") from exc

        logger.info("Uploaded document: key=%s size=%d", key, len(file_bytes))
        return key

    # ------------------------------------------------------------------
    # Download
    # ------------------------------------------------------------------

    def download(self, key: str) -> bytes:
        """Fetch an object's raw bytes from S3."""
        try:
            obj = _get_client().get_object(Bucket=self.bucket, Key=key)
            return obj["Body"].read()  # type: ignore[no-any-return]
        except (BotoCoreError, ClientError) as exc:
            logger.error("S3 download failed: key=%s error=%s", key, exc)
            raise StorageError(f"Download failed: {exc}") from exc

    # ------------------------------------------------------------------
    # Presigned URL
    # ------------------------------------------------------------------

    def presigned_url(self, key: str) -> str:
        """
        Generate a short-lived GET URL for a private S3 object.
        TTL is set by S3_PRESIGNED_URL_EXPIRY_SECONDS (default 900 = 15 min).
        """
        try:
            url: str = _get_client().generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=settings.s3_presigned_url_expiry_seconds,
            )
        except (BotoCoreError, ClientError) as exc:
            logger.error("Presigned URL failed: key=%s error=%s", key, exc)
            raise StorageError(f"Presigned URL generation failed: {exc}") from exc

        return url

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    def delete(self, key: str) -> None:
        """Delete an object from S3. Silently ignores 404 (already deleted)."""
        try:
            _get_client().delete_object(Bucket=self.bucket, Key=key)
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "NoSuchKey":
                return
            logger.error("S3 delete failed: key=%s error=%s", key, exc)
            raise StorageError(f"Delete failed: {exc}") from exc
        except BotoCoreError as exc:
            logger.error("S3 delete failed: key=%s error=%s", key, exc)
            raise StorageError(f"Delete failed: {exc}") from exc

        logger.info("Deleted S3 object: key=%s", key)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_MAX_FILENAME_LENGTH = 255


def sanitize_filename(filename: str) -> str:
    """
    Sanitize a user-supplied filename before it's persisted or echoed back
    via the API. The S3 object key is always UUID-based and unaffected by
    this value, but resumes.file_name stores the raw name verbatim — this
    strips path components and control characters and caps the length so a
    hostile filename can't cause issues in any future consumer of that
    column (e.g. a `Content-Disposition` header or a file-manager UI).
    """
    name = filename.replace("\\", "/")
    name = os.path.basename(name)
    name = "".join(ch for ch in name if ch.isprintable())
    name = name.strip()
    return name[:_MAX_FILENAME_LENGTH] if name else "resume"


def _extension_for(mime_type: str, original_filename: str) -> str:
    """Return file extension including the dot, e.g. '.pdf'."""
    ext = os.path.splitext(original_filename)[1].lower()
    if ext in (".pdf", ".docx"):
        return ext
    # Fall back to MIME type lookup
    guessed = mimetypes.guess_extension(mime_type)
    return guessed if guessed else ""


# Singleton used by services and routes
file_storage = FileStorage()
