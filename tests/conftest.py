import os
from pathlib import Path

import pytest

# Engines and project folder: use environment variables if set, otherwise the standard D:\ folders.
os.environ.setdefault("NBL_INTELLIGENCE_STATE", str(Path(__file__).resolve().parents[1] / "state" / "_test"))


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    from nbl_intelligence.api import app
    return TestClient(app)
