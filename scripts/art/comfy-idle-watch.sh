#!/usr/bin/env bash
# Giám sát hàng đợi ComfyUI: tự động tắt sau 5 phút không có công việc (Mục 16.2 & 17.3 QUYET_DINH_M3, G1 #486)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${COMFY_PORT:-8188}"
IDLE_LIMIT_SEC=300 # 5 phút
CHECK_INTERVAL_SEC=15
IDLE_COUNT=0

while true; do
  sleep "$CHECK_INTERVAL_SEC"

  # Nếu đơn vị tg-comfy không còn chạy thì tự thoát
  if ! systemctl --user is-active tg-comfy >/dev/null 2>&1; then
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
