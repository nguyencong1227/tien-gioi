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
# Tên container (khớp container_name trong docker-compose.prod.yml)
DB_CONTAINER="${DB_CONTAINER:-tien-gioi-db}"
GAME_CONTAINER="${GAME_CONTAINER:-tien-gioi}"

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

# BẮT BUỘC có --env-file: `env_file:` trong compose chỉ đưa biến vào container, KHÔNG dùng để
# nội suy ${POSTGRES_PASSWORD} / ${TIEN_GIOI_TAG} trong chính tệp compose (compose chỉ đọc `.env`).
# Thiếu cờ này thì `up` chết ngay với "required variable POSTGRES_PASSWORD is missing".
compose_cmd() {
  if docker_cmd compose version >/dev/null 2>&1; then
    docker_cmd compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
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

  # Chép docker-compose.prod.yml mẫu vào thư mục prod (chạy lại init từ bản chép trong
  # thư mục prod thì không có tệp mẫu: giữ nguyên compose đang dùng)
  local src_compose="$SCRIPT_DIR/docker-compose.prod.yml"
  if [[ -f "$src_compose" ]]; then
    cp "$src_compose" "$COMPOSE_FILE"
    echo "  - Đã chép docker-compose.yml"
  elif [[ -f "$COMPOSE_FILE" ]]; then
    echo "  - Giữ nguyên docker-compose.yml hiện có"
  else
    echo "[LỖI] Không tìm thấy tệp mẫu $src_compose" >&2
    exit 1
  fi

  # Chép prod.sh và restore-test.sh vào thư mục prod: bộ hẹn giờ systemd
  # (tien-gioi-*.service) gọi chúng ở đây, bản trong thư mục dev có thể đổi nhánh / bị xoá.
  local f
  for f in prod.sh restore-test.sh; do
    if [[ -f "$SCRIPT_DIR/$f" && ! "$SCRIPT_DIR/$f" -ef "$PROD_DIR/$f" ]]; then
      cp "$SCRIPT_DIR/$f" "$PROD_DIR/$f"
      chmod 755 "$PROD_DIR/$f"
      echo "  - Đã chép $f"
    fi
  done

  # Sinh tệp .env.production nếu chưa có
  if [[ -f "$ENV_FILE" ]]; then
    echo "  - Tệp .env.production đã tồn tại, giữ nguyên bí mật cũ."
  else
    echo "  - Đang sinh bí mật ngẫu nhiên cho cơ sở dữ liệu và giám sát..."
    local pg_pass metrics_token
    pg_pass="$(openssl rand -hex 24)"
    metrics_token="$(openssl rand -hex 24)"

    # Tạo tệp và đặt quyền 600 TRƯỚC khi ghi bí mật (không có khoảng hở đọc được)
    : > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
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
# Nguồn của app Android (Capacitor, androidScheme https) được đọc /health và /api/* khác nguồn.
# Khớp CHÍNH XÁC, không ký tự đại diện (docs/TRIEN_KHAI.md mục 5.2, THIET_KE_APP_ANDROID.md mục 7).
CORS_ORIGINS=https://localhost
METRICS_TOKEN=$metrics_token
TIEN_GIOI_TAG=0.1.0
EOF
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

  # KÉO ẢNH TRƯỚC, ghi trạng thái SAU: kéo hỏng (mạng, chưa docker login, thẻ không có)
  # thì .env.production, .current-tag, .last-tag giữ nguyên, bản đang chạy không bị ảnh hưởng.
  # Biến môi trường ưu tiên hơn --env-file nên thẻ mới được dùng ngay khi tệp chưa đổi.
  echo "==> Đang kéo ảnh ghcr.io/nguyencong1227/tien-gioi:$tag..."
  TIEN_GIOI_TAG="$tag" compose_cmd pull game

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
  local partial_file="$target_file.partial"

  echo "==> Đang sao lưu PostgreSQL vào: $target_file..."
  # Không dùng `exec -t` (cấp TTY làm mỗi dòng kết thúc bằng CRLF, lẫn vào bản sao lưu).
  # --clean --if-exists: bản sao lưu tự DROP bảng cũ trước khi tạo lại nên `restore` GHI ĐÈ được
  # lên cơ sở dữ liệu đang có dữ liệu (không có hai cờ này thì nạp lại báo "already exists" và
  # giữ nguyên dữ liệu hiện tại). --no-owner: không phụ thuộc tên vai trò khi nạp.
  # Ghi ra tệp .partial rồi mới đổi tên: lỗi giữa chừng không để lại bản sao lưu hỏng
  # (vừa chiếm một trong 14 chỗ, vừa bị restore-test.sh chọn làm "bản mới nhất").
  if ! docker_cmd exec "$DB_CONTAINER" pg_dump -U tiengioi --clean --if-exists --no-owner tiengioi \
      | gzip -c > "$partial_file" || ! gzip -t "$partial_file"; then
    rm -f "$partial_file"
    echo "[LỖI] Sao lưu thất bại (pg_dump hoặc nén lỗi), đã xoá bản dở." >&2
    exit 1
  fi
  mv "$partial_file" "$target_file"

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

  gzip -t "$file" || { echo "[LỖI] Tệp $file không phải gzip hợp lệ, không khôi phục." >&2; exit 1; }

  # Dừng game trong lúc khôi phục (không để máy chủ ghi / giữ khoá bảng giữa chừng).
  echo "==> Dừng dịch vụ game..."
  compose_cmd stop game

  # --single-transaction + ON_ERROR_STOP: tệp hỏng / cụt thì HOÀN TÁC, cơ sở dữ liệu giữ
  # nguyên như trước (không bao giờ ở trạng thái nửa cũ nửa mới).
  echo "==> Đang khôi phục cơ sở dữ liệu từ $file..."
  local rc=0
  gunzip -c "$file" | docker_cmd exec -i "$DB_CONTAINER" \
    psql -U tiengioi -d tiengioi -v ON_ERROR_STOP=1 --single-transaction -q >/dev/null || rc=$?

  echo "==> Khởi động lại dịch vụ game..."
  compose_cmd up -d game >/dev/null

  if [[ "$rc" -ne 0 ]]; then
    echo "[LỖI] Khôi phục thất bại (mã $rc): cơ sở dữ liệu giữ nguyên như trước khi khôi phục." >&2
    exit "$rc"
  fi
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
  echo "     (bước này làm game gián đoạn vài giây: người chơi đang nối bị rớt rồi tự nối lại)"
  local start took code
  start=$(date +%s)
  docker_cmd stop -t 30 "$GAME_CONTAINER" >/dev/null
  took=$(( $(date +%s) - start ))
  # Không dùng `|| echo 0`: không đọc được mã thoát thì phải báo thất bại, không coi là đạt.
  code="$(docker_cmd inspect -f '{{.State.ExitCode}}' "$GAME_CONTAINER" 2>/dev/null || echo "không-đọc-được")"
  echo "     Container $GAME_CONTAINER dừng trong ${took}s (mã thoát: $code)"

  # 4. LUÔN khởi động lại game TRƯỚC khi kết luận kiểm tra tắt êm: bước 3 đỏ cũng không được
  # để bản chạy thật nằm tắt.
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

  # Kết luận kiểm tra tắt êm (bước 3) SAU KHI game đã chạy lại.
  if [[ "$took" -ge 25 ]]; then
    echo "     [THẤT BẠI] docker stop mất quá lâu (${took}s >= 25s): SIGTERM có thể không tới server!" >&2
    exit 1
  fi
  if [[ "$code" != "0" ]]; then
    echo "     [THẤT BẠI] Mã thoát của container không phải 0 (mã: $code): server bị giết thay vì tắt êm!" >&2
    exit 1
  fi
  echo "     [ĐẠT] Tắt êm thành công trong ${took}s, mã thoát 0"

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
# Lệnh xoa-tai-khoan: xoá vĩnh viễn dữ liệu tài khoản người chơi (Issue #317, #321)
# ------------------------------------------------------------------------------
cmd_xoa_tai_khoan() {
  local username="${1:-}"
  local confirm="${2:-}"

  if [[ -z "$username" ]]; then
    echo "[LỖI] Thiếu tên đăng nhập cần xoá." >&2
    echo "  Cách dùng: $0 xoa-tai-khoan <tên-đăng-nhập> [--yes]" >&2
    exit 1
  fi

  # Kiểm tra tên bằng regex ^[a-z0-9_]{3,20}$ TRƯỚC mọi lệnh Docker (chống chèn shell)
  if [[ ! "$username" =~ ^[a-z0-9_]{3,20}$ ]]; then
    echo "[LỖI] Tên đăng nhập '$username' không hợp lệ (chỉ gồm a-z, 0-9, _, độ dài 3-20 ký tự)." >&2
    exit 1
  fi

  if [[ "$confirm" != "--yes" ]]; then
    echo "==> Chạy thử kiểm tra xoá tài khoản: $username (chưa thay đổi gì trên hệ thống)..."
    compose_cmd run --rm --no-deps game node --import tsx scripts/tai-khoan.ts xoa "$username"
    return $?
  fi

  echo "==> Tiến hành xoá THẬT tài khoản: $username"
  echo "  1. Tự động sao lưu cơ sở dữ liệu trước khi xoá..."
  cmd_backup

  echo "  2. Tạm dừng dịch vụ game để đảm bảo an toàn..."
  compose_cmd stop game

  echo "  3. Chạy công cụ xoá tài khoản trong container dùng một lần và ghi nhật ký kiểm toán..."
  local audit_log="$PROD_DIR/audit-xoa-tai-khoan.log"
  touch "$audit_log"
  chmod 600 "$audit_log"
  local tmp_out
  tmp_out="$(mktemp)"
  local rc=0
  compose_cmd run --rm --no-deps game node --import tsx scripts/tai-khoan.ts xoa "$username" --yes | tee "$tmp_out" || rc="${PIPESTATUS[0]}"

  # Nối các dòng kiểm toán JSON (chứa '"audit":1') vào tệp audit log lâu dài
  grep '"audit":1' "$tmp_out" >> "$audit_log" || true
  rm -f "$tmp_out"

  echo "  4. Khởi động lại dịch vụ game..."
  compose_cmd up -d game >/dev/null

  if [[ "$rc" -ne 0 ]]; then
    echo "[LỖI] Thao tác xoá tài khoản thất bại (mã thoát: $rc)." >&2
    exit "$rc"
  fi

  echo "==> Xoá tài khoản $username hoàn tất! Nhật ký kiểm toán đã lưu tại $audit_log"
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
  xoa-tai-khoan <tên> [--yes] Xoá tài khoản người chơi (tự sao lưu + tắt game khi có --yes)
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
  xoa-tai-khoan) cmd_xoa_tai_khoan "$@" ;;
  -h|--help|help|"") usage ;;
  *)
    echo "[LỖI] Lệnh không hợp lệ: $action" >&2
    usage
    exit 1
    ;;
esac
