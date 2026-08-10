import asyncio
import base64
import hashlib
import hmac
import json
import smtplib
from datetime import UTC, datetime
from email.message import EmailMessage
from typing import Protocol
from urllib.parse import quote
from uuid import uuid4

import httpx

from app.core.config import Settings


class ChallengeDeliveryError(RuntimeError):
    pass


class ChallengeGateway(Protocol):
    async def verify_captcha(self, token: str, ip_address: str) -> bool: ...

    async def send_code(self, channel: str, target: str, code: str) -> None: ...


class DevelopmentChallengeGateway:
    """Local adapter used by the fake database and automated tests."""

    def __init__(self):
        self.deliveries: list[dict[str, str]] = []

    async def verify_captcha(self, token: str, ip_address: str) -> bool:
        del ip_address
        return token == "dev-captcha-pass"

    async def send_code(self, channel: str, target: str, code: str) -> None:
        self.deliveries.append({"channel": channel, "target": target, "code": code})

    def latest_code(self, channel: str, target: str) -> str | None:
        for delivery in reversed(self.deliveries):
            if delivery["channel"] == channel and delivery["target"] == target:
                return delivery["code"]
        return None


class AliyunSmtpChallengeGateway:
    CAPTCHA_ENDPOINT = "https://captcha.cn-shanghai.aliyuncs.com"
    SMS_ENDPOINT = "https://dysmsapi.aliyuncs.com"

    def __init__(
        self,
        settings: Settings,
        *,
        client: httpx.AsyncClient | None = None,
        smtp_factory=None,
    ) -> None:
        self.settings = settings
        self.client = client or httpx.AsyncClient(timeout=10)
        self._owns_client = client is None
        self.smtp_factory = smtp_factory

    async def verify_captcha(self, token: str, ip_address: str) -> bool:
        del ip_address
        if not self.settings.captcha_app_secret_key:
            raise ChallengeDeliveryError("Captcha gateway is not configured")
        data = await self._aliyun_call(
            endpoint=self.CAPTCHA_ENDPOINT,
            action="VerifyIntelligentCaptcha",
            version="2023-03-05",
            region="cn-shanghai",
            parameters={
                "CaptchaVerifyParam": token,
                "AppSecretKey": self.settings.captcha_app_secret_key,
            },
        )
        return data.get("Code") == "Success" and bool(
            (data.get("Result") or {}).get("VerifyResult")
        )

    async def send_code(self, channel: str, target: str, code: str) -> None:
        if channel == "sms":
            if not self.settings.sms_sign_name or not self.settings.sms_template_code:
                raise ChallengeDeliveryError("SMS gateway is not configured")
            data = await self._aliyun_call(
                endpoint=self.SMS_ENDPOINT,
                action="SendSms",
                version="2017-05-25",
                region="cn-hangzhou",
                parameters={
                    "PhoneNumbers": target,
                    "SignName": self.settings.sms_sign_name,
                    "TemplateCode": self.settings.sms_template_code,
                    "TemplateParam": json.dumps({"code": code}, separators=(",", ":")),
                },
            )
            if data.get("Code") != "OK":
                raise ChallengeDeliveryError("SMS provider rejected the delivery")
            return
        if channel != "email":
            raise ChallengeDeliveryError("Unsupported challenge channel")
        await asyncio.to_thread(self._send_email, target, code)

    async def _aliyun_call(
        self,
        *,
        endpoint: str,
        action: str,
        version: str,
        region: str,
        parameters: dict[str, str],
    ) -> dict:
        if not (
            self.settings.alibaba_cloud_access_key_id
            and self.settings.alibaba_cloud_access_key_secret
        ):
            raise ChallengeDeliveryError("Alibaba Cloud credentials are not configured")
        payload = {
            **parameters,
            "AccessKeyId": self.settings.alibaba_cloud_access_key_id,
            "Action": action,
            "Format": "JSON",
            "RegionId": region,
            "SignatureMethod": "HMAC-SHA1",
            "SignatureNonce": str(uuid4()),
            "SignatureVersion": "1.0",
            "Timestamp": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "Version": version,
        }
        payload["Signature"] = self._sign(payload)
        try:
            response = await self.client.post(endpoint, data=payload)
            response.raise_for_status()
            result = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ChallengeDeliveryError("Challenge provider is unavailable") from exc
        if not isinstance(result, dict):
            raise ChallengeDeliveryError("Challenge provider returned an invalid response")
        return result

    def _sign(self, parameters: dict[str, str]) -> str:
        canonical = "&".join(
            f"{_percent_encode(key)}={_percent_encode(str(parameters[key]))}"
            for key in sorted(parameters)
        )
        string_to_sign = f"POST&{_percent_encode('/')}&{_percent_encode(canonical)}"
        digest = hmac.new(
            f"{self.settings.alibaba_cloud_access_key_secret}&".encode(),
            string_to_sign.encode(),
            hashlib.sha1,
        ).digest()
        return base64.b64encode(digest).decode()

    def _send_email(self, target: str, code: str) -> None:
        settings = self.settings
        if not settings.smtp_user or not settings.smtp_password:
            raise ChallengeDeliveryError("SMTP gateway is not configured")
        message = EmailMessage()
        message["Subject"] = "Mekyro 登录验证码"
        message["From"] = f"Mekyro <{settings.smtp_user}>"
        message["To"] = target
        message.set_content(
            "您好！\n\n"
            f"您的 Mekyro 登录验证码是：{code}\n"
            "验证码 5 分钟内有效，请勿泄露给他人。\n\n"
            "如非本人操作，请忽略此邮件。\n\n"
            "Mekyro 团队"
        )
        factory = self.smtp_factory or (
            smtplib.SMTP_SSL if settings.smtp_secure else smtplib.SMTP
        )
        try:
            server = factory(settings.smtp_host, settings.smtp_port, timeout=10)
            if not settings.smtp_secure:
                server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)
            server.quit()
        except ChallengeDeliveryError:
            raise
        except Exception as exc:
            raise ChallengeDeliveryError("Email provider is unavailable") from exc

    async def close(self) -> None:
        if self._owns_client:
            await self.client.aclose()


def _percent_encode(value: str) -> str:
    return quote(str(value), safe="~").replace("+", "%20").replace("*", "%2A").replace(
        "%7E", "~"
    )
