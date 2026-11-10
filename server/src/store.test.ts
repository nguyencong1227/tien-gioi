// Lưu nhân vật: các lần lưu chồng nhau cùng một nhân vật không hỏng file và bản gọi sau thắng.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SavedPlayer } from "./store";

const dir = mkdtempSync(path.join(tmpdir(), "tien-gioi-store-"));
let store: typeof import("./store");

beforeAll(async () => {
  process.env.DATA_DIR = dir; // store.ts đọc biến này lúc nạp module
  store = await import("./store");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const mk = (name: string, exp: number, extra: Partial<SavedPlayer> = {}): SavedPlayer => ({
  name,
  secretHash: "h",
  realm: 0,
  tier: 0,
  exp,
  createdAt: "t",
  updatedAt: "t",
  ...extra,
});

describe("savePlayer", () => {
  it("nhiều lần lưu cùng lúc cho một nhân vật: không lần nào lỗi, file hợp lệ, bản gọi sau cùng là bản cuối", async () => {
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < 40; i++) jobs.push(store.savePlayer(mk("Chong Nhau", i)));
    await expect(Promise.all(jobs)).resolves.toBeDefined();
    const loaded = await store.loadPlayer("Chong Nhau");
    expect(loaded?.exp).toBe(39);
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("bản ghi đi qua cổng (mapId đích) gọi sau lưu định kỳ thì thắng, dù lưu định kỳ bắt đầu trước", async () => {
    const periodic = store.savePlayer(mk("Cong Va Luu", 1, { mapId: "lac_ha" }));
    const travel = store.savePlayer(mk("Cong Va Luu", 1, { mapId: "hac_phong", travelAt: 123 }));
    await Promise.all([periodic, travel]);
    const loaded = await store.loadPlayer("Cong Va Luu");
    expect([loaded?.mapId, loaded?.travelAt]).toEqual(["hac_phong", 123]);
  });

  it("một lần lưu lỗi không chặn các lần sau; nhân vật khác nhau không chờ nhau", async () => {
    const bad = {
      ...mk("Loi Luu", 1),
      toJSON: () => {
        throw new Error("không tuần tự hoá được");
      },
    } as SavedPlayer;
    await expect(store.savePlayer(bad)).rejects.toThrow();
    await expect(store.savePlayer(mk("Loi Luu", 5))).resolves.toBeUndefined();
    expect((await store.loadPlayer("Loi Luu"))?.exp).toBe(5);
    await Promise.all([store.savePlayer(mk("Nguoi A", 1)), store.savePlayer(mk("Nguoi B", 2))]);
    expect((await store.loadPlayer("Nguoi B"))?.exp).toBe(2);
  });
});

describe("sanitizeLife: không tin bộ đếm trong file", () => {
  it("giá trị hợp lệ giữ nguyên (số lẻ cắt xuống); số rác về 0; trùm không vượt số quái", async () => {
    const { sanitizeLife } = store;
    expect(sanitizeLife({ playMs: 123456.9, kills: 40, bossKills: 3 })).toEqual({
      playMs: 123456,
      kills: 40,
      bossKills: 3,
    });
    expect(sanitizeLife({ playMs: 5, kills: 2, bossKills: 9 })).toEqual({
      playMs: 5,
      kills: 2,
      bossKills: 2,
    });
    for (const bad of [
      undefined,
      null,
      5,
      "x",
      [],
      { playMs: "9", kills: -1, bossKills: Number.NaN },
      { playMs: Infinity, kills: -Infinity },
    ]) {
      const l = sanitizeLife(bad);
      expect(
        Object.values(l).every((v) => Number.isInteger(v) && v >= 0),
        JSON.stringify(bad),
      ).toBe(true);
    }
    expect(sanitizeLife({ playMs: 1e30, kills: 1e30, bossKills: 1e30 }).playMs).toBeLessThanOrEqual(
      1e12,
    );
  });

  it("sanitizeLifeId: giữ mã hợp lệ; kiểu sai, quá ngắn / dài, ký tự lạ thì sinh mã mới", () => {
    const ok = store.newLifeId();
    expect(store.sanitizeLifeId(ok)).toBe(ok);
    for (const bad of [
      undefined,
      null,
      12345,
      "",
      "ngan",
      "x".repeat(65),
      "co khoang trang 12345",
      "\u0000\u0001abcdefgh",
      {},
      [],
    ]) {
      const id = store.sanitizeLifeId(bad);
      expect(id).not.toBe(bad);
      expect(id).toMatch(/^[\x21-\x7e]{8,64}$/);
    }
  });

  it("newLifeId: mỗi lần một mã khác nhau", () => {
    expect(new Set(Array.from({ length: 50 }, () => store.newLifeId())).size).toBe(50);
  });
});
