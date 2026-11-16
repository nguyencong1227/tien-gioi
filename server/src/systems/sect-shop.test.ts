// Cửa hàng tông môn nối với phòng (M8.5, docs/THIET_KE_TONG_MON.md mục 12.6): mua bằng cống hiến, trọn vẹn hoặc không gì cả, hạn mức theo NGÀY, khoá theo cấp tông, kinh quyển đã học bị
// từ chối, thứ tự "trừ cống hiến -> cộng túi -> lưu" chỉ MẤT (túi không nhận được thì hoàn). World giả + kho tệp thật + `SectService` thật (như `sect-quest.test.ts`).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  INVENTORY_SLOTS,
  SECT_SHOP,
  SECT_SHOP_BY_ITEM,
  bookIdOf,
  sectFailMessage,
  type SectFail,
  type SectShopEntry,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { FileSectStore } from "../sect-store";
import { SectService, shopKnown } from "../sect-service";
import { makeSect } from "../store-contract";
import { sectHallGet, sectOnJoin, sectShopBuy } from "./sect";
import { addPlayer, makeWorld } from "./test-helpers";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-shop-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const DAY = 86_400_000;
const A = "Alpha";
const B = "Bravo";
const keyOf = (s: string) => s.toLowerCase();

// Dữ liệu mẫu của M8.1 (D thay bằng bảng thật ở M8.7): đan hồi huyết 5 cống hiến / cấp 1 / 10 mỗi ngày, Tụ Khí Đan 30 / cấp 3 / 2 mỗi ngày
const HP = "hoi_huyet_dan";
const TU = "tu_khi_dan";

let now = 1_700_000_000_000;
let lh: ReturnType<typeof makeWorld>;
let store: FileSectStore;
let svc: SectService;
let audit: { ev: string; f: Record<string, unknown> }[];

/** Dựng tông môn "t1" (A Tông chủ, B Đệ tử), vào từ 2 ngày trước; A có `contrib` cống hiến, tông có `points` điểm (4.000 = cấp 3). */
async function seed(contrib = 1000, points = 0) {
  const joined = now - 2 * DAY;
  return store.create(
    makeSect("t1", {
      name: "Thanh Van",
      tag: "TV",
      leader: keyOf(A),
      points: Math.max(points, contrib + 500), // điểm tông >= tổng công tích thành viên (bất biến của kho)
      members: [
        { soulKey: keyOf(A), name: A, rank: "chu", joinedAt: joined, contrib, merit: contrib },
        { soulKey: keyOf(B), name: B, rank: "de_tu", joinedAt: joined },
      ],
    }),
  );
}
const join = (who: string) => sectOnJoin(lh.w, who);
const meOf = async (who: string) =>
  (await store.get("t1"))!.members.find((m) => m.soulKey === keyOf(who))!;
const lastHall = (who: string) => lh.sectHalls.filter((h) => h.sid === who).at(-1)?.msg.hall;
const lastToast = (who: string) => lh.toasts.filter((t) => t.sid === who).at(-1)?.msg.text;
const rowOf = (who: string, itemId: string) =>
  lastHall(who)!.shop.find((r) => r.itemId === itemId)!;
const buy = (who: string, itemId: unknown, qty: unknown) => sectShopBuy(lh.w, who, { itemId, qty });
const failText = (r: SectFail) => sectFailMessage(r);
const bagCount = (who: string, itemId: string) =>
  lh.w.ctrl.get(who)!.inv.reduce((s, x) => s + (x?.itemId === itemId ? x.qty : 0), 0);

beforeEach(async () => {
  now = 1_700_000_000_000;
  lh = makeWorld(undefined, new Hub());
  store = new FileSectStore(path.join(root, `s${++n}`), () => now);
  svc = new SectService(store, () => now);
  lh.w.now = now;
  lh.w.sectService = svc;
  lh.w.onSaveNow = async () => true;
  audit = [];
  lh.w.audit = (ev, f) => void audit.push({ ev, f: f ?? {} });
  addPlayer(lh.w, A, 1, 8);
  addPlayer(lh.w, B, 1, 8);
});

describe("ảnh chụp Nội vụ: cửa hàng của CHÍNH người xem", () => {
  it("mọi món của SECT_SHOP kèm giá, cấp mở, lượt còn hôm nay và LÝ DO khoá (cấp tông / chưa đủ cống hiến / mua được)", async () => {
    await seed(7); // cấp 1, 7 cống hiến
    await join(A);
    const shop = lastHall(A)!.shop;
    expect(shop.map((r) => r.itemId)).toEqual(SECT_SHOP.map((e) => e.itemId));
    expect(rowOf(A, HP)).toMatchObject({
      cost: 5,
      minLevel: 1,
      limitDay: 10,
      left: 10,
      locked: null,
    });
    expect(rowOf(A, TU)).toMatchObject({ cost: 30, minLevel: 3, left: 2, locked: "level" });
    await store.update("t1", (s) => ({
      ...s,
      members: s.members.map((m) => (m.soulKey === keyOf(A) ? { ...m, contrib: 3 } : m)),
    }));
    await sectHallGet(lh.w, A, {}); // xin ảnh chụp mới
    expect(rowOf(A, HP).locked).toBe("no_contrib");
  });
});

describe("mua hàng", () => {
  it("mua 3 đan: -15 cống hiến, +3 vào túi, today.buys, lượt còn 7, audit, toast, lưu hồ sơ; KHÔNG đổi công tích / điểm tông", async () => {
    await seed(100);
    await join(A);
    let saved = 0;
    lh.w.onSaveNow = async () => (saved++, true);
    await buy(A, HP, 3);
    const me = await meOf(A);
    expect(me.contrib).toBe(85);
    expect(me.merit).toBe(100); // tiêu cống hiến KHÔNG hạ công tích...
    expect((await store.get("t1"))!.points).toBe(600); // ...cũng không hạ điểm tông (số đã dựng)
    expect(me.today!.buys).toEqual({ [HP]: 3 });
    expect(bagCount(A, HP)).toBe(3);
    expect(rowOf(A, HP).left).toBe(7);
    expect(lastHall(A)!.me.contrib).toBe(85);
    expect(lastToast(A)).toContain("-15 cống hiến");
    expect(saved).toBeGreaterThan(0);
    expect(lh.invs.at(-1)!.sid).toBe(A); // túi gửi cho chủ
    expect(audit.find((e) => e.ev === "sect.shop_buy")!.f).toMatchObject({
      name: A,
      itemId: HP,
      qty: 3,
      cost: 15,
    });
  });

  it("món khoá theo cấp tông: shop_locked khi chưa đủ cấp 3, mua được ở cấp 3 (4.000 điểm)", async () => {
    await seed(1000, 0);
    await join(A);
    await buy(A, TU, 1);
    expect(lastToast(A)).toBe(failText("shop_locked"));
    expect(bagCount(A, TU)).toBe(0);
    expect((await meOf(A)).contrib).toBe(1000);
    await store.update("t1", (s) => ({ ...s, points: 4000 }));
    await buy(A, TU, 1);
    expect((await meOf(A)).contrib).toBe(970);
    expect(bagCount(A, TU)).toBe(1);
  });

  it("không đủ cống hiến: no_contrib, không mất gì, không có hàng", async () => {
    await seed(4);
    await join(A);
    await buy(A, HP, 1);
    expect(lastToast(A)).toBe(failText("no_contrib"));
    expect((await meOf(A)).contrib).toBe(4);
    expect(bagCount(A, HP)).toBe(0);
  });

  it("hạn mức NGÀY: mua đủ 10 rồi mua thêm: shop_limit; 8 + 3 > 10: shop_limit và KHÔNG mua phần nào; sang ngày mới mua lại được", async () => {
    await seed(1000);
    await join(A);
    await buy(A, HP, 8);
    expect(bagCount(A, HP)).toBe(8);
    await buy(A, HP, 3);
    expect(lastToast(A)).toBe(failText("shop_limit"));
    expect(bagCount(A, HP)).toBe(8);
    expect((await meOf(A)).contrib).toBe(960);
    await buy(A, HP, 2);
    expect(bagCount(A, HP)).toBe(10);
    await buy(A, HP, 1);
    expect(lastToast(A)).toBe(failText("shop_limit"));
    expect(rowOf(A, HP)).toMatchObject({ left: 0, locked: "limit" });
    now += DAY;
    lh.w.now = now;
    await buy(A, HP, 1);
    expect(bagCount(A, HP)).toBe(11);
    expect((await meOf(A)).today!.buys).toEqual({ [HP]: 1 });
  });

  it("hạn mức theo NGƯỜI: A mua hết không ảnh hưởng B", async () => {
    await seed(1000);
    await store.update("t1", (s) => ({
      ...s,
      members: s.members.map((m) =>
        m.soulKey === keyOf(B) ? { ...m, contrib: 500, merit: 500 } : m,
      ),
    }));
    await join(A);
    await join(B);
    await buy(A, HP, 10);
    await buy(B, HP, 10);
    expect(bagCount(B, HP)).toBe(10);
    expect((await meOf(B)).contrib).toBe(450);
  });

  it("ĐỒNG THỜI: hai lần mua cùng lúc (6 + 6 > hạn mức 10): chỉ MỘT được (khoá busy + `update` nguyên tử); trừ cống hiến đúng một lần", async () => {
    await seed(1000);
    await join(A);
    await Promise.all([buy(A, HP, 6), buy(A, HP, 6), buy(A, HP, 6)]);
    expect(bagCount(A, HP)).toBe(6);
    expect((await meOf(A)).contrib).toBe(970);
    expect((await meOf(A)).today!.buys).toEqual({ [HP]: 6 });
  });

  it("tin xấu (món lạ / độc / sai kiểu, số lượng 0 / âm / lẻ / NaN / chuỗi / quá lớn): item_invalid, không đổi gì", async () => {
    await seed(1000);
    await join(A);
    for (const item of ["constructor", "__proto__", "khong_co", "", 5, null, { x: 1 }]) {
      await buy(A, item, 1);
      expect(lastToast(A), String(item)).toBe(failText("item_invalid"));
    }
    for (const qty of [0, -1, 1.5, Number.NaN, Infinity, "3", null, undefined, 11, 1e9]) {
      await buy(A, HP, qty);
      expect(lastToast(A), String(qty)).toBe(failText("item_invalid"));
    }
    for (const raw of [undefined, null, 0, "x", [], {}]) await sectShopBuy(lh.w, A, raw);
    expect((await meOf(A)).contrib).toBe(1000);
    expect(bagCount(A, HP)).toBe(0);
  });
});

describe("kinh quyển đã học", () => {
  const BOOK = bookIdOf("hoa_van_kiem");
  const entry: SectShopEntry = {
    itemId: BOOK,
    cost: 10,
    minLevel: 1,
    limitDay: 1,
    hall: "tangKinh",
  };
  /** Thêm tạm một món kinh quyển vào bảng (mẫu M8.1 chưa có kinh quyển; D thêm thật ở M8.7), dọn sau mỗi ca. */
  const withBook = async (fn: () => Promise<void>) => {
    (SECT_SHOP as SectShopEntry[]).push(entry);
    SECT_SHOP_BY_ITEM[BOOK] = entry;
    try {
      await fn();
    } finally {
      (SECT_SHOP as SectShopEntry[]).pop();
      delete SECT_SHOP_BY_ITEM[BOOK];
    }
  };

  it("`shopKnown`: kinh quyển mà người mua đã học thì true; đan / chưa học / lạ thì false", () => {
    const teaches = "hoa_van_kiem";
    expect(shopKnown(BOOK, [teaches])).toBe(true);
    expect(shopKnown(BOOK, [])).toBe(false);
    expect(shopKnown(BOOK, ["chieu_khac"])).toBe(false);
    expect(shopKnown(HP, [teaches])).toBe(false);
    expect(shopKnown("constructor", [teaches])).toBe(false);
  });

  it("đã học chiêu thì shop_known (không mất cống hiến); chưa học thì mua được; ảnh chụp báo locked 'known'", async () => {
    await withBook(async () => {
      await seed(100);
      await join(A);
      await buy(A, BOOK, 1);
      expect(bagCount(A, BOOK)).toBe(1);
      expect((await meOf(A)).contrib).toBe(90);
      lh.w.ctrl.get(A)!.skills.learned["hoa_van_kiem"] = 1;
      now += DAY; // sang ngày: hết hạn mức, chỉ còn lý do "đã học"
      lh.w.now = now;
      await buy(A, BOOK, 1);
      expect(lastToast(A)).toBe(failText("shop_known"));
      expect((await meOf(A)).contrib).toBe(90);
      expect(bagCount(A, BOOK)).toBe(1);
      await sectHallGet(lh.w, A, {});
      expect(rowOf(A, BOOK).locked).toBe("known");
    });
  });
});

describe("túi và người chơi: thứ tự chỉ MẤT", () => {
  /** Đầy túi bằng 1 món khác nhau cho mọi ô (không còn chỗ cho món mới). */
  const fillBag = (who: string) => {
    const inv = lh.w.ctrl.get(who)!.inv;
    for (let i = 0; i < INVENTORY_SLOTS; i++) inv[i] = { itemId: "long_tho", qty: 1 };
  };

  it("túi ĐẦY: bag_full TRƯỚC khi trừ (cống hiến, hạn mức, đồ nguyên vẹn)", async () => {
    await seed(100);
    await join(A);
    fillBag(A);
    await buy(A, HP, 2);
    expect(lastToast(A)).toBe(failText("bag_full"));
    expect((await meOf(A)).contrib).toBe(100);
    expect((await meOf(A)).today?.buys ?? {}).toEqual({});
    expect(bagCount(A, HP)).toBe(0);
  });

  it("túi vừa đầy GIỮA LÚC chờ máy chủ: HOÀN cống hiến và hạn mức, không có hàng, toast bag_full", async () => {
    await seed(100);
    await join(A);
    const real = svc.shopBuy.bind(svc);
    svc.shopBuy = (async (...args: Parameters<typeof real>) => {
      const r = await real(...args);
      fillBag(A); // người chơi nhặt đầy túi ngay sau khi kho trừ cống hiến
      return r;
    }) as typeof svc.shopBuy;
    await buy(A, HP, 4);
    svc.shopBuy = real;
    expect(lastToast(A)).toBe(failText("bag_full"));
    expect((await meOf(A)).contrib).toBe(100); // hoàn đủ 20
    expect((await meOf(A)).today?.buys ?? {}).toEqual({});
    expect(bagCount(A, HP)).toBe(0);
    expect(rowOf(A, HP).left).toBe(10); // ảnh chụp báo lại số thật
  });

  it("người chơi rời phòng giữa lúc chờ: hoàn cống hiến (không có hàng ở đâu cả)", async () => {
    await seed(100);
    await join(A);
    const real = svc.shopBuy.bind(svc);
    svc.shopBuy = (async (...args: Parameters<typeof real>) => {
      const r = await real(...args);
      lh.w.ctrl.delete(A);
      return r;
    }) as typeof svc.shopBuy;
    await buy(A, HP, 4);
    svc.shopBuy = real;
    expect((await meOf(A)).contrib).toBe(100);
    expect((await meOf(A)).today?.buys ?? {}).toEqual({});
  });

  it("gục giữa lúc chờ: hoàn cống hiến, không cộng đồ cho người đã chết", async () => {
    await seed(100);
    await join(A);
    const real = svc.shopBuy.bind(svc);
    svc.shopBuy = (async (...args: Parameters<typeof real>) => {
      const r = await real(...args);
      lh.w.state.players.get(A)!.dead = true;
      return r;
    }) as typeof svc.shopBuy;
    await buy(A, HP, 4);
    svc.shopBuy = real;
    expect((await meOf(A)).contrib).toBe(100);
    expect(bagCount(A, HP)).toBe(0);
  });

  it("lưu hồ sơ lỗi: KHÔNG hoàn (hàng đã nằm trong túi; chỉ có thể MẤT, không nhân đôi), không ném lỗi", async () => {
    await seed(100);
    await join(A);
    lh.w.onSaveNow = async () => false;
    await buy(A, HP, 2);
    expect(bagCount(A, HP)).toBe(2);
    expect((await meOf(A)).contrib).toBe(90);
  });

  it("hoàn sau khi đã sang ngày (sổ ngày mới trống): trả cống hiến, không làm hỏng hạn mức", async () => {
    await seed(100);
    await join(A);
    const real = svc.shopBuy.bind(svc);
    svc.shopBuy = (async (...args: Parameters<typeof real>) => {
      const r = await real(...args);
      now += DAY; // nửa đêm đúng lúc chờ
      fillBag(A);
      return r;
    }) as typeof svc.shopBuy;
    await buy(A, HP, 4);
    svc.shopBuy = real;
    expect((await meOf(A)).contrib).toBe(100);
    expect(bagCount(A, HP)).toBe(0);
  });
});

describe("điều kiện chung", () => {
  it("không ở tông môn: not_in_sect; đã gục: down; đang qua cổng: error; SECTS=off: disabled", async () => {
    await seed(100);
    addPlayer(lh.w, "Cuoi", 1, 8);
    await buy("Cuoi", HP, 1);
    expect(lastToast("Cuoi")).toBe(failText("not_in_sect"));
    await join(A);
    lh.w.state.players.get(A)!.dead = true;
    await buy(A, HP, 1);
    expect(lastToast(A)).toBe(failText("down"));
    lh.w.state.players.get(A)!.dead = false;
    lh.w.ctrl.get(A)!.travelling = true;
    await buy(A, HP, 1);
    expect(lastToast(A)).toBe(failText("error"));
    lh.w.ctrl.get(A)!.travelling = false;
    lh.w.sectService = null;
    await buy(A, HP, 1);
    expect(lastToast(A)).toBe(failText("disabled"));
    expect((await meOf(A)).contrib).toBe(100);
  });

  it("đầu thai giữa ngày (cùng linh hồn, túi trắng): hạn mức vẫn tính (sổ ngày theo LINH HỒN), không mua lại để lách", async () => {
    await seed(1000);
    await join(A);
    await buy(A, HP, 10);
    lh.w.ctrl.get(A)!.inv.fill(null as never); // kiếp mới: túi trống
    await buy(A, HP, 1);
    expect(lastToast(A)).toBe(failText("shop_limit"));
  });

  it("món thêm sau khi lên cấp: đổi trong ngày nhiều lần cộng dồn đúng hạn mức (2 + 2 > hạn mức 2 của Tụ Khí Đan)", async () => {
    await seed(1000, 4000);
    await join(A);
    await buy(A, TU, 1);
    await buy(A, TU, 1);
    await buy(A, TU, 1);
    expect(lastToast(A)).toBe(failText("shop_limit"));
    expect(bagCount(A, TU)).toBe(2);
    expect((await meOf(A)).contrib).toBe(940);
  });
});
