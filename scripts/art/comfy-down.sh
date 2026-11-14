#!/usr/bin/env bash
# Tắt dịch vụ ComfyUI và giải phóng tài nguyên (Mục 16.2 & 17.3 QUYET_DINH_M3, G1 #486)
set -euo pipefail

COMFY_DIR="${COMFY_DIR:-/mnt/data/comfyui}"
OUTPUT_DIR="${OUTPUT_DIR:-$COMFY_DIR/output}"
LOCK_FILE="${COMFY_LOCK_FILE:-${XDG_RUNTIME_DIR:-/tmp}/tg-comfy.lock}"
IDLE_PID_FILE="${COMFY_IDLE_PID_FILE:-${XDG_RUNTIME_DIR:-/tmp}/tg-comfy-idle.pid}"

# 1. Dừng đơn vị systemd tạm tg-comfy (systemd tự dọn toàn bộ cgroup, không dùng pkill -f)
if systemctl --user is-active tg-comfy >/dev/null 2>&1; then
  systemctl --user stop tg-comfy 2>/dev/null || true
fi

# 2. Dừng tiến trình canh rảnh thông qua PID file chính xác (không dùng pkill -f tránh giết nhầm)
if [ -f "$IDLE_PID_FILE" ]; then
  WATCH_PID=$(cat "$IDLE_PID_FILE" 2>/dev/null || true)
  if [ -n "$WATCH_PID" ] && kill -0 "$WATCH_PID" 2>/dev/null; then
    kill "$WATCH_PID" 2>/dev/null || true
  fi
  rm -f "$IDLE_PID_FILE" 2>/dev/null || true
fi

# 3. Xóa tệp khóa tg-comfy.lock
rm -f "$LOCK_FILE" /tmp/tg-comfy.lock "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/tg-comfy.lock" 2>/dev/null || true

# 4. Dọn dẹp ảnh nháp cũ hơn 14 ngày (không dọn thư mục chosen/)
if [ -d "$OUTPUT_DIR" ]; then
  find "$OUTPUT_DIR" -type f -mtime +14 -not -path '*/chosen/*' -delete 2>/dev/null || true
fi

echo "Đã tắt dây chuyền ComfyUI và giải phóng tài nguyên."
