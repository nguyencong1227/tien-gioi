// Tài khoản và phiên trên PostgreSQL (M3 bước 3e): cùng hợp đồng với `FileAccountStore` / `FileSessionStore`
// (`account-store.ts`, bộ ca chung ở `store-contract.ts`). Tính duy nhất (tên đăng nhập, đạo hiệu) do ràng buộc UNIQUE của
// DB đảm bảo (không dựa vào kiểm trước): hai yêu cầu cùng lúc thì đúng một bên thắng, kể cả khi có nhiều tiến trình.
import { randomUUID } from "node:crypto";
import { cleanName, validateUsername } from "@tien-gioi/shared";
import {
  nameKeyOf,
  sanitizeSession,
  type AccountPatch,
  type AccountRecord,
  type AccountStore,
  type NewAccount,
  type SessionRecord,
  type SessionStore,
  type SetNameResult,
} from "../account-store";
import { isUniqueViolation, upsert, type Db } from "./db";

const iso = (v: unknown): string => new Date(v as string | Date).toISOString();
const toDate = (s: string): Date => {
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) throw new Error(`Thời gian không hợp lệ: ${s}`);
  return d;
};

function toAccount(r: any): AccountRecord {
  const a: AccountRecord = {
    id: r.id,
    username: r.username,
    passHash: r.pass_hash,
    recoveryHash: r.recovery_hash,
    createdAt: iso(r.created_at),
    lastLoginAt: iso(r.last_login_at),
    disabled: r.disabled === true,
  };
  if (r.name !== null && r.name !== undefined) a.name = r.name;
  return a;
}

export class PgAccountStore implements AccountStore {
  constructor(private readonly db: Db) {}

  async create(a: NewAccount): Promise<AccountRecord | null> {
    const u = validateUsername(a.username);
    if (!u.ok || u.value !== a.username) throw new Error("tên đăng nhập chưa chuẩn hoá");
    const id = randomUUID();
    try {
      await this.db.query(
        `INSERT INTO accounts (id, username, pass_hash, recovery_hash, created_at, last_login_at, disabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          a.username,
          a.passHash,
          a.recoveryHash,
          toDate(a.createdAt),
          toDate(a.lastLoginAt),
          a.disabled,
        ],
      );
    } catch (e) {
      if (isUniqueViolation(e)) return null;
      throw e;
    }
    return { ...a, id };
  }

  private async one(where: string, param: unknown): Promise<AccountRecord | null> {
    const r = await this.db.query(`SELECT * FROM accounts WHERE ${where}`, [param]);
    return r.rows.length > 0 ? toAccount(r.rows[0]) : null;
  }

  byUsername(username: string) {
    return this.one("username = $1", username);
  }

  byId(id: string) {
    return this.one("id = $1", id);
  }

  byName(name: string) {
    return this.one("name_key = $1", nameKeyOf(name));
  }

  async all(): Promise<AccountRecord[]> {
    const r = await this.db.query("SELECT * FROM accounts");
    // Sắp ở ứng dụng: cùng thứ tự với bản file (ngày tạo, rồi tên đăng nhập), không phụ thuộc collation của DB
    return r.rows
      .map(toAccount)
      .sort(
        (x, y) => x.createdAt.localeCompare(y.createdAt) || x.username.localeCompare(y.username),
      );
  }

  async update(id: string, patch: AccountPatch): Promise<AccountRecord | null> {
    const sets: string[] = [];
    const params: unknown[] = [id];
    const add = (col: string, v: unknown) => {
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    };
    if (patch.passHash !== undefined) add("pass_hash", patch.passHash);
    if (patch.recoveryHash !== undefined) add("recovery_hash", patch.recoveryHash);
    if (patch.lastLoginAt !== undefined) add("last_login_at", toDate(patch.lastLoginAt));
    if (patch.disabled !== undefined) add("disabled", patch.disabled);
    if (sets.length === 0) return this.byId(id);
    const r = await this.db.query(
      `UPDATE accounts SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
      params,
    );
    return r.rows.length > 0 ? toAccount(r.rows[0]) : null;
  }

  async setName(id: string, name: string): Promise<SetNameResult> {
    if (cleanName(name) !== name) throw new Error("đạo hiệu chưa qua cleanName");
    try {
      const r = await this.db.query(
        "UPDATE accounts SET name = $2, name_key = $3 WHERE id = $1 AND name IS NULL RETURNING id",
        [id, name, nameKeyOf(name)],
      );
      if (r.rows.length > 0) return "ok";
    } catch (e) {
      if (isUniqueViolation(e)) return "name_taken"; // đạo hiệu đã có chủ khác
      throw e;
    }
    // Không cập nhật được: không có tài khoản, hay tài khoản đã có đạo hiệu?
    return (await this.byId(id)) ? "has_character" : "not_found";
  }
}

function toSession(r: any): SessionRecord {
  // bigint: `pg` trả chuỗi, `pg-mem` trả số
  return {
    tokenHash: r.token_hash,
    accountId: r.account_id,
    createdAt: Number(r.created_at),
    expiresAt: Number(r.expires_at),
    lastSeenAt: Number(r.last_seen_at),
  };
}

export class PgSessionStore implements SessionStore {
  constructor(private readonly db: Db) {}

  async create(s: SessionRecord): Promise<void> {
    const clean = sanitizeSession(s);
    if (!clean) throw new Error("phiên không hợp lệ");
    // Ghi đè nếu trùng (như bản file); không có khoảnh khắc phiên biến mất
    await upsert(
      this.db,
      {
        sql: `UPDATE sessions SET account_id = $2, created_at = $3, expires_at = $4, last_seen_at = $5
              WHERE token_hash = $1`,
        params: [
          clean.tokenHash,
          clean.accountId,
          clean.createdAt,
          clean.expiresAt,
          clean.lastSeenAt,
        ],
      },
      {
        sql: `INSERT INTO sessions (token_hash, account_id, created_at, expires_at, last_seen_at)
              VALUES ($1, $2, $3, $4, $5)`,
        params: [
          clean.tokenHash,
          clean.accountId,
          clean.createdAt,
          clean.expiresAt,
          clean.lastSeenAt,
        ],
      },
    );
  }

  async get(tokenHash: string): Promise<SessionRecord | null> {
    const r = await this.db.query("SELECT * FROM sessions WHERE token_hash = $1", [tokenHash]);
    return r.rows.length > 0 ? toSession(r.rows[0]) : null;
  }

  async touch(tokenHash: string, lastSeenAt: number, expiresAt: number): Promise<void> {
    for (const t of [lastSeenAt, expiresAt])
      if (!Number.isFinite(t) || t < 0 || t >= 1e15)
        throw new Error("thời gian phiên không hợp lệ");
    await this.db.query(
      "UPDATE sessions SET last_seen_at = $2, expires_at = $3 WHERE token_hash = $1",
      [tokenHash, lastSeenAt, expiresAt],
    );
  }

  async delete(tokenHash: string): Promise<void> {
    await this.db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
  }

  async deleteAllOf(accountId: string): Promise<number> {
    const r = await this.db.query("DELETE FROM sessions WHERE account_id = $1", [accountId]);
    return r.rowCount ?? 0;
  }

  async deleteExpired(now: number): Promise<number> {
    const r = await this.db.query("DELETE FROM sessions WHERE expires_at <= $1", [now]);
    return r.rowCount ?? 0;
  }
}
