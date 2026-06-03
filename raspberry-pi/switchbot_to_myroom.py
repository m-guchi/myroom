#!/usr/bin/env python3
"""
SwitchBot センサー (BLE) から値を読み取り、MyRoom API へ POST する。

対応機種:
  - Meter Pro (CO2) … 温度・湿度・CO2
  - 温湿度計 / 防水温湿度計 (WoSensorTH 等) … 温度・湿度

Pi Zero W 向け: BlueZ の btmon でスキャン（bleak / dbus-fast 不要）

使い方:
  python3 switchbot_to_myroom.py
  python3 switchbot_to_myroom.py --debug
  python3 switchbot_to_myroom.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# "auto" | "co2" | "meter"  (Python 3.7 互換のため Literal は使わない)
SensorKind = str

import requests
from dotenv import load_dotenv

SWITCHBOT_MFR_ID = 0x0969
JST = timezone(timedelta(hours=9))
HEX_BYTE_RE = re.compile(r"^[0-9a-fA-F]{2}$")


def _privileged_cmd(cmd: List[str]) -> List[str]:
    """btmon / hcitool need root; skip sudo when already running as root."""
    if os.geteuid() == 0:
        return cmd
    return ["sudo", *cmd]


@dataclass
class SensorReading:
    temperature: float
    humidity: int
    co2: Optional[int] = None
    battery: Optional[int] = None
    rssi: Optional[int] = None


@dataclass(frozen=True)
class SensorTarget:
    mac: str
    device_id: int
    name: Optional[str] = None
    kind: SensorKind = "auto"

    @property
    def label(self) -> str:
        return self.name or self.mac


def normalize_mac(mac: str) -> str:
    return mac.lower().replace("-", ":")


def _strip_switchbot_company_id(data: bytes) -> bytes:
    if len(data) >= 2 and data[0:2] in (bytes([0x69, 0x09]), bytes([0x09, 0x69])):
        return data[2:]
    return data


def _parse_th_triplet(
    data: bytes, dec_idx: int, int_idx: int, hum_idx: int
) -> Optional[Tuple[float, int]]:
    if hum_idx >= len(data):
        return None

    temp_decimal = (data[dec_idx] & 0x0F) * 0.1
    temp_integer = data[int_idx] & 0x7F
    temp_positive = (data[int_idx] & 0x80) > 0
    temperature = temp_decimal + temp_integer
    if not temp_positive:
        temperature = -temperature

    humidity = int(data[hum_idx] & 0x7F)
    if not (-40.0 <= temperature <= 60.0 and 0 <= humidity <= 99):
        return None

    return round(temperature, 1), humidity


def parse_switchbot_meter_payload(data: bytes) -> Optional[SensorReading]:
    """温湿度計 / 防水温湿度計 (WoSensorTH 等) の manufacturer data。"""
    body = _strip_switchbot_company_id(data)

    # 屋内型・防水型でオフセットが異なる（OpenWonderLabs / ble_monitor より）
    for dec_idx, int_idx, hum_idx in (
        (8, 9, 10),
        (10, 11, 12),
        (9, 10, 11),
        (6, 7, 8),
    ):
        parsed = _parse_th_triplet(body, dec_idx, int_idx, hum_idx)
        if parsed is None:
            continue
        temperature, humidity = parsed
        return SensorReading(temperature=temperature, humidity=humidity, co2=None)

    return None


def parse_switchbot_co2_payload(data: bytes) -> Optional[SensorReading]:
    """SwitchBot Meter Pro (CO2) の manufacturer data を解析する。"""
    body = _strip_switchbot_company_id(data)
    if len(body) < 15:
        return None

    temp_decimal = (body[8] & 0x0F) * 0.1
    temp_integer = body[9] & 0x7F
    temp_positive = (body[9] & 0x80) > 0 if len(body) >= 16 else (body[10] & 0x80) > 0

    temperature = temp_decimal + temp_integer
    if not temp_positive:
        temperature = -temperature

    humidity = int(body[10] & 0x7F)
    co2 = (body[13] << 8) | body[14]
    if not (400 <= co2 <= 10000):
        return None

    return SensorReading(
        temperature=round(temperature, 1),
        humidity=humidity,
        co2=co2,
    )


def parse_switchbot_payload(data: bytes, kind: SensorKind = "auto") -> Optional[SensorReading]:
    """機種に応じて温湿度 / CO2 を解析する。"""
    if kind == "meter":
        return parse_switchbot_meter_payload(data)
    if kind == "co2":
        return parse_switchbot_co2_payload(data)

    co2_reading = parse_switchbot_co2_payload(data)
    if co2_reading is not None:
        return co2_reading
    return parse_switchbot_meter_payload(data)


def parse_hex_line(line: str) -> Optional[bytes]:
    stripped = line.strip()
    if not stripped:
        return None

    # btmon 5.x: "Data: b0e9feb35fb5b7e4099e1f0318025700"
    if stripped.lower().startswith("data:"):
        hexstr = stripped.split(":", 1)[1].strip().replace(" ", "")
        if not hexstr or len(hexstr) % 2 != 0:
            return None
        try:
            return bytes.fromhex(hexstr)
        except ValueError:
            return None

    parts = stripped.split()
    if len(parts) < 3:
        return None
    try:
        if not all(HEX_BYTE_RE.match(p) for p in parts):
            return None
        return bytes(int(p, 16) for p in parts)
    except ValueError:
        return None


def _start_ble_scan(scan_timeout: int, debug: bool) -> Optional[subprocess.Popen]:
    """btmon だけではスキャンが始まらないため、hcitool lescan を並行起動する。"""
    if not shutil.which("hcitool"):
        if debug:
            print("warning: hcitool not found; scan may not receive advertisements")
        return None

    cmd = _privileged_cmd(
        ["timeout", str(int(scan_timeout)), "hcitool", "lescan", "--duplicates"]
    )
    if debug:
        print("running:", " ".join(cmd))

    return subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _stop_process(proc: Optional[subprocess.Popen]) -> None:
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=3)


def scan_switchbot_co2_btmon(
    target_mac: str,
    scan_timeout: float,
    debug: bool,
    match_any_switchbot: bool = False,
) -> SensorReading:
    """単一 MAC 向け（後方互換）。"""
    readings = scan_switchbot_co2_btmon_multi(
        target_macs={target_mac},
        scan_timeout=scan_timeout,
        debug=debug,
        match_any_switchbot=match_any_switchbot,
    )
    mac = normalize_mac(target_mac)
    if mac not in readings:
        raise RuntimeError(
            f"SwitchBot CO2 sensor not found within {scan_timeout:.0f}s "
            f"(mac={mac}). Move the Pi closer; SwitchBot advertises about every 5 minutes."
        )
    return readings[mac]


def scan_switchbot_co2_btmon_multi(
    target_macs: set[str],
    scan_timeout: float,
    debug: bool,
    match_any_switchbot: bool = False,
    require_all: bool = False,
    partial_grace_sec: float = 20,
    mac_kinds: Optional[Dict[str, SensorKind]] = None,
) -> Dict[str, SensorReading]:
    """BlueZ btmon + hcitool lescan で複数 MAC の BLE アドバタイズを読み取る。"""
    if not shutil.which("btmon"):
        raise RuntimeError(
            "btmon not found. Install BlueZ: sudo apt install -y bluez"
        )

    normalized_targets = {normalize_mac(mac) for mac in target_macs}
    if not normalized_targets:
        raise ValueError("target_macs is empty")

    timeout_sec = int(scan_timeout)
    btmon_cmd = _privileged_cmd(["timeout", str(timeout_sec), "btmon"])
    if debug:
        print("running:", " ".join(btmon_cmd))
        print("target macs:", ", ".join(sorted(normalized_targets)))

    btmon_proc = subprocess.Popen(
        btmon_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    time.sleep(0.5)
    scan_proc = _start_ble_scan(timeout_sec, debug)

    current_mac: Optional[str] = None
    capture_company_data = False
    found = {}  # type: Dict[str, SensorReading]
    pending_rssi = {}  # type: Dict[str, int]
    saw_advertisement = False
    first_found_at: Optional[float] = None
    allow_partial = not require_all and len(normalized_targets) > 1

    assert btmon_proc.stdout is not None
    try:
        for line in btmon_proc.stdout:
            if debug:
                print(line, end="")

            if "LE Advertising Report" in line:
                saw_advertisement = True

            addr_match = re.search(r"Address: ([0-9A-Fa-f:]+)", line)
            if addr_match:
                current_mac = normalize_mac(addr_match.group(1))
                capture_company_data = False
                continue

            rssi_match = re.search(r"RSSI: (-?\d+) dBm", line)
            if rssi_match and current_mac:
                pending_rssi[current_mac] = int(rssi_match.group(1))

            mac_ok = match_any_switchbot or (
                current_mac is not None and current_mac in normalized_targets
            )
            if not mac_ok:
                capture_company_data = False
                continue

            if "Company:" in line and (
                "0969" in line.lower() or "2409" in line or str(SWITCHBOT_MFR_ID) in line
            ):
                capture_company_data = True
                continue

            if capture_company_data and current_mac:
                data = parse_hex_line(line)
                capture_company_data = False
                if data is None:
                    continue

                kind = (mac_kinds or {}).get(current_mac, "auto")
                reading = parse_switchbot_payload(data, kind)
                if reading is None:
                    if debug:
                        print(
                            f"skip payload len={len(data)} kind={kind} hex={data.hex()}"
                        )
                    continue

                reading.rssi = pending_rssi.get(current_mac)
                found[current_mac] = reading
                if first_found_at is None:
                    first_found_at = time.monotonic()
                if debug:
                    print(
                        f"detected {current_mac} "
                        f"T={reading.temperature}C H={reading.humidity}% "
                        f"CO2={reading.co2}ppm rssi={reading.rssi}"
                    )

                if match_any_switchbot:
                    break
                if len(found) >= len(normalized_targets):
                    break

            if allow_partial and first_found_at is not None:
                if time.monotonic() - first_found_at >= partial_grace_sec:
                    if debug:
                        print(
                            f"partial scan: {len(found)}/{len(normalized_targets)} found, "
                            f"stopping after {partial_grace_sec:.0f}s grace"
                        )
                    break
    finally:
        _stop_process(scan_proc)
        _stop_process(btmon_proc)

    if not found:
        hint = (
            "No BLE advertisements captured. Try: sudo hciconfig hci0 up"
            if not saw_advertisement
            else f"No SwitchBot data for macs={sorted(normalized_targets)}"
        )
        if match_any_switchbot:
            hint = (
                "No SwitchBot (company 0x0969) advertisements found."
                if not saw_advertisement
                else "SwitchBot advertisement seen but payload could not be parsed."
            )
        raise RuntimeError(
            f"SwitchBot CO2 sensor(s) not found within {scan_timeout:.0f}s. {hint} "
            "Move the Pi closer; SwitchBot advertises about every 5 minutes."
        )

    return found


def now_jst_str() -> str:
    return datetime.now(JST).strftime("%Y-%m-%d %H:%M:%S")


def post_to_myroom(
    api_url: str,
    device_id: int,
    reading: SensorReading,
    timeout: int,
    dry_run: bool,
    device_name: Optional[str] = None,
) -> dict:
    payload = {
        "datetime": now_jst_str(),
        "temperature": reading.temperature,
        "humidity": reading.humidity,
    }  # type: Dict[str, object]
    if reading.co2 is not None:
        payload["co2"] = reading.co2
    params = {"device": device_id}  # type: Dict[str, object]
    if device_name:
        params["device_name"] = device_name

    if dry_run:
        print(f"[dry-run] POST {api_url} params={params}")
        print(f"[dry-run] payload: {payload}")
        return {"status": "dry_run", "payload": payload}

    response = requests.post(
        api_url,
        params=params,
        json=payload,
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def _parse_sensor_entry(raw: object, index: int) -> SensorTarget:
    if not isinstance(raw, dict):
        raise ValueError(f"sensors[{index}] must be an object")

    mac = raw.get("mac")
    device_id = raw.get("device_id")
    if not mac or not isinstance(mac, str):
        raise ValueError(f"sensors[{index}].mac is required")
    if device_id is None:
        raise ValueError(f"sensors[{index}].device_id is required")

    name = raw.get("name")
    kind_raw = raw.get("type") or raw.get("kind") or "auto"
    if kind_raw not in ("auto", "co2", "meter"):
        raise ValueError(
            f"sensors[{index}].type must be auto, co2, or meter (got {kind_raw!r})"
        )

    return SensorTarget(
        mac=normalize_mac(mac),
        device_id=int(device_id),
        name=str(name).strip() if name else None,
        kind=kind_raw,
    )


def parse_sensors_json_payload(payload: object) -> List[SensorTarget]:
    if isinstance(payload, list):
        entries = payload
    elif isinstance(payload, dict) and isinstance(payload.get("sensors"), list):
        entries = payload["sensors"]
    else:
        raise ValueError("sensors file must be a JSON array or {\"sensors\": [...]}")

    if not entries:
        raise ValueError("sensors list is empty")

    sensors = [_parse_sensor_entry(entry, index) for index, entry in enumerate(entries)]

    macs = [sensor.mac for sensor in sensors]
    if len(set(macs)) != len(macs):
        raise ValueError("duplicate mac in sensors config")

    device_ids = [sensor.device_id for sensor in sensors]
    if len(set(device_ids)) != len(device_ids):
        raise ValueError("duplicate device_id in sensors config")

    return sensors


def load_sensors_from_file(path: Path) -> List[SensorTarget]:
    if not path.is_file():
        raise FileNotFoundError(f"sensors file not found: {path}")
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    return parse_sensors_json_payload(payload)


def load_sensor_targets(
    *,
    sensors_file: Optional[str],
    sensors_json: str,
    mac: str,
    device_id: int,
) -> List[SensorTarget]:
    if sensors_file:
        return load_sensors_from_file(Path(sensors_file))

    if sensors_json.strip():
        return parse_sensors_json_payload(json.loads(sensors_json))

    default_file = Path(os.getenv("SWITCHBOT_SENSORS_FILE", "sensors.json"))
    if default_file.is_file():
        return load_sensors_from_file(default_file)

    if mac:
        return [SensorTarget(mac=normalize_mac(mac), device_id=device_id)]

    raise ValueError(
        "No sensors configured. Create sensors.json, set SWITCHBOT_SENSORS_JSON, "
        "or legacy SWITCHBOT_MAC + MYROOM_DEVICE_ID."
    )


def load_config() -> Tuple[argparse.Namespace, List[SensorTarget]]:
    load_dotenv()

    parser = argparse.ArgumentParser(description="SwitchBot CO2 -> MyRoom")
    parser.add_argument(
        "--sensors-file",
        default=os.getenv("SWITCHBOT_SENSORS_FILE", ""),
        help="JSON file listing sensors (mac + device_id). Default: sensors.json if present",
    )
    parser.add_argument(
        "--mac",
        default=os.getenv("SWITCHBOT_MAC", ""),
        help="Single sensor MAC (legacy; use sensors.json for multiple)",
    )
    parser.add_argument(
        "--api-url",
        default=os.getenv(
            "MYROOM_API_URL",
            "https://myroom.gucchii.com/api/sensor",
        ),
        help="MyRoom POST endpoint URL",
    )
    parser.add_argument(
        "--device-id",
        type=int,
        default=int(os.getenv("MYROOM_DEVICE_ID", "2")),
        help="device query parameter when using --mac / SWITCHBOT_MAC",
    )
    parser.add_argument(
        "--scan-timeout",
        type=float,
        default=float(os.getenv("SCAN_TIMEOUT", "90")),
        help="BLE scan timeout in seconds",
    )
    parser.add_argument(
        "--http-timeout",
        type=int,
        default=int(os.getenv("HTTP_TIMEOUT", "30")),
        help="HTTP request timeout in seconds",
    )
    parser.add_argument("--debug", action="store_true", help="Print debug logs")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scan only; do not POST to API",
    )
    parser.add_argument(
        "--match-any-switchbot",
        action="store_true",
        default=os.getenv("MATCH_ANY_SWITCHBOT", "").lower() in ("1", "true", "yes"),
        help="Accept the first SwitchBot (0x0969) device, ignore MAC filter",
    )
    parser.add_argument(
        "--require-all",
        action="store_true",
        default=os.getenv("REQUIRE_ALL_SENSORS", "").lower() in ("1", "true", "yes"),
        help="Exit with error unless every configured sensor is found and posted",
    )
    parser.add_argument(
        "--partial-grace",
        type=float,
        default=float(os.getenv("PARTIAL_SCAN_GRACE_SEC", "20")),
        help="After the first sensor is found, wait this many seconds for others (default: 20)",
    )

    args = parser.parse_args()
    sensors_json = os.getenv("SWITCHBOT_SENSORS_JSON", "")

    try:
        sensors = load_sensor_targets(
            sensors_file=args.sensors_file or None,
            sensors_json=sensors_json,
            mac=args.mac,
            device_id=args.device_id,
        )
    except (ValueError, json.JSONDecodeError, FileNotFoundError) as exc:
        parser.error(str(exc))

    if args.match_any_switchbot and len(sensors) > 1:
        parser.error("--match-any-switchbot supports only one configured sensor")

    return args, sensors


def main() -> int:
    try:
        args, sensors = load_config()

        if args.debug:
            print(f"api url: {args.api_url}")
            print(f"scan timeout: {args.scan_timeout}s")
            print(f"sensors ({len(sensors)}):")
            for sensor in sensors:
                print(f"  - {sensor.label}: mac={sensor.mac} device={sensor.device_id}")

        target_macs = {sensor.mac for sensor in sensors}
        mac_kinds = {sensor.mac: sensor.kind for sensor in sensors}
        readings = scan_switchbot_co2_btmon_multi(
            target_macs=target_macs,
            scan_timeout=args.scan_timeout,
            debug=args.debug,
            match_any_switchbot=args.match_any_switchbot,
            require_all=args.require_all,
            partial_grace_sec=args.partial_grace,
            mac_kinds=mac_kinds,
        )

        if args.match_any_switchbot and readings:
            only_mac = next(iter(readings))
            sensors = [
                SensorTarget(
                    mac=only_mac,
                    device_id=sensors[0].device_id,
                    name=sensors[0].name,
                )
            ]

        errors = []  # type: List[str]
        posted = 0

        for sensor in sensors:
            reading = readings.get(sensor.mac)
            if reading is None:
                msg = f"not found: {sensor.label} ({sensor.mac})"
                print(f"warning: {msg}", file=sys.stderr)
                errors.append(msg)
                continue

            co2_part = (
                f" CO2={reading.co2}ppm" if reading.co2 is not None else ""
            )
            print(
                f"read [{sensor.label}]: T={reading.temperature}C H={reading.humidity}%"
                f"{co2_part} battery={reading.battery}"
            )

            try:
                result = post_to_myroom(
                    api_url=args.api_url,
                    device_id=sensor.device_id,
                    reading=reading,
                    timeout=args.http_timeout,
                    dry_run=args.dry_run,
                    device_name=sensor.name,
                )
                print(f"posted [{sensor.label}] device={sensor.device_id}: {result}")
                posted += 1
            except requests.HTTPError as exc:
                msg = (
                    f"API error for {sensor.label} (device={sensor.device_id}): "
                    f"{exc.response.status_code} {exc.response.text}"
                )
                print(msg, file=sys.stderr)
                errors.append(msg)

        if posted == 0:
            raise RuntimeError("No sensor data posted. " + "; ".join(errors))

        if errors and args.require_all:
            raise RuntimeError("Missing or failed sensors. " + "; ".join(errors))

        if errors:
            print(
                f"partial success: posted {posted}/{len(sensors)} sensor(s)",
                file=sys.stderr,
            )

        return 0
    except requests.HTTPError as exc:
        print(f"API error: {exc.response.status_code} {exc.response.text}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
