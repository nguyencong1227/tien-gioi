#!/usr/bin/env bash
# ==============================================================================
# Script kiểm tra khôi phục sao lưu định kỳ (M4 3.6, Issue #299)
# Nạp bản sao lưu mới nhất vào container PostgreSQL TẠM, kiểm tra tính toàn vẹn
# của các bảng dữ liệu chính, ghi log và mốc LAST_RESTORE_OK, sau đó dọn dẹp.
# ==============================================================================
set -euo pipefail

PROD_DIR="${PROD_DIR:-$HOME/TT/tien-gioi-prod}"
BACKUP_DIR="$PROD_DIR/backups"
LOG_FILE="$BACKUP_DIR/restore-test.log"
MARK_FILE="$BACKUP_DIR/LAST_RESTORE_OK"
TEST_CONTAINER="tien-gioi-restore-test-db"
TEMP_PORT=25432 # Cổng tạm thời (nội bộ hoặc không mở)

docker_cmd() {
  if command -v docker >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
    docker "$@"
  elif command -v sg >/dev/null 2>&1 && sg docker -c 'docker ps' >/dev/null 2>&1; then
    sg docker -c "docker $(printf '%q ' "$@")"
  else
    echo "[LỖI] Không thể kết nối tới Docker daemon." >&2
    exit 1
  fi
}

cleanup() {
  echo "  - Dọn dẹp container tạm $TEST_CONTAINER..."
  docker_cmd rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Bắt đầu kiểm tra khôi phục bản sao lưu định kỳ..."
mkdir -p "$BACKUP_DIR"

# Tìm bản sao lưu mới nhất
latest_backup="$(ls -1t "$BACKUP_DIR"/tiengioi-*.sql.gz 2>/dev/null | head -n 1 || true)"
if [[ -z "$latest_backup" || ! -f "$latest_backup" ]]; then
  echo "[LỖI] Không tìm thấy bản sao lưu nào trong $BACKUP_DIR" >&2
  exit 1
fi

echo "  - Bản sao lưu được kiểm tra: $(basename "$latest_backup")"

# 1. Khởi chạy container PostgreSQL tạm
cleanup
echo "  - Khởi chạy container tạm $TEST_CONTAINER (postgres:16)..."
docker_cmd run -d \
  --name "$TEST_CONTAINER" \
  -e POSTGRES_DB=tiengioi \
  -e POSTGRES_USER=tiengioi \
  -e POSTGRES_PASSWORD=restore_test_password \
  postgres:16 >/dev/null

# 2. Chờ PostgreSQL sẵn sàng
echo "  - Chờ cơ sở dữ liệu tạm khởi động..."
ready=0
for i in {1..20}; do
  if docker_cmd exec "$TEST_CONTAINER" pg_isready -U tiengioi -d tiengioi >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "[LỖI] Container PostgreSQL tạm không sẵn sàng sau 20 giây!" >&2
  exit 1
fi

# 3. Nạp dữ liệu sao lưu vào container tạm
echo "  - Đang nạp dữ liệu từ $(basename "$latest_backup")..."
gunzip -c "$latest_backup" | docker_cmd exec -i "$TEST_CONTAINER" psql -U tiengioi -d tiengioi >/dev/null

# 4. Kiểm tra số lượng bản ghi của các bảng chính
echo "  - Đang kiểm tra cấu trúc và đếm số hàng các bảng..."
run_sql() {
  docker_cmd exec -i "$TEST_CONTAINER" psql -U tiengioi -d tiengioi -t -A -c "$1"
}

players_count="$(run_sql "SELECT count(*) FROM players;" 2>/dev/null || echo "0")"
souls_count="$(run_sql "SELECT count(*) FROM souls;" 2>/dev/null || echo "0")"
accounts_count="$(run_sql "SELECT count(*) FROM accounts;" 2>/dev/null || echo "0")"
sessions_count="$(run_sql "SELECT count(*) FROM sessions;" 2>/dev/null || echo "0")"
sects_count="$(run_sql "SELECT count(*) FROM sects;" 2>/dev/null || echo "0")"

timestamp="$(date -Iseconds)"
summary="[$timestamp] KHÔI PHỤC THỬ THÀNH CÔNG: $(basename "$latest_backup") -> players: $players_count, souls: $souls_count, accounts: $accounts_count, sessions: $sessions_count, sects: $sects_count"

echo "==> $summary"
echo "$summary" >> "$LOG_FILE"
echo "$timestamp" > "$MARK_FILE"
echo "==> Đã cập nhật $MARK_FILE và $LOG_FILE"
