"""Browser-test entrypoint, deliberately outside the production application package."""
from app.llm import get_provider
from app.main import app
from tests.fixtures import MockProvider

app.dependency_overrides[get_provider] = lambda: MockProvider()
