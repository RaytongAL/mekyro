from pathlib import Path
from urllib.parse import quote, urlparse
from uuid import uuid4

import anyio
import oss2
from fastapi import HTTPException, UploadFile, status

from app.core.config import Settings

ALLOWED_UPLOAD_EXTENSIONS = {".gif", ".jpeg", ".jpg", ".png", ".webp", ".xlsx"}


async def save_local_upload(
    upload: UploadFile,
    *,
    directory: Path,
    max_bytes: int,
) -> str:
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported upload file type",
        )

    destination = directory / f"{uuid4()}{suffix}"
    total = 0
    try:
        async with await anyio.open_file(destination, "wb") as output:
            while chunk := await upload.read(1024 * 1024):
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Upload exceeds the configured size limit",
                    )
                await output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()

    return f"/media/{destination.name}"


async def save_upload(
    upload: UploadFile,
    *,
    directory: Path,
    max_bytes: int,
    settings: Settings,
) -> str:
    if not _oss_configured(settings):
        return await save_local_upload(upload, directory=directory, max_bytes=max_bytes)

    suffix = _validated_suffix(upload)
    content = await _read_upload(upload, max_bytes=max_bytes)
    prefix = settings.oss_upload_prefix.strip("/")
    object_name = "/".join(part for part in (prefix, f"{uuid4()}{suffix}") if part)
    endpoint = _normalized_endpoint(settings.oss_endpoint)

    def put_object() -> None:
        auth = oss2.Auth(settings.oss_access_key_id, settings.oss_access_key_secret)
        bucket = oss2.Bucket(auth, endpoint, settings.oss_bucket_name)
        bucket.put_object(object_name, content)

    try:
        await anyio.to_thread.run_sync(put_object)
    except oss2.exceptions.OssError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Object storage upload failed",
        ) from exc

    endpoint_host = urlparse(endpoint).netloc
    return f"https://{settings.oss_bucket_name}.{endpoint_host}/{quote(object_name)}"


def _oss_configured(settings: Settings) -> bool:
    return all(
        (
            settings.oss_access_key_id,
            settings.oss_access_key_secret,
            settings.oss_endpoint,
            settings.oss_bucket_name,
        )
    )


def _validated_suffix(upload: UploadFile) -> str:
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported upload file type",
        )
    return suffix


async def _read_upload(upload: UploadFile, *, max_bytes: int) -> bytes:
    content = bytearray()
    try:
        while chunk := await upload.read(1024 * 1024):
            content.extend(chunk)
            if len(content) > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Upload exceeds the configured size limit",
                )
    finally:
        await upload.close()
    return bytes(content)


def _normalized_endpoint(endpoint: str) -> str:
    normalized = endpoint.strip().rstrip("/")
    if not normalized.startswith(("http://", "https://")):
        normalized = f"https://{normalized}"
    return normalized
