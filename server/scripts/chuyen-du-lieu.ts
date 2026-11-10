// Chuyển dữ liệu từ tệp JSON sang PostgreSQL (M3 bước 3e-3, docs/THIET_KE_TAI_KHOAN.md mục 7): nhân vật (`<DATA_DIR>/*.json`),
// chân linh (`<DATA_DIR>/souls/*.json`) và tông môn (`<DATA_DIR>/sects/*.json`, M3.6 bước 6b) cũ -> kho của `STORE=pg`.
//
//   npm run chuyen-du-lieu -w server -- --thu                 (chạy thử: chỉ đếm và báo lỗi, không ghi gì)
//   STORE=pg DATABASE_URL=postgres://... npm run chuyen-du-lieu -w server
//   ... --ghi-de   (ghi đè nhân vật / chân linh ĐÃ CÓ trong DB; mặc định bỏ qua)
//   ... --dir=<thư mục>   (mặc định DATA_DIR, rồi data/players)
//
// An toàn: **không bao giờ xoá hay sửa tệp nguồn**; idempotent (chạy lại không nhân đôi: cái đã có trong DB bị bỏ qua); chỉ
// chuyển tệp qua đúng bộ kiểm của `kiem-save` (tệp hỏng được báo, không chuyển); không in nội dung tệp (chỉ tên tệp + mã lỗi).
// TÀI KHOẢN KHÔNG được chuyển: giao diện kho tạo id mới cho tài khoản nên không giữ được id (mà chân linh của tài khoản khoá
// theo id); nhân vật cũ (tên + mã bí mật) sẽ do người chơi nhận về tài khoản mới bằng "Tôi đã có nhân vật cũ".
// Mã thoát: 0 xong; 1 sai cách dùng / cấu hình; 3 có tệp hỏng hoặc ghi lỗi (phần còn lại vẫn được chuyển).
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeSoul } from "@tien-gioi/shared";
import type { PlayerStore } from "../src/player-store.js";
import { sanitizeSect, type SectStore } from "../src/sect-store.js";
import type { SoulStore } from "../src/soul.js";
import type { SavedPlayer } from "../src/store.js";
import { createStores, storeKindOf } from "../src/stores.js";
import {
  MAX_FILES_COUNT,
  MAX_FILE_SIZE,
  auditPlayerSaveData,
  auditSoulSaveData,
} from "./audit-saves.js";

export interface MigrateOptions {
  /** Thư mục nhân vật (chân linh ở `souls/`, tông môn ở `sects/` bên trong) */
  dir: string;
  /** Chạy thử: không ghi gì */
  thu: boolean;
  /** Ghi đè cái đã có trong DB */
  ghiDe: boolean;
}

export interface MigrateTarget {
  players: PlayerStore;
  souls: SoulStore;
  sects: SectStore;
}

export interface Counts {
  /** Số tệp `.json` thường tìm thấy */
  found: number;
  /** Tệp hỏng / sai dạng (không chuyển) */
  invalid: number;
  /** Đã có trong DB và không `--ghi-de` (bỏ qua) */
  existing: number;
  /** Sẽ được ghi (chạy thử) hoặc đã được ghi (chạy thật) */
  toMigrate: number;
  /** Đã ghi thật vào DB */
  migrated: number;
  /** Ghi lỗi (DB) */
  failed: number;
}

export interface MigrateReport {
  players: Counts;
  souls: Counts;
  sects: Counts;
  /** Tên tệp + mã lỗi (không có nội dung) */
  errors: { file: string; code: string }[];
}

const zero = (): Counts => ({
  found: 0,
  invalid: 0,
  existing: 0,
  toMigrate: 0,
  migrated: 0,
  failed: 0,
});
/** Quá nhiều lần ghi lỗi liên tiếp (DB chết): dừng thay vì chạy hết thư mục. */
const MAX_FAILURES = 20;

function listJson(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir).filter(
    (f) => f.endsWith(".json") && !f.includes(".hong-") && !f.endsWith(".tmp"),
  );
  if (names.length > MAX_FILES_COUNT)
    throw new Error(`Thư mục có quá nhiều tệp (${names.length} > ${MAX_FILES_COUNT}).`);
  return names.sort();
}

/** Đọc một tệp thường (không symlink / thư mục), kích thước tối đa như `kiem-save`; `null` + mã lỗi nếu không đọc được. */
function readRegular(file: string): { text: string; size: number } | { code: string } {
  try {
    const st = lstatSync(file);
    if (!st.isFile()) return { code: "not_regular_file" };
    if (st.size > MAX_FILE_SIZE) return { code: "file_too_large" };
    return { text: readFileSync(file, "utf8"), size: st.size };
  } catch {
    return { code: "read_error" };
  }
}

const errName = (e: unknown) => (e instanceof Error ? e.name : "Error");

/**
 * Chuyển nhân vật, chân linh và tông môn. `target = null` (chỉ khi `thu`): không có DB để so, mọi tệp hợp lệ tính là "sẽ chuyển".
 * Không bao giờ ghi vào thư mục nguồn.
 */
export async function migrateData(
  opts: MigrateOptions,
  target: MigrateTarget | null,
): Promise<MigrateReport> {
  const report: MigrateReport = { players: zero(), souls: zero(), sects: zero(), errors: [] };
  const write = !opts.thu && target !== null;
  let failures = 0;
  const guard = async (c: Counts, file: string, fn: () => Promise<void>) => {
    try {
      await fn();
      failures = 0;
    } catch (e) {
      c.failed++;
      report.errors.push({ file, code: `ghi_loi:${errName(e)}` });
      if (++failures >= MAX_FAILURES)
        // Cố ý KHÔNG gắn `cause`: lỗi gốc của driver DB có thể chứa chuỗi kết nối (mật khẩu)
        // eslint-disable-next-line preserve-caught-error
        throw new Error("Quá nhiều lỗi ghi liên tiếp: dừng (kiểm tra kết nối DB).");
    }
  };

  for (const f of listJson(opts.dir)) {
    const c = report.players;
    c.found++;
    const r = readRegular(path.join(opts.dir, f));
    const errs = "text" in r ? auditPlayerSaveData(r.text, r.size) : [{ code: r.code }];
    if (errs.length > 0 || !("text" in r)) {
      c.invalid++;
      report.errors.push({ file: f, code: errs[0]?.code ?? "invalid" });
      continue;
    }
    const player = JSON.parse(r.text) as SavedPlayer;
    if (target && !opts.ghiDe && (await target.players.load(player.name))) {
      c.existing++;
      continue;
    }
    c.toMigrate++;
    if (write)
      await guard(c, f, async () => {
        await target.players.save(player);
        c.migrated++;
      });
  }

  const soulsDir = path.join(opts.dir, "souls");
  for (const f of listJson(soulsDir)) {
    const c = report.souls;
    c.found++;
    const file = `souls/${f}`;
    const r = readRegular(path.join(soulsDir, f));
    const errs = "text" in r ? auditSoulSaveData(r.text, r.size) : [{ code: r.code }];
    const soul = "text" in r && errs.length === 0 ? sanitizeSoul(JSON.parse(r.text), "") : null;
    if (errs.length > 0 || !soul) {
      c.invalid++;
      report.errors.push({ file, code: errs[0]?.code ?? "invalid" });
      continue;
    }
    const exists = target ? await target.souls.get(soul.id) : null;
    if (exists && !opts.ghiDe) {
      c.existing++;
      continue;
    }
    c.toMigrate++;
    if (write)
      await guard(c, file, async () => {
        if (exists) await target.souls.update(soul.id, () => soul);
        else await target.souls.create(soul.id, () => soul);
        c.migrated++;
      });
  }

  // Tông môn: tệp `<id>.json` đúng bộ làm sạch của kho (`sanitizeSect`) và tên tệp khớp `id`; trùng tên / biệt hiệu / thành
  // viên với tông môn đã có trong DB thì kho từ chối (đếm vào `failed`, mã chỉ có tên lỗi), không chuyển dở.
  const sectsDir = path.join(opts.dir, "sects");
  for (const f of listJson(sectsDir)) {
    const c = report.sects;
    c.found++;
    const file = `sects/${f}`;
    const r = readRegular(path.join(sectsDir, f));
    let sect = null as ReturnType<typeof sanitizeSect>;
    if ("text" in r) {
      try {
        sect = sanitizeSect(JSON.parse(r.text));
      } catch {
        sect = null;
      }
    }
    if (!sect || `${sect.id}.json` !== f) {
      c.invalid++;
      report.errors.push({ file, code: "text" in r ? "sect_invalid" : r.code });
      continue;
    }
    const exists = target ? await target.sects.get(sect.id) : null;
    if (exists && !opts.ghiDe) {
      c.existing++;
      continue;
    }
    c.toMigrate++;
    const sectData = sect;
    if (write)
      await guard(c, file, async () => {
        if (exists) await target.sects.update(sectData.id, () => sectData);
        else await target.sects.create(sectData);
        c.migrated++;
      });
  }
  return report;
}

export function formatReport(r: MigrateReport, thu: boolean): string[] {
  const row = (label: string, c: Counts) =>
    `  ${label}: tìm thấy ${c.found}, hỏng ${c.invalid}, đã có trong DB ${c.existing}, ${thu ? "sẽ chuyển" : "cần chuyển"} ${c.toMigrate}` +
    (thu ? "" : `, ĐÃ chuyển ${c.migrated}, ghi lỗi ${c.failed}`);
  const lines = [
    thu ? "=== CHẠY THỬ (không ghi gì) ===" : "=== KẾT QUẢ CHUYỂN DỮ LIỆU ===",
    row("Nhân vật", r.players),
    row("Chân linh", r.souls),
    row("Tông môn", r.sects),
  ];
  for (const e of r.errors.slice(0, 50)) lines.push(`  ! ${e.file}: ${e.code}`);
  if (r.errors.length > 50) lines.push(`  ... và ${r.errors.length - 50} lỗi nữa`);
  lines.push(
    "Không có tệp nguồn nào bị xoá hay sửa. Tài khoản không được chuyển (nhân vật cũ nhận bằng mã bí mật).",
  );
  return lines;
}

export function parseArgs(argv: string[]): { dir?: string; thu: boolean; ghiDe: boolean } {
  let dir: string | undefined;
  let thu = false;
  let ghiDe = false;
  for (const a of argv) {
    if (a === "--thu") thu = true;
    else if (a === "--ghi-de") ghiDe = true;
    else if (a.startsWith("--dir=")) dir = a.slice(6);
    else throw new Error(`Tham số lạ: ${a}`);
  }
  if (thu && ghiDe)
    throw new Error("--thu và --ghi-de không đi cùng nhau (chạy thử không ghi gì).");
  return { dir, thu, ghiDe };
}

async function main(): Promise<number> {
  const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`Lỗi tham số: ${e instanceof Error ? e.message : String(e)}`);
    console.error(
      "Cách dùng: npm run chuyen-du-lieu -w server -- [--thu] [--ghi-de] [--dir=<thư mục>]",
    );
    return 1;
  }
  const dir = path.resolve(args.dir ?? process.env.DATA_DIR ?? "data/players");
  if (!existsSync(dir)) {
    console.error(`Không có thư mục nguồn: ${dir}`);
    return 1;
  }
  const toPg = storeKindOf(process.env) === "pg";
  if (!toPg && !args.thu) {
    console.error(
      "Đích là PostgreSQL: đặt STORE=pg và DATABASE_URL (hoặc dùng --thu để chỉ chạy thử).",
    );
    return 1;
  }
  let stores: Awaited<ReturnType<typeof createStores>> | undefined;
  try {
    console.log(`Nguồn: ${dir}`);
    stores = toPg ? await createStores(process.env) : undefined;
    const report = await migrateData(
      { dir, thu: args.thu, ghiDe: args.ghiDe },
      stores ? { players: stores.players, souls: stores.souls, sects: stores.sects } : null,
    );
    for (const line of formatReport(report, args.thu)) console.log(line);
    const bad =
      report.players.invalid +
      report.souls.invalid +
      report.sects.invalid +
      report.players.failed +
      report.souls.failed +
      report.sects.failed;
    return bad > 0 ? 3 : 0;
  } catch (e) {
    // Chỉ thông báo do ta viết hoặc tên lỗi: thông báo của driver DB có thể chứa chuỗi kết nối
    console.error(`Không chuyển được: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  } finally {
    await stores?.close().catch(() => {});
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main().then((code) => process.exit(code));
}
