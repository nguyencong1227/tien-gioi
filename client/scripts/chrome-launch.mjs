/* global process, console, setTimeout */
// Khởi động Chrome headless cho các kịch bản `check-*.mjs` ở E2E hằng đêm (#1458, A đề nghị ở #1458): thay mẫu `spawn("google-chrome")` + vòng chờ 15 s chép ở từng tệp.
// Giống `launchChrome` của `server/scripts/e2e-chrome.ts` (#1432): chờ page target 30 s (60 s khi CI: runner khởi động Chrome nguội chậm, run 45539915300 đỏ oan ở 15,3 s),
// tự thử lại ĐÚNG MỘT lần với cổng + thư mục hồ sơ mới, và khi hỏng in đủ chẩn đoán (lần thử, mã thoát / tín hiệu, đuôi stderr của Chrome) thay vì chỉ "Không tìm thấy Chrome page target".
// `close()` dọn CẢ NHÓM tiến trình (Chrome có nhiều tiến trình con; `chrome.kill()` đơn lẻ để lại tiến trình mồ côi) và xoá thư mục hồ sơ tạm.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getChromeGpuFlags } from "./chrome-gpu.mjs";
import { waitPageTarget } from "./chrome-wait.mjs";
import { freePort } from "./free-port.mjs";

/** Số dòng cuối của stderr Chrome giữ lại để chẩn đoán */
export const STDERR_TAIL_LINES = 20;
/** Chờ page target mỗi lần thử: 60 s khi CI (khởi động nguội chậm), 30 s ở máy dev */
export const pageWaitMs = () => (process.env.CI ? 60000 : 30000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Một lần khởi động: cổng + hồ sơ mới, Chrome nhóm tiến trình riêng, giữ đuôi stderr. Chưa chờ page target. */
async function startChrome({ name, extraArgs, url, bin }) {
  const cdpPort = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `tg-check-${name}-`));
  const args = [
    "--headless=new",
    "--no-sandbox",
    ...extraArgs,
    ...getChromeGpuFlags(),
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tmp}`,
    url,
  ];
  const chrome = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"], detached: true });
  const tail = [];
  let exit = null;
  let spawnError = null;
  chrome.stderr.on("data", (d) => {
    for (const line of String(d).split("\n")) {
      if (line.trim()) tail.push(line.trim());
    }
    if (tail.length > STDERR_TAIL_LINES) tail.splice(0, tail.length - STDERR_TAIL_LINES);
  });
  chrome.once("exit", (code, signal) => {
    exit = { code, signal };
  });
  chrome.once("error", (e) => {
    spawnError = e;
  });
  const close = async () => {
    try {
      process.kill(-chrome.pid, "SIGKILL"); // cả nhóm
    } catch {
      try {
        chrome.kill("SIGKILL");
      } catch {
        // đã thoát
      }
    }
    if (exit === null && spawnError === null) {
      await new Promise((r) => {
        chrome.once("exit", r);
        setTimeout(r, 1500);
      });
    }
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // bỏ qua
    }
  };
  return {
    chrome,
    cdpPort,
    tmp,
    close,
    stopped: () => exit !== null || spawnError !== null,
    diag: () => ({
      exit,
      spawnError: spawnError ? String(spawnError.message ?? spawnError) : null,
      stderrTail: [...tail],
    }),
  };
}

/**
 * Khởi động Chrome và chờ page target; thử lại đúng một lần khi hỏng. Trả `{ chrome, cdpPort, tmp, page, attempts, close }`.
 * Hỏng cả hai lần thì dọn sạch và ném Error kèm chẩn đoán từng lần.
 * @param {{ name: string, extraArgs?: string[], url?: string, waitMs?: number, attempts?: number, bin?: string }} opts
 */
export async function launchChrome(opts) {
  const {
    name,
    extraArgs = [],
    url = "about:blank",
    waitMs = pageWaitMs(),
    attempts = 2,
    bin = process.env.CHROME_BIN || "google-chrome",
  } = opts;
  const failures = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = Date.now();
    const h = await startChrome({ name, extraArgs, url, bin });
    const page = await waitPageTarget(h.cdpPort, waitMs, h.stopped);
    if (page) {
      if (attempt > 1) {
        console.log(
          `  (Chrome khởi động được ở lần thử ${attempt}; lần trước: ${failures.at(-1)})`,
        );
      }
      return {
        chrome: h.chrome,
        cdpPort: h.cdpPort,
        tmp: h.tmp,
        page,
        attempts: attempt,
        close: h.close,
      };
    }
    const d = h.diag();
    const why = d.spawnError
      ? `không chạy được "${bin}": ${d.spawnError}`
      : d.exit
        ? `Chrome thoát sớm (mã ${d.exit.code}, tín hiệu ${d.exit.signal})`
        : `hết ${Math.round((Date.now() - started) / 1000)} s mà cổng CDP ${h.cdpPort} chưa có page target`;
    failures.push(
      d.stderrTail.length > 0 ? `${why}; stderr: ${d.stderrTail.slice(-5).join(" | ")}` : why,
    );
    await h.close();
    if (attempt < attempts) await sleep(500);
  }
  throw new Error(
    `Không tìm thấy Chrome page target sau ${attempts} lần khởi động (kịch bản ${name}): ${failures
      .map((f, i) => `[lần ${i + 1}] ${f}`)
      .join(" ; ")}`,
  );
}
