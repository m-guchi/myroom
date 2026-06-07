#!/usr/bin/env python3
"""Generate PWA icon PNGs for MyRoom from the provided source artwork."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE_PATH = ROOT / "assets" / "app-icon-source.png"
PUBLIC_DIR = ROOT / "public"
APP_DIR = ROOT / "app"
PADDING = 8
BACKGROUND = (255, 255, 255, 255)


def prepare_icon_source() -> Image.Image:
    img = Image.open(SOURCE_PATH).convert("RGBA")
    width, height = img.size

    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        rgb = img.convert("RGB")
        pixels = rgb.load()
        min_x = min_y = width
        max_x = max_y = 0
        for y in range(height):
            for x in range(width):
                r, g, b = pixels[x, y]
                if r < 245 or g < 245 or b < 245:
                    min_x = min(min_x, x)
                    min_y = min(min_y, y)
                    max_x = max(max_x, x)
                    max_y = max(max_y, y)
        bbox = (min_x, min_y, max_x + 1, max_y + 1)

    left = max(0, bbox[0] - PADDING)
    top = max(0, bbox[1] - PADDING)
    right = min(width, bbox[2] + PADDING)
    bottom = min(height, bbox[3] + PADDING)
    trimmed = img.crop((left, top, right, bottom))

    side = max(trimmed.size)
    square = Image.new("RGBA", (side, side), BACKGROUND)
    offset_x = (side - trimmed.width) // 2
    offset_y = (side - trimmed.height) // 2
    square.paste(trimmed, (offset_x, offset_y), trimmed)
    return square


def resize_icon(source: Image.Image, size: int) -> Image.Image:
    return source.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    if not SOURCE_PATH.exists():
        raise SystemExit(f"Source image not found: {SOURCE_PATH}")

    source = prepare_icon_source()
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    APP_DIR.mkdir(parents=True, exist_ok=True)

    outputs = {
        PUBLIC_DIR / "icon-192.png": 192,
        PUBLIC_DIR / "icon-512.png": 512,
        PUBLIC_DIR / "apple-touch-icon.png": 180,
        PUBLIC_DIR / "favicon.png": 32,
    }

    for path, size in outputs.items():
        resize_icon(source, size).save(path, format="PNG")
        print(f"Wrote {path} ({size}x{size})")

    resize_icon(source, 32).save(APP_DIR / "icon.png", format="PNG")
    resize_icon(source, 180).save(APP_DIR / "apple-icon.png", format="PNG")
    print(f"Wrote {APP_DIR / 'icon.png'} (32x32)")
    print(f"Wrote {APP_DIR / 'apple-icon.png'} (180x180)")


if __name__ == "__main__":
    main()
