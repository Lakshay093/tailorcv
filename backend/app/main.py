import time
import uuid
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.config import get_settings
from app.errors import AppError
from app.routes import router

settings = get_settings()
app = FastAPI(title="TailorCV API", version="1.0.0", description="Stateless resume parsing, factual tailoring, keyword estimates, and exports.")
app.include_router(router)


def error_response(request: Request, code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "request_id": getattr(request.state, "request_id", str(uuid.uuid4()))}})


@app.exception_handler(AppError)
async def app_error(request: Request, exc: AppError):
    return error_response(request, exc.code, exc.message, exc.status)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Validation details never echo private input values.
    fields = list(dict.fromkeys(".".join(str(p) for p in item["loc"][1:]) for item in exc.errors()))
    return error_response(request, "VALIDATION_ERROR", "Check the request fields: " + ", ".join(fields[:8]), 422)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return error_response(request, "HTTP_ERROR", str(exc.detail), exc.status_code)


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    return error_response(request, "INTERNAL_ERROR", "An unexpected error occurred. Retry or contact the administrator with the request ID.", 500)


class RequestGuard:
    """Bound body memory and generation traffic. No document data is retained."""

    def __init__(self, app):
        self.app = app
        self.hits: dict[str, deque] = defaultdict(deque)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        request = Request(scope)
        request.state.request_id = str(uuid.uuid4())
        path = scope.get("path", "")
        if scope["method"] == "POST" and path in {"/api/resume/parse", "/api/resume/customize"}:
            now = time.monotonic()
            # Use server-observed peer address, never trust arbitrary X-Forwarded-For.
            # Configure Uvicorn trusted proxy IPs for your hosting ingress.
            ip = (scope.get("client") or ("unknown",))[0]
            for key in list(self.hits):
                while self.hits[key] and self.hits[key][0] <= now - 60:
                    self.hits[key].popleft()
                if not self.hits[key]:
                    del self.hits[key]
            bucket = self.hits[ip]
            if len(bucket) >= settings.rate_limit_per_minute or len(self.hits) > 10000:
                response = error_response(request, "RATE_LIMITED", "Too many AI requests. Wait a minute before trying again.", 429)
                response.headers["Retry-After"] = "60"
                return await response(scope, receive, send)
            bucket.append(now)
        limit = settings.max_upload_mb * 1024 * 1024 + 64 * 1024 if path.endswith("/parse") else 1024 * 1024
        body = bytearray()
        if scope["method"] == "POST":
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                body.extend(message.get("body", b""))
                if len(body) > limit:
                    return await error_response(request, "REQUEST_TOO_LARGE", "This request exceeds the server's upload or input limit.", 413)(scope, receive, send)
                if not message.get("more_body", False):
                    break
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        async def add_headers(message):
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).extend([(b"x-request-id", request.state.request_id.encode()), (b"cache-control", b"no-store"), (b"x-content-type-options", b"nosniff")])
            await send(message)
        await self.app(scope, replay if scope["method"] == "POST" else receive, add_headers)


app.add_middleware(RequestGuard)
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"], expose_headers=["Content-Disposition", "X-Request-ID", "Retry-After"])
