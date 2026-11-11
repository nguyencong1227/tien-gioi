#!/usr/bin/env bash
# ==============================================================================
# Script vận hành bản chạy thật Tiên Giới (M4 3.6, Issue #299)
# Tách biệt hoàn toàn với môi trường dev. Chạy tại ~/TT/tien-gioi-prod/
# ==============================================================================
set -euo pipefail

PROD_DIR="${PROD_DIR:-$HOME/TT/tien-gioi-prod}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$PROD_DIR/docker-compose.yml"
ENV_FILE="$PROD_DIR/.env.production"
BACKUP_DIR="$PROD_DIR/backups"
DATA_PG_DIR="$PROD_DIR/data/pg"

# ------------------------------------------------------------------------------
# Hàm kiểm tra và thực thi lệnh Docker an toàn (hỗ trợ nhóm docker của sg)
# ------------------------------------------------------------------------------
docker_cmd() {
  if command -v docker >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
    docker "$@"
  elif command -v sg >/dev/null 2>&1 && sg docker -c 'docker ps' >/dev/null 2>&1; then
    sg docker -c "docker $(printf '%q ' "$@")"
  else
    echo "[LỖI] Không thể kết nối tới Docker daemon." >&2
    echo "  - Kiểm tra xem Docker đã cài đặt chưa (cần sudo apt install docker.io docker-compose-v2)." >&2
    echo "  - Kiểm tra xem user hiện tại đã thuộc nhóm docker chưa (sudo usermod -aG docker $USER)." >&2
    exit 1
  fi
}

compose_cmd() {
  if docker_cmd compose version >/dev/null 2>&1; then
    docker_cmd compose -f "$COMPOSE_FILE" "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" "$@"
  else
    echo "[LỖI] Không tìm thấy docker compose hoặc docker-compose." >&2
    exit 1
  fi
}

# ------------------------------------------------------------------------------
# Lệnh init: khởi tạo thư mục chạy thật và sinh bí mật ngẫu nhiên
# ------------------------------------------------------------------------------
cmd_init() {
  echo "==> Khởi tạo môi trường chạy thật tại: $PROD_DIR"
  mkdir -p "$PROD_DIR" "$DATA_PG_DIR" "$BACKUP_DIR"
  chmod 700 "$PROD_DIR"

  # Chép file docker-compose.prod.yml mẫu vào thư mục prod
  local src_compose="$SCRIPT_DIR/docker-compose.prod.yml"
  if [[ ! -f "$src_compose" ]]; then
    echo "[LỖI] Không tìm thấy tệp mẫu $src_compose" >&2
    exit 1
  fi
  cp "$src_compose" "$COMPOSE_FILE"
  echo "  - Đã chép docker-compose.yml"

  # Sinh tệp .env.production nếu chưa có
  if [[ -f "$ENV_FILE" ]]; then
    echo "  - Tệp .env.production đã tồn tại, giữ nguyên bí mật cũ."
  else
    echo "  - Đang sinh bí mật ngẫu nhiên cho cơ sở dữ liệu và giám sát..."
    local pg_pass metrics_token
    pg_pass="$(openssl rand -hex 24)"
    metrics_token="$(openssl rand -hex 24)"

    cat > "$ENV_FILE" <<EOF
# Cấu hình môi trường bản chạy thật Tiên Giới
# Tự động sinh bởi deploy/prod.sh init - TUYỆT ĐỐI KHÔNG COMMIT HOẶC CHIA SẺ
NODE_ENV=production
PORT=2567
TIEN_GIOI_PROD=1
STORE=pg
POSTGRES_PASSWORD=$pg_pass
DATABASE_URL=postgres://tiengioi:$pg_pass@db:5432/tiengioi
AUTH_MODE=account
TRUST_PROXY=1
METRICS_TOKEN=$metrics_token
TIEN_GIOI_TAG=0.1.0
EOF
    chmod 600 "$ENV_FILE"
    echo "  - Đã tạo .env.production (quyền 600, bí mật được bảo vệ)."
  fi

  echo "==> Khởi tạo thành công! Sẵn sàng chạy: $0 up <thẻ-phiên-bản>"
}

# ------------------------------------------------------------------------------
# Lệnh up: cập nhật và khởi chạy phiên bản chỉ định
# Nhận cả v0.1.0 lẫn 0.1.0; tự động chuẩn hoá bỏ chữ 'v'
# ------------------------------------------------------------------------------
cmd_up() {
  local raw_tag="${1:-}"
  if [[ -z "$raw_tag" ]]; then
    echo "[LỖI] Cần chỉ định thẻ phiên bản cần triển khai (vd: $0 up v0.1.0 hoặc $0 up 0.1.0)" >&2
    exit 1
  fi

  # Chuẩn hoá thẻ: bỏ tiền tố 'v' nếu có (ảnh GHCR chỉ dùng số 0.1.0)
  local tag="${raw_tag#v}"
  if [[ ! "$tag" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
    echo "[LỖI] Thẻ phiên bản '$raw_tag' không đúng định dạng ngữ nghĩa (X.Y.Z hoặc X.Y.Z-rc.N)" >&2
    exit 1
  fi

  if [[ ! -f "$COMPOSE_FILE" || ! -f "$ENV_FILE" ]]; then
    echo "[LỖI] Chưa khởi tạo môi trường prod. Hãy chạy '$0 init' trước." >&2
    exit 1
  fi

  # Lưu lại thẻ hiện tại vào .last-tag để hỗ trợ rollback
  if [[ -f "$PROD_DIR/.current-tag" ]]; then
    local current_tag
    current_tag="$(cat "$PROD_DIR/.current-tag" 2>/dev/null || true)"
    if [[ -n "$current_tag" && "$current_tag" != "$tag" ]]; then
      echo "$current_tag" > "$PROD_DIR/.last-tag"
      echo "  - Đã ghi nhận thẻ cũ '$current_tag' vào .last-tag"
    fi
  fi

  # Cập nhật TIEN_GIOI_TAG vào .env.production
  if grep -q "^TIEN_GIOI_TAG=" "$ENV_FILE"; then
    sed -i "s/^TIEN_GIOI_TAG=.*/TIEN_GIOI_TAG=$tag/" "$ENV_FILE"
  else
    echo "TIEN_GIOI_TAG=$tag" >> "$ENV_FILE"
  fi
  echo "$tag" > "$PROD_DIR/.current-tag"

  echo "==> Đang kéo ảnh ghcr.io/nguyencong1227/tien-gioi:$tag..."
  compose_cmd pull game

  echo "==> Đang khởi động các dịch vụ (db + game)..."
  compose_cmd up -d --remove-orphans

  echo "==> Triển khai phiên bản $tag hoàn tất!"
  echo "    Kiểm tra trạng thái: $0 status"
  echo "    Kiểm tra kiểm thử khói: $0 smoke"
}

# ------------------------------------------------------------------------------
# Lệnh status: xem trạng thái các container
# ------------------------------------------------------------------------------
cmd_status() {
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "[LỖI] Chưa có $COMPOSE_FILE. Chạy '$0 init' trước." >&2
    exit 1
  fi
  local current_tag="chưa rõ"
  if [[ -f "$PROD_DIR/.current-tag" ]]; then
    current_tag="$(cat "$PROD_DIR/.current-tag")"
  fi
  echo "==> Trạng thái bản chạy thật Tiên Giới (Phiên bản: $current_tag):"
  compose_cmd ps
}

# ------------------------------------------------------------------------------
# Lệnh logs: xem nhật ký các container
# ------------------------------------------------------------------------------
cmd_logs() {
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "[LỖI] Chưa có $COMPOSE_FILE." >&2
    exit 1
  fi
  compose_cmd logs "$@"
}

# ------------------------------------------------------------------------------
# Lệnh backup: sao lưu PostgreSQL và giữ 14 bản mới nhất
# ------------------------------------------------------------------------------
cmd_backup() {
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "[LỖI] Chưa có $COMPOSE_FILE." >&2
    exit 1
  fi
  mkdir -p "$BACKUP_DIR"

  # Kiểm tra dung lượng đĩa còn lại (cảnh báo khi < 3 GB)
  local avail_kb
  avail_kb="$(df -k "$PROD_DIR" | awk 'NR==2 {print $4}')"
  if [[ -n "$avail_kb" && "$avail_kb" -lt 3145728 ]]; then
    echo "[CẢNH BÁO] Dung lượng đĩa còn ít: $((avail_kb / 1024)) MB (< 3072 MB)! Hãy kiểm tra dọn đĩa." >&2
  fi

  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"
  local target_file="$BACKUP_DIR/tiengioi-$timestamp.sql.gz"

  echo "==> Đang sao lưu PostgreSQL vào: $target_file..."
  docker_cmd exec -t tien-gioi-db pg_dump -U tiengioi tiengioi | gzip -c > "$target_file"

  local file_size
  file_size="$(du -h "$target_file" | awk '{print $1}')"
  echo "==> Sao lưu thành công ($file_size)!"

  # Dọn dẹp: chỉ giữ lại 14 bản sao lưu mới nhất
  local backup_count
  backup_count="$(ls -1 "$BACKUP_DIR"/tiengioi-*.sql.gz 2>/dev/null | wc -l || true)"
  if [[ "$backup_count" -gt 14 ]]; then
    echo "  - Đang dọn dẹp các bản sao lưu cũ (giữ lại 14 bản gần nhất)..."
    ls -1t "$BACKUP_DIR"/tiengioi-*.sql.gz | tail -n +15 | while read -r old_file; do
      rm -f "$old_file"
      echo "    + Đã xoá bản cũ: $(basename "$old_file")"
    done
  fi
}

# ------------------------------------------------------------------------------
# Lệnh restore: khôi phục cơ sở dữ liệu từ tệp sao lưu
# ------------------------------------------------------------------------------
cmd_restore() {
  local file="${1:-}"
  local confirm="${2:-}"
  if [[ -z "$file" || ! -f "$file" ]]; then
    echo "[LỖI] Cần chỉ định đường dẫn tệp sao lưu hợp lệ (vd: $0 restore $BACKUP_DIR/tiengioi-xyz.sql.gz)" >&2
    exit 1
  fi

  if [[ "$confirm" != "--yes" ]]; then
    echo "[CẢNH BÁO] Thao tác này sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại trong cơ sở dữ liệu!"
    read -r -p "Bạn có chắc chắn muốn khôi phục từ $(basename "$file")? (gõ 'dong y' để tiếp tục): " ans
    if [[ "$ans" != "dong y" ]]; then
      echo "Đã huỷ thao tác khôi phục."
      exit 0
    fi
  fi

  echo "==> Đang khôi phục cơ sở dữ liệu từ $file..."
  gunzip -c "$file" | docker_cmd exec -i tien-gioi-db psql -U tiengioi -d tiengioi
  echo "==> Khôi phục hoàn tất!"
}

# ------------------------------------------------------------------------------
# Lệnh rollback: quay lại phiên bản trước đó được lưu trong .last-tag
# ------------------------------------------------------------------------------
cmd_rollback() {
  local last_tag_file="$PROD_DIR/.last-tag"
  if [[ ! -f "$last_tag_file" ]]; then
    echo "[LỖI] Không tìm thấy tệp ghi nhận thẻ phiên bản trước (.last-tag)." >&2
    exit 1
  fi
  local last_tag
  last_tag="$(cat "$last_tag_file" | tr -d '[:space:]')"
  if [[ -z "$last_tag" ]]; then
    echo "[LỖI] Tệp .last-tag rỗng." >&2
    exit 1
  fi

  echo "==> Quay lại phiên bản trước đó: $last_tag..."
  cmd_up "$last_tag"
}

# ------------------------------------------------------------------------------
# Lệnh smoke: kiểm tra nhanh sức khoẻ hệ thống tại chỗ
# ------------------------------------------------------------------------------
cmd_smoke() {
  echo "==> Kiểm tra sức khoẻ server chạy thật (Smoke Test)..."
  if ! command -v curl >/dev/null 2>&1; then
    echo "[LỖI] Cần tiện ích 'curl' để thực hiện smoke test." >&2
    exit 1
  fi

  # 1. Kiểm tra /health
  echo "  1. Kiểm tra endpoint http://127.0.0.1:2567/health..."
  local health_out
  health_out="$(curl -sS --max-time 5 http://127.0.0.1:2567/health || true)"
  if [[ -z "$health_out" ]]; then
    echo "     [THẤT BẠI] Không thể kết nối tới http://127.0.0.1:2567/health" >&2
    exit 1
  fi

  if echo "$health_out" | grep -q '"ok":true' && echo "$health_out" | grep -q '"authMode":"account"'; then
    echo "     [ĐẠT] /health trả về ok:true và authMode:account"
  else
    echo "     [THẤT BẠI] Phản hồi /health không đạt yêu cầu: $health_out" >&2
    exit 1
  fi

  # 2. Kiểm tra /metrics (yêu cầu METRICS_TOKEN)
  if [[ -f "$ENV_FILE" ]]; then
    local token
    token="$(grep "^METRICS_TOKEN=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '[:space:]' || true)"
    if [[ -n "$token" ]]; then
      echo "  2. Kiểm tra xác thực endpoint /metrics..."
      local anon_code
      anon_code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:2567/metrics || true)"
      if [[ "$anon_code" == "401" ]]; then
        echo "     [ĐẠT] Truy cập ẩn danh /metrics bị từ chối với HTTP 401 Unauthorized"
      else
        echo "     [CẢNH BÁO] Truy cập ẩn danh /metrics trả mã HTTP $anon_code (kỳ vọng 401)"
      fi

      local auth_code
      auth_code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -H "Authorization: Bearer $token" http://127.0.0.1:2567/metrics || true)"
      if [[ "$auth_code" == "200" ]]; then
        echo "     [ĐẠT] Truy cập kèm METRICS_TOKEN thành công với HTTP 200 OK"
      else
        echo "     [THẤT BẠI] Truy cập kèm token trả mã HTTP $auth_code (kỳ vọng 200)" >&2
        exit 1
      fi
    fi
  fi

  # 3. Kiểm tra tắt êm (Graceful Shutdown) container game (docker stop < 25s, mã thoát 0)
  echo "  3. Kiểm tra tắt êm container game (docker stop < 25s, mã thoát 0)..."
  local start took code
  start=$(date +%s)
  docker_cmd stop -t 30 tien-gioi >/dev/null
  took=$(( $(date +%s) - start ))
  code=$(docker_cmd inspect -f '{{.State.ExitCode}}' tien-gioi 2>/dev/null || echo 0)
  echo "     Container tien-gioi dừng trong ${took}s (mã thoát: $code)"
  if [[ "$took" -ge 25 ]]; then
    echo "     [THẤT BẠI] docker stop mất quá lâu (${took}s >= 25s)!" >&2
    exit 1
  fi
  if [[ "$code" != "0" ]]; then
    echo "     [THẤT BẠI] Mã thoát của container không phải 0 (mã: $code)!" >&2
    exit 1
  fi
  echo "     [ĐẠT] Tắt êm thành công trong ${took}s, mã thoát 0"

  # 4. Khởi động lại dịch vụ game và xác nhận sẵn sàng
  echo "  4. Khởi động lại dịch vụ game và xác nhận phục hồi..."
  compose_cmd up -d game >/dev/null
  local revived=0
  for i in $(seq 1 15); do
    health_out="$(curl -sS --max-time 3 http://127.0.0.1:2567/health 2>/dev/null || true)"
    if echo "$health_out" | grep -q '"ok":true'; then
      revived=1
      break
    fi
    sleep 1
  done
  if [[ "$revived" -eq 1 ]]; then
    echo "     [ĐẠT] Dịch vụ game đã phục hồi và phản hồi /health thành công"
  else
    echo "     [THẤT BẠI] Dịch vụ game không sẵn sàng sau khi khởi động lại" >&2
    exit 1
  fi

  echo "==> Mọi kiểm tra Smoke Test đều THÀNH CÔNG!"
}

# ------------------------------------------------------------------------------
# Lệnh stop: dừng các container một cách êm ái
# ------------------------------------------------------------------------------
cmd_stop() {
  echo "==> Đang dừng các dịch vụ Tiên Giới (chờ tắt êm ái tối đa 30s)..."
  compose_cmd down
  echo "==> Toàn bộ dịch vụ đã dừng an toàn!"
}

# ------------------------------------------------------------------------------
# Điều phối lệnh chính
# ------------------------------------------------------------------------------
usage() {
  cat <<EOF
Sử dụng: $0 <lệnh> [tham số...]

Các lệnh:
  init              Khởi tạo thư mục chạy thật ($PROD_DIR), sinh cấu hình và bí mật
  up <thẻ>          Kéo ảnh Docker và chạy phiên bản (vd: up v0.1.0 hoặc up 0.1.0)
  stop              Dừng toàn bộ dịch vụ (chờ tắt êm ái và lưu dữ liệu)
  status            Xem trạng thái các container của bản chạy thật
  logs [args...]    Xem nhật ký container (vd: logs -f game)
  backup            Sao lưu cơ sở dữ liệu PostgreSQL vào $PROD_DIR/backups/
  restore <tệp>     Khôi phục cơ sở dữ liệu từ tệp sao lưu (.sql.gz)
  rollback          Quay lại phiên bản trước đó (được ghi trong .last-tag)
  smoke             Kiểm tra sức khoẻ server chạy thật (health, metrics, tắt êm < 25s)
EOF
}

action="${1:-}"
shift || true

case "$action" in
  init)     cmd_init "$@" ;;
  up)       cmd_up "$@" ;;
  stop)     cmd_stop "$@" ;;
  status)   cmd_status "$@" ;;
  logs)     cmd_logs "$@" ;;
  backup)   cmd_backup "$@" ;;
  restore)  cmd_restore "$@" ;;
  rollback) cmd_rollback "$@" ;;
  smoke)    cmd_smoke "$@" ;;
  -h|--help|help|"") usage ;;
  *)
    echo "[LỖI] Lệnh không hợp lệ: $action" >&2
    usage
    exit 1
    ;;
esac
