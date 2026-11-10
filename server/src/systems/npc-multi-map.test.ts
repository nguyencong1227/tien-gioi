// NPC theo bản đồ: lái buôn Mạc Thông ở Thanh Lộ Trạm (Hắc Phong Cốc, M3.1). NPC chỉ phục vụ trong phòng của bản đồ mình.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP,
  HAC_PHONG_ID,
  NPC_BY_ID,
  NPC_RANGE,
  buyPrice,
  getMap,
  sellPrice,
} from "@tien-gioi/shared";
import { addPlayer, makeWorld } from "./test-helpers";
import { buy, sell } from "./shop";
import { giveItem } from "./inventory";
import { talk } from "./npc";

const HAC_PHONG = getMap(HAC_PHONG_ID)!;
const LAI_BUON = NPC_BY_ID["lai_buon"]!;
const DUOC_SU = NPC_BY_ID["duoc_su"]!;
const count = (c: { inv: ({ itemId: string; qty: number } | null)[] }, id: string) =>
  c.inv.reduce((n, s) => n + (s?.itemId === id ? s.qty : 0), 0);

/** Người chơi đứng ở (x, y) trong thế giới của bản đồ `map`, có `coin` Linh thạch. */
function at(map: typeof DEFAULT_MAP, x: number, y: number, coin = 500) {
  const t = makeWorld(map);
  const { p, c } = addPlayer(t.w, "a");
  p.x = x;
  p.y = y;
  c.coin = coin;
  return { ...t, p, c };
}

describe("lái buôn Thanh Lộ (Hắc Phong Cốc)", () => {
  it("ở phòng Hắc Phong Cốc, đứng cạnh: nói chuyện thấy lựa chọn Cửa hàng, mua và bán được", () => {
    const { w, c, dialogs, wallets } = at(HAC_PHONG, LAI_BUON.x + 10, LAI_BUON.y);
    talk(w, "a", "lai_buon");
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].msg.npcId).toBe("lai_buon");
    expect(dialogs[0].msg.options.some((o) => o.action.kind === "shop")).toBe(true);

    const price = buyPrice("hoi_huyet_dan");
    buy(w, "a", "lai_buon", "hoi_huyet_dan", 2);
    expect(count(c, "hoi_huyet_dan")).toBe(2);
    expect(c.coin).toBe(500 - 2 * price);

    giveItem(w, "a", "lang_nha_kiem", 1);
    const slot = c.inv.findIndex((s) => s?.itemId === "lang_nha_kiem");
    const before = c.coin;
    sell(w, "a", "lai_buon", slot, 1);
    expect(count(c, "lang_nha_kiem")).toBe(0);
    expect(c.coin).toBe(before + sellPrice("lang_nha_kiem"));
    expect(wallets.length).toBeGreaterThanOrEqual(2);
  });

  it("cùng hàng, cùng giá với Lão Dược Sư (không tạo chênh lệch để lợi dụng)", () => {
    // mua ở một nơi rồi bán ở nơi kia không bao giờ có lời: giá mua / bán chỉ phụ thuộc vật phẩm, không phụ thuộc NPC
    const a = at(HAC_PHONG, LAI_BUON.x, LAI_BUON.y);
    buy(a.w, "a", "lai_buon", "hoi_linh_dan", 1);
    const paidHere = 500 - a.c.coin;
    const b = at(DEFAULT_MAP, DUOC_SU.x, DUOC_SU.y);
    buy(b.w, "a", "duoc_su", "hoi_linh_dan", 1);
    expect(500 - b.c.coin).toBe(paidHere);
  });

  it("NPC của bản đồ khác không phục vụ: Lão Dược Sư vô hiệu ở phòng Hắc Phong Cốc dù toạ độ khớp", () => {
    // đứng đúng chỗ Lão Dược Sư (toạ độ của Lạc Hà) trong thế giới Hắc Phong Cốc: không NPC nào ở đó
    const { w, c, dialogs } = at(HAC_PHONG, DUOC_SU.x, DUOC_SU.y);
    talk(w, "a", "duoc_su");
    buy(w, "a", "duoc_su", "hoi_huyet_dan", 1);
    expect(dialogs).toHaveLength(0);
    expect(count(c, "hoi_huyet_dan")).toBe(0);
    expect(c.coin).toBe(500);
  });

  it("lái buôn vô hiệu ở phòng Lạc Hà dù đứng đúng toạ độ của lái buôn", () => {
    const { w, c, dialogs } = at(DEFAULT_MAP, LAI_BUON.x, LAI_BUON.y);
    talk(w, "a", "lai_buon");
    buy(w, "a", "lai_buon", "hoi_huyet_dan", 1);
    expect(dialogs).toHaveLength(0);
    expect(count(c, "hoi_huyet_dan")).toBe(0);
    expect(c.coin).toBe(500);
  });

  it("đứng quá tầm NPC_RANGE ở Hắc Phong Cốc thì không mua được", () => {
    const { w, c, dialogs } = at(HAC_PHONG, LAI_BUON.x + NPC_RANGE + 20, LAI_BUON.y);
    talk(w, "a", "lai_buon");
    buy(w, "a", "lai_buon", "hoi_huyet_dan", 1);
    expect(dialogs).toHaveLength(0);
    expect(c.coin).toBe(500);
  });
});
