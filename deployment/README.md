# MyRoom Deployment Guide

Production URL: **https://myroom.gucchii.com/**

## Quick Start

```bash
scp -r /path/to/myroom user@your-server:/home/user/
cd myroom
sudo ./deployment/setup_on_target.sh
```

Configure Apache/Nginx using `deployment/apache.conf` or `deployment/nginx.conf`.

## URLs

| 用途 | URL |
|------|-----|
| アプリ | https://myroom.gucchii.com/ |
| API | https://myroom.gucchii.com/api/sensor |
| ヘルスチェック | https://myroom.gucchii.com/api/health |

## Raspberry Pi

```env
MYROOM_API_URL=https://myroom.gucchii.com/api/sensor
```
