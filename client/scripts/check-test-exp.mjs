import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm NHÃN "Thử nghiệm ×N" cạnh thanh Tu vi (QUYET_DINH_M3 mục 34, hợp đồng `shared/src/test-exp.ts`) trong Chrome THẬT (`?duel=mock&debug=1`, không cần máy chủ): đi đúng
// đường tin `testExp` của máy chủ (`window.__ui.onTestExp`, cùng hàm mà `WorldScene` gọi khi nhận tin) rồi đo nhãn trên HUD thật:
//  - mặc định ẨN và KHÔNG chiếm chỗ (HUD của người không có hệ số không đổi một điểm ảnh);
//  - `{ mult: 5 }` hiện đúng chữ "Thử nghiệm ×5" ngay DƯỚI thanh Tu vi, canh theo thanh, nằm trong màn hình và trong thẻ HUD, không đè nhãn / thanh nào, cỡ chữ >= 11 px,
//    có `title` / `aria-label` nói rõ; `{ mult: 2.5 }` -> "×2,5"; kẹp trần 10; `{ mult: 1 }` xoá nhãn; tin rác (chuỗi, NaN, thiếu mult) bị bỏ qua và GIỮ nhãn đang có;
//  - vào phòng mới (`WorldScene.setupNetwork(true)`) xoá nhãn cũ: `setTestExp(1)`;
//  - không tràn ngang, 0 lỗi JS. Có thể chụp ảnh: `--shots <thư mục>`.
// Mặc định tự dựng Vite của cây này trên cổng trống (tự tắt khi xong); `--url` để dùng client đang chạy sẵn.
//   node client/scripts/check-test-exp.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shots /tmp/tg-b-shots]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";
import { resolveClientUrl } from "./client-url.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE_URL = await resolveClientUrl(argOf("--url", ""));
const SHOTS = argOf("--shots", "");
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-test-exp-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    ...getChromeGpuFlags(),
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpDir}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures++;
};
try {
  let targets = [];
  for (let k = 0; k < 40; k++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      if (res.ok) {
        targets = await res.json();
        break;
      }
    } catch {
      await sleep(150);
    }
  }
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("Không tìm thấy Chrome page target.");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let nextId = 1;
  const pending = new Map();
  let pageErrors = 0;
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === "Runtime.exceptionThrown") pageErrors++;
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
  const J = async (js) => JSON.parse(await evalJs(`JSON.stringify(${js})`));
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');localStorage.removeItem('tg_reduced_motion')}catch(e){}`,
  });
  /** Ảnh chụp trạng thái nhãn + hình học thật của HUD */
  const probe = () =>
    J(`(() => {
      const el = document.getElementById("hud-testexp");
      const hud = document.getElementById("hud");
      const bar = document.querySelector("#hud .bar.exp");
      const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
      const cs = getComputedStyle(el);
      return {
        hidden: el.hidden, display: cs.display, text: el.textContent, title: el.title || "", aria: el.getAttribute("aria-label") || "",
        fs: parseFloat(cs.fontSize), el: r(el), hud: r(hud), bar: r(bar), vw: innerWidth, vh: innerHeight,
        overlaps: [...hud.children].filter((c) => c !== el && !c.hidden && getComputedStyle(c).display !== "none").some((c) => {
          const a = c.getBoundingClientRect(), b = el.getBoundingClientRect();
          return !(a.right <= b.left + 0.5 || a.left >= b.right - 0.5 || a.bottom <= b.top + 0.5 || a.top >= b.bottom - 0.5) && b.width > 0;
        }),
        ow: document.documentElement.scrollWidth,
      };
    })()`);
  for (const [W, H, mobile] of [
    [1280, 720, false],
    [768, 1024, true],
    [844, 390, true],
    [390, 844, true],
    [360, 640, true],
  ]) {
    console.log(`\n--- ${W}x${H}${mobile ? " (cảm ứng)" : ""} ---`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: W,
      height: H,
      deviceScaleFactor: 1,
      mobile,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1` });
    let ready = false;
    for (let k = 0; k < 50 && !ready; k++) {
      await sleep(300);
      ready = await evalJs(
        "Boolean(window.__ui && window.__ui.onTestExp && window.__scene && window.__scene.me && window.__scene.me() && window.__scene.room && typeof window.__scene.room.emit === 'function')",
      );
    }
    if (!ready)
      throw new Error(`Không có __ui.onTestExp / phòng giả có emit sau 15 giây ở ${BASE_URL}`);
    // Chờ HUD ỔN ĐỊNH (chiều cao thẻ HUD không đổi qua ~1 giây): `me()` có sớm hơn lúc `WorldScene.setupNetwork` chạy xong (nó gọi `setTestExp(1)`, xoá nhãn)
    // và các chip HUD (Linh thạch, trực tuyến) hiện muộn làm thẻ cao thêm; đo lúc đó sẽ lệch (lần chạy đầu: 1 trong 5 khung đỏ vì tin tới trước `setupNetwork`)
    let lastH = -1;
    let stable = 0;
    for (let k = 0; k < 60 && stable < 4; k++) {
      await sleep(250);
      const h = await evalJs("document.getElementById('hud').getBoundingClientRect().height");
      stable = h === lastH ? stable + 1 : 0;
      lastH = h;
    }

    // 1) mặc định: ẩn, không chiếm chỗ
    const base = await probe();
    check(
      base.hidden && base.display === "none" && base.el.w === 0 && base.el.h === 0,
      `mặc định ẨN và không chiếm chỗ (hidden=${base.hidden}, display=${base.display}, ${base.el.w}x${base.el.h})`,
    );
    const barBefore = base.bar;
    const hudBefore = base.hud;

    // 2) hệ số nguyên: hiện đúng chữ, ngay dưới thanh Tu vi
    await evalJs("window.__scene.room.emit('testExp', { mult: 5 }); 0");
    await sleep(120);
    let s = await probe();
    check(!s.hidden && s.text === "Thử nghiệm ×5", `{ mult: 5 } hiện đúng chữ ("${s.text}")`);
    check(
      s.el.y >= s.bar.b - 0.5 && s.el.y - s.bar.b <= 8,
      `nằm ngay DƯỚI thanh Tu vi (nhãn y=${s.el.y.toFixed(1)}, đáy thanh ${s.bar.b.toFixed(1)})`,
    );
    check(
      Math.abs(s.el.x - s.bar.x) <= 2,
      `canh theo mép trái thanh Tu vi (lệch ${Math.abs(s.el.x - s.bar.x).toFixed(1)} px)`,
    );
    check(
      s.el.x >= 0 &&
        s.el.y >= 0 &&
        s.el.r <= s.vw &&
        s.el.b <= s.vh &&
        s.el.r <= s.hud.r + 0.5 &&
        s.el.b <= s.hud.b + 0.5,
      `nằm trong màn hình và trong thẻ HUD (nhãn ${Math.round(s.el.x)}..${Math.round(s.el.r)} x ${Math.round(s.el.y)}..${Math.round(s.el.b)}; HUD ${Math.round(s.hud.r)} x ${Math.round(s.hud.b)})`,
    );
    check(!s.overlaps, "không đè lên thanh / nhãn nào khác trong HUD");
    check(s.fs >= 11, `cỡ chữ >= 11 px (${s.fs})`);
    check(
      /Thử nghiệm ×5/.test(s.title) &&
        /không ảnh hưởng người chơi khác/.test(s.title) &&
        s.aria === s.title,
      "có title / aria-label nói rõ, giống nhau",
    );
    check(
      Math.abs(s.bar.x - barBefore.x) < 0.5 && Math.abs(s.bar.y - barBefore.y) < 0.5,
      "thanh Tu vi KHÔNG bị xê dịch khi nhãn hiện",
    );
    check(s.ow <= s.vw + 1, `không tràn ngang (${s.ow}/${s.vw})`);
    if (SHOTS) {
      const png = await send("Page.captureScreenshot", {
        format: "png",
        clip: { x: 0, y: 0, width: Math.min(s.vw, 520), height: Math.min(s.vh, 260), scale: 2 },
      });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(
        path.join(SHOTS, `thu-nghiem-${W}x${H}.png`),
        Buffer.from(png.result.data, "base64"),
      );
    }

    // 3) hệ số lẻ, kẹp trần, tin rác giữ nhãn
    await evalJs("window.__scene.room.emit('testExp', { mult: 2.5 }); 0");
    s = await probe();
    check(s.text === "Thử nghiệm ×2,5", `{ mult: 2.5 } -> "${s.text}" (dấu phẩy thập phân)`);
    await evalJs("window.__scene.room.emit('testExp', { mult: 99 }); 0");
    s = await probe();
    check(s.text === "Thử nghiệm ×10", `{ mult: 99 } kẹp trần -> "${s.text}"`);
    for (const bad of ['"5"', "null", "undefined", "{}", "{ mult: NaN }", "{ mult: 'x' }", "[]"]) {
      await evalJs(`window.__scene.room.emit('testExp', ${bad}); 0`);
    }
    s = await probe();
    check(
      !s.hidden && s.text === "Thử nghiệm ×10",
      `tin rác (7 kiểu) bị bỏ qua, GIỮ nhãn cũ ("${s.text}")`,
    );

    // 4) xoá nhãn
    await evalJs("window.__scene.room.emit('testExp', { mult: 1 }); 0");
    s = await probe();
    check(
      s.hidden && s.display === "none" && s.text === "" && s.title === "" && s.aria === "",
      "{ mult: 1 } xoá nhãn (ẩn, hết chữ, hết title / aria-label)",
    );
    const after = await probe();
    check(
      Math.abs(after.hud.h - hudBefore.h) < 0.5 && Math.abs(after.hud.w - hudBefore.w) < 0.5,
      `HUD về đúng kích thước ban đầu (${after.hud.w}x${after.hud.h} so với ${hudBefore.w}x${hudBefore.h})`,
    );

    // 5) vào phòng mới (qua cổng): `WorldScene.setupNetwork(true)` xoá nhãn của phòng cũ; tin `testExp` của phòng mới (nếu còn hệ số) dựng lại
    await evalJs("window.__scene.room.emit('testExp', { mult: 3 }); 0");
    s = await probe();
    check(!s.hidden && s.text === "Thử nghiệm ×3", `trước khi vào phòng mới: nhãn "${s.text}"`);
    await evalJs("window.__scene.setupNetwork(true); 0");
    s = await probe();
    check(s.hidden && s.text === "", "vào phòng mới (setupNetwork(true)) xoá nhãn của phòng cũ");
    await evalJs("window.__scene.room.emit('testExp', { mult: 4 }); 0");
    s = await probe();
    check(!s.hidden && s.text === "Thử nghiệm ×4", `tin của phòng mới dựng lại nhãn ("${s.text}")`);
    await evalJs("window.__scene.setupNetwork(false); 0");
    s = await probe();
    check(
      !s.hidden && s.text === "Thử nghiệm ×4",
      "nối lại (setupNetwork(false)) GIỮ nhãn, máy chủ gửi lại",
    );
  }
  check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
  ws.close();
} catch (err) {
  console.error(err);
  failures++;
} finally {
  const exited = new Promise((res) => chrome.once("exit", res));
  chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* bỏ qua */
  }
}
console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} LỖI`);
process.exit(failures === 0 ? 0 : 1);
