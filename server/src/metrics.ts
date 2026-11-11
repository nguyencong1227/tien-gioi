// Giám sát vận hành (M4 3.3, docs/TRIEN_KHAI.md mục 5): số đo tick, hàng đợi ghi, phòng / người chơi, bộ nhớ, độ trễ vòng
// lặp sự kiện; cảnh báo trong log khi vượt ngưỡng; `GET /metrics` (văn bản kiểu Prometheus hoặc `?format=json`).
//
// `/health` GIỮ NGUYÊN (công khai, client và Docker HEALTHCHECK dùng): số đo vận hành nằm sau `/metrics`, chỉ bật khi đặt
// `METRICS_TOKEN` và đòi tiêu đề `Authorization: Bearer <token>` (không nhận token trên URL vì URL đi vào log của proxy).
import { createHash, timingSafeEqual } from "node:crypto";
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import type { Express } from "express";
import { TICK_MS } from "@tien-gioi/shared";
import type { Hub } from "./hub";

// ---------------------------------------------------------------- Thống kê tick

/** Phân vị thời gian xử lý tick (ms) trong cửa sổ trượt `capacity` tick gần nhất (mặc định 1200 tick = 60 giây ở 20 tick/giây). */
export interface TickSummary {
  /** Số tick trong cửa sổ hiện tại (<= capacity) */
  window: number;
  p50: number;
  p95: number;
  max: number;
  /** Tổng số tick từ lúc phòng mở */
  total: number;
  /** Tổng số tick chạy lâu hơn một nhịp (`TICK_MS`): bước mô phỏng không kịp trong khe thời gian của nó */
  overrun: number;
}

export class TickStats {
  private readonly buf: Float64Array;
  private n = 0; // số mẫu đang giữ
  private head = 0; // ô sẽ ghi tiếp
  private total = 0;
  private overrun = 0;

  constructor(readonly capacity = 1200) {
    this.buf = new Float64Array(capacity);
  }

  /** Ghi một tick: không cấp phát (chạy mỗi tick, mỗi phòng). Giá trị không hữu hạn hoặc âm bị bỏ qua. */
  record(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.buf[this.head] = ms;
    this.head = (this.head + 1) % this.capacity;
    if (this.n < this.capacity) this.n++;
    this.total++;
    if (ms > TICK_MS) this.overrun++;
  }

  /** Tóm tắt cửa sổ hiện tại (sao chép + sắp xếp tối đa `capacity` số: gọi theo nhịp 10 giây / mỗi lần cào, không phải mỗi tick). */
  summary(): TickSummary {
    const n = this.n;
    if (n === 0)
      return { window: 0, p50: 0, p95: 0, max: 0, total: this.total, overrun: this.overrun };
    const a = this.buf.slice(0, n); // khi chưa đầy, mẫu nằm ở [0, n); khi đầy, cả mảng (thứ tự không quan trọng với phân vị)
    a.sort();
    const at = (q: number) => a[Math.min(n - 1, Math.max(0, Math.ceil(q * n) - 1))];
    return {
      window: n,
      p50: at(0.5),
      p95: at(0.95),
      max: a[n - 1],
      total: this.total,
      overrun: this.overrun,
    };
  }
}

// ---------------------------------------------------------------- Hàng đợi ghi

export interface WriteSummary {
  /** Số lần ghi hồ sơ nhân vật đang chạy / đang xếp hàng */
  inflight: number;
  /** Tuổi (ms) của lần ghi chờ lâu nhất; 0 nếu không có. Tăng mãi = kho lưu trữ kẹt. */
  oldestAgeMs: number;
  started: number;
  failed: number;
}

/**
 * Đếm các lần ghi hồ sơ nhân vật chưa xong (đo ở `WorldRoom.persist`, nên đúng với cả `STORE=file` lẫn `pg`). Kho chân linh /
 * tông môn chưa được đo riêng.
 */
export class WriteGauge {
  private readonly open = new Map<number, number>();
  private seq = 0;
  private started = 0;
  private failed = 0;

  /** Bắt đầu một lần ghi; gọi hàm trả về khi xong (`ok=false` nếu lỗi). Gọi lần thứ hai bị bỏ qua. */
  begin(now = Date.now()): (ok?: boolean) => void {
    const id = ++this.seq;
    this.open.set(id, now);
    this.started++;
    return (ok = true) => {
      if (!this.open.delete(id)) return;
      if (!ok) this.failed++;
    };
  }

  summary(now = Date.now()): WriteSummary {
    let oldest = Infinity;
    for (const t of this.open.values()) if (t < oldest) oldest = t;
    return {
      inflight: this.open.size,
      oldestAgeMs: this.open.size === 0 ? 0 : Math.max(0, now - oldest),
      started: this.started,
      failed: this.failed,
    };
  }
}

// ---------------------------------------------------------------- Cấu hình (môi trường)

const MIN_TOKEN_LEN = 16;

/**
 * `METRICS_TOKEN`: không đặt = `/metrics` tắt (404). Đặt nhưng ngắn hơn 16 ký tự bị coi là chưa đặt (token ngắn dò được), kèm
 * cảnh báo lúc khởi động.
 */
export function metricsTokenOf(env: NodeJS.ProcessEnv): {
  token: string | null;
  warnings: string[];
} {
  const raw = env.METRICS_TOKEN;
  if (raw === undefined || raw.trim() === "") return { token: null, warnings: [] };
  const token = raw.trim();
  if (token.length < MIN_TOKEN_LEN) {
    return {
      token: null,
      warnings: [
        `METRICS_TOKEN ngắn hơn ${MIN_TOKEN_LEN} ký tự: /metrics vẫn TẮT. Dùng chuỗi ngẫu nhiên dài (vd: openssl rand -hex 24).`,
      ],
    };
  }
  return { token, warnings: [] };
}

export interface Thresholds {
  /** Cảnh báo khi p95 thời gian tick của phòng tệ nhất vượt ngưỡng này (ms); nhịp là 50 ms */
  tickWarnMs: number;
  /** Cảnh báo khi số lần ghi nhân vật đang chờ vượt ngưỡng này */
  writeWarnPending: number;
  /** Cảnh báo khi lần ghi chờ lâu nhất quá số giây này */
  writeWarnAgeS: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  tickWarnMs: 25,
  writeWarnPending: 200,
  writeWarnAgeS: 30,
};
/** Độ trễ vòng lặp sự kiện p99 (ms) từ đó coi là đang nghẹt (cố định, không cấu hình). */
export const LOOP_LAG_WARN_MS = 100;

/** Đọc ngưỡng từ `TICK_WARN_MS`, `WRITE_WARN_PENDING`, `WRITE_WARN_AGE_S`; giá trị không phải số dương bị bỏ qua kèm cảnh báo. */
export function thresholdsOf(env: NodeJS.ProcessEnv): { value: Thresholds; warnings: string[] } {
  const value = { ...DEFAULT_THRESHOLDS };
  const warnings: string[] = [];
  // Đọc bằng `env.TÊN` viết thẳng: `scripts/check-env.ts` quét mã nguồn tìm các biến này để đối chiếu với tài liệu
  const read = (name: string, raw: string | undefined, key: keyof Thresholds) => {
    if (raw === undefined || raw.trim() === "") return;
    const n = Number(raw.trim());
    if (!Number.isFinite(n) || n <= 0) {
      warnings.push(
        `${name}='${raw}' không phải số dương: bỏ qua, dùng ${DEFAULT_THRESHOLDS[key]}.`,
      );
      return;
    }
    value[key] = n;
  };
  read("TICK_WARN_MS", env.TICK_WARN_MS, "tickWarnMs");
  read("WRITE_WARN_PENDING", env.WRITE_WARN_PENDING, "writeWarnPending");
  read("WRITE_WARN_AGE_S", env.WRITE_WARN_AGE_S, "writeWarnAgeS");
  return { value, warnings };
}

// ---------------------------------------------------------------- Ảnh chụp

export interface RoomSummary {
  room: string;
  map: string;
  /** Phòng bí cảnh tạm (có `runId`) */
  dungeon: boolean;
  /** Số người trong state (kể cả người đang chờ nối lại) */
  players: number;
  /** Số người đang chờ nối lại (`ghosts`) */
  ghosts: number;
  monsters: number;
  tick: TickSummary;
}

export interface MetricsSnapshot {
  /** Thời điểm chụp (ms epoch) */
  at: number;
  uptimeS: number;
  store: string;
  process: { rssBytes: number; heapUsedBytes: number; loopLagP99Ms: number };
  players: number;
  rooms: RoomSummary[];
  /** p95 lớn nhất trong mọi phòng (phòng tệ nhất) */
  worstTickP95Ms: number;
  writes: WriteSummary;
}

/** Ghép số đo từ mọi phòng đang chạy của `hub` (`Hub.worlds`) và hàng đợi ghi chung. Thuần: giờ, bộ nhớ, trễ do người gọi đưa vào. */
export function collectMetrics(
  hub: Hub,
  o: {
    now: number;
    uptimeS: number;
    store: string;
    rssBytes: number;
    heapUsedBytes: number;
    loopLagP99Ms: number;
  },
): MetricsSnapshot {
  const rooms: RoomSummary[] = [];
  let players = 0;
  let worst = 0;
  for (const w of hub.worlds) {
    const tick = w.tickStats.summary();
    const n = w.state.players.size;
    players += n;
    if (tick.p95 > worst) worst = tick.p95;
    rooms.push({
      room: w.roomId,
      map: w.map.def.id,
      dungeon: w.runId !== null,
      players: n,
      ghosts: w.ghosts.size,
      monsters: w.state.monsters.size,
      tick,
    });
  }
  return {
    at: o.now,
    uptimeS: o.uptimeS,
    store: o.store,
    process: { rssBytes: o.rssBytes, heapUsedBytes: o.heapUsedBytes, loopLagP99Ms: o.loopLagP99Ms },
    players,
    rooms,
    worstTickP95Ms: worst,
    writes: hub.writes.summary(o.now),
  };
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

/** Văn bản kiểu Prometheus (`text/plain; version=0.0.4`). Tên số đo có tiền tố `tiengioi_`. */
export function renderPrometheus(s: MetricsSnapshot): string {
  const out: string[] = [];
  const metric = (name: string, type: "gauge" | "counter", help: string) => {
    out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
  };
  metric("tiengioi_uptime_seconds", "gauge", "Thoi gian tien trinh da chay");
  out.push(`tiengioi_uptime_seconds ${s.uptimeS}`);
  metric("tiengioi_store_info", "gauge", "Backend luu tru (file hoac pg)");
  out.push(`tiengioi_store_info{kind="${esc(s.store)}"} 1`);
  metric("tiengioi_process_rss_bytes", "gauge", "Bo nho RSS cua tien trinh");
  out.push(`tiengioi_process_rss_bytes ${s.process.rssBytes}`);
  metric("tiengioi_process_heap_used_bytes", "gauge", "Heap V8 dang dung");
  out.push(`tiengioi_process_heap_used_bytes ${s.process.heapUsedBytes}`);
  metric(
    "tiengioi_event_loop_lag_p99_ms",
    "gauge",
    "Do tre p99 cua vong lap su kien trong cua so 10 giay gan nhat",
  );
  out.push(`tiengioi_event_loop_lag_p99_ms ${s.process.loopLagP99Ms}`);
  metric(
    "tiengioi_players_online",
    "gauge",
    "Tong so nguoi choi trong state cua moi phong (ke ca dang cho noi lai)",
  );
  out.push(`tiengioi_players_online ${s.players}`);
  metric("tiengioi_rooms", "gauge", "So phong the gioi dang chay");
  out.push(`tiengioi_rooms ${s.rooms.length}`);
  metric(
    "tiengioi_tick_p95_worst_ms",
    "gauge",
    "p95 thoi gian xu ly tick cua phong te nhat (cua so ~60 giay)",
  );
  out.push(`tiengioi_tick_p95_worst_ms ${s.worstTickP95Ms}`);

  const perRoom = (
    name: string,
    type: "gauge" | "counter",
    help: string,
    f: (r: RoomSummary) => number,
  ) => {
    metric(name, type, help);
    for (const r of s.rooms) out.push(`${name}{room="${esc(r.room)}",map="${esc(r.map)}"} ${f(r)}`);
  };
  perRoom("tiengioi_room_players", "gauge", "Nguoi choi trong phong", (r) => r.players);
  perRoom("tiengioi_room_ghosts", "gauge", "Nguoi dang cho noi lai trong phong", (r) => r.ghosts);
  perRoom("tiengioi_room_monsters", "gauge", "Quai trong phong", (r) => r.monsters);
  perRoom(
    "tiengioi_room_tick_overrun_total",
    "counter",
    "So tick chay lau hon mot nhip",
    (r) => r.tick.overrun,
  );
  metric(
    "tiengioi_room_tick_ms",
    "gauge",
    "Thoi gian xu ly tick (ms), cua so ~60 giay, chua gom ma hoa patch",
  );
  for (const r of s.rooms) {
    const l = `room="${esc(r.room)}",map="${esc(r.map)}"`;
    out.push(`tiengioi_room_tick_ms{${l},quantile="0.5"} ${r.tick.p50}`);
    out.push(`tiengioi_room_tick_ms{${l},quantile="0.95"} ${r.tick.p95}`);
    out.push(`tiengioi_room_tick_ms{${l},quantile="1"} ${r.tick.max}`);
  }

  metric("tiengioi_writes_inflight", "gauge", "So lan ghi ho so nhan vat dang cho");
  out.push(`tiengioi_writes_inflight ${s.writes.inflight}`);
  metric("tiengioi_writes_oldest_age_seconds", "gauge", "Tuoi cua lan ghi cho lau nhat");
  out.push(`tiengioi_writes_oldest_age_seconds ${s.writes.oldestAgeMs / 1000}`);
  metric("tiengioi_writes_started_total", "counter", "Tong so lan ghi ho so nhan vat");
  out.push(`tiengioi_writes_started_total ${s.writes.started}`);
  metric("tiengioi_writes_failed_total", "counter", "Tong so lan ghi that bai");
  out.push(`tiengioi_writes_failed_total ${s.writes.failed}`);
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------- Cảnh báo

export interface Alert {
  /** Khoá ổn định để chống in lặp */
  key: "tick" | "writes_pending" | "writes_age" | "loop_lag";
  message: string;
}

/** Các điều kiện đang vi phạm ngưỡng (thuần hàm). */
export function alertsOf(s: MetricsSnapshot, th: Thresholds): Alert[] {
  const a: Alert[] = [];
  if (s.worstTickP95Ms > th.tickWarnMs) {
    const r = s.rooms.reduce((m, x) => (x.tick.p95 > m.tick.p95 ? x : m), s.rooms[0]);
    a.push({
      key: "tick",
      message: `tick p95 ${s.worstTickP95Ms.toFixed(1)} ms > ${th.tickWarnMs} ms (phòng ${r.room} / ${r.map}, ${r.players} người; nhịp ${TICK_MS} ms)`,
    });
  }
  if (s.writes.inflight > th.writeWarnPending) {
    a.push({
      key: "writes_pending",
      message: `hàng đợi ghi nhân vật ${s.writes.inflight} > ${th.writeWarnPending} (kho lưu trữ chậm hoặc kẹt)`,
    });
  }
  if (s.writes.oldestAgeMs > th.writeWarnAgeS * 1000) {
    a.push({
      key: "writes_age",
      message: `lần ghi nhân vật chờ lâu nhất ${(s.writes.oldestAgeMs / 1000).toFixed(0)} s > ${th.writeWarnAgeS} s (kho lưu trữ có thể đã kẹt)`,
    });
  }
  if (s.process.loopLagP99Ms > LOOP_LAG_WARN_MS) {
    a.push({
      key: "loop_lag",
      message: `độ trễ vòng lặp sự kiện p99 ${s.process.loopLagP99Ms.toFixed(0)} ms > ${LOOP_LAG_WARN_MS} ms (tiến trình bị nghẹt)`,
    });
  }
  return a;
}

/** Nhắc lại cảnh báo đang kéo dài sau chừng này ms (tránh tràn log nhưng không im lặng mãi). */
export const ALERT_REMIND_MS = 60_000;

export interface MonitorOptions {
  store: string;
  thresholds?: Thresholds;
  /** Nơi in cảnh báo (mặc định `console.warn`) */
  log?: (line: string) => void;
  now?: () => number;
}

/**
 * Gom số đo + canh ngưỡng. `start()` bật bộ đo độ trễ vòng lặp sự kiện và kiểm ngưỡng mỗi 10 giây (in `[CẢNH BÁO]` khi vi phạm,
 * nhắc lại mỗi phút, in `[ĐÃ ỔN]` khi hết). Không phải dịch vụ ngoài: chỉ log, người vận hành đặt cảnh báo trên log / `/metrics`.
 */
export class Monitor {
  readonly thresholds: Thresholds;
  loopLagP99Ms = 0;
  private hist: IntervalHistogram | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly bornAt: number;
  private readonly active = new Map<Alert["key"], number>(); // khoá -> lần in cuối
  private readonly log: (line: string) => void;
  private readonly now: () => number;

  constructor(
    readonly hub: Hub,
    private readonly o: MonitorOptions,
  ) {
    this.thresholds = o.thresholds ?? DEFAULT_THRESHOLDS;
    this.log = o.log ?? ((l) => console.warn(l));
    this.now = o.now ?? Date.now;
    this.bornAt = this.now();
  }

  snapshot(): MetricsSnapshot {
    const mem = process.memoryUsage();
    const now = this.now();
    return collectMetrics(this.hub, {
      now,
      uptimeS: Math.floor((now - this.bornAt) / 1000),
      store: this.o.store,
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      loopLagP99Ms: this.loopLagP99Ms,
    });
  }

  /** Kiểm ngưỡng một lần (test gọi trực tiếp). */
  check(): Alert[] {
    const now = this.now();
    const alerts = alertsOf(this.snapshot(), this.thresholds);
    const firing = new Set<Alert["key"]>();
    for (const a of alerts) {
      firing.add(a.key);
      const last = this.active.get(a.key);
      if (last === undefined || now - last >= ALERT_REMIND_MS) {
        this.log(`[CẢNH BÁO] ${a.message}`);
        this.active.set(a.key, now);
      }
    }
    for (const key of [...this.active.keys()]) {
      if (!firing.has(key)) {
        this.active.delete(key);
        this.log(`[ĐÃ ỔN] ${key}: trở lại dưới ngưỡng`);
      }
    }
    return alerts;
  }

  start(intervalMs = 10_000) {
    if (this.timer) return;
    this.hist = monitorEventLoopDelay({ resolution: 20 });
    this.hist.enable();
    this.timer = setInterval(() => {
      if (this.hist) {
        this.loopLagP99Ms = this.hist.percentile(99) / 1e6; // ns -> ms
        this.hist.reset();
      }
      this.check();
    }, intervalMs);
    this.timer.unref(); // không giữ tiến trình sống
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.hist?.disable();
    this.hist = null;
  }
}

// ---------------------------------------------------------------- HTTP

function bearerOk(header: string | undefined, token: string): boolean {
  const m = /^Bearer (\S+)$/.exec(header ?? "");
  if (!m) return false;
  // So băm cùng độ dài bằng `timingSafeEqual`: không rò độ dài hay vị trí khác biệt
  const a = createHash("sha256").update(m[1]).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b);
}

/**
 * Gắn `GET /metrics`. Phải gọi TRƯỚC trang tĩnh (`app.get("*")`). Không đặt `METRICS_TOKEN`: 404 (route vẫn được gắn để
 * không rơi vào `index.html` của client). Sai / thiếu token: 401. Trả `enabled` để `index.ts` báo lúc khởi động.
 */
export function mountMetrics(
  app: Express,
  o: { env: NodeJS.ProcessEnv; monitor: Monitor },
): { enabled: boolean } {
  const { token } = metricsTokenOf(o.env);
  app.get("/metrics", (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!token) {
      res.status(404).json({ error: "metrics_off" });
      return;
    }
    if (!bearerOk(req.headers.authorization, token)) {
      res.set("WWW-Authenticate", "Bearer");
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const snap = o.monitor.snapshot();
    if (req.query.format === "json") {
      res.json(snap);
      return;
    }
    res.type("text/plain; version=0.0.4; charset=utf-8").send(renderPrometheus(snap));
  });
  return { enabled: token !== null };
}
