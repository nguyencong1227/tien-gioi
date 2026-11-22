// Ba việc phụ ở Vọng Sương Trạm (Kim Đan, D8 #756): mỗi việc một NPC (lai_buon_suong / tho_ren_suong / tram_truong), một tầng Kim Đan
// (0/1/2), steps chỉ kill/collect trỏ tới quái/vật phẩm CÓ THẬT và THẬT SỰ THU ĐƯỢC ở Âm Sương (Sương Hồ / Thạch Quy / Độc Thiềm;
// sương mao / quy giáp / độc nang), thưởng exp nhỏ (cả ba <= ~1% tổng thanh Kim Đan, tổng việc phụ <= 2,5%, xem kim-dan-world.test.ts)
// và KHÔNG QUÁ MỘT kinh quyển rarity <= 2 mỗi việc (rarity 3 chỉ rơi từ quái). Test này là chốt chặn: đột biến dữ liệu phải làm đỏ >= 5 nó.
import { describe, expect, it } from "vitest";
import {
  QUESTS,
  NPCS,
  NPC_BY_ID,
  MONSTERS,
  MONSTER_BY_ID,
  ITEM_BY_ID,
  SKILL_BY_ID,
  DROP_TABLES,
  TRADES,
  getMap,
  AM_SUONG_ID,
  stepOf,
} from "./index";
import { expToNext } from "./realms";

/** Chữ Hán (CJK): lời thoại / mô tả Tiên Giới tiếng Việt, KHÔNG được có. */
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

/** Ba NPC Âm Sương được phép giao việc phụ (lái buôn / thợ rèn / trạm trưởng Vọng Sương). */
const AM_SUONG_GIVERS = ["lai_buon_suong", "tho_ren_suong", "tram_truong"];

/**
 * Việc phụ Âm Sương #756: ba việc thu nguyên liệu do lái buôn / thợ rèn / trạm trưởng Vọng Sương giao, thuộc Kim Đan (realm 3),
 * không lặp, không thuộc chuỗi chính, mô tả mở đầu bằng tiền tố việc phụ. `giao_hoan` (trùm Hắc Giao theo đội, cũng tram_truong +
 * realm 3 + tiền tố "Việc phụ") KHÔNG tính ở đây — là việc phụ có sẵn, do kim-dan-world.test.ts giữ tổng exp việc phụ Kim Đan <= 2,5%.
 */
const AM_SUONG_SIDE = QUESTS.filter(
  (q) =>
    AM_SUONG_GIVERS.includes(q.giver) &&
    q.minRealm?.realm === 3 &&
    !q.daily &&
    q.desc.startsWith("Việc phụ (không bắt buộc)") &&
    q.id !== "giao_hoan",
);

describe("việc phụ Âm Sương Trạch (Kim Đan, D8 #756)", () => {
  it("đúng BA việc phụ; mỗi việc một NPC giao, NPC đều có thật và khác nhau", () => {
    expect(AM_SUONG_SIDE).toHaveLength(3);
    const givers = AM_SUONG_SIDE.map((q) => q.giver);
    for (const g of givers) expect(NPC_BY_ID[g], g).toBeDefined();
    expect(new Set(givers).size).toBe(givers.length); // ba NPC khác nhau
  });

  it("mọi việc đều có minRealm Kim Đan (realm 3) với BA tầng khác nhau (0/1/2)", () => {
    for (const q of AM_SUONG_SIDE) {
      expect(q.minRealm, q.id).toBeDefined();
      expect(q.minRealm!.realm, q.id).toBe(3); // KHÔNG được đổi sang cảnh giới khác
    }
    const tiers = AM_SUONG_SIDE.map((q) => q.minRealm!.tier).sort((a, b) => a - b);
    expect(tiers).toEqual([0, 1, 2]); // ba tầng khác nhau
  });

  it("mọi việc KHÔNG thuộc chuỗi chính (next bỏ trống) và có đủ ba nhóm lời thoại không rỗng", () => {
    for (const q of AM_SUONG_SIDE) {
      expect(q.next ?? "", `${q.id}: việc phụ KHÔNG nối chuỗi chính`).toBe("");
      expect(q.talk.offer.length, `${q.id}: offer`).toBeGreaterThan(0);
      expect(q.talk.progress.length, `${q.id}: progress`).toBeGreaterThan(0);
      expect(q.talk.complete.length, `${q.id}: complete`).toBeGreaterThan(0);
    }
  });

  it("steps chỉ dùng kill/collect trỏ tới quái/vật phẩm CÓ THẬT và CÙNG sinh ở Âm Sương", () => {
    const as = getMap(AM_SUONG_ID)!;
    for (const q of AM_SUONG_SIDE)
      for (const st of q.steps) {
        expect(["kill", "collect", "talk"], `${q.id}: bước ${st.kind}`).toContain(st.kind);
        if (st.kind === "kill") {
          expect(MONSTER_BY_ID[st.monster], `${q.id}: ${st.monster}`).toBeDefined();
          // Quái phải sinh ở Âm Sương (đừng yêu cầu thứ chỉ có ở bản đồ khác)
          expect(
            as.monsterCapOf(st.monster),
            `${q.id}: ${st.monster} sinh ở Âm Sương`,
          ).toBeGreaterThan(0);
        }
        if (st.kind === "collect")
          expect(ITEM_BY_ID[st.itemId], `${q.id}: ${st.itemId}`).toBeDefined();
        if (st.kind === "talk") expect(NPC_BY_ID[st.npcId], `${q.id}: ${st.npcId}`).toBeDefined();
      }
  });

  it("mỗi bước collect nộp món CÓ THẬT và THẬT SỰ THU ĐƯỢC ở Âm Sương: rơi từ quái sinh ở Âm Sương HOẶC mua ở cửa hàng Vọng Sương", () => {
    const as = getMap(AM_SUONG_ID)!;
    // Quái SINH Ở ÂM SƯƠNG (monsterCapOf > 0) — đầm dùng quái nhúng bản đồ, KHÔNG nằm trong WILD_MONSTERS (dùng MONSTERS lọc theo cap bản đồ)
    const monstersInAmSuong = new Set(
      MONSTERS.filter((m) => as.monsterCapOf(m.id) > 0).map((m) => m.id),
    );
    // NPC đứng ở trấn Âm Sương — chủ cửa hàng đổi đồ
    const anNpcs = new Set(NPCS.filter((n) => n.mapId === AM_SUONG_ID).map((n) => n.id));
    const soldInAmSuong = (itemId: string) =>
      TRADES.some((t) => t.get.itemId === itemId && anNpcs.has(t.npcId));
    for (const q of AM_SUONG_SIDE)
      for (const st of q.steps) {
        if (st.kind !== "collect") continue;
        expect(ITEM_BY_ID[st.itemId], `${q.id}: ${st.itemId} không tồn tại`).toBeDefined();
        // Ít nhất một loài SINH Ở ÂM SƯƠNG rơi món này (monsterCapOf > 0 && bảng rơi có món)
        const droppedInAmSuong = [...monstersInAmSuong].some((mid) =>
          (DROP_TABLES[mid] ?? []).some((d) => d.itemId === st.itemId),
        );
        expect(
          droppedInAmSuong || soldInAmSuong(st.itemId),
          `${q.id}: ${st.itemId} KHÔNG thu được ở Âm Sương (không quái nào sinh ở Âm Sương rơi, không ai bán ở cửa hàng Vọng Sương)`,
        ).toBe(true);
      }
  });

  it("thưởng exp NHỎ: tổng CẢ BA việc <= ~1% tổng thanh Kim Đan (không biến việc phụ thành đường tắt; giữ tổng việc phụ Kim Đan <= 2,5%)", () => {
    const total = AM_SUONG_SIDE.reduce((a, q) => a + (q.rewards.exp ?? 0), 0);
    expect(total, "tổng exp việc phụ Âm Sương").toBeGreaterThan(0);
    expect(
      AM_SUONG_SIDE.every((q) => (q.rewards.exp ?? 0) > 0),
      "mọi việc phải có exp",
    ).toBe(true);
    // Tổng thanh Kim Đan 3 tầng (0-2); trần ~1% cho ba việc mới (kim-dan-world.test.ts giữ tổng việc phụ <= 2,5% gồm cả giao_hoan).
    const bars = [0, 1, 2].reduce((a, t) => a + expToNext(3, t), 0);
    expect(total / bars, `tổng exp việc phụ ${total}/${bars} vượt ~1%`).toBeLessThanOrEqual(0.01);
  });

  it("thưởng KHÔNG QUÁ MỘT kinh quyển rarity <= 2 mỗi nhiệm vụ; CHỈ rarity <= 2 (rarity 3 chỉ rơi từ quái); quyển dạy chiêu CÓ THẬT và học được ở tầng nhận; mỗi quyển KHÔNG quá một việc phụ Âm Sương", () => {
    const bookCount = new Map<string, number>();
    for (const q of AM_SUONG_SIDE) {
      const books = (q.rewards.items ?? []).filter((i) => ITEM_BY_ID[i.itemId]?.type === "book");
      // Đếm TỔNG qty các dòng kinh (KHÔNG phải số dòng): một dòng qty: 2 của cùng một kinh vẫn là "quá 1 quyển".
      const bookQty = books.reduce((a, b) => a + (b.qty ?? 1), 0);
      expect(bookQty, `${q.id}: quá 1 kinh quyển thưởng (tính theo qty)`).toBeLessThanOrEqual(1);
      for (const b of books) {
        const it = ITEM_BY_ID[b.itemId];
        expect(it.rarity, `${q.id}: ${b.itemId} độ hiếm`).toBeLessThanOrEqual(2);
        const skill = SKILL_BY_ID[it.teaches ?? ""];
        expect(skill, `${q.id}: ${b.itemId} dạy chiêu không tồn tại`).toBeDefined();
        // Học được ngay lúc nhận: đủ cảnh giới so với minRealm (bước chỉ kill/collect nên lấy minRealm)
        expect(
          stepOf(skill.reqRealm, skill.reqTier ?? 0),
          `${q.id}: ${b.itemId} cần cảnh giới cao hơn tầng nhận`,
        ).toBeLessThanOrEqual(stepOf(q.minRealm!.realm, q.minRealm!.tier));
        bookCount.set(b.itemId, (bookCount.get(b.itemId) ?? 0) + 1);
      }
    }
    // Mỗi kinh quyển thưởng không xuất hiện ở quá một việc phụ Âm Sương (tránh lặp thưởng)
    for (const [id, n] of bookCount) expect(n, `${id} thưởng ở nhiều việc phụ`).toBe(1);
  });

  it("đột biến chứng minh: thưởng MỘT dòng kinh qty: 2 bị bắt (luật đếm TỔNG qty, KHÔNG đếm số dòng)", () => {
    // Giả lập đột biến dữ liệu: một việc phụ thưởng 2 quyển của cùng một kinh trên MỘT dòng.
    // books.length vẫn = 1 (đếm dòng sẽ bỏ lọt — lỗi cũ), nhưng tổng qty = 2 -> luật mới phải đỏ.
    const books = [{ itemId: "kinh_thi_doc_am_chuong", qty: 2 }].filter(
      (i) => ITEM_BY_ID[i.itemId]?.type === "book",
    );
    expect(books.length, "đếm dòng vẫn = 1 (bỏ lọt nếu dùng số dòng)").toBe(1);
    const bookQty = books.reduce((a, b) => a + (b.qty ?? 1), 0);
    expect(bookQty, "đếm qty = 2 -> bắt được đột biến (quyển thưởng KHÔNG quá 1)").toBeGreaterThan(
      1,
    );
  });

  it("tiêu đề và mô tả KHÔNG trùng nhau", () => {
    const titles = AM_SUONG_SIDE.map((q) => q.title);
    const descs = AM_SUONG_SIDE.map((q) => q.desc);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descs).size).toBe(descs.length);
  });

  it("lời thoại và mô tả KHÔNG xưng 'bạn' và KHÔNG chứa chữ Hán (CJK)", () => {
    for (const q of AM_SUONG_SIDE) {
      expect(CJK.test(q.desc), `${q.id}: desc có chữ Hán`).toBe(false);
      for (const group of [q.talk.offer, q.talk.progress, q.talk.complete])
        for (const line of group) {
          expect(CJK.test(line), `${q.id}: "${line}" có chữ Hán`).toBe(false);
          expect(line.includes("bạn"), `${q.id}: xưng "bạn"`).toBe(false);
        }
    }
  });
});
