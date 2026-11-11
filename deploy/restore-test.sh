#!/usr/bin/env bash
# ==============================================================================
# Script kiểm tra khôi phục sao lưu định kỳ (M4 3.6, Issue #299)
# Nạp bản sao lưu mới nhất vào container PostgreSQL TẠM, kiểm tra các bảng dữ liệu
# chính TỒN TẠI và đọc được, ghi log và mốc LAST_RESTORE_OK, sau đó dọn dẹp.
#
# Bài kiểm này phải có khả năng ĐỎ: nạp lỗi (ON_ERROR_STOP), bảng thiếu hoặc truy vấn lỗi
# đều làm script thoát khác 0 và KHÔNG ghi LAST_RESTORE_OK. Không có chỗ nào che lỗi bằng giá trị 0.
# ==============================================================================
set -euo pipefail

PROD_DIR="${PROD_DIR:-$HOME/TT/tien-gioi-prod}"
BACKUP_DIR="$PROD_DIR/backups"
LOG_FILE="$BACKUP_DIR/restore-test.log"
MARK_FILE="$BACKUP_DIR/LAST_RESTORE_OK"
TEST_CONTAINER="tien-gioi-restore-test-db"

# Các bảng bắt buộc có trong bản sao lưu (khớp server/migrations/*.sql; test tĩnh
# server/scripts/deploy-guard.test.ts giữ danh sách này khớp với các tệp migration).
REQUIRED_TABLES=(schema_migrations accounts sessions characters souls sects sect_members)

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

# Tìm bản sao lưu mới nhất (bỏ qua .partial: bản dở không khớp mẫu *.sql.gz)
latest_backup="$(ls -1t "$BACKUP_DIR"/tiengioi-*.sql.gz 2>/dev/null | head -n 1 || true)"
if [[ -z "$latest_backup" || ! -f "$latest_backup" ]]; then
  echo "[LỖI] Không tìm thấy bản sao lưu nào trong $BACKUP_DIR" >&2
  exit 1
fi

echo "  - Bản sao lưu được kiểm tra: $(basename "$latest_backup")"
gzip -t "$latest_backup" || { echo "[LỖI] Bản sao lưu không phải gzip hợp lệ (hỏng / cụt)." >&2; exit 1; }

# 1. Khởi chạy container PostgreSQL tạm (cùng phiên bản với bản chạy thật, KHÔNG mở cổng)
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
for _ in {1..30}; do
  if docker_cmd exec "$TEST_CONTAINER" pg_isready -U tiengioi -d tiengioi >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "[LỖI] Container PostgreSQL tạm không sẵn sàng sau 30 giây!" >&2
  exit 1
fi

# 3. Nạp dữ liệu sao lưu vào container tạm. Lỗi SQL bất kỳ => thoát khác 0 (ON_ERROR_STOP).
echo "  - Đang nạp dữ liệu từ $(basename "$latest_backup")..."
gunzip -c "$latest_backup" | docker_cmd exec -i "$TEST_CONTAINER" \
  psql -U tiengioi -d tiengioi -v ON_ERROR_STOP=1 --single-transaction -q >/dev/null

# 4. Đếm số hàng các bảng chính. Bảng thiếu => truy vấn lỗi => set -e dừng script (KHÔNG
#    được thay bằng 0).
echo "  - Đang kiểm tra và đếm số hàng các bảng..."
counts=""
for table in "${REQUIRED_TABLES[@]}"; do
  n="$(docker_cmd exec "$TEST_CONTAINER" \
    psql -U tiengioi -d tiengioi -v ON_ERROR_STOP=1 -t -A -c "SELECT count(*) FROM $table;")"
  counts+="$table: $n, "
done
counts="${counts%, }"

timestamp="$(date -Iseconds)"
summary="[$timestamp] KHÔI PHỤC THỬ THÀNH CÔNG: $(basename "$latest_backup") -> $counts"

echo "==> $summary"
echo "$summary" >> "$LOG_FILE"
echo "$timestamp" > "$MARK_FILE"
echo "==> Đã cập nhật $MARK_FILE và $LOG_FILE"
