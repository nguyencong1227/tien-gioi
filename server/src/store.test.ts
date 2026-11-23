// Lưu nhân vật: các lần lưu chồng nhau cùng một nhân vật không hỏng file và bản gọi sau thắng.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ARENA_MAPS, DEFAULT_MAP_ID, DUNGEON_MAPS, MAPS, REALMS, getMap } from "@tien-gioi/shared";
import { profileRowOf, sanitizeLimbo, type SavedPlayer } from "./store";

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

describe("mapIdOf: chỗ ở của nhân vật là bản đồ thường", () => {
  it("bản đồ thường giữ nguyên; thiếu, lạ, sai kiểu, khoá nguyên mẫu về Lạc Hà", () => {
    // Mọi bản đồ thường đang có (kể cả Âm Sương Trạch, M6 #411): thêm bản đồ mới mà quên đăng ký thì đỏ ở đây
    expect(MAPS.map((m) => m.id)).toEqual(
      expect.arrayContaining(["lac_ha", "hac_phong", "am_suong"]),
    );
    for (const { id } of MAPS) expect(store.mapIdOf({ mapId: id }), id).toBe(id);
    for (const bad of [undefined, "", "khong_co", "constructor", "__proto__", 7, null, {}])
      expect(store.mapIdOf({ mapId: bad as never }), String(bad)).toBe("lac_ha");
  });

  it("bản đồ bí cảnh (getMap tra được) KHÔNG phải chỗ ở: về Lạc Hà, không bao giờ đưa tới phòng bí cảnh", () => {
    for (const m of DUNGEON_MAPS) {
      expect(getMap(m.id)).toBeDefined(); // chính vì tra được mà mapIdOf phải loại
      expect(store.mapIdOf({ mapId: m.id })).toBe(DEFAULT_MAP_ID);
    }
  });
});

describe("mapIdOf: đấu trường chặn đường cũng không phải chỗ ở", () => {
  it("id đấu trường (getMap tra được, phòng chỉ mở cho đúng một vé) về Lạc Hà như bí cảnh, không đưa tới phòng không vào được", () => {
    expect(ARENA_MAPS.length).toBeGreaterThan(0);
    for (const m of ARENA_MAPS) {
      expect(getMap(m.id), m.id).toBeDefined(); // chính vì tra được mà mapIdOf phải loại
      expect(store.mapIdOf({ mapId: m.id }), m.id).toBe(DEFAULT_MAP_ID);
    }
  });
});

describe("sanitizeProgress: cảnh giới / tầng / tu vi từ file lưu không được tin", () => {
  const top = REALMS.length - 1;
  const topTier = REALMS[top].tiers.length - 1;

  it("hồ sơ hợp lệ giữ nguyên (số lẻ làm tròn xuống)", () => {
    expect(store.sanitizeProgress({ realm: 1, tier: 2, exp: 123 })).toEqual({
      realm: 1,
      tier: 2,
      exp: 123,
    });
    expect(store.sanitizeProgress({ realm: 1.9, tier: 2.9, exp: 99.9 })).toEqual({
      realm: 1,
      tier: 2,
      exp: 99,
    });
  });

  it("thiếu / NaN / sai kiểu / âm: về 0 (trước đây `Math.min(undefined | NaN | -1, ...)` làm `REALMS[realm].tiers` ném TypeError)", () => {
    for (const bad of [undefined, null, NaN, "2", "abc", {}, [], true, -1, -Infinity]) {
      const r = store.sanitizeProgress({ realm: bad, tier: bad, exp: bad });
      expect(r, String(bad)).toEqual({ realm: 0, tier: 0, exp: 0 });
    }
    expect(store.sanitizeProgress({})).toEqual({ realm: 0, tier: 0, exp: 0 });
  });

  it("vượt trần: realm về cảnh giới cao nhất, tier về tầng cuối của CẢNH GIỚI ĐÓ; tu vi không có trần trên", () => {
    expect(store.sanitizeProgress({ realm: 999, tier: 999, exp: 5 })).toMatchObject({
      realm: top,
      tier: topTier,
    });
    expect(store.sanitizeProgress({ realm: Infinity, tier: Infinity })).toMatchObject({
      realm: top,
      tier: topTier,
    });
    // tier kẹp theo số tầng của cảnh giới đã kẹp (Phàm Nhân ít tầng hơn Nguyên Anh)
    const r0 = store.sanitizeProgress({ realm: 0, tier: 999 });
    expect(r0.tier).toBe(REALMS[0].tiers.length - 1);
    expect(store.sanitizeProgress({ exp: 1e15 }).exp).toBe(1e15);
    expect(store.sanitizeProgress({ exp: Infinity }).exp).toBe(0); // vô cùng không phải số hợp lệ (khoá một người chơi vĩnh viễn)
  });

  it("bất động: làm sạch lại cho đúng kết quả cũ", () => {
    for (const raw of [{ realm: -4, tier: 77, exp: -3 }, { realm: 2.7, tier: 1.2, exp: 8.8 }, {}]) {
      const once = store.sanitizeProgress(raw);
      expect(store.sanitizeProgress(once)).toEqual(once);
    }
  });
});

describe("sanitizeLimbo: chiêu có thể khắc (M7.2c) không tin file", () => {
  const base = { endedLifeId: "life-1", summary: {}, keepable: [], coinAtDeath: 0, counts: true };

  it("giữ id chiêu thật, bỏ id lạ / độc / trùng / sai kiểu; thứ tự giữ nguyên", () => {
    const r = sanitizeLimbo({
      ...base,
      engravable: [
        "hoa_van_kiem",
        "constructor",
        "__proto__",
        "hoa_van_kiem",
        "me_tung_bo",
        5,
        null,
        {},
        "",
      ],
    })!;
    expect(r.engravable).toEqual(["hoa_van_kiem", "me_tung_bo"]);
  });

  it("hồ sơ cũ không có trường, hoặc không phải mảng: rỗng", () => {
    expect(sanitizeLimbo(base)!.engravable).toEqual([]);
    for (const bad of ["hoa_van_kiem", 5, null, {}, true])
      expect(sanitizeLimbo({ ...base, engravable: bad })!.engravable, String(bad)).toEqual([]);
  });

  it("mảng khổng lồ bị cắt (không tốn bộ nhớ / băng thông)", () => {
    const r = sanitizeLimbo({
      ...base,
      engravable: Array.from({ length: 5000 }, () => "me_tung_bo"),
    })!;
    expect(r.engravable).toEqual(["me_tung_bo"]); // trùng nên chỉ còn 1
    // nhiều id thật khác nhau cũng không vượt trần
    const ids = ["hoa_van_kiem", "bon_thach_quyen", "ung_trao", "me_tung_bo"];
    const r2 = sanitizeLimbo({ ...base, engravable: [...ids, ...ids, ...ids] })!;
    expect(r2.engravable).toEqual(ids);
  });
});

describe("profileRowOf / listPlayerProfiles (M9: xếp hạng, chỉ đọc)", () => {
  it("profileRowOf: chỉ rút trường xếp hạng, không tin kiểu, nhận ra Hoàng Tuyền", () => {
    expect(
      profileRowOf({ name: "A", realm: 2, tier: 1, exp: 9, secretHash: "x", inventory: {} }),
    ).toEqual({
      name: "A",
      realm: 2,
      tier: 1,
      exp: 9,
      limbo: false,
    });
    expect(profileRowOf({ name: "A", realm: "2", tier: Number.NaN, exp: null })).toEqual({
      name: "A",
      realm: 0,
      tier: 0,
      exp: 0,
      limbo: false,
    });
    expect(profileRowOf({ name: "A", limbo: { at: "t" } })!.limbo).toBe(true);
    for (const bad of [null, undefined, 5, "x", [], {}, { name: "" }, { name: 7 }])
      expect(profileRowOf(bad), JSON.stringify(bad)).toBeNull();
  });

  it("listPlayerProfiles: bỏ qua tệp hỏng / không phải .json / thư mục souls, giữ đúng limit, KHÔNG xoá hay đổi tên tệp hỏng", async () => {
    const d = mkdtempSync(path.join(tmpdir(), "tien-gioi-profiles-"));
    const keep = process.env.DATA_DIR;
    try {
      process.env.DATA_DIR = d;
      const fresh = await import("./store"); // cùng module đã nạp: DATA_DIR đọc lại mỗi lần gọi `getDir`
      writeFileSync(path.join(d, "a.json"), JSON.stringify(mk("Ng A", 5, { realm: 1 })));
      writeFileSync(path.join(d, "b.json"), JSON.stringify(mk("Ng B", 9)));
      writeFileSync(path.join(d, "hong.json"), "{ không phải json");
      writeFileSync(path.join(d, "c.json.tmp"), JSON.stringify(mk("Ng C", 1)));
      writeFileSync(path.join(d, "mang.json"), "[1,2]");
      mkdirSync(path.join(d, "souls"));
      writeFileSync(
        path.join(d, "souls", "s.json"),
        JSON.stringify({ name: "Linh Hon", realm: 9 }),
      );
      const rows = await fresh.listPlayerProfiles();
      expect(rows.map((r) => r.name)).toEqual(["Ng A", "Ng B"]);
      expect(rows[0].realm).toBe(1);
      expect((await fresh.listPlayerProfiles(1)).map((r) => r.name)).toEqual(["Ng A"]);
      expect(readdirSync(d).sort()).toEqual([
        "a.json",
        "b.json",
        "c.json.tmp",
        "hong.json",
        "mang.json",
        "souls",
      ]);
      expect(await fresh.listPlayerProfiles()).toEqual(rows); // tất định
      // limit cắt theo TÊN (tên tệp thật là băm): nhiều nhân vật lưu qua savePlayer rồi lấy 2 đầu theo tên
      for (const nm of ["Zeta", "Alpha", "Mid"]) await fresh.savePlayer(mk(nm, 1));
      expect((await fresh.listPlayerProfiles(2)).map((r) => r.name)).toEqual(["Alpha", "Mid"]);
    } finally {
      if (keep === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = keep;
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("thư mục dữ liệu chưa tồn tại -> []", async () => {
    const keep = process.env.DATA_DIR;
    try {
      process.env.DATA_DIR = path.join(dir, "khong-co-thu-muc");
      expect(await store.listPlayerProfiles()).toEqual([]);
    } finally {
      process.env.DATA_DIR = keep;
    }
  });
});
