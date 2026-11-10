// Tông môn trên PostgreSQL (M3.6 bước 6b): cùng hợp đồng với `FileSectStore` (`sect-store.ts`; bộ ca chung ở `store-contract.ts`).
//
// Tính duy nhất do DB giữ bằng ràng buộc UNIQUE (`sects.name_key`, `sects.tag_key`, `sect_members.soul_key`, khoá chính `id`): hai
// `create` đua nhau (kể cả hai tiến trình) thì đúng MỘT lần thắng, lần kia nhận lỗi 23505 và được dịch thành `SectConflictError`.
// Mỗi thao tác ghi là MỘT giao dịch (bản ghi + chỉ mục thành viên cùng thành công hoặc cùng huỷ). `update` khoá hàng bằng
// `SELECT ... FOR UPDATE` (nhiều tiến trình cũng không mất cập nhật); `fn` chạy trước mọi lần ghi nên `fn` ném lỗi thì không có gì
// để hoàn tác. Trong tiến trình, các lần ghi cùng một `id` xếp hàng (`KeyedQueue`) để giữ đúng thứ tự gọi.
import { sectKey } from "@tien-gioi/shared";
import {
  SectConflictError,
  assertWritableSect,
  sanitizeSect,
  type Sect,
  type SectStore,
} from "../sect-store";
import { isUniqueViolation, tx, type Db, type DbClient } from "./db";
import { KeyedQueue } from "./queue";

export class PgSectStore implements SectStore {
  private readonly queue = new KeyedQueue();

  constructor(
    private readonly db: Db,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  private parse(id: string, data: unknown): Sect | null {
    const s = sanitizeSect(data, this.clock());
    if (s && s.id === id) return s;
    console.error(`[sect] dòng tông môn hỏng trong DB, bỏ qua: ${id}`);
    return null;
  }

  private async read(c: Pick<DbClient, "query">, id: string, lock = false): Promise<Sect | null> {
    const r = await c.query(`SELECT data FROM sects WHERE id = $1${lock ? " FOR UPDATE" : ""}`, [
      id,
    ]);
    return r.rows.length > 0 ? this.parse(id, r.rows[0].data) : null;
  }

  async all(): Promise<Sect[]> {
    const r = await this.db.query("SELECT id, data FROM sects ORDER BY id");
    return r.rows.flatMap((row) => {
      const s = this.parse(row.id as string, row.data);
      return s ? [s] : [];
    });
  }

  get(id: string): Promise<Sect | null> {
    return this.read(this.db, id);
  }

  async findBySoul(soulKey: string): Promise<Sect | null> {
    const m = await this.db.query("SELECT sect_id FROM sect_members WHERE soul_key = $1", [
      soulKey,
    ]);
    return m.rows.length > 0 ? this.read(this.db, m.rows[0].sect_id as string) : null;
  }

  /** Chèn chỉ mục thành viên TRƯỚC dòng tông môn: bản ghi chỉ xuất hiện khi mọi chỉ mục đã vào (giao dịch lo phần còn lại). */
  private async insertRows(c: Pick<DbClient, "query">, s: Sect) {
    for (const m of s.members)
      await c.query("INSERT INTO sect_members (soul_key, sect_id) VALUES ($1, $2)", [
        m.soulKey,
        s.id,
      ]);
    await c.query(
      "INSERT INTO sects (id, name_key, tag_key, data) VALUES ($1, $2, $3, $4::jsonb)",
      [s.id, sectKey(s.name), sectKey(s.tag), JSON.stringify(s)],
    );
  }

  /**
   * Tìm xung đột tính duy nhất của `s` (id chỉ kiểm khi `checkId`, tức `create`). Chạy TRONG giao dịch trước khi ghi (từ chối sạch,
   * đúng lý do, không phụ thuộc ROLLBACK: `pg-mem` không hoàn tác đúng) và lại một lần sau khi UNIQUE từ chối (hai yêu cầu đua
   * nhau: DB là trọng tài, kiểm lại chỉ để báo đúng lý do).
   */
  private async findConflict(
    q: Pick<DbClient, "query">,
    s: Sect,
    checkId: boolean,
  ): Promise<SectConflictError | null> {
    const found = async (sql: string, params: unknown[]) => (await q.query(sql, params)).rows;
    const name = await found("SELECT 1 FROM sects WHERE name_key = $1 AND id <> $2", [
      sectKey(s.name),
      s.id,
    ]);
    if (name.length > 0) return new SectConflictError("name_taken");
    const tag = await found("SELECT 1 FROM sects WHERE tag_key = $1 AND id <> $2", [
      sectKey(s.tag),
      s.id,
    ]);
    if (tag.length > 0) return new SectConflictError("tag_taken");
    const keys = s.members.map((m) => m.soulKey);
    const marks = keys.map((_, i) => "$" + (i + 2)).join(", ");
    const taken = await found(
      "SELECT soul_key FROM sect_members WHERE sect_id <> $1 AND soul_key IN (" + marks + ")",
      [s.id, ...keys],
    );
    if (taken.length > 0) {
      const hit = new Set(taken.map((r) => r.soul_key as string));
      return new SectConflictError(
        "member_taken",
        keys.find((k) => hit.has(k)),
      );
    }
    // Id kiểm CUỐI: `id` trùng chỉ xảy ra khi người gọi sai (id là uuid); kiểm sau cùng còn để một dòng của chính lần ghi
    // vừa bị từ chối (nếu backend không hoàn tác) không che mất lý do thật (tên / biệt hiệu / thành viên của tông môn KHÁC).
    if (checkId && (await found("SELECT 1 FROM sects WHERE id = $1", [s.id])).length > 0)
      return new SectConflictError("id_taken");
    return null;
  }

  create(sect: Sect): Promise<Sect> {
    return this.queue.run(sect.id, async () => {
      const s = assertWritableSect({ ...sect, updatedAt: this.clock() }, this.clock());
      try {
        await tx(this.db, async (c) => {
          const conflict = await this.findConflict(c, s, true);
          if (conflict) throw conflict;
          await this.insertRows(c, s);
        });
        return s;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        throw (await this.findConflict(this.db, s, true)) ?? e;
      }
    });
  }

  update(id: string, fn: (s: Sect) => Sect): Promise<Sect | null> {
    return this.queue.run(id, async () => {
      let next = undefined as Sect | undefined; // gán trong hàm giao dịch bên dưới (TS không thấy qua closure)
      try {
        return await tx(this.db, async (c) => {
          const cur = await this.read(c, id, true);
          if (!cur) return null;
          next = assertWritableSect(
            { ...fn(structuredClone(cur)), id, v: 1, updatedAt: this.clock() },
            this.clock(),
          );
          const conflict = await this.findConflict(c, next, false);
          if (conflict) throw conflict;
          await c.query(
            "UPDATE sects SET name_key = $2, tag_key = $3, data = $4::jsonb, updated_at = now() WHERE id = $1",
            [id, sectKey(next.name), sectKey(next.tag), JSON.stringify(next)],
          );
          const before = new Set(cur.members.map((m) => m.soulKey));
          const after = new Set(next.members.map((m) => m.soulKey));
          for (const k of before)
            if (!after.has(k))
              await c.query("DELETE FROM sect_members WHERE soul_key = $1 AND sect_id = $2", [
                k,
                id,
              ]);
          for (const k of after)
            if (!before.has(k))
              await c.query("INSERT INTO sect_members (soul_key, sect_id) VALUES ($1, $2)", [
                k,
                id,
              ]);
          return next;
        });
      } catch (e) {
        if (!next || !isUniqueViolation(e)) throw e;
        throw (await this.findConflict(this.db, next, false)) ?? e;
      }
    });
  }

  delete(id: string): Promise<boolean> {
    return this.queue.run(id, () =>
      tx(this.db, async (c) => {
        const r = await c.query("DELETE FROM sects WHERE id = $1", [id]);
        await c.query("DELETE FROM sect_members WHERE sect_id = $1", [id]);
        return (r.rowCount ?? 0) > 0;
      }),
    );
  }
}
