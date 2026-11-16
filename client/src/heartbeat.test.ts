import { describe, expect, it, vi } from "vitest";
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MSG,
  HEARTBEAT_TIMEOUT_MS,
  NET_BEAT_MS,
  NET_SILENCE_GHOST_MS,
  RESUME_TIMEOUT_MS,
} from "@tien-gioi/shared";
import {
  HeartbeatController,
  type DocumentVisibilityLike,
  type HeartbeatRoom,
  type SoundController,
} from "./heartbeat";

interface MockHarness {
  currentTime: number;
  timers: Map<number, { fn: () => void; ms: number; interval: boolean }>;
  nextTimerId: number;
  now: () => number;
  setInterval: (fn: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  advanceTime: (ms: number) => void;
}

function createMockHarness(startTime = 10000): MockHarness {
  let currentTime = startTime;
  let nextTimerId = 1;
  const timers = new Map<number, { fn: () => void; ms: number; interval: boolean }>();

  const harness: MockHarness = {
    get currentTime() {
      return currentTime;
    },
    timers,
    get nextTimerId() {
      return nextTimerId;
    },
    now: () => currentTime,
    setInterval: (fn, ms) => {
      const id = nextTimerId++;
      timers.set(id, { fn, ms, interval: true });
      return id;
    },
    clearInterval: (id) => {
      timers.delete(id);
    },
    setTimeout: (fn, ms) => {
      const id = nextTimerId++;
      timers.set(id, { fn, ms, interval: false });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    advanceTime: (ms: number) => {
      currentTime += ms;
      // Chạy các timers đã đến hạn
      for (const [id, t] of Array.from(timers.entries())) {
        t.fn();
        if (!t.interval) {
          timers.delete(id);
        }
      }
    },
  };

  return harness;
}

function createMockRoom(): {
  room: HeartbeatRoom;
  sent: Array<{ type: string; message: any }>;
  messageHandlers: Map<string, (msg: any) => void>;
} {
  const sent: Array<{ type: string; message: any }> = [];
  const messageHandlers = new Map<string, (msg: any) => void>();

  const room: HeartbeatRoom = {
    send(type: string, message: any) {
      sent.push({ type, message });
    },
    onMessage(type: string, handler: (msg: any) => void) {
      messageHandlers.set(type, handler);
      return () => {
        messageHandlers.delete(type);
      };
    },
    connection: {
      isOpen: true,
    },
  };

  return { room, sent, messageHandlers };
}

function createMockDoc(): {
  doc: DocumentVisibilityLike;
  listeners: Map<string, Set<EventListener>>;
  triggerVisibilityChange: (hidden: boolean) => void;
} {
  const listeners = new Map<string, Set<EventListener>>();
  let currentHidden = false;

  const doc: DocumentVisibilityLike = {
    get hidden() {
      return currentHidden;
    },
    get visibilityState() {
      return currentHidden ? "hidden" : "visible";
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };

  const triggerVisibilityChange = (hidden: boolean) => {
    currentHidden = hidden;
    const ev = new Event("visibilitychange");
    listeners.get("visibilitychange")?.forEach((fn) => fn(ev));
  };

  return { doc, listeners, triggerVisibilityChange };
}

describe("HeartbeatController", () => {
  it("khởi động gửi ping định kỳ và ghi nhận supported khi nhận pong", () => {
    const harness = createMockHarness();
    const { room, sent, messageHandlers } = createMockRoom();
    const { doc } = createMockDoc();
    const onDead = vi.fn();

    const ctrl = new HeartbeatController({
      room,
      onDead,
      doc,
      now: harness.now,
      setInterval: harness.setInterval,
      clearInterval: harness.clearInterval,
      setTimeout: harness.setTimeout,
      clearTimeout: harness.clearTimeout,
    });

    ctrl.start();
    expect(messageHandlers.has(HEARTBEAT_MSG.pong)).toBe(true);
    expect(harness.timers.size).toBe(1);

    // Gửi ping đầu tiên ngay khi khởi động
    expect(sent.length).toBe(1);
    expect(sent[0]).toEqual({ type: HEARTBEAT_MSG.ping, message: { t: 10000 } });
    expect(ctrl.state.supported).toBe(false);
    expect(ctrl.state.pendingSince).toBe(10000);

    // Server trả pong
    messageHandlers.get(HEARTBEAT_MSG.pong)!({ t: 10000 });
    expect(ctrl.state.supported).toBe(true);
    expect(ctrl.state.pendingSince).toBe(null);

    // Chu kỳ tiếp theo (sau 5s): gửi ping tiếp theo thành công
    harness.advanceTime(HEARTBEAT_INTERVAL_MS);
    expect(sent.length).toBe(2);
    expect(sent[1]).toEqual({ type: HEARTBEAT_MSG.ping, message: { t: 15000 } });

    ctrl.stop();
  });

  it("phát hiện kết nối chết ở tiền cảnh khi quá HEARTBEAT_TIMEOUT_MS mà không nhận pong", () => {
    const harness = createMockHarness();
    const { room, sent, messageHandlers } = createMockRoom();
    const { doc } = createMockDoc();
    const onDead = vi.fn();

    const ctrl = new HeartbeatController({
      room,
      onDead,
      doc,
      now: harness.now,
      setInterval: harness.setInterval,
      clearInterval: harness.clearInterval,
      setTimeout: harness.setTimeout,
      clearTimeout: harness.clearTimeout,
    });

    ctrl.start();

    // Lần 1: gửi ping tại t=10000 và nhận pong để xác nhận supported = true
    messageHandlers.get(HEARTBEAT_MSG.pong)!({ t: 10000 });
    expect(ctrl.state.supported).toBe(true);

    // Lần 2: gửi ping tại t=15000 nhưng server không trả pong
    harness.advanceTime(HEARTBEAT_INTERVAL_MS);
    expect(sent.length).toBe(2);
    expect(ctrl.state.pendingSince).toBe(15000);

    // Sau thêm 5s (t=20000): chờ 5s <= HEARTBEAT_TIMEOUT_MS (8s) -> chưa chết
    harness.advanceTime(HEARTBEAT_INTERVAL_MS);
    expect(onDead).not.toHaveBeenCalled();

    // Sau thêm 5s (t=25000): chờ 10s > HEARTBEAT_TIMEOUT_MS (8s) -> chết!
    harness.advanceTime(HEARTBEAT_INTERVAL_MS);
    expect(onDead).toHaveBeenCalledTimes(1);
    expect(harness.timers.size).toBe(0); // Dọn timer sau khi trigger dead
  });

  it("không bao giờ tự ngắt kết nối nếu server chưa từng hỗ trợ nhịp tim (supported = false)", () => {
    const harness = createMockHarness();
    const { room, sent } = createMockRoom();
    const { doc } = createMockDoc();
    const onDead = vi.fn();

    const ctrl = new HeartbeatController({
      room,
      onDead,
      doc,
      now: harness.now,
      setInterval: harness.setInterval,
      clearInterval: harness.clearInterval,
      setTimeout: harness.setTimeout,
      clearTimeout: harness.clearTimeout,
    });

    ctrl.start();

    // Gửi ping nhưng server cũ không trả pong
    harness.advanceTime(HEARTBEAT_INTERVAL_MS);
    expect(sent.length).toBe(1);
    expect(ctrl.state.supported).toBe(false);

    // Trôi qua 30 giây (6 chu kỳ)
    for (let i = 0; i < 6; i++) {
      harness.advanceTime(HEARTBEAT_INTERVAL_MS);
    }

    expect(onDead).not.toHaveBeenCalled();
    ctrl.stop();
  });

  it("xuống nền: tạm dừng âm thanh và dừng vòng lặp ping định kỳ", () => {
    const harness = createMockHarness();
    const { room } = createMockRoom();
    const { doc, triggerVisibilityChange } = createMockDoc();
    const sound: SoundController = {
      suspend: vi.fn(),
      resume: vi.fn(),
    };
    const onDead = vi.fn();

    const ctrl = new HeartbeatController({
      room,
      onDead,
      sound,
      doc,
      now: harness.now,
      setInterval: harness.setInterval,
      clearInterval: harness.clearInterval,
      setTimeout: harness.setTimeout,
      clearTimeout: harness.clearTimeout,
    });

    ctrl.start();
    expect(harness.timers.size).toBe(1);

    // Chuyển sang hidden
    triggerVisibilityChange(true);
    expect(sound.suspend).toHaveBeenCalledTimes(1);
    expect(harness.timers.size).toBe(0); // Dừng timer

    ctrl.stop();
  });

  it("quay lại tiền cảnh sau thời gian ngắn (< 2000ms): resume âm thanh và không gửi ping vội", () => {
    const harness = createMockHarness();
    const { room, sent, messageHandlers } = createMockRoom();
    const { doc, triggerVisibilityChange } = createMockDoc();
    const sound: SoundController = {
      suspend: vi.fn(),
      resume: vi.fn(),
    };
    const onDead = vi.fn();

    const ctrl = new HeartbeatController({
      room,
      onDead,
      sound,
      doc,
      now: harness.now,
      setInterval: harness.setInterval,
      clearInterval: harness.clearInterval,
      setTimeout: harness.setTimeout,
      clearTimeout: harness.clearTimeout,
    });

    ctrl.start();
    // Nhận pong đầu tiên
    messageHandlers.get(HEARTBEAT_MSG.pong)!({ t: 10000 });
    expect(sent.length).toBe(1);

    // Xuống nền 1.5s (< RESUME_CHECK_AFTER_MS 2000ms)
    triggerVisibilityChange(true);
    harness.advanceTime(1500);

    // Quay lại tiền cảnh
    triggerVisibilityChange(false);
    expect(sound.resume).toHaveBeenCalledTimes(1);
    expect(sent.length).toBe(1); // Không gửi thêm ping ngay
    expect(harness.timers.size).toBe(1); // Bật lại timer tiền cảnh

    ctrl.stop();
  });

  it("quay lại tiền cảnh sau thời gian dài (>= 2000ms): gửi ping ngay và kích hoạt onDead sau RESUME_TIMEOUT_MS nếu không có pong", () => {
    const harness = createMockHarness();
    const { room, sent, messageHandlers } = createMockRoom();
    const { doc, triggerVisibilityChange } = createMockDoc();
    const sound: SoundController = {
      suspend: vi.fn(),
      resume: vi.fn(),
    };
    const onDead = vi.fn();

    const ctrl = new HeartbeatController({
      room,
      onDead,
      sound,
      doc,
      now: harness.now,
      setInterval: harness.setInterval,
      clearInterval: harness.clearInterval,
      setTimeout: harness.setTimeout,
      clearTimeout: harness.clearTimeout,
    });

    ctrl.start();

    // Nhận pong đầu tiên để supported = true
    messageHandlers.get(HEARTBEAT_MSG.pong)!({ t: 10000 });
    expect(ctrl.state.supported).toBe(true);

    // Xuống nền trong 3 giây (>= RESUME_CHECK_AFTER_MS 2000ms)
    triggerVisibilityChange(true);
    harness.advanceTime(3000);

    // Quay lại tiền cảnh
    triggerVisibilityChange(false);
    expect(sound.resume).toHaveBeenCalledTimes(1);
    // Phải gửi ping NGAY LẬP TỨC
    expect(sent.length).toBe(2);
    expect(ctrl.state.pendingSince).toBe(harness.currentTime);

    // Chờ RESUME_TIMEOUT_MS (3000ms) lố 1ms mà không nhận pong -> phát hiện chết
    harness.advanceTime(RESUME_TIMEOUT_MS + 1);
    expect(onDead).toHaveBeenCalledTimes(1);
  });

  it("quay lại tiền cảnh: nếu socket đã bị đóng ngầm (isOpen = false) thì trigger onDead ngay", () => {
    const harness = createMockHarness();
    const { room } = createMockRoom();
    const { doc, triggerVisibilityChange } = createMockDoc();
    const onDead = vi.fn();

    const ctrl = new HeartbeatController({
      room,
      onDead,
      doc,
      now: harness.now,
      setInterval: harness.setInterval,
      clearInterval: harness.clearInterval,
      setTimeout: harness.setTimeout,
      clearTimeout: harness.clearTimeout,
    });

    ctrl.start();

    // Xuống nền
    triggerVisibilityChange(true);
    harness.advanceTime(1000);

    // Socket bị ngắt kết nối ngầm khi ở nền
    room.connection!.isOpen = false;

    // Quay lại tiền cảnh
    triggerVisibilityChange(false);
    expect(onDead).toHaveBeenCalledTimes(1);
  });

  it("stop() dọn dẹp sạch sẽ tài nguyên", () => {
    const harness = createMockHarness();
    const { room, messageHandlers } = createMockRoom();
    const { doc, listeners } = createMockDoc();
    const onDead = vi.fn();

    const ctrl = new HeartbeatController({
      room,
      onDead,
      doc,
      now: harness.now,
      setInterval: harness.setInterval,
      clearInterval: harness.clearInterval,
      setTimeout: harness.setTimeout,
      clearTimeout: harness.clearTimeout,
    });

    ctrl.start();
    expect(harness.timers.size).toBe(1);
    expect(messageHandlers.has(HEARTBEAT_MSG.pong)).toBe(true);
    expect(listeners.get("visibilitychange")?.size).toBe(1);

    ctrl.stop();
    expect(harness.timers.size).toBe(0);
    expect(messageHandlers.has(HEARTBEAT_MSG.pong)).toBe(false);
    expect(listeners.get("visibilitychange")?.size).toBe(0);
  });
});

describe("HeartbeatController: nhịp 1 giây (mục 33, NET_BEAT_MS)", () => {
  function setup(intervalMs?: number) {
    const harness = createMockHarness();
    const { room, sent, messageHandlers } = createMockRoom();
    const { doc, triggerVisibilityChange } = createMockDoc();
    const onDead = vi.fn();
    const ctrl = new HeartbeatController({
      room,
      onDead,
      doc,
      intervalMs,
      now: harness.now,
      setInterval: harness.setInterval,
      clearInterval: harness.clearInterval,
      setTimeout: harness.setTimeout,
      clearTimeout: harness.clearTimeout,
    });
    ctrl.start();
    const pong = () => {
      const last = sent[sent.length - 1].message as { t: number };
      messageHandlers.get(HEARTBEAT_MSG.pong)!({ t: last.t });
    };
    return { harness, sent, ctrl, onDead, pong, triggerVisibilityChange };
  }

  it("nhịp mặc định vẫn là HEARTBEAT_INTERVAL_MS (5 giây, các test cũ), NET_BEAT_MS đủ dày cho luật im lặng của máy chủ", () => {
    expect(NET_BEAT_MS).toBeLessThan(HEARTBEAT_INTERVAL_MS);
    expect(NET_BEAT_MS * 2).toBeLessThanOrEqual(NET_SILENCE_GHOST_MS);
    const { harness, sent } = setup(); // không truyền intervalMs
    expect(sent).toHaveLength(1);
    harness.advanceTime(NET_BEAT_MS * 3);
    expect(sent).toHaveLength(1); // chưa có pong: không gửi thêm; và chưa tới nhịp 5 giây
  });

  it("ping mỗi NET_BEAT_MS kể cả khi đứng yên (pong về nhanh): 10 giây liền gửi đúng ~10 ping, không bao giờ dồn quá 1 ping / nhịp", () => {
    const { harness, sent, pong, onDead } = setup(NET_BEAT_MS);
    pong();
    for (let i = 0; i < 10; i++) {
      harness.advanceTime(NET_BEAT_MS);
      pong();
    }
    expect(sent.length).toBe(11); // 1 lúc khởi động + 10 nhịp
    const ts = sent.map((m) => (m.message as { t: number }).t);
    for (let i = 1; i < ts.length; i++) expect(ts[i] - ts[i - 1]).toBe(NET_BEAT_MS);
    expect(onDead).not.toHaveBeenCalled();
  });

  it("pong về TRỄ (RTT 1,2 giây > một nhịp): ping kế đi NGAY lúc pong về, không chờ tick kế (khoảng im lặng phía máy chủ không dài hơn RTT)", () => {
    const { harness, sent, pong } = setup(NET_BEAT_MS);
    pong(); // supported
    harness.advanceTime(NET_BEAT_MS); // tick: ping #2
    expect(sent.length).toBe(2);
    harness.advanceTime(200); // chưa có pong, đang chờ
    expect(sent.length).toBe(2);
    pong(); // pong về sau 200 ms (< một nhịp): KHÔNG gửi ngay, chờ tick
    expect(sent.length).toBe(2);
    harness.advanceTime(NET_BEAT_MS - 200); // tick: ping #3
    expect(sent.length).toBe(3);
    harness.advanceTime(NET_BEAT_MS + 200); // tick đã bỏ qua vì còn ping chờ; 1,2 giây trôi qua
    expect(sent.length).toBe(3);
    pong(); // pong về sau 1,2 giây >= một nhịp
    expect(sent.length).toBe(4); // gửi NGAY
  });

  it("còn ping chờ pong thì KHÔNG gửi dồn (mạng đứng): vẫn một ping chờ, tới HEARTBEAT_TIMEOUT_MS thì coi chết như cũ", () => {
    const { harness, sent, pong, onDead } = setup(NET_BEAT_MS);
    pong();
    harness.advanceTime(NET_BEAT_MS); // ping #2, không bao giờ có pong
    const n = sent.length;
    harness.advanceTime(HEARTBEAT_TIMEOUT_MS - 1);
    expect(sent.length).toBe(n);
    expect(onDead).not.toHaveBeenCalled();
    harness.advanceTime(NET_BEAT_MS + 1);
    expect(onDead).toHaveBeenCalledTimes(1);
  });

  it("xuống nền: KHÔNG ping (máy chủ coi im lặng = hồn lìa xác, có chủ ý); pong về lúc đang ở nền không gửi ping mới", () => {
    const { harness, sent, pong, triggerVisibilityChange } = setup(NET_BEAT_MS);
    pong();
    harness.advanceTime(NET_BEAT_MS * 2);
    const before = sent.length;
    triggerVisibilityChange(true);
    harness.advanceTime(NET_BEAT_MS * 10);
    expect(sent.length).toBe(before);
  });
});
