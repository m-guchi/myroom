# Raspberry Pi: SwitchBot CO2 → MyRoom

SwitchBot CO2 センサーの BLE アドバタイズを読み取り、`POST /api/sensor` で MyRoom に送信します。

## 前提

- Raspberry Pi Zero W / Zero 2 W など（Bluetooth 内蔵）
- SwitchBot Meter Pro (CO2) など CO2 対応機種
- Pi から MyRoom API へ HTTPS で到達できること

## 1. MAC アドレスの確認

SwitchBot アプリでデバイス情報を確認するか、Pi 上で:

```bash
sudo apt install bluez
sudo hcitool lescan
```

## 2. 手動セットアップ

```bash
cd raspberry-pi
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env を編集（SWITCHBOT_MAC 必須）
```

### 動作確認

```bash
python3 switchbot_to_myroom.py --dry-run --debug
python3 switchbot_to_myroom.py
```

## 3. systemd で定期実行（推奨）

```bash
cd raspberry-pi
sudo ./install.sh
sudo nano /opt/myroom-pi/.env
sudo -u switchbot /opt/myroom-pi/venv/bin/python3 /opt/myroom-pi/switchbot_to_myroom.py --dry-run --debug
sudo systemctl start switchbot-co2.timer
journalctl -u switchbot-co2.service -f
```

## 環境変数

| 変数 | 説明 | 例 |
|------|------|-----|
| `SWITCHBOT_MAC` | センサー MAC（必須） | `AA:BB:CC:DD:EE:FF` |
| `MYROOM_API_URL` | POST 先 URL | `https://myroom.gucchii.com/api/sensor` |
| `MYROOM_DEVICE_ID` | `device` クエリ | `2` |
| `SCAN_TIMEOUT` | BLE 待ち秒数 | `90` |

## API URL の確認

```bash
curl -X POST "${MYROOM_API_URL}?device=2" \
  -H "Content-Type: application/json" \
  -d '{"datetime":"2026-05-30 12:00:00","co2":400}'
```
