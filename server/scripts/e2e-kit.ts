// Khung dùng chung cho các E2E thật hai tab Chrome (CDP): lớp `Tab` (gom lỗi console, evaluate, chờ điều kiện, ảnh chụp).
// Tách từ `e2e-pk.ts` cho E2E mới (`e2e-tong-mon.ts`); các E2E cũ giữ bản sao riêng của chúng.
import { execSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const SHOTS = process.env.E2E_SHOTS ? path.resolve(process.env.E2E_SHOTS) : undefined;
export const TIMEOUT = 15000;

/**
 * Giết CẢ NHÓM tiến trình của Chrome. Chrome phải được `spawn(..., { detached: true })` để làm chủ một nhóm; giết riêng tiến trình
 * chính thì tiến trình con (gpu, renderer) còn sống và ghi lại thư mục dữ liệu sau khi ta đã xoá (sót `/tmp/tien-gioi-e2e-*-chrome-*`).
 */
export function killChrome(chrome: ChildProcess | null): void {
  if (!chrome) return;
  try {
    if (chrome.pid) process.kill(-chrome.pid, "SIGKILL");
    else chrome.kill("SIGKILL");
  } catch {
    chrome.kill("SIGKILL");
  }
}

/**
 * Dọn thư mục tạm của một lần chạy E2E. Chrome vừa bị SIGKILL còn ghi thư mục dữ liệu thêm một lúc: chờ rồi xoá hai lần.
 * Gọi SAU `gameServer.gracefullyShutdown(false)`: mặc định (`true`) Colyseus GỌI `process.exit(0)` ngay trong hàm đó, nên mọi dòng
 * phía sau không bao giờ chạy (sót thư mục) và một E2E đỏ vẫn thoát mã 0.
 */
export async function removeTmpDirs(...dirs: string[]): Promise<void> {
  try {
    await sleep(1200);
    execSync(`rm -rf ${dirs.map((d) => `"${d}"`).join(" ")}`);
    await sleep(600);
    execSync(`rm -rf "${dirs[dirs.length - 1]}"`);
  } catch {
    /* bỏ qua */
  }
}

/**
 * Biểu thức JS (chạy trong trang): phần tử `#id` THẤY THẬT. `!e.hidden` không đủ: thuộc tính `hidden` (hay `display: none`) của một
 * PHẦN TỬ CHA làm con biến mất mà `e.hidden` của con vẫn `false` (lỗi modal "Phiên Bản Đã Cũ" nằm trong `#ui` ở #264). Kiểm: có phần
 * tử, không `hidden`, `checkVisibility` (tính cả cha, `visibility: hidden`), và có kích thước.
 */
export const shown = (id: string) =>
  `(() => { const e = document.getElementById(${JSON.stringify(id)}); if (!e || e.hidden || !e.checkVisibility({ checkVisibilityCSS: true })) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`;

/** Một tab Chrome điều khiển bằng CDP. Gom lỗi console / exception để E2E thất bại nếu có. */
export class Tab {
  private id = 0;
  private pending = new Map<number, (r: any) => void>();
  readonly errors: string[] = [];
  private constructor(
    readonly label: string,
    private ws: WebSocket,
  ) {
    ws.onmessage = (event) => {
      try {
        const d = JSON.parse(String(event.data));
        if (d.id && this.pending.has(d.id)) {
          this.pending.get(d.id)!(d);
          this.pending.delete(d.id);
          return;
        }
        if (d.method === "Runtime.exceptionThrown")
          this.errors.push(`EXCEPTION: ${JSON.stringify(d.params.exceptionDetails).slice(0, 300)}`);
        if (d.method === "Runtime.consoleAPICalled") {
          const type = d.params.type;
          const text = (d.params.args ?? [])
            .map((a: any) => a.value ?? a.description ?? "")
            .join(" ");
          if (type === "error") this.errors.push(`CONSOLE ERROR: ${text.slice(0, 300)}`);
          else if (
            type === "warning" &&
            (text.includes("onMessage() not registered") || text.includes("unhandled"))
          )
            this.errors.push(`CONSOLE WARN: ${text.slice(0, 300)}`);
        }
      } catch {
        /* bỏ qua thông điệp không parse được */
      }
    };
  }

  static async open(label: string, wsUrl: string): Promise<Tab> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(new Error(`CDP ${label}: ${String(e)}`));
    });
    const t = new Tab(label, ws);
    await t.send("Page.enable");
    await t.send("Runtime.enable");
    // Tab nền không bị Chrome làm chậm (cả hai tab phải chạy như đang được xem)
    await t.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await t.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
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
      throw new Error(
        `${this.label}: evaluate lỗi: ${JSON.stringify(r.result.exceptionDetails).slice(0, 300)}`,
      );
    return r.result?.result?.value;
  }

  async waitFor(expr: string, label: string, timeout = TIMEOUT) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        if (await this.ev(expr)) return;
      } catch {
        /* đang chờ điều kiện thoả mãn */
      }
      await sleep(100);
    }
    throw new Error(`Hết thời gian chờ (${timeout}ms) ở ${this.label}: ${label}`);
  }

  async shot(file: string) {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(
      path.join(SHOTS, `${this.label}-${file}.png`),
      Buffer.from(r.result.data, "base64"),
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
