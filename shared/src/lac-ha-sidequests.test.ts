// Ba việc phụ ở Lạc Hà Trấn (Luyện Khí, D6 #754): mỗi việc một NPC (truong_tran / duoc_su / tho_ren), một tầng cảnh giới (0/3/6),
// steps chỉ kill/collect/talk trỏ tới quái/vật phẩm CÓ THẬT và THẬT SỰ THU ĐƯỢC ở Lạc Hà (quái sinh ở Lạc Hà rơi / mua ở cửa hàng trấn),
// thưởng exp trong khung (tối đa 2,5 % tổng thanh Luyện Khí, xem kim-dan-world.test.ts) và KHÔNG QUÁ MỘT kinh quyển rarity <= 2
// (rarity 3 chỉ rơi từ quái). Test này là chốt chặn: đột biến dữ liệu phải làm đỏ ít nhất một nó.
import { describe, expect, it } from "vitest";
import {
  QUESTS,
  NPCS,
  NPC_BY_ID,
  MONSTER_BY_ID,
  ITEM_BY_ID,
  SKILL_BY_ID,
  WILD_MONSTERS,
  DROP_TABLES,
  TRADES,
  getMap,
  DEFAULT_MAP_ID,
  stepOf,
} from "./index";
import { expToNext } from "./realms";

/** Chữ Hán (CJK): lời thoại / mô tả Tiên Giới tiếng Việt, KHÔNG được có. */
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

/** Ba NPC Lạc Hà được phép giao việc phụ (trưởng trấn / dược sư / thợ rèn). */
const LA_HA_GIVERS = ["truong_tran", "duoc_su", "tho_ren"];

/** Việc phụ Lạc Hà: do NPC Lạc Hà giao, thuộc Luyện Khí (realm 1), không lặp, không thuộc chuỗi chính, mô tả mở đầu bằng tiền tố việc phụ. */
const LA_HA_SIDE = QUESTS.filter(
  (q) =>
    LA_HA_GIVERS.includes(q.giver) &&
    q.minRealm?.realm === 1 &&
    !q.daily &&
    q.desc.startsWith("Việc phụ (không bắt buộc)"),
);

describe("việc phụ Lạc Hà (Luyện Khí, D6 #754)", () => {
  it("đúng BA việc phụ; mỗi việc một NPC giao, NPC đều có thật và khác nhau", () => {
    expect(LA_HA_SIDE).toHaveLength(3);
    const givers = LA_HA_SIDE.map((q) => q.giver);
    for (const g of givers) expect(NPC_BY_ID[g], g).toBeDefined();
    expect(new Set(givers).size).toBe(givers.length); // ba NPC khác nhau
  });

  it("mọi việc đều có minRealm Luyện Khí (realm 1) với BA tầng khác nhau (đầu / giữa / cuối)", () => {
    for (const q of LA_HA_SIDE) {
      expect(q.minRealm, q.id).toBeDefined();
      expect(q.minRealm!.realm, q.id).toBe(1); // KHÔNG được đổi sang cảnh giới khác
    }
    const tiers = LA_HA_SIDE.map((q) => q.minRealm!.tier).sort((a, b) => a - b);
    expect(tiers).toEqual([0, 3, 6]); // ba tầng khác nhau
  });

  it("mọi việc KHÔNG thuộc chuỗi chính (next bỏ trống) và có đủ ba nhóm lời thoại không rỗng", () => {
    for (const q of LA_HA_SIDE) {
      expect(q.next ?? "", `${q.id}: việc phụ KHÔNG nối chuỗi chính`).toBe("");
      expect(q.talk.offer.length, `${q.id}: offer`).toBeGreaterThan(0);
      expect(q.talk.progress.length, `${q.id}: progress`).toBeGreaterThan(0);
      expect(q.talk.complete.length, `${q.id}: complete`).toBeGreaterThan(0);
    }
  });

  it("steps chỉ dùng kill/collect/talk trỏ tới quái/vật phẩm CÓ THẬT và CÙNG sinh ở Lạc Hà", () => {
    const la = getMap(DEFAULT_MAP_ID)!;
    for (const q of LA_HA_SIDE)
      for (const st of q.steps) {
        expect(["kill", "collect", "talk"], `${q.id}: bước ${st.kind}`).toContain(st.kind);
        if (st.kind === "kill") {
          expect(MONSTER_BY_ID[st.monster], `${q.id}: ${st.monster}`).toBeDefined();
          // Quái phải sinh ở Lạc Hà (đừng yêu cầu thứ chỉ có ở bản đồ khác)
          expect(
            la.monsterCapOf(st.monster),
            `${q.id}: ${st.monster} sinh ở Lạc Hà`,
          ).toBeGreaterThan(0);
        }
        if (st.kind === "collect")
          expect(ITEM_BY_ID[st.itemId], `${q.id}: ${st.itemId}`).toBeDefined();
        if (st.kind === "talk") expect(NPC_BY_ID[st.npcId], `${q.id}: ${st.npcId}`).toBeDefined();
      }
  });

  it("mỗi bước collect nộp món CÓ THẬT và THẬT SỰ THU ĐƯỢC ở Lạc Hà: rơi từ quái sinh ở Lạc Hà HOẶC mua ở cửa hàng Lạc Hà (đừng yêu cầu món chỉ có ở bản đồ khác — vd suong_mao chỉ rơi ở Hàn Vân)", () => {
    const la = getMap(DEFAULT_MAP_ID)!;
    // NPC đứng ở trấn Lạc Hà (bản đồ mặc định) — chủ cửa hàng đổi đồ
    const laHaNpcs = new Set(
      NPCS.filter((n) => (n.mapId ?? DEFAULT_MAP_ID) === DEFAULT_MAP_ID).map((n) => n.id),
    );
    const soldInLaHa = (itemId: string) =>
      TRADES.some((t) => t.get.itemId === itemId && laHaNpcs.has(t.npcId));
    for (const q of LA_HA_SIDE)
      for (const st of q.steps) {
        if (st.kind !== "collect") continue;
        expect(ITEM_BY_ID[st.itemId], `${q.id}: ${st.itemId} không tồn tại`).toBeDefined();
        // Ít nhất một loài SINH Ở LẠC HÀ rơi món này (monsterCapOf > 0 && bảng rơi có món)
        const droppedInLaHa = WILD_MONSTERS.some(
          (m) =>
            la.monsterCapOf(m.id) > 0 &&
            (DROP_TABLES[m.id] ?? []).some((d) => d.itemId === st.itemId),
        );
        expect(
          droppedInLaHa || soldInLaHa(st.itemId),
          `${q.id}: ${st.itemId} KHÔNG thu được ở Lạc Hà (không quái nào sinh ở Lạc Hà rơi, không ai bán ở cửa hàng Lạc Hà)`,
        ).toBe(true);
      }
  });

  it("steps KHÔNG trùng ĐÚNG việc hằng ngày của cao_thi (lang_hai / nop_nanh / ho_hoan)", () => {
    const daily = new Set(["lang_hai", "nop_nanh", "ho_hoan"]);
    const dailySteps = QUESTS.filter((q) => daily.has(q.id)).flatMap((q) => q.steps);
    for (const q of LA_HA_SIDE) {
      for (const st of q.steps) {
        const dup = dailySteps.some((d) => JSON.stringify(d) === JSON.stringify(st));
        expect(dup, `${q.id}: bước ${JSON.stringify(st)} trùng đúng việc hằng ngày`).toBe(false);
      }
    }
  });

  it("thưởng exp NHỎ: tổng CẢ BA việc <= 2,5 % tổng thanh Luyện Khí (không biến việc phụ thành đường tắt)", () => {
    const total = LA_HA_SIDE.reduce((a, q) => a + (q.rewards.exp ?? 0), 0);
    expect(total, "tổng exp việc phụ Lạc Hà").toBeGreaterThan(0);
    expect(
      LA_HA_SIDE.every((q) => (q.rewards.exp ?? 0) > 0),
      "mọi việc phải có exp",
    ).toBe(true);
    // So sánh với trần 2,5 % tổng thanh Luyện Khí (các tầng 0-8) — cùng ngưỡng với cap test chính.
    const bars = [0, 1, 2, 3, 4, 5, 6, 7, 8].reduce((a, t) => a + expToNext(1, t), 0);
    expect(total / bars, `tổng exp việc phụ ${total}/${bars} vượt 2,5 %`).toBeLessThanOrEqual(
      0.025,
    );
  });

  it("thưởng KHÔNG QUÁ MỘT kinh quyển rarity <= 2 mỗi nhiệm vụ; CHỈ rarity <= 2 (rarity 3 chỉ rơi từ quái); quyển dạy chiêu CÓ THẬT và học được ở tầng nhận", () => {
    const bookCount = new Map<string, number>();
    for (const q of LA_HA_SIDE) {
      const books = (q.rewards.items ?? []).filter((i) => ITEM_BY_ID[i.itemId]?.type === "book");
      expect(books.length, `${q.id}: quá 1 kinh quyển thưởng`).toBeLessThanOrEqual(1);
      for (const b of books) {
        const it = ITEM_BY_ID[b.itemId];
        expect(it.rarity, `${q.id}: ${b.itemId} độ hiếm`).toBeLessThanOrEqual(2);
        const skill = SKILL_BY_ID[it.teaches ?? ""];
        expect(skill, `${q.id}: ${b.itemId} dạy chiêu không tồn tại`).toBeDefined();
        expect(
          stepOf(skill.reqRealm, skill.reqTier),
          `${q.id}: ${b.itemId} cần cảnh giới cao hơn tầng nhận`,
        ).toBeLessThanOrEqual(stepOf(q.minRealm!.realm, q.minRealm!.tier));
        bookCount.set(b.itemId, (bookCount.get(b.itemId) ?? 0) + 1);
      }
    }
    // Mỗi kinh quyển thưởng không xuất hiện ở quá một nhiệm vụ (tránh lặp thưởng)
    for (const [id, n] of bookCount) expect(n, `${id} thưởng ở nhiều nhiệm vụ`).toBe(1);
  });

  it("tiêu đề và mô tả KHÔNG trùng nhau", () => {
    const titles = LA_HA_SIDE.map((q) => q.title);
    const descs = LA_HA_SIDE.map((q) => q.desc);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descs).size).toBe(descs.length);
  });

  it("lời thoại và mô tả KHÔNG xưng 'bạn' và KHÔNG chứa chữ Hán (CJK)", () => {
    for (const q of LA_HA_SIDE) {
      expect(CJK.test(q.desc), `${q.id}: desc có chữ Hán`).toBe(false);
      for (const group of [q.talk.offer, q.talk.progress, q.talk.complete])
        for (const line of group) {
          expect(CJK.test(line), `${q.id}: "${line}" có chữ Hán`).toBe(false);
          expect(line.includes("bạn"), `${q.id}: xưng "bạn"`).toBe(false);
        }
    }
  });
});
