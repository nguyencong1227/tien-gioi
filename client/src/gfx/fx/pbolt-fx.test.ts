import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SKILL_LIMITS } from "@tien-gioi/shared";
import { castTint } from "./cast-fx";
import {
  PBOLT_FADE_MS,
  PBOLT_HIT_RECIPE,
  PBOLT_MINE_MAX,
  PBOLT_MS_MAX,
  PBOLT_Y_OFFSET,
  parsePBolt,
  pboltAlive,
  pboltAlpha,
  pboltEnd,
  pboltLength,
  pboltLimits,
  pboltPlan,
  pboltPosition,
  pboltSlot,
  pboltTravelled,
  planPBoltEnd,
  type PBoltSlotItem,
} from "./pbolt-fx";
import { CT2_RECIPES } from "./recipes-ct2";

const good = { by: "s1", skill: "hoa_van_kiem", x: 100, y: 200, angle: 0, speed: 500, ms: 400 };
const clean = () => parsePBolt(good)!;

describe("parsePBolt: không tin tin nhắn", () => {
  it("tin đúng dạng qua nguyên vẹn", () => {
    expect(parsePBolt(good)).toEqual(good);
  });

  it("speed kẹp vào giới hạn dữ liệu chiêu; ms kẹp [1, PBOLT_MS_MAX] và làm tròn", () => {
    expect(parsePBolt({ ...good, speed: 1 })!.speed).toBe(SKILL_LIMITS.boltSpeedMin);
    expect(parsePBolt({ ...good, speed: 99999 })!.speed).toBe(SKILL_LIMITS.boltSpeedMax);
    expect(parsePBolt({ ...good, ms: 0 })!.ms).toBe(1);
    expect(parsePBolt({ ...good, ms: -50 })!.ms).toBe(1);
    expect(parsePBolt({ ...good, ms: 1e9 })!.ms).toBe(PBOLT_MS_MAX);
    expect(parsePBolt({ ...good, ms: 12.6 })!.ms).toBe(13);
  });

  it("sai dạng thì bỏ CẢ tin (null), không ném lỗi", () => {
    const bad: unknown[] = [
      null,
      undefined,
      "x",
      5,
      [],
      {},
      { ...good, by: "" },
      { ...good, by: 5 },
      { ...good, by: "a".repeat(65) },
      { ...good, skill: "" },
      { ...good, skill: null },
      { ...good, skill: "b".repeat(65) },
      { ...good, x: NaN },
      { ...good, y: Infinity },
      { ...good, x: "1" },
      { ...good, angle: NaN },
      { ...good, angle: undefined },
      { ...good, speed: 0 },
      { ...good, speed: -300 },
      { ...good, speed: NaN },
      { ...good, ms: NaN },
      { ...good, ms: Infinity },
      { ...good, ms: "400" },
      { ...good, x: 100_001 },
      { ...good, y: -100_001 },
    ];
    for (const b of bad) expect(parsePBolt(b), JSON.stringify(b)).toBeNull();
  });

  it("thiếu từng trường một thì bỏ", () => {
    for (const k of Object.keys(good)) {
      const m: Record<string, unknown> = { ...good };
      delete m[k];
      expect(parsePBolt(m), k).toBeNull();
    }
  });
});

describe("hình học theo thời gian", () => {
  it("quãng cả đoạn = speed x ms / 1000; đạn bay đều rồi DỪNG ở cuối đoạn", () => {
    const p = clean();
    expect(pboltLength(p)).toBe(200);
    expect(pboltTravelled(p, 0)).toBe(0);
    expect(pboltTravelled(p, 200)).toBe(100);
    expect(pboltTravelled(p, 400)).toBe(200);
    expect(pboltTravelled(p, 9999)).toBe(200); // không bay quá chỗ máy chủ đã tính
  });

  it("thời gian âm / NaN / vô cực lạ thì coi như chưa bay (đồng hồ lùi không kéo đạn lùi)", () => {
    const p = clean();
    for (const e of [-1, -1e9, NaN, -Infinity]) expect(pboltTravelled(p, e)).toBe(0);
    expect(pboltTravelled(p, Infinity)).toBe(0); // không hữu hạn: không tin
  });

  it("vị trí theo hướng: ngang, xuống, chéo; điểm cuối = vị trí lúc `ms`", () => {
    const out = { x: 0, y: 0 };
    expect(pboltPosition(out, clean(), 200)).toEqual({ x: 200, y: 200 });
    const down = parsePBolt({ ...good, angle: Math.PI / 2 })!;
    const d = pboltPosition({ x: 0, y: 0 }, down, 200);
    expect(d.x).toBeCloseTo(100, 6);
    expect(d.y).toBeCloseTo(300, 6);
    const end = pboltEnd(clean());
    expect(end).toEqual({ x: 300, y: 200 });
    // ghi vào `out`, không cấp phát đối tượng mới
    expect(pboltPosition(out, clean(), 0)).toBe(out);
  });

  it("còn vẽ tới `ms` + PBOLT_FADE_MS; độ đậm 1 khi bay rồi mờ tuyến tính về 0", () => {
    const p = clean();
    expect(pboltAlive(p, 0)).toBe(true);
    expect(pboltAlive(p, p.ms + PBOLT_FADE_MS - 1)).toBe(true);
    expect(pboltAlive(p, p.ms + PBOLT_FADE_MS)).toBe(false);
    expect(pboltAlpha(p, 0)).toBe(1);
    expect(pboltAlpha(p, p.ms)).toBe(1);
    expect(pboltAlpha(p, p.ms + PBOLT_FADE_MS / 2)).toBeCloseTo(0.5, 6);
    expect(pboltAlpha(p, p.ms + PBOLT_FADE_MS)).toBe(0);
    expect(pboltAlpha(p, p.ms + 10 * PBOLT_FADE_MS)).toBe(0);
  });
});

describe("planPBoltEnd: bụi ở cuối đoạn", () => {
  it("MỘT điểm, đúng chỗ cuối đoạn (lệch lên như hạt khác), trễ đúng `ms`, công thức đã đăng ký", () => {
    const plan = pboltPlan(clean(), "hoa", true);
    const pts = planPBoltEnd(plan);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({
      recipe: PBOLT_HIT_RECIPE,
      x: 300,
      y: 200 + PBOLT_Y_OFFSET,
      delayMs: 400,
      priority: 2,
      tint: castTint("hoa"),
    });
    expect(CT2_RECIPES.map((r) => r.id)).toContain(PBOLT_HIT_RECIPE);
  });

  it("của mình ưu tiên 2, của người khác 1; màu theo hệ, hệ lạ rơi về màu trung tính", () => {
    expect(planPBoltEnd(pboltPlan(clean(), "hoa", false))[0]!.priority).toBe(1);
    expect(castTint("hoa")).not.toBe(castTint("thuy"));
    expect(pboltPlan(clean(), "thuy", false).tint).toBe(castTint("thuy"));
    expect(pboltPlan(clean(), "constructor", false).tint).toBe(castTint("none"));
    expect(pboltPlan(clean(), undefined, false).tint).toBe(castTint("none"));
  });
});

describe("pboltLimits: trần theo bậc chất lượng", () => {
  it("Thấp / Vừa / Cao / rất cao; số lạ rơi về mức Thấp", () => {
    expect(pboltLimits(4)).toMatchObject({ total: 8, perOther: 2, detail: false, trail: 0 });
    expect(pboltLimits(10)).toMatchObject({ total: 10, perOther: 3, detail: true, trail: 3 });
    expect(pboltLimits(24)).toMatchObject({ total: 24, perOther: 6, detail: true, trail: 4 });
    expect(pboltLimits(100)).toMatchObject({ total: 32, perOther: 6, trail: 4 });
    expect(pboltLimits(NaN)).toEqual(pboltLimits(4));
    for (const b of [0, 4, 10, 24, 100]) expect(pboltLimits(b).perMine).toBe(PBOLT_MINE_MAX);
  });
});

describe("pboltSlot: trần THEO CHỦ + tổng, tái dùng viên cũ nhất", () => {
  const it_ = (by: string, start: number, mine = false): PBoltSlotItem => ({
    plan: { by, mine },
    start,
  });
  const low = pboltLimits(4); // tổng 8, mỗi người khác 2

  it("còn chỗ thì thêm mới (-1)", () => {
    expect(pboltSlot([], { by: "a", mine: false }, low)).toBe(-1);
    expect(pboltSlot([it_("a", 1)], { by: "a", mine: false }, low)).toBe(-1);
  });

  it("một người khác đủ phần (2) thì thay viên cũ nhất CỦA CHÍNH người đó, không đụng người khác", () => {
    const items = [it_("b", 0), it_("a", 30), it_("a", 10), it_("c", 5)];
    expect(pboltSlot(items, { by: "a", mine: false }, low)).toBe(2);
  });

  it("tổng đã đủ: thay viên cũ nhất của NGƯỜI KHÁC, không thay đạn của mình", () => {
    const items = [
      it_("me", 0, true), // cũ nhất nhưng là của mình
      it_("x", 9),
      it_("y", 3), // cũ nhất của người khác
      it_("z", 8),
      it_("u", 7),
      it_("v", 6),
      it_("w", 5),
      it_("t", 4),
    ];
    expect(items.length).toBe(low.total);
    expect(pboltSlot(items, { by: "q", mine: false }, low)).toBe(2);
    expect(pboltSlot(items, { by: "me", mine: true }, low)).toBe(2);
  });

  it("toàn đạn của mình mà tổng đã đủ: thay viên cũ nhất bất kỳ (không bỏ tin mới)", () => {
    const items = Array.from({ length: 8 }, (_, i) => it_("me", 100 - i, true));
    expect(pboltSlot(items, { by: "me", mine: true }, low)).toBe(7);
  });

  it("đạn của mình có trần riêng 16 (không bị bóp theo bậc chất lượng)", () => {
    const wide = pboltLimits(32);
    const mine = Array.from({ length: PBOLT_MINE_MAX }, (_, i) => it_("me", i, true));
    expect(pboltSlot(mine, { by: "me", mine: true }, wide)).toBe(0); // đủ 16: thay viên cũ nhất
    expect(pboltSlot(mine.slice(1), { by: "me", mine: true }, wide)).toBe(-1); // 15 và tổng còn chỗ
  });

  it("nhiều người cùng bắn: tổng KHÔNG vượt trần dù mỗi người bắn liên tục", () => {
    const items: PBoltSlotItem[] = [];
    const lim = pboltLimits(10);
    let t = 0;
    for (let round = 0; round < 50; round++)
      for (const by of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
        const inc = { by, mine: false };
        const k = pboltSlot(items, inc, lim);
        const entry = it_(by, t++);
        if (k >= 0) items[k] = entry;
        else items.push(entry);
        expect(items.length).toBeLessThanOrEqual(lim.total);
        expect(items.filter((x) => x.plan.by === by).length).toBeLessThanOrEqual(lim.perOther);
      }
  });
});

describe("tất định, không phụ thuộc đồng hồ máy", () => {
  it("nguồn không dùng Math.random / Date.now / performance.now", () => {
    for (const f of ["./pbolt-fx.ts", "./pbolt-layer.ts"]) {
      // bỏ chú thích (có nhắc tên các hàm này) rồi mới tìm trong mã
      const src = readFileSync(new URL(f, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      expect(src, f).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    }
  });
});
