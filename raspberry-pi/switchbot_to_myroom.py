#!/usr/bin/env python3
"""
SwitchBot CO2 センサー (BLE) から値を読み取り、MyRoom API へ POST する。

使い方:
  python3 switchbot_to_myroom.py
  python3 switchbot_to_myroom.py --debug
  python3 switchbot_to_myroom.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests
from bleak import BleakScanner
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData
from dotenv import load_dotenv

SWITCHBOT_MFR_ID = 0x0969
JST = timezone(timedelta(hours=9))


@dataclass
class SensorReading:
    temperature: float
    humidity: int
    co2: int
    battery: Optional[int] = None
    rssi: Optional[int] = None


def parse_switchbot_co2_payload(data: bytes) -> Optional[SensorReading]:
    """SwitchBot Meter Pro (CO2) の manufacturer data を解析する。"""
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


def parse_battery(service_data: dict) -> Optional[int]:
    for data in service_data.values():
        if len(data) >= 3:
            return int(data[-1] & 0x7F)
    return None


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


async def scan_switchbot_co2(
    target_mac: str,
    scan_timeout: float,
    debug: bool,
) -> SensorReading:
    target_mac = target_mac.lower()
    found: Optional[SensorReading] = None
    found_rssi: Optional[int] = None
    found_battery: Optional[int] = None

    def on_detect(device: BLEDevice, advertisement: AdvertisementData) -> None:
        nonlocal found, found_rssi, found_battery

        if device.address.lower() != target_mac:
            return

        manufacturer_data = advertisement.manufacturer_data or {}
        for company_id, payload in manufacturer_data.items():
            if company_id != SWITCHBOT_MFR_ID and company_id != 0x69:
                continue

            reading = parse_switchbot_co2_payload(bytes(payload))
            if reading is None:
                if debug:
                    print(f"skip payload len={len(payload)} hex={bytes(payload).hex()}")
                continue

            if advertisement.service_data:
                reading.battery = parse_battery(advertisement.service_data)

            found = reading
            found_rssi = advertisement.rssi
            found_battery = reading.battery

            if debug:
                print(
                    f"detected {device.address} "
                    f"T={reading.temperature}C H={reading.humidity}% "
                    f"CO2={reading.co2}ppm battery={reading.battery} rssi={found_rssi}"
                )

    scanner = BleakScanner(detection_callback=on_detect)
    await scanner.start()
    try:
        elapsed = 0.0
        step = 0.5
        while elapsed < scan_timeout:
            if found is not None:
                break
            await asyncio.sleep(step)
            elapsed += step
    finally:
        await scanner.stop()

    if found is None:
        raise RuntimeError(
            f"SwitchBot CO2 sensor not found within {scan_timeout:.0f}s "
            f"(mac={target_mac}). Move the Pi closer and retry."
        )

    found.rssi = found_rssi
    if found_battery is not None:
        found.battery = found_battery
    return found


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

    args = parser.parse_args()
    if not args.mac:
        parser.error("SWITCHBOT_MAC is required (env or --mac)")
    return args


async def async_main() -> int:
    args = load_config()

    if args.debug:
        print(f"target mac: {args.mac}")
        print(f"api url: {args.api_url}")
        print(f"device id: {args.device_id}")
        print(f"scan timeout: {args.scan_timeout}s")

    reading = await scan_switchbot_co2(
        target_mac=args.mac,
        scan_timeout=args.scan_timeout,
        debug=args.debug,
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


def main() -> int:
    try:
        return asyncio.run(async_main())
    except requests.HTTPError as exc:
        print(f"API error: {exc.response.status_code} {exc.response.text}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
