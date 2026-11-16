// Hệ số tu vi THỬ NGHIỆM (`Player.testExpMult`, QUYET_DINH_M3 mục 34): nhân MỌI nguồn tu vi sau các hệ số khác; không đổi gì khác; người khác không bị ảnh hưởng.
import { describe, expect, it } from "vitest";
import { ITEM_BY_ID, NPC_BY_ID, expPillGain, meditateExpPerSec } from "@tien-gioi/shared";
import { killMonster } from "./combat";
import { gainExp, EXP_FLUSH_MS } from "./progression";
import { tickWorld } from "./tick";
import { giveItem, useItem } from "./inventory";
import { acceptQuest, talk, turnInQuest } from "./npc";
import { refreshQuests } from "./quests";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

/** Hạ một con quái `kind` cho người `name` (góp toàn bộ sát thương) rồi trả tu vi người đó nhận được. */
function killFor(
  t: ReturnType<typeof makeWorld>,
  who: ReturnType<typeof addPlayer>,
  kind = "lang",
) {
  const before = who.p.exp;
  const { id, mc } = addMonster(t.w, kind, who.p.x + 20, who.p.y);
  mc.damageBy.set(who.p.name, 100);
  killMonster(t.w, id, mc);
  return who.p.exp - before;
}

describe("gainExp: hệ số thử nghiệm nhân sau cùng", () => {
  it("mặc định 1: không nhân; x5 nhân đúng 5 lần; chân linh (scale) và hệ số thử nghiệm NHÂN CHỒNG nhau", () => {
    const t = makeWorld();
    const a = addPlayer(t.w, "a", 1, 0);
    const b = addPlayer(t.w, "b", 1, 0);
    expect(a.p.testExpMult).toBe(1);
    b.p.testExpMult = 5;
    gainExp(t.w, "a", a.p, 10);
    gainExp(t.w, "b", b.p, 10);
    expect(a.p.exp).toBe(10);
    expect(b.p.exp).toBe(50);
    // scale (Dư âm) x2 rồi thử nghiệm x5 = x10
    gainExp(t.w, "b", b.p, 10, 2);
    expect(b.p.exp).toBe(150);
  });

  it("hệ số ngoài 1-10 (không bao giờ đặt ra) bị coi là 1: không thể làm tu vi vọt", () => {
    const t = makeWorld();
    const a = addPlayer(t.w, "a", 1, 0);
    for (const bad of [0, 11, 255]) {
      a.p.exp = 0;
      a.p.testExpMult = bad;
      gainExp(t.w, "a", a.p, 10);
      expect(a.p.exp, `hệ số ${bad}`).toBe(10);
    }
    a.p.exp = 0;
    a.p.testExpMult = 10;
    gainExp(t.w, "a", a.p, 10);
    expect(a.p.exp).toBe(100); // biên trên hợp lệ
  });

  it("vẫn dừng ở đầy khi tới bậc cuối của cảnh giới (chờ Đột phá), không tràn", () => {
    const t = makeWorld();
    const a = addPlayer(t.w, "a", 1, 8); // tầng cuối Luyện Khí
    a.p.testExpMult = 10;
    gainExp(t.w, "a", a.p, a.p.expMax); // x10 vượt xa
    expect(a.p.exp).toBe(a.p.expMax);
    expect(a.p.tier).toBe(8);
  });
});

describe("mọi nguồn tu vi đều qua hệ số thử nghiệm (x5), người thường không đổi", () => {
  it("hạ quái: người x5 nhận gấp 5 so với người thường cùng điều kiện", () => {
    const t = makeWorld();
    const a = addPlayer(t.w, "a", 1, 0);
    const b = addPlayer(t.w, "b", 1, 0);
    b.p.testExpMult = 5;
    const ga = killFor(t, a);
    const gb = killFor(t, b);
    expect(ga).toBeGreaterThan(0);
    expect(gb).toBeCloseTo(ga * 5, 6);
  });

  it("đả tọa: tu vi ghi mỗi giây nhân x5", () => {
    const t = makeWorld();
    const a = addPlayer(t.w, "a", 1, 0);
    const b = addPlayer(t.w, "b", 1, 0);
    b.p.testExpMult = 5;
    for (const x of [a, b]) {
      x.p.x = t.w.map.townPx.x;
      x.p.y = t.w.map.townPx.y;
      x.p.meditating = true;
    }
    const ticks = Math.ceil((EXP_FLUSH_MS * 3) / 50);
    for (let i = 0; i < ticks; i++) tickWorld(t.w, 50);
    expect(a.p.exp).toBeGreaterThan(0);
    expect(b.p.exp).toBeCloseTo(a.p.exp * 5, 6);
    // đối chiếu số tuyệt đối: người thường nhận đúng tốc độ đả tọa, không hơn
    expect(a.p.exp).toBeLessThanOrEqual(meditateExpPerSec(1, 0) * (ticks * 0.05 + 0.1));
  });

  it("đan tu vi (phần trăm thanh): người x5 nhận gấp 5", () => {
    const t = makeWorld();
    const a = addPlayer(t.w, "a", 1, 0);
    const b = addPlayer(t.w, "b", 1, 0);
    b.p.testExpMult = 5;
    const pillId = "tu_khi_dan";
    const eff = ITEM_BY_ID[pillId]!.effect as { kind: "exp"; pct: number; maxExp?: number };
    expect(eff.kind).toBe("exp");
    for (const [sid, x] of [
      ["a", a],
      ["b", b],
    ] as const) {
      giveItem(t.w, sid, pillId, 1);
      const slot = x.c.inv.findIndex((s) => s?.itemId === pillId);
      useItem(t.w, sid, slot);
    }
    const gain = expPillGain(eff, a.p.expMax);
    expect(gain).toBeGreaterThan(0);
    expect(a.p.exp).toBe(gain);
    expect(b.p.exp).toBe(gain * 5);
  });

  it("thưởng nhiệm vụ (số cố định): người x5 nhận gấp 5 (nhiệm vụ Nhập thế thưởng 15)", () => {
    const t = makeWorld();
    // Luyện Khí tầng 1 (thanh tu vi đủ lớn: Phàm Nhân chỉ có 40 nên x5 bị trần chặn, không đo được hệ số)
    const a = addPlayer(t.w, "a", 1, 0);
    const b = addPlayer(t.w, "b", 1, 0);
    b.p.testExpMult = 5;
    const near = (x: typeof a, npcId: string) => {
      const n = NPC_BY_ID[npcId]!;
      x.p.x = n.x + 10;
      x.p.y = n.y;
    };
    for (const [sid, x] of [
      ["a", a],
      ["b", b],
    ] as const) {
      near(x, "truong_tran");
      acceptQuest(t.w, sid, "nhap_the");
      near(x, "duoc_su");
      talk(t.w, sid, "duoc_su");
      refreshQuests(t.w, sid);
      near(x, "truong_tran");
      turnInQuest(t.w, sid, "nhap_the");
      expect(x.c.quests.done, `${sid} đã trả nhiệm vụ`).toContain("nhap_the");
    }
    expect(a.p.exp).toBe(15);
    expect(b.p.exp).toBe(75);
  });
});

describe("không đổi gì ngoài tu vi", () => {
  it("rơi đồ và Linh thạch của hạ quái KHÔNG đổi theo hệ số thử nghiệm (chạy cùng seed Math.random)", () => {
    const run = (mult: number) => {
      const t = makeWorld();
      const a = addPlayer(t.w, "a", 1, 0);
      a.p.testExpMult = mult;
      let s = 12345;
      const orig = Math.random;
      Math.random = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
      try {
        for (let i = 0; i < 6; i++) killFor(t, a);
      } finally {
        Math.random = orig;
      }
      return {
        coin: a.c.coin,
        loot: [...t.w.state.loot.values()].map((d) => `${d.itemId}:${d.qty}`).sort(),
        inv: JSON.stringify(a.c.inv),
      };
    };
    expect(run(5)).toEqual(run(1));
  });
});
