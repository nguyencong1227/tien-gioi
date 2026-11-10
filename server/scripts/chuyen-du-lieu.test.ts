// Chuyển dữ liệu tệp -> PostgreSQL: tệp do CHÍNH bộ ghi thật (savePlayer / FileSoulStore) tạo ra, đích là các kho Pg trên
// pg-mem. Kiểm: chuyển đúng, idempotent, chạy thử không ghi, --ghi-de, tệp hỏng được báo không chuyển, nguồn không bị đổi
// một byte, không in nội dung / mật khẩu, DB chết thì dừng.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { newDb } from "pg-mem";
import { newSoul } from "@tien-gioi/shared";
import type { Db } from "../src/pg/db";
import type { PlayerStore } from "../src/player-store";
import type { SoulStore } from "../src/soul";
import type { SavedPlayer } from "../src/store";

const src = mkdtempSync(path.join(tmpdir(), "tien-gioi-cdl-"));
process.env.DATA_DIR = src; // store.ts đọc biến này lúc nạp module
afterAll(() => rmSync(src, { recursive: true, force: true }));

let mod: typeof import("./chuyen-du-lieu");
let store: typeof import("../src/store");
let FileSoulStoreCls: typeof import("../src/soul").FileSoulStore;
let pgMod: {
  PgPlayerStore: typeof import("../src/pg/game-store").PgPlayerStore;
  PgSoulStore: typeof import("../src/pg/game-store").PgSoulStore;
  migrate: typeof import("../src/pg/migrate").migrate;
};

beforeAll(async () => {
  mod = await import("./chuyen-du-lieu");
  store = await import("../src/store");
  FileSoulStoreCls = (await import("../src/soul")).FileSoulStore;
  pgMod = {
    ...(await import("../src/pg/game-store")),
    ...(await import("../src/pg/migrate")),
  } as never;
  // Dữ liệu nguồn do bộ ghi THẬT tạo
  const at = "2026-01-01T00:00:00.000Z";
  const base = (name: string, over: Partial<SavedPlayer> = {}): SavedPlayer => ({
    name,
    secretHash: store.hashSecret(`bi-mat-${name}-0123456789`),
    realm: 1,
    tier: 2,
    exp: 120,
    coin: 55,
    createdAt: at,
    updatedAt: at,
    ...over,
  });
  await store.savePlayer(base("Lâm Thanh", { exp: 500 }));
  await store.savePlayer(base("Tô Mộc", { realm: 0, tier: 0, coin: 0 }));
  const souls = new FileSoulStoreCls(path.join(src, "souls"), () => at);
  await souls.create("lâm thanh", (s) => ({
    ...newSoul(s.id, at),
    kiep: 3,
    duyen: 17,
    duyenTotal: 40,
  }));
  await souls.create("tô mộc");
  // Tệp hỏng và lạ
  writeFileSync(path.join(src, "rac.json"), "{không phải json");
  writeFileSync(
    path.join(src, "sai-bam.json"),
    JSON.stringify(base("Sai Bam", { secretHash: "khong-phai-sha256" })),
  );
  writeFileSync(path.join(src, "x.json.tmp"), "{}");
  writeFileSync(path.join(src, "y.json.hong-123"), "{}");
  writeFileSync(path.join(src, "souls", "soul-rac.json"), "[1,2]");
  writeFileSync(
    path.join(src, "souls", "khong-id.json"),
    JSON.stringify({ v: 1, kiep: 2, duyen: 1 }),
  );
  writeFileSync(path.join(src, "to.json"), "x".repeat(1024 * 1024 + 10));
  symlinkSync("/etc/hostname", path.join(src, "lien-ket.json"));
});

async function memStores(): Promise<{ players: PlayerStore; souls: SoulStore }> {
  const { Pool } = newDb().adapters.createPg();
  const db = new Pool() as unknown as Db;
  await pgMod.migrate(db);
  return {
    players: new pgMod.PgPlayerStore(db),
    souls: new pgMod.PgSoulStore(db, () => "2026-11-10T00:00:00.000Z"),
  };
}
/** Băm toàn bộ thư mục nguồn (tên + nội dung, cả thư mục con) để chứng minh không bị đổi. */
function fingerprint(dir: string): string {
  const h = createHash("sha256");
  const walk = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const p = path.join(d, f.name);
      h.update(p.slice(src.length));
      if (f.isDirectory()) walk(p);
      else if (f.isFile()) h.update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest("hex");
}
const opts = (over = {}) => ({ dir: src, thu: false, ghiDe: false, ...over });

describe("chạy thử (--thu)", () => {
  it("không có DB: đếm tệp hợp lệ / hỏng, mã lỗi đúng, không ghi gì, nguồn không đổi", async () => {
    const before = fingerprint(src);
    const r = await mod.migrateData(opts({ thu: true }), null);
    expect(r.players).toMatchObject({
      found: 6,
      invalid: 4,
      toMigrate: 2,
      migrated: 0,
      existing: 0,
    });
    expect(r.souls).toMatchObject({ found: 4, invalid: 2, toMigrate: 2, migrated: 0 });
    const codes = Object.fromEntries(r.errors.map((e) => [e.file, e.code]));
    expect(codes["rac.json"]).toBe("invalid_json");
    expect(codes["sai-bam.json"]).toBe("invalid_secret_hash");
    expect(codes["to.json"]).toBe("file_too_large");
    expect(codes["lien-ket.json"]).toBe("not_regular_file");
    expect(codes["souls/soul-rac.json"]).toBeTruthy();
    expect(codes["souls/khong-id.json"]).toBe("invalid_soul_id");
    expect(r.errors.map((e) => e.file)).not.toContain("x.json.tmp");
    expect(fingerprint(src)).toBe(before);
  });

  it("có DB: không ghi gì dù thấy cái cần chuyển; cái đã có thì tính là 'đã có'", async () => {
    const t = await memStores();
    await t.players.save({
      name: "Tô Mộc",
      secretHash: "a".repeat(64),
      realm: 0,
      tier: 0,
      exp: 1,
      createdAt: "t",
      updatedAt: "t",
    });
    const r = await mod.migrateData(opts({ thu: true }), t);
    expect(r.players).toMatchObject({ existing: 1, toMigrate: 1, migrated: 0 });
    expect(await t.players.load("Lâm Thanh")).toBeNull();
    expect((await t.players.load("Tô Mộc"))?.exp).toBe(1);
  });
});

describe("chuyển thật", () => {
  it("nhân vật và chân linh sang DB đúng nội dung; tệp hỏng báo mà không chuyển; nguồn không đổi một byte; chạy lại không nhân đôi", async () => {
    const t = await memStores();
    const before = fingerprint(src);
    const r = await mod.migrateData(opts(), t);
    expect(r.players).toMatchObject({ toMigrate: 2, migrated: 2, failed: 0, existing: 0 });
    expect(r.souls).toMatchObject({ toMigrate: 2, migrated: 2, failed: 0 });
    const a = (await t.players.load("lâm thanh"))!;
    expect([a.name, a.realm, a.tier, a.exp, a.coin]).toEqual(["Lâm Thanh", 1, 2, 500, 55]);
    expect(a.secretHash).toBe(store.hashSecret("bi-mat-Lâm Thanh-0123456789"));
    expect(await t.players.load("Sai Bam")).toBeNull();
    const soul = (await t.souls.get("lâm thanh"))!;
    expect([soul.id, soul.kiep, soul.duyen, soul.duyenTotal]).toEqual(["lâm thanh", 3, 17, 40]);
    expect(fingerprint(src)).toBe(before);
    // chạy lại: tất cả đã có, không ghi thêm
    const again = await mod.migrateData(opts(), t);
    expect(again.players).toMatchObject({ existing: 2, toMigrate: 0, migrated: 0 });
    expect(again.souls).toMatchObject({ existing: 2, toMigrate: 0, migrated: 0 });
    expect((await t.souls.get("lâm thanh"))?.duyen).toBe(17);
  });

  it("DB đã có bản mới hơn: mặc định KHÔNG ghi đè; --ghi-de thì ghi đè", async () => {
    const t = await memStores();
    await t.players.save({
      name: "Lâm Thanh",
      secretHash: "b".repeat(64),
      realm: 2,
      tier: 0,
      exp: 9999,
      createdAt: "t",
      updatedAt: "t",
    });
    await t.souls.create("lâm thanh", (s) => ({ ...s, duyen: 777 }));
    await mod.migrateData(opts(), t);
    expect((await t.players.load("Lâm Thanh"))?.exp).toBe(9999);
    expect((await t.souls.get("lâm thanh"))?.duyen).toBe(777);
    const r = await mod.migrateData(opts({ ghiDe: true }), t);
    expect(r.players.migrated).toBe(2);
    expect((await t.players.load("Lâm Thanh"))?.exp).toBe(500);
    expect((await t.souls.get("lâm thanh"))?.duyen).toBe(17);
  });

  it("ghi lỗi (DB): đếm failed, mã chỉ có tên lỗi (không lộ thông báo / mật khẩu), 20 lỗi liên tiếp thì dừng", async () => {
    const boom = (): never => {
      throw new Error("lỗi kết nối postgres://nguoi:bi-mat-xyz@may-chu/db");
    };
    const dead = {
      players: { load: async () => null, save: async () => boom() } as PlayerStore,
      souls: {
        get: async () => null,
        create: async () => boom(),
        update: async () => boom(),
      } as unknown as SoulStore,
    };
    const r = await mod.migrateData(opts(), dead);
    expect(r.players).toMatchObject({ toMigrate: 2, migrated: 0, failed: 2 });
    expect(r.souls).toMatchObject({ migrated: 0, failed: 2 });
    expect(JSON.stringify(r)).not.toContain("bi-mat-xyz");
    expect(r.errors.find((e) => e.code.startsWith("ghi_loi"))?.code).toBe("ghi_loi:Error");
    // quá 20 lỗi liên tiếp: dừng
    const many = mkdtempSync(path.join(tmpdir(), "tien-gioi-cdl-many-"));
    try {
      for (let i = 0; i < 25; i++)
        writeFileSync(
          path.join(many, `${i}.json`),
          JSON.stringify({
            name: `Nguoi ${i}`,
            secretHash: "c".repeat(64),
            realm: 0,
            tier: 0,
            exp: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
        );
      await expect(mod.migrateData({ dir: many, thu: false, ghiDe: false }, dead)).rejects.toThrow(
        /Quá nhiều lỗi/,
      );
    } finally {
      rmSync(many, { recursive: true, force: true });
    }
  });
});

describe("báo cáo và tham số", () => {
  it("báo cáo không chứa nội dung tệp, băm hay tên nhân vật; có lời nhắc tài khoản không được chuyển", async () => {
    const r = await mod.migrateData(opts({ thu: true }), null);
    const text = mod.formatReport(r, true).join("\n");
    expect(text).toContain("CHẠY THỬ");
    expect(text).toContain("rac.json: invalid_json");
    for (const s of [
      store.hashSecret("bi-mat-Lâm Thanh-0123456789"),
      "Lâm Thanh",
      "Tô Mộc",
      "khong-phai-sha256",
    ])
      expect(text).not.toContain(s);
    expect(text).toContain("Tài khoản không được chuyển");
  });

  it("parseArgs: --thu, --ghi-de, --dir; tham số lạ và --thu cùng --ghi-de bị từ chối", () => {
    expect(mod.parseArgs([])).toEqual({ dir: undefined, thu: false, ghiDe: false });
    expect(mod.parseArgs(["--thu", "--dir=/x"])).toEqual({ dir: "/x", thu: true, ghiDe: false });
    expect(mod.parseArgs(["--ghi-de"])).toMatchObject({ ghiDe: true });
    expect(() => mod.parseArgs(["--xoa"])).toThrow(/Tham số lạ/);
    expect(() => mod.parseArgs(["--thu", "--ghi-de"])).toThrow();
  });

  it("thư mục nguồn không có souls/ hoặc rỗng: không lỗi", async () => {
    const empty = mkdtempSync(path.join(tmpdir(), "tien-gioi-cdl-empty-"));
    try {
      mkdirSync(path.join(empty, "x"));
      const r = await mod.migrateData({ dir: empty, thu: true, ghiDe: false }, null);
      expect([r.players.found, r.souls.found, r.errors.length]).toEqual([0, 0, 0]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
