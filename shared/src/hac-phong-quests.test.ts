// Ba việc hằng ngày ở Trạm úy Thanh Lộ (Hắc Phong Cốc, D7 #755): do trạm úy Lôi Báo (tran_uy) giao, dành cho tu sĩ
// Trúc Cơ (realm 2), steps chỉ kill/collect trỏ tới quái/vật phẩm CÓ THẬT và THẬT SỰ SINH / THU ĐƯỢC ở Hắc Phong
// (lang, ho sinh ở cốc; da_ho rơi từ Hắc Hổ). Việc hằng ngày KHÔNG nằm trong chuỗi chính. Test này là chốt chặn:
// đột biến dữ liệu (đổi quái sang bản đồ khác, bỏ daily, thêm "bạn"/chữ Hán, đổi cảnh giới…) phải làm đỏ ít nhất một nó.
import { describe, expect, it } from "vitest";
import {
  QUESTS,
  NPC_BY_ID,
  MONSTER_BY_ID,
  ITEM_BY_ID,
  WILD_MONSTERS,
  DROP_TABLES,
  getMap,
  HAC_PHONG_ID,
} from "./index";

/** Chữ Hán (CJK): lời thoại / mô tả Tiên Giới tiếng Việt, KHÔNG được có. */
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

/** Việc hằng ngày của trạm úy Thanh Lộ: tất cả do tran_uy giao. */
const HP_DAILIES = QUESTS.filter((q) => q.giver === "tran_uy");

describe("việc hằng ngày Hắc Phong (Trúc Cơ, D7 #755)", () => {
  it("đúng BA việc hằng ngày do tran_uy giao; mọi việc đều daily và trạm úy là NPC ở Hắc Phong", () => {
    expect(HP_DAILIES).toHaveLength(3);
    for (const q of HP_DAILIES) {
      expect(q.daily, `${q.id}: phải là việc hằng ngày`).toBe(true);
      expect(q.giver, `${q.id}: người giao`).toBe("tran_uy");
    }
    // Trạm úy phải là NPC đứng ở Hắc Phong Cốc (việc Hắc Phong do NPC Hắc Phong giao)
    expect(NPC_BY_ID.tran_uy, "tran_uy không tồn tại").toBeDefined();
    expect(NPC_BY_ID.tran_uy!.mapId ?? "lac_ha", "tran_uy không ở Hắc Phong").toBe(HAC_PHONG_ID);
  });

  it("mọi việc dành cho Trúc Cơ (realm 2); KHÔNG được đổi sang cảnh giới khác", () => {
    for (const q of HP_DAILIES) {
      expect(q.minRealm, q.id).toBeDefined();
      expect(q.minRealm!.realm, q.id).toBe(2);
    }
  });

  it("việc hằng ngày KHÔNG nằm trong chuỗi chính (next bỏ trống) và có đủ ba nhóm lời thoại không rỗng", () => {
    for (const q of HP_DAILIES) {
      expect(q.next ?? "", `${q.id}: việc lặp KHÔNG nối chuỗi chính`).toBe("");
      expect(q.talk.offer.length, `${q.id}: offer`).toBeGreaterThan(0);
      expect(q.talk.progress.length, `${q.id}: progress`).toBeGreaterThan(0);
      expect(q.talk.complete.length, `${q.id}: complete`).toBeGreaterThan(0);
    }
  });

  it("steps chỉ kill/collect trỏ tới quái/vật phẩm CÓ THẬT và CÙNG sinh ở Hắc Phong", () => {
    const hp = getMap(HAC_PHONG_ID)!;
    for (const q of HP_DAILIES)
      for (const st of q.steps) {
        expect(["kill", "collect"], `${q.id}: bước ${st.kind}`).toContain(st.kind);
        if (st.kind === "kill") {
          expect(MONSTER_BY_ID[st.monster], `${q.id}: ${st.monster}`).toBeDefined();
          // Quái phải sinh ở Hắc Phong (đừng yêu cầu thứ chỉ có ở bản đồ khác)
          expect(
            hp.monsterCapOf(st.monster),
            `${q.id}: ${st.monster} sinh ở Hắc Phong`,
          ).toBeGreaterThan(0);
        }
        if (st.kind === "collect")
          expect(ITEM_BY_ID[st.itemId], `${q.id}: ${st.itemId}`).toBeDefined();
      }
  });

  it("mỗi bước collect nộp món CÓ THẬT và THẬT SỰ THU ĐƯỢC ở Hắc Phong: rơi từ quái sinh ở Hắc Phong (da_ho rơi từ Hắc Hổ)", () => {
    const hp = getMap(HAC_PHONG_ID)!;
    for (const q of HP_DAILIES)
      for (const st of q.steps) {
        if (st.kind !== "collect") continue;
        expect(ITEM_BY_ID[st.itemId], `${q.id}: ${st.itemId} không tồn tại`).toBeDefined();
        const droppedInHacPhong = WILD_MONSTERS.some(
          (m) =>
            hp.monsterCapOf(m.id) > 0 &&
            (DROP_TABLES[m.id] ?? []).some((d) => d.itemId === st.itemId),
        );
        expect(
          droppedInHacPhong,
          `${q.id}: ${st.itemId} KHÔNG thu được ở Hắc Phong (không quái nào sinh ở Hắc Phong rơi nó)`,
        ).toBe(true);
      }
  });

  it("thưởng exp dương; TỔNG exp ba việc NHỎ HƠN việc Vọng Sương (realm 3) — bậc cảnh giới thấp hơn không trả nhiều hơn bậc cao hơn", () => {
    const hpTotal = HP_DAILIES.reduce((a, q) => a + (q.rewards.exp ?? 0), 0);
    expect(
      HP_DAILIES.every((q) => (q.rewards.exp ?? 0) > 0),
      "mọi việc phải có exp",
    ).toBe(true);
    const vsTotal = QUESTS.filter((q) => q.giver === "tram_truong" && q.daily).reduce(
      (a, q) => a + (q.rewards.exp ?? 0),
      0,
    );
    expect(hpTotal, `tổng exp việc Hắc Phong`).toBeGreaterThan(0);
    expect(
      hpTotal < vsTotal,
      `việc Trúc Cơ (Hắc Phong) ${hpTotal} không nên trả nhiều hơn việc Kim Đan (Vọng Sương) ${vsTotal}`,
    ).toBe(true);
  });

  it("thưởng đan chỉ rarity <= 1 (Trúc Cơ): KHÔNG tặng đại hồi đan rarity 2 (dành cho Kim Đan trở lên)", () => {
    for (const q of HP_DAILIES)
      for (const it of q.rewards.items ?? [])
        expect(ITEM_BY_ID[it.itemId]?.rarity, `${q.id}: ${it.itemId} độ hiếm`).toBeLessThanOrEqual(
          1,
        );
  });

  it("tiêu đề và mô tả KHÔNG trùng nhau", () => {
    const titles = HP_DAILIES.map((q) => q.title);
    const descs = HP_DAILIES.map((q) => q.desc);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descs).size).toBe(descs.length);
  });

  it("lời thoại và mô tả KHÔNG xưng 'bạn' và KHÔNG chứa chữ Hán (CJK)", () => {
    for (const q of HP_DAILIES) {
      expect(CJK.test(q.desc), `${q.id}: desc có chữ Hán`).toBe(false);
      for (const group of [q.talk.offer, q.talk.progress, q.talk.complete])
        for (const line of group) {
          expect(CJK.test(line), `${q.id}: "${line}" có chữ Hán`).toBe(false);
          expect(line.includes("bạn"), `${q.id}: xưng "bạn"`).toBe(false);
        }
    }
  });
});
