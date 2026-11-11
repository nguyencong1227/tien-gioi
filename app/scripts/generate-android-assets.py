#!/usr/bin/env python3
"""
Đồng bộ và sinh icon, splash screen cho Android từ tài nguyên của dự án:
  - client/public/icons/icon-512.png
  - client/public/icons/icon-maskable-512.png
Màu nền: #1d1a16
"""

import os
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

SRC_ICON = os.path.join(PROJECT_ROOT, "client/public/icons/icon-512.png")
SRC_MASKABLE = os.path.join(PROJECT_ROOT, "client/public/icons/icon-maskable-512.png")
RES_DIR = os.path.join(BASE_DIR, "android/app/src/main/res")

BG_COLOR = (29, 26, 22)  # #1d1a16

ICON_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

SPLASH_SIZES = {
    "drawable": (480, 320),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
}

def main():
    icon_img = Image.open(SRC_ICON).convert("RGBA")
    maskable_img = Image.open(SRC_MASKABLE).convert("RGBA")

    # 1. Sinh ic_launcher và ic_launcher_round
    for folder, size in ICON_SIZES.items():
        out_dir = os.path.join(RES_DIR, folder)
        os.makedirs(out_dir, exist_ok=True)
        resized = icon_img.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(os.path.join(out_dir, "ic_launcher.png"))
        
        # round icon
        resized_round = maskable_img.resize((size, size), Image.Resampling.LANCZOS)
        resized_round.save(os.path.join(out_dir, "ic_launcher_round.png"))

    # 2. Sinh ic_launcher_foreground (kích thước lớn hơn, icon ở giữa ~66%)
    for folder, size in FOREGROUND_SIZES.items():
        out_dir = os.path.join(RES_DIR, folder)
        os.makedirs(out_dir, exist_ok=True)
        fg_canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        icon_dim = int(size * 0.66)
        scaled_icon = icon_img.resize((icon_dim, icon_dim), Image.Resampling.LANCZOS)
        offset = (size - icon_dim) // 2
        fg_canvas.paste(scaled_icon, (offset, offset), scaled_icon)
        fg_canvas.save(os.path.join(out_dir, "ic_launcher_foreground.png"))

    # 3. Sinh splash.png
    for folder, (w, h) in SPLASH_SIZES.items():
        out_dir = os.path.join(RES_DIR, folder)
        os.makedirs(out_dir, exist_ok=True)
        splash_canvas = Image.new("RGBA", (w, h), (*BG_COLOR, 255))
        
        # Logo giữa màn hình: chiếm tối đa 40% chiều ngắn nhất
        min_dim = min(w, h)
        logo_dim = int(min_dim * 0.45)
        scaled_logo = icon_img.resize((logo_dim, logo_dim), Image.Resampling.LANCZOS)
        offset_x = (w - logo_dim) // 2
        offset_y = (h - logo_dim) // 2
        splash_canvas.paste(scaled_logo, (offset_x, offset_y), scaled_logo)
        splash_canvas.convert("RGB").save(os.path.join(out_dir, "splash.png"))

    # 4. Đổi màu ic_launcher_background.xml thành #1d1a16
    bg_xml_path = os.path.join(RES_DIR, "values/ic_launcher_background.xml")
    with open(bg_xml_path, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1d1a16</color>\n</resources>\n')

    print("Hoàn tất sinh icon và splash cho Android!")

if __name__ == "__main__":
    main()
