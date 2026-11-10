// Kho PostgreSQL (M3 bước 3e): chạy CÙNG bộ ca hợp đồng (`store-contract.ts`) với File* trên `pg-mem` (luôn chạy, không cần
// dịch vụ ngoài) và trên PostgreSQL THẬT khi có `TEST_DATABASE_URL` (job CI có `services: postgres`; máy dev không cần).
// `pg-mem` KHÔNG mô phỏng đúng khoá hàng / ROLLBACK, nên các ca về giao dịch và khoá chỉ chạy trên Postgres thật.
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { newDb } from "pg-mem";
import { newSoul } from "@tien-gioi/shared";
import { PgAccountStore, PgSessionStore } from "./account-store";
import { createPool, isUniqueViolation, tx, type Db } from "./db";
import { PgPlayerStore, PgSoulStore } from "./game-store";
import { MIGRATIONS_DIR, migrate, splitStatements } from "./migrate";
import { KeyedQueue } from "./queue";
import {
  describeAccountStoreContract,
  describePlayerStoreContract,
  describeSessionStoreContract,
  describeSoulStoreContract,
  makeSavedPlayer,
} from "../store-contract";

const REAL_URL = process.env.TEST_DATABASE_URL;
const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-pg-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Một DB pg-mem mới đã migrate. */
async function memDb(): Promise<Db> {
  const { Pool } = newDb().adapters.createPg();
  const pool = new Pool() as unknown as Db;
  await migrate(pool);
  return pool;
}

let realPool: (Db & { end(): Promise<void> }) | undefined;
/** Postgres thật: migrate một lần, mỗi lần gọi dọn sạch bảng để mỗi ca bắt đầu từ kho trống. */
async function realDb(): Promise<Db> {
  realPool ??= await createPool(REAL_URL!);
  await migrate(realPool);
  await realPool.query("TRUNCATE accounts, sessions, characters, souls");
  return realPool;
}
afterAll(async () => {
  await realPool?.end();
});

const backends: [string, () => Promise<Db>][] = [["pg-mem", memDb]];
if (REAL_URL) backends.push(["PostgreSQL thật", realDb]);

const CLOCK = () => "2026-11-10T00:00:00.000Z";
for (const [label, dbOf] of backends) {
  describePlayerStoreContract(
    `PgPlayerStore (${label})`,
    async () => new PgPlayerStore(await dbOf()),
  );
  describeSoulStoreContract(
    `PgSoulStore (${label})`,
    async () => new PgSoulStore(await dbOf(), CLOCK),
  );
  describeAccountStoreContract(
    `PgAccountStore (${label})`,
    async () => new PgAccountStore(await dbOf()),
  );
  describeSessionStoreContract(
    `PgSessionStore (${label})`,
    async () => new PgSessionStore(await dbOf()),
  );
}

const acc = (username: string) => ({
  username,
  passHash: "scrypt$1024$8$1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2g",
  recoveryHash: "scrypt$1024$8$1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2g",
  createdAt: "2026-11-10T00:00:00.123Z",
  lastLoginAt: "2026-11-10T01:02:03.456Z",
  disabled: false,
});

describe("Pg*Store: riêng của Postgres", () => {
  it("tên đăng nhập / đạo hiệu duy nhất do RÀNG BUỘC CỦA DB đảm bảo: hai bản `PgAccountStore` (hai hàng đợi) tranh nhau, vẫn đúng một bên thắng", async () => {
    const db = await memDb();
    const [a, b] = [new PgAccountStore(db), new PgAccountStore(db)];
    const rs = await Promise.all(
      Array.from({ length: 30 }, (_, i) => (i % 2 ? a : b).create(acc("dua_ten"))),
    );
    expect(rs.filter((r) => r !== null)).toHaveLength(1);
    const x = (await a.create(acc("nguoi_x")))!;
    const y = (await a.create(acc("nguoi_y")))!;
    const names = await Promise.all([a.setName(x.id, "Lâm Thanh"), b.setName(y.id, "LÂM THANH")]);
    expect(names.sort()).toEqual(["name_taken", "ok"]);
  });

  it("thời gian khứ hồi nguyên vẹn (kể cả mili giây); tên đăng nhập chưa chuẩn hoá và thời gian hỏng bị từ chối, không ghi", async () => {
    const s = new PgAccountStore(await memDb());
    const a = (await s.create(acc("lam_thanh")))!;
    const back = (await s.byId(a.id))!;
    expect([back.createdAt, back.lastLoginAt]).toEqual([
      "2026-11-10T00:00:00.123Z",
      "2026-11-10T01:02:03.456Z",
    ]);
    expect(await s.update(a.id, { lastLoginAt: "2026-12-01T00:00:00.000Z" })).toMatchObject({
      lastLoginAt: "2026-12-01T00:00:00.000Z",
    });
    await expect(s.create(acc("Lam_Thanh"))).rejects.toThrow();
    await expect(s.create({ ...acc("ten_la"), createdAt: "không phải ngày" })).rejects.toThrow();
    expect(await s.byUsername("ten_la")).toBeNull();
    expect((await s.all()).map((x) => x.username)).toEqual(["lam_thanh"]);
  });

  it("all: cùng thứ tự với bản file (ngày tạo, rồi tên đăng nhập)", async () => {
    const s = new PgAccountStore(await memDb());
    await s.create({ ...acc("nguoi_c"), createdAt: "2026-11-12T00:00:00.000Z" });
    await s.create({ ...acc("nguoi_b"), createdAt: "2026-11-10T00:00:00.000Z" });
    await s.create({ ...acc("nguoi_a"), createdAt: "2026-11-10T00:00:00.000Z" });
    expect((await s.all()).map((x) => x.username)).toEqual(["nguoi_a", "nguoi_b", "nguoi_c"]);
  });

  it("phiên: ghi đè token trùng; `update` / `setName` trên id không có trả null / not_found", async () => {
    const db = await memDb();
    const sessions = new PgSessionStore(db);
    const base = {
      tokenHash: "a".repeat(64),
      accountId: "11111111-1111-1111-1111-111111111111",
      createdAt: 1,
      expiresAt: 5,
      lastSeenAt: 1,
    };
    await sessions.create(base);
    await sessions.create({ ...base, expiresAt: 9 });
    expect((await sessions.get(base.tokenHash))?.expiresAt).toBe(9);
    expect(await sessions.deleteAllOf(base.accountId)).toBe(1);
    const accounts = new PgAccountStore(db);
    expect(await accounts.update("khong-co-id", { disabled: true })).toBeNull();
    expect(await accounts.setName("khong-co-id", "Ai Do")).toBe("not_found");
    await expect(sessions.create({ ...base, tokenHash: "../x" })).rejects.toThrow();
    await expect(sessions.touch(base.tokenHash, Number.NaN, 5)).rejects.toThrow();
  });

  it("nhân vật: khi đang ghi liên tục KHÔNG có khoảnh khắc nào `load` thấy 'chưa có' (nếu thấy, WorldRoom sẽ tạo nhân vật mới đè lên)", async () => {
    const s = new PgPlayerStore(await memDb());
    await s.save(makeSavedPlayer("Khong Bien Mat", { exp: 0 }));
    const missing: number[] = [];
    const saves = Array.from({ length: 60 }, (_, i) =>
      s.save(makeSavedPlayer("Khong Bien Mat", { exp: i + 1 })),
    );
    const loads = Array.from({ length: 300 }, async (_, i) => {
      if (i % 7 === 0) await Promise.resolve();
      if ((await s.load("Khong Bien Mat")) === null) missing.push(i);
    });
    await Promise.all([...saves, ...loads]);
    expect(missing).toEqual([]);
    expect((await s.load("Khong Bien Mat"))?.exp).toBe(60);
  });

  it("nhân vật: dữ liệu lưu là JSON đầy đủ, updatedAt do kho đặt mới; tên khứ hồi theo NFC không phân biệt hoa thường", async () => {
    const s = new PgPlayerStore(await memDb());
    await s.save(makeSavedPlayer("Lâm Thanh", { coin: 77, updatedAt: "2020-01-01T00:00:00.000Z" }));
    const back = (await s.load("LÂM THANH".normalize("NFD")))!;
    expect([back.name, back.coin]).toEqual(["Lâm Thanh", 77]);
    expect(back.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("chân linh: `create` đua giữa hai kho (hai hàng đợi): mọi bên nhận CÙNG một bản (bản của bên thắng), không ghi đè", async () => {
    const db = await memDb();
    const [a, b] = [new PgSoulStore(db, CLOCK), new PgSoulStore(db, CLOCK)];
    const rs = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? a : b).create("linh_hon_dua", (s) => ({ ...s, duyen: i + 1 })),
      ),
    );
    expect(new Set(rs.map((r) => r.duyen)).size).toBe(1);
    expect((await a.get("linh_hon_dua"))?.duyen).toBe(rs[0].duyen);
  });

  it("chân linh: dòng hỏng trong DB bị coi là chưa có (không ném), chân linh khác vẫn đọc được", async () => {
    const db = await memDb();
    const s = new PgSoulStore(db, CLOCK);
    await db.query("INSERT INTO souls (id, data) VALUES ($1, $2::jsonb)", [
      "hong",
      JSON.stringify("khong phai doi tuong"),
    ]);
    await s.create("tot", (x) => ({ ...x, duyen: 5 }));
    expect(await s.get("hong")).toBeNull();
    expect((await s.get("tot"))?.duyen).toBe(5);
  });
});

describe.skipIf(!REAL_URL)("PostgreSQL thật: giao dịch và khoá", () => {
  it("`SoulStore.update` từ HAI kho (hai kết nối) đua nhau 60 lần: không mất lần nào (SELECT ... FOR UPDATE)", async () => {
    const db = await realDb();
    const [a, b] = [new PgSoulStore(db, CLOCK), new PgSoulStore(db, CLOCK)];
    await a.create("linh_hon_khoa");
    await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        (i % 2 ? a : b).update("linh_hon_khoa", (s) => ({
          ...s,
          duyen: s.duyen + 1,
          duyenTotal: s.duyenTotal + 1,
        })),
      ),
    );
    expect((await a.get("linh_hon_khoa"))?.duyen).toBe(60);
  });

  it("`update` trên chân linh CHƯA có, đua từ hai kho: không mất lần nào (chèn thua thì thử lại)", async () => {
    const db = await realDb();
    const [a, b] = [new PgSoulStore(db, CLOCK), new PgSoulStore(db, CLOCK)];
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? a : b).update("linh_hon_moi", (s) => ({ ...s, duyen: s.duyen + 1 })),
      ),
    );
    expect((await a.get("linh_hon_moi"))?.duyen).toBe(20);
  });

  it("migration lỗi giữa chừng: ROLLBACK, không để lại bảng và không ghi `schema_migrations`", async () => {
    const db = await realDb();
    const dir = path.join(root, "loi");
    await import("node:fs").then((fs) => fs.mkdirSync(dir, { recursive: true }));
    writeFileSync(
      path.join(dir, "9001_hong.sql"),
      "CREATE TABLE tam_thoi_a (x int);\nCREATE TABLE tam_thoi_a (x int);\n",
    );
    await expect(migrate(db, dir)).rejects.toThrow();
    const t = await db.query("SELECT to_regclass('tam_thoi_a') AS t");
    expect(t.rows[0].t).toBeNull();
    expect(
      (await db.query("SELECT 1 FROM schema_migrations WHERE version = '9001_hong'")).rows,
    ).toHaveLength(0);
  });
});

describe("migrate", () => {
  it("áp dụng migration thật của dự án một lần; chạy lại bỏ qua; ghi băm; các bảng dùng được", async () => {
    const { Pool } = newDb().adapters.createPg();
    const db = new Pool() as unknown as Db;
    const first = await migrate(db);
    expect(first.applied).toContain("0001_tai_khoan");
    expect(first.skipped).toEqual([]);
    const second = await migrate(db);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(first.applied);
    const row = (
      await db.query("SELECT checksum FROM schema_migrations WHERE version = '0001_tai_khoan'")
    ).rows[0];
    expect(row.checksum).toMatch(/^[a-f0-9]{64}$/);
    for (const t of ["accounts", "sessions", "characters", "souls"])
      await db.query(`SELECT 1 FROM ${t}`);
  });

  it("migration đã áp dụng mà nội dung bị sửa thì TỪ CHỐI; tên tệp sai quy ước thì từ chối; tệp mới thêm sau được áp dụng", async () => {
    const dir = path.join(root, "sua");
    await import("node:fs").then((fs) => fs.mkdirSync(dir, { recursive: true }));
    writeFileSync(path.join(dir, "0001_a.sql"), "CREATE TABLE a (x int);\n");
    const { Pool } = newDb().adapters.createPg();
    const db = new Pool() as unknown as Db;
    expect((await migrate(db, dir)).applied).toEqual(["0001_a"]);
    writeFileSync(path.join(dir, "0002_b.sql"), "CREATE TABLE b (x int);\n");
    const r = await migrate(db, dir);
    expect([r.applied, r.skipped]).toEqual([["0002_b"], ["0001_a"]]);
    writeFileSync(path.join(dir, "0001_a.sql"), "CREATE TABLE a (x int, y int);\n");
    await expect(migrate(db, dir)).rejects.toThrow(/đã bị sửa/);
    writeFileSync(path.join(dir, "0001_a.sql"), "CREATE TABLE a (x int);\n");
    writeFileSync(path.join(dir, "bat_ky.sql"), "SELECT 1;\n");
    await expect(migrate(db, dir)).rejects.toThrow(/không hợp lệ/);
  });

  it("splitStatements: bỏ chú thích, tách theo dấu chấm phẩy cuối dòng, bỏ câu rỗng", () => {
    expect(
      splitStatements(
        "-- chú thích\nCREATE TABLE a (x int);\n\nCREATE INDEX i ON a (x);\n-- hết\n",
      ),
    ).toEqual(["CREATE TABLE a (x int)", "CREATE INDEX i ON a (x)"]);
    expect(splitStatements("")).toEqual([]);
    expect(splitStatements("SELECT 1")).toEqual(["SELECT 1"]);
    expect(MIGRATIONS_DIR).toMatch(/server\/migrations$/);
  });
});

describe("tiện ích db", () => {
  it("isUniqueViolation chỉ nhận mã 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    for (const e of [null, undefined, {}, { code: "23503" }, "23505", new Error("x")])
      expect(isUniqueViolation(e)).toBe(false);
  });

  it("tx: lỗi thì ném lại và trả kết nối; thành công trả giá trị", async () => {
    const calls: string[] = [];
    let released = 0;
    const db = {
      query: async () => ({ rows: [], rowCount: 0 }),
      connect: async () => ({
        query: async (t: string) => (calls.push(t), { rows: [], rowCount: 0 }),
        release: () => void released++,
      }),
    } as Db;
    expect(await tx(db, async () => 7)).toBe(7);
    await expect(
      tx(db, async () => {
        throw new Error("hỏng");
      }),
    ).rejects.toThrow("hỏng");
    expect(calls).toEqual(["BEGIN", "COMMIT", "BEGIN", "ROLLBACK"]);
    expect(released).toBe(2);
  });

  it("KeyedQueue: cùng khoá chạy lần lượt đúng thứ tự gọi, lỗi không chặn lần sau, khác khoá không chờ nhau", async () => {
    const q = new KeyedQueue();
    const order: number[] = [];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const jobs = [
      q.run("k", async () => (await sleep(20), order.push(1))),
      q.run("k", async () => {
        order.push(2);
        throw new Error("lỗi 2");
      }),
      q.run("k", async () => order.push(3)),
      q.run("khac", async () => order.push(0)),
    ];
    await expect(jobs[1]).rejects.toThrow("lỗi 2");
    await Promise.all([jobs[0], jobs[2], jobs[3]]);
    expect(order).toEqual([0, 1, 2, 3]);
    expect(newSoul("x", "y").id).toBe("x");
  });
});
