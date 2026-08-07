from pathlib import Path
from uuid import uuid4

import anyio
from fastapi import HTTPException, UploadFile, status

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
