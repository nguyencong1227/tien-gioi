"""Mã ỔN ĐỊNH cho bảng duyệt đồ hoạ (nhóm 13 T, nhóm 14 VP, nhóm 15 HU): bảng id -> số trong `docs/art/huong-moi/ma-co-dinh.json`.

Vì sao: mã VP / HU từng gán TUẦN TỰ theo thứ tự lặp (VP: đan / phù, kinh quyển, trang bị, nguyên liệu; HU: theo hệ), nên mỗi lần có vật phẩm / chiêu mới chèn GIỮA
thì mọi mã phía sau nhích (24/11: VP 128 -> 147 làm 72 / 128 mã đổi nghĩa, HU 59 -> 78 làm 38 / 59 mã đổi nghĩa) trong khi người dùng đã nhận tờ ngày 23/11
13:00 +0700 (commit dd32ff1b: VP-001..128, HU-01..59) và duyệt THEO MÃ. Nhóm 13 (trùm) cũng vậy (#1446): `T-nn` gán theo thứ tự trùm trong `MONSTERS` nên
Thanh Xà chèn sau Xích Mãng (#1445) làm T-02..T-04 nhích, trong khi người dùng đã nhận tờ 23/11 với T-01..T-04. Nay:
  - mã đã đóng băng giữ NGUYÊN (bảng là nguồn duy nhất; generator chỉ ĐỌC bảng);
  - id chưa có trong bảng nhận số MỚI ở CUỐI (max + 1, theo thứ tự lặp), KHÔNG bao giờ chèn giữa, KHÔNG dùng lại số của mã đã mồ côi (vật phẩm xoá / đổi id);
  - số > `dong_bang.vp_toi_da` / `hu_toi_da` / `t_toi_da` là mã MỚI (sau 23/11): tờ đánh dấu và để ở tờ `-moi` riêng.
Mô-đun THUẦN (không cần Pillow), nên test chạy được ở mọi máy kể cả CI; `dung-bang-duyet.py` nạp bằng importlib (chế độ `python3 -I` không thêm thư mục script vào sys.path).
"""
import json
import os

KINDS = ("vp", "hu", "t")
FORMAT = {"vp": "VP-{:03d}", "hu": "HU-{:02d}", "t": "T-{:02d}"}


def load(path):
    """Đọc + kiểm bảng; ném ValueError nếu hỏng (trùng số, id trùng, số < 1, thiếu khoá)."""
    with open(path, encoding="utf8") as f:
        t = json.load(f)
    for k in ("dong_bang", "vp", "hu"):
        if k not in t:
            raise ValueError(f"ma-co-dinh.json thiếu khoá {k!r}")
    t.setdefault("mo_coi", {})
    t.setdefault("t", {})  # bảng cũ (trước #1446) chưa có nhóm trùm: coi là rỗng, không báo hỏng
    for kind in KINDS:
        seen = {}
        for iid, n in t[kind].items():
            if not isinstance(n, int) or isinstance(n, bool) or n < 1:
                raise ValueError(f"{kind}: số của {iid!r} không hợp lệ: {n!r}")
            if n in seen:
                raise ValueError(f"{kind}: số {n} trùng giữa {seen[n]!r} và {iid!r}")
            seen[n] = iid
    return t


def assign_codes(table_kind, ids_in_order):
    """Trả `{id: số}` cho MỌI id trong `ids_in_order`: id đã có giữ số cũ; id mới nhận max+1, max+2... theo thứ tự xuất hiện.

    `max` tính trên TOÀN bảng (kể cả id đã mồ côi, không còn trong `ids_in_order`) nên số đã dùng không bao giờ được cấp lại.
    """
    out = {}
    nxt = max(table_kind.values(), default=0)
    for iid in ids_in_order:
        if iid in out:
            raise ValueError(f"id lặp trong danh sách: {iid!r}")
        if iid in table_kind:
            out[iid] = table_kind[iid]
        else:
            nxt += 1
            out[iid] = nxt
    return out


def label(kind, n):
    return FORMAT[kind].format(n)


def is_new(table, kind, n):
    """Mã MỚI = số vượt mốc đã đóng băng (sau 23/11)."""
    return n > table["dong_bang"][kind + "_toi_da"]


def extended(table, kind, codes):
    """Bảng mới = bảng cũ + mọi id vừa được cấp số (id mồ côi giữ nguyên). Không đổi bảng gốc."""
    t = json.loads(json.dumps(table))
    t[kind].update(codes)
    return t


def save(path, table):
    """Ghi bảng (khoá `vp` / `hu` / `t` sắp theo số, một id mỗi dòng cho dễ so diff)."""
    out = {k: table[k] for k in table if k not in KINDS}
    for kind in KINDS:
        out[kind] = dict(sorted(table[kind].items(), key=lambda kv: kv[1]))
    text = json.dumps(out, ensure_ascii=False, indent=2)  # 2 dấu cách như Prettier: `npx prettier --check .` của CI không đòi định dạng lại
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf8") as f:
        f.write(text + "\n")
    os.replace(tmp, path)
