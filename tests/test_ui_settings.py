from backend import ui_settings


def test_ui_settings_save_and_load(data_dir):
    saved = ui_settings.save_settings(
        {
            ui_settings.SETTING_DISPLAY_ORDER: ["device:2", "device:1", "outdoor", "aircon"],
            ui_settings.SETTING_HIDDEN_DEVICES: ["device:2"],
            ui_settings.SETTING_CHART_COLORS: {"device:1": "#3498db"},
        }
    )
    assert saved["display_order"][0] == "device:2"
    assert "device:2" in saved["hidden_devices"]

    loaded = ui_settings.get_settings()
    assert loaded["display_order"][0] == "device:2"
    assert loaded["chart_colors"]["device:1"] == "#3498db"
