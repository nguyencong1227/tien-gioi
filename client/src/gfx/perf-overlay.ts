/**
 * Lớp phủ gỡ lỗi hiệu năng `?perf=1` (issue #323, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 6.3).
 * Hiện FPS, p95 thời gian khung, bậc chất lượng, kích thước khung nhìn / DPR, heap JS và các chỉ số do mô-đun khác
 * đăng ký (`registerPerfStat`: số hạt sống, draw call, bộ nhớ texture...). Dùng đo thật trên điện thoại.
 */
import { getDisplay } from "./display";
import { getQuality, qualityStats } from "./quality";

type StatFn = () => string;
const extras = new Map<string, StatFn>();

/** Mô-đun khác thêm một dòng vào lớp phủ; trả về hàm bỏ đăng ký. */
export function registerPerfStat(name: string, fn: StatFn): () => void {
  extras.set(name, fn);
  return () => {
    if (extras.get(name) === fn) extras.delete(name);
  };
}

export interface PerfSnapshot {
  fps: number;
  p95Ms: number;
  tier: string;
  mode: string;
  cssW: number;
  cssH: number;
  dpr: number;
  renderScale: number;
  heapMb: number | null;
  governor: { downshifts: number; badStreak: number; goodStreak: number };
  extras: Array<[string, string]>;
}

/** Dựng các dòng chữ (thuần, dễ test). */
export function formatPerfLines(s: PerfSnapshot): string[] {
  const lines = [
    `FPS ${s.fps.toFixed(0)}  p95 ${s.p95Ms.toFixed(1)} ms`,
    `chất lượng ${s.tier} (${s.mode})  hạ ${s.governor.downshifts}  xấu ${s.governor.badStreak} tốt ${s.governor.goodStreak}`,
    `${s.cssW}x${s.cssH} dpr ${s.dpr} x${s.renderScale}`,
    s.heapMb === null ? "heap -" : `heap ${s.heapMb.toFixed(0)} MB`,
  ];
  for (const [k, v] of s.extras) lines.push(`${k} ${v}`);
  return lines;
}

/** Đọc các chỉ số đã đăng ký; hàm ném lỗi thì ghi '?' (lớp phủ không được làm sập vòng lặp). */
export function readPerfExtras(): Array<[string, string]> {
  const ex: Array<[string, string]> = [];
  for (const [k, fn] of extras) {
    try {
      ex.push([k, fn()]);
    } catch {
      ex.push([k, "?"]);
    }
  }
  return ex;
}

function snapshot(): PerfSnapshot {
  const q = getQuality();
  const d = getDisplay();
  const st = qualityStats();
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return {
    fps: st.fps,
    p95Ms: st.p95Ms,
    tier: q.tier,
    mode: q.mode,
    cssW: d.cssW,
    cssH: d.cssH,
    dpr: Number(d.dpr.toFixed(2)),
    renderScale: d.renderScale,
    heapMb: mem ? mem.usedJSHeapSize / 1048576 : null,
    governor: st.governor,
    extras: readPerfExtras(),
  };
}

export interface OverlayEnv {
  doc: Document;
  setInterval: (fn: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
}

/** Gắn lớp phủ; trả về hàm gỡ. Cập nhật 2 lần / giây, không bắt chuột. */
export function mountPerfOverlay(
  env: OverlayEnv = {
    doc: document,
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id),
  },
): () => void {
  const el = env.doc.createElement("pre");
  el.id = "perf-overlay";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;left:max(6px,var(--safe-l,0px));top:max(6px,var(--safe-t,0px));z-index:99999;margin:0;" +
    "padding:4px 6px;font:11px/1.3 monospace;color:#9f9;background:rgba(0,0,0,.65);border-radius:4px;" +
    "pointer-events:none;white-space:pre";
  const tick = (): void => {
    el.textContent = formatPerfLines(snapshot()).join("\n");
  };
  tick();
  env.doc.body.appendChild(el);
  const id = env.setInterval(tick, 500);
  return () => {
    env.clearInterval(id);
    el.remove();
  };
}
