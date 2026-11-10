// Kho tài khoản và phiên (M3 bước 3c, docs/THIET_KE_TAI_KHOAN.md mục 3 và 6): giao diện để thay backend (file JSON hôm
// nay, PostgreSQL ở bước 3e). Hai bản `File*` dành cho dev và test; chạy một tiến trình duy nhất (như `Hub`): chỉ mục
// trong bộ nhớ dựng từ thư mục khi dùng lần đầu, mọi thay đổi đi qua một hàng đợi nên tính duy nhất (tên đăng nhập,
// đạo hiệu) không bị đua. Công cụ dòng lệnh sửa tệp trực tiếp chỉ an toàn khi server đang tắt.
import { promises as fs } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { cleanName, validateUsername } from "@tien-gioi/shared";

/** Khoá so đạo hiệu: NFC, không phân biệt hoa thường (cùng cách đặt tên file nhân vật ở `store.ts`). */
export const nameKeyOf = (name: string) => name.normalize("NFC").toLowerCase();

export interface AccountRecord {
  /** uuid, khoá chân linh ở chế độ tài khoản */
  id: string;
  /** Tên đăng nhập đã chuẩn hoá (chữ thường), duy nhất, KHÔNG hiện cho người chơi khác */
  username: string;
  /** `scrypt$...` (xem `auth.ts`) */
  passHash: string;
  recoveryHash: string;
  createdAt: string;
  lastLoginAt: string;
  disabled: boolean;
  /** Đạo hiệu của nhân vật (`cleanName`), duy nhất toàn server; chưa tạo nhân vật thì không có */
  name?: string;
}

/** Trường do người gọi đưa vào khi tạo; `id` do kho sinh. */
export type NewAccount = Omit<AccountRecord, "id" | "name">;

export type AccountPatch = Partial<
  Pick<AccountRecord, "passHash" | "recoveryHash" | "lastLoginAt" | "disabled">
>;

export type SetNameResult = "ok" | "name_taken" | "has_character" | "not_found";

export interface AccountStore {
  /** Tạo tài khoản; `null` nếu tên đăng nhập đã có (so trên dạng chuẩn hoá). Tạo cùng lúc thì đúng một lần thắng. */
  create(a: NewAccount): Promise<AccountRecord | null>;
  byUsername(username: string): Promise<AccountRecord | null>;
  byId(id: string): Promise<AccountRecord | null>;
  /** Đạo hiệu -> chủ (để biết tên đã có chủ chưa). */
  byName(name: string): Promise<AccountRecord | null>;
  /** Sửa mật khẩu / mã khôi phục / lần đăng nhập cuối / khoá; không có tài khoản thì `null`. */
  update(id: string, patch: AccountPatch): Promise<AccountRecord | null>;
  /**
   * Đặt đạo hiệu MỘT lần (một tài khoản một nhân vật). `name` phải đã qua `cleanName`. Hai tài khoản tranh một tên thì
   * đúng một bên được `ok`, bên kia `name_taken`.
   */
  setName(id: string, name: string): Promise<SetNameResult>;
}

export interface SessionRecord {
  /** `sha256(token)` hex: kho không bao giờ giữ token thật */
  tokenHash: string;
  accountId: string;
  createdAt: number;
  /** ms epoch; kho trả cả phiên đã hết hạn, người gọi (AuthService) so với giờ hiện tại */
  expiresAt: number;
  lastSeenAt: number;
}

export interface SessionStore {
  create(s: SessionRecord): Promise<void>;
  get(tokenHash: string): Promise<SessionRecord | null>;
  /** Làm mới phiên trượt: ghi `lastSeenAt` và `expiresAt` mới. */
  touch(tokenHash: string, lastSeenAt: number, expiresAt: number): Promise<void>;
  delete(tokenHash: string): Promise<void>;
  /** Xoá mọi phiên của tài khoản (đổi mật khẩu / khôi phục); trả số phiên đã xoá. */
  deleteAllOf(accountId: string): Promise<number>;
  /** Dọn phiên hết hạn (`expiresAt <= now`); trả số phiên đã xoá. */
  deleteExpired(now: number): Promise<number>;
}

// ---------- Làm sạch dữ liệu đọc từ tệp (không tin) ----------

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const HEX64_RE = /^[a-f0-9]{64}$/;
const isIso = (s: unknown): s is string =>
  typeof s === "string" && s.length <= 40 && Number.isFinite(Date.parse(s));
const isHash = (s: unknown): s is string =>
  typeof s === "string" && s.length > 0 && s.length <= 512;
const finiteTime = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 1e15;

export function sanitizeAccount(raw: unknown): AccountRecord | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID_RE.test(r.id)) return null;
  const u = validateUsername(r.username);
  if (!u.ok || u.value !== r.username) return null;
  if (!isHash(r.passHash) || !isHash(r.recoveryHash)) return null;
  const a: AccountRecord = {
    id: r.id,
    username: u.value,
    passHash: r.passHash,
    recoveryHash: r.recoveryHash,
    createdAt: isIso(r.createdAt) ? r.createdAt : new Date(0).toISOString(),
    lastLoginAt: isIso(r.lastLoginAt) ? r.lastLoginAt : new Date(0).toISOString(),
    disabled: r.disabled === true,
  };
  if (r.name !== undefined) {
    const n = cleanName(r.name);
    if (n === null || n !== r.name) return null;
    a.name = n;
  }
  return a;
}

export function sanitizeSession(raw: unknown): SessionRecord | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.tokenHash !== "string" || !HEX64_RE.test(r.tokenHash)) return null;
  if (typeof r.accountId !== "string" || !ID_RE.test(r.accountId)) return null;
  if (!finiteTime(r.createdAt) || !finiteTime(r.expiresAt) || !finiteTime(r.lastSeenAt))
    return null;
  return {
    tokenHash: r.tokenHash,
    accountId: r.accountId,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    lastSeenAt: r.lastSeenAt,
  };
}

// ---------- Tiện ích tệp ----------

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Tệp tạm có hậu tố ngẫu nhiên: không bao giờ hai lần ghi dùng chung một tệp tạm
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 1), { mode: 0o600 });
  await fs.rename(tmp, file);
}

/** Đọc mọi `*.json` trong thư mục; tệp hỏng (không phải JSON / không qua `sanitize`) bị cách ly thành `*.hong-*`. */
async function loadDir<T>(
  dir: string,
  sanitize: (raw: unknown) => T | null,
  label: string,
): Promise<T[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
  const out: T[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const file = path.join(dir, name);
    let value: T | null;
    try {
      value = sanitize(JSON.parse(await fs.readFile(file, "utf8")));
    } catch {
      value = null;
    }
    if (value === null) {
      const moved = `${file}.hong-${Date.now()}-${randomBytes(3).toString("hex")}`;
      console.error(`[${label}] tệp hỏng, đã cách ly: ${moved}`);
      await fs.rename(file, moved).catch(() => {});
      continue;
    }
    out.push(value);
  }
  return out;
}

/** Hàng đợi một làn: các thao tác chạy lần lượt, một lần lỗi không chặn lần sau (lỗi trả về cho chính lần đó). */
class Lane {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => {});
    return next;
  }
}

// ---------- Bản file ----------

/** Tài khoản: `<dir>/<id>.json`; chỉ mục theo tên đăng nhập, id, đạo hiệu trong bộ nhớ. */
export class FileAccountStore implements AccountStore {
  private readonly lane = new Lane();
  private index: Promise<void> | undefined;
  private readonly byIdMap = new Map<string, AccountRecord>();
  private readonly byUser = new Map<string, string>();
  private readonly byNameKey = new Map<string, string>();

  constructor(private readonly dir: string) {}

  private fileOf(id: string) {
    return path.join(this.dir, `${id}.json`);
  }

  private put(a: AccountRecord) {
    const old = this.byIdMap.get(a.id);
    if (old?.name) this.byNameKey.delete(nameKeyOf(old.name));
    this.byIdMap.set(a.id, a);
    this.byUser.set(a.username, a.id);
    if (a.name) this.byNameKey.set(nameKeyOf(a.name), a.id);
  }

  /** Dựng chỉ mục một lần; lỗi đọc thư mục thì lần sau thử lại. */
  private ready(): Promise<void> {
    this.index ??= (async () => {
      for (const value of await loadDir(this.dir, sanitizeAccount, "account")) {
        // Hai tệp cùng tên đăng nhập / đạo hiệu (sửa tay): giữ tệp đầu, bỏ qua tệp sau và báo
        const dupUser = this.byUser.has(value.username);
        const dupName = value.name !== undefined && this.byNameKey.has(nameKeyOf(value.name));
        if (dupUser || dupName) {
          console.error(`[account] trùng tên đăng nhập / đạo hiệu, bỏ qua tài khoản ${value.id}`);
          continue;
        }
        this.put(value);
      }
    })().catch((e) => {
      this.index = undefined;
      throw e;
    });
    return this.index;
  }

  private async save(a: AccountRecord) {
    await writeJson(this.fileOf(a.id), a);
    this.put(a);
  }

  create(a: NewAccount) {
    return this.lane.run(async () => {
      await this.ready();
      const u = validateUsername(a.username);
      if (!u.ok || u.value !== a.username) throw new Error("tên đăng nhập chưa chuẩn hoá");
      if (this.byUser.has(a.username)) return null;
      const rec: AccountRecord = { ...a, id: randomUUID() };
      await this.save(rec);
      return rec;
    });
  }

  byUsername(username: string) {
    return this.lane.run(async () => {
      await this.ready();
      const id = this.byUser.get(username);
      return id ? (this.byIdMap.get(id) ?? null) : null;
    });
  }

  byId(id: string) {
    return this.lane.run(async () => {
      await this.ready();
      return this.byIdMap.get(id) ?? null;
    });
  }

  byName(name: string) {
    return this.lane.run(async () => {
      await this.ready();
      const id = this.byNameKey.get(nameKeyOf(name));
      return id ? (this.byIdMap.get(id) ?? null) : null;
    });
  }

  update(id: string, patch: AccountPatch) {
    return this.lane.run(async () => {
      await this.ready();
      const cur = this.byIdMap.get(id);
      if (!cur) return null;
      const next: AccountRecord = { ...cur };
      if (patch.passHash !== undefined) next.passHash = patch.passHash;
      if (patch.recoveryHash !== undefined) next.recoveryHash = patch.recoveryHash;
      if (patch.lastLoginAt !== undefined) next.lastLoginAt = patch.lastLoginAt;
      if (patch.disabled !== undefined) next.disabled = patch.disabled;
      await this.save(next);
      return next;
    });
  }

  setName(id: string, name: string) {
    return this.lane.run(async (): Promise<SetNameResult> => {
      await this.ready();
      if (cleanName(name) !== name) throw new Error("đạo hiệu chưa qua cleanName");
      const cur = this.byIdMap.get(id);
      if (!cur) return "not_found";
      if (cur.name !== undefined) return "has_character";
      const owner = this.byNameKey.get(nameKeyOf(name));
      if (owner !== undefined) return "name_taken";
      await this.save({ ...cur, name });
      return "ok";
    });
  }
}

/** Phiên: `<dir>/<tokenHash>.json`; chỉ mục theo tài khoản trong bộ nhớ. */
export class FileSessionStore implements SessionStore {
  private readonly lane = new Lane();
  private index: Promise<void> | undefined;
  private readonly byHash = new Map<string, SessionRecord>();

  constructor(private readonly dir: string) {}

  private fileOf(tokenHash: string) {
    return path.join(this.dir, `${tokenHash}.json`);
  }

  private ready(): Promise<void> {
    this.index ??= (async () => {
      for (const value of await loadDir(this.dir, sanitizeSession, "session"))
        this.byHash.set(value.tokenHash, value);
    })().catch((e) => {
      this.index = undefined;
      throw e;
    });
    return this.index;
  }

  private async remove(tokenHash: string) {
    // Tên tệp lấy từ tham số của người gọi: chỉ nhận đúng dạng sha256 hex (không `../`, không dấu phân cách)
    if (!HEX64_RE.test(tokenHash)) return;
    await fs.rm(this.fileOf(tokenHash), { force: true });
    this.byHash.delete(tokenHash);
  }

  create(s: SessionRecord) {
    return this.lane.run(async () => {
      await this.ready();
      const clean = sanitizeSession(s);
      if (!clean) throw new Error("phiên không hợp lệ");
      await writeJson(this.fileOf(clean.tokenHash), clean);
      this.byHash.set(clean.tokenHash, clean);
    });
  }

  get(tokenHash: string) {
    return this.lane.run(async () => {
      await this.ready();
      return this.byHash.get(tokenHash) ?? null;
    });
  }

  touch(tokenHash: string, lastSeenAt: number, expiresAt: number) {
    return this.lane.run(async () => {
      await this.ready();
      const cur = this.byHash.get(tokenHash);
      if (!cur) return;
      const next = sanitizeSession({ ...cur, lastSeenAt, expiresAt });
      if (!next) throw new Error("thời gian phiên không hợp lệ");
      await writeJson(this.fileOf(tokenHash), next);
      this.byHash.set(tokenHash, next);
    });
  }

  delete(tokenHash: string) {
    return this.lane.run(async () => {
      await this.ready();
      await this.remove(tokenHash);
    });
  }

  deleteAllOf(accountId: string) {
    return this.lane.run(async () => {
      await this.ready();
      let n = 0;
      for (const s of [...this.byHash.values()]) {
        if (s.accountId !== accountId) continue;
        await this.remove(s.tokenHash);
        n++;
      }
      return n;
    });
  }

  deleteExpired(now: number) {
    return this.lane.run(async () => {
      await this.ready();
      let n = 0;
      for (const s of [...this.byHash.values()]) {
        if (s.expiresAt > now) continue;
        await this.remove(s.tokenHash);
        n++;
      }
      return n;
    });
  }
}

// ---------- Dùng chung của tiến trình ----------

/** Thư mục tài khoản: `ACCOUNTS_DIR`, không có thì `<DATA_DIR>/accounts` (cùng volume và bản sao lưu với hồ sơ nhân vật). */
export function accountsDir(): string {
  if (process.env.ACCOUNTS_DIR) return path.resolve(process.env.ACCOUNTS_DIR);
  return path.join(path.resolve(process.env.DATA_DIR ?? "data/players"), "accounts");
}

/** Thư mục phiên: `SESSIONS_DIR`, không có thì `<DATA_DIR>/sessions`. */
export function sessionsDir(): string {
  if (process.env.SESSIONS_DIR) return path.resolve(process.env.SESSIONS_DIR);
  return path.join(path.resolve(process.env.DATA_DIR ?? "data/players"), "sessions");
}

let sharedAccounts: AccountStore | undefined;
let sharedSessions: SessionStore | undefined;
/** Kho tài khoản dùng chung (dựng lười để `DATA_DIR` do test đặt trước khi nạp module có hiệu lực). */
export function defaultAccountStore(): AccountStore {
  return (sharedAccounts ??= new FileAccountStore(accountsDir()));
}
export function defaultSessionStore(): SessionStore {
  return (sharedSessions ??= new FileSessionStore(sessionsDir()));
}
