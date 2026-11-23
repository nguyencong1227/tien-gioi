#!/usr/bin/env python3
# Dựng BẢNG DUYỆT TỪNG PHẦN (QUYET_DINH_M3 mục 67.2 / 69, issue #1330): mỗi đối tượng một MÃ, mỗi mã có hình HIỆN TẠI và 1-3 phương án A / B / C lấy từ các gói đã có trên máy,
# ghép thành TỜ ẢNH đánh số (nền tối, mỗi hình đã thu / phóng về xấp xỉ CỠ TRONG GAME rồi phóng thêm VIEW lần nguyên số để dễ nhìn) và bảng markdown.
#
#   python3 -I client/scripts/art/dung-bang-duyet.py [--groups 10,11,12,13] [--public docs/art/huong-moi] [--private /mnt/data/assets-private/preview] [--md <tệp.md>]
#
# GIẤY PHÉP (mục 63 / 69): tờ CÔNG KHAI (vào repo) chỉ chứa hình HIỆN TẠI của game + gói CC0 (Ninja Adventure, Xianxia Pixel Pack); ô của gói CẤM PHÂN PHỐI LẠI (Wuxia RTS, Sunnyside,
# Cainos) trên tờ công khai chỉ là khung trống ghi "xem tờ riêng". Tờ ĐẦY ĐỦ (có hình gói riêng) ghi vào thư mục riêng, KHÔNG lên GitHub.
import argparse
import glob
import importlib.util
import os
import sys

sys.dont_write_bytecode = True
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
NINJA = "/mnt/data/assets-src/ninja-adventure"
XIAN = "/mnt/data/assets-work/b-duyet/xianxia/Xianxia_Pixel_Pack"
WUXIA = "/mnt/data/assets-private/work/wuxia-rts/Wuxia_RTS_Pixel_Lite_v1.0"
SUNNY = "/mnt/data/assets-private/work/sunnyside/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets"
HICON = "/mnt/data/assets-private/work/hoantdz-icons/Wuxia_Pixel_Icons_Mega_FREE_Sample_v1.0.0"
BB = "/mnt/data/assets-private/work/hoantdz-battlebacks/Wuxia_Xianxia_Pixel_Battlebacks_100_v1.0.0"

VIEW = 3  # phóng nguyên số thêm để xem
BG = (26, 24, 33)
PANEL = (40, 37, 50)
INK = (240, 232, 214)
DIM = (160, 154, 168)
GOLD = (233, 196, 106)

# nguồn -> (tên, giấy phép, riêng?, góc nhìn)
SRC = {
    "cur": ("Hiện tại", "của nhóm (vẽ bằng mã)", False, "top-down 4 hướng"),
    "ninja": ("Ninja Adventure", "CC0", False, "top-down 4 hướng, 16 px"),
    "xian": ("Xianxia Pixel Pack (willYEE)", "CC0", False, "NHÌN NGANG (2D cuộn ngang)"),
    "wuxia": ("Wuxia RTS Lite (DQYYY)", "riêng: cấm phân phối lại / huấn luyện AI", True, "top-down 8 hướng"),
    "sunny": ("Sunnyside World Free", "riêng: cấm đóng gói lại / huấn luyện AI", True, "nhìn ngang, 16 px"),
    "hicon": ("HOANTDZ Wuxia Pixel Icons (mẫu miễn phí)", "riêng: cấm bán lại / phân phối lại / huấn luyện AI", True, "icon 32 px, 5 bậc"),
    "bb": ("HOANTDZ Wuxia & Xianxia Battlebacks 100", "riêng: cấm phân phối lại / huấn luyện AI; ảnh do AI tạo", True, "ảnh nền 640x360"),
}


# màu tô theo hệ cho hiệu ứng đơn sắc của Xianxia (chỉ để XEM; màu thật do người dùng / `FX` của game chốt)
ELEMENT_RGB = {
    "kim": (240, 210, 100), "moc": (110, 205, 110), "thuy": (80, 160, 240), "hoa": (245, 105, 50), "tho": (205, 160, 90),
    "bang": (150, 225, 250), "phong": (160, 235, 205), "loi": (180, 130, 255), "am": (155, 95, 195), "none": (235, 235, 235),
}
ELEMENT_NAME = {"kim": "Kim", "moc": "Mộc", "thuy": "Thủy", "hoa": "Hỏa", "tho": "Thổ", "bang": "Băng", "phong": "Phong", "loi": "Lôi", "am": "Âm", "none": "Vô sắc"}


def _load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def load(p):
    return Image.open(p).convert("RGBA")


def trim(im):
    b = im.getbbox()
    return im.crop(b) if b else im


def first(pattern):
    fs = sorted(glob.glob(pattern))
    if not fs:
        raise FileNotFoundError(pattern)
    return fs[0]


def fit(im, game_h, view=VIEW):
    """Thu / phóng `im` về cao xấp xỉ `game_h` điểm ảnh GAME rồi phóng `view` lần nguyên số. Phóng to nguyên số = giữ điểm ảnh; thu nhỏ dùng LANCZOS (chỉ để XEM, bản thật sẽ thu theo đường khác)."""
    im = trim(im)
    if game_h is None:  # giao diện: giữ CỠ THẬT (không thu / phóng), chỉ phóng nguyên số `view` lần nếu là điểm ảnh nhỏ
        return (im.resize((im.width * view, im.height * view), Image.NEAREST) if view > 1 else im), None
    k = game_h / im.height
    if k >= 1:
        n = max(1, round(k))
        im = im.resize((im.width * n, im.height * n), Image.NEAREST)
        k = n
    else:
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    return im.resize((im.width * view, im.height * view), Image.NEAREST), k


SHOT = os.path.join(ROOT, "docs/screenshots")
UI_DIR = {"xian": f"{XIAN}/ui", "ninja": f"{NINJA}/theme", "sunny": f"{SUNNY}/UI"}


def tres_margins(path):
    """Biên 9-slice (trái, trên, phải, dưới) trong tệp `.tres` của gói Godot."""
    import re

    t = open(path, encoding="utf8").read()
    return tuple(int(float(re.search(rf"texture_margin_{k} = ([\d.]+)", t).group(1))) for k in ("left", "top", "right", "bottom"))


def nine(im, m, size, scale=1, smooth=False):
    """Dựng khung 9-slice cỡ `size` từ `im` với biên `m` (trái, trên, phải, dưới). `scale` phóng / thu cả ảnh nguồn trước (điểm ảnh nhỏ: phóng nguyên số, NEAREST)."""
    if scale != 1:
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.NEAREST if scale > 1 else Image.LANCZOS)
        m = tuple(max(1, round(v * scale)) for v in m)
    l, t, r, b = m
    W, H = size
    sw, sh = im.size
    xs = [(0, l, 0, l), (l, sw - r, l, W - r), (sw - r, sw, W - r, W)]
    ys = [(0, t, 0, t), (t, sh - b, t, H - b), (sh - b, sh, H - b, H)]
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for sy0, sy1, dy0, dy1 in ys:
        for sx0, sx1, dx0, dx1 in xs:
            if sx1 <= sx0 or sy1 <= sy0 or dx1 <= dx0 or dy1 <= dy0:
                continue
            piece = im.crop((sx0, sy0, sx1, sy1))
            if piece.size != (dx1 - dx0, dy1 - dy0):
                piece = piece.resize((dx1 - dx0, dy1 - dy0), Image.BICUBIC if smooth else Image.NEAREST)
            out.alpha_composite(piece, (dx0, dy0))
    return out


def stack(ims, gap=4):
    """Xếp các ảnh theo chiều dọc (căn trái) thành MỘT ảnh: một ô phương án có thể chứa nhiều thanh."""
    W = max(i.width for i in ims)
    H = sum(i.height for i in ims) + gap * (len(ims) - 1)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    y = 0
    for i in ims:
        out.alpha_composite(i, (0, y))
        y += i.height + gap
    return out


def side(ims, gap=6):
    """Xếp các ảnh theo chiều ngang (căn giữa dọc) thành MỘT ảnh."""
    W = sum(i.width for i in ims) + gap * (len(ims) - 1)
    H = max(i.height for i in ims)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x = 0
    for i in ims:
        out.alpha_composite(i, (x, (H - i.height) // 2))
        x += i.width + gap
    return out


# ---------------------------------------------------------------- bộ nạp theo nguồn
class Loaders:
    def __init__(self):
        mm = _load_module(os.path.join(HERE, "mau-huong-moi.py"), "mau_huong_moi")
        self.mm = mm
        self.at = mm.Atlas()

    # hiện tại
    def cur(self, name):
        return self.at.get(name)

    # Ninja Adventure: sprite.png 64x112 = 4 cột (hướng: xuống, lên, trái, phải) x 7 hàng (0-3 đi, 4 chém)
    def ninja(self, who, direction=0, row=0, palette=None):
        sheet = load(f"{NINJA}/content/character/{who}/sprite.png")
        if palette:
            sheet = self.mm.recolor(sheet, {k: palette[v] for k, v in self.mm.SAMURAI_MAP.items()})
        return sheet.crop((direction * 16, row * 16, direction * 16 + 16, row * 16 + 16))

    # Xianxia: ảnh từng khung trong thư mục <tên>_<hành động>_frames
    def xian(self, name, action="idle", idx=0):
        d = f"{XIAN}/characters/{name}_{action}_frames"
        fs = sorted(glob.glob(d + "/*.png"))
        return load(fs[min(idx, len(fs) - 1)])

    def xian_portrait(self, role, mood="neutral"):
        return load(f"{XIAN}/characters/xf_npc_{role}_{mood}.png")

    # Xianxia fx: hiệu ứng ĐƠN SẮC (trắng -> xám đậm) 256x256, tô màu theo hệ bằng phép nhân màu (đúng cách README của gói khuyên dùng lúc chạy)
    def xian_fx(self, name, element, n=3):
        fs = sorted(glob.glob(f"{XIAN}/fx/{name}_frames/*.png"))
        if not fs:
            raise FileNotFoundError(name)
        # 3 khung quanh ĐỈNH hiệu ứng (25 % / 50 % / 75 %): khung đầu / cuối thường quá nhỏ hoặc mờ để so sánh
        pick = [fs[min(len(fs) - 1, round((i + 1) * (len(fs) - 1) / (n + 1)))] for i in range(n)] if len(fs) > n else fs
        r, g, b = ELEMENT_RGB[element]
        out = []
        for p in pick:
            im = load(p)
            px = im.load()
            for y in range(im.height):
                for x in range(im.width):
                    pr, pg, pb, pa = px[x, y]
                    if pa:
                        v = ((pr + pg + pb) / 3) / 255  # độ sáng 0..1 của nét đơn sắc
                        k = v**0.5  # nâng vùng tối để không chìm vào nền
                        hi = max(0.0, (v - 0.78) / 0.22) * 0.45  # vùng gần trắng ngả về trắng (lõi sáng)
                        px[x, y] = tuple(min(255, int(c * k + 255 * hi)) for c in (r, g, b)) + (pa,)
            out.append(im)
        return out

    # giao diện: HIỆN TẠI cắt từ ảnh chụp trong docs/screenshots (điểm ảnh thật, 1 ảnh = 1 điểm CSS); phương án lấy từ thư mục UI của từng gói
    def shot(self, name, box):
        return load(os.path.join(SHOT, name)).crop(box)

    def ui(self, src, rel):
        return load(os.path.join(UI_DIR[src], rel))

    def wuxia_slash(self, n=3):
        fs = sorted(glob.glob(f"{WUXIA}/05_VFX/Blade_Slash/Frames/*.png"))
        return [load(fs[round(i * (len(fs) - 1) / max(1, n - 1))]) for i in range(n)]

    # Wuxia RTS Lite: Game_Ready_Frames/<Unit>_<Anim>_<Dir>_NN.png (top-down 8 hướng)
    def wuxia(self, group, unit, anim="Idle", direction="South", idx=1):
        base = f"{WUXIA}/01_Characters/{group}/{unit}/Game_Ready_Frames"
        return load(first(f"{base}/{unit}_{anim}_{direction}_{idx:02d}.png"))

    # Sunnyside: dải ngang, mỗi khung 96x64
    def sunny_human(self, hair="longhair", idx=0):
        base = load(f"{SUNNY}/Characters/Human/IDLE/base_idle_strip9.png")
        h = load(f"{SUNNY}/Characters/Human/IDLE/{hair}_idle_strip9.png")
        base.alpha_composite(h)
        return base.crop((idx * 96, 0, idx * 96 + 96, 64))

    def sunny_strip(self, rel, n, idx=0):
        im = load(f"{SUNNY}/{rel}")
        w = im.width // n
        return im.crop((idx * w, 0, idx * w + w, im.height))

    # Vật phẩm (nhóm 14, G + B): chỉ nguồn CÔNG KHAI. Xianxia `icons/icon_xianxia_<loại>_<nn>.png` (32 px, 6 PHẨM mỗi loại: 00 thấp -> 05 cao) và `ui/ui_xianxia_item_<tên>.png` (đồ dùng);
    # Ninja Adventure `content/weapon/<tên>/sprite.png` (vũ khí / sách phép nhỏ, KHÔNG cần đổi màu theo cảnh giới như nhân vật)
    def xian_icon(self, base, idx=0):
        return load(f"{XIAN}/icons/icon_xianxia_{base}_{max(0, min(5, idx)):02d}.png")

    def xian_item(self, name):
        return load(f"{XIAN}/ui/ui_xianxia_item_{name}.png")

    def ninja_weapon(self, w):
        return load(f"{NINJA}/content/weapon/{w}/sprite.png")

    # HOANTDZ Wuxia Icons (RIÊNG): chỉ mục `_Index/sample_icons.csv` (2000 icon, 5 bậc T1..T5); `hicon_pick` chọn icon theo bộ lọc + BẬC GẦN NHẤT, `nth` xoay vòng giữa các họ (tất định)
    _hicon_cache = None

    def hicon_rows(self):
        if Loaders._hicon_cache is None:
            import csv

            Loaders._hicon_cache = list(csv.DictReader(open(f"{HICON}/_Index/sample_icons.csv", encoding="utf8")))
        return Loaders._hicon_cache

    def hicon_pick(self, pack=None, category=None, slot=None, name_has=None, tier=1, nth=0):
        cand = [
            r for r in self.hicon_rows()
            if (pack is None or r["pack"] == pack) and (category is None or r["category"] == category) and (slot is None or r["slot"] == slot)
            and (name_has is None or name_has.lower() in r["name_en"].lower())
        ]
        if not cand:
            raise KeyError("hicon")
        best = min(abs(int(r["tier_rank"]) - tier) for r in cand)
        cand = sorted((r for r in cand if abs(int(r["tier_rank"]) - tier) == best), key=lambda r: r["asset_id"])
        return cand[nth % len(cand)]

    def hicon_image(self, row):
        return load(f"{HICON}/{row['icon'].replace('64px', '32px', 1)}")

    # HOANTDZ Battlebacks (RIÊNG): cảnh theo mã BBnn-mm; ảnh gốc 640x360 (bản `01_Native`)
    def battleback(self, bid):
        import csv

        for r in csv.DictReader(open(f"{BB}/_Index/all_battlebacks.csv", encoding="utf8")):
            if r["id"] == bid:
                return load(f"{BB}/{r['path_640x360']}"), r["name_en"]
        raise KeyError(bid)


# ---------------------------------------------------------------- tờ ảnh
class Cell:
    def __init__(self, letter, src, frames, cap, game_h, view=None, note=None):
        self.letter, self.src, self.cap, self.note = letter, src, cap, note  # note: chữ trong ô trống thay câu mặc định
        self.frames, self.game_h = frames, game_h  # frames: list[Image] (hoặc [] = không có); game_h None = giữ cỡ thật
        self.view = view or VIEW  # hệ số phóng thêm (giao diện dùng 1, biểu tượng điểm ảnh nhỏ dùng 3)


def cell_image(c, public):
    """Ảnh của một ô (dải khung nằm ngang) hoặc khung trống nếu không có / là gói riêng trên tờ công khai."""
    private = SRC[c.src][2]
    if not c.frames or (public and private):
        w, h = 200, (56 if c.game_h is None else 110)  # giao diện (game_h None) dùng ô trống thấp hơn để hàng gọn
        im = Image.new("RGBA", (w, h), PANEL)
        d = ImageDraw.Draw(im)
        if c.frames:
            msg = "gói riêng: xem tờ riêng\n(không đưa lên GitHub)"
        elif c.src == "cur":
            msg = c.note or "chưa có hình riêng trong atlas\n(dùng hình dự phòng)"
        else:
            msg = "KHÔNG CÓ trong các gói"
        d.multiline_text((w // 2, h // 2), msg, font=font(12), fill=DIM, anchor="mm", align="center")
        return im, 0
    parts, k = [], 1
    for f in c.frames:
        p, k = fit(f, c.game_h, c.view)
        parts.append(p)
    gap = 6
    W = sum(p.width for p in parts) + gap * (len(parts) - 1)
    H = max(p.height for p in parts)
    strip = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x = 0
    for p in parts:
        strip.alpha_composite(p, (x, H - p.height))
        x += p.width + gap
    return strip, k


def render_sheet(title, rows, path, public):
    import textwrap

    f_lab, f_cap, f_tit, f_let = font(15), font(11), font(20), font(16)
    LAB_W, PAD = 270, 12
    rendered = []
    for r in rows:
        cells = [r["cur"]] + r["opts"]
        rendered.append([cell_image(c, public) for c in cells])
    # độ rộng cột = ô rộng nhất của cột đó (kẹp 200..420) để dải khung không bị cắt
    ncols = 4
    colw = [max(200, min(700, max(imgs[i][0].width for imgs in rendered) + 12)) for i in range(ncols)]
    xs = [LAB_W + PAD + sum(colw[:i]) + 8 * i for i in range(ncols)]
    W = xs[-1] + colw[-1] + PAD
    heights = []
    for r, imgs in zip(rows, rendered):
        img_h = max(im.height for im, _ in imgs)
        cap_lines = max(len(textwrap.wrap(c.cap + "  x9.99", width=max(18, int(colw[i] / 6.2)))) for i, c in enumerate([r["cur"]] + r["opts"]))
        # cột nhãn bên trái (tên + khuyến nghị) cũng phải vừa trong hàng, nếu không chữ tràn sang hàng dưới
        left_h = 30 + 19 * len(textwrap.wrap(r["name"], width=30)) + ((4 + 14 * len(textwrap.wrap("khuyến nghị: " + r["rec"], width=38))) if r.get("rec") else 0) + 14
        if r.get("top"):  # căn đỉnh: chú thích nằm ngay dưới hình CỦA TỪNG ô, hàng cao theo ô cao nhất (kể cả chú thích)
            body = max(im.height + 4 + 14 * len(textwrap.wrap(c.cap + "  x9.99", width=max(18, int(colw[i] / 6.2)))) for i, ((im, _), c) in enumerate(zip(imgs, [r["cur"]] + r["opts"])))
            heights.append(max(34 + body + 12, 96, left_h))
        else:
            heights.append(max(img_h + 34 + 14 * cap_lines + 12, 96, left_h))
    H = 70 + sum(heights) + PAD
    sheet = Image.new("RGBA", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    d.text((PAD, 14), title, font=f_tit, fill=GOLD)
    d.text((PAD, 40), rows[0].get("sub") or "mỗi hình ĐÃ thu / phóng về cỡ trong game rồi ×%d; 'x' nhỏ = hệ số thu phóng" % VIEW, font=f_cap, fill=DIM)
    y = 62
    for r, imgs, h in zip(rows, rendered, heights):
        d.rounded_rectangle((PAD // 2, y, W - PAD // 2, y + h - 6), radius=6, fill=(33, 30, 42))
        d.text((PAD + 4, y + 8), r["code"], font=f_let, fill=GOLD)
        ny = y + 30
        for line in textwrap.wrap(r["name"], width=30):
            d.text((PAD + 4, ny), line, font=f_lab, fill=INK)
            ny += 19
        if r.get("rec"):
            ny += 4
            for line in textwrap.wrap("khuyến nghị: " + r["rec"], width=38):
                d.text((PAD + 4, ny), line, font=f_cap, fill=(140, 214, 140))
                ny += 14
        cells = [r["cur"]] + r["opts"]
        img_h = max(im.height for im, _ in imgs)
        for i, ((im, k), c) in enumerate(zip(imgs, cells)):
            x = xs[i]
            tag = "HIỆN TẠI" if i == 0 else c.letter
            d.rounded_rectangle((x, y + 8, x + 20 + (60 if i == 0 else 0), y + 28), radius=4, fill=GOLD if i else (90, 84, 110))
            d.text((x + 6, y + 10), tag, font=f_cap, fill=(26, 24, 33) if i else INK)
            sheet.alpha_composite(im, (x, y + 34 + (0 if r.get("top") else img_h - im.height)))  # nhân vật / quái đứng trên đất (căn đáy); giao diện căn đỉnh (top=True)
            cap = c.cap + (f"  x{k:.2g}" if k else "")
            cy = y + 34 + (im.height if r.get("top") else img_h) + 4
            for line in textwrap.wrap(cap, width=max(18, int(colw[i] / 6.2))):
                d.text((x, cy), line, font=f_cap, fill=DIM)
                cy += 14
        y += h
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.convert("RGB").save(path, optimize=True)


# ---------------------------------------------------------------- dữ liệu các nhóm
def cell(L, letter, src, getter, cap, game_h, view=None):
    """Ô phương án: `getter` trả Image hoặc list[Image]; trả về ô trống nếu lỗi tìm tệp (ghi rõ trong tờ)."""
    try:
        v = getter()
    except (FileNotFoundError, KeyError, IndexError):
        v = []
    return Cell(letter, src, v if isinstance(v, list) else [v], cap, game_h, view)


def group_nv(L):
    SAM = L.mm.REALM_PALETTE
    rows = []
    rows.append(dict(code="NV-01", name="Người chơi (nam), đứng", rec="B (thân top-down 8 hướng) hoặc A", cur=cell(L, "", "cur", lambda: L.cur("me-idle-down"), "đạo sĩ áo trắng 32x40", 40),
        opts=[cell(L, "A", "ninja", lambda: L.ninja("samurai_blue", 0, 0, SAM["Luyện Khí"]), "samurai (đạo bào Luyện Khí) 16 px", 40),
              cell(L, "B", "wuxia", lambda: L.wuxia("Core_Units", "Swordsman", "Idle", "South"), "Swordsman, 8 hướng, 156x180", 40),
              cell(L, "C", "xian", lambda: L.xian("xf_hero_swordsman", "idle"), "swordsman NHÌN NGANG", 40)]))
    rows.append(dict(code="NV-02", name="Người chơi (nữ), đứng", rec="C cho chân dung; thân cần tô lại", cur=Cell("", "cur", [], "chưa có nhân vật nữ", 40),
        opts=[cell(L, "A", "xian", lambda: L.xian("xf_hero_heroine", "idle"), "heroine NHÌN NGANG", 40),
              cell(L, "B", "sunny", lambda: L.sunny_human("longhair"), "Human tóc dài 16 px, nhìn ngang", 40),
              Cell("C", "ninja", [], "", 40)]))
    robes = ["Phàm Nhân", "Trúc Cơ", "Kim Đan"]
    rows.append(dict(code="NV-03", name="Áo theo trang bị (3 bộ áo hiện có)", rec="A (đổi màu áo theo bộ)", cur=cell(L, "", "cur", lambda: [L.cur("robe-tho_nhung_bao"), L.cur("robe-hac_ho_bao"), L.cur("robe-xich_lan_bao")], "thổ nhung / hắc hổ / xích lân", 40),
        opts=[cell(L, "A", "ninja", lambda: [L.ninja("samurai_blue", 0, 0, SAM[n]) for n in robes], "samurai đổi màu vải (3 bộ)", 40),
              Cell("B", "wuxia", [], "", 40),
              cell(L, "C", "xian", lambda: [L.xian(f"xf_hero_swordsman_v_{c}", "idle") for c in ("black", "green", "red")], "swordsman v_black / v_green / v_red", 40)]))
    rows.append(dict(code="NV-04", name="Chém (hoạt ảnh đánh)", rec="B (4 khung mỗi hướng) hoặc giữ hiện tại", cur=cell(L, "", "cur", lambda: [L.cur(f"me-slash-down-{i}") for i in range(3)], "3 khung chém xuống", 40),
        opts=[cell(L, "A", "ninja", lambda: [L.ninja("samurai_blue", d, 4, SAM["Luyện Khí"]) for d in range(4)], "1 khung chém / hướng (4 hướng)", 40),
              cell(L, "B", "wuxia", lambda: [L.wuxia("Core_Units", "Swordsman", "Attack", "South", i) for i in range(1, 5)], "Attack_South 4 khung", 40),
              cell(L, "C", "xian", lambda: [L.xian("xf_hero_swordsman", "attack", i) for i in range(3)], "attack (nhìn ngang)", 40)]))
    return "10-nguoi-choi", "Nhóm 10 — Người chơi (NV)", rows


NPC_ROLE = {  # id -> (vai Xianxia, đơn vị Wuxia thân top-down hoặc None)
    "truong_tran": ("elder", None), "duoc_su": ("herbalist", ("Special_Units", "Herbalist")), "tho_ren": ("blacksmith", None),
    "cao_thi": (None, None), "lai_buon": ("peddler", ("Core_Units", "Farmer")), "tran_uy": ("constable", ("Core_Units", "Swordsman")),
    "tram_truong": ("general", ("Core_Units", "Swordsman")), "lai_buon_suong": ("peddler", ("Core_Units", "Farmer")), "tho_ren_suong": ("blacksmith", None),
    "tram_truong_han": ("general", ("Core_Units", "Swordsman")), "lai_buon_han": ("peddler", ("Core_Units", "Farmer")), "tho_ren_han": ("blacksmith", None),
    "thu_mon": ("taoist", None), "lao_dan": ("alchemist", ("Special_Units", "Herbalist")), "lao_phu": ("fortune", None),
}


def group_npc(L, names):
    rows = []
    for i, n in enumerate(names["npcs"], 1):
        role, body = NPC_ROLE.get(n["id"], (None, None))
        opts = [
            cell(L, "A", "xian", lambda r=role: L.xian_portrait(r), f"chân dung '{role}' (hộp thoại)", 64) if role else Cell("A", "xian", [], "", 64),
            cell(L, "B", "wuxia", lambda b=body: L.wuxia(b[0], b[1], "Walk" if b[1] == "Herbalist" else "Idle", "South"), f"thân {body[1]} (bản đồ)", 42) if body else Cell("B", "wuxia", [], "", 42),
            Cell("C", "ninja", [], "", 42),
        ]
        rec = ("A cho chân dung" + (" + B cho thân" if body else "")) if role else "giữ hiện tại (vật trang trí)"
        rows.append(dict(code=f"NPC-{i:02d}", name=f"{n['name']} — {n['title']}", rec=rec, cur=cell(L, "", "cur", lambda nid=n["id"]: L.cur(f"npc-{nid}"), "hiện tại 36x42", 42), opts=opts))
    return "11-npc", "Nhóm 11 — NPC (NPC): chân dung hộp thoại (A) và thân trên bản đồ (B) chọn ĐỘC LẬP", rows


Q_MAP = {  # id -> (Xianxia mob, (nhóm, đơn vị Wuxia, hướng) | None, Sunnyside | None)
    "tho": (None, None, None), "lang": ("xf_mob_wolf", None, None), "ho": (None, ("Special_Units", "Tiger", "SouthEast"), None),
    "suong_ho": ("xf_mob_foxdemon", None, None), "thach_quy": ("xf_mob_golem", None, None), "doc_thiem": ("xf_mob_toad", None, None),
    "han_lang": ("xf_mob_wolf", None, None), "phong_nha": ("xf_mob_bat", None, None), "cot_tuong": ("xf_mob_skeleton", None, ("Characters/Skeleton/PNG/",)),
    "doc_tuoc": ("xf_mob_thunderbird", None, ("Elements/Animals/spr_deco_bird_01_strip4.png", 4)), "ran_con": ("xf_mob_snake", None, None),
    "phan_than_yeu_vuong": ("xf_mob_ghost", None, None),
}


def group_quai(L, names):
    rows = []
    mons = [m for m in names["mons"] if not m["boss"]]
    for i, m in enumerate(mons, 1):
        xm, wu, sn = Q_MAP.get(m["id"], (None, None, None))
        a = cell(L, "A", "xian", lambda x=xm: L.xian(x, "idle"), f"{xm[3:] if xm else ''} NHÌN NGANG", 32) if xm else Cell("A", "xian", [], "", 32)
        b = cell(L, "B", "wuxia", lambda w=wu: L.wuxia(w[0], w[1], "Idle", w[2]), f"{wu[1]} top-down" if wu else "", 32) if wu else (
            cell(L, "B", "sunny", lambda s=sn: L.sunny_strip(s[0], s[1]), "Sunnyside, 16 px", 32) if sn and len(sn) == 2 else Cell("B", "sunny", [], "", 32))
        rec = "A (tô màu theo hệ nếu cần)" if xm else ("B" if wu else "KHÔNG nguồn nào có: giữ hiện tại / ảnh AI")
        rows.append(dict(code=f"Q-{i:02d}", name=m["name"], rec=rec, cur=cell(L, "", "cur", lambda mid=m["id"]: L.cur(f"mon-{mid}"), "hiện tại 32x32", 32), opts=[a, b, Cell("C", "ninja", [], "", 32)]))
    return "12-quai", "Nhóm 12 — Quái thường (Q)", rows


T_MAP = {"mang": ("xf_mob_snake", "rắn thường PHÓNG LỚN + TÔ ĐỎ (gói không có trăn)"), "hac_giao": ("xf_boss_jiaolong", "boss jiaolong (giao long)"),
         "thien_han_vuong": ("xf_boss_fallenimmortal", "boss fallenimmortal (tiên sa ngã)"), "yeu_vuong": ("xf_boss_ninetail", "boss ninetail (cửu vĩ hồ)")}


def group_trum(L, names):
    rows = []
    bosses = [m for m in names["mons"] if m["boss"]]
    for i, m in enumerate(bosses, 1):
        xm, cap = T_MAP.get(m["id"], (None, ""))
        a = cell(L, "A", "xian", lambda x=xm: L.xian(x, "idle"), cap, 64) if xm else Cell("A", "xian", [], "", 64)
        rec = "A" if m["id"] in ("hac_giao", "yeu_vuong") else "A (cần xem kỹ) / ảnh AI"
        rows.append(dict(code=f"T-{i:02d}", name=m["name"], rec=rec, cur=cell(L, "", "cur", lambda mid=m["id"]: L.cur(f"mon-{mid}"), "hiện tại (thân) + thẻ ảnh AI", 64),
                         opts=[a, Cell("B", "wuxia", [], "", 64), Cell("C", "ninja", [], "", 64)]))
    return "13-trum", "Nhóm 13 — Trùm (T): thẻ trùm bằng ảnh AI SDXL giữ nguyên, đây chỉ là THÂN trên bản đồ", rows


HU_BY_SHAPE = {  # hình chiêu -> hiệu ứng Xianxia hợp hình (anchor: left = tia bắn từ tay, center, bottom = đặt dưới chân)
    "line": "xf_sword_qi", "bolt": "xf_sword_qi", "chain": "xf_sword_rain", "cone": "xf_moon_arc", "fan": "xf_sword_rain", "nova": "xf_bgan_halo",
    "dash": "xf_flying_sword", "self": "xf_bell_ward", "aura": "xf_pill_light", "totem": "xf_array_seal", "trap": "xf_talisman",
    "ground": "xf_star_array", "zone": "xf_array_seal",
}
HU_BY_ELEMENT = {  # hệ -> hiệu ứng đặc trưng của hệ
    "kim": "xf_flying_sword", "moc": "xf_lotus", "thuy": "xf_bgan_waterfall", "hoa": "xf_phoenix", "tho": "xf_stone_spike",
    "bang": "xf_frost_shard", "phong": "xf_gale_vortex", "loi": "xf_tribulation", "am": "xf_soul_wisp", "none": "xf_taiji",
}


def group_hu(L, names):
    """Hiệu ứng chiêu: một tờ MỖI HỆ (10 tờ). A = theo HÌNH chiêu, B = theo HỆ (cùng tô màu hệ), C = vệt chém Wuxia (chỉ chiêu chém / tia)."""
    by_el = {}
    for sk in names["skills"]:
        by_el.setdefault(sk["element"], []).append(sk)
    sheets = []
    n = 0
    for el in ("kim", "moc", "thuy", "hoa", "tho", "bang", "phong", "loi", "am", "none"):
        rows = []
        for sk in by_el.get(el, []):
            n += 1
            fa, fb = HU_BY_SHAPE.get(sk["shape"], "xf_taiji"), HU_BY_ELEMENT[el]
            slash = sk["shape"] in ("cone", "line", "bolt", "dash")
            same = fa == fb
            a = cell(L, "A", "xian", lambda f=fa, e=el: L.xian_fx(f, e), f"{fa[3:]} (theo hình '{sk['shape']}')", 56)
            b = Cell("B", "xian", [], "", 56) if same else cell(L, "B", "xian", lambda f=fb, e=el: L.xian_fx(f, e), f"{fb[3:]} (theo hệ)", 56)
            c = cell(L, "C", "wuxia", lambda: L.wuxia_slash(), "vệt chém Blade_Slash (64 px)", 40) if slash else Cell("C", "wuxia", [], "", 56)
            cur = cell(L, "", "cur", lambda s=sk: L.cur(f"item-kinh_{s['id']}"), "icon kinh quyển; hiệu ứng vẽ bằng mã", 24)
            rows.append(dict(code=f"HU-{n:02d}", name=f"{sk['name']} ({ELEMENT_NAME[el]}, {sk['shape']})", rec="A (hợp hình); B nếu muốn nét riêng của hệ", cur=cur, opts=[a, b, c]))
        if rows:
            sheets.append((f"15-hieu-ung-chieu-{el}", f"Nhóm 15 — Hiệu ứng chiêu, hệ {ELEMENT_NAME[el]} (HU) — hiệu ứng Xianxia ĐƠN SẮC đã tô màu hệ", rows))
    return sheets


def group_ui(L, names):
    """Giao diện (UI): 9 mã. HIỆN TẠI = điểm ảnh THẬT cắt từ ảnh chụp trong docs/screenshots (giao diện là DOM / CSS, không có tệp ảnh); phương án dựng ở CÙNG KÍCH CỠ
    (khung 9-slice theo biên của gói, thanh phủ ~70 %), giữ cỡ thật (×1); biểu tượng điểm ảnh nhỏ của gói riêng ghi ×3."""
    N = lambda rel: L.ui("ninja", rel)
    X = lambda rel: L.ui("xian", rel)
    U = lambda rel: L.ui("sunny", rel)
    shot = L.shot
    HUD, CHAR, SET, TT = "hud-1280x720.png", "char-1280x720.png", "sheet-settings-390x844.png", "trang-thai-1280x720.png"
    sub = "HIỆN TẠI = ảnh chụp thật (docs/screenshots, 1 ảnh = 1 điểm CSS); phương án dựng ở CÙNG KÍCH CỠ, giữ cỡ thật (×1); biểu tượng điểm ảnh nhỏ ghi ×3 / ×4"

    def cur(frames, cap):
        return cell(L, "", "cur", frames, cap, None, 1)

    def opt(letter, src, getter, cap, view=1):
        return cell(L, letter, src, getter, cap, None, view)

    def empty(letter, src):
        return Cell(letter, src, [], "", None, 1)

    def xnine(name, size, scale=1):
        base = f"ui_xianxia_{name}"
        return nine(X(base + ".png"), tres_margins(f"{UI_DIR['xian']}/{base}.tres"), size, scale=scale, smooth=True)

    def sbox(t, size):
        src = Image.new("RGBA", (9, 9))
        for r, row in enumerate((("tl", "tc", "tr"), ("lc", "c", "rc"), ("bl", "bc", "br"))):
            for c, n in enumerate(row):
                src.alpha_composite(U(f"9slice_box_white/{t}_box_9slice_{n}.png"), (c * 3, r * 3))
        return nine(src, (3, 3, 3, 3), size, scale=3)

    rows = []
    # UI-01 khung bảng (góc trên trái của hộp "Đạo Thể · Trang Bị", 150x84)
    P = (150, 84)
    rows.append(dict(code="UI-01", name="Khung bảng (hộp thoại, túi, nhân vật...)", top=True, rec="giữ hiện tại (đọc tốt); A nếu muốn khung mực / ngọc kiểu tiên hiệp", sub=sub,
        cur=cur(lambda: shot(CHAR, (410, 98, 560, 182)), "hộp 'Đạo Thể' hiện tại (CSS), góc trên trái 150x84"),
        opts=[opt("A", "xian", lambda: [xnine(f"panel_01_{n}", P) for n in ("ink", "jade", "rosewood", "silk")], "panel_01 mực / ngọc / gỗ hồng / lụa (9-slice, biên của gói)"),
              opt("B", "ninja", lambda: [nine(N("theme_1/nine_path_panel.png"), (6, 6, 6, 6), P, scale=3), nine(N("theme_1/nine_path_bg.png"), (5, 5, 4, 4), P, scale=3)], "theme_1 nine_path_panel / nine_path_bg ×3"),
              opt("C", "sunny", lambda: [sbox("dt", P), sbox("lt", P)], "9slice_box dt / lt ×3")]))
    # UI-02 nút bấm
    B = (80, 36)
    rows.append(dict(code="UI-02", name="Nút bấm (thường / chạm / nhấn)", top=True, rec="giữ hiện tại; A (ngọc) nếu muốn nút kiểu tiên hiệp",
        cur=cur(lambda: [shot(HUD, (101, 139, 181, 175)), shot(CHAR, (136, 99, 212, 135))], "HUD 'Nhiệm vụ' (thường) + 'Nhân vật' (đang mở)"),
        opts=[opt("A", "xian", lambda: [xnine(f"button_01_{c}_{st}", B) for c in ("jade", "silk") for st in ("normal", "hover", "pressed")], "button_01 ngọc / lụa x thường / chạm / nhấn"),
              opt("B", "ninja", lambda: [nine(N(f"theme_1/button_{st}.png"), (5, 4 if st == "pressed" else 3, 5, 3), B, scale=3) for st in ("normal", "hover", "pressed")], "theme_1 button thường / chạm / nhấn ×3"),
              opt("C", "sunny", lambda: _slabel(U, B[0]), "label_left + middle + right ×3 (nhãn, không có trạng thái)")]))
    # UI-03 thanh
    BW = 244
    rows.append(dict(code="UI-03", name="Thanh khí huyết / linh lực / tu vi", top=True, rec="giữ hiện tại (chữ số nằm ngay trên thanh); chỉ đổi nếu chữ vẫn đọc được",
        cur=cur(lambda: shot(HUD, (21, 42, 265, 94)), "HUD hiện tại: ba thanh 244 px (đỏ / xanh / vàng) có chữ"),
        opts=[opt("A", "xian", lambda: _xbars(X, BW), "bar_01 frame + hp / mp / spirit (phủ 72 %), thu về 244 px"),
              opt("B", "ninja", lambda: _nbars(N, L, BW), "system/ui/life_bar + bg ×3 (chỉ có thanh ĐỎ; phủ 100 / 60 / 25 %)"),
              opt("C", "sunny", lambda: _sbars(U), "redbar / bluebar / greenbar mức 0 / 3 / cuối ×3", 1)]))
    # UI-04 ô vật phẩm
    S54 = (54, 54)
    rows.append(dict(code="UI-04", name="Ô vật phẩm (túi, thanh dùng nhanh)", top=True, rec="giữ hiện tại; C nếu muốn ô tròn kiểu hộp đạo cụ",
        cur=cur(lambda: shot(HUD, (982, 652, 1098, 706)), "HUD: ô 'Hồi Huyết' (sáng) + 'Hồi Linh' (mờ), 54x54"),
        opts=[opt("A", "xian", lambda: [xnine(f"panel_01_{n}", S54, scale=0.5) for n in ("ink", "jade")], "panel_01 mực / ngọc thu 50 % làm ô 54x54"),
              opt("B", "ninja", lambda: [nine(N(f"theme_1/nine_path_{n}.png"), m, S54, scale=2) for n, m in (("panel", (6, 6, 6, 6)), ("bg", (5, 5, 4, 4)), ("bg_2", (5, 5, 4, 4)))], "theme_1 panel / bg / bg_2 ×2"),
              opt("C", "sunny", lambda: [U("itemdisc_01.png"), U("itemdisc_02.png")], "itemdisc_01 / 02 (đĩa tròn) ×3", 3)]))
    # UI-05 con trỏ chuột
    rows.append(dict(code="UI-05", name="Con trỏ chuột (máy tính)", top=True, rec="A (kiếm) cho điểm nhấn; chỉ máy tính, không ảnh hưởng điện thoại",
        cur=Cell("", "cur", [], "con trỏ hệ thống của trình duyệt (không vẽ riêng)", None, 1, note="con trỏ hệ thống\n(không vẽ riêng)"),
        opts=[opt("A", "xian", lambda: [_fit_h(X("ui_xianxia_01_cursor_sword.png"), 32), _fit_h(X("ui_xianxia_01_cursor_whisk.png"), 32)], "cursor_sword / cursor_whisk (phất trần), thu về 32 px"),
              empty("B", "ninja"),
              opt("C", "sunny", lambda: [U(f"cursor_0{i}.png") for i in range(1, 6)] + [U("hand_open_01.png"), U("hand_closed_01.png")], "cursor_01..05 + tay mở / nắm ×3", 3)]))
    # UI-06 đường kẻ / góc trang trí
    rows.append(dict(code="UI-06", name="Đường kẻ phân cách + góc trang trí khung", top=True, rec="A (mây / ngọc) nếu duyệt khung bảng A ở UI-01; không thì giữ hiện tại",
        cur=cur(lambda: shot(CHAR, (425, 140, 640, 172)), "đường kẻ dưới tiêu đề hộp 'Đạo Thể' (CSS, 1 px)"),
        opts=[opt("A", "xian", lambda: [X("ui_xianxia_01_divider_cloud.png"), X("ui_xianxia_01_divider_jade.png"), _fit_h(X("ui_xianxia_01_corner_tl.png"), 40)], "divider_cloud / divider_jade / corner_tl (thu về 40 px)"),
              empty("B", "ninja"), empty("C", "sunny")]))
    # UI-07 ô tích chọn + thanh trượt
    rows.append(dict(code="UI-07", name="Ô tích chọn + thanh trượt (Cài đặt)", top=True, rec="giữ hiện tại (ô kiểm HTML gốc: bàn phím và trình đọc màn hình dùng được)",
        cur=cur(lambda: [shot(SET, (25, 120, 312, 142)), shot(SET, (338, 270, 368, 300))], "Cài đặt: thanh trượt vàng + ô kiểm trắng"),
        opts=[opt("A", "xian", lambda: _xslider(X), "slider_track + knob (70 %) + check_off / check_on, thu về cỡ hiện tại"),
              opt("B", "ninja", lambda: [N("theme_1/unchecked.png"), N("theme_1/checked.png"), N("theme_1/h_slidder_grabber.png"), N("theme_1/slider_progress.png")], "theme_1 unchecked / checked / grabber / slider_progress ×2", 2),
              opt("C", "sunny", lambda: [U("confirm.png"), U("cancel.png")], "confirm (✓) / cancel (✗) ×3 (dấu, không phải ô kiểm)", 3)]))
    # UI-08 nút hành động tròn
    rows.append(dict(code="UI-08", name="Nút hành động tròn (Chém, Đột phá, Đả tọa, Kiếm khí)", top=True, rec="giữ hiện tại (chữ Hán + nhãn Việt đã rõ trên mọi cỡ màn hình)",
        cur=cur(lambda: shot(HUD, (1110, 550, 1266, 706)), "HUD: bốn nút tròn 156x156"),
        opts=[empty("A", "xian"),
              opt("B", "ninja", lambda: [N(f"nine_path_{n}.png") for n in (8, 9, 4)], "theme/nine_path_8 / 9 / 4 (tròn) ×4", 4),
              opt("C", "sunny", lambda: [U("itemdisc_01.png"), U("itemdisc_02.png")], "itemdisc_01 / 02 ×4", 4)]))
    # UI-09 huy hiệu trạng thái
    rows.append(dict(code="UI-09", name="Huy hiệu trạng thái (Bỏng, Choáng, Tăng tốc...)", top=True, rec="A (biểu tượng) đứng cạnh số giây; giữ chữ cho trình đọc màn hình",
        cur=cur(lambda: shot(TT, (38, 230, 490, 272)), "HUD: ô 'tên + số giây' (đỏ có hại, xanh có lợi)"),
        opts=[opt("A", "xian", lambda: [X(f"ui_xianxia_status_{n}.png") for n in ("bleed", "burn", "freeze", "golden_shield", "paralyze", "poison", "seal", "swift")], "status_ bleed / burn / freeze / golden_shield / paralyze / poison / seal / swift (32 px)"),
              empty("B", "ninja"), empty("C", "sunny")]))
    return [("16-giao-dien", "Nhóm 16 — Giao diện (UI): khung, nút, thanh, ô, con trỏ, đường kẻ, ô kiểm, nút tròn, huy hiệu", rows)]


def _fit_h(im, h):
    im = trim(im)
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)


def _slabel(U, w):
    """Nhãn Sunnyside: trái + giữa (kéo giãn) + phải, phóng ×3, rộng xấp xỉ `w`."""
    l, m, r = U("label_left.png"), U("label_middle.png"), U("label_right.png")
    n = max(l.width + r.width + 1, w // 3)
    im = Image.new("RGBA", (n, l.height))
    im.alpha_composite(l, (0, 0))
    im.alpha_composite(m.resize((n - l.width - r.width, m.height), Image.NEAREST), (l.width, 0))
    im.alpha_composite(r, (n - r.width, 0))
    return im.resize((im.width * 3, im.height * 3), Image.NEAREST)


def _xbars(X, w):
    frame = X("ui_xianxia_bar_01_frame.png")
    out = []
    for n in ("hp", "mp", "spirit"):
        prog = X(f"ui_xianxia_bar_01_{n}.png")
        comp = frame.copy()
        comp.alpha_composite(prog.crop((0, 0, int(prog.width * 0.72), prog.height)))
        out.append(comp.resize((w, round(w * frame.height / frame.width)), Image.LANCZOS))
    return stack(out)


def _nbars(N, L, w):
    bg = load(f"{NINJA}/system/ui/life_bar/life_bar_bg.png")
    bar = load(f"{NINJA}/system/ui/life_bar/life_bar.png")
    out = []
    for frac in (1.0, 0.6, 0.25):
        b = nine(bg, (2, 1, 2, 1), (w, 12), scale=3)
        b.alpha_composite(nine(bar, (2, 1, 2, 1), (max(12, int(w * frac)), 12), scale=3))
        out.append(b)
    return stack(out)


def _sbars(U):
    rows = []
    for col, lv in (("red", ("00", "03", "06")), ("blue", ("00", "03", "05")), ("green", ("00", "03", "06"))):
        rows.append(side([U(f"{col}bar_{l}.png").resize((45, 21), Image.NEAREST) for l in lv]))
    return stack(rows)


def _xslider(X):
    track = X("ui_xianxia_01_slider_track.png").resize((287, 9), Image.LANCZOS)
    knob = _fit_h(X("ui_xianxia_01_slider_knob.png"), 22)
    sl = Image.new("RGBA", (287, 24))
    sl.alpha_composite(track, (0, 8))
    sl.alpha_composite(knob, (int(287 * 0.7) - knob.width // 2, 1))
    return [sl, _fit_h(X("ui_xianxia_01_check_off.png"), 30), _fit_h(X("ui_xianxia_01_check_on.png"), 30)]


# Vật phẩm (nhóm 14, 126 món): mã VP-001..126 LIÊN TỤC theo thứ tự đan / phù, kinh quyển, trang bị, nguyên liệu; chia thành các tờ <= VP_SHEET_ROWS hàng (một tờ 126 hàng cao ~24k px khó duyệt).
# Phương án A / B CHỈ nguồn công khai (atlas + Xianxia CC0 + Ninja CC0); phương án C = icon HOANTDZ (gói RIÊNG, che trên tờ công khai). Chỉ đề xuất hình HỢP NGHĨA (kiếm -> kiếm, phù -> bùa, đan -> bình đan, sách -> ngọc giản);
# loại gói không có (áo, giày, nguyên liệu quái) để TRỐNG, khuyến nghị giữ hiện tại, thay vì nhét hũ / hòm cho đủ ô.
VP_SHEET_ROWS = 30
VP_GROUPS = [("dan-phu", "đan dược / phù"), ("kinh-quyen", "kinh quyển"), ("trang-bi", "trang bị"), ("nguyen-lieu", "nguyên liệu")]
VP_EQUIP_KIND = [  # hậu tố tên -> (loại, mô tả); thứ tự quan trọng: "Ngoa" / "Bội" / "Phù" / "Kiếm" / "Bào" / còn lại = pháp bảo
    ("Kiếm", "kiếm"), ("Bào", "áo"), ("Ngoa", "giày"), ("Bội", "ngọc bội"), ("Phù", "hộ phù"),
]


def vp_group_of(it):
    if it["type"] == "book":
        return "kinh-quyen"
    if it["type"] == "equip":
        return "trang-bi"
    if it["type"] == "material":
        return "nguyen-lieu"
    return "dan-phu"  # consumable: đan + phù


def vp_equip_kind(name):
    last = name.split()[-1]
    for suf, kind in VP_EQUIP_KIND:
        if last == suf:
            return kind
    return "pháp bảo"  # Ấn / Châu / Chung...


def vp_row(L, code, it, nth=0):
    t, rar = it["type"], it.get("rarityName") or "Phàm phẩm"
    ri = it["rarity"]
    cur = cell(L, "", "cur", lambda iid=it["id"]: L.cur("item-" + iid), f"hiện tại ({rar})", 32)
    none = lambda letter, src: Cell(letter, src, [], "", 32)

    def hic(**kw):
        """Tuỳ chọn C = icon HOANTDZ (RIÊNG, che trên tờ công khai); bậc theo phẩm: phẩm 0..4 -> T1..T5. Không có icon hợp thì ô TRỐNG."""
        try:
            r = L.hicon_pick(tier=ri + 1, nth=nth, **kw)
        except KeyError:
            return Cell("C", "hicon", [], "", 32)
        return Cell("C", "hicon", [L.hicon_image(r)], f'{r["name_en"]} [{r["asset_id"]}]', 32)

    c = Cell("C", "hicon", [], "", 32)
    if t == "equip":
        kind = vp_equip_kind(it["name"])
        if kind == "kiếm":
            a = cell(L, "A", "xian", lambda: L.xian_icon("blade_01", ri), f"Xianxia kiếm / đao, phẩm {ri} (CC0)", 32)
            b = cell(L, "B", "ninja", lambda: L.ninja_weapon("big_sword"), "Ninja: đại kiếm (CC0)", 32)
            c = hic(pack="02_Weapons_Companions", slot="weapon")
            rec = "A (6 phẩm tăng dần) hoặc C (5 bậc, 8 họ)"
        elif kind == "hộ phù":
            a = cell(L, "A", "xian", lambda: L.xian_item("talisman"), "Xianxia: bùa (CC0)", 32)
            b = cell(L, "B", "xian", lambda: L.xian_icon("relic_02", ri), f"Xianxia: pháp khí loại 2, phẩm {ri} (CC0)", 32)
            c = hic(pack="03_Accessories", slot="amulet")
            rec = "A (bùa) hoặc C (bùa hộ thân 5 bậc)"
        elif kind == "ngọc bội":
            a = cell(L, "A", "xian", lambda: L.xian_item("token"), "Xianxia: lệnh bài (CC0)", 32)
            b = cell(L, "B", "xian", lambda: L.xian_icon("relic_02", 3), "Xianxia: chuỗi hạt (CC0)", 32)
            c = hic(pack="03_Accessories", slot="pendant")
            rec = "giữ hiện tại; C (mặt dây 5 bậc) nếu muốn đổi"
        elif kind == "pháp bảo":
            a = cell(L, "A", "xian", lambda: L.xian_icon("relic_02", ri), f"Xianxia: pháp khí loại 2, phẩm {ri} (CC0)", 32)
            b = cell(L, "B", "xian", lambda: L.xian_icon("relic_01", ri), f"Xianxia: pháp khí loại 1, phẩm {ri} (CC0)", 32)
            c = hic(pack="03_Accessories", slot="ring")
            rec = "A (6 phẩm tăng dần) hoặc C (nhẫn 5 bậc)"
        else:  # áo, giày: gói công khai không có; C (HOANTDZ) có đủ 5 bậc
            a, b = none("A", "xian"), none("B", "ninja")
            c = hic(pack="01_Armor_Equipment", slot="chest" if kind == "áo" else "boots")
            rec = f"C ({kind} 5 bậc, 8 họ; gói công khai KHÔNG có {kind}) hoặc giữ hiện tại"
    elif t == "book":
        a = cell(L, "A", "xian", lambda: L.xian_item("jade_slip"), "Xianxia: ngọc giản (CC0)", 32)
        b = cell(L, "B", "ninja", lambda: L.ninja_weapon("book"), "Ninja: sách phép (CC0)", 32)
        c = hic(category="Martial Arts Manuals")
        rec = "giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho mọi quyển nên chỉ hợp làm bìa chung; C có 100 bìa khác nhau"
    elif t == "consumable" and it["id"].startswith("phu_"):
        a = cell(L, "A", "xian", lambda: L.xian_item("talisman"), "Xianxia: bùa (CC0)", 32)
        b = cell(L, "B", "xian", lambda: L.xian_item("token"), "Xianxia: lệnh bài (CC0)", 32)
        c = hic(category="Talismans")
        rec = "A (bùa) hoặc C (bùa 5 bậc)"
    elif t == "consumable":
        a = cell(L, "A", "xian", lambda: L.xian_item("pill_bottle"), "Xianxia: bình đan (CC0)", 32)
        b = cell(L, "B", "xian", lambda: L.xian_item("gourd"), "Xianxia: hồ lô (CC0)", 32)
        c = hic(category="Alchemy & Poisons")
        rec = "A (bình đan) hoặc C (viên đan 5 bậc)"
    else:  # nguyên liệu từ quái: chỉ nanh / xương / ngọc có hình hợp
        a, b = none("A", "xian"), none("B", "ninja")
        keyword = {"nanh_soi": ("Hunting", "Fang"), "tuong_cot": ("Hunting", "Bone"), "thien_han_chau": ("Mining", "")}.get(it["id"])
        c = hic(category=keyword[0], name_has=keyword[1] or None) if keyword else Cell("C", "hicon", [], "", 32)
        rec = "C (hình hợp nghĩa)" if keyword else "KHÔNG nguồn nào có: giữ hiện tại"
    return dict(code=code, name=it["name"], rec=rec, cur=cur, opts=[a, b, c])


def group_vp(L, names):
    """Vật phẩm: các tờ `14-vat-pham-<nhóm>[-<n>]` (<= `VP_SHEET_ROWS` hàng mỗi tờ), mã VP-001..126 liên tục theo thứ tự nhóm."""
    items = names["items"]
    by = {g: [it for it in items if vp_group_of(it) == g] for g, _ in VP_GROUPS}
    by["trang-bi"].sort(key=lambda it: (it["rarity"], it["name"]))  # phẩm thấp -> cao
    sheets, n = [], 0
    seen = {}  # (loại, phẩm) -> số vật phẩm đã gặp: `nth` xoay vòng giữa các họ icon của gói C (tất định, mỗi món một họ khác)
    for g, label in VP_GROUPS:
        rows = []
        for it in by[g]:
            n += 1
            key = (it["type"], vp_equip_kind(it["name"]) if it["type"] == "equip" else it["id"].startswith("phu_"), it["rarity"])
            nth = seen.get(key, 0)
            seen[key] = nth + 1
            rows.append(vp_row(L, f"VP-{n:03d}", it, nth))
        parts_n = max(1, -(-len(rows) // VP_SHEET_ROWS))  # số tờ = trần chia; chia ĐỀU để không có tờ chỉ vài hàng
        size = -(-len(rows) // parts_n)
        chunks = [rows[i : i + size] for i in range(0, len(rows), size)]
        for k, ch in enumerate(chunks, 1):
            suffix = f"-{k}" if len(chunks) > 1 else ""
            part = f" (tờ {k}/{len(chunks)})" if len(chunks) > 1 else ""
            sheets.append((f"14-vat-pham-{g}{suffix}", f"Nhóm 14 — Vật phẩm (VP), {label}{part}: {ch[0]['code']} .. {ch[-1]['code']}", ch))
    return sheets


# Nền / màn tải / Hoàng Tuyền (nhóm 17, mục 69 bổ sung 23/11): hình HIỆN TẠI là ảnh trong repo (SDXL của nhóm) hoặc ảnh chụp màn hình; phương án A / B / C đều lấy từ gói RIÊNG
# "HOANTDZ Wuxia & Xianxia Battlebacks 100" (cảnh pixel art 640x360, ảnh do AI tạo theo công bố của tác giả; cấm phân phối lại -> che trên tờ công khai). Mọi hình đưa về CAO 180 điểm ảnh.
NEN_H = 180
NEN_ROWS = [  # (tên, hiện tại: ("ai", tệp) | ("shot", tệp) | None, A, B, C, khuyến nghị)
    ("Màn đăng nhập (đỉnh núi sương sớm, tháp gỗ nhìn ra biển mây)", ("ai", "login_bg.webp"), "BB04-01", "BB03-01", "BB03-05", "giữ hiện tại (ảnh SDXL của nhóm, đúng tả); A / B / C nếu muốn nền pixel art"),
    ("Thẻ bản đồ Lạc Hà Trấn (thị trấn nhà gỗ bên sông, hoa đào)", ("ai", "the_lac_ha.webp"), "BB01-03", "BB01-06", "BB02-05", "giữ hiện tại; A (cầu đá bên kênh lúc hoàng hôn) gần ý nhất"),
    ("Thẻ bản đồ Hắc Phong Cốc (hẻm núi xám, tháp canh đổ nát)", ("ai", "the_hac_phong.webp"), "BB06-08", "BB02-10", "BB06-04", "giữ hiện tại; A (tàn tích pháo đài tối) gần ý nhất"),
    ("Thẻ bản đồ Linh Hư Bí Cảnh (hang ngọc lam, nấm phát sáng)", ("ai", "the_linh_hu.webp"), "BB04-06", "BB08-09", "BB08-03", "A hoặc B (hang tinh thể) gần ý nhất; giữ hiện tại cũng ổn"),
    ("Thẻ bản đồ Âm Sương Trạch (đầm lầy sương rêu, cây chết)", ("ai", "the_am_suong.webp"), "BB02-07", "BB08-07", "BB06-06", "giữ hiện tại; B (đầm sương) gần ý nhất"),
    ("Thẻ bản đồ Hàn Vân Lĩnh (băng nguyên, hồ đóng băng)", ("ai", "the_han_van.webp"), "BB09-06", "BB09-07", "BB09-08", "A / B / C đều hợp; giữ hiện tại cũng ổn"),
    ("Thẻ trùm Xích Mãng (trăn đỏ trên đá rêu dưới hoa đào)", ("trum", "the_xich_mang.webp"), "BB08-06", "BB02-03", "BB10-01", "giữ hiện tại (có trăn); nền gói chỉ là cảnh, KHÔNG có trùm"),
    ("Thẻ trùm Hắc Giao (giao long đen ở bãi đầm sương)", ("trum", "the_hac_giao.webp"), "BB10-06", "BB08-02", "BB10-03", "giữ hiện tại (có giao long); nền gói chỉ là cảnh"),
    ("Thẻ trùm Thiên Hàn Vương (khối băng khổng lồ trên hồ băng)", ("trum", "the_thien_han_vuong.webp"), "BB09-10", "BB09-08", "BB09-06", "giữ hiện tại; nền gói chỉ là cảnh"),
    ("Thẻ trùm Linh Hư Yêu Vương (hươu lam ngọc trong hang ngọc)", ("trum", "the_yeu_vuong.webp"), "BB08-04", "BB08-10", "BB04-06", "giữ hiện tại; nền gói chỉ là cảnh"),
    ("Nền HOÀNG TUYỀN (màn gục / luân hồi: cầu Nại Hà, Quỷ Môn, điện Diêm La)", ("shot", "limbo-1280x720.png"), "BB07-04", "BB07-05", "BB07-06", "A (cầu Nại Hà), B (Quỷ Môn), C (điện Diêm La): hợp đúng chủ đề, hiện tại là màn tối đơn giản"),
    ("Nền đấu trường chặn đường (mục 52)", ("shot", "chan-duong-dau-truong-desktop-hd.png"), "BB10-07", "BB10-01", "BB10-10", "A / B / C đều hợp; cần chọn một phong cách chung"),
    ("Nền trùm thế giới (chưa có nền riêng)", None, "BB10-04", "BB10-08", "BB10-09", "chưa có hình hiện tại; A (đỉnh sét thiên kiếp) hợp trùm thế giới"),
]


def to_height(im, h=NEN_H):
    im = trim(im) if im.mode == "RGBA" and im.getbbox() else im
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)


def group_nen(L, names):
    rows = []
    for i, (name, cur_src, a, b, c, rec) in enumerate(NEN_ROWS, 1):
        if cur_src is None:
            cur = Cell("", "cur", [], "chưa có nền riêng", None, 1, note="chưa có nền riêng")
        else:
            kind, f = cur_src
            path = {
                "ai": os.path.join(ROOT, "client/public/assets/ai", f),
                "trum": os.path.join(ROOT, "client/public/packs/art-trum", f),
                "shot": os.path.join(SHOT, f),
            }[kind]
            cur = cell(L, "", "cur", lambda p=path: to_height(load(p)), f"hiện tại: {os.path.basename(path)}", None, 1)

        def opt(letter, bid):
            def getter():
                im, nm = L.battleback(bid)
                return to_height(im)

            def capof():
                try:
                    return f"{bid}: {L.battleback(bid)[1]} (ảnh AI)"
                except KeyError:
                    return bid

            return cell(L, letter, "bb", getter, capof(), None, 1)

        rows.append(dict(code=f"NEN-{i:02d}", name=name, rec=rec, top=True, cur=cur, opts=[opt("A", a), opt("B", b), opt("C", c)],
                         sub="HIỆN TẠI = ảnh trong repo / ảnh chụp màn hình; A / B / C = cảnh của gói riêng HOANTDZ Battlebacks (AI tạo, che trên tờ công khai), đều cao 180 điểm ảnh" if i == 1 else None))
    return [("17-nen", "Nhóm 17 — Nền / màn tải / Hoàng Tuyền (NEN): HIỆN TẠI và ba cảnh pixel art của gói riêng", rows)]


def md_for(code_group, title, rows):
    out = [f"## {title}", "", f"Tờ ảnh: `{code_group}.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/{code_group}-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).", "",
           "| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |", "|---|---|---|---|---|---|---|"]

    def desc(c):
        if not c.frames:
            return "—"
        n, lic, priv, view = SRC[c.src]
        return f"{n} ({'**gói riêng**, ' if priv else ''}{lic}); {'' if c.game_h is None else view + '; '}{c.cap}".replace("|", "/")  # giao diện (game_h None) không có "góc nhìn"

    for r in rows:
        out.append(f"| {r['code']} | {r['name']} | {r['cur'].cap or '—'} | " + " | ".join(desc(c) for c in r["opts"]) + f" | {r.get('rec', '')} |")
    return "\n".join(out) + "\n"


PENDING = {"14": "vật phẩm (VP, 126 món)", "15": "hiệu ứng chiêu (HU, 57 chiêu)", "16": "giao diện (UI)", "17": "nền / màn tải / Hoàng Tuyền (NEN)"}


def upsert_md(path, built):
    """Ghi mỗi nhóm vào khối `<!-- NHOM nn -->...<!-- /NHOM nn -->` (thay khối cũ nếu có, chạy lại không nhân đôi); phần ĐANG LÀM tự cập nhật theo nhóm đã có."""
    import re

    text = open(path, encoding="utf8").read()
    # bỏ phần ĐANG LÀM cũ (dựng lại ở cuối)
    text = re.sub(r"\n## Nhóm 14, 15, 16 — ĐANG LÀM.*\Z", "\n", text, flags=re.S)
    text = re.sub(r"\n## Nhóm còn đang làm.*\Z", "\n", text, flags=re.S)
    # khối cũ KHÔNG có đánh dấu (bản đầu): bỏ từ tiêu đề nhóm đầu tiên
    if "<!-- NHOM " not in text and re.search(r"(?m)^## Nhóm 1\d ", text):
        text = text[: re.search(r"(?m)^## Nhóm 1\d ", text).start()]
    for g, body in built.items():
        blk = f"<!-- NHOM {g} -->\n{body}\n<!-- /NHOM {g} -->\n"
        pat = re.compile(rf"<!-- NHOM {g} -->.*?<!-- /NHOM {g} -->\n", re.S)
        if pat.search(text):
            text = pat.sub(lambda _m: blk, text)
        else:
            text = text.rstrip("\n") + "\n\n" + blk
    # sắp lại các khối theo số nhóm
    blocks = re.findall(r"<!-- NHOM (\d+) -->.*?<!-- /NHOM \1 -->\n", text, flags=re.S)
    parts = {g: re.search(rf"<!-- NHOM {g} -->.*?<!-- /NHOM {g} -->\n", text, re.S).group(0) for g in blocks}
    head = text[: text.index("<!-- NHOM ")].rstrip("\n")
    out = head + "\n\n" + "\n".join(parts[g] for g in sorted(parts, key=int))
    missing = [g for g in PENDING if g not in parts]
    if missing:
        out += "\n## Nhóm còn đang làm\n\n" + "\n".join(f"- Nhóm {g}: {PENDING[g]}" for g in missing) + "\n"
    open(path, "w", encoding="utf8").write(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--groups", default="10,11,12,13")
    ap.add_argument("--public", default=os.path.join(ROOT, "docs/art/huong-moi"))
    ap.add_argument("--private", default="/mnt/data/assets-private/preview")
    ap.add_argument("--names", default=None, help="JSON {npcs:[{id,name,title}], mons:[{id,name,boss}]}; bỏ trống = tự chạy `npx tsx client/scripts/art/xuat-doi-tuong.ts`")
    ap.add_argument("--md", default=None, help="ghi các bảng markdown của các nhóm đã dựng vào tệp này (nối vào cuối)")
    a = ap.parse_args()
    import json

    if a.names:
        names = json.load(open(a.names, encoding="utf8"))
    else:
        import subprocess

        r = subprocess.run(["npx", "tsx", os.path.join(HERE, "xuat-doi-tuong.ts")], cwd=ROOT, capture_output=True, text=True, check=True)
        names = json.loads(r.stdout)
    L = Loaders()
    one = lambda t: [t]
    builders = {
        "10": lambda: one(group_nv(L)), "11": lambda: one(group_npc(L, names)), "12": lambda: one(group_quai(L, names)),
        "13": lambda: one(group_trum(L, names)), "14": lambda: group_vp(L, names), "15": lambda: group_hu(L, names), "16": lambda: group_ui(L, names), "17": lambda: group_nen(L, names),
    }
    built = {}
    for g in a.groups.split(","):
        sheets = builders[g]()
        for code_group, title, rows in sheets:
            render_sheet(title, rows, os.path.join(a.public, f"{code_group}.png"), public=True)
            render_sheet(title, rows, os.path.join(a.private, f"{code_group}-day-du.png"), public=False)
            priv_cells = sum(1 for r in rows for c in r["opts"] if c.frames and SRC[c.src][2])
            print(f"ĐÃ DỰNG {code_group} {len(rows)} mã (ô gói riêng: {priv_cells})")
        built[g] = "\n".join(md_for(cg, t, r) for cg, t, r in sheets)
    if a.md:
        upsert_md(a.md, built)


if __name__ == "__main__":
    sys.exit(main())
