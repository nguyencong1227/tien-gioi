// Khung dùng chung cho các E2E thật hai tab Chrome (CDP): lớp `Tab` (gom lỗi console, evaluate, chờ điều kiện, ảnh chụp).
// Tách từ `e2e-pk.ts` cho E2E mới (`e2e-tong-mon.ts`); các E2E cũ giữ bản sao riêng của chúng.
import type { ChildProcess } from "node:child_process";
import type net from "node:net";
import fs, { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const SHOTS = process.env.E2E_SHOTS ? path.resolve(process.env.E2E_SHOTS) : undefined;
export const TIMEOUT = 15000;

/** Trả về cờ tăng tốc GPU NVIDIA RTX hoặc lùi về phần mềm nếu không có GPU / trên CI */
export function getChromeGpuFlags(): string[] {
  if (process.env.DISABLE_GPU === "1" || process.env.FORCE_SWIFTSHADER === "1") {
    return ["--disable-gpu"];
  }
  if (process.env.CI && !process.env.FORCE_GPU) {
    return ["--disable-gpu"];
  }
  try {
    const hasNvidiaDevice = fs.existsSync("/dev/nvidia0");
    const hasNvidiaVulkan =
      fs.existsSync("/usr/share/vulkan/icd.d/nvidia_icd.json") ||
      fs.existsSync("/etc/vulkan/icd.d/nvidia_icd.json");
    if (hasNvidiaDevice && hasNvidiaVulkan) {
      return ["--enable-gpu", "--use-gl=angle", "--use-angle=vulkan"];
    }
  } catch {
    /* bỏ qua */
  }
  return ["--disable-gpu"];
}

/**
 * Giết cả NHÓM tiến trình của Chrome (gốc + gpu + renderer...). `spawn` PHẢI có `detached: true` (Chrome làm chủ nhóm riêng); chỉ
 * `chrome.kill()` thì tiến trình con còn sống và ghi lại thư mục dữ liệu sau khi `rm -rf` đã chạy => sót `/tmp/tien-gioi-e2e-*-chrome-*`.
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

/** Xoá thư mục tạm sau khi Chrome đã bị giết: đợi tiến trình con tắt hẳn, xoá, đợi lần nữa rồi xoá lại (bắt phần ghi muộn). */
export async function removeTmpDirs(...dirs: string[]): Promise<void> {
  const rm = () => {
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* bỏ qua */
      }
    }
  };
  await sleep(1200);
  rm();
  await sleep(600);
  rm();
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

/**
 * `server.listen(port)` mà LỖI được trả về (reject) thay vì chìm: `new Promise((r) => server.listen(port, r))` không bao giờ resolve khi cổng
 * bận (Colyseus transport chỉ in lỗi), vòng sự kiện cạn và E2E thoát mã 0 không in PASS / THẤT BẠI (false green) và sót thư mục tạm.
 * Cổng do người chạy chỉ định (`explicit`) thì lỗi bận trả thẳng; cổng NGẪU NHIÊN thì thử lại với cổng mới (`pick`) tối đa `attempts` lần.
 * Trả về cổng thực sự đang nghe.
 */
export function listenWithRetry(
  server: net.Server, // http.Server là con của net.Server: dùng được cho cả máy chủ HTTP lẫn proxy TCP
  port: number,
  opts: { explicit: boolean; pick: () => number; attempts?: number; host?: string },
): Promise<number> {
  const attempts = opts.attempts ?? 6;
  return new Promise<number>((resolve, reject) => {
    const tryListen = (p: number, left: number) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.off("listening", onListening);
        if (err.code === "EADDRINUSE" && !opts.explicit && left > 1)
          tryListen(opts.pick(), left - 1);
        else reject(err);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(p);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      if (opts.host) server.listen(p, opts.host);
      else server.listen(p);
    };
    tryListen(port, attempts);
  });
}
