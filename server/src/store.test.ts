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
