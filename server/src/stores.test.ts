// Chọn backend lưu trữ: STORE=file | pg, thiếu DATABASE_URL, migration lúc dựng, không rò rỉ chuỗi kết nối, đóng pool.
import { describe, expect, it, vi } from "vitest";
import { newDb } from "pg-mem";
import { PgAccountStore, PgSessionStore } from "./pg/account-store";
import type { Db } from "./pg/db";
import { PgPlayerStore, PgSoulStore } from "./pg/game-store";
import { createStores, storeKindOf } from "./stores";

const memDb = () => {
  const { Pool } = newDb().adapters.createPg();
  const pool = new Pool() as unknown as Db & { end(): Promise<void> };
  return pool;
};

describe("storeKindOf", () => {
  it("chỉ 'pg' mới là pg; mọi giá trị khác (kể cả không đặt, hoa thường sai) là file", () => {
    expect(storeKindOf({ STORE: "pg" })).toBe("pg");
    for (const v of [undefined, "", "file", "PG", "postgres", "pg ", "1"])
      expect(storeKindOf({ STORE: v }), String(v)).toBe("file");
  });
});

describe("createStores", () => {
  it("file (mặc định): bản file dùng chung, không đụng DATABASE_URL, close không làm gì", async () => {
    const s = await createStores({ DATABASE_URL: "postgres://khong-duoc-dung" });
    expect(s.kind).toBe("file");
    expect(s.players.constructor.name).toBe("FilePlayerStore");
    expect(s.souls.constructor.name).toBe("FileSoulStore");
    expect(s.accounts.constructor.name).toBe("FileAccountStore");
    expect(s.sessions.constructor.name).toBe("FileSessionStore");
    await s.close();
    expect((await createStores({})).players).toBe(s.players); // cùng một bản dùng chung của tiến trình
  });

  it("pg thiếu DATABASE_URL (không đặt / rỗng / toàn dấu cách): ném lỗi rõ ràng", async () => {
    for (const url of [undefined, "", "   "])
      await expect(createStores({ STORE: "pg", DATABASE_URL: url })).rejects.toThrow(
        /DATABASE_URL/,
      );
  });

  it("pg: chạy migration, trả đủ bốn kho Pg* dùng được; close đóng pool", async () => {
    const db = memDb();
    const end = vi.spyOn(db, "end");
    const s = await createStores({ STORE: "pg" }, { db });
    expect(s.kind).toBe("pg");
    expect(s.players).toBeInstanceOf(PgPlayerStore);
    expect(s.souls).toBeInstanceOf(PgSoulStore);
    expect(s.accounts).toBeInstanceOf(PgAccountStore);
    expect(s.sessions).toBeInstanceOf(PgSessionStore);
    // cùng một DB cho cả bốn: tài khoản tạo xong tra lại được, nhân vật lưu xong đọc lại được
    const a = await s.accounts.create({
      username: "lam_thanh",
      passHash: "h",
      recoveryHash: "h",
      createdAt: "2026-11-10T00:00:00.000Z",
      lastLoginAt: "2026-11-10T00:00:00.000Z",
      disabled: false,
    });
    expect((await s.accounts.byId(a!.id))?.username).toBe("lam_thanh");
    await s.players.save({
      name: "Lâm Thanh",
      secretHash: "x",
      realm: 0,
      tier: 0,
      exp: 3,
      createdAt: "t",
      updatedAt: "t",
    });
    expect((await s.players.load("lâm thanh"))?.exp).toBe(3);
    await s.close();
    expect(end).toHaveBeenCalledOnce();
  });

  it("pg: dựng hai lần trên cùng DB không lỗi (migration chạy lại là bỏ qua)", async () => {
    const db = memDb();
    await createStores({ STORE: "pg" }, { db });
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await createStores({ STORE: "pg" }, { db });
      expect(logs).not.toHaveBeenCalledWith(expect.stringContaining("đã áp dụng migration"));
    } finally {
      logs.mockRestore();
    }
  });

  it("pg: migration lỗi thì ném, ĐÓNG pool, và thông báo KHÔNG chứa chuỗi kết nối / mật khẩu", async () => {
    const closed = vi.fn(async () => {});
    const broken = {
      query: async () => {
        throw Object.assign(
          new Error("connect ECONNREFUSED postgres://nguoi:bi-mat-123@may-chu/tiengioi"),
          { code: "ECONNREFUSED" },
        );
      },
      connect: async () => {
        throw new Error("không dùng");
      },
      end: closed,
    } as unknown as Db & { end(): Promise<void> };
    const err = (await createStores({ STORE: "pg" }, { db: broken }).catch((e) => e)) as Error;
    expect(err.message).toContain("migration");
    expect(err.message).toContain("ECONNREFUSED");
    expect(err.message).not.toContain("bi-mat-123");
    expect(err.message).not.toContain("may-chu");
    expect(closed).toHaveBeenCalledOnce();
  });
});
