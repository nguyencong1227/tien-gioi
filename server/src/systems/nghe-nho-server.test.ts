// Nghề nhỏ lát 1, phần máy chủ (#514, docs/THIET_KE_NGHE_NHO.md mục 6): dùng vật phẩm gắn trạng thái (`ItemEffect` kind `status`),
// đan hộ đạo `dao_ho` cộng xác suất đột phá và bị GỠ khi thử đột phá, chữ theo trạm ở `craft` / hội thoại.
// Chưa có vật phẩm / NPC thật dùng các thứ này (dữ liệu của D ở lát sau): test tạm gắn vào bản ghi sẵn có rồi trả lại.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BREAK_FAIL_EXP_LOSS,
  DEFAULT_MAP,
  ITEM_BY_ID,
  NPC_BY_ID,
  RECIPE_BY_ID,
  breakthroughChance,
  type CraftStation,
  type ItemDef,
  type ItemEffect,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { addPlayer, makeWorld } from "./test-helpers";
import { duelAnswer, duelChallenge } from "./duel";
import { giveItem, useItem } from "./inventory";
import { breakthrough } from "./progression";
import { craft, talk } from "./npc";

const TEST_PILL = "thu_dan_ho_dao";
/** Cho `ITEM_BY_ID` một đan thử với hiệu ứng `effect` (đã qua `unknown` để thử cả dữ liệu hỏng). */
function installPill(effect: unknown, extra: Partial<ItemDef> = {}) {
  ITEM_BY_ID[TEST_PILL] = {
    id: TEST_PILL,
    name: "Đan thử",
    type: "consumable",
    stack: 9,
    rarity: 3,
    desc: "đan thử",
    color: 0xffffff,
    effect: effect as ItemEffect,
    ...extra,
  };
}
const aid = (over: Record<string, unknown> = {}) => ({
  kind: "status",
  id: "dao_ho",
  ratio: 0.15,
  ms: 600_000,
  forRealm: 1,
  ...over,
});
afterEach(() => {
  delete ITEM_BY_ID[TEST_PILL];
  vi.restoreAllMocks();
});

/** Người chơi Luyện Khí (realm 1) ở tầng cuối với đầy tu vi, có `qty` đan thử ở ô 0. */
function setup(effect: unknown, qty = 2) {
  installPill(effect);
  const t = makeWorld();
  const { p, c } = addPlayer(t.w, "a", 1, 8);
  p.exp = p.expMax;
  giveItem(t.w, "a", TEST_PILL, qty);
  return { ...t, p, c };
}
const qtyOf = (t: ReturnType<typeof setup>) =>
  t.c.inv.find((s) => s?.itemId === TEST_PILL)?.qty ?? 0;
const aidOf = (t: ReturnType<typeof setup>) => t.c.st?.list.find((s) => s.id === "dao_ho");

describe("useItem: ItemEffect `status`", () => {
  it("đan hộ đạo đúng bậc + ở đỉnh: gắn dao_ho (ratio, hạn), trừ MỘT đan, gửi `status` cho chủ", () => {
    const t = setup(aid());
    useItem(t.w, "a", 0);
    const s = aidOf(t)!;
    expect(s.ratio).toBeCloseTo(0.15, 12);
    expect(s.until - t.w.now).toBe(600_000);
    expect(qtyOf(t)).toBe(1);
    const last = t.statusMsgs.at(-1)!;
    expect(last.sid).toBe("a");
    expect(last.msg.list[0]?.[0]).toBe("dao_ho");
    expect(last.msg.list[0]?.[2]).toBeCloseTo(0.15, 12);
  });

  it("kẹp theo STATUSES: ratio 5 -> 0,2; ms 10^9 -> 15 phút", () => {
    const t = setup(aid({ ratio: 5, ms: 1e9 }));
    useItem(t.w, "a", 0);
    expect(aidOf(t)!.ratio).toBe(0.2);
    expect(aidOf(t)!.until - t.w.now).toBe(900_000);
  });

  it("dùng hai viên: LÀM MỚI, không cộng dồn (ratio lớn nhất, một mục dao_ho), vẫn trừ đủ hai đan", () => {
    const t = setup(aid({ ratio: 0.1 }));
    useItem(t.w, "a", 0);
    ITEM_BY_ID[TEST_PILL].effect = aid({ ratio: 0.18 }) as ItemEffect;
    useItem(t.w, "a", 0);
    expect(t.c.st!.list.filter((s) => s.id === "dao_ho")).toHaveLength(1);
    expect(aidOf(t)!.ratio).toBeCloseTo(0.18, 12);
    expect(qtyOf(t)).toBe(0);
  });

  it("sai bậc (forRealm khác cảnh giới) hoặc chưa ở đỉnh / chưa đầy tu vi: TỪ CHỐI, KHÔNG trừ đan", () => {
    const wrongRealm = setup(aid({ forRealm: 2 }));
    useItem(wrongRealm.w, "a", 0);
    expect(aidOf(wrongRealm)).toBeUndefined();
    expect(qtyOf(wrongRealm)).toBe(2);
    expect(wrongRealm.toasts.at(-1)?.msg.text).toContain("chỉ dùng khi đã đạt đỉnh");

    const notFull = setup(aid());
    notFull.p.exp = notFull.p.expMax - 1;
    useItem(notFull.w, "a", 0);
    expect(aidOf(notFull)).toBeUndefined();
    expect(qtyOf(notFull)).toBe(2);

    const notLast = setup(aid());
    notLast.p.tier = 7;
    useItem(notLast.w, "a", 0);
    expect(aidOf(notLast)).toBeUndefined();
    expect(qtyOf(notLast)).toBe(2);
  });

  it("đang thách đấu: từ chối, không trừ đan", () => {
    installPill(aid());
    const t = makeWorld(DEFAULT_MAP, new Hub());
    const a = addPlayer(t.w, "Alpha", 1, 8);
    const b = addPlayer(t.w, "Bravo", 1, 8);
    b.p.x += 45;
    a.p.exp = a.p.expMax;
    giveItem(t.w, "Alpha", TEST_PILL, 2);
    duelChallenge(t.w, "Alpha", { name: "Bravo" });
    duelAnswer(t.w, "Bravo", { from: "Alpha" }, true);
    expect(t.w.duels.has("Alpha")).toBe(true);
    useItem(t.w, "Alpha", 0);
    expect(a.c.st?.list.find((x) => x.id === "dao_ho")).toBeUndefined();
    expect(a.c.inv.find((x) => x?.itemId === TEST_PILL)?.qty).toBe(2);
    expect(t.toasts.at(-1)?.msg.text).toContain("thách đấu");
  });

  it("trạng thái CÓ HẠI / id lạ / số hỏng trong dữ liệu vật phẩm: từ chối, không gắn, không trừ", () => {
    for (const bad of [
      aid({ id: "burn", forRealm: undefined }),
      aid({ id: "stun", forRealm: undefined }),
      aid({ id: "constructor", forRealm: undefined }),
      aid({ ratio: NaN }),
      aid({ ms: 0 }),
      aid({ ms: "900000" }),
    ]) {
      const t = setup(bad);
      useItem(t.w, "a", 0);
      expect(t.c.st?.list ?? [], JSON.stringify(bad)).toHaveLength(0);
      expect(qtyOf(t), JSON.stringify(bad)).toBe(2);
    }
  });

  it("kiểu hiệu ứng CHƯA BIẾT: mặc định không trừ vật phẩm (fail-closed)", () => {
    const t = setup({ kind: "bogus", pct: 1 });
    useItem(t.w, "a", 0);
    expect(qtyOf(t)).toBe(2);
  });

  it("hộp đầy 4 trạng thái sống lâu hơn đan: từ chối ('quá nhiều trạng thái'), KHÔNG trừ đan", () => {
    const t = setup(aid({ forRealm: undefined, ms: 1000 }));
    const longer = t.w.now + 600_000;
    t.c.st = {
      stunImmuneUntil: 0,
      list: (["shield", "haste", "regen", "burn"] as const).map((id) => ({
        id,
        until: longer,
        ratio: 0.1,
        dps: 0,
        pool: 0,
        last: 0,
        src: "",
      })),
    };
    useItem(t.w, "a", 0);
    expect(aidOf(t)).toBeUndefined();
    expect(t.c.st.list).toHaveLength(4);
    expect(qtyOf(t)).toBe(2);
    expect(t.toasts.at(-1)?.msg.text).toContain("quá nhiều trạng thái");
  });

  it("đan hồi cũ (healHp / healMp / exp) KHÔNG đổi hành vi", () => {
    const t = makeWorld();
    const { p, c } = addPlayer(t.w, "a", 1, 0);
    p.hp = 1;
    giveItem(t.w, "a", "hoi_huyet_dan", 2);
    useItem(t.w, "a", 0);
    expect(p.hp).toBeGreaterThan(1);
    expect(c.inv[0]?.qty).toBe(1);
  });
});

describe("breakthrough + đan hộ đạo", () => {
  /** Đặt Math.random cố định, thử đột phá một lần, trả đã thành công chưa. */
  function attempt(t: ReturnType<typeof setup>, rnd: number): boolean {
    vi.spyOn(Math, "random").mockReturnValue(rnd);
    const realm = t.p.realm;
    breakthrough(t.w, "a");
    return t.p.realm === realm + 1;
  }

  it("xác suất gốc: random 0,85 thất bại (gốc 77 %); có dao_ho +15 % (92 %) cùng random 0,85 thì THÀNH CÔNG", () => {
    expect(breakthroughChance(1)).toBeCloseTo(0.77, 12);
    const without = setup(aid());
    expect(attempt(without, 0.85)).toBe(false);

    const withAid = setup(aid());
    useItem(withAid.w, "a", 0);
    expect(attempt(withAid, 0.85)).toBe(true);
  });

  it("dao_ho bị GỠ dù thành công hay thất bại; lần thử sau (hết hồi) không còn cộng thêm", () => {
    const fail = setup(aid());
    useItem(fail.w, "a", 0);
    expect(attempt(fail, 0.99)).toBe(false); // 0,99 > 0,92: thất bại
    expect(aidOf(fail)).toBeUndefined();
    expect(fail.statusMsgs.at(-1)?.msg.list).toEqual([]); // chủ được báo hết hiệu lực
    // thất bại mất 30 % tu vi + nửa khí huyết (hành vi cũ giữ nguyên)
    expect(fail.p.exp).toBe(Math.floor(fail.p.expMax * (1 - BREAK_FAIL_EXP_LOSS)));

    const ok = setup(aid());
    useItem(ok.w, "a", 0);
    expect(attempt(ok, 0.5)).toBe(true);
    expect(aidOf(ok)).toBeUndefined();
  });

  it("đột phá bị TỪ CHỐI (chưa đủ hỏa hầu / đang hồi) thì KHÔNG gỡ đan", () => {
    const t = setup(aid());
    useItem(t.w, "a", 0);
    t.p.exp = t.p.expMax - 1; // dao_ho đã gắn lúc đủ, sau đó tụt tu vi (vd bị trừ)
    breakthrough(t.w, "a");
    expect(aidOf(t)).toBeDefined();
    t.p.exp = t.p.expMax;
    t.c.nextBreak = t.w.now + 60_000; // đang hồi
    breakthrough(t.w, "a");
    expect(aidOf(t)).toBeDefined();
  });

  it("dao_ho hết hạn thì không cộng thêm (xác suất gốc)", () => {
    const t = setup(aid({ ms: 1000 }));
    useItem(t.w, "a", 0);
    t.w.now += 5000;
    expect(attempt(t, 0.85)).toBe(false); // gốc 77 %, random 0,85 thất bại
  });

  it("chết / qua kiếp xoá dao_ho (đúng như trạng thái khác): clearPlayerStatus", async () => {
    const { clearPlayerStatus } = await import("./status");
    const t = setup(aid());
    useItem(t.w, "a", 0);
    expect(aidOf(t)).toBeDefined();
    clearPlayerStatus(t.w, "a");
    expect(aidOf(t)).toBeUndefined();
  });
});

describe("chữ theo trạm (craft + hội thoại)", () => {
  const rc = RECIPE_BY_ID.ren_lang_nha_kiem; // thợ rèn Lạc Hà (tho_ren)
  const npc = NPC_BY_ID.tho_ren;
  afterEach(() => {
    delete npc.station;
  });

  function craftAt(station: CraftStation | undefined) {
    if (station) npc.station = station;
    const t = makeWorld();
    const { p } = addPlayer(t.w, "a", 1, 0);
    p.x = npc.x + 10;
    p.y = npc.y;
    giveItem(t.w, "a", "nanh_soi", 10);
    giveItem(t.w, "a", "long_tho", 4);
    craft(t.w, "a", rc.id);
    talk(t.w, "a", npc.id);
    return t;
  }
  const forgeOpt = (t: ReturnType<typeof craftAt>) =>
    t.dialogs.at(-1)!.msg.options.find((o) => o.action.kind === "forge");

  it("NPC không có `station` (hoặc lạ) = lò rèn: 'Rèn thành công', lựa chọn 'Rèn đồ' với hành động { kind: 'forge' } CŨ", () => {
    const t = craftAt(undefined);
    expect(t.toasts.find((x) => x.msg.tone === "good")?.msg.text).toBe(
      "Rèn thành công Lang Nha Kiếm.",
    );
    expect(forgeOpt(t)).toEqual({ label: "Rèn đồ", action: { kind: "forge" } });
  });

  it("trạm alchemy: 'Luyện thành công', lựa chọn 'Luyện đan' kèm station", () => {
    const t = craftAt("alchemy");
    expect(t.toasts.find((x) => x.msg.tone === "good")?.msg.text).toBe(
      "Luyện thành công Lang Nha Kiếm.",
    );
    expect(forgeOpt(t)).toEqual({
      label: "Luyện đan",
      action: { kind: "forge", station: "alchemy" },
    });
  });

  it("trạm talisman: 'Chế thành công', lựa chọn 'Chế phù' kèm station", () => {
    const t = craftAt("talisman");
    expect(t.toasts.find((x) => x.msg.tone === "good")?.msg.text).toBe(
      "Chế thành công Lang Nha Kiếm.",
    );
    expect(forgeOpt(t)).toEqual({
      label: "Chế phù",
      action: { kind: "forge", station: "talisman" },
    });
  });

  it("station hỏng trong dữ liệu (chuỗi lạ) coi như lò rèn", () => {
    (npc as { station?: unknown }).station = "constructor";
    const t = craftAt(undefined);
    expect(t.toasts.find((x) => x.msg.tone === "good")?.msg.text).toBe(
      "Rèn thành công Lang Nha Kiếm.",
    );
  });
});
