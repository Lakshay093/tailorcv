import pytest
from fastapi.testclient import TestClient

from app.llm import get_provider
from app.main import app
from tests.fixtures import MockProvider


@pytest.fixture
def client():
    app.dependency_overrides[get_provider] = lambda: MockProvider()
    with TestClient(app, client=("test-client", 50000)) as test_client:
        yield test_client
    app.dependency_overrides.clear()
