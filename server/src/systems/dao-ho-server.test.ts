// Nghề nhỏ lát 1 — tích hợp máy chủ với DỮ LIỆU THẬT của D (#514/#763): chế đan hộ đạo ở Lò đan (`lao_dan`) rồi dùng,
// đột phá cộng đúng `ratio` thật, `forRealm` sai bị từ chối KHÔNG trừ đan. Khác `nghe-nho-server.test.ts` (gắn đan thử
// giả `thu_dan_ho_dao`): đây khép một luồng chơi trọn vẹn với ba đan + công thức + NPC thật của D — chế → dùng → đột phá.
import { describe, expect, it, vi } from "vitest";
import {
  BREAK_FAIL_EXP_LOSS,
  breakthroughChance,
  breakthroughChanceWith,
  ITEM_BY_ID,
  NPC_BY_ID,
  RECIPE_BY_ID,
} from "@tien-gioi/shared";
import { addPlayer, makeWorld } from "./test-helpers";
import { giveItem, useItem } from "./inventory";
import { breakthrough } from "./progression";
import { craft } from "./npc";

const LAO_DAN = NPC_BY_ID.lao_dan!;
const RECIPE = RECIPE_BY_ID.luyen_dot_pha_dan!; // đầu ra dot_pha_dan, phí 500, nguyên liệu thật
const PILL = "dot_pha_dan";
const ratioOf = (id: string) => (ITEM_BY_ID[id]!.effect as { ratio: number }).ratio;
/** Đếm một vật phẩm trong túi (tương đương `countItem` nhưng không cần import thêm). */
const qty = (t: ReturnType<typeof setup>, id: string) =>
  t.c.inv.find((s) => s?.itemId === id)?.qty ?? 0;
const daoHo = (t: ReturnType<typeof setup>) => t.c.st?.list.find((s) => s.id === "dao_ho");

/**
 * Người chơi ở đỉnh cảnh giới `realm` (tầng cuối) với đầy tu vi, đứng cạnh Lò đan, có đủ LS + nguyên liệu chế
 * `luyen_dot_pha_dan`. Mặc định realm 1 (Luyện Khí) — đúng bậc của Đột Phá Đan (`forRealm` 1).
 */
function setup(opts: { realm?: number } = {}) {
  const realm = opts.realm ?? 1;
  const tier = realm === 1 ? 8 : 2; // LK có 9 tầng (tầng cuối = 8); Trúc Cơ/Kim Đan có 3 kỳ (cuối = 2)
  const t = makeWorld();
  const { p, c } = addPlayer(t.w, "a", realm, tier);
  p.x = LAO_DAN.x + 10; // đứng cạnh Lò đan để chế
  p.y = LAO_DAN.y;
  c.coin = RECIPE.coin!; // đủ phí chế
  // Nguyên liệu THẬT của `luyen_dot_pha_dan` (long_tho×10, nanh_soi×8, da_ho×4)
  giveItem(t.w, "a", "long_tho", 10);
  giveItem(t.w, "a", "nanh_soi", 8);
  giveItem(t.w, "a", "da_ho", 4);
  p.exp = p.expMax; // đầy tu vi (đủ hỏa hầu đột phá)
  return { ...t, p, c };
}
/** Chế đan rồi dùng viên vừa chế; trả slot của nó trước khi dùng. */
function craftThenUse(t: ReturnType<typeof setup>): void {
  craft(t.w, "a", RECIPE.id);
  const slot = t.c.inv.findIndex((s) => s?.itemId === PILL);
  useItem(t.w, "a", slot);
}

describe("chế đan hộ đạo thật ở Lò đan (lao_dan)", () => {
  it("craft luyen_dot_pha_dan: trừ nguyên liệu + 500 LS, ra Đột Phá Đan, toast 'Luyện thành công'", () => {
    const t = setup();
    const coinBefore = t.c.coin;
    craft(t.w, "a", RECIPE.id);
    expect(
      t.toasts.some((x) => x.msg.tone === "good" && x.msg.text.includes("Luyện thành công")),
    ).toBe(true);
    expect(t.toasts.at(-1)?.msg.text).toContain("Đột Phá Đan");
    expect(t.c.coin).toBe(coinBefore - RECIPE.coin!); // trừ đúng phí thật (500)
    expect(qty(t, "long_tho")).toBe(0); // nguyên liệu hết
    expect(qty(t, "nanh_soi")).toBe(0);
    expect(qty(t, "da_ho")).toBe(0);
    expect(qty(t, PILL)).toBe(1); // ra đúng một viên đan hộ đạo thật
  });
});

describe("luồng thật: chế → dùng → đột phá (dữ liệu thật)", () => {
  it("ratio thật cộng đúng vào xác suất: breakthroughChance(1)=0,77 + ratio(Đột Phá Đan) → 0,85", () => {
    // Cam kết hợp đồng: số trong desc / EV khớp chance thật (breakthroughChanceWith dùng ratio thật)
    expect(breakthroughChance(1)).toBeCloseTo(0.77, 12);
    expect(breakthroughChanceWith(1, ratioOf(PILL))).toBeCloseTo(0.85, 12);
  });

  it("gốc 0,77 thất bại ở random 0,80; có đan hộ đạo thật (+8%) thì random 0,80 THÀNH CÔNG, rồi GỠ đan", () => {
    // Không có đan: random 0,80 >= 0,77 → thất bại
    const without = setup();
    vi.spyOn(Math, "random").mockReturnValue(0.8);
    breakthrough(without.w, "a");
    expect(without.p.realm).toBe(1); // vẫn LK

    // Có đan thật: chế → dùng (gắn dao_ho ratio 0,08) → random 0,80 < 0,85 → THÀNH CÔNG
    const t = setup();
    craftThenUse(t);
    expect(daoHo(t)?.ratio).toBeCloseTo(ratioOf(PILL), 12); // 0,08 thật
    vi.spyOn(Math, "random").mockReturnValue(0.8);
    const realmBefore = t.p.realm;
    breakthrough(t.w, "a");
    expect(t.p.realm).toBe(realmBefore + 1); // LK → TC
    expect(daoHo(t)).toBeUndefined(); // đan đã bị gỡ dù thành công
  });

  it("random trên ngưỡng có đan (0,90 ≥ 0,85) thì THẤT BẠI; đan vẫn bị tiêu + mất 30% tu vi (BREAK_FAIL_EXP_LOSS)", () => {
    const t = setup();
    craftThenUse(t);
    expect(daoHo(t)?.ratio).toBeCloseTo(0.08, 12);
    const expBefore = t.p.exp;
    vi.spyOn(Math, "random").mockReturnValue(0.9); // 0,90 >= 0,85: thất bại
    breakthrough(t.w, "a");
    expect(t.p.realm).toBe(1); // vẫn LK
    expect(daoHo(t)).toBeUndefined(); // đan tiêu dù thất bại
    expect(t.p.exp).toBe(Math.floor(expBefore * (1 - BREAK_FAIL_EXP_LOSS)));
  });
});

describe("forRealm sai: dùng đan sai cảnh giới bị từ chối, KHÔNG trừ đan", () => {
  it("Đột Phá Đan (forRealm 1) dùng cho người Trúc Cơ (realm 2) ở đỉnh: từ chối, đan còn nguyên", () => {
    const t = setup({ realm: 2 }); // Trúc Cơ đỉnh tầng cuối, ĐỦ điều kiện đột phá TC→KD
    craftThenUse(t);
    // Chỉ lý do forRealm sai (p.realm=2 ≠ forRealm=1) mới từ chối; người này đã đạt đỉnh + đầy tu vi
    expect(daoHo(t)).toBeUndefined();
    expect(qty(t, PILL)).toBe(1); // đan KHÔNG bị trừ
    expect(t.toasts.at(-1)?.msg.text).toContain("chỉ dùng khi đã đạt đỉnh Luyện Khí");
  });

  it("Đột Phá Đan (forRealm 1) dùng khi chưa đầy tu vi: từ chối, đan còn nguyên", () => {
    const t = setup();
    craft(t.w, "a", RECIPE.id);
    t.p.exp = t.p.expMax - 1; // tụt tu vi sau khi chế (hết hỏa hầu)
    const slot = t.c.inv.findIndex((s) => s?.itemId === PILL);
    useItem(t.w, "a", slot);
    expect(daoHo(t)).toBeUndefined();
    expect(qty(t, PILL)).toBe(1);
  });
});
