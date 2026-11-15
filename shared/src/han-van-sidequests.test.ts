// Ba việc phụ ở Hàn Vân Trạm gắn kinh quyển Nguyên Anh đợt 2 (M7.9, #725): mỗi việc một NPC, một tầng cảnh giới (0/1/2),
// steps chỉ kill/collect/talk trỏ tới quái/vật phẩm Nguyên Anh có thật, thưởng exp trong khung và KHÔNG QUÁ MỘT kinh quyển
// rarity 2 mỗi nhiệm vụ (rarity 3 chỉ rơi từ quái). Test này là chốt chặn: đột biến dữ liệu phải làm đỏ ít nhất một nó.
import { describe, expect, it } from "vitest";
import {
  QUESTS,
  NPC_BY_ID,
  MONSTER_BY_ID,
  ITEM_BY_ID,
  SKILL_BY_ID,
  getMap,
  HAN_VAN_ID,
  stepOf,
} from "./index";

/** Chữ Hán (CJK): lời thoại / mô tả Tiên Giới tiếng Việt, KHÔNG được có. */
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

/** Ba NPC Hàn Vân được phép giao việc phụ (trạm trưởng / thợ rèn / lái buôn). */
const HAN_VAN_GIVERS = ["tram_truong_han", "tho_ren_han", "lai_buon_han"];

/** Việc phụ Hàn Vân: do NPC Hàn Vân giao, không lặp, không thuộc chuỗi chính, mô tả mở đầu bằng tiền tố việc phụ. */
const HAN_VAN_SIDE = QUESTS.filter(
  (q) =>
    HAN_VAN_GIVERS.includes(q.giver) && !q.daily && q.desc.startsWith("Việc phụ (không bắt buộc)"),
);

describe("việc phụ Hàn Vân gắn kinh quyển Nguyên Anh đợt 2 (#725)", () => {
  it("đúng BA việc phụ; mỗi việc một NPC giao, NPC đều có thật và khác nhau", () => {
    expect(HAN_VAN_SIDE).toHaveLength(3);
    const givers = HAN_VAN_SIDE.map((q) => q.giver);
    for (const g of givers) expect(NPC_BY_ID[g], g).toBeDefined();
    expect(new Set(givers).size).toBe(givers.length); // ba NPC khác nhau
  });

  it("mọi việc đều có minRealm Nguyên Anh (realm 4) với BA tầng khác nhau (0/1/2)", () => {
    for (const q of HAN_VAN_SIDE) {
      expect(q.minRealm, q.id).toBeDefined();
      expect(q.minRealm!.realm, q.id).toBe(4); // KHÔNG được hạ xuống 3
    }
    const tiers = HAN_VAN_SIDE.map((q) => q.minRealm!.tier).sort((a, b) => a - b);
    expect(tiers).toEqual([0, 1, 2]); // ba tầng khác nhau
  });

  it("mọi việc có đủ ba nhóm lời thoại (offer/progress/complete), mỗi nhóm không rỗng", () => {
    for (const q of HAN_VAN_SIDE) {
      expect(q.talk.offer.length, `${q.id}: offer`).toBeGreaterThan(0);
      expect(q.talk.progress.length, `${q.id}: progress`).toBeGreaterThan(0);
      expect(q.talk.complete.length, `${q.id}: complete`).toBeGreaterThan(0);
    }
  });

  it("steps chỉ dùng kill/collect/talk trỏ tới quái/vật phẩm Nguyên Anh có thật (quái chỉ sinh ở Hàn Vân)", () => {
    const hv = getMap(HAN_VAN_ID)!;
    for (const q of HAN_VAN_SIDE)
      for (const st of q.steps) {
        expect(["kill", "collect", "talk"], `${q.id}: bước ${st.kind}`).toContain(st.kind);
        if (st.kind === "kill") {
          expect(MONSTER_BY_ID[st.monster], `${q.id}: ${st.monster}`).toBeDefined();
          expect(
            hv.monsterCapOf(st.monster),
            `${q.id}: ${st.monster} sinh ở Hàn Vân`,
          ).toBeGreaterThan(0);
        }
        if (st.kind === "collect")
          expect(ITEM_BY_ID[st.itemId], `${q.id}: ${st.itemId}`).toBeDefined();
        if (st.kind === "talk") expect(NPC_BY_ID[st.npcId], `${q.id}: ${st.npcId}`).toBeDefined();
      }
  });

  it("thưởng exp trong khung: tầng 0 ∈ [3960, 7260], tăng đều theo tầng, tối đa 9000 ở tầng 2", () => {
    const exp = new Map<number, number>();
    for (const q of HAN_VAN_SIDE) {
      expect(typeof q.rewards.exp, `${q.id}: exp`).toBe("number");
      exp.set(q.minRealm!.tier, q.rewards.exp!);
    }
    const e0 = exp.get(0)!,
      e1 = exp.get(1)!,
      e2 = exp.get(2)!;
    expect(e0).toBeGreaterThanOrEqual(3960); // floor(0.6 · 6600)
    expect(e0).toBeLessThanOrEqual(7260); // ceil(1.1 · 6600)
    expect(e2).toBeLessThanOrEqual(9000);
    // tăng đều theo tầng (chênh bằng nhau)
    expect(e1 - e0).toBe(e2 - e1);
  });

  it("thưởng KHÔNG QUÁ MỘT kinh quyển rarity 2 mỗi nhiệm vụ; CHỈ rarity 2 (rarity 3 chỉ rơi từ quái); mỗi quyển KHÔNG quá một nhiệm vụ", () => {
    const bookCount = new Map<string, number>();
    for (const q of HAN_VAN_SIDE) {
      const books = (q.rewards.items ?? []).filter((i) => ITEM_BY_ID[i.itemId]?.type === "book");
      expect(books.length, `${q.id}: quá 1 kinh quyển thưởng`).toBeLessThanOrEqual(1);
      for (const b of books) {
        const it = ITEM_BY_ID[b.itemId];
        // rarity 3 chỉ rơi từ quái/trùm, KHÔNG được thưởng nhiệm vụ
        expect(it.rarity, `${q.id}: ${b.itemId} độ hiếm`).toBe(2);
        // quyển phải dạy chiêu CÓ THẬT và học được ngay lúc nhận (đủ cảnh giới so với minRealm)
        const skill = SKILL_BY_ID[it.teaches ?? ""];
        expect(skill, `${q.id}: ${b.itemId} dạy chiêu không tồn tại`).toBeDefined();
        expect(
          stepOf(skill.reqRealm, skill.reqTier),
          `${q.id}: ${b.itemId} cần cảnh giới`,
        ).toBeLessThanOrEqual(stepOf(q.minRealm!.realm, q.minRealm!.tier));
        bookCount.set(b.itemId, (bookCount.get(b.itemId) ?? 0) + 1);
      }
    }
    // Mỗi kinh quyển đợt 2 không xuất hiện ở quá một nhiệm vụ
    for (const [id, n] of bookCount) expect(n, `${id} thưởng ở nhiều nhiệm vụ`).toBe(1);
  });

  it("mô tả và lời thoại không chứa chữ Hán (CJK)", () => {
    for (const q of HAN_VAN_SIDE) {
      expect(CJK.test(q.desc), `${q.id}: desc có chữ Hán`).toBe(false);
      for (const group of [q.talk.offer, q.talk.progress, q.talk.complete])
        for (const line of group)
          expect(CJK.test(line), `${q.id}: "${line}" có chữ Hán`).toBe(false);
    }
  });
});
