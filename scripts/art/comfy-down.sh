#!/usr/bin/env bash
# Tắt dịch vụ ComfyUI và giải phóng tài nguyên (Mục 16.2 & 17.3 QUYET_DINH_M3, G1 #486)
set -euo pipefail

COMFY_DIR="${COMFY_DIR:-/mnt/data/comfyui}"
OUTPUT_DIR="${OUTPUT_DIR:-$COMFY_DIR/output}"
LOCK_FILE="${COMFY_LOCK_FILE:-/tmp/tg-comfy.lock}"

# 1. Dừng đơn vị systemd tạm tg-comfy
if systemctl --user is-active tg-comfy >/dev/null 2>&1; then
  systemctl --user stop tg-comfy 2>/dev/null || true
fi

# 2. Xóa tệp khóa tg-comfy.lock
rm -f "$LOCK_FILE" /run/user/"$(id -u)"/tg-comfy.lock 2>/dev/null || true

# 3. Dừng tiến trình canh rảnh nếu đang chạy
pkill -u "$(id -u)" -f "comfy-idle-watch.sh" 2>/dev/null || true

# 4. Quét sạch tiến trình Python ComfyUI mồ côi nếu còn rớt lại
pkill -u "$(id -u)" -f "ComfyUI/main.py" 2>/dev/null || true

# 5. Dọn dẹp ảnh nháp cũ hơn 14 ngày (không dọn thư mục chosen/)
if [ -d "$OUTPUT_DIR" ]; then
  find "$OUTPUT_DIR" -type f -mtime +14 -not -path '*/chosen/*' -delete 2>/dev/null || true
fi

echo "Đã tắt dây chuyền ComfyUI và giải phóng tài nguyên."
