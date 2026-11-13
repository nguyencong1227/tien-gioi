// Rèn bộ Kim Đan trên DỮ LIỆU THẬT (M6, #405): thợ rèn Vọng Sương (`tho_ren_suong`) ở bản đồ Âm Sương, chín công thức `KIM_DAN_RECIPES`
// với phí `coin` thật. `craft-fee.test.ts` đã kiểm luật trừ phí trên một công thức cũ có phí tạm; ở đây kiểm rằng dữ liệu mới + bản đồ
// mới + thợ rèn mới khớp với luật đó (đủ tiền + nguyên liệu thì rèn, thiếu một thứ thì không đổi gì, sai bản đồ / sai thợ thì không rèn).
import { describe, expect, it } from "vitest";
import {
  KIM_DAN_RECIPES,
  NPC_BY_ID,
  NPC_RANGE,
  RECIPE_BY_ID,
  getMap,
  type RecipeDef,
} from "@tien-gioi/shared";
import { addPlayer, makeWorld } from "./test-helpers";
import { giveItem } from "./inventory";
import { craft } from "./npc";

const forge = NPC_BY_ID.tho_ren_suong;
const MAP_ID = "am_suong";

/** Người chơi `a` đứng cạnh `npcId` ở bản đồ `mapId`, có `coin` Linh thạch và đủ nguyên liệu của `rc` cộng thêm `extra` mỗi loại. */
function setup(
  rc: RecipeDef,
  coin: number,
  opts: { mapId?: string; npcId?: string; extra?: number } = {},
) {
  const map = getMap(opts.mapId ?? MAP_ID);
  if (!map) throw new Error("bản đồ không có");
  const t = makeWorld(map);
  const { p, c } = addPlayer(t.w, "a", 1, 0);
  const npc = NPC_BY_ID[opts.npcId ?? "tho_ren_suong"];
  p.x = npc.x + 10;
  p.y = npc.y;
  c.coin = coin;
  for (const g of rc.inputs) giveItem(t.w, "a", g.itemId, g.qty + (opts.extra ?? 0));
  return { ...t, p, c };
}
const qty = (t: ReturnType<typeof setup>, id: string) =>
  t.c.inv.reduce((n, s) => n + (s?.itemId === id ? s.qty : 0), 0);
const snapshot = (t: ReturnType<typeof setup>) => JSON.stringify([t.c.coin, t.c.inv]);

describe("rèn bộ Kim Đan ở Hồ Thiết (Âm Sương), dữ liệu thật", () => {
  it("có đúng chín công thức, đều gắn Hồ Thiết, đều có phí thật và tra được theo id", () => {
    expect(KIM_DAN_RECIPES).toHaveLength(9);
    for (const rc of KIM_DAN_RECIPES) {
      expect(rc.npcId).toBe("tho_ren_suong");
      expect(rc.coin, rc.id).toBeGreaterThan(0);
      expect(RECIPE_BY_ID[rc.id], rc.id).toBe(rc);
    }
    // Hồ Thiết đứng ở Âm Sương, không ở Lạc Hà
    expect(forge.mapId).toBe(MAP_ID);
  });

  it.each(KIM_DAN_RECIPES.map((rc) => [rc.id, rc] as const))(
    "%s: đủ phí + nguyên liệu -> nhận đúng đồ, ví giảm ĐÚNG phí, nguyên liệu trừ đúng",
    (_id, rc) => {
      const t = setup(rc, rc.coin! + 123, { extra: 2 });
      craft(t.w, "a", rc.id);
      expect(t.c.coin).toBe(123);
      expect(qty(t, rc.output.itemId)).toBe(1);
      for (const g of rc.inputs) expect(qty(t, g.itemId), g.itemId).toBe(2);
      expect(t.wallets.at(-1)).toMatchObject({ sid: "a", msg: { coin: 123 } });
      expect(t.toasts.at(-1)?.msg.tone).toBe("good");
    },
  );

  it.each(KIM_DAN_RECIPES.map((rc) => [rc.id, rc] as const))(
    "%s: thiếu 1 Linh thạch -> không đổi gì (ví, túi), không gửi tin ví",
    (_id, rc) => {
      const t = setup(rc, rc.coin! - 1);
      const before = snapshot(t);
      craft(t.w, "a", rc.id);
      expect(snapshot(t)).toBe(before);
      expect(t.wallets).toHaveLength(0);
      expect(t.toasts.at(-1)?.msg.tone).toBe("bad");
    },
  );

  it("báo số Linh thạch cần theo định dạng vi-VN có dấu chấm ngăn nghìn (Hắc Giao kiếm: cần 15.000)", () => {
    const rc = RECIPE_BY_ID.ren_hac_giao_kiem;
    expect(rc.coin).toBe(15000);
    const t = setup(rc, 14999);
    craft(t.w, "a", rc.id);
    expect(t.toasts.at(-1)?.msg.text).toBe("Không đủ Linh thạch (cần 15.000).");
  });

  it("thiếu 1 nguyên liệu (đủ tiền thừa): không mất tiền, không mất nguyên liệu", () => {
    for (const rc of KIM_DAN_RECIPES) {
      const t = setup(rc, rc.coin! * 10);
      // lấy bớt đúng 1 đơn vị của nguyên liệu đầu
      const first = rc.inputs[0];
      const slot = t.c.inv.find((s) => s?.itemId === first.itemId);
      if (!slot) throw new Error("setup không đưa nguyên liệu vào túi");
      slot.qty -= 1;
      const before = snapshot(t);
      craft(t.w, "a", rc.id);
      expect(snapshot(t), rc.id).toBe(before);
      expect(t.toasts.at(-1)?.msg.text, rc.id).toBe("Không đủ nguyên liệu.");
    }
  });

  it("đứng xa Hồ Thiết (quá tầm NPC): không rèn, không đổi gì", () => {
    const rc = RECIPE_BY_ID.ren_suong_vu_kiem;
    const t = setup(rc, 99999);
    t.p.x = forge.x + NPC_RANGE + 50;
    const before = snapshot(t);
    craft(t.w, "a", rc.id);
    expect(snapshot(t)).toBe(before);
    expect(t.wallets).toHaveLength(0);
  });

  it("đứng cạnh thợ rèn LẠC HÀ (bản đồ Lạc Hà) không rèn được bộ Kim Đan: sai bản đồ", () => {
    const rc = RECIPE_BY_ID.ren_suong_vu_kiem;
    const t = setup(rc, 99999, { mapId: "lac_ha", npcId: "tho_ren" });
    const before = snapshot(t);
    craft(t.w, "a", rc.id);
    expect(snapshot(t)).toBe(before);
    expect(t.wallets).toHaveLength(0);
  });

  it("đứng đúng toạ độ Hồ Thiết nhưng ở bản đồ Lạc Hà: không rèn (NPC chỉ có ở bản đồ của mình)", () => {
    const rc = RECIPE_BY_ID.ren_suong_vu_kiem;
    const t = setup(rc, 99999, { mapId: "lac_ha" });
    t.p.x = forge.x;
    t.p.y = forge.y;
    const before = snapshot(t);
    craft(t.w, "a", rc.id);
    expect(snapshot(t)).toBe(before);
  });

  it("Hồ Thiết KHÔNG rèn công thức của thợ rèn Lạc Hà (đúng NPC mới rèn)", () => {
    const rc = RECIPE_BY_ID.ren_lang_nha_kiem;
    expect(rc.npcId).toBe("tho_ren");
    const t = setup(rc, 99999);
    const before = snapshot(t);
    craft(t.w, "a", rc.id);
    expect(snapshot(t)).toBe(before);
  });

  it("rèn liên tiếp cả chín bộ: tổng ví giảm đúng tổng phí, mỗi món được đúng một cái", () => {
    const total = KIM_DAN_RECIPES.reduce((n, rc) => n + rc.coin!, 0);
    const t = setup(KIM_DAN_RECIPES[0], total + 7);
    // đưa đủ nguyên liệu của cả chín công thức (setup mới đưa của công thức đầu)
    const need = new Map<string, number>();
    for (const rc of KIM_DAN_RECIPES)
      for (const g of rc.inputs) need.set(g.itemId, (need.get(g.itemId) ?? 0) + g.qty);
    t.c.inv.fill(null);
    for (const [id, n] of need) giveItem(t.w, "a", id, n);
    for (const rc of KIM_DAN_RECIPES) craft(t.w, "a", rc.id);
    expect(t.c.coin).toBe(7);
    for (const rc of KIM_DAN_RECIPES) expect(qty(t, rc.output.itemId), rc.id).toBe(1);
    for (const id of need.keys()) expect(qty(t, id), id).toBe(0);
  });
});
