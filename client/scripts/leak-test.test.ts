import { describe, expect, it } from "vitest";
import { MAPS, getMap, isDungeonMap } from "@tien-gioi/shared";
import { LEAK_MAP_IDS, evaluateLeakResults, rebuildMapExpr } from "./leak-test.mjs";

describe("evaluateLeakResults (kiểm tra rò rỉ tài nguyên client)", () => {
  it("trả về ok = true khi tài nguyên ổn định và không vượt ngân sách", () => {
    const initial = {
      textures: 15,
      gameObjects: 25,
      bitmapTexts: 4,
      heapBytes: 20 * 1048576,
    };
    const final = {
      textures: 15,
      gameObjects: 27,
      bitmapTexts: 6, // base: 21 -> 21 (không đổi)
      heapBytes: 21 * 1048576, // tăng 5% <= 10%
    };

    const result = evaluateLeakResults({
      initial,
      final,
      maxHeapGrowthPercent: 10.0,
      maxDamageNumbers: 28,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.heapGrowthPercent).toBe(5);
  });

  it("ĐỘT BIẾN: phát hiện rò rỉ khi textures tăng", () => {
    const initial = {
      textures: 15,
      gameObjects: 20,
      bitmapTexts: 0,
      heapBytes: 20 * 1048576,
    };
    const final = {
      textures: 17, // rò rỉ +2 textures
      gameObjects: 20,
      bitmapTexts: 0,
      heapBytes: 20 * 1048576,
    };

    const result = evaluateLeakResults({
      initial,
      final,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Rò rỉ Texture"))).toBe(true);
  });

  it("ĐỘT BIẾN: phát hiện rò rỉ GameObjects cơ sở khi tăng quá dung sai", () => {
    const initial = {
      textures: 15,
      gameObjects: 20,
      bitmapTexts: 2, // base = 18
      heapBytes: 20 * 1048576,
    };
    const final = {
      textures: 15,
      gameObjects: 24,
      bitmapTexts: 2, // base = 22 (+4 base objects rò rỉ)
      heapBytes: 20 * 1048576,
    };

    const result = evaluateLeakResults({
      initial,
      final,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Rò rỉ GameObjects cơ sở"))).toBe(true);
  });

  it("ĐỘT BIẾN: phát hiện rò rỉ pool BitmapText khi vượt quá trần cấu hình", () => {
    const initial = {
      textures: 15,
      gameObjects: 20,
      bitmapTexts: 5,
      heapBytes: 20 * 1048576,
    };
    const final = {
      textures: 15,
      gameObjects: 50,
      bitmapTexts: 35, // vượt trần 28
      heapBytes: 20 * 1048576,
    };

    const result = evaluateLeakResults({
      initial,
      final,
      maxDamageNumbers: 28,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Rò rỉ Pool chữ bay"))).toBe(true);
  });

  it("ĐỘT BIẾN: phát hiện rò rỉ bộ nhớ JS Heap khi tăng trưởng > maxHeapGrowthPercent", () => {
    const initial = {
      textures: 15,
      gameObjects: 20,
      bitmapTexts: 0,
      heapBytes: 20 * 1048576,
    };
    const final = {
      textures: 15,
      gameObjects: 20,
      bitmapTexts: 0,
      heapBytes: 25 * 1048576, // tăng 25% > 10%
    };

    const result = evaluateLeakResults({
      initial,
      final,
      maxHeapGrowthPercent: 10.0,
    });

    expect(result.ok).toBe(false);
    expect(result.heapGrowthPercent).toBe(25);
    expect(result.errors.some((e) => e.includes("Tăng trưởng JS Heap"))).toBe(true);
  });
});

describe("leak-test đi qua nhiều bản đồ (#408 bước 4)", () => {
  it("LEAK_MAP_IDS gồm Lạc Hà (gốc, đứng đầu), Hắc Phong và Âm Sương: đều là bản đồ ngoài có thật, không trùng", () => {
    expect(LEAK_MAP_IDS[0]).toBe("lac_ha");
    expect(LEAK_MAP_IDS).toContain("hac_phong");
    expect(LEAK_MAP_IDS).toContain("am_suong");
    expect(new Set(LEAK_MAP_IDS).size).toBe(LEAK_MAP_IDS.length);
    for (const id of LEAK_MAP_IDS) {
      expect(getMap(id)).toBeDefined();
      expect(isDungeonMap(id)).toBe(false);
    }
  });

  it("MỌI bản đồ ngoài của shared đều có trong LEAK_MAP_IDS (thêm bản đồ ngoài mới mà quên thêm vào đây thì đỏ)", () => {
    const outdoor = MAPS.filter((d) => !isDungeonMap(d.id)).map((d) => d.id);
    expect([...LEAK_MAP_IDS].sort()).toEqual([...outdoor].sort());
  });

  it("rebuildMapExpr đổi scene.map qua window.__getMap rồi dựng lại hình ảnh, và ném lỗi khi không tra được bản đồ", () => {
    const calls: string[] = [];
    const scene: { map?: unknown; buildMapVisuals: () => void } = {
      buildMapVisuals: () => calls.push("build"),
    };
    const maps: Record<string, object> = { am_suong: { id: "am_suong" } };
    const win = { __scene: scene, __getMap: (id: string) => maps[id] };
    const run = (id: string) => new Function("window", `return ${rebuildMapExpr(id).trim()}`)(win);

    run("am_suong");
    expect(scene.map).toBe(maps.am_suong);
    expect(calls).toEqual(["build"]);

    // id không tra được: phải ném (không im lặng dựng lại bản đồ cũ => xanh giả)
    expect(() => run("khong_co")).toThrow(/khong_co/);
    expect(calls).toEqual(["build"]);
  });
});
