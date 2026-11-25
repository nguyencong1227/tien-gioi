/* global fetch, setTimeout */
// Chờ Chrome headless sẵn sàng cho các kịch bản `check-*.mjs` chạy ở E2E hằng đêm (#1458).
// Trước đây mỗi script tự lặp 15 s (100 x 150 ms) cho page target và 12-16 s cho cảnh: runner CI khởi động Chrome chậm làm kịch bản đỏ oan
// ("Không tìm thấy Chrome page target" sau 15,3 s ở run 45539915300 / 45243928886). 60 s là mức A đã chốt cho `check-inv-select` / `check-move-keys` (#1389);
// các `e2e-*.ts` dùng `launchChrome` (30 s + thử lại một lần, `server/scripts/e2e-chrome.ts`).

/** Chờ tối đa chừng này ms cho Chrome mở cổng CDP và cho cảnh sẵn sàng */
export const START_WAIT_MS = 60000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Chờ Chrome mở cổng CDP và có một target loại `page`. Trả target (có `webSocketDebuggerUrl`) hoặc `null` khi hết hạn.
 * Lỗi nối / JSON hỏng / chưa có page đều chỉ là "chưa sẵn sàng", thử lại sau 150 ms.
 */
export async function waitPageTarget(cdpPort, timeoutMs = START_WAIT_MS) {
  for (const t0 = Date.now(); Date.now() - t0 < timeoutMs;) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json`);
      const list = await res.json();
      const page = Array.isArray(list) ? list.find((t) => t && t.type === "page") : null;
      if (page && page.webSocketDebuggerUrl) return page;
    } catch {
      // Chrome chưa mở cổng
    }
    await sleep(150);
  }
  return null;
}

/** Chờ `probe()` (hàm async trả giá trị thật / giả) tới khi đúng hoặc hết `timeoutMs`; trả giá trị cuối của `probe`. */
export async function waitUntilTrue(probe, timeoutMs = START_WAIT_MS, stepMs = 200) {
  let last = false;
  for (const t0 = Date.now(); Date.now() - t0 < timeoutMs;) {
    await sleep(stepMs);
    last = await probe();
    if (last) return last;
  }
  return last;
}
