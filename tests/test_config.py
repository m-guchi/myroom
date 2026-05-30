from backend import device_config, outdoor_config


def test_device_config_save_and_list(data_dir):
    saved = device_config.save_device_name(1, "リビング")
    assert saved == {"id": 1, "name": "リビング"}

    devices = device_config.list_devices(discovered_ids=[2])
    assert devices == [
        {"id": 1, "name": "リビング"},
        {"id": 2, "name": "寝室"},
    ]

    devices_with_new = device_config.list_devices(discovered_ids=[3])
    assert devices_with_new == [
        {"id": 1, "name": "リビング"},
        {"id": 2, "name": "寝室"},
        {"id": 3, "name": "デバイス 3"},
    ]


def test_device_config_rejects_invalid_name(data_dir):
    try:
        device_config.save_device_name(1, "  ")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "name is required" in str(exc)


def test_outdoor_config_save_and_get(data_dir):
    saved = outdoor_config.save_location(34.6937, 135.5023, "大阪")
    assert saved["name"] == "大阪"

    loaded = outdoor_config.get_location()
    assert loaded["latitude"] == 34.6937
    assert loaded["longitude"] == 135.5023
    assert loaded["name"] == "大阪"


def test_outdoor_config_rejects_invalid_latitude(data_dir):
    try:
        outdoor_config.save_location(100.0, 135.0, "bad")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "latitude" in str(exc)
