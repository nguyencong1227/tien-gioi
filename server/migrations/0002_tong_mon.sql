-- Tông môn (M3.6 bước 6b, docs/THIET_KE_TONG_MON.md mục 4.1).
-- Chỉ dùng cú pháp chạy được trên cả PostgreSQL thật lẫn pg-mem (test).
-- Nguồn sự thật là cột `data` (bản ghi `Sect`, đã qua `sanitizeSect`). `name_key` / `tag_key` (đã chuẩn hoá bằng `sectKey`) và
-- `sect_members.soul_key` là các CHỈ MỤC DUY NHẤT để DB chặn: trùng tên, trùng biệt hiệu, một linh hồn ở hai tông môn, kể cả
-- khi hai yêu cầu (hoặc hai tiến trình) đua nhau. Khác thiết kế gốc (mục 4.1): không có khoá ngoại / ON DELETE CASCADE từ
-- `sect_members` tới `sects` (như `sessions` ở 0001: pg-mem lệch ở đó); `PgSectStore` xoá cả hai bảng trong một giao dịch.

CREATE TABLE sects (
  id text PRIMARY KEY,
  name_key text NOT NULL UNIQUE,
  tag_key text NOT NULL UNIQUE,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sect_members (
  soul_key text PRIMARY KEY,
  sect_id text NOT NULL
);
CREATE INDEX sect_members_sect_id_idx ON sect_members (sect_id);
