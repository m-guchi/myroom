from backend import weather


def test_get_outdoor_history_evicts_expired_entries(monkeypatch):
    """期限切れの履歴キャッシュは、別のキーへのアクセスをきっかけに掃除される（#384）。"""
    weather._outdoor_history_cache.clear()
    weather._outdoor_history_inflight.clear()

    monkeypatch.setattr(
        weather,
        "_fetch_outdoor_history",
        lambda lat, lon, start_date, end_date: {
            "time": ["2026-01-01T00:00"],
            "temperature": [1.0],
            "humidity": [50.0],
            "pressure": [1013.0],
        },
    )
    monkeypatch.setattr(weather, "get_coords", lambda db=None, location_id=None: (35.0, 135.0))

    now = 1_000_000.0
    monkeypatch.setattr(weather.time, "time", lambda: now)
    weather.get_outdoor_history("2026-01-01", "2026-01-01")
    assert len(weather._outdoor_history_cache) == 1

    # TTL(300秒)を過ぎた後、別の期間を問い合わせると期限切れエントリが掃除される。
    now += weather._OUTDOOR_HISTORY_CACHE_TTL_SECONDS + 1
    weather.get_outdoor_history("2026-01-02", "2026-01-02")

    assert len(weather._outdoor_history_cache) == 1
    remaining_key = next(iter(weather._outdoor_history_cache))
    assert "2026-01-02" in remaining_key
