import { describe, expect, it } from "vitest";
import {
  AMBUSH_CHOICES,
  AMBUSH_COIN_BASE,
  AMBUSH_COIN_GROWTH,
  AMBUSH_FLEE_MIN_COIN,
  AMBUSH_MIN_PROTOCOL,
  AMBUSH_MSG,
  AMBUSH_SEEN_MS,
  AMBUSH_ARM_MS,
  AMBUSH_IDLE_MS,
  parseAmbushSeen,
  AMBUSH_OFFER_MS,
  AMBUSH_RESULTS,
  AMBUSH_ROLL_P_MAX,
  AMBUSH_ROLL_P_MIN,
  AMBUSH_TIERS,
  AMBUSH_TIER_WEIGHTS,
  ambushCoinPrice,
  ambushExpPrice,
  ambushPrice,
  ambushRollP,
  isAmbushTier,
  parseAmbushChoose,
  parseAmbushFlee,
  sampleAmbushEnd,
  sampleAmbushOffer,
  sampleAmbushState,
  AMBUSH_OFFER_ID_RE,
  AMBUSH_DAY_CAP,
  AMBUSH_COOLDOWN_MS,
  AMBUSH_LOGIN_COOLDOWN_MS,
  AMBUSH_TIME_MS,
  AMBUSH_EXIT_MS,
  AMBUSH_DROP_GRACE_S,
  AMBUSH_STRIDE_PX,
  MAX_AMBUSH_ROOMS,
  AMBUSH_FOE_COUNT_MAX,
  AMBUSH_MIN_HP_PCT,
  AMBUSH_EXP_PRICE_PCT,
  AMBUSH_COIN_MULT,
} from "./ambush";
import { ITEM_BY_ID } from "./items";
import { PROTOCOL_VERSION } from "./protocol";
import { NET_RECONNECT_GRACE_S } from "./net-guard";

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

describe("hằng số chặn đường", () => {
  it("giao thức: chặn đường chỉ cho client đủ mới, và không vượt phiên bản hiện tại", () => {
    expect(AMBUSH_MIN_PROTOCOL).toBe(5);
    expect(AMBUSH_MIN_PROTOCOL).toBeLessThanOrEqual(PROTOCOL_VERSION);
  });

  it("các hằng số trong khoảng hợp lý (chống sửa nhầm đơn vị)", () => {
    expect(AMBUSH_OFFER_MS).toBe(10_000);
    expect(AMBUSH_TIME_MS).toBeGreaterThanOrEqual(60_000);
    expect(AMBUSH_EXIT_MS).toBeLessThan(AMBUSH_TIME_MS);
    // rớt mạng: ĐÚNG bảo vệ mất kết nối chung (mục 33), không ngắn hơn (yêu cầu gốc của người dùng "tôn trọng bảo vệ mất kết nối")
    expect(AMBUSH_DROP_GRACE_S).toBe(NET_RECONNECT_GRACE_S);
    expect(AMBUSH_DROP_GRACE_S).toBeGreaterThanOrEqual(60);
    // xác nhận đã thấy: đủ ngắn để không kéo người vắng mặt vào trận, dài hơn độ trễ mạng; chống bấm sớm ngắn hơn thời gian ra hộp thoại
    expect(AMBUSH_SEEN_MS).toBeGreaterThanOrEqual(2_000);
    expect(AMBUSH_SEEN_MS).toBeLessThan(AMBUSH_OFFER_MS);
    expect(AMBUSH_ARM_MS).toBeGreaterThanOrEqual(300);
    expect(AMBUSH_ARM_MS).toBeLessThan(AMBUSH_SEEN_MS);
    expect(AMBUSH_IDLE_MS).toBeGreaterThanOrEqual(10_000);
    expect(AMBUSH_IDLE_MS).toBeLessThan(AMBUSH_TIME_MS);
    expect(AMBUSH_STRIDE_PX).toBeGreaterThanOrEqual(600);
    // hồi tối thiểu 5-10 phút chơi (mục 52); vừa vào game chưa bị chặn nhưng ngắn hơn hồi thường
    expect(AMBUSH_COOLDOWN_MS).toBeGreaterThanOrEqual(5 * 60_000);
    expect(AMBUSH_COOLDOWN_MS).toBeLessThanOrEqual(10 * 60_000);
    expect(AMBUSH_LOGIN_COOLDOWN_MS).toBeGreaterThan(0);
    expect(AMBUSH_LOGIN_COOLDOWN_MS).toBeLessThanOrEqual(AMBUSH_COOLDOWN_MS);
    expect(AMBUSH_DAY_CAP).toBeGreaterThan(0);
    expect(AMBUSH_MIN_HP_PCT).toBeGreaterThanOrEqual(30); // "ít máu dưới ~30%" không bị chặn
    expect(MAX_AMBUSH_ROOMS).toBeGreaterThan(0);
    expect(AMBUSH_FOE_COUNT_MAX).toBeGreaterThanOrEqual(1);
  });

  it("mức kẻ địch: trọng số cộng lại 100, mức thường nhiều nhất; isAmbushTier không tin kiểu", () => {
    const sum = AMBUSH_TIERS.reduce((a, t) => a + AMBUSH_TIER_WEIGHTS[t], 0);
    expect(sum).toBe(100);
    expect(AMBUSH_TIER_WEIGHTS.normal).toBeGreaterThan(AMBUSH_TIER_WEIGHTS.elite);
    expect(AMBUSH_TIER_WEIGHTS.elite).toBeGreaterThan(AMBUSH_TIER_WEIGHTS.leader);
    for (const t of AMBUSH_TIERS) expect(isAmbushTier(t)).toBe(true);
    for (const bad of [
      "constructor",
      "__proto__",
      "toString",
      "",
      "Normal",
      0,
      null,
      undefined,
      {},
    ])
      expect(isAmbushTier(bad), String(bad)).toBe(false);
  });

  it("tên tin nhắn: duy nhất, đúng chuỗi (client và server cùng dùng)", () => {
    expect(AMBUSH_MSG).toEqual({
      offer: "ambushOffer",
      choose: "ambushChoose",
      state: "ambushState",
      seen: "ambushSeen",
      flee: "ambushFlee",
      end: "ambushEnd",
    });
    expect(new Set(Object.values(AMBUSH_MSG)).size).toBe(6);
  });
});

describe("ambushRollP", () => {
  it("nội suy MIN..MAX theo độ nguy hiểm, kẹp ngoài [0, 1]", () => {
    expect(ambushRollP(0)).toBe(AMBUSH_ROLL_P_MIN);
    expect(ambushRollP(1)).toBe(AMBUSH_ROLL_P_MAX);
    expect(ambushRollP(0.5)).toBeCloseTo((AMBUSH_ROLL_P_MIN + AMBUSH_ROLL_P_MAX) / 2, 10);
    expect(ambushRollP(-3)).toBe(AMBUSH_ROLL_P_MIN);
    expect(ambushRollP(9)).toBe(AMBUSH_ROLL_P_MAX);
  });
  it("tăng dần theo độ nguy hiểm; xác suất nhỏ (< 10%); đầu vào rác -> MIN", () => {
    expect(ambushRollP(0.8)).toBeGreaterThan(ambushRollP(0.2));
    expect(AMBUSH_ROLL_P_MAX).toBeLessThan(0.1);
    expect(AMBUSH_ROLL_P_MIN).toBeGreaterThan(0);
    for (const bad of [NaN, Infinity, -Infinity, "0.9", null, undefined, {}])
      expect(ambushRollP(bad), String(bad)).toBe(AMBUSH_ROLL_P_MIN);
  });
});

describe("giá bỏ chạy", () => {
  it("tu vi: % của thanh theo thời điểm (offer 5%, mid 10%), làm tròn xuống", () => {
    expect(AMBUSH_EXP_PRICE_PCT.offer).toBe(5);
    expect(AMBUSH_EXP_PRICE_PCT.mid).toBe(10);
    expect(ambushExpPrice(10_000, 10_000, "offer")).toBe(500);
    expect(ambushExpPrice(10_000, 10_000, "mid")).toBe(1000);
    expect(ambushExpPrice(1999, 1999, "offer")).toBe(99); // 99,95 -> 99
  });
  it("tu vi: KHÔNG quá tu vi đang có trong thanh (không rớt cảnh giới), không âm", () => {
    expect(ambushExpPrice(10_000, 120, "offer")).toBe(120);
    expect(ambushExpPrice(10_000, 0, "mid")).toBe(0);
    expect(ambushExpPrice(10_000, -50, "mid")).toBe(0);
    expect(ambushExpPrice(0, 500, "mid")).toBe(0);
  });
  it("tu vi: đầu vào rác coi là 0 (không NaN / vô hạn)", () => {
    for (const bad of [NaN, Infinity, -Infinity, "9999", null, undefined, {}]) {
      expect(ambushExpPrice(bad, 1000, "mid"), String(bad)).toBe(0);
      expect(ambushExpPrice(1000, bad, "mid"), String(bad)).toBe(0);
    }
  });
  it("Linh thạch: tăng theo bậc, giữa trận = hệ số x giá hộp thoại, có sàn tối thiểu", () => {
    expect(ambushCoinPrice(0, "offer")).toBe(Math.max(AMBUSH_FLEE_MIN_COIN, AMBUSH_COIN_BASE));
    let prev = 0;
    for (let s = 0; s < 12; s++) {
      const p = ambushCoinPrice(s, "offer");
      expect(p).toBeGreaterThan(prev);
      prev = p;
      // giữa trận cao hơn (không thấp hơn) giá hộp thoại: bỏ chạy sớm luôn rẻ hơn bỏ chạy muộn
      expect(ambushCoinPrice(s, "mid")).toBeGreaterThan(p);
    }
    expect(ambushCoinPrice(5, "offer")).toBe(
      Math.round(AMBUSH_COIN_BASE * Math.pow(AMBUSH_COIN_GROWTH, 5)),
    );
    expect(ambushCoinPrice(5, "mid")).toBe(
      Math.round(AMBUSH_COIN_BASE * Math.pow(AMBUSH_COIN_GROWTH, 5) * AMBUSH_COIN_MULT.mid),
    );
    expect(AMBUSH_COIN_MULT.mid).toBeGreaterThan(AMBUSH_COIN_MULT.offer);
    expect(AMBUSH_EXP_PRICE_PCT.mid).toBeGreaterThan(AMBUSH_EXP_PRICE_PCT.offer);
  });
  it("Linh thạch: bậc rác coi là 0 (sàn), không NaN", () => {
    for (const bad of [NaN, -5, Infinity, "3", null, undefined])
      expect(ambushCoinPrice(bad, "offer"), String(bad)).toBe(
        Math.max(AMBUSH_FLEE_MIN_COIN, AMBUSH_COIN_BASE),
      );
  });
  it("ambushPrice: ví đủ -> có giá Linh thạch; ví thiếu 1 -> coin null (chỉ còn tu vi); giá tu vi độc lập với ví", () => {
    const need = ambushCoinPrice(3, "offer");
    const base = { barSize: 20_000, expInBar: 5000, step: 3 };
    expect(ambushPrice({ ...base, wallet: need }, "offer")).toEqual({
      exp: 1000,
      coin: { price: need, enough: true },
    });
    // ví thiếu 1: vẫn HIỆN giá (nút mờ cho biết cần bao nhiêu), chỉ cờ `enough` tắt
    expect(ambushPrice({ ...base, wallet: need - 1 }, "offer")).toEqual({
      exp: 1000,
      coin: { price: need, enough: false },
    });
    expect(ambushPrice({ ...base, wallet: 0 }, "mid").coin).toEqual({
      price: ambushCoinPrice(3, "mid"),
      enough: false,
    });
    expect(ambushPrice({ ...base, wallet: Number.NaN }, "mid").coin.enough).toBe(false);
    // tu vi sát đáy: giá tu vi 0 NHƯNG giá Linh thạch vẫn có sàn (không bỏ chạy miễn phí mãi)
    const floor = ambushPrice({ barSize: 20_000, expInBar: 0, step: 3, wallet: 1e9 }, "offer");
    expect(floor.exp).toBe(0);
    expect(floor.coin.price).toBeGreaterThanOrEqual(AMBUSH_FLEE_MIN_COIN);
  });
});

describe("đọc tin từ mạng", () => {
  const id = "0123456789abcdef";
  it("ambushChoose: đúng id + lựa chọn; chỉ mang hai trường", () => {
    for (const choice of AMBUSH_CHOICES)
      expect(parseAmbushChoose({ id, choice })).toEqual({ id, choice });
    expect(parseAmbushChoose({ id, choice: "fight", extra: 1, price: 0 })).toEqual({
      id,
      choice: "fight",
    });
  });
  it("ambushChoose: id sai dạng / lựa chọn lạ / kiểu sai -> null", () => {
    const bad: unknown[] = [
      null,
      undefined,
      "fight",
      42,
      [],
      {},
      { id },
      { choice: "fight" },
      { id: id.toUpperCase(), choice: "fight" },
      { id: id + "0", choice: "fight" },
      { id: id.slice(1), choice: "fight" },
      { id: 123, choice: "fight" },
      { id, choice: "run" },
      { id, choice: "constructor" },
      { id, choice: "__proto__" },
      { id, choice: 1 },
      { id, choice: ["fight"] },
    ];
    for (const b of bad) expect(parseAmbushChoose(b), JSON.stringify(b)).toBeNull();
    expect(AMBUSH_OFFER_ID_RE.test(id)).toBe(true);
  });
  it("ambushSeen: chỉ `id` đúng dạng; rác -> null", () => {
    expect(parseAmbushSeen({ id, x: 1 })).toEqual({ id });
    for (const b of [null, [], {}, "id", { id: 1 }, { id: id.toUpperCase() }, { id: id + "0" }])
      expect(parseAmbushSeen(b), JSON.stringify(b)).toBeNull();
  });
  it("ambushFlee: chỉ flee_coin / flee_exp (KHÔNG nhận fight); rác -> null", () => {
    expect(parseAmbushFlee({ choice: "flee_coin" })).toEqual({ choice: "flee_coin" });
    expect(parseAmbushFlee({ choice: "flee_exp", x: 1 })).toEqual({ choice: "flee_exp" });
    for (const b of [
      null,
      [],
      {},
      { choice: "fight" },
      { choice: "flee" },
      { choice: 1 },
      "flee_coin",
    ])
      expect(parseAmbushFlee(b), JSON.stringify(b)).toBeNull();
  });
});

describe("dữ liệu mẫu cho giao diện", () => {
  it("lời đề nghị mẫu hợp lệ cho cả ba mức, ví đủ / không đủ", () => {
    for (const tier of AMBUSH_TIERS) {
      const m = sampleAmbushOffer(tier);
      expect(AMBUSH_OFFER_ID_RE.test(m.id)).toBe(true);
      expect(m.foe.tier).toBe(tier);
      expect(m.foe.count).toBeGreaterThanOrEqual(1);
      expect(m.scene.length).toBeGreaterThan(20);
      expect(`${m.scene}${m.foe.name}`).not.toMatch(CJK);
      expect(m.scene).not.toMatch(/[{}]/);
      expect(m.ms).toBe(AMBUSH_OFFER_MS);
      expect(m.price.coin.enough).toBe(true);
      expect(m.price.coin.price).toBeGreaterThan(0);
    }
    const poor = sampleAmbushOffer("normal", false).price.coin;
    expect(poor.enough).toBe(false);
    expect(poor.price).toBeGreaterThan(0); // vẫn hiện giá
    expect(sampleAmbushOffer("elite")).toEqual(sampleAmbushOffer("elite")); // tất định
  });
  it("trạng thái và kết cục mẫu: đủ mọi kết cục, thưởng chỉ khi thắng, vật phẩm có thật", () => {
    const s = sampleAmbushState();
    expect(Object.keys(s).sort()).toEqual(["msLeft", "price"]); // máu kẻ địch KHÔNG nằm ở đây (đã có trong state.monsters)
    expect(s.msLeft).toBeGreaterThan(0);
    for (const r of AMBUSH_RESULTS) {
      const e = sampleAmbushEnd(r);
      expect(e.result).toBe(r);
      expect(e.rewards !== undefined).toBe(r === "won");
      // huỷ lặng lẽ không mất gì; mọi kết cục khác ngoài thắng đều có cái giá đã trừ
      expect(e.paid !== undefined).toBe(r !== "won" && r !== "canceled");
      for (const it of e.rewards?.items ?? [])
        expect(ITEM_BY_ID[it.itemId], it.itemId).toBeDefined();
    }
  });
});
