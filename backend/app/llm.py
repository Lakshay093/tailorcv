import asyncio
import json
from typing import TypeVar

import httpx
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

from app.config import Settings, get_settings
from app.errors import AppError

T = TypeVar("T", bound=BaseModel)


class GeminiProvider:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def generate(self, schema: type[T], system: str, data: dict) -> T:
        if not self.settings.gemini_api_key:
            raise AppError("PROVIDER_NOT_CONFIGURED", "The server needs GEMINI_API_KEY before AI processing can run.", 503)
        # Disable SDK retries: the application owns the explicit, bounded retry budget.
        client = genai.Client(api_key=self.settings.gemini_api_key, http_options=types.HttpOptions(
            timeout=int(self.settings.provider_timeout_seconds * 1000),
            retry_options=types.HttpRetryOptions(attempts=1),
        ))
        prompt = json.dumps(data, ensure_ascii=False)
        try:
            async with client.aio as session:
                for repair in range(2):
                    response = await self._call(session, schema, system, prompt)
                    if response.prompt_feedback and response.prompt_feedback.block_reason:
                        raise AppError("PROVIDER_BLOCKED", "The AI provider blocked this request. Review the document content and try again.", 422)
                    candidates = response.candidates or []
                    if candidates and str(candidates[0].finish_reason).split(".")[-1] not in {"STOP", "None"}:
                        raise AppError("PROVIDER_BLOCKED", "The AI response was blocked or incomplete. Try a shorter document.", 422)
                    try:
                        return schema.model_validate_json(response.text or "")
                    except (ValidationError, ValueError):
                        if repair:
                            raise AppError("INVALID_AI_OUTPUT", "The AI returned an invalid structured response after one repair attempt. Your inputs are preserved; try again.", 502)
                        # Regenerate from the original inputs, never blindly trust invalid output.
                        prompt += "\nReturn a complete JSON object exactly matching the supplied schema. The previous response failed schema validation. Do not add Markdown."
        except AppError:
            raise
        except (httpx.HTTPError, OSError) as exc:
            raise AppError("PROVIDER_UNAVAILABLE", "The AI provider could not be reached. Try again shortly.", 503) from exc
        finally:
            client.close()
        raise AppError("INVALID_AI_OUTPUT", "The AI returned no usable response.", 502)

    async def _call(self, session, schema: type[T], system: str, prompt: str):
        for attempt in range(self.settings.provider_retries + 1):
            try:
                return await asyncio.wait_for(session.models.generate_content(
                    model=self.settings.gemini_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(system_instruction=system, response_mime_type="application/json", response_schema=schema, temperature=0.2, max_output_tokens=20000),
                ), timeout=self.settings.provider_timeout_seconds)
            except errors.APIError as exc:
                status = int(exc.code or 500)
                if status in {429, 500, 502, 503, 504} and attempt < self.settings.provider_retries:
                    await asyncio.sleep(0.5 * 2**attempt)
                    continue
                code, message, http_status = {
                    400: ("PROVIDER_REQUEST_REJECTED", "The AI provider rejected the request or configuration. Check the server model and API key.", 502),
                    401: ("PROVIDER_AUTH", "The server's AI credentials are invalid. Contact the administrator.", 503),
                    403: ("PROVIDER_AUTH", "The server's AI credentials do not have access to this model.", 503),
                    404: ("MODEL_UNAVAILABLE", "The configured AI model is unavailable. Check GEMINI_MODEL on the server.", 503),
                    429: ("PROVIDER_QUOTA", "The AI provider quota is exhausted. Try again later or check the server's billing and limits.", 429),
                }.get(status, ("PROVIDER_UNAVAILABLE", "The AI provider is temporarily unavailable. Please retry.", 503))
                raise AppError(code, message, http_status) from exc
            except (asyncio.TimeoutError, httpx.TimeoutException) as exc:
                if attempt < self.settings.provider_retries:
                    await asyncio.sleep(0.5 * 2**attempt)
                    continue
                raise AppError("PROVIDER_TIMEOUT", "The AI provider took too long to respond. Your inputs are preserved; try again.", 504) from exc
        raise AppError("PROVIDER_UNAVAILABLE", "The AI provider is unavailable.", 503)


def get_provider() -> GeminiProvider:
    return GeminiProvider(get_settings())
