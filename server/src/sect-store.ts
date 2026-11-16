// Kho lưu Tông môn (M3 bước 6b, docs/THIET_KE_TONG_MON.md mục 4.1).
// `SectStore` là giao diện lưu trữ (bản file ở đây, bản PostgreSQL ở `pg/sect-store.ts`, cùng bộ ca `store-contract.ts`) để
// `SectService` (6c) không biết backend. Bản ghi `Sect` là NGUỒN SỰ THẬT duy nhất (danh sách thành viên nằm trong đó); kho
// giữ ba bất biến bằng cấu trúc, kể cả khi hai yêu cầu đua nhau:
//   1. tên và biệt hiệu duy nhất toàn server (theo `sectKey`: không phân biệt hoa thường);
//   2. một linh hồn (`soulKey`) chỉ ở MỘT tông môn;
//   3. mỗi tông môn đúng một Tông chủ, trùng `leader`, không thành viên trùng.
// Thành viên là LINH HỒN: `soulKey` = `Identity.soulKey` (id tài khoản, hoặc tên chuẩn hoá ở chế độ cũ).
import { promises as fs } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import {
  ITEM_BY_ID,
  SECT_COIN_CAP,
  SECT_LOG_MAX,
  SECT_RANKS,
  SECT_VAULT_DRAW_DEFAULT,
  SECT_VAULT_DRAW_MAX,
  SECT_VAULT_LOG_MAX,
  SECT_VAULT_SLOTS,
  cleanMotd,
  cleanName,
  cleanSectName,
  cleanSectTag,
  sectKey,
  type InvSlot,
  type SectLogEntry,
  type SectLogKind,
  type SectRank,
  type SectVaultLogEntry,
} from "@tien-gioi/shared";
import { byId } from "./systems/lookup";

// ---------- Kiểu dữ liệu ----------

export interface SectMemberRecord {
  /** Khoá linh hồn (`Identity.soulKey`) */
  soulKey: string;
  /** Đạo hiệu lần cuối thấy (chỉ để hiển thị; khoá là `soulKey`) */
  name: string;
  rank: SectRank;
  /** ms epoch */
  joinedAt: number;
  /**
   * Lượt rút kho đồ của Đệ tử trong ngày `day` (`dayKey`, giờ Việt Nam): đếm theo LINH HỒN nên đầu thai không đặt lại (docs/THIET_KE_TONG_MON.md
   * mục 11.6). Thiếu = chưa rút lần nào. Đọc - sửa - ghi TRONG `update` cùng lúc trừ kho, nên gửi dồn không vượt hạn mức.
   */
  draw?: { day: string; n: number };
}

/**
 * Kho ĐỒ của tông môn (mục 11 THIET_KE_TONG_MON.md): `SECT_VAULT_SLOTS` ô cùng hình `InvSlot` như túi đồ, sổ (mới nhất đứng đầu, tối đa
 * `SECT_VAULT_LOG_MAX`) và hạn mức rút / ngày của Đệ tử (Tông chủ chỉnh). Mọi thay đổi đi qua `SectStore.update` (nguyên tử theo tông môn).
 */
export interface SectVault {
  /** Đúng `SECT_VAULT_SLOTS` phần tử; ô trống là `null` */
  slots: (InvSlot | null)[];
  log: SectVaultLogEntry[];
  /** 0..`SECT_VAULT_DRAW_MAX` */
  drawPerDay: number;
}

/** Kho đồ rỗng, hạn mức mặc định. */
export function emptySectVault(): SectVault {
  return {
    slots: Array.from({ length: SECT_VAULT_SLOTS }, () => null),
    log: [],
    drawPerDay: SECT_VAULT_DRAW_DEFAULT,
  };
}

export interface Sect {
  v: 1;
  id: string;
  name: string;
  tag: string;
  /** `soulKey` của Tông chủ (luôn trùng thành viên có `rank: "chu"`) */
  leader: string;
  /** Thông báo (đã qua `cleanMotd`), rỗng = không có */
  motd: string;
  /** Thứ tự tuỳ ý (người xem sắp lại bằng `compareSectMembers`) */
  members: SectMemberRecord[];
  /** Kho chung Linh thạch, số nguyên 0..`SECT_COIN_CAP` */
  coin: number;
  /** Sổ kho, MỚI NHẤT ĐỨNG ĐẦU, tối đa `SECT_LOG_MAX` */
  log: SectLogEntry[];
  /** Kho đồ (bản ghi cũ không có thì `sanitizeSect` dựng kho rỗng; `v` vẫn là 1) */
  vault: SectVault;
  /** ms epoch */
  createdAt: number;
  updatedAt: number;
}

/** Lý do một lần ghi bị kho từ chối vì vi phạm tính duy nhất. */
export type SectConflict = "id_taken" | "name_taken" | "tag_taken" | "member_taken";

/** Ném khi `create` / `update` vi phạm tính duy nhất (không ghi gì). `soulKey` có mặt khi `reason = "member_taken"`. */
export class SectConflictError extends Error {
  constructor(
    readonly reason: SectConflict,
    readonly soulKey?: string,
  ) {
    super(`Tông môn xung đột: ${reason}`);
    this.name = "SectConflictError";
  }
}

export interface SectStore {
  /** Mọi tông môn (bản sao: sửa không ảnh hưởng kho). Tệp / dòng hỏng đã bị bỏ qua hoặc cách ly. */
  all(): Promise<Sect[]>;
  get(id: string): Promise<Sect | null>;
  /** Tông môn mà linh hồn `soulKey` đang ở, hoặc `null`. */
  findBySoul(soulKey: string): Promise<Sect | null>;
  /**
   * Tạo tông môn mới và lưu. Ném `SectConflictError` nếu id / tên / biệt hiệu đã có hoặc một thành viên đã ở tông môn khác
   * (kể cả khi hai lần `create` đua nhau: đúng MỘT lần thắng). Ném lỗi thường nếu `sect` sai bất biến (lỗi của người gọi).
   */
  create(sect: Sect): Promise<Sect>;
  /**
   * Đọc - sửa - ghi **nguyên tử** theo từng tông môn: các lần cùng lúc chạy lần lượt, không mất lần nào. `fn` phải thuần (không
   * I/O) và nhận một BẢN SAO; ném lỗi thì không ghi gì và lỗi đi tới người gọi. Trả `null` nếu tông môn không (còn) tồn tại.
   * Kết quả của `fn` được kiểm bất biến và tính duy nhất như `create` (`id` và `v` giữ nguyên; `updatedAt` do kho đặt);
   * `coin` ngoài 0..`SECT_COIN_CAP` hoặc tên / biệt hiệu chưa chuẩn hoá là lỗi (KHÔNG im lặng kẹp: tiền không được biến mất).
   */
  update(id: string, fn: (s: Sect) => Sect): Promise<Sect | null>;
  /**
   * Xoá tông môn (và chỉ mục thành viên). `false` nếu không có. `guard` (thuần, nhận BẢN SAO bản ghi hiện tại) chạy NGUYÊN TỬ
   * với việc xoá, trong cùng phần độc quyền với `update`: ném lỗi thì không xoá gì và lỗi đi tới người gọi. Dùng để "chỉ giải
   * tán khi kho đã rỗng" mà không có khoảng hở để một lần góp chen vào giữa kiểm và xoá (Linh thạch sẽ biến mất).
   */
  delete(id: string, guard?: (s: Sect) => void): Promise<boolean>;
}

// ---------- Làm sạch ----------

/** Id tông môn: an toàn làm tên tệp / khoá (uuid do server sinh). */
export const isSectId = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);

export const newSectId = () => randomUUID();

const SOUL_KEY_MAX = 200;
/** Trần chặn mảng khổng lồ do dữ liệu hỏng; KHÔNG phải trần nghiệp vụ (`SECT_MAX_MEMBERS` đổi theo thời gian, không làm hỏng dữ liệu cũ). */
const SANE_MEMBERS = 500;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Số nguyên không âm hữu hạn trong `[0, max]`; ngoài khoảng thì kẹp, không phải số thì `fallback`. */
function intIn(v: unknown, max: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(0, Math.floor(v)));
}

const LOG_KINDS: readonly SectLogKind[] = ["deposit", "withdraw"];

function sanitizeLog(raw: unknown): SectLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SectLogEntry[] = [];
  for (const e of raw) {
    if (out.length >= SECT_LOG_MAX) break;
    if (!isRecord(e)) continue;
    const name = cleanName(e.name);
    const kind = LOG_KINDS.find((k) => k === e.kind);
    const amount = e.amount;
    if (name === null || !kind) continue;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 1) continue;
    out.push({ at: intIn(e.at, Number.MAX_SAFE_INTEGER, 0), name, kind, amount });
  }
  return out;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Trần chặn số lượt rút đếm hỏng; KHÔNG phải trần nghiệp vụ (hạn mức là `drawPerDay`). */
const SANE_DRAWS = 1_000_000;

function sanitizeDraw(raw: unknown): { day: string; n: number } | undefined {
  if (!isRecord(raw) || typeof raw.day !== "string" || !DAY_RE.test(raw.day)) return undefined;
  return { day: raw.day, n: intIn(raw.n, SANE_DRAWS, 0) };
}

function sanitizeVaultLog(raw: unknown): SectVaultLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SectVaultLogEntry[] = [];
  for (const e of raw) {
    if (out.length >= SECT_VAULT_LOG_MAX) break;
    if (!isRecord(e)) continue;
    const name = cleanName(e.name);
    const kind = LOG_KINDS.find((k) => k === e.kind);
    const def = byId(ITEM_BY_ID, e.itemId);
    const qty = e.qty;
    if (name === null || !kind || !def) continue;
    if (typeof qty !== "number" || !Number.isSafeInteger(qty) || qty < 1) continue;
    out.push({ at: intIn(e.at, Number.MAX_SAFE_INTEGER, 0), name, kind, itemId: def.id, qty });
  }
  return out;
}

/**
 * Làm sạch kho đồ đọc từ tệp / DB: đúng `SECT_VAULT_SLOTS` ô; món không còn tồn tại bị bỏ (ô thành trống), `qty` ép về [1, stack]; `drawPerDay`
 * kẹp 0..`SECT_VAULT_DRAW_MAX` (thiếu / hỏng thì mặc định); sổ hỏng thì bỏ từng mục. Thiếu cả kho (bản ghi trước mục 27) thì kho rỗng.
 */
export function sanitizeVault(raw: unknown): SectVault {
  const v = emptySectVault();
  if (!isRecord(raw)) return v;
  if (Array.isArray(raw.slots)) {
    for (let i = 0; i < SECT_VAULT_SLOTS; i++) {
      const sl = raw.slots[i];
      if (!isRecord(sl)) continue;
      const def = byId(ITEM_BY_ID, sl.itemId);
      const qty = Math.floor(Number(sl.qty));
      if (def && qty >= 1) v.slots[i] = { itemId: def.id, qty: Math.min(qty, def.stack) };
    }
  }
  v.log = sanitizeVaultLog(raw.log);
  v.drawPerDay = intIn(raw.drawPerDay, SECT_VAULT_DRAW_MAX, SECT_VAULT_DRAW_DEFAULT);
  return v;
}

/** Hai kho đồ giống nhau về NỘI DUNG (ô và hạn mức; sổ chỉ để xem nên không so)? Dùng để từ chối ghi kho sai thay vì im lặng sửa (đồ không được biến mất). */
function sameVaultContent(a: SectVault, b: SectVault): boolean {
  if (a.drawPerDay !== b.drawPerDay || a.slots.length !== b.slots.length) return false;
  for (let i = 0; i < a.slots.length; i++) {
    const x = a.slots[i];
    const y = b.slots[i];
    if (x === null || y === null || x === undefined || y === undefined) {
      if ((x ?? null) !== (y ?? null)) return false;
    } else if (x.itemId !== y.itemId || x.qty !== y.qty) return false;
  }
  return true;
}

/**
 * Làm sạch bản ghi đọc từ tệp / DB (không tin dữ liệu lưu): kiểu, độ dài, hạng, bất biến, số kẹp. Trả `null` nếu bản ghi
 * không cứu được (sai kiểu, thiếu / trùng thành viên, không đúng một Tông chủ hoặc `leader` lệch, tên / biệt hiệu sai luật).
 * Mục sổ kho hỏng thì bỏ riêng mục đó (sổ chỉ để xem). `coin` kẹp 0..`SECT_COIN_CAP`; mốc thời gian hỏng lấy `now`.
 */
export function sanitizeSect(raw: unknown, now: number = Date.now()): Sect | null {
  if (!isRecord(raw) || raw.v !== 1 || !isSectId(raw.id)) return null;
  const name = cleanSectName(raw.name);
  const tag = cleanSectTag(raw.tag);
  if (name === null || tag === null) return null;
  if (typeof raw.leader !== "string" || raw.leader.length < 1 || raw.leader.length > SOUL_KEY_MAX)
    return null;
  if (!Array.isArray(raw.members) || raw.members.length < 1 || raw.members.length > SANE_MEMBERS)
    return null;
  const members: SectMemberRecord[] = [];
  const seen = new Set<string>();
  let chief: string | null = null;
  for (const m of raw.members) {
    if (!isRecord(m)) return null;
    const soulKey = m.soulKey;
    if (typeof soulKey !== "string" || soulKey.length < 1 || soulKey.length > SOUL_KEY_MAX)
      return null;
    if (seen.has(soulKey)) return null;
    seen.add(soulKey);
    const mname = cleanName(m.name);
    const rank = SECT_RANKS.find((r) => r === m.rank);
    if (mname === null || !rank) return null;
    if (rank === "chu") {
      if (chief !== null) return null; // hai Tông chủ
      chief = soulKey;
    }
    const draw = sanitizeDraw(m.draw);
    members.push({
      soulKey,
      name: mname,
      rank,
      joinedAt: intIn(m.joinedAt, Number.MAX_SAFE_INTEGER, now),
      ...(draw ? { draw } : {}),
    });
  }
  if (chief === null || chief !== raw.leader) return null;
  return {
    v: 1,
    id: raw.id,
    name,
    tag,
    leader: chief,
    motd: cleanMotd(raw.motd) ?? "",
    members,
    coin: intIn(raw.coin, SECT_COIN_CAP, 0),
    log: sanitizeLog(raw.log),
    vault: sanitizeVault(raw.vault),
    createdAt: intIn(raw.createdAt, Number.MAX_SAFE_INTEGER, now),
    updatedAt: intIn(raw.updatedAt, Number.MAX_SAFE_INTEGER, now),
  };
}

/**
 * Kiểm bản ghi sắp GHI (kết quả của `create` / `fn` của `update`): phải sống sót qua `sanitizeSect` MÀ KHÔNG bị sửa ở các trường
 * quan trọng. Trả bản đã làm sạch. Ném lỗi (lỗi của người gọi, không phải dữ liệu hỏng) nếu không hợp lệ.
 */
export function assertWritableSect(next: Sect, now: number): Sect {
  const s = sanitizeSect(JSON.parse(JSON.stringify(next)), now);
  if (!s) throw new Error("Tông môn không hợp lệ (bất biến bị phá)");
  if (
    s.coin !== next.coin ||
    s.name !== next.name ||
    s.tag !== next.tag ||
    s.motd !== next.motd ||
    s.members.length !== next.members.length
  )
    throw new Error(
      "Tông môn không hợp lệ (số kho, tên, biệt hiệu hoặc thành viên chưa chuẩn hoá)",
    );
  // kho đồ: KHÔNG im lặng sửa (ô sai độ dài, món lạ, qty quá chồng, hạn mức ngoài khung): đồ không được biến mất âm thầm
  if (!sameVaultContent(s.vault, next.vault ?? emptySectVault()))
    throw new Error("Tông môn không hợp lệ (kho đồ chưa chuẩn hoá: ô, món, số lượng hoặc hạn mức)");
  for (let i = 0; i < s.members.length; i++) {
    const a = s.members[i].draw;
    const b = next.members[i].draw;
    if ((a?.day ?? null) !== (b?.day ?? null) || (a?.n ?? 0) !== (b?.n ?? 0))
      throw new Error("Tông môn không hợp lệ (lượt rút kho đồ của thành viên chưa chuẩn hoá)");
  }
  return s;
}

/** Thêm một mục sổ kho (đứng đầu), cắt còn `SECT_LOG_MAX`. Trả mảng mới. */
export function withLogEntry(log: readonly SectLogEntry[], entry: SectLogEntry): SectLogEntry[] {
  return [entry, ...log].slice(0, SECT_LOG_MAX);
}

/** Thêm một mục sổ kho đồ (đứng đầu), cắt còn `SECT_VAULT_LOG_MAX`. Trả mảng mới. */
export function withVaultLogEntry(
  log: readonly SectVaultLogEntry[],
  entry: SectVaultLogEntry,
): SectVaultLogEntry[] {
  return [entry, ...log].slice(0, SECT_VAULT_LOG_MAX);
}

// ---------- Bản file ----------

/**
 * Mỗi tông môn một tệp `<id>.json` (ghi tệp tạm rồi `rename`, như `soul.ts`) trong `sects/` của `DATA_DIR`: cùng volume và cùng
 * bản sao lưu với hồ sơ nhân vật; `kiem-save` chỉ đọc `*.json` cấp trên cùng nên không nhầm. Server một tiến trình, số tông
 * môn nhỏ: dựng chỉ mục trong bộ nhớ (tên, biệt hiệu, thành viên) lúc dùng lần đầu rồi giữ đồng bộ với mỗi lần ghi thành công.
 * MỌI thao tác xếp MỘT hàng chung (tính duy nhất xuyên tông môn cần tuần tự hoá toàn cục; khối lượng nhỏ).
 */
export class FileSectStore implements SectStore {
  private chain: Promise<unknown> = Promise.resolve();
  private loaded = false;
  private readonly byId = new Map<string, Sect>();
  private readonly bySoul = new Map<string, string>();
  private readonly byName = new Map<string, string>();
  private readonly byTag = new Map<string, string>();

  constructor(
    private readonly dir: string,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const next = this.chain.then(run, run);
    this.chain = next.then(
      () => {},
      () => {},
    );
    return next;
  }

  private fileOf(id: string) {
    return path.join(this.dir, `${id}.json`);
  }

  /** Cách ly (đổi tên, KHÔNG xoá) một tệp không dùng được để người vận hành khôi phục. */
  private async quarantine(file: string, why: string) {
    const moved = `${file}.hong-${Date.now()}-${randomBytes(3).toString("hex")}`;
    console.error(`[sect] tệp tông môn ${why}, đã cách ly: ${moved}`);
    await fs.rename(file, moved).catch(() => {});
  }

  private conflictOf(s: Sect): SectConflictError | null {
    const own = (id: string | undefined) => id === undefined || id === s.id;
    if (!own(this.byName.get(sectKey(s.name)))) return new SectConflictError("name_taken");
    if (!own(this.byTag.get(sectKey(s.tag)))) return new SectConflictError("tag_taken");
    for (const m of s.members)
      if (!own(this.bySoul.get(m.soulKey))) return new SectConflictError("member_taken", m.soulKey);
    return null;
  }

  private indexAdd(s: Sect) {
    this.byId.set(s.id, s);
    this.byName.set(sectKey(s.name), s.id);
    this.byTag.set(sectKey(s.tag), s.id);
    for (const m of s.members) this.bySoul.set(m.soulKey, s.id);
  }

  private indexRemove(s: Sect) {
    this.byId.delete(s.id);
    this.byName.delete(sectKey(s.name));
    this.byTag.delete(sectKey(s.tag));
    for (const m of s.members) this.bySoul.delete(m.soulKey);
  }

  /** Nạp mọi tệp một lần. Tệp hỏng, tên tệp lệch `id`, hoặc xung đột với tông môn đã nạp (cũ hơn thắng) bị cách ly. */
  private async load() {
    if (this.loaded) return;
    let files: string[];
    try {
      files = await fs.readdir(this.dir);
    } catch (e: any) {
      if (e?.code !== "ENOENT") throw e;
      files = [];
    }
    const found: { sect: Sect; file: string }[] = [];
    for (const f of files.filter((x) => x.endsWith(".json")).sort()) {
      const file = path.join(this.dir, f);
      let sect: Sect | null;
      try {
        sect = sanitizeSect(JSON.parse(await fs.readFile(file, "utf8")), this.clock());
      } catch {
        sect = null;
      }
      if (!sect || `${sect.id}.json` !== f) {
        await this.quarantine(file, "hỏng");
        continue;
      }
      found.push({ sect, file });
    }
    found.sort((a, b) => a.sect.createdAt - b.sect.createdAt || (a.sect.id < b.sect.id ? -1 : 1));
    for (const { sect, file } of found) {
      if (this.conflictOf(sect)) {
        await this.quarantine(file, "trùng tên / biệt hiệu / thành viên với tông môn khác");
        continue;
      }
      this.indexAdd(sect);
    }
    this.loaded = true;
  }

  private async write(s: Sect) {
    await fs.mkdir(this.dir, { recursive: true });
    const file = this.fileOf(s.id);
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(s, null, 1));
    await fs.rename(tmp, file);
  }

  all() {
    return this.enqueue(async () => {
      await this.load();
      return [...this.byId.values()].map((s) => structuredClone(s));
    });
  }

  get(id: string) {
    return this.enqueue(async () => {
      await this.load();
      const s = this.byId.get(id);
      return s ? structuredClone(s) : null;
    });
  }

  findBySoul(soulKey: string) {
    return this.enqueue(async () => {
      await this.load();
      const id = this.bySoul.get(soulKey);
      const s = id === undefined ? undefined : this.byId.get(id);
      return s ? structuredClone(s) : null;
    });
  }

  create(sect: Sect) {
    return this.enqueue(async () => {
      await this.load();
      const s = assertWritableSect({ ...sect, updatedAt: this.clock() }, this.clock());
      if (this.byId.has(s.id)) throw new SectConflictError("id_taken");
      const c = this.conflictOf(s);
      if (c) throw c;
      await this.write(s);
      this.indexAdd(s);
      return structuredClone(s);
    });
  }

  update(id: string, fn: (s: Sect) => Sect) {
    return this.enqueue(async () => {
      await this.load();
      const cur = this.byId.get(id);
      if (!cur) return null;
      const next = assertWritableSect(
        { ...fn(structuredClone(cur)), id, v: 1, updatedAt: this.clock() },
        this.clock(),
      );
      const c = this.conflictOf(next);
      if (c) throw c;
      await this.write(next);
      this.indexRemove(cur);
      this.indexAdd(next);
      return structuredClone(next);
    });
  }

  delete(id: string, guard?: (s: Sect) => void) {
    return this.enqueue(async () => {
      await this.load();
      const cur = this.byId.get(id);
      if (!cur) return false;
      guard?.(structuredClone(cur));
      await fs.unlink(this.fileOf(id)).catch((e: any) => {
        if (e?.code !== "ENOENT") throw e;
      });
      this.indexRemove(cur);
      return true;
    });
  }
}

/** Thư mục tông môn: `SECTS_DIR`, không có thì `<DATA_DIR>/sects`. */
export function sectsDir(): string {
  if (process.env.SECTS_DIR) return path.resolve(process.env.SECTS_DIR);
  return path.join(path.resolve(process.env.DATA_DIR ?? "data/players"), "sects");
}

let shared: SectStore | undefined;
/** Kho tông môn dùng chung của tiến trình (dựng lười như `defaultSoulStore`). */
export function defaultSectStore(): SectStore {
  return (shared ??= new FileSectStore(sectsDir()));
}
