// Bộ chạy migration (M3 bước 3e): các tệp `server/migrations/NNNN_ten.sql` chạy tuần tự, mỗi tệp một giao dịch, ghi vào
// `schema_migrations` kèm băm nội dung. Tệp đã áp dụng mà nội dung bị sửa thì từ chối (đổi schema = thêm tệp mới).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tx, type Db } from "./db";

export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

const FILE_RE = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** Tách tệp SQL thành từng câu lệnh (cắt ở `;` cuối dòng, bỏ dòng chú thích `--`). Các tệp của dự án không có hàm / `$$`. */
export function splitStatements(sql: string): string[] {
  const noComments = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  return noComments
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Tạo bảng ghi sổ nếu chưa có. Không dùng `CREATE TABLE IF NOT EXISTS`: `pg-mem` (test) báo "chưa hỗ trợ" khi bảng đã có.
 * Hai tiến trình khởi động cùng lúc: bên thua gặp 42P07 (bảng đã tồn tại) thì bỏ qua.
 */
async function ensureMigrationsTable(db: Db): Promise<void> {
  try {
    await db.query("SELECT 1 FROM schema_migrations LIMIT 1");
    return;
  } catch {
    /* chưa có bảng: tạo bên dưới */
  }
  try {
    await db.query(
      `CREATE TABLE schema_migrations (
         version text PRIMARY KEY,
         checksum text NOT NULL,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code !== "42P07") throw e;
  }
}

/** Áp dụng mọi migration chưa chạy. Chạy lại là an toàn (không làm gì). Phải chạy MỘT tiến trình tại một thời điểm. */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<MigrationResult> {
  await ensureMigrationsTable(db);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) if (!FILE_RE.test(f)) throw new Error(`Tên migration không hợp lệ: ${f}`);
  const done = new Map<string, string>(
    (
      await db.query<{ version: string; checksum: string }>(
        "SELECT version, checksum FROM schema_migrations",
      )
    ).rows.map((r) => [r.version, r.checksum]),
  );
  const result: MigrationResult = { applied: [], skipped: [] };
  for (const f of files) {
    const version = f.slice(0, -4);
    const sql = readFileSync(path.join(dir, f), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prev = done.get(version);
    if (prev !== undefined) {
      if (prev !== checksum)
        throw new Error(
          `Migration ${f} đã áp dụng nhưng nội dung đã bị sửa (không được sửa migration cũ).`,
        );
      result.skipped.push(version);
      continue;
    }
    await tx(db, async (c) => {
      for (const stmt of splitStatements(sql)) await c.query(stmt);
      await c.query("INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)", [
        version,
        checksum,
      ]);
    });
    result.applied.push(version);
  }
  return result;
}
