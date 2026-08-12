from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile

from app.core.config import Settings
from app.core.storage import save_upload


@pytest.mark.asyncio
async def test_save_upload_uses_oss_when_configured(monkeypatch, tmp_path):
    captured = {}

    class FakeBucket:
        def __init__(self, _auth, endpoint, bucket_name):
            captured["endpoint"] = endpoint
            captured["bucket_name"] = bucket_name

        def put_object(self, object_name, content):
            captured["object_name"] = object_name
            captured["content"] = content

    monkeypatch.setattr("app.core.storage.oss2.Bucket", FakeBucket)
    upload = UploadFile(filename="product.png", file=BytesIO(b"image-bytes"))
    settings = Settings(
        oss_access_key_id="key-id",
        oss_access_key_secret="key-secret",
        oss_endpoint="oss-cn-hongkong.aliyuncs.com",
        oss_bucket_name="bucket",
        oss_upload_prefix="products/uploads",
    )

    url = await save_upload(
        upload,
        directory=tmp_path,
        max_bytes=1024,
        settings=settings,
    )

    assert captured["endpoint"] == "https://oss-cn-hongkong.aliyuncs.com"
    assert captured["bucket_name"] == "bucket"
    assert captured["object_name"].startswith("products/uploads/")
    assert captured["object_name"].endswith(".png")
    assert captured["content"] == b"image-bytes"
    assert url.startswith("https://bucket.oss-cn-hongkong.aliyuncs.com/products/uploads/")


@pytest.mark.asyncio
async def test_save_upload_rejects_oversized_oss_file(tmp_path):
    upload = UploadFile(filename="product.png", file=BytesIO(b"too-large"))
    settings = Settings(
        oss_access_key_id="key-id",
        oss_access_key_secret="key-secret",
        oss_endpoint="oss-cn-hongkong.aliyuncs.com",
        oss_bucket_name="bucket",
    )

    with pytest.raises(HTTPException) as exc_info:
        await save_upload(upload, directory=tmp_path, max_bytes=4, settings=settings)

    assert exc_info.value.status_code == 413
