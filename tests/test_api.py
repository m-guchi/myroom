def test_health_get(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db_mock": True}


def test_health_head(client):
    response = client.head("/api/health")
    assert response.status_code == 200


def test_latest_returns_mock_data(client):
    response = client.get("/api/latest?device=1")
    assert response.status_code == 200
    data = response.json()
    assert data["device_id"] == 1
    assert isinstance(data["temperature"], float)
    assert isinstance(data["illuminance"], float)
    assert data["outdoor_temperature"] == 25.0


def test_latest_rejects_invalid_device(client):
    response = client.get("/api/latest?device=0")
    assert response.status_code == 400


def test_sensor_accepts_co2_only(client):
    response = client.post(
        "/api/sensor?device=2",
        json={"datetime": "2026-05-30 12:00:00", "co2": 400},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "mock_ok"


def test_sensor_accepts_illuminance_only(client):
    response = client.post(
        "/api/sensor?device=1",
        json={"datetime": "2026-05-31 12:00:00", "illuminance": 123.4},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "mock_ok"


def test_sensor_rejects_empty_payload(client):
    response = client.post(
        "/api/sensor?device=1",
        json={"datetime": "2026-05-30 12:00:00"},
    )
    assert response.status_code == 422


def test_history_day_returns_records(client):
    response = client.get("/api/history?range=day&device=1")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "temperature" in data[0]


def test_history_year_returns_daily_aggregation(client):
    response = client.get("/api/history?range=year&device=1")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    sample = data[0]
    assert "temperature_min" in sample
    assert "temperature_max" in sample


def test_aircon_history_day_returns_records(client):
    response = client.get("/api/aircon/history?range=day&ac_id=1")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "temperature" in data[0]
    assert "target_temperature" in data[0]


def test_aircon_history_year_returns_daily_aggregation(client):
    response = client.get("/api/aircon/history?range=year&ac_id=1")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    sample = data[0]
    assert "temperature_min" in sample
    assert "temperature_max" in sample
    # 期間端の日は運転 OFF のみで target_temperature が無いことがある
    assert any("target_temperature" in row for row in data)


def test_daily_stats_returns_list(client):
    response = client.get("/api/daily-stats?device=1")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "temp_max" in data[0]


def test_devices_list(client):
    response = client.get("/api/devices")
    assert response.status_code == 200
    devices = response.json()["devices"]
    assert any(device["id"] == 1 for device in devices)


def test_update_device_name(client):
    response = client.put("/api/devices/1", json={"name": "テスト部屋"})
    assert response.status_code == 200
    assert response.json()["name"] == "テスト部屋"

    listed = client.get("/api/devices").json()["devices"]
    assert next(item for item in listed if item["id"] == 1)["name"] == "テスト部屋"


def test_update_device_name_rejects_empty(client):
    response = client.put("/api/devices/1", json={"name": "   "})
    assert response.status_code == 400


def test_outdoor_location_get(client):
    response = client.get("/api/outdoor-location")
    assert response.status_code == 200
    data = response.json()
    assert "latitude" in data
    assert "longitude" in data
    assert "name" in data


def test_outdoor_location_update(client):
    response = client.put(
        "/api/outdoor-location",
        json={"latitude": 35.0, "longitude": 135.5, "name": "大阪"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "大阪"


def test_outdoor_location_rejects_invalid_latitude(client):
    response = client.put(
        "/api/outdoor-location",
        json={"latitude": 999, "longitude": 135.5, "name": "bad"},
    )
    assert response.status_code == 400


def test_outdoor_location_search(client):
    response = client.get("/api/outdoor-location/search?q=大阪")
    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["name"] == "大阪"


def test_aircon_latest_returns_mock_data(client):
    response = client.get("/api/aircon/latest")
    assert response.status_code == 200
    data = response.json()
    assert data["room_temperature"] is not None
    assert data["target_temperature"] is not None
    assert data["mode"] == "COOLING"


def test_aircon_post_accepts_status(client):
    response = client.post(
        "/api/aircon",
        json={
            "datetime": "2026-05-30 12:00:00",
            "ac_id": 1,
            "name": "リビング",
            "room_temperature": 24.5,
            "target_temperature": 26.0,
            "mode": "COOLING",
            "power": "ON",
            "online": True,
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "mock_ok"


def test_aircon_units_list(client):
    response = client.get("/api/aircon/units")
    assert response.status_code == 200
    units = response.json()["units"]
    assert any(unit["ac_id"] == 1 for unit in units)


def test_update_aircon_unit_name(client):
    response = client.put("/api/aircon/units/1", json={"name": "寝室エアコン"})
    assert response.status_code == 200
    assert response.json()["name"] == "寝室エアコン"

    latest = client.get("/api/aircon/latest").json()
    assert latest["name"] == "寝室エアコン"


def test_update_aircon_unit_name_rejects_empty(client):
    response = client.put("/api/aircon/units/1", json={"name": "   "})
    assert response.status_code == 400


def test_records_list_returns_mock_data(client):
    response = client.get("/api/records?device=1")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["records"], list)
    assert len(data["records"]) > 0
    assert data["records"][0]["device_id"] == 1
    assert "datetime" in data["records"][0]


def test_records_delete_mock_ok(client):
    response = client.delete(
        "/api/records",
        params={"device": 1, "datetime": "2026-05-30 12:00:00"},
    )
    assert response.status_code == 200
    assert response.json()["deleted"] is True


def test_records_rejects_invalid_device(client):
    response = client.get("/api/records?device=0")
    assert response.status_code == 400


def test_aircon_daily_stats_returns_mock_data(client):
    response = client.get("/api/aircon/daily-stats?ac_id=1")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "temp_min" in data[0]
    assert "temp_max" in data[0]
    assert "humid_min" not in data[0]
