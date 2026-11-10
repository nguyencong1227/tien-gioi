// Lớp mỏng trên PostgreSQL (M3 bước 3e): chỉ giao diện tối thiểu mà các `Pg*Store` cần, để dùng chung `pg.Pool` thật, bộ
// điều hợp `pg-mem` trong test, và không buộc mã game vào kiểu của thư viện `pg`.
export interface DbResult<R = any> {
  rows: R[];
  rowCount: number | null;
}

export interface DbClient {
  query<R = any>(text: string, params?: unknown[]): Promise<DbResult<R>>;
  release(): void;
}

export interface Db {
  query<R = any>(text: string, params?: unknown[]): Promise<DbResult<R>>;
  connect(): Promise<DbClient>;
}

/** Vi phạm ràng buộc UNIQUE / khoá chính (mã lỗi PostgreSQL 23505). */
export const isUniqueViolation = (e: unknown): boolean =>
  (e as { code?: unknown } | null)?.code === "23505";

/**
 * Ghi "có thì sửa, chưa có thì thêm" mà KHÔNG bao giờ có khoảnh khắc dòng biến mất (không DELETE rồi INSERT: một lần đọc
 * chen vào sẽ thấy "chưa có" và chương trình tạo mới đè lên). `UPDATE` trước; không có dòng nào thì `INSERT`; thua một
 * `INSERT` khác cùng lúc (UNIQUE) thì `UPDATE` lại. Không dùng `ON CONFLICT` vì `pg-mem` lệch ở chỗ đó.
 */
export async function upsert(
  db: Pick<Db, "query">,
  update: { sql: string; params: unknown[] },
  insert: { sql: string; params: unknown[] },
): Promise<void> {
  const run = async () => ((await db.query(update.sql, update.params)).rowCount ?? 0) > 0;
  if (await run()) return;
  try {
    await db.query(insert.sql, insert.params);
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    if (!(await run())) throw e;
  }
}

/** Chạy `fn` trong một giao dịch: lỗi thì ROLLBACK và ném lại; luôn trả kết nối về pool. */
export async function tx<T>(db: Db, fn: (c: DbClient) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/**
 * Pool kết nối thật từ `DATABASE_URL`. `pg` nạp lười: chế độ `STORE=file` không tốn gì. Lỗi kết nối của một kết nối nhàn
 * rỗi (DB khởi động lại) chỉ ghi log, không làm sập tiến trình.
 */
export async function createPool(url: string): Promise<Db & { end(): Promise<void> }> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  pool.on("error", (e) => console.error(`[pg] lỗi kết nối nhàn rỗi: ${e.name}`));
  return pool as unknown as Db & { end(): Promise<void> };
}
