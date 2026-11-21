#!/usr/bin/env python3
"""Dựng ẢNH MẪU trước / sau cho `docs/HUONG_DO_HOA_MOI.md` (mục 62, giai đoạn 1).

Chỉ để NGƯỜI DÙNG DUYỆT HƯỚNG, không đi vào bản chạy: đọc gói Ninja Adventure (CC0) đã tải ở
`/mnt/data/assets-src/ninja-adventure` và atlas hiện tại của game, ghép hai ảnh vào `docs/art/huong-moi/`.

Chạy:  python3 -I client/scripts/art/mau-huong-moi.py [--src THU_MUC_GOI] [--out THU_MUC_RA]

Ảnh 1 (`01-nhan-vat-quai-do.png`): nhân vật + bảng màu cảnh giới, hoạt hoạ, quái, vật phẩm, UI.
Ảnh 2 (`02-canh-truoc-sau.png`): CÙNG một bố cục 16x9 ô, "trước" vẽ bằng tileset / atlas hiện tại, "sau" bằng ô Ninja Adventure
16 px phóng 2 lần nguyên số (= ô 32 px của game), dùng bộ ghép góc tự động (autotile) đọc từ `tileset.tres` của gói.
Đây là ảnh GHÉP NGOÀI GAME (chưa có hạt, sương, nhãn tên, HUD): ảnh chụp thật từng cỡ màn hình làm ở bước sau.
"""

import argparse
import json
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SRC_DEFAULT = "/mnt/data/assets-src/ninja-adventure"
GAME = 2  # phóng 2 lần nguyên số: ô 16 px của gói = ô 32 px (TILE) của game
VIEW = 3  # phóng thêm để xem trên ảnh mẫu


def load(p):
    return Image.open(p).convert("RGBA")


def up(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def trim(im):
    box = im.getbbox()
    return im.crop(box) if box else im


# ---------------------------------------------------------------- bảng màu "tu tiên"
# Sprite samurai_blue chỉ có 10 màu: viền #141b1b, tóc #3b3643, da #ef914f, vải sáng #79b8ce, vải tối #548789,
# dây lưng / khăn #d14b34. Đổi ba màu vải theo cảnh giới (giữ viền / tóc / da để cùng phong cách với gói).
REALM_PALETTE = {
    "Phàm Nhân": {"light": "#e6dfc9", "dark": "#b3a98f", "accent": "#8a6a4a"},
    "Luyện Khí": {"light": "#f1f1ea", "dark": "#b4c3c9", "accent": "#3f9fc6"},
    "Trúc Cơ": {"light": "#bfe3ae", "dark": "#6fa872", "accent": "#2f7d55"},
    "Kim Đan": {"light": "#f7e5a4", "dark": "#d3a84d", "accent": "#b5832a"},
    "Nguyên Anh": {"light": "#d3c0f0", "dark": "#8f73c4", "accent": "#5b3fa0"},
}
SAMURAI_MAP = {"#79b8ce": "light", "#548789": "dark", "#d14b34": "accent"}


def hex2rgb(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def recolor(im, mapping):
    """Đổi đúng các màu trong `mapping` {#hex: #hex}; giữ nguyên alpha và mọi màu khác."""
    m = {hex2rgb(k): hex2rgb(v) for k, v in mapping.items()}
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in m:
                px[x, y] = (*m[(r, g, b)], a)
    return out


# Môi trường của gói chỉ có ~20 màu (cỏ lime, đất cam, gạch vàng), rất tươi so với tông cổ phong. Bảng đổi màu theo từng màu
# (không dùng chỉnh HSV toàn ảnh) để kiểm soát: cỏ xanh ngọc dịu, đất vàng nâu, gạch xám ấm, rễ / thân gỗ nâu. Giữ viền #141b1b.
TU_TIEN_ENV = {
    "#adbc3a": "#9cb77e", "#a8a129": "#86a068", "#74a334": "#5e8f58", "#546626": "#3f6b45", "#7a7a3e": "#66784a", "#56864c": "#3e6e4d",
    "#d3865f": "#bfa078", "#bd7959": "#a88a66", "#a3754e": "#8d6a4d", "#965340": "#7a4a3c", "#e46d3a": "#a9744f",
    "#f1c471": "#cdbb92", "#d2b37d": "#b9a47e", "#eecf9b": "#dccaa5", "#c8966b": "#a98e6b", "#cec66a": "#b1b27e",
}


def samurai_for(realm, src):
    pal = REALM_PALETTE[realm]
    return recolor(load(src + "/content/character/samurai_blue/sprite.png"), {k: pal[v] for k, v in SAMURAI_MAP.items()})


def frame16(sheet, col, row):
    return sheet.crop((col * 16, row * 16, col * 16 + 16, row * 16 + 16))


# ---------------------------------------------------------------- atlas hiện tại của game
class Atlas:
    def __init__(self):
        base = os.path.join(ROOT, "client/public/assets")
        self.img = load(base + "/atlas.png")
        fr = json.load(open(base + "/atlas.json"))["frames"]
        self.fr = fr if isinstance(fr, dict) else {x["filename"]: x for x in fr}
        self.tiles = load(base + "/tileset.png")

    def get(self, name):
        f = self.fr[name]["frame"]
        return self.img.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))

    def tile(self, i):
        return self.tiles.crop((i * 32, 0, i * 32 + 32, 32))

    def names(self, prefix):
        return [n for n in self.fr if n.startswith(prefix)]


# ---------------------------------------------------------------- autotile đọc từ tileset.tres của Godot
PEER = ["top_left_corner", "top_side", "top_right_corner", "left_side", "right_side", "bottom_left_corner", "bottom_side", "bottom_right_corner"]
NEIGH = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]


def parse_terrain_tiles(src):
    """{(x, y): {"terrain": t, bit...}} của nguồn `tileset_floor.png` trong tileset.tres (56 ô, hai địa hình grass / dirt)."""
    lines = open(src + "/content/map/tileset.tres", encoding="utf8").read().split("\n")
    rid = None
    for l in lines:
        m = re.match(r'\[ext_resource .*path="res://content/map/tileset_floor.png" id="([^"]+)"', l)
        if m:
            rid = m[1]
    start = next(i for i, l in enumerate(lines) if l.strip() == f'texture = ExtResource("{rid}")')
    tiles = {}
    for l in lines[start + 1 :]:
        if l.startswith("["):
            break
        m = re.match(r"(\d+):(\d+)/0/(terrain|terrains_peering_bit/(\w+)) = (-?\d+)", l)
        if m:
            key = m[4] if m[4] else "terrain"
            tiles.setdefault((int(m[1]), int(m[2])), {})[key] = int(m[5])
    return tiles


def autotile(grid, tiles, floor_img, variant, bg=None):
    """Ghép lớp địa hình `grid` (0 / 1) bằng ô của khối màu `variant` = (cột, hàng) trong `tileset_floor.png`
    (8 khối 11x7 ô cùng bố cục: 2 cột x 4 hàng; terrain trong tileset.tres nằm ở khối (0, 1)). Chọn ô khớp đủ 8 hàng xóm,
    nếu thiếu thì lấy ô khớp nhiều bit nhất (bộ 56 ô không đủ 256 tổ hợp)."""
    h, w = len(grid), len(grid[0])
    dx, dy = variant[0] * 11, (variant[1] - 1) * 7
    layer = Image.new("RGBA", (w * 16, h * 16), (0, 0, 0, 0))
    by_center = {}
    for pos, v in tiles.items():
        by_center.setdefault(v.get("terrain"), []).append((pos, v))
    for y in range(h):
        for x in range(w):
            t = grid[y][x]
            want = [grid[min(max(y + oy, 0), h - 1)][min(max(x + ox, 0), w - 1)] for ox, oy in NEIGH]
            best, score = None, -1
            for pos, v in by_center.get(t, []):
                s = sum(1 for i, n in enumerate(PEER) if v.get(n, t) == want[i])  # bit thiếu = cùng địa hình tâm
                if s > score:
                    best, score = pos, s
            if best is None:
                continue
            sx, sy = (best[0] + dx) * 16, (best[1] + dy) * 16
            layer.alpha_composite(floor_img.crop((sx, sy, sx + 16, sy + 16)), (x * 16, y * 16))
    return layer


# ---------------------------------------------------------------- bố cục chung 16x9 ô
MAP = [
    "ggtgggggggggggtg",
    "gfffffgggggggggg",
    "gfffffddddgggtgg",
    "gfffffddddgwwwgg",
    "gggggggddggwwwwg",
    "ggggddddddgwwwwg",
    "ggggddddddgwwwgg",
    "gtggGggddggggggg",
    "gggggggggggggggg",
]
W, H = len(MAP[0]), len(MAP)
PLAYER = (7, 4)
NPC = (5, 1)
MONS = [(10, 1, "tho"), (11, 7, "lang"), (3, 6, "ho")]


def scene_truoc(at):
    # tileset hiện tại: 0 cỏ, 1 cỏ cao, 2 đất, 3 nước, 4 cây, 5 núi đá, 6 sàn trấn, 7 cát (ô 32 px, không ghép góc)
    kind = {"g": 0, "G": 1, "d": 2, "w": 3, "t": 0, "f": 6}
    im = Image.new("RGBA", (W * 32, H * 32))
    for y, row in enumerate(MAP):
        for x, c in enumerate(row):
            im.alpha_composite(at.tile(kind[c]), (x * 32, y * 32))
    for y, row in enumerate(MAP):
        for x, c in enumerate(row):
            if c == "t":
                im.alpha_composite(at.tile(4), (x * 32, y * 32))
    return actors_truoc(im, at)


def actors_truoc(im, at):
    """Nhân vật / NPC / quái hiện tại của game (atlas, ô 32 px) lên cảnh `im`."""
    def put(frame, tx, ty):
        im.alpha_composite(frame, (tx * 32 + 16 - frame.width // 2, ty * 32 + 32 - frame.height))
    put(at.get("npc-truong_tran"), *NPC)
    for x, y, m in MONS:
        put(at.get("mon-" + m), x, y)
    put(at.get("me-idle-down"), *PLAYER)
    return im


def scene_sau(src, grade=False):
    floor = load(src + "/content/map/tileset_floor.png")
    village = load(src + "/content/map/tileset_village_abandoned.png")
    interior = load(src + "/content/map/tileset_interior_floor.png")
    terr = parse_terrain_tiles(src)
    dirt = [[1 if c == "d" else 0 for c in row] for row in MAP]
    water = [[1 if c == "w" else 0 for c in row] for row in MAP]
    plaza = [[1 if c == "f" else 0 for c in row] for row in MAP]
    im = autotile(dirt, terr, floor, (0, 1))  # cỏ + đất (khối xanh lá / nâu)
    # sàn trấn: gạch vàng của tileset_interior_floor (ô lõi (6,14)); viền sàn là ô lõi nên tối giản, bản thật dùng khung 3x3 của khối
    cobble = interior.crop((6 * 16, 14 * 16, 7 * 16, 15 * 16))
    for y in range(H):
        for x in range(W):
            if plaza[y][x]:
                im.alpha_composite(cobble, (x * 16, y * 16))
    # Gói clone KHÔNG có ô nước: khối (0, 3) của tileset_floor là BĂNG trên nền trắng. Bỏ nền trắng (trong suốt) rồi đổi sang xanh nước
    # để làm ao mẫu; bản thật cần ô nước riêng của gói itch.io hoặc tự vẽ bổ sung (ghi ở mục 3 của tài liệu).
    wl = autotile(water, terr, floor, (0, 3))
    wl = recolor(wl, {"#ffffff": "#ffffff"})
    px = wl.load()
    for yy in range(wl.height):
        for xx in range(wl.width):
            r, g, b, a = px[xx, yy]
            if a and (r, g, b) == (255, 255, 255):
                px[xx, yy] = (0, 0, 0, 0)
    im.alpha_composite(recolor(wl, {"#b8dce5": "#8bbccd", "#f2eaf1": "#d9edf2"}))
    sprites = {
        "bigtree": trim(village.crop((0, 96, 64, 144))),
        "tree": trim(village.crop((64, 96, 96, 136))),
        "frog": trim(village.crop((144, 80, 176, 112))),
    }
    def put(spr, tx, ty, cx=8):
        im.alpha_composite(spr, (tx * 16 + cx - spr.width // 2, ty * 16 + 16 - spr.height))
    for y, row in enumerate(MAP):
        for x, c in enumerate(row):
            if c == "t":
                put(sprites["tree"], x, y)
    put(sprites["bigtree"], 13, 8, 8)
    if grade:
        im = recolor(im, TU_TIEN_ENV)
    return im, sprites


def actors_sau(img, src):
    """Thêm nhân vật / NPC / quái mẫu của gói lên cảnh `img` (ô 16 px). Quái mẫu: heo (pig) và yêu mũ rơm (samurai_green) vì
    bản clone GitHub chỉ có hai con này; NPC: ninja_blue đổi sang áo nâu (ẩn sĩ)."""
    pig = load(src + "/content/character/pig/pig.png")
    kappa = frame16(load(src + "/content/character/samurai_green/samurai_green.png"), 0, 0)

    def put(frame, tx, ty):
        fr = trim(frame)
        img.alpha_composite(fr, (tx * 16 + 8 - fr.width // 2, ty * 16 + 16 - fr.height))
    npc = recolor(frame16(load(src + "/content/character/ninja_blue/sprite.png"), 0, 0), {"#79b8ce": "#a6896a", "#5f7160": "#6b5a46", "#f1c471": "#e0c9a0"})
    put(npc, *NPC)
    put(pig.crop((0, 0, 16, 16)), 10, 1)
    put(kappa, 11, 7)
    put(pig.crop((16, 0, 32, 16)), 3, 6)
    put(frame16(samurai_for("Luyện Khí", src), 0, 0), *PLAYER)
    return img


def compose_scene(out, src, at):
    scale = 2  # phóng xem: 512x288 -> 1024x576
    panels = [
        ("TRƯỚC — hiện tại (tileset 8 ô + atlas 32 px, mép ô vuông, không ghép góc)", (255, 220, 140, 255), up(scene_truoc(at), scale)),
        ("SAU A — gói Ninja Adventure nguyên màu (ô 16 px x2 = ô 32 px, ghép góc tự động)", (150, 235, 190, 255), up(up(actors_sau(scene_sau(src)[0], src), GAME), scale)),
        ("SAU B — cùng cảnh, đổi màu theo bảng 'tu tiên' (cỏ ngọc dịu, đất vàng, gạch xám ấm)", (150, 220, 255, 255), up(up(actors_sau(scene_sau(src, grade=True)[0], src), GAME), scale)),
        ("SAU C (pha trộn) — nền / cây của gói + nhân vật, quái HIỆN TẠI (mật độ điểm ảnh khác nhau)", (255, 190, 200, 255), up(actors_truoc(up(scene_sau(src, grade=True)[0], GAME), at), scale)),
    ]
    assert len({p[2].size for p in panels}) == 1, [p[2].size for p in panels]
    pw, ph = panels[0][2].size
    pad, head = 24, 44
    canvas = Image.new("RGBA", (pw + pad * 2, (ph + head) * len(panels) + pad), (28, 26, 32, 255))
    d = ImageDraw.Draw(canvas)
    font = label_font(22)
    for i, (title, col, im) in enumerate(panels):
        y = pad // 2 + i * (ph + head)
        d.text((pad, y + 8), title, fill=col, font=font)
        canvas.alpha_composite(im, (pad, y + head))
    canvas.convert("RGB").save(out, optimize=True)


def label_font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


# ---------------------------------------------------------------- ảnh 1: bảng so sánh theo loại
def compose_sheet(out, src, at):
    f = label_font(22)
    small = label_font(17)
    rows = []  # (tiêu đề, [ảnh trước], [ảnh sau], ghi chú)
    robes = [n for n in at.names("robe-") if "-die-" not in n][:5]
    me = [at.get("me-idle-down")] + [at.get(n) for n in robes[:4]]
    after_chars = [trim(frame16(samurai_for(r, src), 0, 0)) for r in REALM_PALETTE]
    rows.append(("Nhân vật (5 cảnh giới: Phàm Nhân, Luyện Khí, Trúc Cơ, Kim Đan, Nguyên Anh)", me, after_chars, 1))
    walk_b = [at.get(f"me-walk-down-{i}") for i in range(4)] + [at.get(f"me-slash-down-{i}") for i in range(3)]
    sh = samurai_for("Luyện Khí", src)
    walk_a = [trim(frame16(sh, 0, r)) for r in range(7)]
    rows.append(("Hoạt hoạ hướng xuống: đi x4 + chém (trước 3 khung, gói 1 khung) + nhảy / ngã (hàng 5 / 6)", walk_b, walk_a, 1))
    mons_b = [at.get(f"mon-{m}") for m in ("tho", "lang", "ho", "mang", "thach_quy", "doc_thiem")]
    pig = load(src + "/content/character/pig/pig.png")
    kappa = frame16(load(src + "/content/character/samurai_green/samurai_green.png"), 0, 0)
    mons_a = [trim(pig.crop((0, 0, 16, 16))), trim(pig.crop((16, 0, 32, 16))), trim(kappa)]
    rows.append(("Quái (bản clone GitHub chỉ có heo + yêu mũ rơm; gói itch.io có 30+ quái, 9 trùm)", mons_b, mons_a, 1))
    items_b = [at.get(n) for n in at.names("item-")[:8]]
    ws = [trim(load(src + f"/content/weapon/{w}/sprite.png")) for w in ("big_sword", "axe", "book", "club")]
    ws += [trim(load(src + f"/content/destroyable/{w}.png")) for w in ("pot", "crate")]
    ws += [trim(load(src + "/content/ui/heart.png").crop((64, 0, 80, 16)))]
    rows.append(("Biểu tượng vật phẩm (trước 24 px; gói clone có vũ khí / hũ / hòm, gói itch.io có 60+ món)", items_b, ws, 1))
    cell = 120
    label_w, pad = 0, 20
    width = pad * 3 + 2 * (cell * 8 + 40)
    height = 70 + len(rows) * (cell + 78) + 20
    canvas = Image.new("RGBA", (width, height), (28, 26, 32, 255))
    d = ImageDraw.Draw(canvas)
    d.text((pad, 14), "TRƯỚC (hiện tại)", fill=(255, 220, 140, 255), font=f)
    d.text((pad * 2 + cell * 8 + 40, 14), "SAU (mẫu Ninja Adventure, CC0, đã đổi màu)", fill=(150, 235, 190, 255), font=f)
    y = 52
    for title, before, after, _ in rows:
        d.text((pad, y), title, fill=(210, 210, 220, 255), font=small)
        y += 30
        for col, items, scale in ((0, before, VIEW), (1, after, VIEW * GAME)):
            x0 = pad + col * (pad + cell * 8 + 40)
            for i, im in enumerate(items):
                k = scale
                big = up(im, k)
                if big.width > cell or big.height > cell:  # chỉ hạ khi to quá ô (không phóng không nguyên số)
                    big = up(im, max(1, min(cell // im.width, cell // im.height)))
                panel = Image.new("RGBA", (cell, cell), (58, 70, 58, 255))
                panel.alpha_composite(big, ((cell - big.width) // 2, cell - big.height - 6 if big.height < cell - 6 else 0))
                canvas.alpha_composite(panel, (x0 + i * (cell + 4), y))
        y += cell + 48
    # bảng màu
    d.text((pad, y - 28), "Bảng màu đạo bào: sáng / tối / dây lưng (màu viền #141b1b, tóc #3b3643, da #ef914f giữ nguyên của gói)", fill=(210, 210, 220, 255), font=small)
    x = pad
    for name, pal in REALM_PALETTE.items():
        for k in ("light", "dark", "accent"):
            d.rectangle([x, y, x + 34, y + 34], fill=pal[k])
            x += 38
        d.text((x + 4, y + 8), name, fill=(220, 220, 230, 255), font=small)
        x += 150
    canvas.crop((0, 0, width, y + 56)).convert("RGB").save(out, optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=SRC_DEFAULT)
    ap.add_argument("--out", default=os.path.join(ROOT, "docs/art/huong-moi"))
    a = ap.parse_args()
    if not os.path.isdir(a.src):
        sys.exit(f"Không thấy gói Ninja Adventure ở {a.src} (git clone https://github.com/pixel-boy/NinjaAdventure vào đó)")
    os.makedirs(a.out, exist_ok=True)
    at = Atlas()
    compose_sheet(os.path.join(a.out, "01-nhan-vat-quai-do.png"), a.src, at)
    compose_scene(os.path.join(a.out, "02-canh-truoc-sau.png"), a.src, at)
    print("xong:", a.out)


if __name__ == "__main__":
    main()
