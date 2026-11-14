#!/usr/bin/env bash
# Khởi động dịch vụ ComfyUI + SDXL cho đồ họa nháp (Mục 16.2 & 17.3 QUYET_DINH_M3, G1 #486)
# Giới hạn tài nguyên: RAM 7 GB (MemoryMax), thời gian sống tối đa 30 phút (RuntimeMaxSec), nghe 127.0.0.1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMFY_DIR="${COMFY_DIR:-/mnt/data/comfyui}"
OUTPUT_DIR="${OUTPUT_DIR:-$COMFY_DIR/output}"
TEMP_DIR="${TEMP_DIR:-$COMFY_DIR/temp}"
PORT="${COMFY_PORT:-8188}"
LOCK_FILE="${COMFY_LOCK_FILE:-${XDG_RUNTIME_DIR:-/tmp}/tg-comfy.lock}"
IDLE_PID_FILE="${COMFY_IDLE_PID_FILE:-${XDG_RUNTIME_DIR:-/tmp}/tg-comfy-idle.pid}"
MIN_FREE_KB="${TEST_MIN_FREE_KB:-$((10 * 1024 * 1024))}" # Mặc định tối thiểu 10 GB trống

# Trap dọn dẹp khóa nếu comfy-up.sh gặp lỗi giữa chừng
cleanup_on_failure() {
  rm -f "$LOCK_FILE" "$IDLE_PID_FILE" 2>/dev/null || true
}
trap cleanup_on_failure ERR INT TERM

DRY_RUN=0
for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    DRY_RUN=1
  fi
done

# 1. Kiểm tra dung lượng đĩa trống trên / và thư mục dữ liệu ComfyUI
ROOT_FREE_KB=$(df -k / | awk 'NR==2 {print $4}')
COMFY_FREE_KB=$(df -k "$COMFY_DIR" 2>/dev/null | awk 'NR==2 {print $4}' || echo "$ROOT_FREE_KB")

if [ "$ROOT_FREE_KB" -lt "$MIN_FREE_KB" ]; then
  echo "LỖI: Ổ gốc (/) còn ít hơn 10 GB trống (${ROOT_FREE_KB} KB < ${MIN_FREE_KB} KB)." >&2
  echo "Từ chối khởi động ComfyUI để bảo vệ Docker và dữ liệu bản chạy thật." >&2
  exit 1
fi

if [ "$COMFY_FREE_KB" -lt "$MIN_FREE_KB" ]; then
  echo "LỖI: Ổ dữ liệu ($COMFY_DIR) còn ít hơn 10 GB trống (${COMFY_FREE_KB} KB < ${MIN_FREE_KB} KB)." >&2
  echo "Từ chối khởi động ComfyUI để tránh lỗi ghi tệp checkpoint/ảnh nháp." >&2
  exit 1
fi

# 2. Kiểm tra GPU: từ chối chạy nếu thấy Chrome headless đang đo hiệu năng hoặc chạy test với GPU
if [ "${TEST_GPU_BUSY:-0}" = "1" ]; then
  echo "LỖI: Phát hiện bài test Chrome đang sử dụng GPU. Từ chối chạy ComfyUI để tránh tranh chấp VRAM." >&2
  exit 1
fi

if [ "${TEST_SKIP_GPU_PROBE:-0}" != "1" ] && command -v nvidia-smi >/dev/null 2>&1; then
  CHROME_COMPUTE=$(nvidia-smi --query-compute-apps=pid,process_name --format=csv,noheader 2>/dev/null | grep -iE 'chrome|chromium' || true)
  if [ -n "$CHROME_COMPUTE" ]; then
    echo "LỖI: Chrome headless đang chiếm tài nguyên tính toán GPU ($CHROME_COMPUTE)." >&2
    echo "Không chạy ComfyUI cùng lúc với bài đo hiệu năng GPU." >&2
    exit 1
  fi
fi

# 3. Kiểm tra trạng thái đã chạy
if systemctl --user is-active tg-comfy >/dev/null 2>&1; then
  echo "ComfyUI (tg-comfy) đang chạy sẵn ở cổng $PORT."
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$LOCK_FILE"
  chmod 600 "$LOCK_FILE" 2>/dev/null || true
  trap - ERR INT TERM
  exit 0
fi

# 4. Dọn dẹp ảnh nháp cũ hơn 14 ngày (không dọn thư mục chosen/ đã được chọn)
if [ -d "$OUTPUT_DIR" ]; then
  find "$OUTPUT_DIR" -type f -mtime +14 -not -path '*/chosen/*' -delete 2>/dev/null || true
fi

# 5. Ghi file lock để Chrome test tự động lùi về CPU (software fallback)
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$LOCK_FILE"
chmod 600 "$LOCK_FILE" 2>/dev/null || true

if [ "$DRY_RUN" = "1" ]; then
  rm -f "$LOCK_FILE"
  echo "Kiểm tra điều kiện khởi động ComfyUI thành công (chế độ --dry-run)."
  trap - ERR INT TERM
  exit 0
fi

# 6. Đảm bảo thư mục đầu ra và tạm tồn tại trên /mnt/data
mkdir -p "$OUTPUT_DIR" "$TEMP_DIR"

# 7. Kiểm tra tệp thực thi Python và mã nguồn ComfyUI
PYTHON_BIN="$COMFY_DIR/env/bin/python"
MAIN_PY="$COMFY_DIR/ComfyUI/main.py"

if [ ! -x "$PYTHON_BIN" ] || [ ! -f "$MAIN_PY" ]; then
  rm -f "$LOCK_FILE"
  echo "LỖI: Không tìm thấy môi trường Python ($PYTHON_BIN) hoặc ComfyUI ($MAIN_PY)." >&2
  exit 1
fi

# 8. Khởi động qua systemd-run --user với hạn mức RAM cứng 7 GB và tự tắt sau 1800s (30 phút)
echo "Đang khởi động ComfyUI qua systemd-run (đơn vị tg-comfy)..."
systemd-run --user \
  --unit=tg-comfy \
  -p MemoryMax=7G \
  -p MemoryHigh=6G \
  -p RuntimeMaxSec=1800 \
  -p Restart=no \
  -p Environment="HF_HUB_OFFLINE=1" \
  -p Environment="HF_HUB_DISABLE_TELEMETRY=1" \
  -p WorkingDirectory="$COMFY_DIR/ComfyUI" \
  "$PYTHON_BIN" "$MAIN_PY" \
    --listen 127.0.0.1 \
    --port "$PORT" \
    --disable-auto-launch \
    --offline \
    --disable-all-custom-nodes \
    --disable-metadata \
    --output-directory "$OUTPUT_DIR" \
    --temp-directory "$TEMP_DIR" >/dev/null 2>&1

# 9. Chờ cổng 8188 sẵn sàng (tối đa 30 giây)
READY=0
for i in $(seq 1 30); do
  if curl -sS -o /dev/null -m 2 "http://127.0.0.1:${PORT}/system_stats" 2>/dev/null; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "LỖI: Quá thời gian chờ ComfyUI lắng nghe tại cổng $PORT." >&2
  "$SCRIPT_DIR/comfy-down.sh" >/dev/null 2>&1 || true
  exit 1
fi

# 10. Khởi động script canh rảnh 5 phút chạy ngầm
if [ -x "$SCRIPT_DIR/comfy-idle-watch.sh" ]; then
  nohup "$SCRIPT_DIR/comfy-idle-watch.sh" >/dev/null 2>&1 &
fi

# Gỡ bỏ trap lỗi khi khởi động hoàn tất thành công
trap - ERR INT TERM
echo "ComfyUI đã khởi động thành công (đơn vị tg-comfy, cổng $PORT, giới hạn RAM 7 GB, tự tắt sau 30 phút hoặc 5 phút rảnh)."
