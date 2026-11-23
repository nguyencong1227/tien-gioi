import { describe, expect, it, vi } from "vitest";
import { HEARTBEAT_TIMEOUT_MS } from "@tien-gioi/shared";
import {
  NetSlowDetector,
  NetSlowMonitor,
  SLOW_AFTER_MS,
  SLOW_MIN_SHOW_MS,
  SLOW_POLL_MS,
  SLOW_STALE_POLL_MS,
  type NetSlowRoom,
} from "./net-slow";

/** Chạy `poll` mỗi `SLOW_POLL_MS` từ `from` tới `to` (như bộ hẹn giờ thật), trả mốc đầu tiên báo chậm (hoặc null). */
function firstSlow(d: NetSlowDetector, from: number, to: number): number | null {
  for (let t = from; t <= to; t += SLOW_POLL_MS) if (d.poll(t)) return t;
  return null;
}

describe("ngưỡng", () => {
  it("báo chậm SỚM hơn nhịp tim 8 giây (mốc coi là chết giữ nguyên ở shared) nhưng đủ xa độ trễ bình thường", () => {
    expect(SLOW_AFTER_MS).toBeLessThan(HEARTBEAT_TIMEOUT_MS);
    expect(SLOW_AFTER_MS).toBeGreaterThanOrEqual(2000);
    expect(SLOW_STALE_POLL_MS).toBeGreaterThan(SLOW_POLL_MS);
  });
});

describe("NetSlowDetector", () => {
  it("không gửi gì: lặng im KHÔNG phải mạng chậm (không ai chơi thì patch = 0 byte)", () => {
    const d = new NetSlowDetector();
    expect(firstSlow(d, 0, 60_000)).toBeNull();
  });

  it("gửi mà chờ quá ngưỡng không có gì về: báo chậm đúng sau SLOW_AFTER_MS (không sớm hơn)", () => {
    const d = new NetSlowDetector();
    d.poll(0);
    d.noteSend(1000);
    const t = firstSlow(d, 1000, 10_000);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(1000 + SLOW_AFTER_MS);
    expect(t!).toBeLessThanOrEqual(1000 + SLOW_AFTER_MS + SLOW_POLL_MS);
    expect(firstSlow(new NetSlowDetector(), 0, 0)).toBeNull();
  });

  it("phản hồi về trong ngưỡng (độ trễ xấu bình thường ~1 giây): không báo", () => {
    const d = new NetSlowDetector();
    d.poll(0);
    d.noteSend(500);
    expect(firstSlow(d, 500, 1500)).toBeNull();
    d.noteInbound();
    expect(firstSlow(d, 1500, 20_000)).toBeNull();
  });

  it("đang đi liên tục (gửi input 20 lần / giây, patch về đều): không bao giờ báo, dù chạy 60 giây", () => {
    const d = new NetSlowDetector();
    let slow = false;
    for (let t = 0; t < 60_000; t += 50) {
      d.noteSend(t);
      if (t % 100 === 0) d.noteInbound(); // patch về ~10 lần / giây (chậm hơn input)
      if (t % SLOW_POLL_MS === 0 && d.poll(t)) slow = true;
    }
    expect(slow).toBe(false);
  });

  it("đang đi mà mạng đứng: input vẫn gửi nhưng không patch nào về -> báo chậm ~2,5 giây sau lần gửi đầu, KHÔNG bị lần gửi sau đẩy mốc đi", () => {
    const d = new NetSlowDetector();
    d.poll(0);
    let first: number | null = null;
    for (let t = 1000; t <= 8000; t += 50) {
      d.noteSend(t); // mạng đứng: lần gửi sau không đặt lại mốc chờ
      if (t % SLOW_POLL_MS === 0 && d.poll(t) && first === null) first = t;
    }
    expect(first).not.toBeNull();
    expect(first!).toBeLessThanOrEqual(1000 + SLOW_AFTER_MS + SLOW_POLL_MS);
  });

  it("tin về lại thì chip TẮT, nhưng giữ tối thiểu SLOW_MIN_SHOW_MS để kịp đọc", () => {
    const d = new NetSlowDetector();
    d.poll(0);
    d.noteSend(0);
    const t0 = firstSlow(d, 0, 10_000)!;
    d.noteInbound();
    expect(d.poll(t0 + SLOW_POLL_MS)).toBe(true); // vừa hiện chưa đủ lâu
    expect(d.poll(t0 + SLOW_MIN_SHOW_MS + SLOW_POLL_MS)).toBe(false);
    expect(firstSlow(d, t0 + 2000, t0 + 30_000)).toBeNull();
  });

  it("tab ẩn / máy treo / luồng chính bị chặn (poll cách quá xa): bỏ mốc chờ cũ, không báo nhầm lúc quay lại", () => {
    const d = new NetSlowDetector();
    d.poll(0);
    d.noteSend(500);
    // 5 phút sau mới có nhịp kế (tab ẩn): chưa có bằng chứng gì về mạng
    expect(d.poll(300_000)).toBe(false);
    expect(d.poll(300_000 + SLOW_POLL_MS)).toBe(false);
  });

  it("luồng chính bị chặn > SLOW_STALE_POLL_MS GIỮA lúc ping kẹt: quãng chặn không tính, nhưng vẫn báo sau SLOW_AFTER_MS kể từ lúc chạy lại (không mất mốc chờ)", () => {
    const d = new NetSlowDetector();
    d.poll(0);
    d.noteSend(100); // ping duy nhất (nhịp tim không gửi ping mới khi chưa có pong)
    expect(firstSlow(d, 500, 1000)).toBeNull(); // chưa đủ ngưỡng
    // luồng chính bị chặn 3 giây: poll kế cách xa hơn SLOW_STALE_POLL_MS
    const back = 1000 + 3000;
    expect(d.poll(back)).toBe(false); // không báo nhầm ngay lúc quay lại
    const t = firstSlow(d, back + SLOW_POLL_MS, back + 20_000);
    expect(t).not.toBeNull(); // mạng vẫn đứng: PHẢI báo (trước đây mốc bị xoá và chip không bao giờ hiện)
    expect(t!).toBeGreaterThan(back + SLOW_AFTER_MS);
    expect(t!).toBeLessThanOrEqual(back + SLOW_AFTER_MS + SLOW_POLL_MS);
  });

  it("luồng chính bị chặn rồi tin về lại (pong / patch): không báo", () => {
    const d = new NetSlowDetector();
    d.poll(0);
    d.noteSend(100);
    expect(d.poll(5000)).toBe(false);
    d.noteInbound(); // tin dồn trong bộ đệm socket tới ngay sau quãng chặn
    expect(firstSlow(d, 5000 + SLOW_POLL_MS, 60_000)).toBeNull();
  });

  it("sau reset thì sạch; thời gian hỏng (NaN) không báo", () => {
    const d = new NetSlowDetector();
    d.poll(0);
    d.noteSend(0);
    firstSlow(d, 0, 10_000);
    d.reset();
    expect(d.poll(10_500)).toBe(false);
    expect(d.poll(Number.NaN)).toBe(false);
  });
});

function fakeRoom() {
  const sent: Array<[string, unknown]> = [];
  const stateCbs: Array<() => void> = [];
  const msgCbs = new Map<string, Array<(m: unknown) => void>>();
  const room: NetSlowRoom = {
    send: (type, message) => {
      sent.push([type, message]);
    },
    onStateChange: (cb) => {
      stateCbs.push(cb);
    },
    onMessage: (type, cb) => {
      const l = msgCbs.get(type) ?? [];
      l.push(cb as (m: unknown) => void);
      msgCbs.set(type, l);
    },
  };
  return {
    room,
    sent,
    patch: () => stateCbs.forEach((f) => f()),
    pong: () => msgCbs.get("pong")?.forEach((f) => f({ t: 1 })),
  };
}

function harness() {
  let now = 10_000;
  const timers = new Map<number, () => void>();
  let id = 1;
  const calls: boolean[] = [];
  const resumedFlags: boolean[] = [];
  const fr = fakeRoom();
  const mon = new NetSlowMonitor({
    room: fr.room,
    onChange: (s, resumed) => {
      calls.push(s);
      resumedFlags.push(resumed);
    },
    now: () => now,
    setInterval: (fn) => {
      timers.set(id, fn);
      return id++;
    },
    clearInterval: (i) => {
      timers.delete(i as number);
    },
  });
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += SLOW_POLL_MS) {
      now += SLOW_POLL_MS;
      timers.forEach((f) => f());
    }
  };
  return { fr, mon, calls, resumedFlags, advance, timers, setNow: (n: number) => (now = n) };
}

describe("NetSlowMonitor", () => {
  it("đếm đúng ping / input đã gửi (tin khác không tính), vẫn gửi nguyên vẹn tới phòng", () => {
    const h = harness();
    h.mon.start();
    h.fr.room.send("chat", { text: "xin chào" });
    h.fr.room.send("ping", { t: 1 });
    h.fr.room.send("input", { seq: 1, dx: 1, dy: 0 });
    expect(h.fr.sent.map((s) => s[0])).toEqual(["chat", "ping", "input"]);
    h.mon.stop();
  });

  it("chat / cast không đặt mốc chờ: gửi tin khác mà không có gì về không bị báo nhầm", () => {
    const h = harness();
    h.mon.start();
    h.advance(1000);
    h.fr.room.send("chat", { text: "a" });
    h.fr.room.send("cast", { slot: 1, angle: 0 });
    h.advance(20_000);
    expect(h.calls).toEqual([]);
    h.mon.stop();
  });

  it("máy chủ CŨ không trả pong (chưa từng nhận pong): ping không đặt mốc chờ, không báo nhầm khi phòng lặng im", () => {
    const h = harness();
    h.mon.start();
    for (let i = 0; i < 6; i++) {
      h.fr.room.send("ping", { t: i });
      h.advance(5000);
    }
    expect(h.calls).toEqual([]);
    expect(h.mon.isSlow()).toBe(false);
    h.mon.stop();
  });

  it("ping không có pong: chip hiện ~2,5 giây sau, pong về thì tắt (sau thời gian hiện tối thiểu)", () => {
    const h = harness();
    h.mon.start();
    h.advance(1000);
    h.fr.pong(); // máy chủ hiểu ping (đã từng trả pong)
    h.fr.room.send("ping", { t: 1 });
    h.advance(2000);
    expect(h.calls).toEqual([]); // 2 giây: chưa
    h.advance(1000);
    expect(h.calls).toEqual([true]);
    expect(h.mon.isSlow()).toBe(true);
    h.fr.pong();
    h.advance(SLOW_MIN_SHOW_MS + 1000);
    expect(h.calls).toEqual([true, false]);
    expect(h.mon.isSlow()).toBe(false);
    h.mon.stop();
  });

  it("nhịp tim chỉ gửi MỘT ping rồi chờ pong; luồng chính bị chặn 3 giây giữa lúc mạng đứng: chip vẫn hiện (E2E đêm 23/11, e2e:nhip-tim Ca 6)", () => {
    const h = harness();
    h.mon.start();
    h.advance(1000);
    h.fr.pong(); // máy chủ hiểu ping
    h.fr.room.send("ping", { t: 1 }); // ping kẹt: không còn ping nào gửi thêm cho tới khi có pong
    h.advance(500);
    // luồng chính bị chặn 3 giây (các hẹn giờ không chạy), rồi chạy lại
    h.setNow(10_000 + 1000 + 500 + 3000);
    h.advance(SLOW_POLL_MS);
    expect(h.calls).toEqual([]); // vừa quay lại: chưa có bằng chứng
    h.advance(SLOW_AFTER_MS + SLOW_POLL_MS);
    expect(h.calls).toEqual([true]);
    expect(h.mon.isSlow()).toBe(true);
    h.mon.stop();
  });

  it("đang đi, patch state dừng về: chip hiện; patch về lại thì tắt", () => {
    const h = harness();
    h.mon.start();
    for (let i = 0; i < 20; i++) {
      h.fr.room.send("input", { seq: i, dx: 1, dy: 0 });
      h.fr.patch();
      h.advance(100);
    }
    expect(h.calls).toEqual([]);
    for (let i = 20; i < 100; i++) {
      h.fr.room.send("input", { seq: i, dx: 1, dy: 0 }); // mạng đứng
      h.advance(50);
    }
    expect(h.calls).toEqual([true]);
    h.fr.patch();
    h.advance(3000);
    expect(h.calls).toEqual([true, false]);
    h.mon.stop();
  });

  it("stop(): tắt chip đang hiện, dừng hẹn giờ, trả send nguyên bản (và KHÔNG đè send do bên khác thay sau khi bọc)", () => {
    const h = harness();
    const original = h.fr.room.send;
    h.mon.start();
    expect(h.fr.room.send).not.toBe(original);
    h.fr.pong(); // máy chủ hiểu ping
    h.fr.room.send("ping", { t: 1 });
    h.advance(4000);
    expect(h.mon.isSlow()).toBe(true);
    h.mon.stop();
    expect(h.calls).toEqual([true, false]);
    expect(h.timers.size).toBe(0);
    expect(h.fr.room.send).toBe(original);

    const h2 = harness();
    h2.mon.start();
    const replaced = vi.fn();
    h2.fr.room.send = replaced;
    h2.mon.stop();
    expect(h2.fr.room.send).toBe(replaced);
  });

  it("sau stop() không còn gọi onChange", () => {
    const h = harness();
    h.mon.start();
    h.mon.stop();
    h.mon.tick();
    expect(h.calls).toEqual([]);
  });

  it("chip tắt vì tín hiệu về lại: onChange(false, resumed = true) để báo 'Đã kết nối lại'; tắt vì stop() thì resumed = false (không báo)", () => {
    const h = harness();
    h.mon.start();
    h.fr.pong();
    h.fr.room.send("ping", { t: 1 });
    h.advance(SLOW_AFTER_MS + 1000);
    expect(h.calls).toEqual([true]);
    expect(h.resumedFlags).toEqual([false]); // lúc bật: resumed = false
    h.fr.pong();
    h.advance(SLOW_MIN_SHOW_MS + 1000);
    expect(h.calls).toEqual([true, false]);
    expect(h.resumedFlags).toEqual([false, true]); // tín hiệu về lại
    const h2 = harness();
    h2.mon.start();
    h2.fr.pong();
    h2.fr.room.send("ping", { t: 1 });
    h2.advance(SLOW_AFTER_MS + 1000);
    h2.mon.stop();
    expect(h2.resumedFlags).toEqual([false, false]); // dừng (rớt socket): không phải "đã kết nối lại"
  });
});
