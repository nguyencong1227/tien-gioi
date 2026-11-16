// HỢP ĐỒNG máy chủ <-> client của tab "Nội vụ" (M8.6, issue #843): ảnh chụp THẬT của máy chủ (`sectHallViewOf`: nhiệm vụ M8.4, cửa hàng M8.5, cống hiến M8.3) đi qua JSON rồi qua lớp
// làm sạch + dựng hàng của client (`client/src/sect-hall.ts`) phải ra đúng những gì máy chủ định nói: không rơi trường nào, trạng thái nhiệm vụ / lý do khoá món khớp, nút Nhận / Trả / Đổi chỉ
// bấm được khi máy chủ sẽ chấp nhận. Dùng fixture cố định (`sect-fixtures.ts`) nên không hỏng khi E / D thay bảng thật (M8.7).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SECT_EARN_DAY_CAP,
  SECT_LEVELS,
  SECT_SHOP,
  dayKey,
  sectQuestFor,
  sectQuestSlots,
  type SectHallView,
} from "@tien-gioi/shared";
import { sanitizeHallView, hallQuestRows, hallShopRows } from "../../../client/src/sect-hall";
import { sectHallViewOf, type SectHallCtx } from "../sect-service";
import { makeSect } from "../store-contract";
import { installSectQuestFixture, installSectShopFixture } from "./sect-fixtures";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const ME = "alpha";

let undo: Array<() => void> = [];
beforeAll(() => {
  undo = [installSectQuestFixture(), installSectShopFixture()];
});
afterAll(() => undo.forEach((f) => f()));

type Today = {
  day: string;
  earned: number;
  deposit: number;
  quests: string[];
  dungeon: boolean;
  buys: Record<string, number>;
};

/** Tông môn "t1": mình (A) + một đồng môn, `points` cho cấp mong muốn, sổ ngày / ví cống hiến của mình theo tham số. */
function sectOf(
  opts: { level?: number; contrib?: number; today?: Partial<Today>; joinedAgo?: number } = {},
) {
  const joined = NOW - (opts.joinedAgo ?? 3 * DAY);
  const today: Today = {
    day: dayKey(NOW),
    earned: 0,
    deposit: 0,
    quests: [],
    dungeon: false,
    buys: {},
    ...opts.today,
  };
  return makeSect("t1", {
    name: "Thanh Van",
    tag: "TV",
    leader: ME,
    points: SECT_LEVELS[(opts.level ?? 1) - 1]!.points,
    members: [
      {
        soulKey: ME,
        name: "Alpha",
        rank: "chu",
        joinedAt: joined,
        contrib: opts.contrib ?? 0,
        merit: opts.contrib ?? 0,
        today,
      },
      { soulKey: "bravo", name: "Bravo", rank: "de_tu", joinedAt: joined },
    ],
  });
}

/** Ảnh chụp của máy chủ như client nhận: qua JSON (đúng đường mạng). */
function overWire(sect: ReturnType<typeof sectOf>, ctx: SectHallCtx, now = NOW): SectHallView {
  const v = sectHallViewOf(sect, ME, now, true, ctx);
  expect(v).not.toBeNull();
  return JSON.parse(JSON.stringify(v));
}
const ctxOf = (o: Partial<SectHallCtx> = {}): SectHallCtx => ({
  realm: 1,
  active: [],
  learned: [],
  ...o,
});

describe("ảnh chụp thật của máy chủ -> client không rơi trường nào", () => {
  it("nhiệm vụ + cửa hàng + cống hiến: `sanitizeHallView` giữ nguyên từng trường", () => {
    const sect = sectOf({
      level: 3,
      contrib: 120,
      today: { earned: 20, buys: { hoi_huyet_dan: 4 } },
    });
    const wire = overWire(sect, ctxOf());
    expect(wire.quests.length).toBeGreaterThan(0);
    expect(wire.shop.length).toBe(SECT_SHOP.length);
    expect(sanitizeHallView(wire)).toEqual(wire);
  });

  it("mọi cấp tông (1..tối đa): ảnh chụp qua client không đổi", () => {
    for (const l of SECT_LEVELS) {
      const wire = overWire(sectOf({ level: l.level, contrib: 50 }), ctxOf());
      expect(sanitizeHallView(wire), `cấp ${l.level}`).toEqual(wire);
    }
  });
});

describe("nhiệm vụ: trạng thái của máy chủ = hàng của client", () => {
  const tpls = () => sectQuestSlots("t1", dayKey(NOW));

  it("chưa nhận / đang làm / đã trả: nhãn + nút đúng", () => {
    const [t0, t1, t2] = tpls();
    const activeId = sectQuestFor(t1!, 1)!;
    const sect = sectOf({ today: { quests: [t2!] } });
    const wire = overWire(sect, ctxOf({ active: [activeId] }));
    const rows = hallQuestRows(sanitizeHallView(wire)!, { serverNowMs: NOW, down: false });
    const byId = new Map(rows.map((r) => [r.questId, r]));
    const offer = byId.get(sectQuestFor(t0!, 1)!)!;
    const active = byId.get(activeId)!;
    const done = byId.get(sectQuestFor(t2!, 1)!)!;
    expect(offer).toMatchObject({
      state: "offer",
      canAccept: true,
      canTurnIn: false,
      stateLabel: "Chưa nhận",
    });
    expect(active).toMatchObject({
      state: "active",
      canAccept: false,
      canTurnIn: true,
      stateLabel: "Đang làm",
    });
    expect(done).toMatchObject({
      state: "done",
      canAccept: false,
      canTurnIn: false,
      stateLabel: "Đã xong hôm nay",
    });
  });

  it("đang làm bản bậc thấp rồi đột phá: máy chủ vẫn báo 'active' cho bản MỚI; client trả bằng id máy chủ gửi", () => {
    const t = tpls()[0]!;
    const oldId = sectQuestFor(t, 0)!; // bản Luyện Khí
    const wire = overWire(sectOf(), ctxOf({ realm: 4, active: [oldId] })); // đã lên bậc cao hơn
    const row = hallQuestRows(sanitizeHallView(wire)!, { serverNowMs: NOW, down: false }).find(
      (r) => r.state === "active",
    )!;
    expect(row).toBeDefined();
    expect(row.questId).toBe(sectQuestFor(t, 4)); // id theo bậc HIỆN TẠI: máy chủ chấp nhận trả bằng id này
    expect(row.canTurnIn).toBe(true);
  });

  it("mới vào tông (chờ sang ngày): đang làm nhưng Trả mờ kèm lý do `not_warm`; Nhận vẫn được", () => {
    const t = tpls();
    const sect = sectOf({ joinedAgo: 60_000 });
    const wire = overWire(sect, ctxOf({ active: [sectQuestFor(t[1]!, 1)!] }));
    expect(wire.me.earnFromAt).toBeGreaterThan(NOW);
    const rows = hallQuestRows(sanitizeHallView(wire)!, { serverNowMs: NOW, down: false });
    const active = rows.find((r) => r.state === "active")!;
    expect(active.canTurnIn).toBe(false);
    expect(active.why).not.toBe("");
    expect(rows.find((r) => r.state === "offer")!.canAccept).toBe(true);
  });

  it("hết trần cống hiến ngày: Trả mờ kèm lý do; ngày mới thì mở lại", () => {
    const t = tpls();
    const sect = sectOf({ today: { earned: SECT_EARN_DAY_CAP } });
    const wire = overWire(sect, ctxOf({ active: [sectQuestFor(t[1]!, 1)!] }));
    const row = hallQuestRows(sanitizeHallView(wire)!, { serverNowMs: NOW, down: false }).find(
      (r) => r.state === "active",
    )!;
    expect(row.canTurnIn).toBe(false);
    expect(row.why).not.toBe("");
    // sang ngày mới: sổ ngày của máy chủ tự đặt lại
    const next = overWire(sect, ctxOf({ active: [sectQuestFor(t[1]!, 1)!] }), NOW + DAY);
    expect(next.me.earnedToday).toBe(0);
  });

  it("đã gục: khoá cả Nhận lẫn Trả với lý do chung", () => {
    const wire = overWire(sectOf(), ctxOf({ active: [sectQuestFor(tpls()[1]!, 1)!] }));
    const rows = hallQuestRows(sanitizeHallView(wire)!, { serverNowMs: NOW, down: true });
    for (const r of rows.filter((x) => x.state !== "done")) {
      expect(r.canAccept).toBe(false);
      expect(r.canTurnIn).toBe(false);
      expect(r.why).not.toBe("");
    }
  });
});

describe("cửa hàng: khoá của máy chủ = nút của client", () => {
  const rowOf = (rows: ReturnType<typeof hallShopRows>, id: string) =>
    rows.find((r) => r.itemId === id)!;

  it("đủ điều kiện: mua được; thiếu cống hiến / chưa tới cấp / hết lượt: khoá đúng lý do, có chữ giải thích", () => {
    const rich = hallShopRows(
      sanitizeHallView(overWire(sectOf({ level: 3, contrib: 500 }), ctxOf()))!,
      { down: false },
    );
    for (const e of SECT_SHOP)
      expect(rowOf(rich, e.itemId), e.itemId).toMatchObject({
        locked: null,
        canBuy: true,
        why: "",
      });

    const poor = hallShopRows(
      sanitizeHallView(overWire(sectOf({ level: 3, contrib: 1 }), ctxOf()))!,
      { down: false },
    );
    expect(rowOf(poor, "hoi_huyet_dan")).toMatchObject({ locked: "no_contrib", canBuy: false });
    expect(rowOf(poor, "hoi_huyet_dan").why).toMatch(/thiếu/i);

    const low = hallShopRows(
      sanitizeHallView(overWire(sectOf({ level: 1, contrib: 500 }), ctxOf()))!,
      { down: false },
    );
    expect(rowOf(low, "tu_khi_dan")).toMatchObject({ locked: "level", canBuy: false });
    expect(rowOf(low, "tu_khi_dan").why).not.toBe("");

    const spent = hallShopRows(
      sanitizeHallView(
        overWire(sectOf({ level: 3, contrib: 500, today: { buys: { tu_khi_dan: 2 } } }), ctxOf()),
      )!,
      { down: false },
    );
    expect(rowOf(spent, "tu_khi_dan")).toMatchObject({ locked: "limit", canBuy: false });
    expect(rowOf(spent, "tu_khi_dan").leftLabel).toBe("Còn 0 / 2 lượt hôm nay");
  });

  it("số lượt còn lại và giá khớp từng món", () => {
    const view = sanitizeHallView(
      overWire(sectOf({ level: 3, contrib: 500, today: { buys: { hoi_huyet_dan: 4 } } }), ctxOf()),
    )!;
    const rows = hallShopRows(view, { down: false });
    const e = SECT_SHOP.find((x) => x.itemId === "hoi_huyet_dan")!;
    expect(rowOf(rows, "hoi_huyet_dan").leftLabel).toBe(
      `Còn ${e.limitDay - 4} / ${e.limitDay} lượt hôm nay`,
    );
    expect(rowOf(rows, "hoi_huyet_dan").price).toContain(String(e.cost));
  });

  it("đã gục: khoá cả cửa hàng với lý do chung", () => {
    const rows = hallShopRows(
      sanitizeHallView(overWire(sectOf({ level: 3, contrib: 500 }), ctxOf()))!,
      { down: true },
    );
    for (const r of rows) expect(r).toMatchObject({ locked: "down", canBuy: false });
  });
});
