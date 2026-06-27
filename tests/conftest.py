import os

os.environ["DB_MOCK"] = "true"
os.environ.setdefault("APP_PASSWORD", "admin")

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "backend.device_config.CONFIG_PATH",
        tmp_path / "devices.json",
    )
    monkeypatch.setattr(
        "backend.aircon_config.CONFIG_PATH",
        tmp_path / "aircon.json",
    )
    monkeypatch.setattr(
        "backend.outdoor_config.CONFIG_PATH",
        tmp_path / "outdoor_location.json",
    )
    monkeypatch.setattr(
        "backend.ui_settings.CONFIG_PATH",
        tmp_path / "ui_settings.json",
    )
    return tmp_path


@pytest.fixture
def auth_headers(client):
    response = client.post("/api/login", json={"password": os.environ["APP_PASSWORD"]})
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mock_weather(monkeypatch):
    def outdoor_weather():
        return {"temperature": 25.0, "humidity": 60.0, "pressure": 1013.0}

    def outdoor_history(start, end):
        return {"time": [], "temperature": [], "humidity": [], "pressure": []}

    def search_locations(query, count=8):
        if query.strip() == "大阪":
            return [
                {
                    "name": "大阪",
                    "label": "大阪, 大阪府, 日本",
                    "latitude": 34.6937,
                    "longitude": 135.5023,
                }
            ]
        return []

    monkeypatch.setattr("backend.weather.get_outdoor_weather", outdoor_weather)
    monkeypatch.setattr("backend.weather.get_outdoor_history", outdoor_history)
    monkeypatch.setattr("backend.weather.search_locations", search_locations)


@pytest.fixture
def client(data_dir, mock_weather):
    from backend.main import app

    with TestClient(app) as test_client:
        yield test_client
