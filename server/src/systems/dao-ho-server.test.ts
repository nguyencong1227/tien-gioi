// Nghề nhỏ lát 1 — tích hợp máy chủ với DỮ LIỆU THẬT của D (#514/#763): chế đan hộ đạo ở Lò đan (`lao_dan`) rồi dùng,
// đột phá cộng đúng `ratio` thật, `forRealm` sai bị từ chối KHÔNG trừ đan. Khác `nghe-nho-server.test.ts` (gắn đan thử
// giả `thu_dan_ho_dao`): đây khép một luồng chơi trọn vẹn với ba đan + công thức + NPC thật của D — chế → dùng → đột phá.
import { afterEach, describe, expect, it, vi } from "vitest";
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
/** Id công thức chế của mỗi đan hộ đạo (cho `it.each` ba viên dưới). */
const DAO_HO_RECIPE_OF: Record<string, string> = {
  dot_pha_dan: "luyen_dot_pha_dan",
  kinh_chi_dan: "luyen_kinh_chi_dan",
  duong_anh_dan: "luyen_duong_anh_dan",
};
const ratioOf = (id: string) => (ITEM_BY_ID[id]!.effect as { ratio: number }).ratio;
/** Đếm một vật phẩm trong túi (tương đương `countItem` nhưng không cần import thêm). */
const qty = (t: ReturnType<typeof setup>, id: string) =>
  t.c.inv.find((s) => s?.itemId === id)?.qty ?? 0;
const daoHo = (t: ReturnType<typeof setup>) => t.c.st?.list.find((s) => s.id === "dao_ho");

/**
 * Người chơi ở đỉnh cảnh giới `realm` (tầng cuối) với đầy tu vi, đứng cạnh Lò đan, có đủ LS + nguyên liệu chế
 * đan hộ đạo `pill`. Mặc định realm 1 (Luyện Khí) + Đột Phá Đan — đúng bậc của `forRealm` 1.
 */
function setup(opts: { realm?: number; pill?: string } = {}) {
  const realm = opts.realm ?? 1;
  const pill = opts.pill ?? PILL;
  const recipe = RECIPE_BY_ID[DAO_HO_RECIPE_OF[pill]!]!; // công thức THẬT của viên đan này
  const tier = realm === 1 ? 8 : 2; // LK có 9 tầng (tầng cuối = 8); Trúc Cơ/Kim Đan có 3 kỳ (cuối = 2)
  const t = makeWorld();
  const { p, c } = addPlayer(t.w, "a", realm, tier);
  p.x = LAO_DAN.x + 10; // đứng cạnh Lò đan để chế
  p.y = LAO_DAN.y;
  c.coin = recipe.coin!; // đủ phí chế
  for (const m of recipe.inputs) giveItem(t.w, "a", m.itemId, m.qty); // nguyên liệu THẬT của công thức
  p.exp = p.expMax; // đầy tu vi (đủ hỏa hầu đột phá)
  return { ...t, p, c };
}
/** Chế đan rồi dùng viên vừa chế; trả slot của nó trước khi dùng. */
function craftThenUse(t: ReturnType<typeof setup>, pill: string = PILL): void {
  craft(t.w, "a", DAO_HO_RECIPE_OF[pill]!);
  const slot = t.c.inv.findIndex((s) => s?.itemId === pill);
  useItem(t.w, "a", slot);
}

// `vitest.config` KHÔNG có `restoreMocks`: mỗi test spy `Math.random` phải tự trả lại, kẻo mock rò sang test kế.
afterEach(() => vi.restoreAllMocks());

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

describe("ba đan hộ đạo: ratio thật cộng đúng ở ĐÚNG bậc (dữ liệu thật, mọi bậc)", () => {
  // Với MỖI viên: người ở đỉnh cảnh giới đúng (`forRealm`), dùng đan → `dao_ho.ratio` = ratio thật;
  // random ngay dưới ngưỡng đột phá (`p + ratio`) thì THÀNH CÔNG, ngay trên ngưỡng thì THẤT BẠI (đan tiêu, mất 30% tu vi).
  it.each([
    ["dot_pha_dan", 1],
    ["kinh_chi_dan", 2],
    ["duong_anh_dan", 3],
  ] as const)(
    "%s (forRealm %d): ratio thật gắn đúng; random ngay dưới ngưỡng THÀNH CÔNG, ngay trên ngưỡng THẤT BẠI",
    (pill, realm) => {
      const ratio = ratioOf(pill);
      const p = breakthroughChance(realm); // p(gốc) theo cảnh giới
      // --- THÀNH CÔNG: random ngay dưới ngưỡng (p + ratio) ---
      const ok = setup({ realm, pill });
      craftThenUse(ok, pill);
      expect(daoHo(ok)?.ratio).toBeCloseTo(ratio, 12); // ratio THẬT gắn đúng (0,08 / 0,10 / 0,12)
      vi.spyOn(Math, "random").mockReturnValue(p + ratio - 0.001); // ngay dưới ngưỡng → thành công
      breakthrough(ok.w, "a");
      expect(ok.p.realm).toBe(realm + 1); // đột phá lên bậc kế
      expect(daoHo(ok)).toBeUndefined(); // đan bị gỡ dù thành công

      // --- THẤT BẠI: random ngay trên ngưỡng (p + ratio) ---
      const no = setup({ realm, pill });
      craftThenUse(no, pill);
      expect(daoHo(no)?.ratio).toBeCloseTo(ratio, 12);
      const expBefore = no.p.exp;
      vi.spyOn(Math, "random").mockReturnValue(p + ratio + 0.001); // ngay trên ngưỡng → thất bại
      breakthrough(no.w, "a");
      expect(no.p.realm).toBe(realm); // vẫn ở bậc cũ
      expect(daoHo(no)).toBeUndefined(); // đan tiêu dù thất bại
      expect(no.p.exp).toBe(Math.floor(expBefore * (1 - BREAK_FAIL_EXP_LOSS))); // mất 30% tu vi
    },
  );
});
