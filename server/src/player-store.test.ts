import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// store.ts đọc DATA_DIR lúc nạp: đặt TRƯỚC khi nạp động module
const dir = mkdtempSync(path.join(tmpdir(), "tien-gioi-player-store-"));
process.env.DATA_DIR = dir;
const { FilePlayerStore, defaultPlayerStore } = await import("./player-store");

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const mk = (name: string, exp: number) => ({
  name,
  secretHash: "h",
  realm: 1,
  tier: 0,
  exp,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("FilePlayerStore", () => {
  it("chưa có thì load ra null; save rồi load thấy dữ liệu; tên không phân biệt hoa thường / NFC", async () => {
    const s = new FilePlayerStore();
    expect(await s.load("Chua Co")).toBeNull();
    await s.save(mk("Lâm Thanh", 7));
    expect((await s.load("lâm thanh"))?.exp).toBe(7);
    expect((await s.load("Lâm Thanh".normalize("NFD")))?.exp).toBe(7);
  });
  it("các lần save cùng một nhân vật xếp hàng: bản gọi sau là bản cuối; lỗi một lần không chặn lần sau", async () => {
    const s = new FilePlayerStore();
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < 30; i++) jobs.push(s.save(mk("Xep Hang", i)));
    await Promise.all(jobs);
    expect((await s.load("Xep Hang"))?.exp).toBe(29);
    const bad = { ...mk("Loi Luu", 1), exp: 1n } as unknown as ReturnType<typeof mk>; // JSON.stringify ném lỗi với BigInt
    await expect(s.save(bad)).rejects.toThrow();
    await expect(s.save(mk("Loi Luu", 5))).resolves.toBeUndefined();
    expect((await s.load("Loi Luu"))?.exp).toBe(5);
  });
  it("defaultPlayerStore dùng chung một thể hiện", () => {
    expect(defaultPlayerStore()).toBe(defaultPlayerStore());
  });
});
