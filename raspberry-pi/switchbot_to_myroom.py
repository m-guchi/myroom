#!/usr/bin/env python3
"""
SwitchBot CO2 センサー (BLE) から値を読み取り、MyRoom API へ POST する。

Pi Zero W 向け: BlueZ の btmon でスキャン（bleak / dbus-fast 不要）

使い方:
  python3 switchbot_to_myroom.py
  python3 switchbot_to_myroom.py --debug
  python3 switchbot_to_myroom.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests
from dotenv import load_dotenv

SWITCHBOT_MFR_ID = 0x0969
JST = timezone(timedelta(hours=9))
HEX_BYTE_RE = re.compile(r"^[0-9a-fA-F]{2}$")


def _privileged_cmd(cmd: list[str]) -> list[str]:
    """btmon / hcitool need root; skip sudo when already running as root."""
    if os.geteuid() == 0:
        return cmd
    return ["sudo", *cmd]


@dataclass
class SensorReading:
    temperature: float
    humidity: int
    co2: int
    battery: Optional[int] = None
    rssi: Optional[int] = None


def normalize_mac(mac: str) -> str:
    return mac.lower().replace("-", ":")


def parse_switchbot_co2_payload(data: bytes) -> Optional[SensorReading]:
    """SwitchBot Meter Pro (CO2) の manufacturer data を解析する。"""
    if len(data) >= 2 and data[0:2] in (bytes([0x69, 0x09]), bytes([0x09, 0x69])):
        data = data[2:]

    if len(data) < 15:
        return None

    temp_decimal = (data[8] & 0x0F) * 0.1
    temp_integer = data[9] & 0x7F
    temp_sign = (data[9] & 0x80) > 0 if len(data) >= 16 else (data[10] & 0x80) > 0

    temperature = temp_decimal + temp_integer
    if not temp_sign:
        temperature = -temperature

    humidity = int(data[10] & 0x7F)
    co2 = (data[13] << 8) | data[14]

    return SensorReading(
        temperature=round(temperature, 1),
        humidity=humidity,
        co2=co2,
    )


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
    """BlueZ btmon + hcitool lescan で BLE アドバタイズを読み取る（Pi Zero W 向け）。"""
    if not shutil.which("btmon"):
        raise RuntimeError(
            "btmon not found. Install BlueZ: sudo apt install -y bluez"
        )

    target_mac = normalize_mac(target_mac)
    timeout_sec = int(scan_timeout)

    btmon_cmd = _privileged_cmd(["timeout", str(timeout_sec), "btmon"])
    if debug:
        print("running:", " ".join(btmon_cmd))

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
    found: Optional[SensorReading] = None
    found_rssi: Optional[int] = None
    found_mac: Optional[str] = None
    saw_advertisement = False

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
            if rssi_match:
                if match_any_switchbot or current_mac == target_mac:
                    found_rssi = int(rssi_match.group(1))

            mac_ok = match_any_switchbot or current_mac == target_mac
            if not mac_ok:
                capture_company_data = False
                continue

            if "Company:" in line and (
                "0969" in line.lower() or "2409" in line or str(SWITCHBOT_MFR_ID) in line
            ):
                capture_company_data = True
                continue

            if capture_company_data:
                data = parse_hex_line(line)
                capture_company_data = False
                if data is None:
                    continue

                reading = parse_switchbot_co2_payload(data)
                if reading is None:
                    if debug:
                        print(f"skip payload len={len(data)} hex={data.hex()}")
                    continue

                found = reading
                found_mac = current_mac
                if debug:
                    print(
                        f"detected {current_mac} "
                        f"T={reading.temperature}C H={reading.humidity}% "
                        f"CO2={reading.co2}ppm rssi={found_rssi}"
                    )
                break
    finally:
        _stop_process(scan_proc)
        _stop_process(btmon_proc)

    if found is None:
        hint = (
            "No BLE advertisements captured. Try: sudo hciconfig hci0 up"
            if not saw_advertisement
            else f"No SwitchBot data for mac={target_mac}"
        )
        if match_any_switchbot:
            hint = (
                "No SwitchBot (company 0x0969) advertisements found."
                if not saw_advertisement
                else "SwitchBot advertisement seen but payload could not be parsed."
            )
        raise RuntimeError(
            f"SwitchBot CO2 sensor not found within {scan_timeout:.0f}s. {hint} "
            "Move the Pi closer; SwitchBot advertises about every 5 minutes."
        )

    found.rssi = found_rssi
    if found_mac and found_mac != target_mac and debug:
        print(f"note: detected MAC {found_mac} differs from configured {target_mac}")
    return found


def now_jst_str() -> str:
    return datetime.now(JST).strftime("%Y-%m-%d %H:%M:%S")


def post_to_myroom(
    api_url: str,
    device_id: int,
    reading: SensorReading,
    timeout: int,
    dry_run: bool,
) -> dict:
    payload = {
        "datetime": now_jst_str(),
        "temperature": reading.temperature,
        "humidity": reading.humidity,
        "co2": reading.co2,
    }

    if dry_run:
        print(f"[dry-run] POST {api_url}?device={device_id}")
        print(f"[dry-run] payload: {payload}")
        return {"status": "dry_run", "payload": payload}

    response = requests.post(
        api_url,
        params={"device": device_id},
        json=payload,
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def load_config() -> argparse.Namespace:
    load_dotenv()

    parser = argparse.ArgumentParser(description="SwitchBot CO2 -> MyRoom")
    parser.add_argument(
        "--mac",
        default=os.getenv("SWITCHBOT_MAC", ""),
        help="SwitchBot CO2 sensor MAC address (e.g. AA:BB:CC:DD:EE:FF)",
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
        help="device query parameter for /api/sensor",
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

    args = parser.parse_args()
    if not args.mac:
        parser.error("SWITCHBOT_MAC is required (env or --mac)")
    return args


def main() -> int:
    try:
        args = load_config()

        if args.debug:
            print(f"target mac: {args.mac}")
            print(f"api url: {args.api_url}")
            print(f"device id: {args.device_id}")
            print(f"scan timeout: {args.scan_timeout}s")

        reading = scan_switchbot_co2_btmon(
            target_mac=args.mac,
            scan_timeout=args.scan_timeout,
            debug=args.debug,
            match_any_switchbot=args.match_any_switchbot,
        )

        print(
            f"read: T={reading.temperature}C H={reading.humidity}% "
            f"CO2={reading.co2}ppm battery={reading.battery}"
        )

        result = post_to_myroom(
            api_url=args.api_url,
            device_id=args.device_id,
            reading=reading,
            timeout=args.http_timeout,
            dry_run=args.dry_run,
        )
        print(f"posted: {result}")
        return 0
    except requests.HTTPError as exc:
        print(f"API error: {exc.response.status_code} {exc.response.text}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
