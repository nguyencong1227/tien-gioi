// CT8 lát 3 (#1053): hành vi THẬT của các chiêu vô sắc có cơ chế mà `skill-kit.test.ts` (chỉ kiểm "dùng được") chưa soi kỹ: KÉO (Cầm Long Khấu, chiêu đầu tiên trong dữ liệu dùng `displace`),
// choáng vùng rộng (Sư Tử Hống), hộ thể (Long Tượng Hộ Thể) và chiêu vận (Huyết Ảnh Xuyên Tâm). Dùng dữ liệu thật `SKILL_BY_ID`; World giả, `Math.random` ghim cho tất định.
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYER_RADIUS, SKILL_BY_ID, TICK_MS } from "@tien-gioi/shared";
import type { PlayerCtrl } from "../world";
import { cast } from "./cast";
import { monsterHasStatus } from "./status";
import { tickWorld } from "./tick";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

afterEach(() => vi.restoreAllMocks());

/** Người dùng đứng ở (1000, 1000) quay sang phải, cảnh giới / bậc ĐỦ cho cả năm chiêu (Nguyên Anh Hậu kỳ). */
function setup() {
  const t = makeWorld();
  const a = addPlayer(t.w, "a", 4, 2);
  a.p.x = 1000;
  a.p.y = 1000;
  a.p.mp = a.p.maxMp;
  vi.spyOn(Math, "random").mockReturnValue(0.4); // không bạo kích; mọi xác suất > 40 % trúng (sunder 50 %, choáng 60-65 %)
  return { ...t, ...a };
}
type T = ReturnType<typeof setup>;
function equip(c: PlayerCtrl, id: string) {
  c.skills.learned[id] = 1;
  c.skills.slots[0] = id;
}
function mon(t: T, x: number, y: number) {
  const r = addMonster(t.w, "tho", x, y);
  r.m.hp = r.m.maxHp = 1e12; // không chết giữa phép đo
  r.mc.def = { ...r.mc.def, aggro: 0, attackCd: 1e9 };
  return r;
}
const fire = (t: T) => cast(t.w, "a", { slot: 2, angle: 0 });
const dmgTo = (t: T, id: string) => t.dmgs.filter((d) => d.target === id);
const stunned = (t: T, id: string) => monsterHasStatus(t.w, id, "stun");
const dist = (t: T, r: ReturnType<typeof mon>) => Math.hypot(r.m.x - t.p.x, r.m.y - t.p.y);

describe("CT8 lát 3: Cầm Long Khấu KÉO mục tiêu về phía người dùng", () => {
  it("quái thường trong tầm bị kéo lại đúng `displace.px` (không vượt sát người dùng); choáng + vỡ giáp gắn lên; quái ngoài hình quạt không bị gì", () => {
    const t = setup();
    equip(t.c, "cam_long_khau");
    const d = SKILL_BY_ID["cam_long_khau"]!;
    const near = mon(t, 1100, 1000); // thẳng trước mặt, trong tầm 110
    const aside = mon(t, 1000, 1100); // vuông góc (quạt hẹp 0,45 pi không phủ)
    const before = dist(t, near);
    fire(t);
    expect(dmgTo(t, near.id).length).toBeGreaterThan(0);
    const gap = near.mc.def.radius + PLAYER_RADIUS + 2;
    expect(before - dist(t, near)).toBeCloseTo(Math.min(d.displace!.px, before - gap), 1);
    expect(stunned(t, near.id), "choáng (0,5 < 0,65)").toBe(true);
    expect(monsterHasStatus(t.w, near.id, "sunder")).toBe(true);
    expect(dmgTo(t, aside.id)).toEqual([]);
    expect(dist(t, aside)).toBeCloseTo(100, 3); // đứng yên
  });

  it("TRÙM miễn kéo (vẫn ăn sát thương)", () => {
    const t = setup();
    equip(t.c, "cam_long_khau");
    const boss = mon(t, 1100, 1000);
    boss.mc.def = { ...boss.mc.def, boss: true };
    fire(t);
    expect(dmgTo(t, boss.id).length).toBeGreaterThan(0);
    expect(boss.m.x).toBe(1100);
  });
});

describe("CT8 lát 3: Sư Tử Hống choáng cả vùng rộng phía trước", () => {
  it("quạt rộng (pi): quái chéo trước mặt bị choáng; quái ngay SAU lưng thì không", () => {
    const t = setup();
    equip(t.c, "su_tu_hong");
    const front = mon(t, 1060, 1000);
    const diag = mon(t, 1040, 1050); // lệch ~51 độ so với hướng nhìn, trong quạt pi (nửa góc 90 độ)
    const behind = mon(t, 940, 1000);
    fire(t);
    for (const m of [front, diag]) {
      expect(dmgTo(t, m.id).length, "trúng").toBeGreaterThan(0);
      expect(stunned(t, m.id), "choáng").toBe(true);
    }
    expect(dmgTo(t, behind.id)).toEqual([]);
    expect(stunned(t, behind.id)).toBe(false);
  });
});

describe("CT8 lát 3: Long Tượng Hộ Thể gắn hộ thể 30 % lên chính người dùng", () => {
  it("không gây sát thương; trạng thái `shield` đúng `ratio` của dữ liệu và còn hiệu lực sau lúc dùng", () => {
    const t = setup();
    equip(t.c, "long_tuong_ho_the");
    const bystander = mon(t, 1030, 1000);
    fire(t);
    const sh = (t.c.st?.list ?? []).find((s) => s.id === "shield");
    expect(sh, "có hộ thể").toBeDefined();
    expect(sh!.ratio).toBeCloseTo(SKILL_BY_ID["long_tuong_ho_the"]!.effects[0]!.ratio, 6);
    expect(dmgTo(t, bystander.id)).toEqual([]);
  });
});

describe("CT8 lát 3: Huyết Ảnh Xuyên Tâm là chiêu VẬN (đường thẳng, tới giờ mới đáp)", () => {
  it("chưa tới giờ vận thì chưa sát thương; tới giờ thì trúng quái trên đường thẳng, không trúng quái lệch hẳn", () => {
    const t = setup();
    equip(t.c, "huyet_anh_xuyen_tam");
    const d = SKILL_BY_ID["huyet_anh_xuyen_tam"]!;
    const onLine = mon(t, 1100, 1000);
    const off = mon(t, 1100, 1100);
    fire(t);
    const run = (ms: number) => {
      for (let i = 0; i < Math.ceil(ms / TICK_MS); i++) {
        t.w.now += TICK_MS;
        tickWorld(t.w, TICK_MS);
      }
    };
    run(d.windupMs! - TICK_MS * 3);
    expect(dmgTo(t, onLine.id)).toEqual([]);
    run(TICK_MS * 5);
    expect(dmgTo(t, onLine.id).length).toBeGreaterThan(0);
    expect(dmgTo(t, off.id)).toEqual([]);
  });
});
