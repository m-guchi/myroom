import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "raspberry-pi" / "switchbot_to_myroom.py"

spec = importlib.util.spec_from_file_location("switchbot_to_myroom", MODULE_PATH)
switchbot = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules["switchbot_to_myroom"] = switchbot
spec.loader.exec_module(switchbot)


class SwitchbotSensorsConfigTest(unittest.TestCase):
    def test_parse_array_payload(self):
        sensors = switchbot.parse_sensors_json_payload(
            [
                {"mac": "aa:bb:cc:dd:ee:ff", "device_id": 2, "name": "寝室"},
                {"mac": "11:22:33:44:55:66", "device_id": 4},
            ]
        )
        self.assertEqual(len(sensors), 2)
        self.assertEqual(sensors[0].mac, "aa:bb:cc:dd:ee:ff")
        self.assertEqual(sensors[1].device_id, 4)

    def test_parse_wrapped_payload(self):
        sensors = switchbot.parse_sensors_json_payload(
            {"sensors": [{"mac": "AA-BB-CC-DD-EE-FF", "device_id": 3}]}
        )
        self.assertEqual(sensors[0].mac, "aa:bb:cc:dd:ee:ff")

    def test_rejects_duplicate_mac(self):
        payload = [
            {"mac": "aa:bb:cc:dd:ee:ff", "device_id": 2},
            {"mac": "aa:bb:cc:dd:ee:ff", "device_id": 3},
        ]
        with self.assertRaises(ValueError):
            switchbot.parse_sensors_json_payload(payload)

    def test_load_from_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sensors.json"
            path.write_text(
                json.dumps([{"mac": "aa:bb:cc:dd:ee:ff", "device_id": 2}]),
                encoding="utf-8",
            )
            sensors = switchbot.load_sensors_from_file(path)
            self.assertEqual(sensors[0].device_id, 2)

    def test_legacy_mac_fallback(self):
        sensors = switchbot.load_sensor_targets(
            sensors_file=None,
            sensors_json="",
            mac="AA:BB:CC:DD:EE:FF",
            device_id=2,
        )
        self.assertEqual(len(sensors), 1)
        self.assertEqual(sensors[0].mac, "aa:bb:cc:dd:ee:ff")

    def test_sensor_type_meter(self):
        sensors = switchbot.parse_sensors_json_payload(
            [
                {
                    "mac": "de:64:44:46:32:54",
                    "device_id": 4,
                    "type": "meter",
                }
            ]
        )
        self.assertEqual(sensors[0].kind, "meter")


class SwitchbotPayloadParseTest(unittest.TestCase):
    def test_parse_waterproof_meter_sample(self):
        # ble_monitor: temp 24.3C, humidity 31%
        payload = bytes.fromhex(
            "6909c76b0406155eff0203981f00"
        )
        reading = switchbot.parse_switchbot_meter_payload(payload)
        self.assertIsNotNone(reading)
        assert reading is not None
        self.assertAlmostEqual(reading.temperature, 24.3)
        self.assertEqual(reading.humidity, 31)
        self.assertIsNone(reading.co2)

    def test_parse_co2_meter_sample(self):
        body = bytes(15)
        body = bytearray(body)
        body[8] = 0x03
        body[9] = 0x98
        body[10] = 0x1F
        body[13] = 0x02
        body[14] = 0x58
        reading = switchbot.parse_switchbot_co2_payload(bytes(body))
        self.assertIsNotNone(reading)
        assert reading is not None
        self.assertEqual(reading.co2, 0x0258)


if __name__ == "__main__":
    unittest.main()
