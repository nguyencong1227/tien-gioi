// Helper gom việc dựng Chrome headless điều khiển qua CDP cho toàn bộ các script E2E (#1432).
// Hạn chờ đủ (>= 30 s), tự động thử dựng lại ĐÚNG MỘT lần khi Chrome chết sớm hoặc không mở cổng,
// và in đầy đủ chẩn đoán (thời gian chờ, exitCode, signal, 20 dòng cuối stderr) khi thất bại.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { getChromeGpuFlags, killChrome, sleep } from "./e2e-kit";

/** Chờ page target mỗi lần thử: 60 s khi CI (khởi động nguội chậm), 30 s ở máy dev (#694, #1432, #1506). */
export const cdpWaitMs = () => (process.env.CI ? 60000 : 30000);
export const DEFAULT_CDP_TIMEOUT_MS = process.env.CI ? 60000 : 30000;
/** Khoảng thời gian giữa các lần thăm dò /json. */
export const DEFAULT_POLL_INTERVAL_MS = 150;
/** Số dòng stderr cuối cùng giữ trong bộ đệm vòng. */
export const MAX_STDERR_TAIL_LINES = 20;

export interface ChromeDiag {
  /** Số lần đã thử dựng (1 hoặc 2). */
  attempts: number;
  /** Thời gian đã chờ ở lần cuối (ms). */
  elapsedMs: number;
  /** Mã thoát nếu tiến trình đã tắt. */
  exitCode: number | null;
  /** Tín hiệu kết thúc nếu có. */
  signal: NodeJS.Signals | null;
  /** Tối đa 20 dòng stderr cuối cùng. */
  stderrTail: string[];
}

export interface LaunchedChrome {
  /** Tiến trình con của Chrome. */
  chrome: ChildProcess;
  /** Cổng CDP đang lắng nghe. */
  cdpPort: number;
  /** Danh sách targets lấy từ /json. */
  targets: any[];
  /** URL WebSocket của target loại "page" đầu tiên. */
  webSocketDebuggerUrl: string;
  /** Hàm giết Chrome và toàn bộ nhóm tiến trình con. */
  kill: () => void;
  /** Thông tin chẩn đoán. */
  diag: ChromeDiag;
}

export interface LaunchChromeOptions {
  /** Cổng remote debugging port của Chrome. */
  cdpPort: number;
  /** Thư mục dữ liệu người dùng của Chrome (--user-data-dir). */
  userDataDir: string;
  /** Cờ bổ sung truyền cho Chrome (tuỳ chọn). */
  extraFlags?: string[];
  /** Hạn chờ CDP cho mỗi lần thử dựng (ms), mặc định 60000 ms khi CI, 30000 ms ở máy dev (#694, #1432, #1506). */
  timeoutMs?: number;
  /** Khoảng thời gian thăm dò /json (ms), mặc định 150 ms. */
  pollIntervalMs?: number;
  /** Hạn chờ cho mỗi lượt gọi fetch /json (ms), mặc định 2000 ms. */
  fetchTimeoutMs?: number;
  /** Hàm in log (mặc định console.log). */
  log?: (msg: string) => void;
  /** Lệnh thực thi Chrome (mặc định "google-chrome", dùng để thay thế trong test giả lập). */
  executable?: string;
  /** Danh sách tham số tuỳ biến nếu muốn thay thế cờ mặc định (chủ yếu dùng trong unit test). */
  customArgs?: (port: number, dir: string) => string[];
  /** Cấp cổng mới cho lần thử lại nếu cần (mặc định giữ nguyên cdpPort). */
  allocPort?: () => number | Promise<number>;
  /** Dọn dẹp userDataDir trước lần thử lại thứ 2 (mặc định true). */
  cleanUserDataDirOnRetry?: boolean;
}

/**
 * Khởi động Chrome headless với đầy đủ cờ chuẩn của Tiên Giới và chờ cổng CDP sẵn sàng.
 * Tự động thử lại đúng một lần nếu lần đầu thất bại (tiến trình chết hoặc hết hạn mở cổng).
 */
export async function launchChrome(opts: LaunchChromeOptions): Promise<LaunchedChrome> {
  const timeoutMs = opts.timeoutMs ?? cdpWaitMs();
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const fetchTimeoutMs = opts.fetchTimeoutMs ?? 2000;
  const executable = opts.executable ?? "google-chrome";
  const log = opts.log ?? ((msg: string) => console.log(msg));

  let currentPort = opts.cdpPort;
  let lastDiag: ChromeDiag | null = null;
  const allDiags: ChromeDiag[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) {
      log("đã dựng lại Chrome lần 2");
      if (opts.cleanUserDataDirOnRetry !== false) {
        try {
          rmSync(opts.userDataDir, { recursive: true, force: true });
          mkdirSync(opts.userDataDir, { recursive: true });
        } catch {
          /* bỏ qua lỗi dọn dẹp */
        }
      }
      if (opts.allocPort) {
        currentPort = await opts.allocPort();
      }
    }

    const args = opts.customArgs
      ? opts.customArgs(currentPort, opts.userDataDir)
      : [
          "--headless=new",
          "--no-sandbox",
          // Không hỏi keyring hệ thống qua DBus (keyring khoá làm Chrome treo ở bước điều hướng, 28/11/2026): xem `client/scripts/chrome-launch.mjs`.
          "--password-store=basic",
          ...getChromeGpuFlags(),
          `--remote-debugging-port=${currentPort}`,
          `--user-data-dir=${opts.userDataDir}`,
          "--window-size=1280,720",
          ...(opts.extraFlags ?? []),
          "about:blank",
        ];

    let chrome: ChildProcess;
    try {
      chrome = spawn(executable, args, {
        stdio: ["ignore", "ignore", "pipe"],
        detached: true,
      });
    } catch (err) {
      throw new Error(`Không chạy được ${executable}: ${(err as Error).message}`, { cause: err });
    }

    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    let spawnError: Error | null = null;
    const stderrTail: string[] = [];
    let partialLine = "";

    chrome.on("error", (err) => {
      spawnError = err;
    });

    chrome.on("exit", (code, signal) => {
      exitCode = code;
      // exitSignal là null khi tiến trình tự thoát; khi bị kill từ ngoài qua killChrome, Node nhận tín hiệu nếu bắt được
      exitSignal = signal;
    });

    if (chrome.stderr) {
      chrome.stderr.setEncoding("utf8");
      chrome.stderr.on("data", (chunk: string) => {
        const lines = (partialLine + chunk).split(/\r?\n/);
        partialLine = lines.pop() ?? "";
        for (const l of lines) {
          if (l.trim().length > 0) {
            stderrTail.push(l);
            if (stderrTail.length > MAX_STDERR_TAIL_LINES) {
              stderrTail.shift();
            }
          }
        }
      });
    }

    let targets: any[] = [];
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (spawnError !== null) {
        // Lỗi khởi chạy tiến trình (vd ENOENT do thiếu executable) -> thoát vòng lặp ngay
        break;
      }
      if (exitCode !== null) {
        // Chrome đã thoát sớm, không chờ vô ích
        break;
      }
      try {
        const res = await fetch(`http://127.0.0.1:${currentPort}/json`, {
          signal: AbortSignal.timeout(fetchTimeoutMs),
        });
        if (res.ok) {
          const data = (await res.json()) as any[];
          if (Array.isArray(data)) {
            const page = data.find((t) => t?.type === "page" && t.webSocketDebuggerUrl);
            if (page) {
              targets = data;
              break;
            }
          }
        }
      } catch {
        // Cổng chưa mở hoặc fetch bị timeout / từ chối kết nối
      }
      if (spawnError !== null) {
        break;
      }
      await sleep(pollIntervalMs);
    }

    // Nếu gặp lỗi khởi chạy (vd ENOENT thiếu Chrome), không thử lại lần 2 mà ném lỗi ngay
    if (spawnError !== null) {
      killChrome(chrome);
      throw new Error(`Không chạy được ${executable}: ${(spawnError as Error).message}`, {
        cause: spawnError,
      });
    }

    // Đợi 50 ms để pipe stderr flush hết dữ liệu đệm nếu tiến trình vừa thoát.
    // 50 ms là khoảng thời gian heuristic đủ cho I/O pipe cục bộ trên Linux/macOS trước khi đọc đuôi stderr.
    if (exitCode !== null) {
      await sleep(50);
    }

    const elapsedMs = Date.now() - start;
    if (partialLine.trim().length > 0) {
      stderrTail.push(partialLine);
      if (stderrTail.length > MAX_STDERR_TAIL_LINES) {
        stderrTail.shift();
      }
    }

    lastDiag = {
      attempts: attempt,
      elapsedMs,
      exitCode,
      signal: exitSignal,
      stderrTail: [...stderrTail],
    };
    allDiags.push(lastDiag);

    const first = targets.find((t) => t.type === "page");
    if (first?.webSocketDebuggerUrl) {
      return {
        chrome,
        cdpPort: currentPort,
        targets,
        webSocketDebuggerUrl: first.webSocketDebuggerUrl,
        kill: () => killChrome(chrome),
        diag: lastDiag,
      };
    }

    // Lần dựng này thất bại: dọn tiến trình Chrome cũ trước khi thử lại
    killChrome(chrome);
  }

  // Cả hai lần thử đều thất bại: ném lỗi kèm chẩn đoán chi tiết cả hai lần
  const diag = lastDiag!;
  const diagLines = [
    `Không kết nối được Chrome DevTools sau ${diag.elapsedMs} ms (đã thử ${diag.attempts} lần).`,
    `exitCode: ${diag.exitCode !== null ? diag.exitCode : "null"}, signal: ${diag.signal ?? "null"}, port: ${currentPort}`,
  ];

  if (allDiags.length > 1) {
    diagLines.push("Chi tiết các lần thử:");
    for (let i = 0; i < allDiags.length; i++) {
      const d = allDiags[i];
      diagLines.push(
        `--- Lần ${i + 1} (${d.elapsedMs} ms, exitCode: ${d.exitCode !== null ? d.exitCode : "null"}, signal: ${d.signal ?? "null"}) ---`,
      );
      if (d.stderrTail.length > 0) {
        diagLines.push(`Stderr (~${d.stderrTail.length} dòng cuối):`);
        for (const l of d.stderrTail) {
          diagLines.push(`  ${l}`);
        }
      } else {
        diagLines.push("Stderr: (trống)");
      }
    }
  } else {
    if (diag.stderrTail.length > 0) {
      diagLines.push(`Stderr (~${diag.stderrTail.length} dòng cuối):`);
      for (const l of diag.stderrTail) {
        diagLines.push(`  ${l}`);
      }
    } else {
      diagLines.push("Stderr: (trống)");
    }
  }

  throw new Error(diagLines.join("\n"));
}
