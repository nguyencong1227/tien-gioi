// Rèn đồ có phí Linh thạch (M6, #405): `RecipeDef.coin`. Phí tạm gắn lên một công thức cũ (thợ rèn Lạc Hà) để không phụ thuộc bản đồ mới.
import { afterEach, describe, expect, it } from "vitest";
import { INVENTORY_SLOTS, NPC_BY_ID, RECIPE_BY_ID, COIN_CAP } from "@tien-gioi/shared";
import { addPlayer, makeWorld } from "./test-helpers";
import { giveItem } from "./inventory";
import { craft } from "./npc";

const rc = RECIPE_BY_ID.ren_lang_nha_kiem; // 8 nanh sói + 4 lông thỏ, thợ rèn Lạc Hà
const saved = rc.coin;
afterEach(() => {
  if (saved === undefined) delete rc.coin;
  else rc.coin = saved;
});

function setup(coin: number, fee: number | null = 500) {
  if (fee === null) delete rc.coin;
  else rc.coin = fee;
  const t = makeWorld();
  const { p, c } = addPlayer(t.w, "a", 1, 0);
  p.x = NPC_BY_ID.tho_ren.x + 10;
  p.y = NPC_BY_ID.tho_ren.y;
  c.coin = coin;
  giveItem(t.w, "a", "nanh_soi", 10);
  giveItem(t.w, "a", "long_tho", 4);
  return { ...t, p, c };
}
const has = (t: ReturnType<typeof setup>, id: string) => t.c.inv.some((s) => s?.itemId === id);
const snapshot = (t: ReturnType<typeof setup>) => JSON.stringify([t.c.coin, t.c.inv]);

describe("rèn có phí Linh thạch", () => {
  it("đủ tiền + nguyên liệu: trừ ĐÚNG phí, trừ nguyên liệu, nhận đồ, gửi tin ví cho chủ", () => {
    const t = setup(1200, 500);
    craft(t.w, "a", rc.id);
    expect(t.c.coin).toBe(700);
    expect(has(t, "lang_nha_kiem")).toBe(true);
    expect(t.c.inv.find((s) => s?.itemId === "nanh_soi")?.qty).toBe(2);
    expect(t.wallets.at(-1)).toMatchObject({ sid: "a", msg: { coin: 700 } });
    expect(t.toasts.at(-1)?.msg.text).toContain("Rèn thành công");
  });

  it("đúng bằng phí thì rèn được và ví về 0", () => {
    const t = setup(500, 500);
    craft(t.w, "a", rc.id);
    expect(t.c.coin).toBe(0);
    expect(has(t, "lang_nha_kiem")).toBe(true);
  });

  it("thiếu 1 Linh thạch: không đổi gì (ví, túi), báo cần bao nhiêu", () => {
    const t = setup(499, 500);
    const before = snapshot(t);
    craft(t.w, "a", rc.id);
    expect(snapshot(t)).toBe(before);
    expect(t.toasts.at(-1)?.msg.text).toMatch(/Không đủ Linh thạch \(cần 500\)/);
    expect(t.wallets).toHaveLength(0); // không gửi tin ví khi không đổi gì
  });

  it("thiếu nguyên liệu: không mất tiền", () => {
    const t = setup(9999, 500);
    t.c.inv.fill(null);
    giveItem(t.w, "a", "nanh_soi", 7); // thiếu 1
    giveItem(t.w, "a", "long_tho", 4);
    const before = snapshot(t);
    craft(t.w, "a", rc.id);
    expect(snapshot(t)).toBe(before);
    expect(t.toasts.at(-1)?.msg.text).toBe("Không đủ nguyên liệu.");
  });

  it("túi đầy: KHÔNG mất tiền (kiểm chỗ túi trước khi trừ phí)", () => {
    const t = setup(9999, 500);
    for (let i = 0; i < INVENTORY_SLOTS; i++) t.c.inv[i] = { itemId: "da_ho", qty: 99 };
    t.c.inv[0] = { itemId: "nanh_soi", qty: 9 };
    t.c.inv[1] = { itemId: "long_tho", qty: 5 };
    const before = snapshot(t);
    craft(t.w, "a", rc.id);
    expect(snapshot(t)).toBe(before);
    expect(t.toasts.at(-1)?.msg.text).toBe("Túi đồ đã đầy.");
  });

  it("đứng xa thợ rèn: không đổi gì", () => {
    const t = setup(9999, 500);
    t.p.x += 300;
    const before = snapshot(t);
    craft(t.w, "a", rc.id);
    expect(snapshot(t)).toBe(before);
  });

  it("công thức không phí (thiếu `coin`) vẫn miễn phí như trước, kể cả khi ví trống", () => {
    const t = setup(0, null);
    craft(t.w, "a", rc.id);
    expect(t.c.coin).toBe(0);
    expect(has(t, "lang_nha_kiem")).toBe(true);
    expect(t.wallets).toHaveLength(0);
  });

  it("phí hỏng (âm, 0, lẻ, NaN, vô hạn) coi là miễn phí: không bao giờ CỘNG tiền cho người rèn", () => {
    for (const bad of [-500, 0, 2.5, Number.NaN, Infinity, -Infinity]) {
      const t = setup(100, bad);
      craft(t.w, "a", rc.id);
      expect(t.c.coin, `phí ${bad}`).toBe(100);
      expect(has(t, "lang_nha_kiem"), `phí ${bad}`).toBe(true);
    }
  });

  it("phí vượt trần ví bị kẹp ở COIN_CAP (không thể rèn được nếu không có đủ): không tràn số", () => {
    const t = setup(COIN_CAP - 1, COIN_CAP * 4);
    const before = snapshot(t);
    craft(t.w, "a", rc.id);
    expect(snapshot(t)).toBe(before); // thiếu 1 Linh thạch so với trần
    const t2 = setup(COIN_CAP, COIN_CAP * 4);
    craft(t2.w, "a", rc.id);
    expect(t2.c.coin).toBe(0);
  });
});
