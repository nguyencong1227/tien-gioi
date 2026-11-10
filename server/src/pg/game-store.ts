// Nhân vật và chân linh trên PostgreSQL (M3 bước 3e): cùng hợp đồng với `FilePlayerStore` / `FileSoulStore`
// (`player-store.ts`, `soul.ts`; bộ ca chung ở `store-contract.ts`).
//
// Thứ tự ghi: các lần ghi cùng một khoá xếp hàng trong tiến trình (`KeyedQueue`: bản gọi sau luôn là bản cuối cùng dù pool
// chạy song song), cộng với bảo vệ ở DB: `SoulStore.update` là giao dịch `SELECT ... FOR UPDATE` (nhiều tiến trình cũng
// không mất cập nhật), `fn` chạy TRƯỚC khi ghi gì nên `fn` ném lỗi thì không có gì để hoàn tác.
import { newSoul, sanitizeSoul, type Soul } from "@tien-gioi/shared";
import { nameKeyOf } from "../account-store";
import type { PlayerStore } from "../player-store";
import type { SoulStore } from "../soul";
import type { SavedPlayer } from "../store";
import { isUniqueViolation, tx, upsert, type Db, type DbClient } from "./db";
import { KeyedQueue } from "./queue";

export class PgPlayerStore implements PlayerStore {
  private readonly queue = new KeyedQueue();

  constructor(private readonly db: Db) {}

  async load(name: string): Promise<SavedPlayer | null> {
    const r = await this.db.query("SELECT data FROM characters WHERE name_key = $1", [
      nameKeyOf(name),
    ]);
    return r.rows.length > 0 ? (r.rows[0].data as SavedPlayer) : null;
  }

  save(p: SavedPlayer): Promise<void> {
    const key = nameKeyOf(p.name);
    return this.queue.run(key, async () => {
      // `JSON.stringify` ném với dữ liệu không tuần tự hoá được (BigInt...): lỗi của riêng lần này, hàng đợi vẫn chạy tiếp
      const data = JSON.stringify({ ...p, updatedAt: new Date().toISOString() });
      await upsert(
        this.db,
        {
          sql: "UPDATE characters SET name = $2, data = $3::jsonb, updated_at = now() WHERE name_key = $1",
          params: [key, p.name, data],
        },
        {
          sql: "INSERT INTO characters (name_key, name, data) VALUES ($1, $2, $3::jsonb)",
          params: [key, p.name, data],
        },
      );
    });
  }
}

export class PgSoulStore implements SoulStore {
  private readonly queue = new KeyedQueue();

  constructor(
    private readonly db: Db,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  private parse(id: string, data: unknown): Soul | null {
    const soul = sanitizeSoul(data, this.clock());
    if (soul) return { ...soul, id };
    console.error(`[soul] dòng chân linh hỏng trong DB, bỏ qua: ${id}`);
    return null;
  }

  private async read(c: Pick<DbClient, "query">, id: string, lock = false): Promise<Soul | null> {
    const r = await c.query(`SELECT data FROM souls WHERE id = $1${lock ? " FOR UPDATE" : ""}`, [
      id,
    ]);
    return r.rows.length > 0 ? this.parse(id, r.rows[0].data) : null;
  }

  private async insert(c: Pick<DbClient, "query">, soul: Soul) {
    await c.query("INSERT INTO souls (id, data) VALUES ($1, $2::jsonb)", [
      soul.id,
      JSON.stringify(soul),
    ]);
  }

  get(id: string): Promise<Soul | null> {
    return this.queue.run(id, () => this.read(this.db, id));
  }

  create(id: string, init?: (s: Soul) => Soul): Promise<Soul> {
    return this.queue.run(id, async () => {
      const cur = await this.read(this.db, id);
      if (cur) return cur;
      let soul = newSoul(id, this.clock());
      if (init) soul = { ...init(soul), id };
      try {
        await this.insert(this.db, soul);
        return soul;
      } catch (e) {
        // Tiến trình khác vừa tạo trước: trả bản của họ (không ghi đè)
        if (!isUniqueViolation(e)) throw e;
        const won = await this.read(this.db, id);
        if (won) return won;
        throw e;
      }
    });
  }

  update(id: string, fn: (s: Soul) => Soul): Promise<Soul> {
    return this.queue.run(id, async () => {
      // Dòng chưa có thì không có gì để khoá: chèn có thể thua tiến trình khác (UNIQUE), khi đó thử lại và lần sau sẽ khoá được
      for (let attempt = 0; ; attempt++) {
        try {
          return await tx(this.db, async (c) => {
            const cur = await this.read(c, id, true);
            const next: Soul = {
              ...fn(cur ?? newSoul(id, this.clock())),
              id,
              updatedAt: this.clock(),
            };
            if (cur) {
              await c.query("UPDATE souls SET data = $2::jsonb, updated_at = now() WHERE id = $1", [
                id,
                JSON.stringify(next),
              ]);
            } else {
              await this.insert(c, next);
            }
            return next;
          });
        } catch (e) {
          if (isUniqueViolation(e) && attempt < 3) continue;
          throw e;
        }
      }
    });
  }
}
