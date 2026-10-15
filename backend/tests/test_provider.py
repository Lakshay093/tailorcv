import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from google.genai import errors

from app.config import Settings
from app.errors import AppError
from app.llm import GeminiProvider
from app.schemas import JobAnalysis


def test_provider_settings_do_not_expose_secret(client):
    assert "gemini_api_key" not in client.get("/health").text


async def test_missing_credentials():
    with pytest.raises(AppError) as exc:
        await GeminiProvider(Settings(gemini_api_key="")).generate(JobAnalysis, "system", {})
    assert exc.value.code == "PROVIDER_NOT_CONFIGURED"


@pytest.mark.parametrize("exception,code,status", [
    (asyncio.TimeoutError(), "PROVIDER_TIMEOUT", 504),
    (errors.ClientError(429, {"error": {"message": "Quota exceeded"}}), "PROVIDER_QUOTA", 429),
    (errors.ClientError(403, {"error": {"message": "Invalid key"}}), "PROVIDER_AUTH", 503),
    (errors.ClientError(404, {"error": {"message": "Unknown model"}}), "MODEL_UNAVAILABLE", 503),
])
async def test_provider_failures(exception, code, status):
    generate = AsyncMock(side_effect=exception)
    session = SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    provider = GeminiProvider(Settings(gemini_api_key="test", provider_retries=0))
    with pytest.raises(AppError) as exc:
        await provider._call(session, JobAnalysis, "system", "{}")
    assert exc.value.code == code
    assert exc.value.status == status
    assert generate.await_count == 1


async def test_transient_retry_is_bounded(monkeypatch):
    generate = AsyncMock(side_effect=errors.ServerError(503, {"error": {"message": "Unavailable"}}))
    monkeypatch.setattr("app.llm.asyncio.sleep", AsyncMock())
    session = SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    with pytest.raises(AppError):
        await GeminiProvider(Settings(gemini_api_key="test", provider_retries=2))._call(session, JobAnalysis, "system", "{}")
    assert generate.await_count == 3


class FakeClient:
    responses = []
    calls = 0

    def __init__(self, **kwargs):
        self.aio = self
        self.models = self

    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass
    def close(self): pass

    async def generate_content(self, **kwargs):
        type(self).calls += 1
        return self.responses.pop(0)


def response(text, blocked=False):
    return SimpleNamespace(text=text, candidates=[], prompt_feedback=SimpleNamespace(block_reason="SAFETY" if blocked else None))


@pytest.mark.parametrize("repair_success", [True, False])
async def test_only_one_schema_repair(monkeypatch, repair_success):
    valid = json.dumps({"role": "Engineer", "requirements": [{"keyword": "Python", "description": "Python", "importance": "required"}]})
    FakeClient.calls = 0
    FakeClient.responses = [response("invalid"), response(valid if repair_success else "still invalid")]
    monkeypatch.setattr("app.llm.genai.Client", FakeClient)
    provider = GeminiProvider(Settings(gemini_api_key="test", provider_retries=0))
    if repair_success:
        assert (await provider.generate(JobAnalysis, "system", {})).role == "Engineer"
    else:
        with pytest.raises(AppError) as exc:
            await provider.generate(JobAnalysis, "system", {})
        assert exc.value.code == "INVALID_AI_OUTPUT"
    assert FakeClient.calls == 2


async def test_blocked_provider_response(monkeypatch):
    FakeClient.responses = [response("", blocked=True)]
    monkeypatch.setattr("app.llm.genai.Client", FakeClient)
    with pytest.raises(AppError) as exc:
        await GeminiProvider(Settings(gemini_api_key="test")).generate(JobAnalysis, "system", {})
    assert exc.value.code == "PROVIDER_BLOCKED"
