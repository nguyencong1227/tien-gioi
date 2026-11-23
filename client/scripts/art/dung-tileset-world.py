#!/usr/bin/env python3
# Dựng ảnh tileset thật của lớp hình bản đồ (QUYET_DINH_M3 mục 67.1, issue #1330, bước a): từ gói Ninja Adventure (CC0) -> MỘT ảnh `tileset_world.png` cho MỖI bản đồ,
# cùng bố cục, khác bảng màu theo vùng. Tất định (không ngẫu nhiên): cùng gói + cùng script -> cùng từng byte.
#
#   python3 -I client/scripts/art/dung-tileset-world.py [--src /mnt/data/assets-src/ninja-adventure] [--out <thư mục>] [--preview <ảnh.png>]
#
# BỐ CỤC (22 cột, ô 16 px, ĐÙN MÉP: margin 1 / spacing 2 như `createExtrudedWorldTileset` của map-builder): hai khối cột x nhiều khối hàng, mỗi khối 11 cột x 7 hàng
# theo đúng bố cục `tileset_floor.png` của gói (47 ô Wang blob của `shared/src/autotile.ts` nằm ở hàng cục bộ 0..4; ô cỏ trơn ở (2, 4), (3, 4), (0..4, 5)):
#   (0, 0)  CÁT   = khối cỏ / đất, đất -> màu cát
#   (0, 7)  ĐẤT   = khối cỏ / đất của gói, đã đổi màu theo vùng (ô cỏ trơn (2, 11) là nền cỏ)
#   (0, 21) NƯỚC  = khối băng của gói, nền trắng -> trong suốt rồi NƯỚNG LÊN ô cỏ trơn của bản đồ đó (ô nước opaque: không cần lớp nền cỏ riêng)
# Các khối còn lại để trống (trong suốt) cho bước sau (vách đá, sàn trấn, cây / đá / bụi). Số cột 22, số hàng 28 (bội của 7).
import argparse
import os
import re
import sys

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SRC_DEFAULT = "/mnt/data/assets-src/ninja-adventure"
TILE = 16
COLS = 22
BLOCK_W, BLOCK_H = 11, 7
ROWS = 28  # 4 khối hàng x 7
MARGIN, SPACING = 1, 2
PEER = ["top_left_corner", "top_side", "top_right_corner", "left_side", "right_side", "bottom_left_corner", "bottom_side", "bottom_right_corner"]

# Toạ độ ô (cột, hàng) của từng khối trong tileset_world.png.
BLOCK_SAND, BLOCK_DIRT, BLOCK_WATER = (0, 0), (0, 7), (0, 21)
# Ô cỏ trơn dùng làm nền (toạ độ cục bộ trong khối).
GRASS_LOCAL = (2, 4)

# Màu gốc của khối cỏ / đất (10 màu) và của khối băng (3 màu): đổi TỪNG màu (không chỉnh HSV toàn ảnh) để kiểm soát và để kết quả tất định.
SRC_GRASS = {"main": "#adbc3a", "dark": "#a8a129", "tuft1": "#74a334", "tuft2": "#56864c"}
SRC_DIRT = {"main": "#d3865f", "dark": "#bd7959", "hi": "#e6a578", "lo": "#ad704b"}
SRC_TUFT_ORANGE = {"a": "#ffad5d", "b": "#ef914f"}
SRC_ICE = {"water": "#b8dce5", "foam": "#f2eaf1", "bg": "#ffffff"}

# Bảng màu theo vùng (mục 67.1: Lạc Hà xanh tươi; Hắc Phong tối / đá; Âm Sương sương mù / đầm lầy; Hàn Vân băng tuyết). Lạc Hà dùng bảng "tu tiên" đã được người dùng duyệt ở
# docs/art/huong-moi/02-canh-truoc-sau.png (SAU B); ba bản đồ còn lại cùng nguyên tắc: bớt bão hoà, thêm tông theo vùng.
PALETTES = {
    "lac_ha": {
        "grass": ["#9cb77e", "#86a068", "#5e8f58", "#3e6e4d"],
        "dirt": ["#bfa078", "#a88a66", "#d4bd98", "#8d6a4d"],
        "tuft": ["#c9a86a", "#b08a55"],
        "sand": ["#dccfa6", "#c7b88c", "#eadfbd", "#a99a72"],
        "water": ["#8bbccd", "#d9edf2"],
    },
    "hac_phong": {
        "grass": ["#7d8f63", "#6a7c52", "#52663f", "#3b4f33"],
        "dirt": ["#8a8077", "#766d65", "#a39a90", "#5f574f"],
        "tuft": ["#9a8e6a", "#7d7258"],
        "sand": ["#b3a68a", "#9d9076", "#c8bca3", "#84775f"],
        "water": ["#5f8795", "#b7ced4"],
    },
    "am_suong": {
        "grass": ["#7f9a88", "#6b8776", "#51705f", "#3a5a4d"],
        "dirt": ["#7d7058", "#6a5e49", "#968a72", "#53493a"],
        "tuft": ["#8fa07a", "#75865f"],
        "sand": ["#a9a58a", "#928f76", "#bebba2", "#77745e"],
        "water": ["#6a929a", "#c4d8da"],
    },
    "han_van": {
        "grass": ["#e3ecf1", "#d0dde5", "#b4c6d2", "#97aebf"],
        "dirt": ["#8b97a3", "#77838f", "#a7b1bb", "#5f6a75"],
        "tuft": ["#c3d3dc", "#a2b6c4"],
        "sand": ["#cfd6dc", "#bac3cb", "#e4e9ed", "#9aa4ad"],
        "water": ["#9fcfe3", "#eaf5fa"],
    },
}


def hex2rgb(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def load(p):
    return Image.open(p).convert("RGBA")


def recolor(im, mapping):
    """Đổi đúng các màu trong `mapping` {#hex: #hex}; màu ngoài bảng GIỮ NGUYÊN (để test bắt màu sót); alpha giữ nguyên."""
    m = {hex2rgb(k): hex2rgb(v) for k, v in mapping.items()}
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in m:
                px[x, y] = (*m[(r, g, b)], a)
    return out


def block_of(floor, bc, br, rows=BLOCK_H):
    """Khối (bc, br) của tileset_floor.png (cột / hàng KHỐI, mỗi khối 11x7 ô)."""
    x0, y0 = bc * BLOCK_W * TILE, br * BLOCK_H * TILE
    return floor.crop((x0, y0, x0 + BLOCK_W * TILE, y0 + rows * TILE))


def grass_dirt_mapping(pal, dirt_key="dirt"):
    g, d, t = pal["grass"], pal[dirt_key], pal["tuft"]
    return {
        SRC_GRASS["main"]: g[0], SRC_GRASS["dark"]: g[1], SRC_GRASS["tuft1"]: g[2], SRC_GRASS["tuft2"]: g[3],
        SRC_DIRT["main"]: d[0], SRC_DIRT["dark"]: d[1], SRC_DIRT["hi"]: d[2], SRC_DIRT["lo"]: d[3],
        SRC_TUFT_ORANGE["a"]: t[0], SRC_TUFT_ORANGE["b"]: t[1],
    }


def water_block(floor, pal, grass_tile, grass_map):
    """Khối băng -> nước: nền trắng trong suốt, rồi NƯỚNG lên ô cỏ trơn (mỗi ô một ảnh opaque nếu ô đó có nước; ô trống của khối giữ trong suốt)."""
    ice = block_of(floor, 0, 3, rows=5)
    ice = recolor(ice, {SRC_ICE["water"]: pal["water"][0], SRC_ICE["foam"]: pal["water"][1]})
    out = Image.new("RGBA", (BLOCK_W * TILE, BLOCK_H * TILE), (0, 0, 0, 0))
    px = ice.load()
    bg = hex2rgb(SRC_ICE["bg"])
    for ty in range(ice.height // TILE):
        for tx in range(BLOCK_W):
            tile = ice.crop((tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE))
            tpx = tile.load()
            if not any(tpx[x, y][3] for y in range(TILE) for x in range(TILE)):
                continue  # ô trống của khối
            for y in range(TILE):
                for x in range(TILE):
                    if tpx[x, y][:3] == bg:
                        tpx[x, y] = (0, 0, 0, 0)
            cell = grass_tile.copy()
            cell.alpha_composite(tile)
            out.paste(cell, (tx * TILE, ty * TILE))
    # KHE HỞ CỦA GÓI: khối băng KHÔNG có ô cho ao ĐƠN ĐỘC 1 ô (mặt nạ 0 của WANG_BLOB_LUT = ô cục bộ (3, 3) trống; khối đất thì có). Tự dựng từ chính ô "giọt đất" cùng vị trí:
    # điểm ảnh đất -> nước (viền trong 1 px -> bọt nước), điểm ảnh cỏ giữ nguyên (đổi sang màu cỏ của vùng). Tất định.
    iso = (3, 3)
    if not out.crop((iso[0] * TILE, iso[1] * TILE, (iso[0] + 1) * TILE, (iso[1] + 1) * TILE)).getbbox():
        out.paste(synth_isolated_water(floor, pal, grass_map), (iso[0] * TILE, iso[1] * TILE))
    return out


def synth_isolated_water(floor, pal, grass_map):
    drop = block_of(floor, 0, 1).crop((3 * TILE, 3 * TILE, 4 * TILE, 4 * TILE))
    dirt_rgb = {hex2rgb(c) for c in SRC_DIRT.values()}
    px = drop.load()
    is_dirt = lambda x, y: 0 <= x < TILE and 0 <= y < TILE and px[x, y][3] and px[x, y][:3] in dirt_rgb
    out = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 255))
    gm = {hex2rgb(k): hex2rgb(v) for k, v in grass_map.items()}
    water, foam = hex2rgb(pal["water"][0]), hex2rgb(pal["water"][1])
    for y in range(TILE):
        for x in range(TILE):
            r, g, b, a = px[x, y]
            if is_dirt(x, y):
                edge = not (is_dirt(x - 1, y) and is_dirt(x + 1, y) and is_dirt(x, y - 1) and is_dirt(x, y + 1))
                out.putpixel((x, y), (*(foam if edge else water), 255))
            else:
                out.putpixel((x, y), (*gm.get((r, g, b), (r, g, b)), 255))
    return out


def build_world(floor, pal):
    """Ảnh tileset_world CHƯA đùn mép (COLS x ROWS ô liền nhau) của một bản đồ."""
    grass_dirt = block_of(floor, 0, 1)
    dirt = recolor(grass_dirt, grass_dirt_mapping(pal, "dirt"))
    sand = recolor(grass_dirt, grass_dirt_mapping(pal, "sand"))
    gx, gy = GRASS_LOCAL
    grass_tile = dirt.crop((gx * TILE, gy * TILE, (gx + 1) * TILE, (gy + 1) * TILE))
    sheet = Image.new("RGBA", (COLS * TILE, ROWS * TILE), (0, 0, 0, 0))
    sheet.paste(sand, (BLOCK_SAND[0] * TILE, BLOCK_SAND[1] * TILE))
    sheet.paste(dirt, (BLOCK_DIRT[0] * TILE, BLOCK_DIRT[1] * TILE))
    sheet.paste(water_block(floor, pal, grass_tile, grass_dirt_mapping(pal)), (BLOCK_WATER[0] * TILE, BLOCK_WATER[1] * TILE))
    return sheet


def extrude(sheet):
    """Đùn mép: mỗi ô cách nhau SPACING px, viền ngoài MARGIN px, các điểm ảnh mép được nhân ra 1 px để zoom lẻ / lọc không rách khe."""
    w = MARGIN * 2 + COLS * TILE + (COLS - 1) * SPACING
    h = MARGIN * 2 + ROWS * TILE + (ROWS - 1) * SPACING
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for r in range(ROWS):
        for c in range(COLS):
            tile = sheet.crop((c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE))
            x = MARGIN + c * (TILE + SPACING)
            y = MARGIN + r * (TILE + SPACING)
            out.paste(tile, (x, y))
            if not tile.getbbox():
                continue
            # 4 cạnh: nhân hàng / cột mép ra 1 px mỗi phía (khe 2 px: mỗi ô lấy 1 px của khe)
            out.paste(tile.crop((0, 0, TILE, 1)), (x, y - 1))
            out.paste(tile.crop((0, TILE - 1, TILE, TILE)), (x, y + TILE))
            out.paste(tile.crop((0, 0, 1, TILE)), (x - 1, y))
            out.paste(tile.crop((TILE - 1, 0, TILE, TILE)), (x + TILE, y))
            for cx, cy, sx, sy in ((x - 1, y - 1, 0, 0), (x + TILE, y - 1, TILE - 1, 0), (x - 1, y + TILE, 0, TILE - 1), (x + TILE, y + TILE, TILE - 1, TILE - 1)):
                out.paste(tile.crop((sx, sy, sx + 1, sy + 1)), (cx, cy))
    return out


def blob_positions():
    """Toạ độ CỤC BỘ (cột, hàng trong khối 11x7) của các ô Wang blob mà CLIENT / `map:build` thật sự dùng: mọi ô khác nhau trong `WANG_BLOB_LUT` của `shared/src/autotile.ts`
    (nguồn duy nhất của bảng tra; script đọc thẳng tệp đó nên không thể lệch)."""
    text = open(os.path.join(ROOT, "shared/src/autotile.ts"), encoding="utf8").read()
    body = text[text.index("export const WANG_BLOB_LUT") :]
    body = body[body.index("= [") :]
    body = body[: body.index("] as const;")]
    return sorted({(int(a), int(b)) for a, b in re.findall(r"\[(\d+),\s*(\d+)\]", body)})


def colors_of(im):
    return {"#%02x%02x%02x" % p[:3] for p in im.getdata() if p[3]}


def verify(sheets, src):
    """Bất biến của ảnh dựng (AssertionError nếu sai): đủ ô, đặc, không sót màu gốc, các vùng khác nhau, đùn mép đúng."""
    blobs = blob_positions()
    assert len(blobs) == 47, f"WANG_BLOB_LUT phải dùng đúng 47 ô khác nhau, có {len(blobs)}"
    src_colors = set(SRC_GRASS.values()) | set(SRC_DIRT.values()) | set(SRC_TUFT_ORANGE.values()) | set(SRC_ICE.values())
    mains = set()
    for mid, sh in sheets.items():
        assert sh.size == (COLS * TILE, ROWS * TILE), f"{mid}: cỡ {sh.size}"
        for name, (bc, br) in (("cát", BLOCK_SAND), ("đất", BLOCK_DIRT), ("nước", BLOCK_WATER)):
            # ô cỏ trơn chỉ có ở khối cát / đất; khối nước có nền cỏ NƯỚNG sẵn quanh ô nước (không có ô "cỏ trơn" riêng)
            for lc, lr in blobs + ([GRASS_LOCAL] if name != "nước" else []):
                tile = sh.crop(((bc + lc) * TILE, (br + lr) * TILE, (bc + lc + 1) * TILE, (br + lr + 1) * TILE))
                a = tile.getchannel("A")
                assert a.getextrema() == (255, 255), f"{mid}: ô {name} ({lc}, {lr}) không đặc / trống"
            block = sh.crop((bc * TILE, br * TILE, (bc + BLOCK_W) * TILE, (br + BLOCK_H) * TILE))
            left = colors_of(block) & src_colors
            assert not left, f"{mid}: khối {name} còn màu gốc {sorted(left)}"
        # phần còn lại của bản đồ để trống (chỗ cho bước sau): ngoài ba khối KHÔNG có điểm ảnh nào
        used = Image.new("L", sh.size, 0)
        for bc, br in (BLOCK_SAND, BLOCK_DIRT, BLOCK_WATER):
            used.paste(255, (bc * TILE, br * TILE, (bc + BLOCK_W) * TILE, (br + BLOCK_H) * TILE))
        outside = Image.composite(Image.new("L", sh.size, 0), sh.getchannel("A"), used)
        assert outside.getextrema() == (0, 0), f"{mid}: có điểm ảnh ngoài ba khối đã định"
        mains.add(sh.getpixel((GRASS_LOCAL[0] * TILE + 8, (BLOCK_DIRT[1] + GRASS_LOCAL[1]) * TILE + 8)))
        ex = extrude(sh)
        assert ex.size == (MARGIN * 2 + COLS * TILE + (COLS - 1) * SPACING, MARGIN * 2 + ROWS * TILE + (ROWS - 1) * SPACING), f"{mid}: cỡ ảnh đùn mép {ex.size}"
        # đùn mép của ô đặc (0, 0): 1 px mỗi phía bằng đúng điểm ảnh mép của ô
        x, y = MARGIN, MARGIN
        t = sh.crop((0, 0, TILE, TILE))
        assert ex.getpixel((x - 1, y + 5)) == t.getpixel((0, 5)) and ex.getpixel((x + TILE, y + 5)) == t.getpixel((TILE - 1, 5)), f"{mid}: đùn mép trái / phải sai"
        assert ex.getpixel((x + 5, y - 1)) == t.getpixel((5, 0)) and ex.getpixel((x + 5, y + TILE)) == t.getpixel((5, TILE - 1)), f"{mid}: đùn mép trên / dưới sai"
    assert len(mains) == len(sheets), "hai bản đồ có cùng màu cỏ chính (bảng màu theo vùng phải khác nhau)"
    # tất định: dựng lại cho cùng từng điểm ảnh
    floor = load(os.path.join(src, "content/map/tileset_floor.png"))
    for mid, pal in PALETTES.items():
        assert build_world(floor, pal).tobytes() == sheets[mid].tobytes(), f"{mid}: dựng lại ra ảnh khác (không tất định)"


def preview(images, path):
    """Ảnh xem: bốn tileset (chưa đùn mép) cạnh nhau, phóng 2 lần trên nền caro để thấy phần trong suốt."""
    k = 2
    w = sum(im.width for im in images.values()) * k + 12 * (len(images) + 1)
    h = max(im.height for im in images.values()) * k + 24
    canvas = Image.new("RGBA", (w, h), (36, 33, 44, 255))
    x = 12
    for name, im in images.items():
        bg = Image.new("RGBA", im.size, (255, 0, 255, 255))
        bg.alpha_composite(im)
        canvas.paste(bg.resize((im.width * k, im.height * k), Image.NEAREST), (x, 12))
        x += im.width * k + 12
    canvas.convert("RGB").save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=SRC_DEFAULT)
    ap.add_argument("--out", default=None, help="thư mục ghi tileset_world_<id>.png (không có thì chỉ kiểm, không ghi)")
    ap.add_argument("--preview", default=None)
    a = ap.parse_args()
    floor = load(os.path.join(a.src, "content/map/tileset_floor.png"))
    sheets = {mid: build_world(floor, pal) for mid, pal in PALETTES.items()}
    verify(sheets, a.src)
    if a.out:
        os.makedirs(a.out, exist_ok=True)
        for mid, sh in sheets.items():
            p = os.path.join(a.out, f"tileset_world_{mid}.png")
            extrude(sh).save(p, optimize=True)
            print(p, os.path.getsize(p), "byte")
    if a.preview:
        preview(sheets, a.preview)
    print("ĐÃ DỰNG", ", ".join(sheets))


if __name__ == "__main__":
    sys.exit(main())
