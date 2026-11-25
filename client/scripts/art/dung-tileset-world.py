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
#   (11, 7) ĐÁ LÁT (sàn trấn, `T.Stone`) = khối cỏ / đất, đất -> đá cuội: điểm ảnh "đất chính" được thay bằng hoạ tiết đá cuội LIỀN MẠCH 16x16 cắt từ sàn nội thất của gói
#   (11, 21) VẬT THỂ (bước a2): bốn ô 16x16 ở hàng cuối khối, đúng chỗ `GID_TREE_TRUNK` 620 / `GID_TREE_CANOPY` 621 / `GID_ROCK` 622 / `GID_TALL_GRASS` 623 của `map-builder.ts`
#                   (gid - 10 = hàng x 22 + cột): thân cây (16, 27), tán cây (17, 27), đá (18, 27), bụi cỏ (19, 27); nền trong suốt (vẽ trên nền cỏ)
# Phần còn lại để trống (trong suốt) cho bước sau (vách đá). Số cột 22, số hàng 28 (bội của 7).
import argparse
import json
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
BLOCK_STONE = (11, 7)
# Vật thể 1 ô (cột, hàng) trong tileset_world: khớp `GID_*` của server/src/systems/map-builder.ts (gid = FIRSTGID 10 + hàng x COLS + cột)
FIRSTGID = 10
SLOT_TRUNK = (16, 27)
SLOT_CANOPY = (17, 27)
SLOT_ROCK = (18, 27)
SLOT_BUSH = (19, 27)
SLOTS = {"GID_TREE_TRUNK": SLOT_TRUNK, "GID_TREE_CANOPY": SLOT_CANOPY, "GID_ROCK": SLOT_ROCK, "GID_TALL_GRASS": SLOT_BUSH}
# Toạ độ ô nguồn (cột, hàng) trong gói
SRC_COBBLE_TILE = (6, 13)  # tileset_interior_floor.png: ô đá cuội vàng giữa khối, lặp liền mạch
SRC_ROCK_TILE = (3, 5)  # tileset_village_abandoned.png: tảng đá phủ rêu
SRC_BUSH_TILE = (4, 5)  # tileset_village_abandoned.png: bụi lá
SRC_TREE_BASE_BOX = (72, 112, 88, 128)  # tileset_village_abandoned.png (điểm ảnh): đáy cây nhỏ = đáy tán + rễ, giữa hai ô (4, 7) và (5, 7)
SRC_TREE_BOX = (64, 96, 96, 128)  # tileset_village_abandoned.png (điểm ảnh): CÂY NHỎ NGUYÊN KHỐI 2 x 2 ô = tán tròn 32 x 31 + rễ ở đáy (gói KHÔNG có thân riêng), ô (4..5, 6..7)
# Sprite cây nguyên khối trong ảnh ĐÃ ĐÙN MÉP (mục 73): vùng TRỐNG ở ô (12..13, 0..1), x = MARGIN + 12 * (TILE + SPACING). Không nằm trên lưới ô (đùn mép cắt ô cách nhau 2 px nên
# sprite 32 x 32 không thể là bốn ô liền): client cắt đúng khung này thành MỘT hình cây (`VISUAL_TREE_FRAME` ở client/src/gfx/map-visual.ts; test đối chiếu hai nơi).
TREE_FRAME = (217, 1, 32, 32)  # (x, y, rộng, cao); điểm neo ở GỐC = giữa đáy khung
SRC_OUTLINE = "#141b1b"
# Ô cỏ trơn dùng làm nền (toạ độ cục bộ trong khối).
GRASS_LOCAL = (2, 4)

# Màu gốc của khối cỏ / đất (10 màu) và của khối băng (3 màu): đổi TỪNG màu (không chỉnh HSV toàn ảnh) để kiểm soát và để kết quả tất định.
SRC_GRASS = {"main": "#adbc3a", "dark": "#a8a129", "tuft1": "#74a334", "tuft2": "#56864c"}
SRC_DIRT = {"main": "#d3865f", "dark": "#bd7959", "hi": "#e6a578", "lo": "#ad704b"}
SRC_TUFT_ORANGE = {"a": "#ffad5d", "b": "#ef914f"}
SRC_ICE = {"water": "#b8dce5", "foam": "#f2eaf1", "bg": "#ffffff"}
# Sàn đá cuội vàng (tileset_interior_floor): vữa, đá, bóng đá, mép sáng
SRC_COBBLE = {"mortar": "#d2b37d", "stone": "#f1c471", "deep": "#c8966b", "hi": "#eecf9b"}
# Cây / rễ / đá phủ rêu (tileset_village_abandoned): lá sáng, lá vừa, lá tối, rễ cam, rễ nâu, rễ đỏ, rễ ô-liu; đá: be, nâu đỏ, nâu, sáng
SRC_LEAF = {"main": "#adbc3a", "mid": "#74a334", "dark": "#546626", "olive": "#a8a129"}
SRC_WOOD = {"orange": "#e46d3a", "brown": "#a3754e", "red": "#965340", "olive": "#7a7a3e"}
SRC_ROCK = {"a": "#c69469", "b": "#965746", "c": "#bd7959", "d": "#d2b37d"}

# Bảng màu theo vùng (mục 67.1: Lạc Hà xanh tươi; Hắc Phong tối / đá; Âm Sương sương mù / đầm lầy; Hàn Vân băng tuyết). Lạc Hà dùng bảng "tu tiên" đã được người dùng duyệt ở
# docs/art/huong-moi/02-canh-truoc-sau.png (SAU B); ba bản đồ còn lại cùng nguyên tắc: bớt bão hoà, thêm tông theo vùng.
PALETTES = {
    "lac_ha": {
        "grass": ["#9cb77e", "#86a068", "#5e8f58", "#3e6e4d"],
        "dirt": ["#bfa078", "#a88a66", "#d4bd98", "#8d6a4d"],
        "tuft": ["#c9a86a", "#b08a55"],
        "sand": ["#dccfa6", "#c7b88c", "#eadfbd", "#a99a72"],
        "water": ["#8bbccd", "#d9edf2"],
        "stone": {"mortar": "#b9a98a", "stone": "#d9ccb0", "deep": "#9d8c70", "hi": "#e9dfc7"},
    },
    "hac_phong": {
        "grass": ["#7d8f63", "#6a7c52", "#52663f", "#3b4f33"],
        "dirt": ["#8a8077", "#766d65", "#a39a90", "#5f574f"],
        "tuft": ["#9a8e6a", "#7d7258"],
        "sand": ["#b3a68a", "#9d9076", "#c8bca3", "#84775f"],
        "water": ["#5f8795", "#b7ced4"],
        "stone": {"mortar": "#6b655e", "stone": "#8a837a", "deep": "#524d47", "hi": "#a59e94"},
    },
    "am_suong": {
        "grass": ["#7f9a88", "#6b8776", "#51705f", "#3a5a4d"],
        "dirt": ["#7d7058", "#6a5e49", "#968a72", "#53493a"],
        "tuft": ["#8fa07a", "#75865f"],
        "sand": ["#a9a58a", "#928f76", "#bebba2", "#77745e"],
        "water": ["#6a929a", "#c4d8da"],
        "stone": {"mortar": "#5c6a62", "stone": "#7c8a82", "deep": "#46524b", "hi": "#98a8a0"},
    },
    "han_van": {
        "grass": ["#e3ecf1", "#d0dde5", "#b4c6d2", "#97aebf"],
        "dirt": ["#8b97a3", "#77838f", "#a7b1bb", "#5f6a75"],
        "tuft": ["#c3d3dc", "#a2b6c4"],
        "sand": ["#cfd6dc", "#bac3cb", "#e4e9ed", "#9aa4ad"],
        "water": ["#9fcfe3", "#eaf5fa"],
        "stone": {"mortar": "#8d9aa7", "stone": "#aebbc7", "deep": "#6e7b88", "hi": "#cfd9e2"},
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


def tile_at(im, c, r):
    return im.crop((c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE))


def shade(rgb, k):
    return tuple(int(c * k) for c in rgb)


def stone_block(src, pal):
    """Khối ĐÁ LÁT (sàn trấn): khối cỏ / đất của gói, điểm ảnh "đất chính" thay bằng hoạ tiết đá cuội LIỀN MẠCH 16x16 (ô sàn nội thất của gói, đổi sang bảng đá của vùng; căn theo lưới ô nên
    các ô đầy liền nhau không lộ khe), điểm ảnh bóng / sáng / mép của đất thành đá tối / sáng / vữa. Cỏ và bụi theo bảng màu vùng như các khối khác."""
    sp = pal["stone"]
    cob = recolor(tile_at(src["interior"], *SRC_COBBLE_TILE), {SRC_COBBLE[k]: sp[k] for k in SRC_COBBLE})
    gm = grass_dirt_mapping(pal, "dirt")
    dirt_src = {hex2rgb(v): k for k, v in SRC_DIRT.items()}
    block = block_of(src["floor"], 0, 1)
    out = recolor(block, {k: v for k, v in gm.items() if hex2rgb(k) not in dirt_src})  # cỏ + bụi cam; đất để nguyên rồi xử lý dưới
    px = out.load()
    edge = {"dark": sp["deep"], "hi": sp["hi"], "lo": sp["mortar"]}
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            k = dirt_src.get((r, g, b)) if a else None
            if k == "main":
                px[x, y] = cob.getpixel((x % TILE, y % TILE))
            elif k:
                px[x, y] = (*hex2rgb(edge[k]), a)
    return out


def leaf_map(pal, tone):
    """Bảng đổi màu lá: bụi lá đậm hơn nền cỏ một nấc, tán cây đậm hơn bụi (để cây nổi trên cỏ)."""
    g = pal["grass"]
    if tone == "bush":
        return {SRC_LEAF["main"]: g[1], SRC_LEAF["mid"]: g[2], SRC_LEAF["dark"]: g[3], SRC_LEAF["olive"]: g[2]}
    dark = "#%02x%02x%02x" % shade(hex2rgb(g[3]), 0.72)
    return {SRC_LEAF["main"]: g[2], SRC_LEAF["mid"]: g[3], SRC_LEAF["dark"]: dark, SRC_LEAF["olive"]: g[3]}


def wood_map(pal):
    """Bảng đổi màu rễ / gỗ theo vùng: rễ theo màu đất của vùng."""
    d, g = pal["dirt"], pal["grass"]
    return {SRC_WOOD["orange"]: d[1], SRC_WOOD["brown"]: d[3], SRC_WOOD["red"]: "#%02x%02x%02x" % shade(hex2rgb(d[3]), 0.82), SRC_WOOD["olive"]: g[3]}


def trunk_tile(src, pal):
    """Thân cây (lớp decor, dưới chân nhân vật): đáy cây nhỏ của gói (đáy tán + rễ), lá theo vùng, rễ theo màu đất của vùng.
    (Ô này giữ chỗ GID 620 trong dữ liệu bản đồ; từ mục 73 client KHÔNG vẽ nó nữa mà vẽ `tree_sprite` nguyên khối thay cho cả cặp thân + tán.)"""
    return recolor(src["village"].crop(SRC_TREE_BASE_BOX), {**leaf_map(pal, "canopy"), **wood_map(pal)})


def tree_sprite(src, pal):
    """CÂY NGUYÊN KHỐI (mục 73): cây nhỏ 32 x 32 của gói (tán tròn + rễ ở đáy, đúng khuôn gốc), lá và rễ theo bảng màu vùng; neo ở gốc = giữa đáy."""
    return recolor(src["village"].crop(SRC_TREE_BOX), {**leaf_map(pal, "canopy"), **wood_map(pal)})


def with_trees(extruded, src, pal):
    """Ảnh tileset ĐÃ đùn mép + sprite cây nguyên khối dán vào `TREE_FRAME` (vùng trống). Trả ảnh mới."""
    out = extruded.copy()
    x, y, w, h = TREE_FRAME
    assert out.crop((x - 1, y - 1, x + w + 1, y + h + 1)).getchannel("A").getextrema() == (0, 0), "vùng sprite cây không trống"
    out.paste(tree_sprite(src, pal), (x, y))
    return out


def canopy_tile(pal):
    """Tán cây (lớp over, phủ trên đầu nhân vật): một búp lá tròn 16 x 12 viền đen như cây của gói, góc trong suốt, sáng ở trên trái; 4 hàng đáy của ô để hở cho rễ ở ô thân.
    Vẽ bằng mã (tất định): gói chỉ có cây 2x2 / 4x3 ô, không có tán 1 ô."""
    g = pal["grass"]
    tones = [hex2rgb(g[1]), hex2rgb(g[2]), hex2rgb(g[3]), shade(hex2rgb(g[3]), 0.72)]  # sáng, chính, vừa, tối
    outline = hex2rgb(SRC_OUTLINE)
    cx, cy, rx, ry = 8.0, 6.0, 8.0, 6.0
    inside = lambda x, y: ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0
    t = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    for y in range(TILE):
        for x in range(TILE):
            if not inside(x, y):
                continue
            if not all(inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                t.putpixel((x, y), (*outline, 255))
                continue
            light = -((x - cx) / rx * 0.6 + (y - cy) / ry * 0.8)  # >0: phía trên trái
            k = 0 if light > 0.45 else 1 if light > -0.1 else 2 if light > -0.55 else 3
            if (x * 7 + y * 13) % 11 == 0 and k < 3:  # lốm đốm lá: tất định
                k += 1
            t.putpixel((x, y), (*tones[k], 255))
    return t


def rock_tile(src, pal):
    """Đá (lớp decor): tảng đá phủ rêu của gói; rêu theo màu cỏ vùng, đá theo bảng đá lát của vùng."""
    sp, g = pal["stone"], pal["grass"]
    m = {SRC_ROCK["a"]: sp["stone"], SRC_ROCK["b"]: sp["deep"], SRC_ROCK["c"]: sp["mortar"], SRC_ROCK["d"]: sp["hi"]}
    return recolor(tile_at(src["village"], *SRC_ROCK_TILE), {**leaf_map(pal, "bush"), **m})


def bush_tile(src, pal):
    """Bụi cỏ cao (lớp decor): bụi lá của gói, lá theo vùng."""
    return recolor(tile_at(src["village"], *SRC_BUSH_TILE), leaf_map(pal, "bush"))


def object_tiles(src, pal):
    return {SLOT_TRUNK: trunk_tile(src, pal), SLOT_CANOPY: canopy_tile(pal), SLOT_ROCK: rock_tile(src, pal), SLOT_BUSH: bush_tile(src, pal)}


def load_sources(root):
    return {
        "floor": load(os.path.join(root, "content/map/tileset_floor.png")),
        "interior": load(os.path.join(root, "content/map/tileset_interior_floor.png")),
        "village": load(os.path.join(root, "content/map/tileset_village_abandoned.png")),
    }


def build_world(src, pal):
    """Ảnh tileset_world CHƯA đùn mép (COLS x ROWS ô liền nhau) của một bản đồ. `src` = các ảnh gốc (`load_sources`)."""
    floor = src["floor"]
    grass_dirt = block_of(floor, 0, 1)
    dirt = recolor(grass_dirt, grass_dirt_mapping(pal, "dirt"))
    sand = recolor(grass_dirt, grass_dirt_mapping(pal, "sand"))
    gx, gy = GRASS_LOCAL
    grass_tile = dirt.crop((gx * TILE, gy * TILE, (gx + 1) * TILE, (gy + 1) * TILE))
    sheet = Image.new("RGBA", (COLS * TILE, ROWS * TILE), (0, 0, 0, 0))
    sheet.paste(sand, (BLOCK_SAND[0] * TILE, BLOCK_SAND[1] * TILE))
    sheet.paste(dirt, (BLOCK_DIRT[0] * TILE, BLOCK_DIRT[1] * TILE))
    sheet.paste(water_block(floor, pal, grass_tile, grass_dirt_mapping(pal)), (BLOCK_WATER[0] * TILE, BLOCK_WATER[1] * TILE))
    sheet.paste(stone_block(src, pal), (BLOCK_STONE[0] * TILE, BLOCK_STONE[1] * TILE))
    for (c, r), tile in object_tiles(src, pal).items():
        sheet.paste(tile, (c * TILE, r * TILE))  # có alpha: ô nằm ngoài các khối nên không đè lên gì
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


def map_builder_constants():
    """Đọc các hằng `export const NAME = <số>` của server/src/systems/map-builder.ts (nguồn duy nhất của GID; script không chép lại)."""
    text = open(os.path.join(ROOT, "server/src/systems/map-builder.ts"), encoding="utf8").read()
    return {k: int(v) for k, v in re.findall(r"export const (\w+) = (\d+);", text)}


def map_builder_report():
    """Danh sách chỗ `map-builder.ts` LỆCH ảnh dựng (chuỗi mô tả). Bốn GID vật thể phải trùng ô đã vẽ; `GID_GRASS` phải trỏ ô cỏ trơn và `TILES_WORLD_COUNT` = số ô thật của ảnh."""
    const, bad = map_builder_constants(), []
    for name, (c, r) in SLOTS.items():
        want = FIRSTGID + r * COLS + c
        if const.get(name) != want:
            bad.append(f"{name} = {const.get(name)}, ảnh vẽ ở ô ({c}, {r}) = {want}")
    gx, gy = GRASS_LOCAL
    want_grass = FIRSTGID + (BLOCK_DIRT[1] + gy) * COLS + BLOCK_DIRT[0] + gx
    if const.get("GID_GRASS") != want_grass:
        bad.append(f"GID_GRASS = {const.get('GID_GRASS')}, ô cỏ trơn nền là ({BLOCK_DIRT[0] + gx}, {BLOCK_DIRT[1] + gy}) = {want_grass}")
    if const.get("TILES_WORLD_COUNT") != COLS * ROWS:
        bad.append(f"TILES_WORLD_COUNT = {const.get('TILES_WORLD_COUNT')}, ảnh có {COLS} x {ROWS} = {COLS * ROWS} ô")
    return bad


def verify(sheets, src):
    """Bất biến của ảnh dựng (AssertionError nếu sai): đủ ô, đặc, không sót màu gốc, các vùng khác nhau, đùn mép đúng. `src` = các ảnh gốc (`load_sources`)."""
    blobs = blob_positions()
    assert len(blobs) == 47, f"WANG_BLOB_LUT phải dùng đúng 47 ô khác nhau, có {len(blobs)}"
    src_colors = set(SRC_GRASS.values()) | set(SRC_DIRT.values()) | set(SRC_TUFT_ORANGE.values()) | set(SRC_ICE.values()) | set(SRC_COBBLE.values())
    obj_src_colors = set(SRC_LEAF.values()) | set(SRC_WOOD.values()) | set(SRC_ROCK.values())  # màu gốc của vật thể (viền đen SRC_OUTLINE được GIỮ có chủ ý)
    mains = set()
    for mid, sh in sheets.items():
        assert sh.size == (COLS * TILE, ROWS * TILE), f"{mid}: cỡ {sh.size}"
        for name, (bc, br) in (("cát", BLOCK_SAND), ("đất", BLOCK_DIRT), ("nước", BLOCK_WATER), ("đá lát", BLOCK_STONE)):
            # ô cỏ trơn chỉ có ở khối cát / đất; khối nước có nền cỏ NƯỚNG sẵn quanh ô nước (không có ô "cỏ trơn" riêng)
            for lc, lr in blobs + ([GRASS_LOCAL] if name != "nước" else []):
                tile = sh.crop(((bc + lc) * TILE, (br + lr) * TILE, (bc + lc + 1) * TILE, (br + lr + 1) * TILE))
                a = tile.getchannel("A")
                assert a.getextrema() == (255, 255), f"{mid}: ô {name} ({lc}, {lr}) không đặc / trống"
            block = sh.crop((bc * TILE, br * TILE, (bc + BLOCK_W) * TILE, (br + BLOCK_H) * TILE))
            left = colors_of(block) & src_colors
            assert not left, f"{mid}: khối {name} còn màu gốc {sorted(left)}"
        # vật thể: bốn ô đúng chỗ, không sót màu gốc, tán có góc trong suốt + giữa đặc, thân / đá / bụi không trống
        objs = {name: tile_at(sh, *slot) for name, slot in SLOTS.items()}
        for name, t in objs.items():
            assert t.getbbox(), f"{mid}: ô {name} trống"
            assert not (colors_of(t) & obj_src_colors), f"{mid}: ô {name} còn màu gốc {sorted(colors_of(t) & obj_src_colors)}"
        assert objs["GID_TREE_CANOPY"].getpixel((0, 0))[3] == 0 and objs["GID_TREE_CANOPY"].getpixel((8, 4))[3] == 255, f"{mid}: tán cây phải có góc trong suốt và giữa đặc"
        assert objs["GID_TREE_CANOPY"].getpixel((8, TILE - 1))[3] == 0, f"{mid}: tán cây phải chừa đáy ô cho rễ"
        # phần còn lại của bản đồ để trống (chỗ cho bước sau): ngoài bốn khối và bốn ô vật thể KHÔNG có điểm ảnh nào
        used = Image.new("L", sh.size, 0)
        for bc, br in (BLOCK_SAND, BLOCK_DIRT, BLOCK_WATER, BLOCK_STONE):
            used.paste(255, (bc * TILE, br * TILE, (bc + BLOCK_W) * TILE, (br + BLOCK_H) * TILE))
        for c, r in SLOTS.values():
            used.paste(255, (c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE))
        outside = Image.composite(Image.new("L", sh.size, 0), sh.getchannel("A"), used)
        assert outside.getextrema() == (0, 0), f"{mid}: có điểm ảnh ngoài các khối và ô vật thể đã định"
        mains.add(sh.getpixel((GRASS_LOCAL[0] * TILE + 8, (BLOCK_DIRT[1] + GRASS_LOCAL[1]) * TILE + 8)))
        ex = extrude(sh)
        # cây nguyên khối (mục 73): sau đùn mép dán vào TREE_FRAME; giữ bbox của gói (rễ chạm đáy khung), góc trong suốt, giữa đặc, không sót màu gốc, quanh khung trống
        wt = with_trees(ex, src, PALETTES[mid])
        tx, ty, tw, th = TREE_FRAME
        assert tx + tw <= wt.width and ty + th <= wt.height, f"{mid}: TREE_FRAME ngoài ảnh"
        tree = wt.crop((tx, ty, tx + tw, ty + th))
        assert tree.getbbox() == (0, 1, tw, th), f"{mid}: sprite cây lệch khuôn gói: bbox {tree.getbbox()}"
        assert tree.getpixel((0, 0))[3] == 0 and tree.getpixel((tw - 1, 0))[3] == 0, f"{mid}: sprite cây phải có góc trên trong suốt"
        assert tree.getpixel((tw // 2, 12))[3] == 255, f"{mid}: giữa tán cây phải đặc"
        assert any(tree.getpixel((x, th - 1))[3] == 255 for x in range(tw // 2 - 4, tw // 2 + 4)), f"{mid}: rễ phải chạm đáy khung (điểm neo ở gốc)"
        assert not (colors_of(tree) & obj_src_colors), f"{mid}: sprite cây còn màu gốc {sorted(colors_of(tree) & obj_src_colors)}"
        ring = wt.crop((tx - 1, ty - 1, tx + tw + 1, ty + th + 1)).copy()
        ring.paste((0, 0, 0, 0), (1, 1, 1 + tw, 1 + th))
        assert ring.getchannel("A").getextrema() == (0, 0), f"{mid}: quanh sprite cây phải trống (không đè lên ô nào)"
        assert ex.size == (MARGIN * 2 + COLS * TILE + (COLS - 1) * SPACING, MARGIN * 2 + ROWS * TILE + (ROWS - 1) * SPACING), f"{mid}: cỡ ảnh đùn mép {ex.size}"
        # đùn mép của ô đặc (0, 0): 1 px mỗi phía bằng đúng điểm ảnh mép của ô
        x, y = MARGIN, MARGIN
        t = sh.crop((0, 0, TILE, TILE))
        assert ex.getpixel((x - 1, y + 5)) == t.getpixel((0, 5)) and ex.getpixel((x + TILE, y + 5)) == t.getpixel((TILE - 1, 5)), f"{mid}: đùn mép trái / phải sai"
        assert ex.getpixel((x + 5, y - 1)) == t.getpixel((5, 0)) and ex.getpixel((x + 5, y + TILE)) == t.getpixel((5, TILE - 1)), f"{mid}: đùn mép trên / dưới sai"
    assert len(mains) == len(sheets), "hai bản đồ có cùng màu cỏ chính (bảng màu theo vùng phải khác nhau)"
    # tất định: dựng lại cho cùng từng điểm ảnh
    for mid, pal in PALETTES.items():
        assert build_world(src, pal).tobytes() == sheets[mid].tobytes(), f"{mid}: dựng lại ra ảnh khác (không tất định)"


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


# Vùng xem trước (x0, y0, x1, y1 theo ô) của từng bản đồ: chọn chỗ có đủ đất, cát, nước, đá lát, cây, đá, bụi
MAP_PREVIEW_BOX = {"lac_ha": (24, 44, 48, 60), "hac_phong": (64, 66, 88, 82), "am_suong": (44, 84, 68, 100), "han_van": (48, 26, 72, 42)}


def render_map(sheet, map_id, box, k=2):
    """Vẽ một vùng bản đồ THẬT (`shared/maps/<id>.json`: ba lớp ground / decor / over) bằng ảnh tileset chưa đùn mép: ground, decor rồi over (tán phủ trên cùng, như trên đầu nhân vật).
    GID 10 (`GID_GRASS`) vẽ bằng ô cỏ trơn nền; GID 0 = không có ô. Chỉ để XEM trước: client vẽ thật ở bước S3b."""
    mp = json.load(open(os.path.join(ROOT, "shared", "maps", f"{map_id}.json"), encoding="utf8"))
    W = mp["width"]
    layers = {l["name"]: l["data"] for l in mp["layers"] if l["type"] == "tilelayer"}
    x0, y0, x1, y1 = box
    gx, gy = GRASS_LOCAL
    grass = tile_at(sheet, BLOCK_DIRT[0] + gx, BLOCK_DIRT[1] + gy)
    out = Image.new("RGBA", ((x1 - x0) * TILE, (y1 - y0) * TILE), (0, 0, 0, 255))
    for name in ("ground", "decor", "over"):
        for y in range(y0, y1):
            for x in range(x0, x1):
                g = layers[name][y * W + x]
                if g < FIRSTGID:
                    continue
                t = grass if g == FIRSTGID else tile_at(sheet, (g - FIRSTGID) % COLS, (g - FIRSTGID) // COLS)
                out.alpha_composite(t, ((x - x0) * TILE, (y - y0) * TILE))
    return out.resize((out.width * k, out.height * k), Image.NEAREST)


def map_preview(sheets, path, k=2):
    """Bốn bản đồ thật (2 x 2), mỗi bản đồ một vùng trong `MAP_PREVIEW_BOX`, bằng tileset của chính nó."""
    tiles = [render_map(sheets[mid], mid, MAP_PREVIEW_BOX[mid], k) for mid in sheets]
    w, h = tiles[0].size
    canvas = Image.new("RGB", (w * 2 + 36, h * 2 + 36), (36, 33, 44))
    for i, t in enumerate(tiles):
        canvas.paste(t.convert("RGB"), (12 + (i % 2) * (w + 12), 12 + (i // 2) * (h + 12)))
    canvas.save(path, optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=SRC_DEFAULT)
    ap.add_argument("--out", default=None, help="thư mục ghi tileset_world_<id>.png (không có thì chỉ kiểm, không ghi)")
    ap.add_argument("--preview", default=None)
    ap.add_argument("--map-preview", default=None, help="ghi ảnh 2 x 2: bốn bản đồ thật vẽ bằng tileset vừa dựng (xem trước, không phải bản chạy)")
    a = ap.parse_args()
    src = load_sources(a.src)
    sheets = {mid: build_world(src, pal) for mid, pal in PALETTES.items()}
    verify(sheets, src)
    if a.out:
        os.makedirs(a.out, exist_ok=True)
        for mid, sh in sheets.items():
            p = os.path.join(a.out, f"tileset_world_{mid}.png")
            with_trees(extrude(sh), src, PALETTES[mid]).save(p, optimize=True)
            print(p, os.path.getsize(p), "byte")
    if a.preview:
        preview(sheets, a.preview)
    if a.map_preview:
        map_preview(sheets, a.map_preview)
    for line in map_builder_report():
        print("CẦN SỬA ở server/src/systems/map-builder.ts:", line)
    print("ĐÃ DỰNG", ", ".join(sheets))


if __name__ == "__main__":
    sys.exit(main())
