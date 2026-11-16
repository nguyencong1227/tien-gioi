// Tab "Nội vụ" (M8.6, #843): làm sạch ảnh chụp `sectHall` và các hàm dựng dòng. Dùng `sampleSectHall` của `shared/` (khớp kiểu thật) làm dữ liệu mẫu.
import { describe, expect, it } from "vitest";
import {
  SECT_BUFF_DROP_MAX,
  SECT_BUFF_EXP_MAX,
  SECT_BUFF_REGEN_MAX,
  SECT_EARN_DAY_CAP,
  SECT_LEVEL_MAX,
  SECT_QUESTS,
  SECT_SHOP,
  sampleSectHall,
  sectFailMessage,
  sectQuestFor,
  type SectHallView,
} from "@tien-gioi/shared";
import {
  formatHallDuration,
  hallBuffLines,
  hallEarnNote,
  hallLeaveWarning,
  hallProgress,
  hallQuestRows,
  hallResetInMs,
  hallShopRows,
  sanitizeHallView,
  shopLockText,
} from "./sect-hall";

const NOW = 1_780_000_000_000;
const sample = (level = 2): SectHallView => sampleSectHall(level, NOW);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe("sanitizeHallView: không tin tin nhắn của máy chủ", () => {
  it("ảnh chụp mẫu của mọi cấp đi qua JSON rồi làm sạch KHÔNG đổi gì", () => {
    for (let lv = 1; lv <= SECT_LEVEL_MAX; lv++) {
      const v = sample(lv);
      expect(sanitizeHallView(clone(v)), `cấp ${lv}`).toEqual(v);
    }
  });

  it("không phải object / thiếu `me` -> null", () => {
    for (const bad of [null, undefined, 0, "x", [], [1], {}, { me: null }, { me: [] }])
      expect(sanitizeHallView(bad)).toBeNull();
  });

  it("số xấu về 0 / kẹp: âm, NaN, không phải số, quá lớn; cấp kẹp 1..SECT_LEVEL_MAX", () => {
    const v = clone(sample(2)) as unknown as Record<string, unknown>;
    v.level = 99;
    v.points = -5;
    v.pointsFrom = "abc";
    v.pointsNext = NaN;
    v.resetAt = -1;
    (v.me as Record<string, unknown>).contrib = -3;
    (v.me as Record<string, unknown>).earnedToday = 1e9;
    (v.me as Record<string, unknown>).earnCap = 0;
    const c = sanitizeHallView(v)!;
    expect(c.level).toBe(SECT_LEVEL_MAX);
    expect(c.points).toBe(0);
    expect(c.pointsFrom).toBe(0);
    expect(c.pointsNext).toBeNull();
    expect(c.resetAt).toBe(0);
    expect(c.me.contrib).toBe(0);
    expect(c.me.earnedToday).toBe(SECT_EARN_DAY_CAP); // kẹp theo trần ngày
    expect(c.me.earnCap).toBe(SECT_EARN_DAY_CAP); // 0 / hỏng -> trần mặc định
  });

  it("buff bị kẹp theo trần cứng; dưới 1 / xấu thành 1", () => {
    const v = clone(sample(5)) as unknown as { buff: Record<string, unknown> };
    v.buff = { exp: 9, drop: 0.5, regen: "x" };
    const c = sanitizeHallView(v)!;
    expect(c.buff).toEqual({ exp: SECT_BUFF_EXP_MAX, drop: 1, regen: 1 });
    // trần từng loại lấy từ `shared/` (không chép số): mỗi loại kẹp đúng theo hằng của nó
    v.buff = { exp: 99, drop: 99, regen: 99 };
    expect(sanitizeHallView(v)!.buff).toEqual({
      exp: SECT_BUFF_EXP_MAX,
      drop: SECT_BUFF_DROP_MAX,
      regen: SECT_BUFF_REGEN_MAX,
    });
  });

  it("nhiệm vụ LẠ bị bỏ (kể cả constructor / __proto__); trạng thái lạ và mục không phải object thì bỏ mục", () => {
    const base = sample(3);
    const q0 = clone(base.quests[0]!) as unknown as Record<string, unknown>;
    for (const junk of [
      { ...q0, questId: "constructor" },
      { ...q0, questId: "__proto__" },
      { ...q0, questId: "st_khong_co.t0" },
      { ...q0, questId: 5 },
      { ...q0, state: "hacked" },
      null,
      7,
    ]) {
      // MỘT mục rác đứng ĐẦU (trong giới hạn 6 mục), rồi các mục thật: chỉ các mục thật được giữ
      const v = clone(base) as unknown as { quests: unknown[] };
      v.quests = [junk, ...v.quests];
      expect(sanitizeHallView(v)!.quests, JSON.stringify(junk)).toEqual(base.quests);
    }
  });

  it("món LẠ bị bỏ (kể cả constructor), lý do khoá lạ thì bỏ mục", () => {
    const base = sample(3);
    const s0 = clone(base.shop[0]!) as unknown as Record<string, unknown>;
    for (const junk of [
      { ...s0, itemId: "constructor" },
      { ...s0, itemId: "khong_co_mon_nay" },
      { ...s0, itemId: 5 },
      { ...s0, locked: "bi_an" },
      null,
    ]) {
      const v = clone(base) as unknown as { shop: unknown[] };
      v.shop = [junk, ...v.shop];
      expect(sanitizeHallView(v)!.shop, JSON.stringify(junk)).toEqual(base.shop);
    }
  });

  it("chỉ giữ tối đa 6 nhiệm vụ (máy chủ gửi 3: thừa là rác)", () => {
    const base = sample(3);
    const v = clone(base) as unknown as { quests: unknown[] };
    v.quests = [...v.quests, ...v.quests, ...v.quests, ...v.quests];
    expect(sanitizeHallView(v)!.quests.length).toBeLessThanOrEqual(6);
  });

  it("chuỗi bị cắt độ dài và bỏ ký tự điều khiển", () => {
    const v = clone(sample(1)) as unknown as { quests: Record<string, unknown>[] };
    v.quests[0]!.title = `Trừ\u0000 sói\n${"x".repeat(300)}`;
    v.quests[0]!.desc = 42;
    const c = sanitizeHallView(v)!;
    expect(c.quests[0]!.title.length).toBeLessThanOrEqual(60);
    expect(c.quests[0]!.title.startsWith("Trừ  sói")).toBe(true);
    expect(c.quests[0]!.desc).toBe("");
  });

  it("tiêu đề rỗng thì lấy tên nhiệm vụ trong bảng", () => {
    const v = clone(sample(1)) as unknown as { quests: Record<string, unknown>[] };
    v.quests[0]!.title = "   ";
    const c = sanitizeHallView(v)!;
    expect(c.quests[0]!.title.length).toBeGreaterThan(0);
  });
});

describe("thời gian: hallResetInMs / formatHallDuration", () => {
  it("tính theo đồng hồ MÁY CHỦ (now) cộng thời gian đã trôi, không âm", () => {
    const v = sample(1);
    expect(hallResetInMs(v, 0)).toBe(v.resetAt - v.now);
    expect(hallResetInMs(v, 60_000)).toBe(v.resetAt - v.now - 60_000);
    expect(hallResetInMs(v, 10 * 86_400_000)).toBe(0);
    expect(hallResetInMs(v, -5)).toBe(v.resetAt - v.now); // đồng hồ lùi coi như 0
    expect(hallResetInMs(v, NaN)).toBe(v.resetAt - v.now);
  });

  it("định dạng: làm tròn LÊN phút, không bao giờ '0 phút'", () => {
    expect(formatHallDuration(0)).toBe("dưới 1 phút");
    expect(formatHallDuration(-1)).toBe("dưới 1 phút");
    expect(formatHallDuration(NaN)).toBe("dưới 1 phút");
    expect(formatHallDuration(1)).toBe("1 phút");
    expect(formatHallDuration(59_000)).toBe("1 phút");
    expect(formatHallDuration(60_001)).toBe("2 phút");
    expect(formatHallDuration(3_600_000)).toBe("1 giờ");
    expect(formatHallDuration(3_660_000)).toBe("1 giờ 1 phút");
    expect(formatHallDuration((5 * 60 + 12) * 60_000)).toBe("5 giờ 12 phút");
  });
});

describe("cấp, điểm, buff", () => {
  it("thanh điểm tính trên đoạn của cấp hiện tại; cấp cao nhất đầy", () => {
    const v = sample(2);
    const p = hallProgress(v);
    expect(p.levelLabel).toMatch(/^Cấp tông 2: /);
    expect(p.ratio).toBeGreaterThanOrEqual(0);
    expect(p.ratio).toBeLessThan(1);
    expect(p.now).toBe(v.points - v.pointsFrom);
    expect(p.max).toBe(v.pointsNext! - v.pointsFrom);
    expect(p.text).toContain("/");
    const top = hallProgress(sample(SECT_LEVEL_MAX));
    expect(top.ratio).toBe(1);
    expect(top.text).toContain("cấp cao nhất");
  });

  it("điểm ngoài đoạn không làm tỉ lệ vượt 0..1", () => {
    const v = clone(sample(2));
    v.points = v.pointsNext! + 500;
    expect(hallProgress(v).ratio).toBe(1);
    v.points = 0;
    expect(hallProgress(v).ratio).toBe(0);
  });

  it("buff: cấp 1 không có dòng nào; cấp 3 tu vi + rơi đồ; cấp 5 đủ ba", () => {
    expect(hallBuffLines(sample(1).buff)).toEqual([]);
    expect(hallBuffLines(sample(3).buff)).toEqual(["+3% tu vi", "+3% cơ hội rơi đồ"]);
    expect(hallBuffLines(sample(5).buff)).toEqual([
      "+5% tu vi",
      "+5% cơ hội rơi đồ",
      "+15% hồi khí huyết / linh lực",
    ]);
  });
});

describe("cống hiến của mình: hallEarnNote / hallLeaveWarning", () => {
  it("mới vào tông (earnFromAt ở tương lai): chờ sang ngày, nêu thời gian còn lại", () => {
    const v = clone(sample(1));
    v.me.earnFromAt = v.now + 3_600_000 * 2 + 1;
    const n = hallEarnNote(v, v.now);
    expect(n.waiting).toBe(true);
    expect(n.note).toContain("sang ngày mới");
    expect(n.note).toContain("2 giờ 1 phút");
    // thời gian trôi qua thì bớt; tới mốc thì hết chờ
    expect(hallEarnNote(v, v.now + 3_600_000).note).toContain("1 giờ 1 phút");
    expect(hallEarnNote(v, v.me.earnFromAt).waiting).toBe(false);
  });

  it("đã đủ trần ngày: báo đủ (chuỗi chung earn_cap); chưa đủ: không ghi chú", () => {
    const v = clone(sample(1));
    v.me.earnedToday = v.me.earnCap;
    expect(hallEarnNote(v, v.now)).toMatchObject({
      note: sectFailMessage("earn_cap"),
      waiting: false,
    });
    v.me.earnedToday = 50;
    const n = hallEarnNote(v, v.now);
    expect(n.note).toBeNull();
    expect(n.today).toBe(`Hôm nay: 50 / ${v.me.earnCap} cống hiến`);
  });

  it("cảnh báo rời tông nêu đúng số cống hiến và công tích sẽ MẤT; chưa có ảnh chụp thì câu chung", () => {
    const v = clone(sample(2));
    v.me.contrib = 1234;
    v.me.merit = 56789;
    const w = hallLeaveWarning(v);
    expect(w).toContain("MẤT");
    expect(w).toContain("1.234 cống hiến");
    expect(w).toContain("56.789 công tích");
    expect(hallLeaveWarning(null)).toContain("sẽ mất");
    expect(hallLeaveWarning(null)).not.toMatch(/\d/);
  });
});

describe("hallQuestRows", () => {
  const openRows = (v: SectHallView) => hallQuestRows(v, { serverNowMs: v.now, down: false });

  it("mẫu: một đã xong, một đang làm, một chưa nhận; nút đúng trạng thái", () => {
    const v = sample(2);
    const rows = openRows(v);
    expect(rows.map((r) => r.state)).toEqual(["done", "active", "offer"]);
    expect(rows[0]).toMatchObject({ canAccept: false, canTurnIn: false, why: "" });
    expect(rows[1]).toMatchObject({ canAccept: false, canTurnIn: true, stateLabel: "Đang làm" });
    expect(rows[2]).toMatchObject({ canAccept: true, canTurnIn: false, stateLabel: "Chưa nhận" });
    expect(rows[2]!.reward).toMatch(/^\+\d+ cống hiến$/);
    expect(rows[2]!.level).toMatch(/^Độ khó [123]$/);
  });

  it("chờ sang ngày: Nhận vẫn được, Trả MỜ kèm lý do not_warm", () => {
    const v = clone(sample(2));
    v.me.earnFromAt = v.now + 1000;
    const rows = openRows(v);
    expect(rows[2]!.canAccept).toBe(true);
    expect(rows[1]).toMatchObject({ canTurnIn: false, why: sectFailMessage("not_warm") });
  });

  it("đủ trần ngày: Trả mờ kèm lý do earn_cap", () => {
    const v = clone(sample(2));
    v.me.earnedToday = v.me.earnCap;
    expect(openRows(v)[1]).toMatchObject({ canTurnIn: false, why: sectFailMessage("earn_cap") });
  });

  it("đã gục: khoá cả Nhận lẫn Trả bằng chuỗi down chung (việc đã xong thì không cần lý do)", () => {
    const v = sample(2);
    const rows = hallQuestRows(v, { serverNowMs: v.now, down: true });
    expect(rows[0]!.why).toBe("");
    for (const r of rows.slice(1)) {
      expect(r.canAccept || r.canTurnIn).toBe(false);
      expect(r.why).toBe(sectFailMessage("down"));
    }
  });

  it("mọi mẫu nhiệm vụ có tên và id cụ thể có thật", () => {
    expect(SECT_QUESTS.length).toBeGreaterThan(0);
    for (const t of SECT_QUESTS) expect(sectQuestFor(t.id, 1)).toBeDefined();
  });
});

describe("hallShopRows và lý do khoá", () => {
  it("mẫu cấp 1: món cấp 3 khoá 'level' kèm tên cấp; món mua được có canBuy và không có lý do", () => {
    const v = sample(1);
    const rows = hallShopRows(v, { down: false });
    expect(rows).toHaveLength(SECT_SHOP.length);
    const locked = rows.find((r) => r.locked === "level")!;
    expect(locked.canBuy).toBe(false);
    expect(locked.why).toMatch(/^Mở ở cấp tông 3 \(/);
    const ok = rows.find((r) => r.locked === null)!;
    expect(ok).toMatchObject({ canBuy: true, why: "" });
    expect(ok.price).toMatch(/cống hiến$/);
    expect(ok.name.length).toBeGreaterThan(0);
    expect(ok.leftLabel).toMatch(/^Còn \d+ \/ \d+ lượt hôm nay$/);
    expect(ok.hallLabel).toBe("Bảo khố");
  });

  it("từng lý do có chữ riêng, rõ ràng", () => {
    const row = { minLevel: 3, cost: 30 };
    expect(shopLockText("level", row, 5)).toContain("Mở ở cấp tông 3");
    expect(shopLockText("known", row, 5)).toBe(sectFailMessage("shop_known"));
    expect(shopLockText("limit", row, 5)).toBe(sectFailMessage("shop_limit"));
    expect(shopLockText("no_contrib", row, 5)).toBe("Còn thiếu 25 cống hiến.");
    expect(shopLockText("no_contrib", row, 30)).toBe("Còn thiếu 1 cống hiến."); // không bao giờ '0'
    expect(shopLockText("down", row, 5)).toBe(sectFailMessage("down"));
  });

  it("đã gục: khoá cả cửa hàng, chuỗi down chung, không món nào mua được", () => {
    const rows = hallShopRows(sample(5), { down: true });
    expect(rows.every((r) => !r.canBuy && r.why === sectFailMessage("down"))).toBe(true);
  });

  it("Tàng Kinh Các có nhãn riêng", () => {
    const v = clone(sample(3));
    v.shop[0]!.hall = "tangKinh";
    expect(hallShopRows(v, { down: false })[0]!.hallLabel).toBe("Tàng Kinh Các");
  });
});
