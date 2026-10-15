import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import httpx
from google import genai
from google.genai import errors, types

from app.config import Settings
from app.errors import AppError
from app.llm import GeminiProvider, provider_json_schema
from app.schemas import JobAnalysis, StructuredResume, TailoringOutput


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


@pytest.mark.parametrize("schema", [StructuredResume, JobAnalysis, TailoringOutput])
async def test_sdk_sends_json_schema_without_openapi_conversion(schema):
    """Exercise the real SDK serializer; only its HTTP transport is replaced."""
    requests = []

    def respond(request):
        body = json.loads(request.content)
        requests.append(body)
        config = body["generationConfig"]
        assert "responseSchema" not in config
        assert config["responseMimeType"] == "application/json"
        assert config["responseJsonSchema"] == provider_json_schema(schema)
        assert config["responseJsonSchema"]["additionalProperties"] is False
        return httpx.Response(200, json={"candidates": [{"content": {"role": "model", "parts": [{"text": "{}"}]}, "finishReason": "STOP"}]})

    client = genai.Client(api_key="synthetic-test-key", http_options=types.HttpOptions(
        async_client_args={"transport": httpx.MockTransport(respond)},
        retry_options=types.HttpRetryOptions(attempts=1),
    ))
    try:
        async with client.aio as session:
            response = await GeminiProvider(Settings(gemini_api_key="synthetic-test-key", provider_retries=0))._call(session, schema, "Test system prompt", "{}")
            assert response.text == "{}"
    finally:
        client.close()
    assert len(requests) == 1


def test_generation_schema_compacts_bounds_without_weakening_local_validation():
    from pydantic import ValidationError
    from app.schemas import Resume
    from tests.fixtures import sample_resume

    wire = provider_json_schema(StructuredResume)
    assert "maxItems" not in wire["$defs"]["Resume"]["properties"]["skills"]
    assert "maxLength" not in wire["$defs"]["Contact"]["properties"]["name"]
    assert "title" in wire["$defs"]["Experience"]["properties"]
    assert wire["$defs"]["Resume"]["additionalProperties"] is False
    data = sample_resume().model_dump()
    data["skills"] = ["Python"] * 201
    with pytest.raises(ValidationError):
        Resume.model_validate(data)
