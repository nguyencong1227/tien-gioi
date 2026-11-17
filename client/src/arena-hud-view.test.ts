import { describe, expect, it } from "vitest";
import {
  AMBUSH_FLEE_CHANNEL_MS,
  AMBUSH_TIME_MS,
  sampleAmbushState,
  type AmbushStateMsg,
} from "@tien-gioi/shared";
import { AMBUSH_RETRY_MS } from "./ambush-view";
import {
  AMBUSH_FLEE_ARM_MS,
  ARENA_URGENT_MS,
  arenaFleeLeftMs,
  arenaHudView,
  arenaRemainingMs,
  fleeArena,
  parseAmbushState,
  setFleeConfirm,
  updateArenaHud,
} from "./arena-hud-view";

const T0 = 5_000;
const st = (patch: Partial<AmbushStateMsg> = {}): AmbushStateMsg => ({
  ...sampleAmbushState(),
  ...patch,
});
const hud0 = (patch: Partial<AmbushStateMsg> = {}) => updateArenaHud(null, st(patch), T0);
/** HUD đã mở xác nhận và đã qua khoá giá ngắn. */
const ready = (patch: Partial<AmbushStateMsg> = {}) =>
  setFleeConfirm(hud0(patch), true, T0 + AMBUSH_FLEE_ARM_MS);
const READY_AT = T0 + AMBUSH_FLEE_ARM_MS;

describe("parseAmbushState (không tin tin nhắn)", () => {
  it("tin mẫu đi qua nguyên vẹn", () => {
    expect(parseAmbushState(sampleAmbushState())).toEqual(sampleAmbushState());
  });
  it("sai dạng thì bỏ", () => {
    const ok = sampleAmbushState();
    const bad: unknown[] = [
      null,
      5,
      "x",
      [],
      {},
      { ...ok, msLeft: "5" },
      { ...ok, msLeft: NaN },
      { ...ok, msLeft: Infinity },
      { ...ok, price: null },
      { ...ok, price: { ...ok.price, exp: -1 } },
      { ...ok, price: { ...ok.price, coin: { price: 5, enough: 1 } } },
      { ...ok, price: { ...ok.price, coin: null } },
    ];
    for (const b of bad) expect(parseAmbushState(b), JSON.stringify(b)).toBeNull();
  });
  it("kẹp msLeft trong [0, AMBUSH_TIME_MS], làm tròn xuống; giá làm tròn xuống; trường lạ không lọt", () => {
    const ok = sampleAmbushState();
    expect(parseAmbushState({ ...ok, msLeft: 999_999 })!.msLeft).toBe(AMBUSH_TIME_MS);
    expect(parseAmbushState({ ...ok, msLeft: -5 })!.msLeft).toBe(0);
    expect(parseAmbushState({ ...ok, msLeft: 1234.9 })!.msLeft).toBe(1234);
    const p = parseAmbushState({
      ...ok,
      extra: 1,
      price: { exp: 12.9, coin: { price: 30.7, enough: true }, free: true },
    })!;
    expect(p.price).toEqual({ exp: 12, coin: { price: 30, enough: true } });
    expect(Object.keys(p).sort()).toEqual(["msLeft", "price"]);
  });
});

describe("đồng hồ và cập nhật mỗi giây", () => {
  it("đếm ngược theo khoảng trôi từ tin cuối; không âm; đồng hồ lùi không làm tăng", () => {
    const h = hud0({ msLeft: 83_000 });
    expect(arenaRemainingMs(h, T0)).toBe(83_000);
    expect(arenaRemainingMs(h, T0 + 3000)).toBe(80_000);
    expect(arenaRemainingMs(h, T0 + 999_999)).toBe(0);
    expect(arenaRemainingMs(h, T0 - 9000)).toBe(83_000);
  });
  it("tin mới làm mới đồng hồ + giá, GIỮ bước xác nhận đang mở và lựa chọn đã gửi", () => {
    let h = ready();
    h = fleeArena(h, "flee_exp", READY_AT).hud;
    const next = updateArenaHud(h, st({ msLeft: 70_000 }), READY_AT + 1000);
    expect(next.msAtRecv).toBe(70_000);
    expect(next.recvAt).toBe(READY_AT + 1000);
    expect(next.confirming).toBe(true);
    expect(next.sent).toEqual({ choice: "flee_exp", at: READY_AT });
  });
  it("priceChangedAt chỉ đổi khi GIÁ đổi (đổi đồng hồ thì không)", () => {
    const h = hud0();
    const same = updateArenaHud(h, st({ msLeft: 60_000 }), T0 + 1000);
    expect(same.priceChangedAt).toBe(T0);
    const diff = updateArenaHud(
      h,
      st({ price: { exp: 999, coin: { price: 77, enough: true } } }),
      T0 + 2000,
    );
    expect(diff.priceChangedAt).toBe(T0 + 2000);
    const enough = updateArenaHud(
      h,
      st({ price: { exp: h.price.exp, coin: { price: h.price.coin.price, enough: false } } }),
      T0 + 3000,
    );
    expect(enough.priceChangedAt).toBe(T0 + 3000);
  });
});

describe("arenaHudView", () => {
  it("đồng hồ dạng mm:ss; báo gấp khi còn dưới ARENA_URGENT_MS (đúng biên)", () => {
    expect(arenaHudView(hud0({ msLeft: 83_000 }), T0).countdown).toBe("01:23");
    const edge = hud0({ msLeft: ARENA_URGENT_MS });
    expect(arenaHudView(edge, T0).urgent).toBe(false);
    expect(arenaHudView(edge, T0 + 1).urgent).toBe(true);
    expect(arenaHudView(hud0({ msLeft: 0 }), T0).urgent).toBe(false);
  });
  it("hết đồng hồ cục bộ mà chưa gửi gì: 'Đang chờ máy chủ…', KHÔNG tự làm gì", () => {
    const v = arenaHudView(hud0({ msLeft: 1000 }), T0 + 2000);
    expect(v.waitingServer).toBe(true);
    expect(v.note).toBe("Đang chờ máy chủ…");
    expect(arenaHudView(hud0({ msLeft: 5000 }), T0 + 1000).waitingServer).toBe(false);
  });
  it("giá trên nút = giá của tin MỚI NHẤT (không tự tính), có dấu chấm ngăn nghìn", () => {
    const h = ready({ price: { exp: 12_345, coin: { price: 77, enough: true } } });
    const v = arenaHudView(h, READY_AT);
    expect(v.buttons.map((b) => b.choice)).toEqual(["flee_coin", "flee_exp"]);
    expect(v.buttons[0].sub).toBe("77 Linh thạch");
    expect(v.buttons[1].sub).toBe("12.345 tu vi");
    const updated = updateArenaHud(
      h,
      st({ price: { exp: 20_000, coin: { price: 88, enough: true } } }),
      READY_AT + 1000,
    );
    const v2 = arenaHudView(updated, READY_AT + 1000);
    expect(v2.buttons[0].sub).toBe("88 Linh thạch");
    expect(v2.buttons[1].sub).toBe("20.000 tu vi");
  });
  it("Linh thạch không đủ: nút mờ nhưng VẪN hiện giá; thanh tu vi trống: khoá, không 'miễn phí' / '0 tu vi'", () => {
    const v = arenaHudView(
      ready({ price: { exp: 0, coin: { price: 90, enough: false } } }),
      READY_AT,
    );
    expect(v.buttons[0].enabled).toBe(false);
    expect(v.buttons[0].sub).toBe("90 Linh thạch (không đủ)");
    expect(v.buttons[1].enabled).toBe(false);
    expect(v.buttons[1].sub).toBe("Thanh tu vi trống");
    expect(JSON.stringify(v)).not.toMatch(/miễn phí|\b0 tu vi/i);
  });
  it("câu đọc màn hình chỉ nêu cách bỏ chạy DÙNG ĐƯỢC", () => {
    const both = arenaHudView(
      ready({ price: { exp: 50, coin: { price: 9, enough: true } } }),
      READY_AT,
    );
    expect(both.announce).toContain("Bỏ chạy giữa trận: 9 Linh thạch hoặc 50 tu vi.");
    const noExp = arenaHudView(
      ready({ price: { exp: 0, coin: { price: 9, enough: true } } }),
      READY_AT,
    );
    expect(noExp.announce).toContain("Bỏ chạy giữa trận: 9 Linh thạch.");
    const noCoin = arenaHudView(
      ready({ price: { exp: 50, coin: { price: 9, enough: false } } }),
      READY_AT,
    );
    expect(noCoin.announce).toContain("Bỏ chạy giữa trận: 50 tu vi.");
    expect(noCoin.announce).not.toContain("Linh thạch");
    const none = arenaHudView(
      ready({ price: { exp: 0, coin: { price: 9, enough: false } } }),
      READY_AT,
    );
    expect(none.announce).toContain("không đủ để trả giá");
  });
  it("chưa mở xác nhận: hai nút giá mờ, nút 'Bỏ chạy' bấm được; mở rồi thì ngược lại", () => {
    const closed = arenaHudView(hud0(), T0 + 5000);
    expect(closed.canOpenFlee).toBe(true);
    expect(closed.confirming).toBe(false);
    expect(closed.buttons.every((b) => !b.enabled)).toBe(true);
    const open = arenaHudView(ready(), READY_AT);
    expect(open.canOpenFlee).toBe(false);
    expect(open.confirming).toBe(true);
    expect(open.buttons.every((b) => b.enabled)).toBe(true);
    expect(open.confirmText).toMatch(/nhiều hơn lúc mới gặp/);
  });
});

describe("bỏ chạy giữa trận: xác nhận, khoá giá, gửi một lần", () => {
  it("KHÔNG gửi khi chưa mở xác nhận (một chạm vào nút 'Bỏ chạy' không trừ gì)", () => {
    for (const c of ["flee_coin", "flee_exp"] as const)
      expect(fleeArena(hud0(), c, T0 + 5000).send).toBeNull();
  });
  it("mở xác nhận rồi: chỉ gửi sau khoá ngắn AMBUSH_FLEE_ARM_MS kể từ lúc giá đổi (đúng biên)", () => {
    const h = setFleeConfirm(hud0(), true, T0);
    expect(fleeArena(h, "flee_coin", T0 + AMBUSH_FLEE_ARM_MS - 1).send).toBeNull();
    expect(fleeArena(h, "flee_coin", T0 + AMBUSH_FLEE_ARM_MS).send).toEqual({
      choice: "flee_coin",
    });
  });
  it("giá VỪA ĐỔI thì nút giá khoá lại một chút (khỏi bấm trúng số khác với số vừa thấy)", () => {
    const h = ready();
    const changed = updateArenaHud(
      h,
      st({ price: { exp: h.price.exp + 100, coin: h.price.coin } }),
      READY_AT + 500,
    );
    expect(arenaHudView(changed, READY_AT + 500).buttons.every((b) => !b.enabled)).toBe(true);
    expect(fleeArena(changed, "flee_exp", READY_AT + 500).send).toBeNull();
    expect(fleeArena(changed, "flee_exp", READY_AT + 500 + AMBUSH_FLEE_ARM_MS).send).not.toBeNull();
  });
  it("tin gửi CHỈ có choice (không số nào, không trường thừa); lựa chọn lạ / fight / độc không gửi", () => {
    const { send } = fleeArena(ready(), "flee_exp", READY_AT);
    expect(Object.keys(send!)).toEqual(["choice"]);
    for (const c of ["fight", "", "FLEE_COIN", "constructor", "__proto__", 5, null, undefined, {}])
      expect(fleeArena(ready(), c, READY_AT).send, String(c)).toBeNull();
  });
  it("nút mờ không gửi: Linh thạch không đủ, tu vi trống", () => {
    const h = ready({ price: { exp: 0, coin: { price: 9, enough: false } } });
    expect(fleeArena(h, "flee_coin", READY_AT).send).toBeNull();
    expect(fleeArena(h, "flee_exp", READY_AT).send).toBeNull();
  });
  it("gửi rồi thì khoá (một lần), 'Đang xử lý…', không đóng được xác nhận giữa chừng", () => {
    const first = fleeArena(ready(), "flee_coin", READY_AT);
    expect(first.send).not.toBeNull();
    expect(fleeArena(first.hud, "flee_coin", READY_AT + 100).send).toBeNull();
    expect(fleeArena(first.hud, "flee_exp", READY_AT + 100).send).toBeNull();
    const v = arenaHudView(first.hud, READY_AT + 100);
    expect(v.busy).toBe(true);
    expect(v.note).toBe("Đang xử lý…");
    expect(v.canOpenFlee).toBe(false);
    expect(setFleeConfirm(first.hud, false, READY_AT + 100).confirming).toBe(true);
  });
  it("quá AMBUSH_RETRY_MS chưa có kết cục (lưu hỏng ở máy chủ): mở lại nút cho bấm lại", () => {
    const first = fleeArena(ready(), "flee_coin", READY_AT);
    const late = READY_AT + AMBUSH_RETRY_MS;
    expect(fleeArena(first.hud, "flee_coin", late - 1).send).toBeNull();
    const v = arenaHudView(first.hud, late);
    expect(v.busy).toBe(false);
    expect(v.note).toBe("Chưa có phản hồi, hãy thử lại.");
    expect(fleeArena(first.hud, "flee_coin", late).send).toEqual({ choice: "flee_coin" });
  });
  it("đóng xác nhận (Huỷ) khi chưa gửi: nút giá mờ trở lại", () => {
    const closed = setFleeConfirm(ready(), false, READY_AT);
    expect(closed.confirming).toBe(false);
    expect(fleeArena(closed, "flee_coin", READY_AT + 9999).send).toBeNull();
  });
});

describe("MỤC 53: vận bỏ chạy 1 giây (ambushState.fleeMs)", () => {
  it("parse: giữ fleeMs hợp lệ (làm tròn xuống, kẹp [1, AMBUSH_FLEE_CHANNEL_MS]); hỏng thì coi như vắng và KHÔNG bỏ cả tin", () => {
    const base = sampleAmbushState();
    expect(parseAmbushState({ ...base, fleeMs: 640.9 })?.fleeMs).toBe(640);
    expect(parseAmbushState({ ...base, fleeMs: 0.4 })?.fleeMs).toBe(1);
    expect(parseAmbushState({ ...base, fleeMs: 99_999 })?.fleeMs).toBe(AMBUSH_FLEE_CHANNEL_MS);
    for (const bad of [0, -5, NaN, Infinity, "640", null, {}, [], true]) {
      const r = parseAmbushState({ ...base, fleeMs: bad });
      expect(r, String(bad)).not.toBeNull(); // giá + đồng hồ vẫn dùng được
      expect(r?.fleeMs, String(bad)).toBeUndefined();
      expect(r?.price).toEqual(base.price);
    }
    expect(parseAmbushState(base)).toEqual(base); // tin cũ không có fleeMs: nguyên vẹn
  });

  it("tin có fleeMs: HUD vào trạng thái đang vận, đếm lùi theo đồng hồ cục bộ, đóng bảng xác nhận", () => {
    const h = ready();
    expect(h.confirming).toBe(true);
    const f = updateArenaHud(h, st({ fleeMs: 1000 }), READY_AT + 50);
    expect(f.confirming).toBe(false); // người chơi phải thấy trận (vận KHÔNG bất khả xâm phạm)
    expect(arenaFleeLeftMs(f, READY_AT + 50)).toBe(1000);
    expect(arenaFleeLeftMs(f, READY_AT + 550)).toBe(500);
    expect(arenaFleeLeftMs(f, READY_AT + 5000)).toBe(0); // không âm
    expect(arenaFleeLeftMs(hud0(), T0)).toBeNull();
  });

  it("view khi vận: chữ 'Đang thoát… N giây', thanh tiến độ 0 -> 1, nút Bỏ chạy KHÔNG mở lại được, đọc màn hình nói đang thoát", () => {
    const f = updateArenaHud(hud0(), st({ fleeMs: 1000 }), T0);
    const v0 = arenaHudView(f, T0);
    expect(v0.fleeing).toBe(true);
    expect(v0.fleeFrac).toBe(0);
    expect(v0.note).toBe("Đang thoát… 1,0 giây");
    expect(v0.canOpenFlee).toBe(false);
    expect(v0.announce).toMatch(/Đang thoát, còn 1,0 giây/);
    const v1 = arenaHudView(f, T0 + 600);
    expect(v1.fleeFrac).toBeCloseTo(0.6, 5);
    expect(v1.note).toBe("Đang thoát… 0,4 giây");
    const v2 = arenaHudView(f, T0 + 2000);
    expect(v2.fleeFrac).toBe(1);
    expect(v2.note).toBe("Đang thoát… 0,0 giây");
  });

  it("đã gửi lựa chọn rồi mới có fleeMs: 'Đang thoát' đè 'Đang xử lý…'", () => {
    let h = ready();
    const r = fleeArena(h, "flee_coin", READY_AT);
    h = r.hud;
    expect(arenaHudView(h, READY_AT + 10).note).toBe("Đang xử lý…");
    h = updateArenaHud(h, st({ fleeMs: 1000 }), READY_AT + 20);
    expect(arenaHudView(h, READY_AT + 30).note).toMatch(/^Đang thoát…/);
  });

  it("tin kế tiếp VẮNG fleeMs = vận đã huỷ: thoát khỏi trạng thái vận, nút Bỏ chạy mở lại được khi không còn gì đang chờ", () => {
    const f = updateArenaHud(hud0(), st({ fleeMs: 1000 }), T0);
    const g = updateArenaHud(f, st(), T0 + 200);
    expect(g.fleeAt).toBeNull();
    const v = arenaHudView(g, T0 + 250);
    expect(v.fleeing).toBe(false);
    expect(v.canOpenFlee).toBe(true);
  });

  it("câu xác nhận nói rõ cần vận 1 giây và vẫn bị đánh (không bất khả xâm phạm)", () => {
    const v = arenaHudView(ready(), READY_AT);
    expect(v.confirmText).toMatch(/vận 1 giây/);
    expect(v.confirmText).toMatch(/vẫn bị đánh/);
  });
});
