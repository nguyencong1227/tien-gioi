// Hợp đồng tông môn có chiều sâu (M8.1, docs/THIET_KE_TONG_MON.md mục 12): hằng số, bảng cấp, ngày, kiếm cống hiến, nhiệm vụ, cửa hàng, tin nhắn.
import { describe, expect, it } from "vitest";
import {
  COIN_CAP,
  DROP_TABLES,
  MONSTER_BY_ID,
  NPC_BY_ID,
  QUESTS,
  QUEST_BY_ID,
  SECT_BUFF_DROP_MAX,
  SECT_BUFF_EXP_MAX,
  SECT_BUFF_REGEN_MAX,
  SECT_CH_VALUE_LT,
  SECT_CONTRIB_CAP,
  SECT_DEPOSIT_DAY_CAP,
  SECT_DEPOSIT_VALUE_PER_CH,
  SECT_DUNGEON_CH,
  SECT_EARN_DAY_CAP,
  SECT_ELDERS_MAX,
  SECT_LEVELS,
  SECT_LEVEL_MAX,
  SECT_MAX_MEMBERS,
  SECT_MSG,
  SECT_POINTS_CAP,
  SECT_QUESTS,
  SECT_QUEST_BY_ID,
  SECT_QUEST_CH,
  SECT_QUEST_GIVER,
  SECT_QUEST_SLOTS,
  SECT_QUEST_TIERS,
  SECT_SHOP,
  SECT_SHOP_QTY_MAX,
  SECT_TERMS,
  SECT_VAULT_SLOTS,
  SECT_VAULT_SLOTS_MAX,
  canSect,
  dayKey,
  emptySectDay,
  isSectQuest,
  isSectQuestTemplate,
  questDefAny,
  sectQuestTemplateOf,
  SECT_QUEST_TEMPLATE_BY_ID,
  ITEM_BY_ID,
  ITEM_VALUE,
  parseSectHallGet,
  parseSectQuest,
  parseSectShopBuy,
  rollDrops,
  sampleSectHall,
  sectAwardDay,
  sectBuffOf,
  sectCanEarn,
  sectDayState,
  sectDepositCh,
  sectDepositValue,
  sectEarnFromAt,
  sectEarnLeft,
  sectLevelInfo,
  sectLevelOf,
  sectPointsToNext,
  sectQuestCh,
  sectQuestFor,
  sectQuestId,
  sectQuestSlots,
  sectResetAt,
  sectShopLock,
  sectQuestViolations,
  sectShopViolations,
  sectTierOfRealm,
  type SectDayState,
  type SectShopEntry,
  type SectRank,
} from "./index";

/** Số ngẫu nhiên có seed (LCG) để kịch bản lặp lại được. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("hằng số và quan hệ giữa các nguồn kiếm (mục 12.3)", () => {
  it("nhiệm vụ 20 / 30 / 40 + góp kho + bí cảnh đúng bằng trần ngày; mọi hằng số nguyên dương hữu hạn", () => {
    const quests = SECT_QUEST_CH.reduce((a, b) => a + b, 0);
    expect(quests).toBe(90);
    expect(quests + SECT_DEPOSIT_DAY_CAP + SECT_DUNGEON_CH).toBe(SECT_EARN_DAY_CAP);
    expect(SECT_QUEST_SLOTS).toBe(SECT_QUEST_CH.length);
    for (const n of [
      SECT_CONTRIB_CAP,
      SECT_POINTS_CAP,
      SECT_EARN_DAY_CAP,
      SECT_DEPOSIT_VALUE_PER_CH,
      SECT_DEPOSIT_DAY_CAP,
      SECT_DUNGEON_CH,
      SECT_CH_VALUE_LT,
      SECT_SHOP_QTY_MAX,
    ]) {
      expect(Number.isSafeInteger(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
    }
    expect(SECT_DEPOSIT_DAY_CAP).toBeLessThan(SECT_EARN_DAY_CAP);
    // Góp kho đổi cống hiến LỖ so với giá trị của cống hiến ở cửa hàng: không phải chỗ đổi tiền (mục 12.6)
    expect(SECT_DEPOSIT_VALUE_PER_CH).toBeGreaterThan(SECT_CH_VALUE_LT);
    // Một lần góp đầy ví vẫn không vượt trần điểm tông
    expect(SECT_POINTS_CAP).toBeGreaterThan(SECT_CONTRIB_CAP);
  });

  it("thuật ngữ: không rỗng, không trùng nhau", () => {
    const vals = Object.values(SECT_TERMS);
    expect(new Set(vals).size).toBe(vals.length);
    for (const v of vals) expect(v.trim().length).toBeGreaterThan(1);
  });
});

describe("bảng cấp tông (mục 12.4)", () => {
  it("5 cấp, điểm tăng NGHIÊM NGẶT từ 0, giới hạn / buff / nhóm hàng không giảm", () => {
    expect(SECT_LEVEL_MAX).toBe(5);
    expect(SECT_LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    expect(SECT_LEVELS[0]!.points).toBe(0);
    for (let i = 1; i < SECT_LEVELS.length; i++) {
      const a = SECT_LEVELS[i - 1]!;
      const b = SECT_LEVELS[i]!;
      expect(b.points).toBeGreaterThan(a.points);
      expect(b.maxMembers).toBeGreaterThanOrEqual(a.maxMembers);
      expect(b.maxElders).toBeGreaterThanOrEqual(a.maxElders);
      expect(b.vaultSlots).toBeGreaterThanOrEqual(a.vaultSlots);
      expect(b.shopGroup).toBeGreaterThanOrEqual(a.shopGroup);
      expect(b.buff.exp).toBeGreaterThanOrEqual(a.buff.exp);
      expect(b.buff.drop).toBeGreaterThanOrEqual(a.buff.drop);
      expect(b.buff.regen).toBeGreaterThanOrEqual(a.buff.regen);
    }
  });

  it("cấp 1 GIỮ đúng giới hạn đang chạy (30 thành viên, 3 Trưởng lão, 40 ô, không buff): không tông môn nào bị vượt giới hạn", () => {
    const l1 = SECT_LEVELS[0]!;
    expect(l1.maxMembers).toBe(SECT_MAX_MEMBERS);
    expect(l1.maxElders).toBe(SECT_ELDERS_MAX);
    expect(l1.vaultSlots).toBe(SECT_VAULT_SLOTS);
    expect(l1.buff).toEqual({ exp: 1, drop: 1, regen: 1 });
  });

  it("ô kho cấp cao nhất đúng SECT_VAULT_SLOTS_MAX; buff không vượt trần cứng và không dưới 1; tên cấp không rỗng, không trùng", () => {
    expect(SECT_LEVELS[SECT_LEVEL_MAX - 1]!.vaultSlots).toBe(SECT_VAULT_SLOTS_MAX);
    for (const l of SECT_LEVELS) {
      expect(l.vaultSlots).toBeLessThanOrEqual(SECT_VAULT_SLOTS_MAX);
      expect(l.buff.exp).toBeGreaterThanOrEqual(1);
      expect(l.buff.exp).toBeLessThanOrEqual(SECT_BUFF_EXP_MAX);
      expect(l.buff.drop).toBeGreaterThanOrEqual(1);
      expect(l.buff.drop).toBeLessThanOrEqual(SECT_BUFF_DROP_MAX);
      expect(l.buff.regen).toBeGreaterThanOrEqual(1);
      expect(l.buff.regen).toBeLessThanOrEqual(SECT_BUFF_REGEN_MAX);
      expect(l.name.trim().length).toBeGreaterThan(1);
    }
    expect(new Set(SECT_LEVELS.map((l) => l.name)).size).toBe(SECT_LEVEL_MAX);
    // buff tu vi tối đa +5% (ngân sách cân bằng mục 12.5)
    expect(SECT_LEVELS[SECT_LEVEL_MAX - 1]!.buff.exp).toBeLessThanOrEqual(1.05);
  });

  it("sectLevelOf: đúng ở các biên điểm; số xấu coi là 0 điểm", () => {
    expect(sectLevelOf(0)).toBe(1);
    expect(sectLevelOf(999)).toBe(1);
    expect(sectLevelOf(1_000)).toBe(2);
    expect(sectLevelOf(3_999)).toBe(2);
    expect(sectLevelOf(4_000)).toBe(3);
    expect(sectLevelOf(11_999)).toBe(3);
    expect(sectLevelOf(12_000)).toBe(4);
    expect(sectLevelOf(29_999)).toBe(4);
    expect(sectLevelOf(30_000)).toBe(5);
    expect(sectLevelOf(SECT_POINTS_CAP)).toBe(5);
    for (const bad of [NaN, -5, Infinity * -1, "1000", null, undefined, {}, [], -0]) {
      expect(sectLevelOf(bad)).toBe(1);
    }
    // Infinity dương cũng không phải số hữu hạn
    expect(sectLevelOf(Infinity)).toBe(1);
  });

  it("sectLevelInfo kẹp về 1..5; sectBuffOf trả BẢN SAO; sectPointsToNext", () => {
    expect(sectLevelInfo(0).level).toBe(1);
    expect(sectLevelInfo(-3).level).toBe(1);
    expect(sectLevelInfo(99).level).toBe(SECT_LEVEL_MAX);
    expect(sectLevelInfo(2.9).level).toBe(2);
    expect(sectLevelInfo("x").level).toBe(1);
    expect(sectLevelInfo(NaN).level).toBe(1);
    const before = JSON.parse(JSON.stringify(SECT_LEVELS));
    const b = sectBuffOf(5);
    b.exp = 99;
    b.regen = 99;
    expect(sectBuffOf(5)).toEqual(before[4].buff);
    expect(JSON.parse(JSON.stringify(SECT_LEVELS))).toEqual(before); // bảng gốc không bị sửa
    expect(sectPointsToNext(0)).toBe(1_000);
    expect(sectPointsToNext(1_000)).toBe(3_000);
    expect(sectPointsToNext(29_999)).toBe(1);
    expect(sectPointsToNext(30_000)).toBeNull();
    expect(sectPointsToNext(NaN)).toBe(1_000);
  });
});

describe("ngày giờ Việt Nam và chờ sang ngày (mục 12.3)", () => {
  // 17/11/2026 00:00 giờ VN = 16/11/2026 17:00 UTC
  const vnMidnight = Date.UTC(2026, 10, 16, 17, 0, 0);

  it("sectResetAt: đúng 00:00 VN kế tiếp; tại đúng 00:00 thì sang ngày kế; không hợp lệ -> 0", () => {
    expect(sectResetAt(vnMidnight - 1)).toBe(vnMidnight);
    expect(sectResetAt(vnMidnight)).toBe(vnMidnight + 86_400_000);
    expect(sectResetAt(vnMidnight + 3_600_000)).toBe(vnMidnight + 86_400_000);
    expect(sectResetAt(NaN)).toBe(0);
    expect(sectResetAt(Infinity)).toBe(0);
    for (const t of [vnMidnight - 5, vnMidnight + 12_345_678, 1_780_000_000_000]) {
      const r = sectResetAt(t);
      expect(r).toBeGreaterThan(t);
      expect(dayKey(r - 1)).toBe(dayKey(t));
      expect(dayKey(r)).not.toBe(dayKey(t));
    }
  });

  it("sectCanEarn: vào tông từ TRƯỚC hôm nay mới kiếm được; cùng ngày thì chưa; qua nửa đêm thì được", () => {
    const joined = vnMidnight - 60_000; // 23:59 hôm trước
    expect(sectCanEarn(joined, vnMidnight - 1)).toBe(false); // vẫn cùng ngày
    expect(sectCanEarn(joined, vnMidnight)).toBe(true); // qua 00:00
    expect(sectCanEarn(vnMidnight, vnMidnight + 3_600_000)).toBe(false); // vào 00:00 hôm nay, 01:00 vẫn chưa
    expect(sectCanEarn(vnMidnight, vnMidnight + 86_400_000)).toBe(true);
    expect(sectCanEarn(NaN, vnMidnight)).toBe(false);
    expect(sectCanEarn(vnMidnight, Infinity)).toBe(false);
    // warmup tắt (chỉ dev / E2E): kiếm ngay
    expect(sectCanEarn(vnMidnight, vnMidnight + 1000, false)).toBe(true);
  });

  it("sectEarnFromAt: 00:00 VN kế tiếp sau lúc vào; 0 khi warmup tắt hoặc số xấu", () => {
    const joined = vnMidnight + 5 * 3_600_000;
    expect(sectEarnFromAt(joined)).toBe(vnMidnight + 86_400_000);
    expect(sectEarnFromAt(joined, false)).toBe(0);
    expect(sectEarnFromAt(NaN)).toBe(0);
    // nhất quán với sectCanEarn
    expect(sectCanEarn(joined, sectEarnFromAt(joined) - 1)).toBe(false);
    expect(sectCanEarn(joined, sectEarnFromAt(joined))).toBe(true);
  });
});

describe("sổ ngày của thành viên (sectDayState)", () => {
  const now = Date.UTC(2026, 10, 17, 3, 0, 0); // 10:00 VN 17/11
  const today = dayKey(now);
  const someQuest = SECT_QUESTS[0]!.id; // sổ ngày lưu id MẪU, không phải id cụ thể có hậu tố bậc

  it("thiếu / sai kiểu / khác ngày -> sổ MỚI của hôm nay", () => {
    const fresh = emptySectDay(today);
    for (const bad of [undefined, null, 5, "x", [], { day: "2000-01-01", earned: 99 }]) {
      expect(sectDayState(bad, now)).toEqual(fresh);
    }
    // thời điểm không hợp lệ không ném lỗi
    expect(() => sectDayState(null, NaN)).not.toThrow();
  });

  it("cùng ngày: giữ số hợp lệ, kẹp trần, bỏ id nhiệm vụ lạ và trùng, bỏ món lạ, không sửa đối tượng gốc", () => {
    const raw = {
      day: today,
      earned: 9999,
      deposit: 500,
      quests: [someQuest, someQuest, `${someQuest}.t0`, "constructor", "khong_co", 7],
      dungeon: true,
      buys: { [SECT_SHOP[0]!.itemId]: 9999, constructor: 3, ["__proto__"]: 4, khong_co: 2 },
    };
    const copy = JSON.parse(JSON.stringify(raw));
    const s = sectDayState(raw, now);
    expect(s.earned).toBe(SECT_EARN_DAY_CAP);
    expect(s.deposit).toBe(SECT_DEPOSIT_DAY_CAP);
    expect(s.quests).toEqual([someQuest]);
    expect(s.dungeon).toBe(true);
    expect(s.buys).toEqual({ [SECT_SHOP[0]!.itemId]: SECT_SHOP[0]!.limitDay });
    expect(JSON.parse(JSON.stringify(raw))).toEqual(copy);
    // deposit không bao giờ vượt earned
    const s2 = sectDayState({ day: today, earned: 5, deposit: 30 }, now);
    expect(s2.deposit).toBe(5);
    // số lẻ / âm / chuỗi -> 0
    const s3 = sectDayState({ day: today, earned: 1.5, deposit: -3 }, now);
    expect(s3.earned).toBe(0);
    expect(s3.deposit).toBe(0);
  });
});

describe("sectAwardDay: MỘT nơi tính cống hiến (mục 12.3)", () => {
  const day0 = emptySectDay("2026-11-17");
  const q = Object.keys(SECT_QUEST_BY_ID)[0]!;

  it("góp kho bị chặn bởi trần góp (vòng góp - rút không kiếm quá trần)", () => {
    let d = day0;
    let total = 0;
    for (let i = 0; i < 50; i++) {
      const r = sectAwardDay(d, "deposit", 7);
      d = r.day;
      total += r.granted;
    }
    expect(total).toBe(SECT_DEPOSIT_DAY_CAP);
    expect(d.deposit).toBe(SECT_DEPOSIT_DAY_CAP);
    expect(sectEarnLeft(d, "deposit")).toBe(0);
  });

  it("bí cảnh: một lần mỗi ngày; nhiệm vụ: mỗi id một lần, id lạ bị bỏ", () => {
    const a = sectAwardDay(day0, "dungeon", SECT_DUNGEON_CH);
    expect(a.granted).toBe(SECT_DUNGEON_CH);
    expect(a.day.dungeon).toBe(true);
    expect(sectAwardDay(a.day, "dungeon", SECT_DUNGEON_CH).granted).toBe(0);
    const b = sectAwardDay(day0, "quest", 30, q);
    expect(b.granted).toBe(sectQuestCh(q)); // kẹp theo phần của nhiệm vụ (F2): xin 30 mà nhiệm vụ chỉ 20 thì được 20
    expect(b.day.quests).toEqual([sectQuestTemplateOf(q)]); // lưu id MẪU
    const again = sectAwardDay(b.day, "quest", 30, q);
    expect(again.granted).toBe(0);
    expect(again.refused).toBe("quest_done");
    for (const key of [undefined, "constructor", "khong_co", "__proto__"]) {
      expect(sectAwardDay(day0, "quest", 30, key as string).granted).toBe(0);
    }
  });

  it("số muốn cộng xấu (0, âm, lẻ, NaN, quá lớn) không cộng gì hoặc bị kẹp theo trần; KHÔNG sửa sổ đầu vào", () => {
    const frozen: SectDayState = JSON.parse(JSON.stringify(day0));
    for (const bad of [0, -5, 1.5, NaN, Infinity]) {
      expect(sectAwardDay(day0, "deposit", bad).granted).toBe(0);
    }
    expect(sectAwardDay(day0, "deposit", 1e12).granted).toBe(SECT_DEPOSIT_DAY_CAP);
    // F2: nhiệm vụ KHÔNG cho xin quá phần của nó dù `want` khổng lồ (không thể bơm tới trần ngày)
    expect(sectAwardDay(day0, "quest", 1e12, q).granted).toBe(sectQuestCh(q));
    expect(sectAwardDay(day0, "quest", 9999, q).granted).toBe(sectQuestCh(q));
    expect(sectAwardDay(day0, "quest", 5, q).granted).toBe(5); // xin ít hơn thì được ít hơn
    expect(day0).toEqual(frozen);
  });

  it("BẤT BIẾN (kịch bản ngẫu nhiên có seed): tổng một ngày <= SECT_EARN_DAY_CAP, góp <= trần góp, tổng cộng dồn khớp từng lần cấp", () => {
    const questIds = Object.keys(SECT_QUEST_BY_ID);
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = lcg(seed);
      let d = emptySectDay("2026-11-17");
      let sum = 0;
      for (let i = 0; i < 60; i++) {
        const k = Math.floor(rnd() * 3);
        const source = (["quest", "deposit", "dungeon"] as const)[k]!;
        const want = 1 + Math.floor(rnd() * 80);
        const key = source === "quest" ? questIds[Math.floor(rnd() * questIds.length)] : undefined;
        const r = sectAwardDay(d, source, want, key);
        expect(r.granted).toBeGreaterThanOrEqual(0);
        expect(r.granted).toBeLessThanOrEqual(want);
        sum += r.granted;
        d = r.day;
        expect(d.earned).toBe(sum);
        expect(d.earned).toBeLessThanOrEqual(SECT_EARN_DAY_CAP);
        expect(d.deposit).toBeLessThanOrEqual(SECT_DEPOSIT_DAY_CAP);
        expect(d.deposit).toBeLessThanOrEqual(d.earned);
        expect(new Set(d.quests).size).toBe(d.quests.length);
      }
    }
  });

  it("góp kho đổi ra cống hiến: tiền / đồ theo ITEM_VALUE, làm tròn xuống, số xấu = 0", () => {
    expect(sectDepositValue({ coin: 250 })).toBe(250);
    expect(sectDepositValue({ coin: -1 })).toBe(0);
    expect(sectDepositValue({ coin: 1.5 })).toBe(0);
    expect(sectDepositValue({ coin: COIN_CAP })).toBe(COIN_CAP);
    expect(sectDepositValue({ itemId: "tu_khi_dan", qty: 3 })).toBe(270); // 90 x 3
    expect(sectDepositValue({ itemId: "khong_co", qty: 3 })).toBe(0);
    expect(sectDepositValue({ itemId: "constructor", qty: 3 })).toBe(0);
    expect(sectDepositValue({ itemId: "tu_khi_dan", qty: 0 })).toBe(0);
    expect(sectDepositCh(99)).toBe(0);
    expect(sectDepositCh(100)).toBe(1);
    expect(sectDepositCh(250)).toBe(2);
    expect(sectDepositCh(NaN)).toBe(0);
    expect(sectDepositCh(-100)).toBe(0);
  });
});

describe("F1: nhiệm vụ khoá theo MẪU, đổi bậc giữa ngày không làm lại được (mục 12.7)", () => {
  const tpl = SECT_QUESTS[0]!; // mẫu thật: có đủ 4 bậc 0-3
  const t0 = sectQuestId(tpl.id, 0);
  const t1 = sectQuestId(tpl.id, 1);
  const day0 = emptySectDay("2026-11-17");

  it("sectQuestTemplateOf: id cụ thể -> id mẫu; id lạ / không đúng dạng -> undefined", () => {
    expect(sectQuestTemplateOf(t0)).toBe(tpl.id);
    expect(sectQuestTemplateOf(t1)).toBe(tpl.id);
    // mọi bậc 0-3 của mẫu thật đều là nhiệm vụ cụ thể hợp lệ -> KHÔNG nằm trong danh sách xấu
    for (const bad of [
      undefined,
      null,
      5,
      "",
      tpl.id,
      `${tpl.id}.t9`,
      "st_khong_co.t0",
      "constructor",
      "__proto__",
      ".t0",
    ]) {
      expect(sectQuestTemplateOf(bad)).toBeUndefined();
    }
    expect(isSectQuestTemplate(tpl.id)).toBe(true);
    for (const bad of [t0, "constructor", "__proto__", 5, null, undefined]) {
      expect(isSectQuestTemplate(bad)).toBe(false);
    }
  });

  it("trả bản .t0 rồi bản .t1 của CÙNG mẫu (đột phá giữa ngày): lần hai bị quest_done, không cộng gì", () => {
    const a = sectAwardDay(day0, "quest", 99, t0);
    expect(a.granted).toBe(sectQuestCh(t0));
    expect(a.day.quests).toEqual([tpl.id]); // lưu id MẪU
    const b = sectAwardDay(a.day, "quest", 99, t1);
    expect(b).toMatchObject({ granted: 0, refused: "quest_done" });
    expect(b.day.earned).toBe(a.day.earned);
    expect(b.day.quests).toEqual([tpl.id]);
  });

  it("ngược chiều (đầu thai về bậc thấp): trả .t1 rồi .t0 cũng bị quest_done; ĐỌC LẠI qua sectDayState giữ nguyên khoá", () => {
    const a = sectAwardDay(day0, "quest", 99, t1);
    const reread = sectDayState(JSON.parse(JSON.stringify(a.day)), Date.UTC(2026, 10, 17, 3, 0, 0));
    expect(reread.day).toBe("2026-11-17");
    expect(reread.quests).toEqual([tpl.id]);
    expect(sectAwardDay(reread, "quest", 99, t0)).toMatchObject({
      granted: 0,
      refused: "quest_done",
    });
    // mẫu KHÁC thì vẫn trả được bình thường
    const other = SECT_QUESTS[1]!;
    expect(sectAwardDay(reread, "quest", 99, sectQuestId(other.id, 0)).granted).toBe(
      sectQuestCh(sectQuestId(other.id, 0)),
    );
  });

  it("sổ ngày cũ lưu id CỤ THỂ (không phải id mẫu) bị lọc bỏ khi đọc (không phải khoá hợp lệ)", () => {
    const s = sectDayState(
      { day: "2026-11-17", earned: 20, quests: [t0] },
      Date.UTC(2026, 10, 17, 3, 0, 0),
    );
    expect(s.quests).toEqual([]);
  });

  it("questDefAny tra cả hai bảng bằng hasOwnProperty: nhiệm vụ thường, nhiệm vụ tông; lạ và khoá nguyên mẫu -> undefined", () => {
    expect(questDefAny(QUESTS[0]!.id)).toBe(QUEST_BY_ID[QUESTS[0]!.id]);
    expect(questDefAny(t0)).toBe(SECT_QUEST_BY_ID[t0]);
    for (const bad of [
      undefined,
      null,
      5,
      "khong_co",
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
    ]) {
      expect(questDefAny(bad)).toBeUndefined();
    }
    expect(Object.keys(SECT_QUEST_TEMPLATE_BY_ID).sort()).toEqual(
      SECT_QUESTS.map((t) => t.id).sort(),
    );
  });
});

describe("nhiệm vụ tông môn (mục 12.7)", () => {
  it("mọi nhiệm vụ cụ thể: giver là SECT_QUEST_GIVER (KHÔNG phải NPC), hằng ngày, quái / vật phẩm CÓ THẬT, bước hợp lệ, id đúng mẫu", () => {
    expect(NPC_BY_ID[SECT_QUEST_GIVER]).toBeUndefined();
    const ids = Object.keys(SECT_QUEST_BY_ID);
    expect(ids.length).toBeGreaterThan(0);
    for (const [id, def] of Object.entries(SECT_QUEST_BY_ID)) {
      expect(def.id).toBe(id);
      expect(def.giver).toBe(SECT_QUEST_GIVER);
      expect(isSectQuest(def)).toBe(true);
      expect(def.daily).toBe(true);
      expect(def.steps.length).toBeGreaterThan(0);
      for (const s of def.steps) {
        if (s.kind === "kill") {
          expect(MONSTER_BY_ID[s.monster]).toBeDefined();
          expect(s.count).toBeGreaterThan(0);
        } else if (s.kind === "collect") {
          expect(ITEM_BY_ID[s.itemId]).toBeDefined();
          expect(s.count).toBeGreaterThan(0);
        } else {
          throw new Error(`loại bước ${s.kind} chưa dùng cho nhiệm vụ tông`);
        }
      }
      for (const it of def.rewards.items ?? []) expect(ITEM_BY_ID[it.itemId]).toBeDefined();
      for (const k of ["offer", "progress", "complete"] as const) {
        expect(def.talk[k].length).toBeGreaterThan(0);
      }
    }
  });

  it("sectQuestViolations: bảng khung sạch; bắt đúng quái / vật phẩm lạ, bậc rỗng, số lượng xấu, độ khó xấu, trùng mẫu", () => {
    expect(sectQuestViolations()).toEqual([]);
    const t = SECT_QUESTS[0]!;
    const v = (patch: Partial<typeof t>) => sectQuestViolations([{ ...t, ...patch }]).join("|");
    expect(v({ difficulty: 4 as 1 })).toMatch(/độ khó/);
    expect(v({ id: "Sai Dang" })).toMatch(/id sai dạng/);
    expect(v({ byTier: {} })).toMatch(/không có bậc nào/);
    expect(v({ talk: { offer: [], progress: ["a"], complete: ["b"] } })).toMatch(/lời thoại offer/);
    expect(
      v({
        byTier: { 0: { steps: [{ kind: "kill", monster: "khong_co", count: 3 }], rewards: {} } },
      }),
    ).toMatch(/quái khong_co không tồn tại/);
    expect(
      v({ byTier: { 0: { steps: [{ kind: "kill", monster: "lang", count: 0 }], rewards: {} } } }),
    ).toMatch(/số lượng không hợp lệ/);
    expect(
      v({
        byTier: {
          0: { steps: [{ kind: "collect", itemId: "constructor", count: 2 }], rewards: {} },
        },
      }),
    ).toMatch(/vật phẩm constructor không tồn tại/);
    expect(
      v({
        byTier: {
          0: {
            steps: [{ kind: "kill", monster: "lang", count: 1 }],
            rewards: { items: [{ itemId: "x", qty: 1 }] },
          },
        },
      }),
    ).toMatch(/phần thưởng x không tồn tại/);
    expect(
      v({ byTier: { 0: { steps: [{ kind: "talk", npcId: "cao_thi" }], rewards: {} } } }),
    ).toMatch(/chưa dùng/);
    expect(sectQuestViolations([t, t]).join()).toMatch(/trùng mẫu/);
  });

  it("nhiệm vụ tông KHÔNG nằm trong QUESTS / QUEST_BY_ID (dấu '!' '?' trên NPC và nhiệm vụ thường không bị ảnh hưởng); id mẫu không đụng id nhiệm vụ thường", () => {
    for (const q of QUESTS) expect(isSectQuest(q)).toBe(false);
    for (const id of Object.keys(SECT_QUEST_BY_ID)) {
      expect(QUEST_BY_ID[id]).toBeUndefined();
    }
    expect(isSectQuest({})).toBe(false);
    expect(isSectQuest({ giver: "cao_thi" })).toBe(false);
  });

  it("mẫu: id duy nhất, tiền tố st_, độ khó 1-3 đủ cả ba, có ít nhất một bậc, sectQuestCh theo độ khó", () => {
    const tplIds = SECT_QUESTS.map((t) => t.id);
    expect(new Set(tplIds).size).toBe(tplIds.length);
    for (const t of SECT_QUESTS) {
      expect(t.id).toMatch(/^st_[a-z0-9_]+$/);
      expect([1, 2, 3]).toContain(t.difficulty);
      expect(Object.keys(t.byTier).length).toBeGreaterThan(0);
      for (const tier of SECT_QUEST_TIERS) {
        if (t.byTier[tier]) {
          expect(sectQuestCh(sectQuestId(t.id, tier))).toBe(SECT_QUEST_CH[t.difficulty - 1]);
        }
      }
    }
    for (const d of [1, 2, 3]) expect(SECT_QUESTS.some((t) => t.difficulty === d)).toBe(true);
    for (const bad of [undefined, 5, null, "constructor", "st_khong_co.t0", "__proto__"]) {
      expect(sectQuestCh(bad)).toBe(0);
    }
  });

  it("dữ liệu thật (M8.7a, #856): >= 12 mẫu, mỗi độ khó >= 4 mẫu, mọi mẫu có đủ cả 4 bậc", () => {
    expect(SECT_QUESTS.length).toBeGreaterThanOrEqual(12);
    for (const d of [1, 2, 3] as const)
      expect(SECT_QUESTS.filter((t) => t.difficulty === d).length).toBeGreaterThanOrEqual(4);
    for (const t of SECT_QUESTS) {
      for (const tier of SECT_QUEST_TIERS)
        expect(t.byTier[tier], `${t.id} thiếu bậc ${tier}`).toBeDefined();
    }
  });

  it("không khó hơn bậc (min-safe-tier): kill / collect ở bậc T chỉ dùng quái / nguyên liệu vừa sức bậc T", () => {
    // Bậc an toàn tối thiểu của mỗi quái (hunt-check: tho/lang=0, ho=1, loài Kim Đan=2, loài Nguyên Anh=3).
    const minTierMonster: Record<string, number> = {
      tho: 0,
      lang: 0,
      ho: 1,
      suong_ho: 2,
      thach_quy: 2,
      doc_thiem: 2,
      han_lang: 3,
      phong_nha: 3,
      cot_tuong: 3,
      doc_tuoc: 3,
    };
    // Nguyên liệu -> bậc an toàn = bậc của quái rơi nó (DROP_TABLES): nanh_soi/long_tho=0, da_ho=1, phần còn lại theo quái Kim Đan / Nguyên Anh.
    const minTierItem: Record<string, number> = {};
    for (const [mid, entries] of Object.entries(DROP_TABLES)) {
      const mt = minTierMonster[mid];
      if (mt === undefined) continue; // trùm / quái không dùng cho nhiệm vụ hằng ngày
      for (const e of entries) if (typeof e.itemId === "string") minTierItem[e.itemId] = mt;
    }
    for (const t of SECT_QUESTS) {
      for (const tier of SECT_QUEST_TIERS) {
        const d = t.byTier[tier]!;
        for (const st of d.steps) {
          const where = `${t.id}.t${tier}`;
          if (st.kind === "kill") {
            expect(minTierMonster[st.monster], `${where}: quái ${st.monster}`).toBeLessThanOrEqual(
              tier,
            );
          } else if (st.kind === "collect") {
            expect(
              minTierItem[st.itemId],
              `${where}: nguyên liệu ${st.itemId}`,
            ).toBeLessThanOrEqual(tier);
          }
        }
      }
    }
  });

  it("sectQuestSlots trải đều qua 60 ngày (mỗi độ khó >= 4 mẫu nên phải thấy nhiều mẫu, không kẹt một bộ)", () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 60; d++)
      seen.add(
        sectQuestSlots(
          "tong-a",
          `2026-${String(Math.floor(d / 2) + 1).padStart(2, "0")}-${String((d % 28) + 1).padStart(2, "0")}`,
        ).join(","),
      );
    // 60 ngày với >= 4 mẫu / độ khó: phải thấy hơn một tổ hợp chọn (không kẹt một bộ)
    expect(seen.size).toBeGreaterThan(1);
  });

  it("sectTierOfRealm: Luyện Khí trở xuống 0, Trúc Cơ 1, Kim Đan 2, Nguyên Anh trở lên 3; số xấu 0", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(sectTierOfRealm)).toEqual([0, 0, 1, 2, 3, 3, 3]);
    for (const bad of [NaN, -1, "2", null, undefined]) expect(sectTierOfRealm(bad)).toBe(0);
  });

  it("sectQuestSlots: tất định, tối đa 3, ô i có độ khó i + 1, mọi mẫu có thật; ngày khác nhau cho kết quả khác (không kẹt một bộ)", () => {
    const a = sectQuestSlots("tong-a", "2026-11-17");
    expect(sectQuestSlots("tong-a", "2026-11-17")).toEqual(a);
    expect(a.length).toBeLessThanOrEqual(SECT_QUEST_SLOTS);
    a.forEach((id, i) => {
      const t = SECT_QUESTS.find((x) => x.id === id);
      expect(t).toBeDefined();
      expect(t!.difficulty).toBe(i + 1);
    });
    // thử 60 ngày: nếu mỗi độ khó có >= 2 mẫu thì phải thấy sự khác nhau; khung chỉ có 1 mẫu / độ khó thì chỉ cần không lỗi
    const seen = new Set<string>();
    for (let d = 1; d <= 60; d++)
      seen.add(
        sectQuestSlots("tong-a", `2026-12-${String((d % 28) + 1).padStart(2, "0")}`).join(","),
      );
    const multi = [1, 2, 3].some((df) => SECT_QUESTS.filter((t) => t.difficulty === df).length > 1);
    if (multi) expect(seen.size).toBeGreaterThan(1);
    // bảng tổng hợp 5 mẫu / độ khó: chọn PHẢI trải ra nhiều mẫu qua các ngày (không kẹt một mẫu), vẫn tất định và đúng độ khó ô
    const pool = (df: 1 | 2 | 3) =>
      Array.from({ length: 5 }, (_, n) => ({
        ...SECT_QUESTS[df - 1]!,
        id: `st_gia_${df}_${n}`,
        difficulty: df,
      }));
    const big = [...pool(1), ...pool(2), ...pool(3)];
    const picked: Set<string>[] = [new Set(), new Set(), new Set()];
    for (let d = 0; d < 120; d++) {
      const day = dayKey(Date.UTC(2026, 0, 1) + d * 86_400_000);
      const slots = sectQuestSlots("tong-x", day, big);
      expect(sectQuestSlots("tong-x", day, big)).toEqual(slots);
      expect(slots).toHaveLength(3);
      slots.forEach((id, i) => {
        expect(id.startsWith(`st_gia_${i + 1}_`)).toBe(true);
        picked[i]!.add(id);
      });
    }
    for (const set of picked) expect(set.size).toBe(5); // 120 ngày phủ hết 5 mẫu
    // hai tông môn khác nhau cho chuỗi chọn khác nhau (không dùng chung một bộ)
    const days = Array.from({ length: 30 }, (_, d) =>
      dayKey(Date.UTC(2026, 0, 1) + d * 86_400_000),
    );
    const seqA = days.map((d) => sectQuestSlots("tong-a", d, big).join());
    const seqB = days.map((d) => sectQuestSlots("tong-b", d, big).join());
    expect(seqA).not.toEqual(seqB);
    // hai tông môn khác nhau có thể khác nhau, nhưng luôn hợp lệ
    for (const id of sectQuestSlots("tong-b", "2026-11-17")) {
      expect(SECT_QUESTS.some((t) => t.id === id)).toBe(true);
    }
  });

  it("sectQuestFor: bản của bậc mình, thiếu thì bậc thấp hơn gần nhất; mẫu lạ / không bản vừa sức -> undefined", () => {
    const t = SECT_QUESTS[0]!; // mẫu thật: có đủ 4 bậc 0-3
    expect(sectQuestFor(t.id, 1)).toBe(sectQuestId(t.id, 0));
    expect(sectQuestFor(t.id, 0)).toBe(sectQuestId(t.id, 0));
    expect(sectQuestFor(t.id, 2)).toBe(sectQuestId(t.id, 1));
    expect(sectQuestFor(t.id, 3)).toBe(sectQuestId(t.id, 2));
    // Nguyên Anh (realm 4 -> bậc 3) nhận bản bậc 3 của mẫu có đủ cả 4 bậc
    expect(sectQuestFor(t.id, 4)).toBe(sectQuestId(t.id, 3));
    expect(sectQuestFor("st_khong_co", 1)).toBeUndefined();
    expect(sectQuestFor("constructor", 1)).toBeUndefined();
    expect(sectQuestFor(t.id, NaN)).toBe(sectQuestId(t.id, 0));
  });
});

describe("cửa hàng tông môn (mục 12.6)", () => {
  it("bảng khung hợp lệ và đúng neo giá (mua bằng cống hiến không rẻ hơn mua ở NPC)", () => {
    expect(sectShopViolations()).toEqual([]);
  });

  describe("bảng THẬT (M8.7, #844): năm nhóm hàng, giá neo theo giá trị, không bán trang bị", () => {
    const entries = [...SECT_SHOP];
    const itemOf = (id: string) => ITEM_BY_ID[id]!;

    it("đủ năm nhóm: nhóm k mở ở cấp tông k (mục 12.4), mỗi cấp có ít nhất một món", () => {
      for (let lv = 1; lv <= 5; lv++)
        expect(
          entries.some((e) => e.minLevel === lv),
          `cấp ${lv} không có món nào`,
        ).toBe(true);
      expect(entries.every((e) => e.minLevel >= 1 && e.minLevel <= 5)).toBe(true);
    });

    it("Bảo khố bán đồ dùng, Tàng Kinh Các bán kinh quyển (hall khớp loại vật phẩm)", () => {
      for (const e of entries)
        expect(e.hall, e.itemId).toBe(itemOf(e.itemId).type === "book" ? "tangKinh" : "baoKho");
      expect(entries.some((e) => e.hall === "tangKinh")).toBe(true);
      expect(entries.some((e) => e.hall === "baoKho")).toBe(true);
    });

    it("KHÔNG bán trang bị (rơi từ trùm / nghề nhỏ là mốc tiến độ; bán bằng cống hiến sẽ đi tắt)", () => {
      for (const e of entries) expect(itemOf(e.itemId).type, e.itemId).not.toBe("equip");
    });

    it("kinh quyển theo cấp: cấp 2 rarity <= 1, cấp 4 rarity 2, cấp 5 rarity 3; mỗi quyển 1 lượt / ngày", () => {
      for (const e of entries.filter((x) => itemOf(x.itemId).type === "book")) {
        const r = itemOf(e.itemId).rarity;
        if (e.minLevel === 2) expect(r, e.itemId).toBeLessThanOrEqual(1);
        else if (e.minLevel === 4) expect(r, e.itemId).toBe(2);
        else if (e.minLevel === 5) expect(r, e.itemId).toBe(3);
        else
          throw new Error(`${e.itemId}: kinh quyển chỉ ở cấp 2 / 4 / 5, không phải ${e.minLevel}`);
        expect(e.limitDay, e.itemId).toBe(1);
      }
    });

    it("GIÁ: mọi món có giá trị đều phải mua bằng cống hiến KHÔNG rẻ hơn 1,5 lần giá trị (chống sinh Linh thạch qua bán lại) và không quá 3 lần", () => {
      for (const e of entries) {
        const v = ITEM_VALUE[e.itemId];
        expect(v, `${e.itemId} không có giá trị`).toBeGreaterThan(0);
        expect(e.cost * SECT_CH_VALUE_LT, `${e.itemId} quá rẻ`).toBeGreaterThanOrEqual(1.5 * v!);
        expect(e.cost * SECT_CH_VALUE_LT, `${e.itemId} quá đắt`).toBeLessThanOrEqual(
          3 * v! + SECT_CH_VALUE_LT,
        );
      }
    });

    it("hạn mức ngày trong khoảng mua một lượt (không bắt người chơi bấm hơn một lượt cho hạn mức)", () => {
      for (const e of entries) expect(e.limitDay, e.itemId).toBeLessThanOrEqual(SECT_SHOP_QTY_MAX);
    });
  });

  it("sectShopViolations bắt đúng: món lạ, trùng, giá / hạn mức / cấp xấu, RẺ HƠN NPC", () => {
    const ok: SectShopEntry = {
      itemId: "tu_khi_dan",
      cost: 30,
      minLevel: 3,
      limitDay: 2,
      hall: "baoKho",
    };
    expect(sectShopViolations([ok])).toEqual([]);
    expect(sectShopViolations([{ ...ok, itemId: "khong_co" }]).join()).toMatch(/không tồn tại/);
    expect(sectShopViolations([ok, ok]).join()).toMatch(/trùng/);
    expect(sectShopViolations([{ ...ok, cost: 0 }]).join()).toMatch(/giá/);
    expect(sectShopViolations([{ ...ok, cost: 1.5 }]).join()).toMatch(/giá/);
    expect(sectShopViolations([{ ...ok, limitDay: 0 }]).join()).toMatch(/hạn mức/);
    expect(sectShopViolations([{ ...ok, minLevel: 0 }]).join()).toMatch(/cấp/);
    expect(sectShopViolations([{ ...ok, minLevel: SECT_LEVEL_MAX + 1 }]).join()).toMatch(/cấp/);
    // hồi huyết đan bán ở NPC giá 24: giá 4 cống hiến x 5 = 20 < 24 -> RẺ HƠN NPC
    const cheap: SectShopEntry = {
      itemId: "hoi_huyet_dan",
      cost: 4,
      minLevel: 1,
      limitDay: 5,
      hall: "baoKho",
    };
    expect(sectShopViolations([cheap]).join()).toMatch(/rẻ hơn mua ở NPC/);
    expect(sectShopViolations([{ ...cheap, cost: 5 }])).toEqual([]);
  });

  it("sectShopLock: thứ tự ưu tiên level > known > limit > no_contrib; mua được thì null", () => {
    const e: SectShopEntry = {
      itemId: "tu_khi_dan",
      cost: 30,
      minLevel: 3,
      limitDay: 2,
      hall: "baoKho",
    };
    const ok = { level: 3, contrib: 30, boughtToday: 0, known: false };
    expect(sectShopLock(e, ok)).toBeNull();
    expect(sectShopLock(e, { ...ok, level: 2 })).toBe("level");
    expect(sectShopLock(e, { ...ok, level: 2, known: true, boughtToday: 5, contrib: 0 })).toBe(
      "level",
    );
    expect(sectShopLock(e, { ...ok, known: true, boughtToday: 5, contrib: 0 })).toBe("known");
    expect(sectShopLock(e, { ...ok, boughtToday: 2, contrib: 0 })).toBe("limit");
    expect(sectShopLock(e, { ...ok, contrib: 29 })).toBe("no_contrib");
    expect(sectShopLock(e, { ...ok, contrib: 30, boughtToday: 1 })).toBeNull();
  });
});

describe("tin nhắn M8 và bộ đọc không tin client", () => {
  it("tên tin mới không trùng, đúng tiền tố, chiều đúng", () => {
    expect(SECT_MSG.questAccept).toBe("sectQuestAccept");
    expect(SECT_MSG.questTurnIn).toBe("sectQuestTurnIn");
    expect(SECT_MSG.shopBuy).toBe("sectShopBuy");
    expect(SECT_MSG.hallGet).toBe("sectHallGet");
    expect(SECT_MSG.hall).toBe("sectHall");
    const names = Object.values(SECT_MSG);
    expect(new Set(names).size).toBe(names.length);
  });

  it("parseSectQuest: chỉ nhiệm vụ tông CÓ THẬT (không lọt constructor / __proto__ / nhiệm vụ thường)", () => {
    const id = Object.keys(SECT_QUEST_BY_ID)[0]!;
    expect(parseSectQuest({ questId: id, thua: 1 })).toEqual({ questId: id });
    for (const bad of [
      null,
      undefined,
      [],
      {},
      { questId: 7 },
      { questId: "constructor" },
      { questId: "__proto__" },
      { questId: "toString" },
      { questId: QUESTS[0]!.id }, // nhiệm vụ thường không phải nhiệm vụ tông
      { questId: "st_khong_co.t0" },
    ]) {
      expect(parseSectQuest(bad)).toBeNull();
    }
  });

  it("parseSectShopBuy: món có trong bảng, số lượng nguyên 1..SECT_SHOP_QTY_MAX", () => {
    const itemId = SECT_SHOP[0]!.itemId;
    expect(parseSectShopBuy({ itemId, qty: 1 })).toEqual({ itemId, qty: 1 });
    expect(parseSectShopBuy({ itemId, qty: SECT_SHOP_QTY_MAX })).toEqual({
      itemId,
      qty: SECT_SHOP_QTY_MAX,
    });
    for (const bad of [
      null,
      [],
      {},
      { itemId },
      { itemId, qty: 0 },
      { itemId, qty: SECT_SHOP_QTY_MAX + 1 },
      { itemId, qty: 1.5 },
      { itemId, qty: NaN },
      { itemId, qty: "1" },
      { itemId: "constructor", qty: 1 },
      { itemId: "__proto__", qty: 1 },
      { itemId: "khong_co", qty: 1 },
      { itemId: 5, qty: 1 },
      { itemId: ITEM_BY_ID["giao_lan"] ? "giao_lan" : "x", qty: 1 }, // có thật nhưng KHÔNG bán ở cửa hàng tông
    ]) {
      expect(parseSectShopBuy(bad)).toBeNull();
    }
  });

  it("parseSectHallGet: nhận rỗng / object, từ chối kiểu lạ", () => {
    for (const ok of [undefined, null, {}, { thua: 1 }]) expect(parseSectHallGet(ok)).toBe(true);
    for (const bad of [5, "x", [], true]) expect(parseSectHallGet(bad)).toBe(false);
  });

  it("quyền: mọi chức vụ nhận / trả nhiệm vụ và mua; người ngoài tông môn thì không", () => {
    for (const rank of ["chu", "truong_lao", "de_tu"] as SectRank[]) {
      for (const a of ["questAccept", "questTurnIn", "shopBuy"] as const) {
        expect(canSect(a, rank)).toBe(true);
      }
    }
    for (const a of ["questAccept", "questTurnIn", "shopBuy"] as const) {
      expect(canSect(a, null)).toBe(false);
    }
  });
});

describe("ảnh chụp mẫu sampleSectHall (cho ?sectHall=mock và test)", () => {
  it("mọi cấp: đúng kiểu, nhất quán với bảng cấp, tất định, đi qua JSON không đổi", () => {
    for (let level = 1; level <= SECT_LEVEL_MAX; level++) {
      const h = sampleSectHall(level);
      const info = sectLevelInfo(level);
      expect(h.level).toBe(level);
      expect(h.buff).toEqual(info.buff);
      expect(h.caps).toEqual({
        members: info.maxMembers,
        elders: info.maxElders,
        vaultSlots: info.vaultSlots,
      });
      expect(h.pointsFrom).toBe(info.points);
      expect(sectLevelOf(h.points)).toBe(level);
      if (h.pointsNext === null) expect(level).toBe(SECT_LEVEL_MAX);
      else expect(h.points).toBeLessThan(h.pointsNext);
      expect(h.resetAt).toBeGreaterThan(h.now);
      expect(h.me.contrib).toBeLessThanOrEqual(h.me.merit);
      expect(h.me.earnedToday).toBeLessThanOrEqual(h.me.earnCap);
      expect(h.quests.length).toBeGreaterThan(0);
      for (const q of h.quests) {
        expect(SECT_QUEST_BY_ID[q.questId]).toBeDefined();
        expect(q.ch).toBe(sectQuestCh(q.questId));
      }
      for (const it of h.shop) {
        const e = SECT_SHOP.find((x) => x.itemId === it.itemId)!;
        expect(it.locked).toBe(
          sectShopLock(e, { level, contrib: h.me.contrib, boughtToday: 0, known: false }),
        );
        expect(it.left).toBe(e.limitDay);
      }
      expect(JSON.parse(JSON.stringify(h))).toEqual(h);
      expect(sampleSectHall(level)).toEqual(h);
    }
    // cấp ngoài khoảng được kẹp, không ném lỗi
    expect(sampleSectHall(0).level).toBe(1);
    expect(sampleSectHall(99).level).toBe(SECT_LEVEL_MAX);
    // món mở theo cấp: ở cấp 1 có món bị khoá "level"; ở cấp 5 không món nào bị khoá vì cấp
    expect(sampleSectHall(1).shop.some((s) => s.locked === "level")).toBe(true);
    expect(sampleSectHall(SECT_LEVEL_MAX).shop.some((s) => s.locked === "level")).toBe(false);
  });
});

describe("rollDrops(..., chanceMult) cho buff rơi đồ (mục 12.5)", () => {
  // Lấy một quái có món rơi với cơ hội trong (0, 0.9]: dùng làm bảng thử
  const kind = Object.keys(DROP_TABLES).find((k) =>
    DROP_TABLES[k]!.some((e) => e.chance > 0 && e.chance <= 0.9),
  )!;
  const entry = DROP_TABLES[kind]!.find((e) => e.chance > 0 && e.chance <= 0.9)!;

  /** rng trả `v` cho mọi lần gọi */
  const constRng = (v: number) => () => v;

  it("mặc định 1: y hệt trước M8 (cùng rng cho cùng kết quả và cùng số lần gọi)", () => {
    for (const k of Object.keys(DROP_TABLES)) {
      for (let seed = 1; seed <= 20; seed++) {
        const r1 = lcg(seed);
        const r2 = lcg(seed);
        let c1 = 0;
        let c2 = 0;
        const a = rollDrops(k, () => (c1++, r1()));
        const b = rollDrops(k, () => (c2++, r2()), 1);
        expect(b).toEqual(a);
        expect(c2).toBe(c1);
      }
    }
  });

  it("mult > 1 làm cơ hội rơi tăng đúng hệ số: rng nằm giữa chance và chance x mult thì CHỈ lúc có buff mới rơi", () => {
    const mult = 1.1;
    const v = entry.chance * 1.05;
    // Điều kiện của phép thử (luôn đúng với `entry` đã chọn: chance <= 0.9): nếu sai thì test hỏng ngay, không lặng lẽ bỏ qua
    expect(v).toBeGreaterThan(entry.chance);
    expect(v).toBeLessThan(entry.chance * mult);
    expect(entry.chance * mult).toBeLessThanOrEqual(1);
    expect(rollDrops(kind, constRng(v), 1).some((d) => d.itemId === entry.itemId)).toBe(false);
    expect(rollDrops(kind, constRng(v), mult).some((d) => d.itemId === entry.itemId)).toBe(true);
  });

  it("kẹp tối đa 1 (món chắc rơi vẫn chỉ rơi một lần) và mult xấu / dưới 1 coi là 1; mult lớn bị kẹp 2", () => {
    const base = rollDrops(kind, constRng(0.5), 1);
    for (const bad of [NaN, Infinity, -1, 0, 0.5, "2" as unknown as number]) {
      expect(rollDrops(kind, constRng(0.5), bad)).toEqual(base);
    }
    // mult 100 bị kẹp 2 (F3): chọn món có cơ hội LỚN NHẤT <= 0.45 để phân biệt kẹp 2 với không kẹp / kẹp lớn hơn:
    // chance x 2 < 0.999 (không rơi nếu kẹp đúng) nhưng chance x 5 >= 0.999 (rơi nếu kẹp sai thành 5 hoặc không kẹp)
    let best: { kind: string; itemId: string; chance: number } | undefined;
    for (const [k, table] of Object.entries(DROP_TABLES)) {
      for (const e of table) {
        if (e.chance <= 0.45 && (!best || e.chance > best.chance)) {
          best = { kind: k, itemId: e.itemId, chance: e.chance };
        }
      }
    }
    expect(best).toBeDefined();
    expect(best!.chance * 2).toBeLessThan(0.999);
    expect(best!.chance * 5).toBeGreaterThan(0.999); // điều kiện của phép thử: nếu đổi bảng rơi làm sai, test hỏng ngay (không lặng lẽ bỏ qua)
    expect(rollDrops(best!.kind, constRng(0.999), 100).some((d) => d.itemId === best!.itemId)).toBe(
      false,
    );
    expect(rollDrops(best!.kind, constRng(0.999), 2).some((d) => d.itemId === best!.itemId)).toBe(
      false,
    );
    // khi rng = 0 mọi món đều rơi, kể cả khi có buff, và số lượng nằm trong [min, max]
    for (const d of rollDrops(kind, constRng(0), 1.1)) expect(d.qty).toBeGreaterThanOrEqual(1);
  });
});
