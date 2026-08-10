from urllib.parse import parse_qs

import httpx
import pytest
from starlette.requests import Request

from app.core.client_ip import resolve_client_ip
from app.core.config import Settings
from app.modules.auth.challenge_gateway import (
    AliyunSmtpChallengeGateway,
    ChallengeDeliveryError,
)


def _settings(**overrides) -> Settings:
    values = {
        "alibaba_cloud_access_key_id": "access-key-id",
        "alibaba_cloud_access_key_secret": "access-key-secret",
        "captcha_app_secret_key": "captcha-secret",
        "sms_sign_name": "Mekyro",
        "sms_template_code": "SMS_123456",
        "smtp_host": "smtp.example.com",
        "smtp_port": 465,
        "smtp_user": "mailer@example.com",
        "smtp_password": "smtp-secret",
        "smtp_secure": True,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.mark.asyncio
async def test_aliyun_gateway_signs_captcha_and_sms_requests():
    requests: list[dict[str, list[str]]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = parse_qs(request.content.decode())
        requests.append(payload)
        if payload["Action"] == ["VerifyIntelligentCaptcha"]:
            return httpx.Response(
                200,
                json={"Code": "Success", "Result": {"VerifyResult": True}},
            )
        return httpx.Response(200, json={"Code": "OK", "RequestId": "sms-request"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        gateway = AliyunSmtpChallengeGateway(_settings(), client=client)
        assert await gateway.verify_captcha("captcha-token", "203.0.113.10") is True
        await gateway.send_code("sms", "8613800138000", "123456")

    captcha, sms = requests
    assert captcha["CaptchaVerifyParam"] == ["captcha-token"]
    assert captcha["AppSecretKey"] == ["captcha-secret"]
    assert captcha["Version"] == ["2023-03-05"]
    assert sms["PhoneNumbers"] == ["8613800138000"]
    assert sms["TemplateParam"] == ['{"code":"123456"}']
    assert sms["Version"] == ["2017-05-25"]
    assert all(payload["AccessKeyId"] == ["access-key-id"] for payload in requests)
    assert all(payload["Signature"][0] for payload in requests)


@pytest.mark.asyncio
async def test_aliyun_and_smtp_failures_use_stable_delivery_error():
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _request: httpx.Response(502, text="private error"))
    ) as client:
        gateway = AliyunSmtpChallengeGateway(_settings(), client=client)
        with pytest.raises(ChallengeDeliveryError, match="unavailable"):
            await gateway.verify_captcha("captcha-token", "203.0.113.10")

    gateway = AliyunSmtpChallengeGateway(
        _settings(smtp_user="", smtp_password=""),
        client=httpx.AsyncClient(transport=httpx.MockTransport(lambda _request: None)),
    )
    with pytest.raises(ChallengeDeliveryError, match="not configured"):
        await gateway.send_code("email", "owner@example.com", "123456")
    await gateway.client.aclose()


@pytest.mark.asyncio
async def test_smtp_gateway_delivers_login_code_without_exposing_credentials():
    calls: dict = {}

    class FakeSmtp:
        def __init__(self, host, port, timeout):
            calls["connection"] = (host, port, timeout)

        def login(self, username, password):
            calls["login"] = (username, password)

        def send_message(self, message):
            calls["message"] = message

        def quit(self):
            calls["quit"] = True

    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _request: None)) as client:
        gateway = AliyunSmtpChallengeGateway(
            _settings(),
            client=client,
            smtp_factory=FakeSmtp,
        )
        await gateway.send_code("email", "owner@example.com", "654321")

    assert calls["connection"] == ("smtp.example.com", 465, 10)
    assert calls["login"] == ("mailer@example.com", "smtp-secret")
    assert calls["message"]["To"] == "owner@example.com"
    assert "654321" in calls["message"].get_content()
    assert "smtp-secret" not in calls["message"].as_string()
    assert calls["quit"] is True


def _request(peer: str, forwarded_for: str = "") -> Request:
    headers = []
    if forwarded_for:
        headers.append((b"x-forwarded-for", forwarded_for.encode()))
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "https",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": headers,
            "client": (peer, 12345),
            "server": ("api.example.com", 443),
        }
    )


def test_client_ip_only_uses_forwarded_chain_from_trusted_proxies():
    spoofed = _request("198.51.100.7", "192.0.2.9")
    assert resolve_client_ip(spoofed, "10.0.0.0/8") == "198.51.100.7"

    proxied = _request("10.0.0.2", "192.0.2.99, 198.51.100.9, 10.1.0.3")
    assert resolve_client_ip(proxied, "10.0.0.0/8") == "198.51.100.9"

    internal = _request("10.0.0.2", "10.2.0.4, 10.1.0.3")
    assert resolve_client_ip(internal, "bad-cidr,10.0.0.0/8") == "10.2.0.4"
