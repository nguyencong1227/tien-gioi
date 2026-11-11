// Giám sát vận hành (M4 3.3): phân vị tick, hàng đợi ghi, ngưỡng / cảnh báo, ảnh chụp từ Hub, văn bản Prometheus và
// `/metrics` qua máy chủ Express THẬT (cổng ngẫu nhiên): 404 khi tắt, 401 khi sai token, token trên URL không được nhận.
import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { TICK_MS } from "@tien-gioi/shared";
import { Hub } from "./hub";
import {
  ALERT_REMIND_MS,
  DEFAULT_THRESHOLDS,
  LOOP_LAG_WARN_MS,
  Monitor,
  TickStats,
  WriteGauge,
  alertsOf,
  collectMetrics,
  metricsTokenOf,
  mountMetrics,
  renderPrometheus,
  thresholdsOf,
  type MetricsSnapshot,
} from "./metrics";
import { startupWarnings } from "./startup";
import { addPlayer, makeWorld } from "./systems/test-helpers";

describe("TickStats", () => {
  it("rỗng: toàn số 0", () => {
    expect(new TickStats().summary()).toEqual({
      window: 0,
      p50: 0,
      p95: 0,
      max: 0,
      total: 0,
      overrun: 0,
    });
  });

  it("phân vị đúng trên 1..100 ms (p50 = 50, p95 = 95, max = 100)", () => {
    const t = new TickStats();
    for (let i = 100; i >= 1; i--) t.record(i); // thứ tự ghi không ảnh hưởng
    const s = t.summary();
    expect(s.window).toBe(100);
    expect(s.p50).toBe(50);
    expect(s.p95).toBe(95);
    expect(s.max).toBe(100);
  });

  it("cửa sổ trượt: chỉ giữ `capacity` tick gần nhất, tổng vẫn đếm hết", () => {
    const t = new TickStats(10);
    for (let i = 1; i <= 25; i++) t.record(i); // giữ 16..25
    const s = t.summary();
    expect(s.window).toBe(10);
    expect(s.total).toBe(25);
    expect(s.max).toBe(25);
    expect(s.p50).toBe(20);
    // đỉnh cũ đã trôi khỏi cửa sổ
    const u = new TickStats(5);
    u.record(500);
    for (let i = 0; i < 5; i++) u.record(1);
    expect(u.summary().max).toBe(1);
    expect(u.summary().overrun).toBe(1); // nhưng bộ đếm tích luỹ vẫn nhớ
  });

  it("overrun chỉ đếm tick dài hơn một nhịp; giá trị xấu (NaN, âm, vô cực) bị bỏ qua", () => {
    const t = new TickStats();
    t.record(TICK_MS); // đúng một nhịp: chưa tính
    t.record(TICK_MS + 0.1);
    t.record(NaN);
    t.record(-1);
    t.record(Infinity);
    const s = t.summary();
    expect(s.overrun).toBe(1);
    expect(s.total).toBe(2);
    expect(s.window).toBe(2);
  });
});

describe("WriteGauge", () => {
  it("đếm lần ghi đang chờ, tuổi lâu nhất, thất bại; kết thúc hai lần chỉ tính một", () => {
    const g = new WriteGauge();
    expect(g.summary(1000)).toEqual({ inflight: 0, oldestAgeMs: 0, started: 0, failed: 0 });
    const a = g.begin(1000);
    const b = g.begin(1500);
    expect(g.summary(2000)).toEqual({ inflight: 2, oldestAgeMs: 1000, started: 2, failed: 0 });
    a(true);
    a(false); // lần gọi thứ hai bị bỏ qua: không làm tăng `failed`
    expect(g.summary(2000)).toEqual({ inflight: 1, oldestAgeMs: 500, started: 2, failed: 0 });
    b(false);
    expect(g.summary(2000)).toEqual({ inflight: 0, oldestAgeMs: 0, started: 2, failed: 1 });
  });
});

describe("cấu hình từ môi trường", () => {
  it("METRICS_TOKEN: không đặt = tắt; ngắn = tắt kèm cảnh báo; đủ dài = bật (cắt khoảng trắng)", () => {
    expect(metricsTokenOf({})).toEqual({ token: null, warnings: [] });
    expect(metricsTokenOf({ METRICS_TOKEN: "  " })).toEqual({ token: null, warnings: [] });
    const short = metricsTokenOf({ METRICS_TOKEN: "abc123" });
    expect(short.token).toBeNull();
    expect(short.warnings[0]).toContain("TẮT");
    const ok = "x".repeat(24);
    expect(metricsTokenOf({ METRICS_TOKEN: ` ${ok}\n` })).toEqual({ token: ok, warnings: [] });
  });

  it("ngưỡng: mặc định; giá trị hợp lệ được nhận; không phải số dương bị bỏ qua kèm cảnh báo", () => {
    expect(thresholdsOf({})).toEqual({ value: DEFAULT_THRESHOLDS, warnings: [] });
    expect(
      thresholdsOf({ TICK_WARN_MS: "12.5", WRITE_WARN_PENDING: "7", WRITE_WARN_AGE_S: "9" }).value,
    ).toEqual({ tickWarnMs: 12.5, writeWarnPending: 7, writeWarnAgeS: 9 });
    const bad = thresholdsOf({
      TICK_WARN_MS: "0",
      WRITE_WARN_PENDING: "abc",
      WRITE_WARN_AGE_S: "-3",
    });
    expect(bad.value).toEqual(DEFAULT_THRESHOLDS);
    expect(bad.warnings).toHaveLength(3);
  });

  it("cảnh báo cấu hình đi vào startupWarnings", () => {
    const w = startupWarnings({ METRICS_TOKEN: "ngan", TICK_WARN_MS: "x" });
    expect(w.some((l) => l.includes("METRICS_TOKEN"))).toBe(true);
    expect(w.some((l) => l.includes("TICK_WARN_MS"))).toBe(true);
  });
});

/** Hub có hai phòng giả: Lạc Hà 3 người (tick đã ghi) và một phòng thứ hai. */
function twoRoomHub() {
  const hub = new Hub();
  const a = makeWorld(undefined, hub);
  const b = makeWorld(undefined, hub);
  a.w.roomId = "roomA";
  b.w.roomId = "roomB";
  for (const sid of ["s1", "s2", "s3"]) addPlayer(a.w, sid);
  addPlayer(b.w, "s4");
  b.w.ghosts.add("s4");
  for (let i = 1; i <= 20; i++) a.w.tickStats.record(i);
  for (let i = 0; i < 20; i++) b.w.tickStats.record(2);
  return { hub, a, b };
}

const probe = {
  now: 5_000,
  uptimeS: 60,
  store: "file",
  rssBytes: 1000,
  heapUsedBytes: 500,
  loopLagP99Ms: 1.5,
};

describe("collectMetrics", () => {
  it("gom phòng, người chơi, tick của từng phòng và p95 phòng tệ nhất", () => {
    const { hub } = twoRoomHub();
    hub.writes.begin(4_000);
    const s = collectMetrics(hub, probe);
    expect(s.players).toBe(4);
    expect(s.rooms.map((r) => [r.room, r.players, r.ghosts])).toEqual([
      ["roomA", 3, 0],
      ["roomB", 1, 1],
    ]);
    expect(s.rooms[0].tick.p95).toBe(19); // 20 mẫu 1..20: ceil(0.95 * 20) = 19
    expect(s.worstTickP95Ms).toBe(19);
    expect(s.rooms.every((r) => r.dungeon === false && r.map.length > 0)).toBe(true);
    expect(s.writes).toMatchObject({ inflight: 1, oldestAgeMs: 1000, started: 1 });
    expect(s.process).toEqual({ rssBytes: 1000, heapUsedBytes: 500, loopLagP99Ms: 1.5 });
  });

  it("phòng đã đóng (World.dispose) không còn trong số đo", () => {
    const { hub, b } = twoRoomHub();
    b.w.dispose();
    expect(collectMetrics(hub, probe).rooms.map((r) => r.room)).toEqual(["roomA"]);
  });
});

describe("renderPrometheus", () => {
  it("có số đo chính, nhãn phòng / bản đồ và thoát ký tự đặc biệt trong nhãn", () => {
    const { hub, a } = twoRoomHub();
    a.w.roomId = 'ro"om\\x\n';
    const text = renderPrometheus(collectMetrics(hub, probe));
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain("tiengioi_players_online 4");
    expect(text).toContain("tiengioi_rooms 2");
    expect(text).toContain("tiengioi_writes_inflight 0");
    expect(text).toContain('tiengioi_store_info{kind="file"} 1');
    expect(text).toContain('quantile="0.95"} 19');
    expect(text).toContain('room="ro\\"om\\\\x\\n"'); // thoát " \ và xuống dòng
    // mỗi dòng số đo là một dòng (nhãn không chèn thêm dòng)
    for (const line of text.split("\n").filter((l) => l && !l.startsWith("#")))
      expect(line).toMatch(/^[a-z0-9_]+(\{.*\})? -?[0-9.e+]+$/);
  });
});

const healthy = (over: Partial<MetricsSnapshot> = {}): MetricsSnapshot => {
  const { hub } = twoRoomHub();
  return { ...collectMetrics(hub, probe), ...over };
};

describe("alertsOf", () => {
  it("khoẻ: không cảnh báo", () => {
    expect(alertsOf(healthy(), DEFAULT_THRESHOLDS)).toEqual([]);
  });

  it("tick, hàng đợi, tuổi hàng đợi, trễ vòng lặp: mỗi cái một cảnh báo riêng", () => {
    const base = healthy();
    const keys = (s: MetricsSnapshot) => alertsOf(s, DEFAULT_THRESHOLDS).map((a) => a.key);
    expect(keys({ ...base, worstTickP95Ms: 30 })).toEqual(["tick"]);
    expect(keys({ ...base, writes: { ...base.writes, inflight: 201 } })).toEqual([
      "writes_pending",
    ]);
    expect(keys({ ...base, writes: { ...base.writes, oldestAgeMs: 31_000 } })).toEqual([
      "writes_age",
    ]);
    expect(
      keys({ ...base, process: { ...base.process, loopLagP99Ms: LOOP_LAG_WARN_MS + 1 } }),
    ).toEqual(["loop_lag"]);
    // đúng ngưỡng thì chưa cảnh báo
    expect(keys({ ...base, worstTickP95Ms: DEFAULT_THRESHOLDS.tickWarnMs })).toEqual([]);
  });

  it("thông điệp tick nêu phòng tệ nhất", () => {
    const base = healthy();
    const a = alertsOf({ ...base, worstTickP95Ms: 40 }, { ...DEFAULT_THRESHOLDS, tickWarnMs: 10 });
    expect(a[0].message).toContain("roomA");
  });
});

describe("Monitor.check", () => {
  it("in một lần khi vi phạm, nhắc lại sau ALERT_REMIND_MS, in [ĐÃ ỔN] khi hết", () => {
    const hub = new Hub();
    const w = makeWorld(undefined, hub).w;
    w.roomId = "r1";
    let now = 1_000_000;
    const lines: string[] = [];
    const m = new Monitor(hub, { store: "file", log: (l) => lines.push(l), now: () => now });

    for (let i = 0; i < 100; i++) w.tickStats.record(40); // p95 = 40 ms > 25
    expect(m.check().map((a) => a.key)).toEqual(["tick"]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[CẢNH BÁO]");

    now += 10_000;
    m.check();
    expect(lines).toHaveLength(1); // chưa tới hạn nhắc lại: im lặng

    now += ALERT_REMIND_MS;
    m.check();
    expect(lines).toHaveLength(2); // nhắc lại

    for (let i = 0; i < 1200; i++) w.tickStats.record(1); // cửa sổ trượt thay hết mẫu xấu
    expect(m.check()).toEqual([]);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain("[ĐÃ ỔN]");
    m.check();
    expect(lines).toHaveLength(3); // đã ổn thì không in thêm
  });

  it("hàng đợi ghi kẹt (lần ghi chờ quá lâu) gây cảnh báo; ghi xong thì hết", () => {
    const hub = new Hub();
    let now = 5_000_000;
    const lines: string[] = [];
    const m = new Monitor(hub, {
      store: "pg",
      thresholds: { ...DEFAULT_THRESHOLDS, writeWarnAgeS: 5 },
      log: (l) => lines.push(l),
      now: () => now,
    });
    const done = hub.writes.begin(now);
    now += 6_000;
    expect(m.check().map((a) => a.key)).toEqual(["writes_age"]);
    done(true);
    expect(m.check()).toEqual([]);
    expect(lines.map((l) => l.slice(0, 10))).toEqual(["[CẢNH BÁO]", "[ĐÃ ỔN] wr"]);
  });

  it("start() / stop(): không giữ tiến trình sống, đo được độ trễ vòng lặp", async () => {
    const hub = new Hub();
    const m = new Monitor(hub, { store: "file", log: () => {} });
    m.start(20);
    m.start(20); // gọi hai lần không tạo hai bộ đếm
    await new Promise((r) => setTimeout(r, 90));
    expect(m.loopLagP99Ms).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(m.loopLagP99Ms)).toBe(true);
    m.stop();
    m.stop();
  });
});

// ---- /metrics qua Express thật
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((c) => c()));
});

async function serve(env: NodeJS.ProcessEnv) {
  const { hub } = twoRoomHub();
  const monitor = new Monitor(hub, { store: "file", log: () => {} });
  const app = express();
  const mounted = mountMetrics(app, { env, monitor });
  // Như index.ts: trang tĩnh bắt mọi đường còn lại; /metrics phải đứng trước nó
  app.get("*", (_req, res) => res.send("INDEX"));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  closers.push(() => new Promise<void>((r) => server.close(() => r())));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, mounted };
}

const TOKEN = "t".repeat(32);
const bearer = (t: string) => ({ headers: { authorization: `Bearer ${t}` } });

describe("GET /metrics", () => {
  it("không đặt METRICS_TOKEN: 404 JSON (không rơi vào trang tĩnh), không lộ số đo", async () => {
    const s = await serve({});
    expect(s.mounted.enabled).toBe(false);
    const r = await fetch(`${s.base}/metrics`, bearer(TOKEN));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "metrics_off" });
  });

  it("token ngắn bị coi là chưa đặt: vẫn 404 kể cả khi gửi đúng chuỗi ngắn đó", async () => {
    const s = await serve({ METRICS_TOKEN: "ngan" });
    expect((await fetch(`${s.base}/metrics`, bearer("ngan"))).status).toBe(404);
  });

  it("thiếu / sai token, sai lược đồ, token trên URL: 401 và không có số đo", async () => {
    const s = await serve({ METRICS_TOKEN: TOKEN });
    expect(s.mounted.enabled).toBe(true);
    const cases: Array<[string, RequestInit | undefined]> = [
      ["/metrics", undefined],
      ["/metrics", bearer("sai-token-sai-token-sai")],
      ["/metrics", bearer(TOKEN + "x")],
      ["/metrics", { headers: { authorization: TOKEN } }],
      ["/metrics", { headers: { authorization: `Basic ${TOKEN}` } }],
      [`/metrics?token=${TOKEN}`, undefined],
    ];
    for (const [p, init] of cases) {
      const r = await fetch(s.base + p, init);
      expect(r.status, p).toBe(401);
      expect(r.headers.get("www-authenticate")).toBe("Bearer");
      expect(await r.text()).not.toContain("tiengioi_");
    }
  });

  it("đúng token: văn bản Prometheus, no-store; ?format=json trả ảnh chụp", async () => {
    const s = await serve({ METRICS_TOKEN: TOKEN });
    const r = await fetch(`${s.base}/metrics`, bearer(TOKEN));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/plain");
    expect(r.headers.get("cache-control")).toBe("no-store");
    const text = await r.text();
    expect(text).toContain("tiengioi_players_online 4");
    const j = (await (
      await fetch(`${s.base}/metrics?format=json`, bearer(TOKEN))
    ).json()) as MetricsSnapshot;
    expect(j.players).toBe(4);
    expect(j.rooms).toHaveLength(2);
    expect(j.store).toBe("file");
  });
});
