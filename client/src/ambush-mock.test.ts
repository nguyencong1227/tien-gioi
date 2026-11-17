import { describe, expect, it } from "vitest";
import {
  AMBUSH_ARM_MS,
  AMBUSH_MSG,
  AMBUSH_OFFER_ID_RE,
  AMBUSH_OFFER_MS,
  AMBUSH_SEEN_MS,
  AMBUSH_TIME_MS,
  type AmbushEndMsg,
  type AmbushOfferMsg,
  type AmbushStateMsg,
} from "@tien-gioi/shared";
import {
  AMBUSH_MOCK_FIGHT_MS,
  AMBUSH_MOCK_REOFFER_MS,
  MOCK_MID_PRICE,
  MOCK_OFFER_PRICE,
  installMockAmbush,
  isMockAmbushEnabled,
} from "./ambush-mock";

/** Hẹn giờ + đồng hồ GIẢ tất định: `advance(ms)` chạy các hẹn tới hạn theo thứ tự. */
class Sched {
  t = 0;
  private seq = 0;
  private q: { id: number; at: number; fn: () => void }[] = [];
  now = (): number => this.t;
  set = (fn: () => void, ms: number): unknown => {
    const id = ++this.seq;
    this.q.push({ id, at: this.t + ms, fn });
    return id;
  };
  clear = (h: unknown): void => {
    this.q = this.q.filter((x) => x.id !== h);
  };
  advance(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      this.q.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.q[0];
      if (!next || next.at > target) break;
      this.q.shift();
      this.t = next.at;
      next.fn();
    }
    this.t = target;
  }
  get pending(): number {
    return this.q.length;
  }
}

function setup(onTravel?: () => void) {
  const sch = new Sched();
  const sent: { type: string; data: unknown }[] = [];
  const got: { type: string; data: unknown }[] = [];
  const room = {
    send: (type: string, data?: unknown) => void sent.push({ type, data }),
    emit: (type: string, data?: unknown) => void got.push({ type, data }),
  };
  const mock = installMockAmbush(room, {
    onTravel,
    now: sch.now,
    setTimer: sch.set,
    clearTimer: sch.clear,
  });
  const of = <T>(type: string) => got.filter((g) => g.type === type).map((g) => g.data as T);
  return {
    sch,
    room,
    mock,
    sent,
    got,
    offers: () => of<AmbushOfferMsg>(AMBUSH_MSG.offer),
    ends: () => of<AmbushEndMsg>(AMBUSH_MSG.end),
    states: () => of<AmbushStateMsg>(AMBUSH_MSG.state),
  };
}

describe("isMockAmbushEnabled", () => {
  it("chỉ khi ?ambush=mock VÀ (DEV hoặc ?debug)", () => {
    expect(isMockAmbushEnabled("?ambush=mock&debug=1", false)).toBe(true);
    expect(isMockAmbushEnabled("?ambush=mock", true)).toBe(true);
    expect(isMockAmbushEnabled("?ambush=mock", false)).toBe(false);
    expect(isMockAmbushEnabled("?ambush=on&debug=1", false)).toBe(false);
    expect(isMockAmbushEnabled("?debug=1", true)).toBe(false);
  });
});

describe("máy chủ giả chặn đường: luồng và luật như máy chủ thật", () => {
  it("begin: gửi lời đề nghị hợp lệ (id 16 hex, giá CHỐT, đủ thời gian); id mỗi lần một khác", () => {
    const h = setup();
    h.mock.begin();
    const o = h.offers()[0];
    expect(o.id).toMatch(AMBUSH_OFFER_ID_RE);
    expect(o.price).toEqual(MOCK_OFFER_PRICE);
    expect(o.ms).toBe(AMBUSH_OFFER_MS);
    h.sch.advance(AMBUSH_SEEN_MS); // không ambushSeen -> huỷ lặng lẽ
    h.sch.advance(AMBUSH_MOCK_REOFFER_MS);
    const ids = h.offers().map((x) => x.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("KHÔNG ambushSeen trong AMBUSH_SEEN_MS = ambushEnd canceled (không phạt), rồi đề nghị mới", () => {
    const h = setup();
    h.mock.begin();
    h.sch.advance(AMBUSH_SEEN_MS - 1);
    expect(h.ends()).toHaveLength(0);
    h.sch.advance(1);
    expect(h.ends()).toEqual([{ result: "canceled" }]);
    expect(h.offers()).toHaveLength(1);
    h.sch.advance(AMBUSH_MOCK_REOFFER_MS);
    expect(h.offers()).toHaveLength(2);
  });

  it("lựa chọn đến sớm hơn AMBUSH_ARM_MS bị bỏ qua; đủ AMBUSH_ARM_MS thì nhận", () => {
    const h = setup();
    h.mock.begin();
    const id = h.offers()[0].id;
    h.room.send(AMBUSH_MSG.seen, { id });
    h.sch.advance(AMBUSH_ARM_MS - 1);
    h.room.send(AMBUSH_MSG.choose, { id, choice: "flee_coin" });
    h.sch.advance(1000);
    expect(h.ends()).toHaveLength(0); // bị bỏ qua
    h.room.send(AMBUSH_MSG.choose, { id, choice: "flee_coin" });
    h.sch.advance(300);
    expect(h.ends()).toEqual([{ result: "fled", paid: { coin: MOCK_OFFER_PRICE.coin.price } }]);
  });

  it("bỏ chạy ở hộp thoại: trừ ĐÚNG giá đã chốt, MỘT lần dù bấm hai lần; flee_exp trừ tu vi", () => {
    const h = setup();
    h.mock.begin();
    const id = h.offers()[0].id;
    h.sch.advance(AMBUSH_ARM_MS);
    h.room.send(AMBUSH_MSG.choose, { id, choice: "flee_exp" });
    h.room.send(AMBUSH_MSG.choose, { id, choice: "flee_coin" }); // đang xử lý: bỏ qua
    h.sch.advance(300);
    expect(h.ends()).toEqual([{ result: "fled", paid: { exp: MOCK_OFFER_PRICE.exp } }]);
  });

  it("id sai / tin rác thì bỏ qua lặng lẽ (không ném lỗi, không đổi trạng thái)", () => {
    const h = setup();
    h.mock.begin();
    const id = h.offers()[0].id;
    h.sch.advance(AMBUSH_ARM_MS);
    for (const bad of [
      null,
      5,
      "x",
      {},
      { id: "0".repeat(16), choice: "fight" },
      { id, choice: "constructor" },
      { id: 5, choice: "fight" },
    ]) {
      h.room.send(AMBUSH_MSG.choose, bad);
      h.room.send(AMBUSH_MSG.seen, bad);
      h.room.send(AMBUSH_MSG.flee, bad);
    }
    h.sch.advance(500);
    expect(h.ends()).toHaveLength(0);
    expect(h.states()).toHaveLength(0);
  });

  it("Chiến: gọi onTravel (đổi phòng), gửi ambushState MỖI GIÂY với giá giữa trận và msLeft giảm dần", () => {
    let travels = 0;
    const h = setup(() => travels++);
    h.mock.begin();
    const id = h.offers()[0].id;
    h.sch.advance(AMBUSH_ARM_MS);
    h.room.send(AMBUSH_MSG.choose, { id, choice: "fight" });
    expect(travels).toBe(1);
    expect(h.states()).toHaveLength(1);
    expect(h.states()[0]).toEqual({ msLeft: AMBUSH_TIME_MS, price: MOCK_MID_PRICE });
    h.sch.advance(3000);
    expect(h.states().map((s) => s.msLeft)).toEqual([
      AMBUSH_TIME_MS,
      AMBUSH_TIME_MS - 1000,
      AMBUSH_TIME_MS - 2000,
      AMBUSH_TIME_MS - 3000,
    ]);
    expect(h.ends()).toHaveLength(0);
  });

  it("giá giữa trận gấp đôi giá hộp thoại (như thiết kế): bỏ chạy giữa trận tốn nhiều hơn", () => {
    expect(MOCK_MID_PRICE.exp).toBe(MOCK_OFFER_PRICE.exp * 2);
    expect(MOCK_MID_PRICE.coin.price).toBe(MOCK_OFFER_PRICE.coin.price * 2);
  });

  it("ambushFlee trong đấu trường: trừ giá GIỮA TRẬN một lần; ngoài đấu trường thì bỏ qua", () => {
    const h = setup();
    h.mock.begin();
    const id = h.offers()[0].id;
    h.room.send(AMBUSH_MSG.flee, { choice: "flee_coin" }); // chưa ở đấu trường
    h.sch.advance(500);
    expect(h.ends()).toHaveLength(0);
    h.sch.advance(AMBUSH_ARM_MS);
    h.room.send(AMBUSH_MSG.choose, { id, choice: "fight" });
    h.sch.advance(2000);
    h.room.send(AMBUSH_MSG.flee, { choice: "flee_exp" });
    h.room.send(AMBUSH_MSG.flee, { choice: "flee_coin" }); // đang xử lý
    h.sch.advance(300);
    expect(h.ends()).toEqual([{ result: "fled", paid: { exp: MOCK_MID_PRICE.exp } }]);
    h.sch.advance(5000);
    expect(h.states().length).toBeLessThanOrEqual(4); // hết trận: không còn ambushState
  });

  it("không bỏ chạy: tự THẮNG sau AMBUSH_MOCK_FIGHT_MS kèm thưởng, rồi đề nghị mới", () => {
    const h = setup();
    h.mock.begin();
    const id = h.offers()[0].id;
    h.sch.advance(AMBUSH_ARM_MS);
    h.room.send(AMBUSH_MSG.choose, { id, choice: "fight" });
    h.sch.advance(AMBUSH_MOCK_FIGHT_MS);
    expect(h.ends()).toEqual([{ result: "won", rewards: { exp: 360, coin: 48, items: [] } }]);
    h.sch.advance(AMBUSH_MOCK_REOFFER_MS);
    expect(h.offers()).toHaveLength(2);
  });

  it("đã ambushSeen mà hết AMBUSH_OFFER_MS không chọn = Chiến (máy chủ quyết)", () => {
    let travels = 0;
    const h = setup(() => travels++);
    h.mock.begin();
    h.room.send(AMBUSH_MSG.seen, { id: h.offers()[0].id });
    h.sch.advance(AMBUSH_OFFER_MS - 1);
    expect(travels).toBe(0);
    h.sch.advance(1);
    expect(travels).toBe(1);
    expect(h.states()).toHaveLength(1);
  });

  it("stop: dọn mọi hẹn giờ, không phát thêm tin nào", () => {
    const h = setup();
    h.mock.begin();
    h.mock.stop();
    expect(h.sch.pending).toBe(0);
    h.sch.advance(60_000);
    expect(h.got.filter((g) => g.type !== AMBUSH_MSG.offer)).toHaveLength(0);
  });

  it("vẫn chuyển tin gửi đi cho `send` gốc (không nuốt tin)", () => {
    const h = setup();
    h.room.send("input", { seq: 1, dx: 0, dy: 0 });
    expect(h.sent).toEqual([{ type: "input", data: { seq: 1, dx: 0, dy: 0 } }]);
  });
});
