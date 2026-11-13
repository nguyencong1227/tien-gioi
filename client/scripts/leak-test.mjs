/* global console, setTimeout, fetch */
/**
 * Script kiểm tra rò rỉ tài nguyên client (Leak Checker)
 * M5.1, Issue #330, THIET_KE_GIAO_DIEN_DO_HOA.md mục 10 & 12.
 *
 * Kiểm tra:
 * - Ra / vào bí cảnh / bản đồ và mở / đóng modal 20 lần liên tục
 * - Đo lường các chỉ số:
 *   1. Số lượng textures trong Scene Textures Cache
 *   2. Số lượng GameObjects trong Scene Children List
 *   3. Số lượng listeners và tweens
 *   4. Tăng trưởng bộ nhớ JS Heap <= 10% (theo perf-budget.json)
 *
 * Chạy:
 *   node client/scripts/leak-test.mjs [--iterations=20] [--quick]
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, "../..");
const DIST = path.join(REPO, "client/dist");
const BUDGET_PATH = path.join(REPO, "client/perf-budget.json");

const MIMES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

/**
 * Các bản đồ ngoài mà mỗi chu kỳ dựng lại hình ảnh lần lượt (#408 bước 4): lớp ô, trang trí, nước, sương, thời tiết, ánh sáng của MỖI bản đồ
 * đều phải dỡ sạch khi rời đi (trước đây chỉ Lạc Hà). Phần tử đầu là bản đồ "gốc": hai lần đọc chỉ số (đầu / cuối) đều đọc khi đang ở đó,
 * nếu không số đối tượng khác nhau giữa các bản đồ bị tính nhầm là rò rỉ.
 */
export const LEAK_MAP_IDS = ["lac_ha", "hac_phong", "am_suong"];

/** Biểu thức chạy trong trang: đổi `scene.map` sang bản đồ `id` (qua `window.__getMap`) và dựng lại hình ảnh; ném lỗi nếu id không tra được. */
export function rebuildMapExpr(id) {
  return `
    (() => {
      const sc = window.__scene;
      const m = window.__getMap && window.__getMap(${JSON.stringify(id)});
      if (!sc || !m) throw new Error("không tra được bản đồ " + ${JSON.stringify(id)});
      sc.map = m;
      sc.buildMapVisuals();
    })()
  `;
}

/**
 * Đánh giá kết quả rò rỉ (hàm thuần logic, dễ test)
 * @param {{ initial: any, final: any, maxHeapGrowthPercent: number, maxDamageNumbers?: number }} params
 * @returns {{ ok: boolean, heapGrowthPercent: number, errors: string[] }}
 */
export function evaluateLeakResults({
  initial,
  final,
  maxHeapGrowthPercent = 10.0,
  maxDamageNumbers = 28,
}) {
  const errors = [];

  // 1. Kiểm tra texture rò rỉ
  if (final.textures > initial.textures) {
    errors.push(
      `Rò rỉ Texture: số texture tăng từ ${initial.textures} lên ${final.textures} (+${final.textures - initial.textures})`,
    );
  }

  // 2. Kiểm tra GameObjects rò rỉ (phân biệt giữa đối tượng cơ sở và pool BitmapText tái dùng)
  const initialBase = initial.gameObjects - (initial.bitmapTexts || 0);
  const finalBase = final.gameObjects - (final.bitmapTexts || 0);
  const diffBase = finalBase - initialBase;
  if (diffBase > 1) {
    errors.push(
      `Rò rỉ GameObjects cơ sở: số đối tượng tăng từ ${initialBase} lên ${finalBase} (+${diffBase})`,
    );
  }

  // Pool BitmapText không được vượt trần damageNumbers
  if (final.bitmapTexts > maxDamageNumbers) {
    errors.push(
      `Rò rỉ Pool chữ bay: số BitmapText (${final.bitmapTexts}) vượt trần ngân sách (${maxDamageNumbers})`,
    );
  }

  // 3. Kiểm tra JS Heap tăng trưởng
  let heapGrowthPercent = 0;
  if (initial.heapBytes > 0) {
    heapGrowthPercent = Number(
      (((final.heapBytes - initial.heapBytes) / initial.heapBytes) * 100).toFixed(2),
    );
    if (heapGrowthPercent > maxHeapGrowthPercent) {
      errors.push(
        `Tăng trưởng JS Heap ${heapGrowthPercent}% vượt ngưỡng cho phép <= ${maxHeapGrowthPercent}% (Ban đầu: ${(initial.heapBytes / 1048576).toFixed(1)} MB, Sau cùng: ${(final.heapBytes / 1048576).toFixed(1)} MB)`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    heapGrowthPercent,
    errors,
  };
}

async function runLeakTest() {
  const args = process.argv.slice(2);
  const isQuick = args.includes("--quick");
  const iterArg = args.find((a) => a.startsWith("--iterations="))?.split("=")[1];
  const iterations = iterArg ? parseInt(iterArg, 10) : isQuick ? 5 : 20;

  let maxHeapGrowthPercent = 10.0;
  if (fs.existsSync(BUDGET_PATH)) {
    try {
      const budget = JSON.parse(fs.readFileSync(BUDGET_PATH, "utf-8"));
      if (budget.runtime?.leak?.maxHeapGrowthPercent) {
        maxHeapGrowthPercent = budget.runtime.leak.maxHeapGrowthPercent;
      }
    } catch {
      // Dùng mặc định
    }
  }

  console.log(`=== KIỂM TRA RÒ RỈ TÀI NGUYÊN CLIENT (LEAK TEST: ${iterations} LẦN LẶP) ===`);

  // Web server tĩnh
  const server = http.createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    let filePath = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
    if (!fs.existsSync(filePath)) filePath = path.join(DIST, "index.html");
    const ext = path.extname(filePath);
    const mime = MIMES[ext] || "application/octet-stream";
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": mime });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });

  const HTTP_PORT = await freePort();
  await new Promise((resolve) => server.listen(HTTP_PORT, "127.0.0.1", resolve));

  const CDP_PORT = await freePort();
  const tmpChromeDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-leak-test-"));

  const chromeProcess = spawn("google-chrome", [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--enable-precise-memory-info", // không có cờ này performance.memory bị làm nhiễu / lượng tử hoá (±2 MB), phép đo heap dao động
    `--user-data-dir=${tmpChromeDir}`,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "about:blank",
  ]);

  try {
    // 30 s (không phải 4 s): lần mở Chrome đầu tiên trên runner CI lạnh có thể chậm (run đầu của #398 đỏ vì 15 s không đủ)
    let chromeUp = false;
    for (let i = 0; i < 300; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        if (res.ok) {
          chromeUp = true;
          break;
        }
      } catch {
        // Đợi Chrome
      }
      await sleep(100);
    }
    // Báo rõ (giống measure-mobile-perf.mjs) thay vì nổ ECONNREFUSED ở fetch(/json/new) bên dưới
    if (!chromeUp) throw new Error("Chrome headless không khởi động kịp sau 30 giây.");

    const newTabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, {
      method: "PUT",
    });
    const tabData = await newTabRes.json();
    const cdpWs = new WebSocket(tabData.webSocketDebuggerUrl);
    await new Promise((resolve) => cdpWs.on("open", resolve));

    let cdpId = 1;
    const pending = new Map();
    cdpWs.on("message", (data) => {
      const msg = JSON.parse(data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    });

    const cdpSend = (method, params = {}) =>
      new Promise((resolve) => {
        const id = cdpId++;
        pending.set(id, resolve);
        cdpWs.send(JSON.stringify({ id, method, params }));
      });

    await cdpSend("Page.enable");
    await cdpSend("Runtime.enable");
    await cdpSend("HeapProfiler.enable");

    // Đánh dấu bỏ qua bảng chỉ dẫn người mới và đặt chất lượng cao
    await cdpSend("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        try {
          localStorage.setItem('tg_newbie_guide_dismissed', '1');
          localStorage.setItem('tg_quality', 'high');
        } catch(e) {}
      `,
    });

    await cdpSend("Page.navigate", {
      // Sương + thời tiết + nước BẬT (`?debug` mặc định tắt cả ba): cũng là thứ cần kiểm có rò rỉ khi chạy liên tục
      url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1&perf=1&weather=1&fog=1&water=1`,
    });

    // Chờ Scene sẵn sàng
    for (let i = 0; i < 50; i++) {
      await sleep(200);
      const res = await cdpSend("Runtime.evaluate", {
        expression: `Boolean(window.__scene && window.__ui)`,
        returnByValue: true,
      });
      if (res?.result?.result?.value) break;
    }

    await sleep(1000);

    // Mọi bản đồ trong LEAK_MAP_IDS phải tra được ngay trong trang, nếu không cả phép lặp bản đồ là vô nghĩa (đỏ rõ, không xanh giả)
    for (const id of LEAK_MAP_IDS) {
      const probe = await cdpSend("Runtime.evaluate", {
        expression: `Boolean(window.__getMap && window.__getMap(${JSON.stringify(id)}))`,
        returnByValue: true,
      });
      if (probe?.result?.result?.value !== true) {
        throw new Error(`Trang không tra được bản đồ "${id}" bằng window.__getMap (cần ?debug).`);
      }
    }

    // Thu thập trạng thái ban đầu
    const readMetrics = async () => {
      const r = await cdpSend("Runtime.evaluate", {
        expression: `
          (() => {
            const sc = window.__scene;
            const textures = sc ? Object.keys(sc.textures.list || {}).length : 0;
            let vramBytes = 0;
            if (sc && sc.textures?.list) {
              for (const tex of Object.values(sc.textures.list)) {
                const src = tex.source?.[0] || tex.frames?.__BASE__?.source;
                if (src && src.width > 0 && src.height > 0) {
                  vramBytes += src.width * src.height * 4;
                }
              }
            }
            const gameObjects = sc ? (sc.children?.list?.length || 0) : 0;
            const tweens = sc ? ((sc.tweens?.tweens?.length) ?? (sc.tweens?.getTweens?.().length || 0)) : 0;
            const heapBytes = performance?.memory ? performance.memory.usedJSHeapSize : 0;
            const bitmapTexts = sc ? sc.children.list.filter(c => c.type === 'BitmapText' || c.constructor.name === 'BitmapText').length : 0;
            return { textures, vramBytes, gameObjects, tweens, heapBytes, bitmapTexts };
          })()
        `,
        returnByValue: true,
      });
      return r?.result?.result?.value;
    };

    // Dọn rác 3 lần liên tiếp rồi mới đọc heap: một lần GC thường để sót các đối tượng thế hệ già, đọc lệch +-1,5 MB giữa các lần chạy
    const settleHeap = async () => {
      for (let g = 0; g < 3; g++) {
        try {
          await cdpSend("HeapProfiler.collectGarbage");
        } catch {
          // Bỏ qua nếu trình duyệt không hỗ trợ HeapProfiler
        }
        await sleep(150);
      }
    };
    // Một chu kỳ của phép đo (modal + hiệu ứng + dựng lại bản đồ). Dùng chung cho giai đoạn khởi động và giai đoạn đo.
    const cycleExpr = (i) => `
          if (window.__ui) {
            window.__ui.toggleCharModal(true);
            window.__ui.toggleInventory(true);
            window.__ui.toggleSettingsModal(true);
            window.__ui.closeAllModals();
          }
          if (window.__scene) {
            if (window.__scene.fx) {
              window.__scene.fx.play("hit-spark", 100, 100, { priority: 2 });
              window.__scene.fx.floatNumber("+99", 100, 100, { color: 0x44ff44, size: 16 });
            }
          }
          ${rebuildMapExpr(LEAK_MAP_IDS[i % LEAK_MAP_IDS.length])};
        `;
    // Về bản đồ gốc rồi mới đọc chỉ số (xem LEAK_MAP_IDS)
    const settleMap = () =>
      cdpSend("Runtime.evaluate", { expression: rebuildMapExpr(LEAK_MAP_IDS[0]) });
    // Khởi động: vài chu kỳ ĐẦY ĐỦ (cả dựng lại bản đồ) trước khi đọc chỉ số ban đầu. Lần dựng lại đầu tiên làm V8 / Phaser
    // nạp bộ nhớ đệm một lần (~2 MB heap, đo bằng 150 chu kỳ riêng: sau đó chỉ ~20 KB mỗi lần), không phải rò rỉ; không khởi
    // động thì ngưỡng 10 % trên 20 chu kỳ dao động quanh 9-11 % tuỳ lần chạy.
    const WARMUP_CYCLES = 8;
    for (let w = 0; w < WARMUP_CYCLES; w++) {
      await cdpSend("Runtime.evaluate", { expression: cycleExpr(w) });
      await sleep(80);
    }
    // Ép buộc dọn rác (GC) trước khi đọc chỉ số ban đầu để kết quả đo heap chính xác
    await settleMap();
    await settleHeap();
    await sleep(300);

    const initial = await readMetrics();
    console.log(
      `- Ban đầu: Textures=${initial.textures} (VRAM ${(initial.vramBytes / 1048576).toFixed(2)} MB) | GameObjects=${initial.gameObjects} (Base=${initial.gameObjects - initial.bitmapTexts}, BitmapTexts=${initial.bitmapTexts}) | Heap=${(initial.heapBytes / 1048576).toFixed(1)} MB`,
    );

    console.log(
      `- Đang thực hiện ${iterations} chu kỳ mở/đóng modal, tương tác hiệu ứng & dựng lại bản đồ...`,
    );
    for (let cycle = 1; cycle <= iterations; cycle++) {
      await cdpSend("Runtime.evaluate", { expression: cycleExpr(WARMUP_CYCLES + cycle) });
      await sleep(120);
    }

    // Đợi dọn dẹp các hiệu ứng hoàn tất và ép buộc dọn rác (GC)
    await sleep(500);
    await settleMap();
    await settleHeap();
    await sleep(300);

    const final = await readMetrics();
    console.log(
      `- Sau cùng: Textures=${final.textures} (VRAM ${(final.vramBytes / 1048576).toFixed(2)} MB) | GameObjects=${final.gameObjects} (Base=${final.gameObjects - final.bitmapTexts}, BitmapTexts=${final.bitmapTexts}) | Heap=${(final.heapBytes / 1048576).toFixed(1)} MB`,
    );

    const evaluation = evaluateLeakResults({ initial, final, maxHeapGrowthPercent });

    console.log(
      `\n- Tăng trưởng Heap: ${evaluation.heapGrowthPercent}% (Ngân sách: <= ${maxHeapGrowthPercent}%)`,
    );
    if (!evaluation.ok) {
      console.error("❌ PHÁT HIỆN RÒ RỈ TÀI NGUYÊN:");
      for (const err of evaluation.errors) {
        console.error(`  - ${err}`);
      }
      // KHÔNG gọi process.exit(1) ở đây: nó bỏ qua `finally` nên Chrome mồ côi chạy mãi (mỗi con ~250 % CPU, đã làm tải máy lên 75)
      process.exitCode = 1;
      return;
    }

    console.log("🎉 KHÔNG CÓ RÒ RỈ TÀI NGUYÊN! TẤT CẢ CHỈ SỐ ỔN ĐỊNH.");
    cdpWs.close();
  } finally {
    chromeProcess.kill("SIGKILL");
    server.close();
    try {
      fs.rmSync(tmpChromeDir, { recursive: true, force: true });
    } catch {
      // Bỏ qua
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runLeakTest().catch((err) => {
    console.error("Lỗi khi chạy leak test:", err);
    process.exit(1);
  });
}
