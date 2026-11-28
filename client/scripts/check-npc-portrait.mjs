/* global console, setTimeout, Buffer */
/**
 * Kiểm CHÂN DUNG NPC ở HỘP THOẠI (`client/src/npc-portrait.ts`, gói tải theo nhu cầu `art:npc`; M7.12 / #513) trong Chrome THẬT, chế độ mock (không cần máy chủ /
 * Vite), qua ĐƯỜNG TẢI THẬT của gói (manifest -> tải tệp -> URL có băm -> giải mã): máy chủ tĩnh của script dựng một gói GIẢ `art:npc` (ảnh thế chỗ
 * `login_bg.webp`, cỡ + băm tính từ tệp thật), còn `NPC_PORTRAITS` thì đặt qua `window.__npcPortraitOverride` (chỉ có ở `?debug`) vì chưa có ảnh lô 3.
 *
 *   npm run build -w client && node client/scripts/check-npc-portrait.mjs [--shots <thư mục>] [--vp <khung>] [--slow-frame <ms>]
 *
 * Sáu khung (năm chuẩn + 568x320): gói tải OK => chân dung HIỆN sau khi tải xong, vuông, nằm TRỌN trong đầu hộp thoại, tên NPC và nút Đóng KHÔNG bị đè,
 * hộp thoại gọn khung; manifest tải MỘT lần, tệp bằng URL có băm; vẽ lại hộp thoại cùng NPC KHÔNG chớp; đổi sang NPC không chân dung thì ảnh ẩn NGAY;
 * đóng hộp thoại thì ẩn. Riêng 1280x720: không có gói, tệp gói lỗi 404, gói về MUỘN (ẩn rồi hiện), đóng hộp thoại TRƯỚC khi gói về (không hiện).
 * `--shots`: lưu ảnh hộp thoại có chân dung mỗi khung.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";
import { launchChrome } from "./chrome-launch.mjs";
import { waitUntilTrue } from "./chrome-wait.mjs";
import { slowFrameMs, slowFrameSource } from "./slow-frame.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const __filename = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(__filename), "../..");
const DIST = path.join(REPO, "client/dist");

/** Năm khung nhìn như `check-forge-shop.mjs` + một khung điện thoại ngang nhỏ. */
export const VIEWPORTS = [
  { name: "1280x720", w: 1280, h: 720, dpr: 1, mobile: false },
  { name: "768x1024", w: 768, h: 1024, dpr: 2, mobile: true },
  { name: "844x390", w: 844, h: 390, dpr: 2, mobile: true },
  { name: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
  { name: "360x640", w: 360, h: 640, dpr: 2, mobile: true },
  // Điện thoại ngang NHỎ (iPhone SE ngang): khung duy nhất mà trần theo chiều cao (`40vh`) của thẻ có tác dụng
  { name: "568x320", w: 568, h: 320, dpr: 2, mobile: true },
];

async function main() {
  const shotsArg = process.argv.indexOf("--shots");
  const shotsDir = shotsArg >= 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
  const onlyVp = process.argv.includes("--vp")
    ? process.argv[process.argv.indexOf("--vp") + 1]
    : null;
  if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
  if (!fs.existsSync(path.join(DIST, "index.html")))
    throw new Error("Chưa có client/dist: chạy `npm run build -w client` trước.");

  const MIMES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  // Gói GIẢ `art:trum`: ảnh thế chỗ là `login_bg.webp` của bản dựng. `packMode` đổi theo từng ca (script gán trước khi mở trang).
  const standBase = fs.readFileSync(path.join(DIST, "assets/ai/login_bg.webp"));
  // Mỗi chế độ một tệp có băm KHÁC (thêm vài byte đuôi, ảnh vẫn giải mã được): URL `?v=<băm>` khác nên không dính bộ nhớ đệm của Service
  // Worker từ ca trước (nếu không thì ca "lỗi" / "muộn" lấy ảnh từ bộ nhớ đệm và không thử được gì).
  const payloadOf = (mode) =>
    mode === "ok" ? standBase : Buffer.concat([standBase, Buffer.from(mode)]);
  const shaOf = (b) => crypto.createHash("sha256").update(b).digest("hex");
  const PACK_FILE = "art-npc/npc_duoc_su.webp";
  const state = { packMode: "ok", manifestHits: 0, manifestReqs: 0, fileUrls: [], served: 0 };
  const server = http.createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    if (urlPath === "/packs/manifest.json") state.manifestReqs++; // mọi yêu cầu manifest (kể cả ca "không có gói"): kịch bản chờ THEO yêu cầu thay vì ngủ cố định
    if (urlPath === "/packs/manifest.json" && state.packMode !== "none") {
      state.manifestHits++;
      const body = payloadOf(state.packMode);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          packs: [
            {
              id: "art:npc",
              kind: "art",
              files: [{ path: PACK_FILE, bytes: body.length, sha256: shaOf(body) }],
              bytes: body.length,
            },
          ],
        }),
      );
      return;
    }
    if (urlPath === `/packs/${PACK_FILE}`) {
      state.fileUrls.push(req.url);
      if (state.packMode === "badfile") {
        res.writeHead(404);
        res.end();
        state.served++;
        return;
      }
      const body = payloadOf(state.packMode);
      const send = () => {
        res.writeHead(200, { "Content-Type": "image/webp", "Cache-Control": "no-store" });
        res.end(body);
        state.served++;
      };
      if (state.packMode === "slow" || state.packMode === "slow2") setTimeout(send, 4500);
      else send();
      return;
    }
    // Đường dẫn lạ trả index.html (text/html): manifest 404 thành "không có gói", đúng ca máy chủ tĩnh không có /packs/
    let filePath = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
    if (!fs.existsSync(filePath)) filePath = path.join(DIST, "index.html");
    try {
      res.writeHead(200, {
        "Content-Type": MIMES[path.extname(filePath)] || "application/octet-stream",
      });
      res.end(fs.readFileSync(filePath));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  const HTTP_PORT = await freePort();
  await new Promise((r) => server.listen(HTTP_PORT, "127.0.0.1", r));
  let launched = null;
  let failures = 0;
  const check = (ok, msg) => {
    console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
    if (!ok) failures++;
  };
  try {
    launched = await launchChrome({ name: "npc-portrait" });
    const page = launched.page;
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    let nextId = 1;
    const pending = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    };
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evalJs = async (expression) => {
      const r = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
      return r.result?.result?.value;
    };
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", {
      // `--slow-frame <ms>` (hoặc `TG_SLOW_FRAME_MS`): giả lập runner khung chậm, xem `slow-frame.mjs`
      source: `try { localStorage.setItem('tg_newbie_guide_dismissed','1'); localStorage.setItem('tg_quality','low'); } catch (e) {}${slowFrameSource(slowFrameMs())}`,
    });

    const DIALOG_MSG = (npcId) => ({
      npcId,
      lines: [
        "Đạo hữu đến thật đúng lúc. Linh dược trong núi Hắc Phong dạo này bị yêu thú giẫm nát hết cả.",
      ],
      options: [
        {
          label: "Nhận nhiệm vụ: Thu hái Huyết Tinh Thảo",
          action: { kind: "accept", questId: "x" },
        },
        { label: "Cửa hàng", action: { kind: "shop" } },
        { label: "Rời đi", action: { kind: "close" } },
      ],
    });
    /** Mở trang mock mới với chế độ gói `mode`; trả về khi cảnh sẵn sàng. */
    const loadPage = async (vp, mode) => {
      state.packMode = mode;
      state.manifestHits = 0;
      state.manifestReqs = 0;
      state.served = 0;
      state.fileUrls.length = 0;
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile,
      });
      await evalJs("window.__isOldPage = true");
      await send("Page.navigate", {
        url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1&map=am_suong`,
      });
      const ready = await waitUntilTrue(
        async () =>
          Boolean(
            await evalJs(
              `Boolean(!window.__isOldPage && window.__scene && window.__ui && window.__npcPortraitOverride && !document.getElementById("ui")?.hidden)`,
            ),
          ),
        60000,
        200,
      );
      if (!ready) return false;
      // Chờ THEO ĐIỀU KIỆN thay `sleep(500)`: phông đã tải xong và `data-input` đã đặt lên <html>
      const settled = await waitUntilTrue(
        async () =>
          Boolean(
            await evalJs(
              `document.fonts.status === "loaded" && Boolean(document.documentElement.dataset.input)`,
            ),
          ),
        30000,
        100,
      );
      if (!settled) throw new Error("phông chưa tải xong / thiếu data-input sau 30 s");
      await evalJs(
        `["dungeon-mock-badge", "duel-mock-badge"].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; })`,
      );
      await evalJs(`window.__scene.room.send = () => {}; 1`);
      return true;
    };
    const openDialog = (npcId) =>
      evalJs(`window.__ui.onDialog(${JSON.stringify(DIALOG_MSG(npcId))}); 1`);
    const measure = () =>
      evalJs(`(() => {
        const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, shown: e.getClientRects().length > 0 }; };
        const art = document.getElementById("dlg-npc-art");
        const modal = document.getElementById("dialog-modal");
        const head = document.querySelector("#dialog-modal .dlg-head");
        const name = document.getElementById("dlg-npc-name");
        const close = document.getElementById("dlg-close");
        return {
          vw: window.innerWidth, vh: window.innerHeight,
          open: !modal.hidden, modal: R(modal), head: R(head), art: R(art), name: R(name), close: R(close),
          nameText: name.textContent,
          artHidden: art.hidden, artSrc: art.getAttribute("src"), nw: art.naturalWidth, nh: art.naturalHeight,
          artAlt: art.getAttribute("alt"), artAria: art.getAttribute("aria-hidden"), artPtr: getComputedStyle(art).pointerEvents,
          scrollW: document.documentElement.scrollWidth,
        };
      })()`);
    /** Chờ `n` khung hình của trang (rAF liên tiếp) để trang kịp xử lý một phản hồi mạng đã tới; ở khung chậm mỗi khung dài hơn nên chờ tự co giãn theo. */
    const frames = (n) =>
      evalJs(
        `new Promise((r) => { let k = ${n}; const f = () => (--k <= 0 ? r(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })`,
      );
    /** Chờ THEO SỰ KIỆN thay `sleep` cố định: `cond()` (đọc bộ đếm của máy chủ giả) đúng thì thêm 8 khung hình + 250 ms cho trang xử lý xong phản hồi rồi mới đo ca "KHÔNG hiện". */
    const afterEvent = async (cond, what) => {
      const seen = await waitUntilTrue(async () => cond(), 30000, 50);
      if (!seen) throw new Error(`máy chủ giả chưa thấy ${what} sau 30 s`);
      await frames(8);
      await sleep(250);
    };
    /** Chờ tới khi `pred(m)` đúng (tối đa `ms`), trả số đo cuối. */
    const until = async (pred, ms = 15000) => {
      let m = await measure();
      for (let t = 0; t < ms && !pred(m); t += 150) {
        await sleep(150);
        m = await measure();
      }
      return m;
    };

    for (const vp of VIEWPORTS) {
      if (onlyVp && vp.name !== onlyVp) continue;
      console.log(`\n=== ${vp.name} ===`);

      // ---- A. gói tải OK (đường tải thật) ----
      if (!(await loadPage(vp, "ok"))) {
        console.log("  ✗ cảnh không sẵn sàng (cần ?debug)");
        failures++;
        continue;
      }
      await evalJs(`window.__npcPortraitOverride("duoc_su", "npc_duoc_su.webp"); 1`);
      await openDialog("duoc_su");
      let m = await until((x) => x.open && x.art.shown);
      check(m.open && m.nameText === "Hà lão", "hộp thoại mở với tên Hà lão");
      check(m.art.shown && !m.artHidden, "chân dung HIỆN sau khi gói tải xong");
      check(
        m.artSrc !== null && /^\/packs\/art-npc\/npc_duoc_su\.webp\?v=[0-9a-f]{12}$/.test(m.artSrc),
        `chân dung trỏ URL CÓ BĂM của tệp trong gói (${m.artSrc})`,
      );
      check(m.nw > 0 && m.nh > 0, `ảnh đã giải mã (${m.nw}x${m.nh})`);
      check(
        Math.abs(m.art.w - m.art.h) < 0.5,
        `ảnh vuông (${Math.round(m.art.w)}x${Math.round(m.art.h)})`,
      );
      check(
        m.art.l >= m.head.l - 0.5 &&
          m.art.r <= m.head.r + 0.5 &&
          m.art.t >= m.head.t - 0.5 &&
          m.art.b <= m.head.b + 0.5,
        "ảnh nằm TRỌN trong đầu hộp thoại",
      );
      check(m.name.l >= m.art.r - 0.5, "tên NPC KHÔNG bị ảnh đè (nằm bên phải ảnh)");
      check(
        m.close.l >= m.name.r - 0.5 || m.close.t >= m.name.b - 0.5 || m.close.shown,
        "nút Đóng vẫn hiện",
      );
      check(
        m.close.r <= m.vw + 0.5 && m.close.l >= m.art.r - 0.5,
        `nút Đóng nằm gọn khung và không đè ảnh (phải ${Math.round(m.close.r)} / ${m.vw})`,
      );
      check(
        m.modal.l >= -0.5 &&
          m.modal.r <= m.vw + 0.5 &&
          m.modal.b <= m.vh + 0.5 &&
          m.scrollW <= m.vw + 1,
        `hộp thoại nằm gọn khung nhìn (không tràn ngang)`,
      );
      check(
        m.artAlt === "" && m.artAria === "true" && m.artPtr === "none",
        "ảnh chỉ trang trí: alt rỗng, aria-hidden, không bắt chuột",
      );
      check(state.manifestHits === 1, `manifest tải đúng MỘT lần (${state.manifestHits})`);
      // Tệp gói được lấy qua `fetch` (nạp gói) rồi qua `<img>` (giải mã): tối đa HAI yêu cầu mạng (máy chủ giả của script đặt `no-store` để đếm được; máy chủ thật cho phép
      // dùng lại bộ nhớ đệm HTTP / Service Worker), MỌI yêu cầu đều bằng URL CÓ BĂM. Số 1 hay 2 phụ thuộc Service Worker đã kích hoạt chưa nên KHÔNG ghim đúng một.
      check(
        state.fileUrls.length <= 2 && state.fileUrls.every((u) => /\?v=[0-9a-f]{12}$/.test(u)),
        `tệp gói được tải bằng URL có băm, tối đa hai yêu cầu (${state.fileUrls.length})`,
      );
      if (shotsDir) {
        const s = await send("Page.captureScreenshot", { format: "webp", quality: 75 });
        fs.writeFileSync(
          path.join(shotsDir, `hoi-thoai-co-chan-dung-${vp.name}.webp`),
          Buffer.from(s.result.data, "base64"),
        );
      }
      // vẽ lại hộp thoại cho CÙNG NPC (đổi lời / lựa chọn): ảnh GIỮ NGUYÊN, không ẩn rồi hiện lại (chớp)
      await openDialog("duoc_su");
      m = await measure(); // đo NGAY, không chờ
      check(
        m.art.shown && m.artSrc !== null,
        "vẽ lại hộp thoại cùng NPC: chân dung giữ nguyên (không chớp)",
      );
      // đổi sang NPC KHÔNG có chân dung: ảnh ẩn NGAY, bỏ src
      await openDialog("tho_ren");
      m = await measure();
      check(
        m.nameText === "Thiết Ngưu" && !m.art.shown && m.artSrc === null,
        "đổi sang NPC không chân dung: ảnh ẩn, bỏ src",
      );
      // về lại NPC có chân dung: hiện lại (gói đã có sẵn, không tải thêm manifest)
      await openDialog("duoc_su");
      m = await until((x) => x.art.shown, 12000);
      check(m.art.shown && m.nameText === "Hà lão", "về lại NPC có chân dung: ảnh hiện lại");
      check(state.manifestHits === 1, "vẫn chỉ MỘT lần tải manifest sau khi đổi NPC qua lại");
      // đóng hộp thoại: ảnh ẩn, bỏ src
      await evalJs(`window.__ui.closeDialog(); 1`);
      m = await measure();
      check(!m.open && !m.art.shown && m.artSrc === null, "đóng hộp thoại: ảnh ẩn, bỏ src");

      if (vp.name !== "1280x720") continue;

      // ---- B. không có gói nào (manifest 404): ảnh ẩn, hộp thoại bình thường ----
      await loadPage(vp, "none");
      await evalJs(`window.__npcPortraitOverride("duoc_su", "npc_duoc_su.webp"); 1`);
      await openDialog("duoc_su");
      await afterEvent(() => state.manifestReqs >= 1, "yêu cầu manifest");
      m = await measure();
      check(m.open && m.nameText === "Hà lão", "không có gói: hộp thoại vẫn mở với tên");
      check(!m.art.shown && m.artSrc === null, "không có gói: ảnh ẩn, không ô trống / ảnh vỡ");

      // ---- C. tệp gói lỗi (404): ảnh ẩn ----
      await loadPage(vp, "badfile");
      await evalJs(`window.__npcPortraitOverride("duoc_su", "npc_duoc_su.webp"); 1`);
      await openDialog("duoc_su");
      await afterEvent(() => state.served >= 1, "yêu cầu tệp gói (404)");
      m = await measure();
      check(m.open && !m.art.shown && m.artSrc === null, "tệp gói lỗi: hộp thoại vẫn mở, ảnh ẩn");

      // ---- D. gói về MUỘN (4,5 giây > 3 giây chờ): ẩn trước, hiện khi về nếu hộp thoại còn mở ----
      await loadPage(vp, "slow");
      await evalJs(`window.__npcPortraitOverride("duoc_su", "npc_duoc_su.webp"); 1`);
      await openDialog("duoc_su");
      await sleep(3600); // hợp đồng THỜI GIAN THẬT: client chờ gói 3 giây, máy chủ giả trả sau 4,5 giây (đồng hồ thật, không phụ thuộc tốc độ khung)
      m = await measure();
      check(m.open && !m.art.shown, "gói chưa về sau 3 giây: ảnh ẩn, hộp thoại vẫn dùng được");
      m = await until((x) => x.art.shown, 20000);
      check(m.art.shown && m.nw > 0, "gói về muộn: ảnh HIỆN (áp dụng khi về)");

      // ---- E. đóng hộp thoại TRƯỚC khi gói về muộn: về xong cũng KHÔNG hiện ----
      await loadPage(vp, "slow2");
      await evalJs(`window.__npcPortraitOverride("duoc_su", "npc_duoc_su.webp"); 1`);
      await openDialog("duoc_su");
      await sleep(3600); // như ca D: đóng khi gói chưa về (máy chủ giả trả sau 4,5 giây)
      await evalJs(`window.__ui.closeDialog(); 1`);
      await afterEvent(() => state.served >= 1, "gói về muộn"); // gói về trong lúc hộp thoại đã đóng
      m = await measure();
      check(
        !m.open && !m.art.shown && m.artSrc === null,
        "đóng hộp thoại trước khi gói về: ảnh KHÔNG hiện sau đó",
      );
    }
  } finally {
    if (launched) await launched.close();
    server.close();
  }
  console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} LỖI`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[1] === __filename) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
