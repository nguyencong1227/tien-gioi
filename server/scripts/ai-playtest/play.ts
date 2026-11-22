// Bộ chơi thử AI (#1194, QUYET_DINH_M3 mục 60.1): lái Chrome THẬT qua CDP, chơi kịch bản bằng BÀN PHÍM
// (phím thật `Input.dispatchKeyEvent`, isTrusted), chụp ảnh nhiều khung, ghi số đo (FPS từ rAF, vị trí
// dự đoán client predX/predY), phát hiện lỗi "nhìn mới thấy" (drift / closed-fail), ra `manifest.json`
// (hợp đồng manifest.ts) cho bước AI chấm ảnh. KHÔNG sửa mã trò chơi: lỗi tìm ra mở issue dev-a/dev-b.
//
// Cách chạy:
//   npm run ai-playtest -w server                       # mặc định: ra tmp/ai-playtest/<ngày>-<sha>/
//   npm run ai-playtest -w server -- --out <dir>        # thư mục kết quả
//   npm run ai-playtest -w server -- --only enter,move  # chỉ chạy một số bước
//   npm run ai-playtest -w server -- --viewports 412x915,1366x768
//   npm run ai-playtest -w server -- --png              # ảnh PNG thay JPEG q85
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { getChromeGpuFlags, killChrome, removeTmpDirs, sleep } from "../e2e-kit";
import { spawnPlaytestServer, currentHeadSha } from "./server-spawn";
import {
  DEFAULT_VIEWPORTS,
  validateManifest,
  currentCommit,
  type Manifest,
  type PlayerSample,
  type StepResult,
  type Viewport,
  type Finding,
} from "./manifest";
import {
  driftFinding,
  stuckFinding,
  stallFinding,
  closedFailFinding,
  ioErrorsBlockOk,
} from "./detect";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

const argFlag = (args: string[], name: string): boolean => args.includes(`--${name}`);
const argVal = (args: string[], name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

/** Danh sách phím thật cần, đúng mã `code`/`windowsVirtualKeyCode` của Chrome (KeyX -> X, Digit1 -> 1). */
const KEY = {
  w: { key: "w", code: "KeyW", vk: 87 },
  a: { key: "a", code: "KeyA", vk: 65 },
  s: { key: "s", code: "KeyS", vk: 83 },
  d: { key: "d", code: "KeyD", vk: 68 },
  b: { key: "b", code: "KeyB", vk: 66 }, // túi đồ
  c: { key: "c", code: "KeyC", vk: 67 }, // nhân vật
  n: { key: "n", code: "KeyN", vk: 78 }, // sổ nhiệm vụ
  g: { key: "g", code: "KeyG", vk: 71 }, // tông môn
  m: { key: "m", code: "KeyM", vk: 77 }, // bản đồ
  e: { key: "e", code: "KeyE", vk: 69 }, // cài đặt
  escape: { key: "Escape", code: "Escape", vk: 27 },
} as const;

// ---------------------------------------------------------------------------
// Tab Chrome điều khiển bằng CDP (gom lỗi console / exception / mạng; thừa kế
// pattern đã kiểm của `e2e.ts`). Khác `Tab` của e2e-kit: luôn chụp ảnh, bắt lỗi
// mạng, và có phím thật — những thứ bộ chơi thử cần mà e2e-kit không expose.
// ---------------------------------------------------------------------------
class PlayTab {
  private id = 0;
  private pending = new Map<number, (r: any) => void>();
  readonly errors: string[] = []; // console error + exception
  readonly networkErrors: string[] = [];
  private ws: WebSocket;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (event) => {
      try {
        const d = JSON.parse(String(event.data));
        if (d.id && this.pending.has(d.id)) {
          this.pending.get(d.id)!(d);
          this.pending.delete(d.id);
          return;
        }
        if (d.method === "Runtime.exceptionThrown") {
          const e = d.params;
          const desc = e.exception?.description ?? e.text ?? "unknown error";
          this.errors.push(
            `EXCEPTION (${e.lineNumber ?? "?"}:${e.columnNumber ?? "?"}): ${String(desc).slice(0, 400)}`,
          );
        }
        if (d.method === "Runtime.consoleAPICalled") {
          const type = d.params.type;
          const text = (d.params.args ?? [])
            .map((a: any) => a.value ?? a.description ?? "")
            .join(" ");
          if (type === "error") this.errors.push(`CONSOLE ERROR: ${text.slice(0, 300)}`);
          // Mất tin đăng ký handler lúc vào phòng (colyseus.js) = lỗi đồng bộ thật, không bỏ như e2e thường lệ.
          else if (type === "warning" && text.includes("onMessage() not registered"))
            this.errors.push(`CONSOLE WARN: ${text.slice(0, 300)}`);
        }
        if (d.method === "Network.loadingFailed") {
          const p = d.params;
          this.networkErrors.push(
            `NET ${p.requestId} ${p.type ?? "?"} ${(p.errorText ?? p.canceled) ? "canceled" : "failed"}`,
          );
        }
      } catch {
        /* bỏ qua thông điệp không parse được */
      }
    };
  }

  static async open(wsUrl: string): Promise<PlayTab> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(new Error("CDP kết nối lỗi: " + String(e)));
    });
    const t = new PlayTab(ws);
    await t.send("Page.enable");
    await t.send("Runtime.enable");
    await t.send("Network.enable");
    await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    return t;
  }

  send(method: string, params: Record<string, any> = {}) {
    return new Promise<any>((resolve) => {
      const id = ++this.id;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async ev(expr: string) {
    const r = await this.send("Runtime.evaluate", {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails)
      throw new Error("evaluate lỗi: " + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result?.result?.value;
  }

  async waitFor(expr: string, label: string, timeout = 12000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        if (await this.ev(expr)) return;
      } catch {
        /* đang chờ điều kiện */
      }
      await sleep(100);
    }
    throw new Error(`Hết thời gian chờ (${timeout}ms) ${label}`);
  }

  async setViewport(v: Viewport) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width: v.width,
      height: v.height,
      deviceScaleFactor: 1, // cố định để so ảnh các lần chạy (B: devicePixelRatio nên = 1)
      mobile: v.height > v.width,
    });
  }

  /** Gieo localStorage danh tính TRƯỚC khi nạp trang (legacy: không cần gõ form). */
  async seedIdentity(name: string, secret: string) {
    // CHỈ localStorage: `Page.addScriptToEvaluateOnNewDocument` chạy khi `documentElement` còn null
    // (trước khi `<html>` parse) → đụng `dataset` sẽ ném TypeError. `data-input` do client tự đặt
    // ("mouse" trong headless vì `pointer: coarse` = false), khớp pattern đã kiểm của e2e-ban-phim.ts.
    await this.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem("tg_newbie_guide_dismissed","1");
        localStorage.setItem("tien-gioi:name",${JSON.stringify(name)});
        localStorage.setItem("tien-gioi:secret",${JSON.stringify(secret)});`,
    });
  }

  async navigate(url: string) {
    await this.send("Page.navigate", { url });
  }

  async shot(file: string, dir: string, fmt: "jpeg" | "png") {
    mkdirSync(dir, { recursive: true });
    const r = await this.send("Page.captureScreenshot", { format: fmt });
    const dest = path.join(dir, file);
    writeFileSync(dest, Buffer.from(r.result.data, "base64"));
    return `shots/${file}`;
  }

  /** Phím nhấn rồi nhả (chờ `keyup` thật sự chạy xong trên luồng chính trang, như e2e-ban-phim). */
  async press(k: (typeof KEY)[keyof typeof KEY]) {
    const prev = Number(
      await this.ev(
        `(() => { if (!window.__ptKeyHooked) { window.__ptKeyHooked = true; window.__ptKeySeq = 0; window.addEventListener('keyup', () => { window.__ptKeySeq++; }); } return window.__ptKeySeq; })()`,
      ),
    );
    const base = {
      key: k.key,
      code: k.code,
      windowsVirtualKeyCode: k.vk,
      nativeVirtualKeyCode: k.vk,
    };
    await this.send("Input.dispatchKeyEvent", { ...base, type: "rawKeyDown" });
    await this.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
    await this.ev(
      `new Promise((res) => { const dl = performance.now() + 4000; const p = () => { if (window.__ptKeySeq > ${prev} || performance.now() >= dl) setTimeout(res, 20); else setTimeout(p, 10); }; p(); })`,
    );
  }

  /** Giữ phím `ms` mili giây VÀ ít nhất 4 khung hình Phaser (di chuyển cần phím GIỮ). */
  async hold(k: (typeof KEY)[keyof typeof KEY], ms: number) {
    const base = {
      key: k.key,
      code: k.code,
      windowsVirtualKeyCode: k.vk,
      nativeVirtualKeyCode: k.vk,
    };
    await this.send("Input.dispatchKeyEvent", { ...base, type: "rawKeyDown" });
    await Promise.all([sleep(ms), this.waitFrames(4)]);
    await this.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
    await sleep(120);
  }

  /** Chờ trang vẽ ít nhất `n` khung Phaser (`__scene.game.loop.frame` tăng). */
  async waitFrames(n = 2) {
    await this.ev(
      `new Promise((res) => { const l = window.__scene?.game?.loop; if (!l) return setTimeout(res, 100); const t = l.frame + ${n}; const dl = performance.now() + 5000; const s = () => { if (l.frame >= t || performance.now() >= dl) res(true); else requestAnimationFrame(s); }; requestAnimationFrame(s); })`,
    );
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* bỏ qua */
    }
  }
}

// ---------------------------------------------------------------------------
// Số đo: FPS (từ rAF) + vị trí dự đoán client (predX/predY) theo thời gian.
// ---------------------------------------------------------------------------

/** Bơm bộ đếm FPS vào trang (rAF): mỗi khung ghi `__ptFps` = 1000/dt khung trước. */
const INJECT_FPS = `(() => { if (window.__ptFpsInjected) return; window.__ptFpsInjected = true; window.__ptFps = 60; let last = performance.now(); const tick = (t) => { const dt = t - last; last = t; if (dt > 0) window.__ptFps = 1000 / dt; requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`;

/** Chạy FPS + lấy mẫu vị trí trong `durationMs`, mỗi ~intervalMs ghi một mẫu. */
async function sampleMetrics(
  tab: PlayTab,
  durationMs: number,
  intervalMs = 100,
): Promise<{ fps: { min: number; avg: number }; player: PlayerSample[] }> {
  await tab.ev(INJECT_FPS);
  const start = Date.now();
  let min = Infinity;
  let sum = 0;
  let n = 0;
  const player: PlayerSample[] = [];
  let lastSample = start;
  while (Date.now() - start < durationMs) {
    if (Date.now() - lastSample >= intervalMs) {
      lastSample = Date.now();
      const pos = (await tab.ev(
        `({x: window.__scene?.predX ?? 0, y: window.__scene?.predY ?? 0})`,
      )) as {
        x: number;
        y: number;
      };
      player.push({
        t: lastSample - start,
        x: Math.round(pos.x * 10) / 10,
        y: Math.round(pos.y * 10) / 10,
      });
    }
    const fps = Number(await tab.ev(`window.__ptFps`)) || 0;
    if (fps > 0) {
      if (fps < min) min = fps;
      sum += fps;
      n++;
    }
    await sleep(40);
  }
  // min giữ Infinity nếu không có mẫu rAF → làm tròn thành Infinity → validateManifest Number.isFinite
  // fail. Kẹp về 0 để manifest hợp lệ (0 = "không đo được FPS", không phải số vô hạn).
  const minFps = Number.isFinite(min) ? Math.round(min) : 0;
  return {
    fps: { min: minFps, avg: Math.round((sum / (n || 1)) * 10) / 10 },
    player,
  };
}

/** Lấy toạ độ dự đoán client (predX/predY) một lần. */
async function samplePred(tab: PlayTab): Promise<{ x: number; y: number }> {
  return (await tab.ev(`({x: window.__scene?.predX ?? 0, y: window.__scene?.predY ?? 0})`)) as {
    x: number;
    y: number;
  };
}

/** Sau khi nhả MỌI phím hướng: nếu `pred` còn đổi > ngưỡng trong `windowMs` = drift (trôi sau nhả phím). */
async function detectDrift(tab: PlayTab, windowMs = 300, threshold = 1.5): Promise<Finding | null> {
  const a = await samplePred(tab);
  await sleep(windowMs);
  const b = await samplePred(tab);
  return driftFinding(a.x, a.y, b.x, b.y, threshold, `trong ${windowMs}ms sau khi nhả phím`);
}

/**
 * Lấy pred TRƯỚC khi giữ, giữ phím `holdMs`, lấy pred SAU → nếu pred hầu không đổi = stuck (đứng im
 * khi giữ phím). Đây là detector cho mutation (b) của mục 60.1 (khác stall: stall là khung đóng băng,
 * stuck là khung vẫn vẽ nhưng nhân vật không chạy).
 */
async function detectStuck(
  tab: PlayTab,
  key: (typeof KEY)[keyof typeof KEY],
  holdMs = 2000,
  threshold = 1.5,
): Promise<Finding | null> {
  const a = await samplePred(tab);
  await tab.hold(key, holdMs);
  const b = await samplePred(tab);
  return stuckFinding(a.x, a.y, b.x, b.y, threshold, `trong ${holdMs}ms giữ phím`);
}

/** Bảng có còn thấy thật không (shown(): tồn tại, không hidden, checkVisibility, có kích thước). */
const modalShown = (id: string) =>
  `(() => { const e = document.getElementById(${JSON.stringify(id)}); if (!e || e.hidden || !e.checkVisibility({ checkVisibilityCSS: true })) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`;

/**
 * Các bảng core mở bằng phím trực tiếp (nhóm 3, mục 60.1). Mỗi bảng có nút `.modal-close` nên `focusModal`
 * rơi focus vào nút đóng (KHÔNG vào ô chữ) → Esc đóng được (kiểm tra index.html + a11y.ts). ĐỪNG đổi
 * `modal` khi đã merge — đây là id thật trong index.html.
 */
const PANELS = [
  { key: KEY.b, modal: "inv-modal", title: "Túi đồ" },
  { key: KEY.c, modal: "char-modal", title: "Nhân vật" },
  { key: KEY.n, modal: "quest-modal", title: "Sổ nhiệm vụ" },
  { key: KEY.g, modal: "sect-modal", title: "Tông môn" },
  { key: KEY.m, modal: "map-modal", title: "Bản đồ" },
  { key: KEY.e, modal: "settings-modal", title: "Cài đặt" },
] as const;

/** Mở bảng bằng phím thật, chờ thấy, chụp (trong action), Esc đóng, kiểm bảng đóng thật (closed-fail). */
async function openClosePanel(tab: PlayTab, spec: (typeof PANELS)[number]): Promise<Finding[]> {
  const findings: Finding[] = [];
  await tab.press(spec.key);
  await tab.waitFor(modalShown(spec.modal), `${spec.title} mở`, 4000);
  await tab.waitFrames(2);
  await tab.press(KEY.escape);
  await sleep(300);
  const stillOpen = await tab.ev(modalShown(spec.modal));
  const f = closedFailFinding(stillOpen);
  if (f) findings.push(f);
  return findings;
}

// ---------------------------------------------------------------------------
// Kịch bản. Mỗi bước: chạy hành động (phím / mở bảng), lấy mẫu số đo, chụp ảnh,
// phát hiện finding. Nhóm 1-6 đầy đủ bổ sung sau; lõi này chứng minh bộ chạy.
// ---------------------------------------------------------------------------
interface StepDef {
  id: string;
  scenario: string;
  title: string;
  input: string;
  /** Khung mặc định của bước (thuộc DEFAULT_VIEWPORTS); ghi đè bằng --viewports. */
  viewports: string[];
  /** Chạy hành động của bước (đã sẵn sàng trong game). Trả findings tự phát hiện (drift...). */
  action: (tab: PlayTab) => Promise<Finding[]>;
}

/** Nhóm 3 (mục 60.1): một bước cho MỖI bảng core — mở bằng phím, chụp, Esc đóng, kiểm đóng thật. */
const PANEL_STEPS: StepDef[] = PANELS.map((p) => ({
  id: `panel-${p.modal.replace("-modal", "")}`,
  scenario: "panels",
  title: `Bảng: mở ${p.title} (${p.key.code.replace("Key", "")}), chụp, Esc đóng, kiểm đóng thật`,
  input: "keyboard",
  viewports: ["360x640", "915x412", "1366x768"],
  action: (tab) => openClosePanel(tab, p),
}));

const STEPS: StepDef[] = [
  {
    id: "enter-game",
    scenario: "enter",
    title: "Vào game: đăng nhập + HUD + canvas Phaser",
    input: "keyboard",
    viewports: ["412x915", "1366x768"],
    action: async (tab) => {
      await tab.waitFor(
        `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
        "HUD + scene sẵn sàng",
      );
      await tab.waitFrames(3); // đợi camera ổn định (B: nhích ~3,9s đầu; ảnh tất định để sau)
      const ok = await tab.ev(
        `!!document.getElementById('hud-name')?.textContent && !!document.querySelector('canvas')`,
      );
      return ok ? [] : [{ kind: "stuck", detail: "HUD/canvas không xuất hiện sau khi vào phòng" }];
    },
  },
  {
    id: "move-hold-w",
    scenario: "move",
    title: "Di chuyển: giữ W 2s (kiểm đứng im) rồi nhả (kiểm trôi)",
    input: "keyboard",
    viewports: ["412x915", "1366x768"],
    action: async (tab) => {
      const findings: Finding[] = [];
      const s = await detectStuck(tab, KEY.w, 2000, 1.5); // đứng im khi giữ phím (mutation b)
      if (s) findings.push(s);
      const d = await detectDrift(tab, 300, 1.5); // trôi sau khi nhả phím (mutation a)
      if (d) findings.push(d);
      return findings;
    },
  },
  ...PANEL_STEPS,
];

// ---------------------------------------------------------------------------
// Chạy trọn bộ: MỘT Chrome, nhiều tab; mỗi (bước × khung) = một tab đăng nhập.
// ---------------------------------------------------------------------------
interface RunArgs {
  out: string;
  only: string[];
  viewports: Viewport[];
  png: boolean;
  ambush: boolean;
}

/** Cổng ngẫu nhiên dải an toàn (KHÔNG 2567, KHÔNG cổng dev phổ biến); bận thì server-spawn thử lại. */
function pickPort(): number {
  return 36500 + Math.floor(Math.random() * 4000);
}

interface ChromeProc {
  proc: ChildProcess;
  cdpPort: number;
  chromeDir: string;
}

/** Khởi động Chrome headless (detached: làm chủ nhóm tiến trình để giết sạch gpu/renderer). */
function launchChrome(): ChromeProc {
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-pt-chrome-"));
  const cdpPort = 9600 + Math.floor(Math.random() * 300);
  const proc = spawn(
    "google-chrome",
    [
      "--headless=new",
      "--no-sandbox",
      ...getChromeGpuFlags(),
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${chromeDir}`,
      "--window-size=1280,720",
      "about:blank",
    ],
    { stdio: "ignore", detached: true },
  );
  proc.once("error", () => {}); // KHÔNG để lỗi spawn bất đồng bộ sập cả tiến trình
  return { proc, cdpPort, chromeDir };
}

/** Chờ Chrome CDP sẵn, trả page target ws (ném nếu Chrome không chạy được). */
async function waitForPageWs(cdpPort: number, ms = 30000): Promise<string> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json`);
      if (res.ok) {
        const targets = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
        const page = targets.find((t) => t.type === "page");
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {
      /* Chrome chưa sẵn */
    }
    await sleep(150);
  }
  throw new Error("Chrome CDP không sẵn sau " + ms + "ms (google-chrome không chạy?)");
}

/** Chạy MỘT bước × khung: đăng nhập, chạy hành động + lấy mẫu số đo, chụp ảnh, phát hiện finding. */
async function runStep(
  tab: PlayTab,
  step: StepDef,
  vp: Viewport,
  serverUrl: string,
  outShots: string,
  fmt: "jpeg" | "png",
  name: string,
): Promise<StepResult> {
  const findings: Finding[] = [];
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  let ok = true;
  let fps: StepResult["metrics"] = { fps: { min: 0, avg: 0 }, player: [] };
  try {
    await tab.setViewport(vp);
    await tab.seedIdentity(name, secretFor(name));
    await tab.navigate(`${serverUrl}/?debug`);
    // Chờ bundle JS gắn listener trước khi tin đăng nhập đi (như e2e.ts).
    await tab.waitFor(`typeof window.__switchAuthView === 'function'`, "client JS sẵn sàng", 12000);
    await tab.ev(`document.getElementById('login-form')?.requestSubmit?.(); 1`);
    // Chờ vào game + đóng newbie-guide (nếu còn)
    await tab.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game",
      15000,
    );
    await tab.ev(
      `if (document.getElementById('newbie-guide-modal') && !document.getElementById('newbie-guide-modal').hidden) document.getElementById('newbie-btn-dismiss')?.click(); 1`,
    );
    await sleep(200);

    // Lấy mẫu FPS + vị trí TRONG lúc chạy hành động.
    const measureMs = 2400;
    const metricsP = sampleMetrics(tab, measureMs);
    const actionFindings = await step.action(tab);
    const metrics = await metricsP;
    findings.push(...actionFindings);

    const shotFile = `${step.id}-${vp.id}.${fmt === "png" ? "png" : "jpg"}`;
    const shots = [await tab.shot(shotFile, outShots, fmt)];

    consoleErrors.push(...tab.errors);
    networkErrors.push(...tab.networkErrors);
    if (ioErrorsBlockOk(consoleErrors, networkErrors)) ok = false;
    const stall = stallFinding(metrics.fps.min);
    if (stall) findings.push(stall);
    ok = ok && actionFindings.length === 0;
    fps = metrics;
    return {
      id: step.id,
      scenario: step.scenario,
      title: step.title,
      viewport: vp.id,
      input: step.input,
      shots,
      ok,
      metrics: fps,
      consoleErrors,
      networkErrors,
      findings,
    };
  } catch (err) {
    consoleErrors.push(`STEP ERROR: ${err instanceof Error ? err.message : String(err)}`);
    return {
      id: step.id,
      scenario: step.scenario,
      title: step.title,
      viewport: vp.id,
      input: step.input,
      shots: [],
      ok: false,
      metrics: fps,
      consoleErrors,
      networkErrors,
      findings: [...findings, { kind: "timeout", detail: "bước lỗi: " + String(err) }],
    };
  }
}

function secretFor(name: string): string {
  return `pt-${name.replace(/[^a-z0-9]/gi, "")}-0123456789abcdef`;
}

async function main() {
  const args = process.argv.slice(2);
  const only = (argVal(args, "only") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const vpIds = (argVal(args, "viewports") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const viewports =
    vpIds.length > 0 ? DEFAULT_VIEWPORTS.filter((v) => vpIds.includes(v.id)) : DEFAULT_VIEWPORTS;
  const runArgs: RunArgs = {
    out:
      argVal(args, "out") ??
      path.join(
        "tmp",
        "ai-playtest",
        `${new Date().toISOString().slice(0, 10)}-${currentCommit()}`,
      ),
    only,
    viewports,
    png: argFlag(args, "png"),
    ambush: argFlag(args, "ambush"),
  };
  const fmt = runArgs.png ? "png" : "jpeg";

  const outDir = path.resolve(repoRoot, runArgs.out);
  const outShots = path.join(outDir, "shots");
  mkdirSync(outShots, { recursive: true });

  const startedAt = new Date().toISOString();
  const server = await spawnPlaytestServer({ pickPort, ambush: runArgs.ambush });
  const chrome = launchChrome();
  const tabs: PlayTab[] = [];
  const steps = only.length > 0 ? STEPS.filter((s) => only.includes(s.id)) : STEPS;

  let manifest: Manifest;
  try {
    const wsUrl = await waitForPageWs(chrome.cdpPort);
    const results: StepResult[] = [];
    for (const step of steps) {
      const vps =
        viewports.length > 0
          ? viewports
          : step.viewports.map((id) => DEFAULT_VIEWPORTS.find((v) => v.id === id)!).filter(Boolean);
      for (const vp of vps) {
        const name = `AI Playtest ${results.length + 1}`;
        const tab = await PlayTab.open(wsUrl); // tab mới (profile riêng trong cùng Chrome)
        tabs.push(tab);
        console.log(`▶ ${step.id} @ ${vp.id}`);
        const r = await runStep(tab, step, vp, server.url, outShots, fmt, name);
        results.push(r);
        console.log(
          `  ${r.ok ? "✓" : "✗"} fps ${r.metrics.fps.min}/${r.metrics.fps.avg} | findings ${r.findings.length} | console ${r.consoleErrors.length}`,
        );
      }
    }
    const failed = results.filter((r) => !r.ok).length;
    const consoleErrors = results.reduce((n, r) => n + r.consoleErrors.length, 0);
    const findings = results.reduce((n, r) => n + r.findings.length, 0);
    manifest = {
      schema: "tien-gioi/ai-playtest/v1",
      commit: currentHeadSha(),
      startedAt,
      finishedAt: new Date().toISOString(),
      server: { port: server.port, ambush: runArgs.ambush },
      steps: results,
      summary: { steps: results.length, failed, consoleErrors, findings },
    };
    writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    // Xác nhận manifest hợp lệ theo hợp đồng (ném nếu sai — không để manifest hỏng lọt ra).
    validateManifest(JSON.parse(JSON.stringify(manifest)));
    console.log(
      `\n✓ manifest hợp lệ: ${results.length} bước, ${failed} lỗi, ${findings} findings → ${path.relative(repoRoot, outDir)}`,
    );
  } finally {
    for (const t of tabs) t.close();
    killChrome(chrome.proc);
    await server.close();
    await removeTmpDirs(chrome.chromeDir);
  }
}

if (process.argv[1]?.endsWith("play.ts") || process.argv[1]?.endsWith("play.js")) {
  main().catch((err) => {
    console.error(`✗ THẤT BẠI: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
