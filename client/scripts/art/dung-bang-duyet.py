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
}


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
    k = game_h / im.height
    if k >= 1:
        n = max(1, round(k))
        im = im.resize((im.width * n, im.height * n), Image.NEAREST)
        k = n
    else:
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    return im.resize((im.width * view, im.height * view), Image.NEAREST), k


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


# ---------------------------------------------------------------- tờ ảnh
class Cell:
    def __init__(self, letter, src, frames, cap, game_h):
        self.letter, self.src, self.cap = letter, src, cap
        self.frames, self.game_h = frames, game_h  # frames: list[Image] (hoặc [] = không có)


def cell_image(c, public):
    """Ảnh của một ô (dải khung nằm ngang) hoặc khung trống nếu không có / là gói riêng trên tờ công khai."""
    private = SRC[c.src][2]
    if not c.frames or (public and private):
        w, h = 200, 110
        im = Image.new("RGBA", (w, h), PANEL)
        d = ImageDraw.Draw(im)
        if c.frames:
            msg = "gói riêng: xem tờ riêng\n(không đưa lên GitHub)"
        elif c.src == "cur":
            msg = "chưa có hình riêng trong atlas\n(dùng hình dự phòng)"
        else:
            msg = "KHÔNG CÓ trong các gói"
        d.multiline_text((w // 2, h // 2), msg, font=font(12), fill=DIM, anchor="mm", align="center")
        return im, 0
    parts, k = [], 1
    for f in c.frames:
        p, k = fit(f, c.game_h)
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
    colw = [max(200, min(520, max(imgs[i][0].width for imgs in rendered) + 12)) for i in range(ncols)]
    xs = [LAB_W + PAD + sum(colw[:i]) + 8 * i for i in range(ncols)]
    W = xs[-1] + colw[-1] + PAD
    heights = []
    for r, imgs in zip(rows, rendered):
        img_h = max(im.height for im, _ in imgs)
        cap_lines = max(len(textwrap.wrap(c.cap + "  x9.99", width=max(18, int(colw[i] / 6.2)))) for i, c in enumerate([r["cur"]] + r["opts"]))
        heights.append(max(img_h + 34 + 14 * cap_lines + 12, 96))
    H = 70 + sum(heights) + PAD
    sheet = Image.new("RGBA", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    d.text((PAD, 14), title, font=f_tit, fill=GOLD)
    d.text((PAD, 40), "mỗi hình ĐÃ thu / phóng về cỡ trong game rồi ×%d; 'x' nhỏ = hệ số thu phóng" % VIEW, font=f_cap, fill=DIM)
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
            sheet.alpha_composite(im, (x, y + 34 + (img_h - im.height)))
            cap = c.cap + (f"  x{k:.2g}" if k else "")
            cy = y + 34 + img_h + 4
            for line in textwrap.wrap(cap, width=max(18, int(colw[i] / 6.2))):
                d.text((x, cy), line, font=f_cap, fill=DIM)
                cy += 14
        y += h
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.convert("RGB").save(path, optimize=True)


# ---------------------------------------------------------------- dữ liệu các nhóm
def cell(L, letter, src, getter, cap, game_h):
    """Ô phương án: `getter` trả Image hoặc list[Image]; trả về ô trống nếu lỗi tìm tệp (ghi rõ trong tờ)."""
    try:
        v = getter()
    except (FileNotFoundError, KeyError, IndexError):
        v = []
    return Cell(letter, src, v if isinstance(v, list) else [v], cap, game_h)


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


def md_for(code_group, title, rows):
    out = [f"## {title}", "", f"Tờ ảnh: `{code_group}.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/{code_group}-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).", "",
           "| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |", "|---|---|---|---|---|---|---|"]

    def desc(c):
        if not c.frames:
            return "—"
        n, lic, priv, view = SRC[c.src]
        return f"{n} ({'**gói riêng**, ' if priv else ''}{lic}); {view}; {c.cap}".replace("|", "/")

    for r in rows:
        out.append(f"| {r['code']} | {r['name']} | {r['cur'].cap or '—'} | " + " | ".join(desc(c) for c in r["opts"]) + f" | {r.get('rec', '')} |")
    return "\n".join(out) + "\n"


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
    builders = {"10": lambda: group_nv(L), "11": lambda: group_npc(L, names), "12": lambda: group_quai(L, names), "13": lambda: group_trum(L, names)}
    md = []
    for g in a.groups.split(","):
        code_group, title, rows = builders[g]()
        render_sheet(title, rows, os.path.join(a.public, f"{code_group}.png"), public=True)
        render_sheet(title, rows, os.path.join(a.private, f"{code_group}-day-du.png"), public=False)
        md.append(md_for(code_group, title, rows))
        print("ĐÃ DỰNG", code_group, len(rows), "mã")
    if a.md:
        with open(a.md, "a", encoding="utf8") as f:
            f.write("\n".join(md))


if __name__ == "__main__":
    sys.exit(main())
