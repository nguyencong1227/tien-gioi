#!/usr/bin/env python3
"""Hậu kỳ TẤT ĐỊNH cho ảnh AI (SDXL base) trước khi vào game (docs/KE_HOACH_DO_HOA_AI.md mục 9.2).

Chỉ làm những việc được phép: CẮT, ĐỔI CỠ, mã hoá lại thành WebP SẠCH (không khối EXIF / XMP / ICC, không văn bản của ComfyUI). KHÔNG vẽ thêm / sửa nội dung ảnh;
nếu nội dung chưa ổn thì sinh lại ảnh thô với seed khác. Cùng ảnh thô + cùng tham số + cùng phiên bản Pillow / libwebp cho ĐÚNG MỘT chuỗi byte (băm ghi vào
`docs/art/nguon/<tên>.json` ở `finalSha256`, kèm tham số ở `postProcess`).

Dùng:
    python3 -I client/scripts/art/hau-ky-webp.py --raw <ảnh thô .png> --out client/public/assets/ai/<tên>.webp [--crop x,y,w,h] [--size WxH] [--quality 86] [--method 6]

In ra một dòng JSON: băm ảnh thô, băm ảnh cuối, cỡ, số byte, phiên bản Pillow / libwebp (dán vào tệp nguồn). Thoát mã 1 nếu ảnh cuối còn siêu dữ liệu hoặc vượt `--max-kb`.
Chạy bằng `python3 -I` (bỏ qua biến môi trường và thư mục hiện tại: không nạp nhầm mô-đun lạ).
"""
import argparse
import hashlib
import io
import json
import sys

from PIL import Image, features
import PIL

MAX_KB_DEFAULT = 150  # trần mỗi ảnh (client/perf-budget.json static.aiAssets.maxFileKb)


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def riff_chunks(webp: bytes):
    """Danh sách tên khối của tệp WebP (RIFF); ném lỗi nếu tệp không đúng cấu trúc."""
    if webp[:4] != b"RIFF" or webp[8:12] != b"WEBP":
        raise ValueError("không phải WebP (RIFF)")
    declared = int.from_bytes(webp[4:8], "little") + 8
    if declared != len(webp):
        raise ValueError(f"RIFF khai {declared} byte nhưng tệp {len(webp)} byte (dữ liệu thừa hoặc cắt cụt)")
    out, pos = [], 12
    while pos + 8 <= len(webp):
        name = webp[pos : pos + 4].decode("latin1")
        size = int.from_bytes(webp[pos + 4 : pos + 8], "little")
        out.append(name)
        pos += 8 + size + (size & 1)
    return out


def parse_box(text: str):
    parts = [int(x) for x in text.split(",")]
    if len(parts) != 4 or parts[2] <= 0 or parts[3] <= 0 or min(parts[:2]) < 0:
        raise argparse.ArgumentTypeError("--crop phải là x,y,w,h (số nguyên, w và h > 0)")
    return tuple(parts)


def parse_size(text: str):
    try:
        w, h = (int(x) for x in text.lower().split("x"))
    except ValueError:
        raise argparse.ArgumentTypeError("--size phải là WxH")
    if w <= 0 or h <= 0:
        raise argparse.ArgumentTypeError("--size phải dương")
    return w, h


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--raw", required=True, help="ảnh thô (PNG của ComfyUI), nằm NGOÀI repo (/mnt/data/comfyui/output/...)")
    ap.add_argument("--out", required=True, help="WebP cuối (client/public/assets/ai/<tên>.webp)")
    ap.add_argument("--crop", type=parse_box, help="x,y,w,h trên ảnh thô (cắt trước khi đổi cỡ)")
    ap.add_argument("--size", type=parse_size, help="WxH sau cùng (Lanczos); bỏ trống = giữ cỡ sau cắt")
    ap.add_argument("--quality", type=int, default=86)
    ap.add_argument("--method", type=int, default=6)
    ap.add_argument("--max-kb", type=float, default=MAX_KB_DEFAULT)
    a = ap.parse_args(argv)
    if not (0 <= a.quality <= 100 and 0 <= a.method <= 6):
        ap.error("--quality 0..100, --method 0..6")

    raw_bytes = open(a.raw, "rb").read()
    im = Image.open(io.BytesIO(raw_bytes))
    im.load()
    im = im.convert("RGB")  # bỏ kênh alpha và hồ sơ màu; dựng ảnh mới từ điểm ảnh nên không mang theo khối văn bản nào của PNG
    if a.crop:
        x, y, w, h = a.crop
        if x + w > im.width or y + h > im.height:
            ap.error(f"--crop vượt ảnh thô {im.width}x{im.height}")
        im = im.crop((x, y, x + w, y + h))
    if a.size and a.size != im.size:
        im = im.resize(a.size, Image.LANCZOS)
    clean = Image.new("RGB", im.size)
    clean.paste(im)

    buf = io.BytesIO()
    clean.save(buf, "WEBP", quality=a.quality, method=a.method)  # không truyền exif / xmp / icc_profile
    data = buf.getvalue()

    chunks = riff_chunks(data)
    bad = [c for c in chunks if c in ("EXIF", "XMP ", "ICCP")]
    kb = len(data) / 1024
    problems = []
    if bad:
        problems.append(f"ảnh cuối còn khối siêu dữ liệu: {bad}")
    if kb > a.max_kb:
        problems.append(f"{kb:.1f} KB vượt trần {a.max_kb} KB (hạ --quality hoặc --size)")
    if problems:
        print("; ".join(problems), file=sys.stderr)
        return 1

    with open(a.out, "wb") as f:
        f.write(data)
    print(
        json.dumps(
            {
                "rawSha256": sha256_of(raw_bytes),
                "finalSha256": sha256_of(data),
                "width": clean.width,
                "height": clean.height,
                "bytes": len(data),
                "chunks": chunks,
                "params": {"crop": list(a.crop) if a.crop else None, "size": list(a.size) if a.size else None, "quality": a.quality, "method": a.method},
                "pillow": PIL.__version__,
                "libwebp": features.version("webp"),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
