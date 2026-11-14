#!/usr/bin/env bash
# Giám sát hàng đợi ComfyUI: tự động tắt sau 5 phút không có công việc (Mục 16.2 & 17.3 QUYET_DINH_M3, G1 #486)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${COMFY_PORT:-8188}"
LOCK_FILE="${COMFY_LOCK_FILE:-${XDG_RUNTIME_DIR:-/tmp}/tg-comfy.lock}"
IDLE_PID_FILE="${COMFY_IDLE_PID_FILE:-${XDG_RUNTIME_DIR:-/tmp}/tg-comfy-idle.pid}"
IDLE_LIMIT_SEC=300 # 5 phút
CHECK_INTERVAL_SEC=15
IDLE_COUNT=0

# Ghi PID và thiết lập trap tự dọn khi tiến trình kết thúc
echo "$$" > "$IDLE_PID_FILE"
cleanup_idle() {
  rm -f "$IDLE_PID_FILE" 2>/dev/null || true
}
trap cleanup_idle EXIT INT TERM

while true; do
  sleep "$CHECK_INTERVAL_SEC"

  # Nếu đơn vị tg-comfy không còn chạy: dọn khóa để giải phóng GPU và thoát
  if ! systemctl --user is-active tg-comfy >/dev/null 2>&1; then
    rm -f "$LOCK_FILE" /tmp/tg-comfy.lock "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/tg-comfy.lock" 2>/dev/null || true
    break
  fi

  # Lấy trạng thái hàng đợi từ API ComfyUI
  QUEUE_INFO=$(curl -sS -m 5 "http://127.0.0.1:${PORT}/queue" 2>/dev/null || echo "")

  if [ -z "$QUEUE_INFO" ]; then
    continue
  fi

  # Kiểm tra xem có tác vụ đang chạy hoặc đang chờ không
  # Phản hồi API: {"queue_running": [...], "queue_pending": [...]}
  IS_BUSY=$(echo "$QUEUE_INFO" | grep -E '"queue_running":\s*\[[^]]+\]|"queue_pending":\s*\[[^]]+\]' || true)

  if [ -n "$IS_BUSY" ]; then
    IDLE_COUNT=0
  else
    IDLE_COUNT=$((IDLE_COUNT + CHECK_INTERVAL_SEC))
    if [ "$IDLE_COUNT" -ge "$IDLE_LIMIT_SEC" ]; then
      echo "ComfyUI đã rảnh rỗi quá 5 phút. Tự động tắt dịch vụ..."
      "$SCRIPT_DIR/comfy-down.sh" >/dev/null 2>&1 || true
      break
    fi
  fi
done
