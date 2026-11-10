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
  SECT_COIN_CAP,
  SECT_LOG_MAX,
  SECT_RANKS,
  cleanMotd,
  cleanName,
  cleanSectName,
  cleanSectTag,
  sectKey,
  type SectLogEntry,
  type SectLogKind,
  type SectRank,
} from "@tien-gioi/shared";

// ---------- Kiểu dữ liệu ----------

export interface SectMemberRecord {
  /** Khoá linh hồn (`Identity.soulKey`) */
  soulKey: string;
  /** Đạo hiệu lần cuối thấy (chỉ để hiển thị; khoá là `soulKey`) */
  name: string;
  rank: SectRank;
  /** ms epoch */
  joinedAt: number;
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
  /** Xoá tông môn (và chỉ mục thành viên). `false` nếu không có. */
  delete(id: string): Promise<boolean>;
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
    members.push({
      soulKey,
      name: mname,
      rank,
      joinedAt: intIn(m.joinedAt, Number.MAX_SAFE_INTEGER, now),
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
  return s;
}

/** Thêm một mục sổ kho (đứng đầu), cắt còn `SECT_LOG_MAX`. Trả mảng mới. */
export function withLogEntry(log: readonly SectLogEntry[], entry: SectLogEntry): SectLogEntry[] {
  return [entry, ...log].slice(0, SECT_LOG_MAX);
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

  delete(id: string) {
    return this.enqueue(async () => {
      await this.load();
      const cur = this.byId.get(id);
      if (!cur) return false;
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
