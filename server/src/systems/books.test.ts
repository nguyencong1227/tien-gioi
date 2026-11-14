// Kinh quyển THẬT (M7.4, #505) từ đầu tới cuối trên máy chủ: mua ở cửa hàng, đọc để học, quyển trùng tăng tầng, chưa đủ cảnh giới thì từ chối, quyển rơi từ quái.
// (`skills.test.ts` kiểm luật học bằng quyển thử; ở đây dùng quyển thật của `SKILLS_M7`.)
import { describe, expect, it } from "vitest";
import { NPC_BY_ID, SKILLS_M7, bookIdOf, buyPrice } from "@tien-gioi/shared";
import { buy } from "./shop";
import { useItem } from "./inventory";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { dealMonsterDamage } from "./combat";
import { changeCoin } from "./wallet";
import { vi } from "vitest";

const HOA = bookIdOf("hoa_van_kiem");

function near(t: ReturnType<typeof makeWorld>, p: { x: number; y: number }, npc: string) {
  p.x = NPC_BY_ID[npc].x + 5;
  p.y = NPC_BY_ID[npc].y;
}

describe("kinh quyển thật: mua rồi đọc", () => {
  it("mua Hỏa Vân Kiếm Pháp ở Lão dược sư (đúng giá, đúng một quyển), đọc ở Luyện Khí: học chiêu, quyển mất một", () => {
    const t = makeWorld();
    const a = addPlayer(t.w, "a", 1, 0);
    near(t, a.p, "duoc_su");
    changeCoin(t.w, "a", 1000);
    const coin0 = a.c.coin;
    buy(t.w, "a", "duoc_su", HOA, 1);
    expect(coin0 - a.c.coin).toBe(buyPrice(HOA));
    const slot = a.c.inv.findIndex((s) => s?.itemId === HOA);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(a.c.inv[slot]!.qty).toBe(1);
    useItem(t.w, "a", slot);
    expect(a.c.skills.learned.hoa_van_kiem).toBe(1);
    expect(a.c.inv[slot]).toBeNull(); // quyển cuối đã đọc hết
  });

  it("đọc quyển trùng tăng tầng (tối đa 3); Phàm Nhân chưa đủ cảnh giới không học được và quyển còn nguyên", () => {
    const t = makeWorld();
    const a = addPlayer(t.w, "a", 1, 0);
    a.c.inv[0] = { itemId: HOA, qty: 3 };
    for (const want of [1, 2, 3]) {
      useItem(t.w, "a", 0);
      expect(a.c.skills.learned.hoa_van_kiem).toBe(want);
    }
    const low = addPlayer(t.w, "b", 0, 0);
    low.c.inv[0] = { itemId: HOA, qty: 1 };
    useItem(t.w, "b", 0);
    expect(low.c.skills.learned.hoa_van_kiem).toBeUndefined();
    expect(low.c.inv[0]).toEqual({ itemId: HOA, qty: 1 });
  });

  it("MỌI quyển của 12 chiêu dạy đúng chiêu của nó khi người chơi đủ cảnh giới", () => {
    for (const def of SKILLS_M7) {
      const t = makeWorld();
      const a = addPlayer(t.w, "a", def.reqRealm, def.reqTier);
      a.c.inv[0] = { itemId: bookIdOf(def.id), qty: 1 };
      useItem(t.w, "a", 0);
      expect(a.c.skills.learned[def.id], def.id).toBe(1);
    }
  });
});

describe("kinh quyển rơi từ quái", () => {
  it("trùm Xích Mãng chết (tung trúng mọi mục) rơi kinh quyển cao cấp xuống đất", () => {
    const t = makeWorld();
    const a = addPlayer(t.w, "a", 2, 0);
    const m = addMonster(t.w, "mang", a.p.x + 30, a.p.y);
    vi.spyOn(Math, "random").mockReturnValue(0);
    dealMonsterDamage(t.w, m.id, t.w.state.monsters.get(m.id)!, "a", 1e12, false);
    vi.restoreAllMocks();
    const ids = [...t.w.state.loot.values()].map((l) => l.itemId);
    expect(ids).toContain(bookIdOf("thanh_tung_phi_cham"));
    expect(ids).toContain(bookIdOf("cuu_cung_khon_sat"));
  });
});
