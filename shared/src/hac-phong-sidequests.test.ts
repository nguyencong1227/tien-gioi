// Ba việc phụ ở Hắc Phong Cốc (Trúc Cơ, E1 #1450): hai việc do lái buôn Mạc Thông (lai_buon) giao, một việc do trạm úy Lôi Báo (tran_uy) giao, mỗi việc một tầng
// Trúc Cơ (0/1/2), KHÔNG daily, KHÔNG thuộc chuỗi chính. Steps chỉ kill / collect trỏ tới quái và vật phẩm CÓ THẬT và THẬT SỰ thu được ở Hắc Phong (Hôi Lang, Hắc Hổ;
// nanh sói, da hổ; trùm Xích Mãng đã có `mang_hoan`, việc đơn lẻ KHÔNG đòi trùm). Thưởng exp sát sàn 2% (kim-dan-world.test.ts) và tổng việc phụ Trúc Cơ <= 4% tổng thanh;
// tối đa MỘT kinh quyển rarity <= 2 mỗi việc. Khuôn theo am-suong-sidequests.test.ts. Đây là chốt chặn: đột biến dữ liệu phải làm đỏ >= 5 ca.
import { describe, expect, it } from "vitest";
import {
  QUESTS,
  QUEST_PREV,
  NPC_BY_ID,
  NPCS,
  MONSTER_BY_ID,
  ITEM_BY_ID,
  SKILL_BY_ID,
  DROP_TABLES,
  TRADES,
  MONSTERS,
  getMap,
  HAC_PHONG_ID,
  stepOf,
} from "./index";
import { expToNext } from "./realms";

/** Chữ Hán (CJK): lời thoại / mô tả Tiên Giới tiếng Việt, KHÔNG được có. */
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

/** Hai NPC Thanh Lộ Trạm được giao việc phụ: lái buôn Mạc Thông (hai việc) và trạm úy Lôi Báo (một việc). */
const HP_GIVERS = ["lai_buon", "tran_uy"];

/** Việc phụ Hắc Phong E1 #1450 (không tính `mang_hoan` của trưởng trấn Lạc Hà, không tính ba việc hằng ngày `hp_*`). */
const HP_SIDE = QUESTS.filter(
  (q) =>
    HP_GIVERS.includes(q.giver) &&
    q.minRealm?.realm === 2 &&
    !q.daily &&
    q.desc.startsWith("Việc phụ (không bắt buộc)"),
);

/** Ba việc hằng ngày của trạm úy (D7 #755): steps của việc phụ mới KHÔNG được trùng đúng steps của chúng hay của `mang_hoan`. */
const OTHER_TRUC_CO = QUESTS.filter(
  (q) => q.minRealm?.realm === 2 && !HP_SIDE.includes(q) && (q.daily || q.id === "mang_hoan"),
);

describe("việc phụ Hắc Phong Cốc (Trúc Cơ, E1 #1450)", () => {
  it("đúng BA việc phụ: hai do lai_buon, một do tran_uy; hai NPC đều là NPC thật đứng ở Hắc Phong", () => {
    expect(HP_SIDE).toHaveLength(3);
    expect(HP_SIDE.filter((q) => q.giver === "lai_buon")).toHaveLength(2);
    expect(HP_SIDE.filter((q) => q.giver === "tran_uy")).toHaveLength(1);
    for (const g of HP_GIVERS) {
      expect(NPC_BY_ID[g], g).toBeDefined();
      expect(NPC_BY_ID[g].mapId, `${g} không ở Hắc Phong`).toBe(HAC_PHONG_ID);
    }
  });

  it("mọi việc có minRealm Trúc Cơ (realm 2) với BA tầng khác nhau (0/1/2)", () => {
    for (const q of HP_SIDE) {
      expect(q.minRealm, q.id).toBeDefined();
      expect(q.minRealm!.realm, q.id).toBe(2);
    }
    expect(HP_SIDE.map((q) => q.minRealm!.tier).sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("mọi việc KHÔNG daily, KHÔNG thuộc chuỗi chính (next bỏ trống, không có nhiệm vụ đứng trước) và có đủ ba nhóm lời thoại", () => {
    for (const q of HP_SIDE) {
      expect(q.daily, `${q.id}: việc phụ không lặp`).toBeFalsy();
      expect(q.next ?? "", `${q.id}: việc phụ KHÔNG nối chuỗi chính`).toBe("");
      expect(QUEST_PREV[q.id], `${q.id}: không có nhiệm vụ đứng trước`).toBeUndefined();
      expect(q.talk.offer.length, `${q.id}: offer`).toBeGreaterThan(0);
      expect(q.talk.progress.length, `${q.id}: progress`).toBeGreaterThan(0);
      expect(q.talk.complete.length, `${q.id}: complete`).toBeGreaterThan(0);
    }
  });

  it("steps chỉ kill / collect; kill trỏ tới quái THƯỜNG (không trùm) SINH Ở Hắc Phong; collect trỏ tới vật phẩm có thật", () => {
    const hp = getMap(HAC_PHONG_ID)!;
    for (const q of HP_SIDE)
      for (const st of q.steps) {
        expect(["kill", "collect"], `${q.id}: bước ${st.kind}`).toContain(st.kind);
        if (st.kind === "kill") {
          const m = MONSTER_BY_ID[st.monster];
          expect(m, `${q.id}: ${st.monster}`).toBeDefined();
          expect(m.boss, `${q.id}: ${st.monster} là trùm (việc đơn lẻ không đòi trùm)`).toBeFalsy();
          expect(
            hp.monsterCapOf(st.monster),
            `${q.id}: ${st.monster} không sinh ở Hắc Phong`,
          ).toBeGreaterThan(0);
        }
        if (st.kind === "collect")
          expect(ITEM_BY_ID[st.itemId], `${q.id}: ${st.itemId}`).toBeDefined();
      }
  });

  it("mỗi bước collect nộp món THẬT SỰ thu được ở Hắc Phong (quái thường sinh ở đó rơi, hoặc NPC Hắc Phong bán) và khả thi (kỳ vọng <= 40 lần hạ)", () => {
    const hp = getMap(HAC_PHONG_ID)!;
    const mobs = MONSTERS.filter((m) => !m.boss && hp.monsterCapOf(m.id) > 0).map((m) => m.id);
    const hpNpcs = new Set(NPCS.filter((n) => n.mapId === HAC_PHONG_ID).map((n) => n.id));
    for (const q of HP_SIDE)
      for (const st of q.steps) {
        if (st.kind !== "collect") continue;
        const chance = Math.max(
          0,
          ...mobs.map(
            (mid) => (DROP_TABLES[mid] ?? []).find((d) => d.itemId === st.itemId)?.chance ?? 0,
          ),
        );
        const sold = TRADES.some((t) => t.get.itemId === st.itemId && hpNpcs.has(t.npcId));
        expect(chance > 0 || sold, `${q.id}: ${st.itemId} KHÔNG thu được ở Hắc Phong`).toBe(true);
        if (chance > 0)
          expect(
            st.count / chance,
            `${q.id}: cần quá nhiều lần hạ cho ${st.itemId}`,
          ).toBeLessThanOrEqual(40);
      }
  });

  it("steps KHÔNG trùng đúng steps của ba việc hằng ngày hp_* và của mang_hoan; ba việc cũng khác nhau", () => {
    expect(OTHER_TRUC_CO.length).toBeGreaterThanOrEqual(4); // chống rỗng: 3 hp_* + mang_hoan
    const key = (q: { steps: unknown }) => JSON.stringify(q.steps);
    for (const q of HP_SIDE)
      for (const o of OTHER_TRUC_CO) expect(key(q), `${q.id} trùng steps ${o.id}`).not.toBe(key(o));
    expect(new Set(HP_SIDE.map(key)).size).toBe(HP_SIDE.length);
  });

  it("thưởng exp: mỗi việc > 0 và tổng việc phụ Trúc Cơ (ba việc này + mang_hoan + mọi việc phụ Trúc Cơ khác) <= 4 % tổng thanh Trúc Cơ", () => {
    for (const q of HP_SIDE) expect(q.rewards.exp ?? 0, `${q.id}: exp`).toBeGreaterThan(0);
    const bars = [0, 1, 2].reduce((a, t) => a + expToNext(2, t), 0);
    const total = QUESTS.filter(
      (q) => q.minRealm?.realm === 2 && !q.daily && q.desc.startsWith("Việc phụ"),
    ).reduce((a, q) => a + (q.rewards.exp ?? 0), 0);
    expect(total, "mang_hoan + ba việc Hắc Phong").toBeGreaterThan(
      HP_SIDE.reduce((a, q) => a + (q.rewards.exp ?? 0), 0),
    );
    expect(total / bars, `tổng exp việc phụ Trúc Cơ ${total}/${bars} vượt 4 %`).toBeLessThanOrEqual(
      0.04,
    );
  });

  it("thưởng KHÔNG QUÁ MỘT kinh quyển (tính theo qty), rarity <= 2 và >= 2 cho chiêu Trúc Cơ; quyển dạy chiêu có thật, học được ở tầng nhận, không trùng việc phụ nào khác", () => {
    for (const q of HP_SIDE) {
      const books = (q.rewards.items ?? []).filter((i) => ITEM_BY_ID[i.itemId]?.type === "book");
      expect(
        books.reduce((a, b) => a + (b.qty ?? 1), 0),
        `${q.id}: quá 1 kinh quyển thưởng (tính theo qty)`,
      ).toBeLessThanOrEqual(1);
      for (const b of books) {
        const it = ITEM_BY_ID[b.itemId];
        expect(it.rarity, `${q.id}: ${b.itemId} độ hiếm`).toBeLessThanOrEqual(2);
        const skill = SKILL_BY_ID[it.teaches ?? ""];
        expect(skill, `${q.id}: ${b.itemId} dạy chiêu không tồn tại`).toBeDefined();
        if (skill.reqRealm >= 2)
          expect(
            it.rarity,
            `${q.id}: sách chiêu Trúc Cơ trở lên phải rarity >= 2`,
          ).toBeGreaterThanOrEqual(2);
        expect(
          stepOf(skill.reqRealm, skill.reqTier ?? 0),
          `${q.id}: ${b.itemId} cần cảnh giới cao hơn tầng nhận`,
        ).toBeLessThanOrEqual(stepOf(q.minRealm!.realm, q.minRealm!.tier));
        const others = QUESTS.filter(
          (o) => o.id !== q.id && o.rewards.items?.some((i) => i.itemId === b.itemId),
        );
        expect(
          others.map((o) => o.id),
          `${b.itemId} thưởng ở nhiều nhiệm vụ`,
        ).toEqual([]);
      }
    }
    // chống rỗng: ít nhất một việc thật sự thưởng kinh quyển (không thì vòng trên không kiểm gì)
    expect(
      HP_SIDE.some((q) => q.rewards.items?.some((i) => ITEM_BY_ID[i.itemId]?.type === "book")),
    ).toBe(true);
  });

  it("việc thu nguyên liệu (có bước collect) có vật phẩm thưởng; mọi vật phẩm thưởng có thật", () => {
    for (const q of HP_SIDE) {
      for (const i of q.rewards.items ?? [])
        expect(ITEM_BY_ID[i.itemId], `${q.id}: ${i.itemId}`).toBeDefined();
      if (q.steps.some((s) => s.kind === "collect"))
        expect(q.rewards.items?.length ?? 0, `${q.id}: collect phải có vật phẩm`).toBeGreaterThan(
          0,
        );
    }
  });

  it("tiêu đề và mô tả KHÔNG trùng nhau (kể cả với mọi nhiệm vụ khác)", () => {
    for (const q of HP_SIDE) {
      expect(
        QUESTS.filter((o) => o.title === q.title),
        `${q.id}: tiêu đề trùng`,
      ).toHaveLength(1);
      expect(
        QUESTS.filter((o) => o.desc === q.desc),
        `${q.id}: mô tả trùng`,
      ).toHaveLength(1);
    }
  });

  it("lời thoại và mô tả KHÔNG xưng 'bạn' và KHÔNG chứa chữ Hán (CJK)", () => {
    for (const q of HP_SIDE) {
      expect(CJK.test(q.title), `${q.id}: title có chữ Hán`).toBe(false);
      expect(CJK.test(q.desc), `${q.id}: desc có chữ Hán`).toBe(false);
      for (const group of [q.talk.offer, q.talk.progress, q.talk.complete])
        for (const line of group) {
          expect(CJK.test(line), `${q.id}: "${line}" có chữ Hán`).toBe(false);
          expect(/\bbạn\b/i.test(line), `${q.id}: xưng "bạn"`).toBe(false);
        }
    }
  });
});
