-- Tài khoản, phiên, nhân vật, chân linh (M3.3 bước 3e, docs/THIET_KE_TAI_KHOAN.md mục 3 và 6).
-- Chỉ dùng cú pháp chạy được trên cả PostgreSQL thật lẫn pg-mem (test).
-- Khác thiết kế gốc (mục 3): id là `text` (id do ứng dụng sinh, tra id lạ trả null chứ không lỗi cú pháp uuid); `sessions`
-- không có khoá ngoại tới `accounts` (phiên mồ côi bị `AuthService` dọn khi gặp); `characters` khoá theo đạo hiệu chuẩn
-- hoá (nhân vật tra theo tên; liên kết tài khoản <-> nhân vật nằm ở `accounts.name`); `souls` khoá theo id chân linh
-- (id tài khoản ở chế độ tài khoản, tên chuẩn hoá ở chế độ cũ).

CREATE TABLE accounts (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  pass_hash text NOT NULL,
  recovery_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  last_login_at timestamptz NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  name text,
  name_key text UNIQUE
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  account_id text NOT NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  last_seen_at bigint NOT NULL
);
CREATE INDEX sessions_account_id_idx ON sessions (account_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE characters (
  name_key text PRIMARY KEY,
  name text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE souls (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
