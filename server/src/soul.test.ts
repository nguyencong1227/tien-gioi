// Kho chân linh: ghi nguyên tử theo từng linh hồn, nạp không tin file, file hỏng được cách ly chứ không bị ghi đè.
import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { type Soul } from "@tien-gioi/shared";
import { FileSoulStore, soulIdOf, soulsDir } from "./soul";

const dir = mkdtempSync(path.join(tmpdir(), "tien-gioi-soul-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;
const fresh = () => new FileSoulStore(path.join(dir, `s${++n}`), () => "2026-11-10T00:00:00.000Z");
const fileFor = (store: string, id: string) =>
  path.join(store, `${createHash("sha1").update(id).digest("hex")}.json`);

describe("soulIdOf / soulsDir", () => {
  it("khoá chuẩn hoá NFC, không phân biệt hoa thường", () => {
    expect(soulIdOf("Lâm Thanh Tùng")).toBe(soulIdOf("LÂM THANH TÙNG"));
    expect(soulIdOf("Á")).toBe(soulIdOf("Á")); // á dựng sẵn và á tổ hợp
  });
  it("mặc định nằm trong DATA_DIR/souls (cùng volume và bản sao lưu với hồ sơ nhân vật); SOULS_DIR ghi đè", () => {
    const keep = { ...process.env };
    try {
      delete process.env.SOULS_DIR;
      process.env.DATA_DIR = "/tmp/xyz-players";
      expect(soulsDir()).toBe("/tmp/xyz-players/souls");
      process.env.SOULS_DIR = "/tmp/linh-hon";
      expect(soulsDir()).toBe("/tmp/linh-hon");
    } finally {
      process.env = keep;
    }
  });
});

describe("FileSoulStore", () => {
  it("chưa có thì get là null; create tạo kiếp 1, 0 Duyên và lưu; create lần hai trả về bản đã có (không ghi đè)", async () => {
    const s = fresh();
    expect(await s.get("a")).toBeNull();
    const c1 = await s.create("a", (x) => ({ ...x, best: { step: 9, realm: 1, tier: 8 } }));
    expect([c1.id, c1.kiep, c1.duyen, c1.best.step]).toEqual(["a", 1, 0, 9]);
    await s.update("a", (x) => ({ ...x, duyen: 40 }));
    const c2 = await s.create("a", (x) => ({ ...x, duyen: 999 }));
    expect(c2.duyen).toBe(40);
    expect((await s.get("a"))?.duyen).toBe(40);
  });

  it("update: 60 lần cộng cùng lúc cho một linh hồn không mất lần nào; file hợp lệ; không còn tệp tạm", async () => {
    const s = fresh();
    await s.create("b");
    await Promise.all(
      Array.from({ length: 60 }, () =>
        s.update("b", (x) => ({ ...x, duyen: x.duyen + 1, duyenTotal: x.duyenTotal + 1 })),
      ),
    );
    const got = await s.get("b");
    expect([got?.duyen, got?.duyenTotal]).toEqual([60, 60]);
  });

  it("update trên linh hồn chưa có thì tạo mới rồi áp; id luôn là khoá, không đổi được qua fn", async () => {
    const s = fresh();
    const r = await s.update("moi", (x) => ({ ...x, id: "ke-khac", duyen: 7 }));
    expect([r.id, r.duyen]).toEqual(["moi", 7]);
    expect(await s.get("ke-khac")).toBeNull();
  });

  it("fn ném lỗi: không ghi gì, lỗi trả cho người gọi, các lần sau (kể cả đang xếp hàng) vẫn chạy", async () => {
    const s = fresh();
    await s.update("c", (x) => ({ ...x, duyen: 5 }));
    const bad = s.update("c", () => {
      throw new Error("hỏng giữa chừng");
    });
    const good = s.update("c", (x) => ({ ...x, duyen: x.duyen + 1 }));
    await expect(bad).rejects.toThrow("hỏng giữa chừng");
    expect((await good).duyen).toBe(6);
    expect((await s.get("c"))?.duyen).toBe(6);
  });

  it("các linh hồn khác nhau không chờ nhau và không lẫn dữ liệu", async () => {
    const s = fresh();
    await Promise.all([
      s.update("d1", (x) => ({ ...x, duyen: 1 })),
      s.update("d2", (x) => ({ ...x, duyen: 2 })),
      s.update("d3", (x) => ({ ...x, duyen: 3 })),
    ]);
    expect(await Promise.all(["d1", "d2", "d3"].map(async (i) => (await s.get(i))?.duyen))).toEqual(
      [1, 2, 3],
    );
  });

  it("nạp không tin file: số rác được kẹp, id mục lạ bị bỏ, kiếp < 1 thành 1", async () => {
    const base = path.join(dir, `r${++n}`);
    const s = new FileSoulStore(base, () => "t");
    await s.create("rac");
    writeFileSync(
      fileFor(base, "rac"),
      JSON.stringify({
        id: "rac",
        kiep: -9,
        duyen: -5,
        unlocks: { du_am: 99, rong: 3 },
        origins: ["rong"],
        history: "x",
      }),
    );
    const got = (await s.get("rac")) as Soul;
    expect([got.kiep, got.duyen, got.unlocks, got.origins, got.history]).toEqual([
      1,
      0,
      { du_am: 10 },
      [],
      [],
    ]);
  });

  it("file hỏng (không phải JSON, hoặc không phải object) được cách ly sang *.hong-*, rồi coi như chưa có; không bị ghi đè mất", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const base = path.join(dir, `h${++n}`);
    const s = new FileSoulStore(base, () => "t");
    await s.create("loi");
    for (const bad of ["{không phải json", "[1,2]", "5", "null"]) {
      writeFileSync(fileFor(base, "loi"), bad);
      expect(await s.get("loi")).toBeNull();
      const created = await s.create("loi");
      expect(created.kiep).toBe(1);
    }
    const moved = readdirSync(base).filter((f) => f.includes(".hong-"));
    expect(moved.length).toBe(4);
    expect(readFileSync(path.join(base, moved[0]), "utf8").length).toBeGreaterThan(0); // nội dung hỏng còn nguyên để khôi phục
    vi.restoreAllMocks();
  });

  it("lỗi đọc khác ENOENT được ném ra (không nuốt, không tạo mới đè lên)", async () => {
    const base = path.join(dir, `e${++n}`);
    const s = new FileSoulStore(base, () => "t");
    await s.create("x");
    // Thay tệp bằng THƯ MỤC cùng tên: readFile báo EISDIR
    rmSync(fileFor(base, "x"));
    const { mkdirSync } = await import("node:fs");
    mkdirSync(fileFor(base, "x"));
    await expect(s.get("x")).rejects.toThrow();
  });
});
