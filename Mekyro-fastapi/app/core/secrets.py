import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import Settings


class SecretDecryptionError(ValueError):
    pass


def _fernet(settings: Settings) -> Fernet:
    configured = settings.credential_encryption_key.strip()
    if configured:
        key = configured.encode("ascii")
    else:
        # Development fallback keeps fake databases reproducible. Production
        # deployments should configure a distinct rotation-managed key.
        digest = hashlib.sha256(settings.jwt_secret.encode("utf-8")).digest()
        key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(value: str, settings: Settings) -> str:
    if not value:
        return ""
    return _fernet(settings).encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str, settings: Settings) -> str:
    if not value:
        return ""
    try:
        return _fernet(settings).decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise SecretDecryptionError("Stored credential cannot be decrypted") from exc


def mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 4:
        return "****"
    return f"{'*' * min(12, len(value) - 4)}{value[-4:]}"
