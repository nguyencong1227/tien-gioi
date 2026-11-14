import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process */
// Cổng kiểm cỡ chữ (M5.1 #326, docs/THIET_KE_GIAO_DIEN_DO_HOA.md mục 4.2 điều 2) trong Chrome thật: trên điện thoại chữ NỘI DUNG (bảng, hộp thoại)
// >= 14 px và nhãn HUD >= 12 px, kể cả khi chọn cỡ chữ Nhỏ; trên máy tính cỡ chữ gốc giữ nguyên ở Vừa và co giãn theo Nhỏ / Lớn; không tràn
// ngang ở cỡ Lớn. Đo `font-size` TÍNH RA của mọi nút văn bản đang hiện. Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
// Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/check-text-size.mjs [--url http://127.0.0.1:5183]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const i = process.argv.indexOf("--url");
const BASE_URL = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "http://127.0.0.1:5183";
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-text-"));
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

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    // Chất lượng Cao (cho rung + chớp), bỏ hướng dẫn tân thủ
    source:
      "try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');localStorage.removeItem('tg_reduced_motion')}catch(e){}",
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 900,
    height: 600,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1&crowd=6` });
  for (let k = 0; k < 40; k++) {
    await sleep(300);
    if (await evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())")) break;
  }
  await sleep(600);

  // Chế độ mock không chạy đối chiếu máy chủ: đặt vị trí đoán trước tại chỗ nhân vật và đưa camera về đó
  await evalJs(`(() => {
    const sc = window.__scene, me = sc.me();
    sc.predX = me.x; sc.predY = me.y;
    sc.cameras.main.centerOn(me.x, me.y);
    return 0;
  })()`);

  await evalJs("window.__scene.syncNpcs = () => {};0"); // Cửa hàng / Lò rèn tự đóng khi không có NPC ở gần
  const VPS = [
    { name: "390x844", w: 390, h: 844, phone: true },
    { name: "360x640", w: 360, h: 640, phone: true },
    { name: "844x390", w: 844, h: 390, phone: true },
    { name: "1280x720", w: 1280, h: 720, phone: false },
  ];
  // Mọi bảng mở được bằng toggle (mock): id, hàm mở
  const PANELS = [
    ["inv-modal", "toggleInventory"],
    ["char-modal", "toggleCharModal"],
    ["settings-modal", "toggleSettingsModal"],
    ["map-modal", "toggleMapModal"],
    ["quest-modal", "toggleQuestModal"],
    ["shop-modal", "toggleShopModal"],
    ["forge-modal", "toggleForgeModal"],
    ["sect-modal", "toggleSectModal"],
  ];
  const CARDS = ["dungeon-end-modal", "duel-end-modal", "newbie-guide-modal", "outdated-modal"];
  // Hộp thoại NPC (#dialog-modal, dock đáy): mở bằng ui.onDialog với tin mẫu có đủ loại nhãn (tiêu đề, huy hiệu, chữ, gợi ý, lựa chọn + nhãn phụ)
  const DIALOG_MSG = {
    npcId: "duoc_su",
    lines: [
      "Đạo hữu đến thật đúng lúc. Linh dược trong núi Hắc Phong dạo này bị yêu thú giẫm nát hết cả.",
    ],
    options: [
      { label: "Nhận nhiệm vụ: Thu hái Huyết Tinh Thảo", action: { kind: "accept", questId: "x" } },
      { label: "Cửa hàng", action: { kind: "shop" } },
      { label: "Bí cảnh Hắc Phong", action: { kind: "dungeon" }, disabled: true },
      { label: "Rời đi", action: { kind: "close" } },
    ],
  };
  const HUD = ["#hud", "#quest-tracker", "#party-panel", "#skills", "#quickbar", "#minimap-wrap"];
  /** Cỡ chữ tính ra của mọi phần tử đang hiện có chữ trực tiếp dưới `root`: { px: { khoá: số lượng } }. */
  const scan = (rootSel) =>
    evalJs(`(() => {
      const root = document.querySelector(${JSON.stringify(rootSel)}); if (!root) return "null";
      const out = {};
      const walk = (el) => {
        if (el.hidden) return;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return;
        let own = ""; for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
        if (own.trim().length) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            const fs = Math.round(parseFloat(cs.fontSize) * 100) / 100;
            const key = el.id ? "#" + el.id : el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).join(".") : "");
            out[fs] = out[fs] || {}; out[fs][key] = (out[fs][key] || 0) + 1;
          }
        }
        for (const c of el.children) walk(c);
      };
      walk(root);
      return JSON.stringify(out);
    })()`).then((v) => (v === "null" ? null : JSON.parse(v)));
  /** Các cỡ nhỏ hơn `min` kèm khoá phần tử vi phạm (rút gọn). */
  const offenders = (o, min) =>
    Object.keys(o)
      .map(Number)
      .filter((s) => s < min)
      .map((s) => `${s}px: ${Object.keys(o[s]).slice(0, 6).join(", ")}`)
      .join(" | ");
  const setScale = async (v) => {
    await evalJs(
      `(() => { const c = document.getElementById("set-ui-scale"); c.value = ${JSON.stringify(v)}; c.dispatchEvent(new Event("change")); return 1; })()`,
    );
    await sleep(250);
  };
  const open = async (toggle, on) => {
    await evalJs(`window.__ui.${toggle}(${on});0`);
    await sleep(on ? 450 : 100);
  };
  const noOverflow = () =>
    evalJs(
      "document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight",
    );

  // 0) Cỡ chữ Vừa là mặc định, ô chọn tồn tại và lưu
  check(
    (await evalJs('document.documentElement.style.getPropertyValue("--ui-scale")')) === "1",
    "mặc định cỡ chữ Vừa (--ui-scale = 1)",
  );

  for (const vp of VPS) {
    console.log(`\n=== ${vp.name} ${vp.phone ? "(điện thoại, cảm ứng)" : "(máy tính)"} ===`);
    if (vp.phone)
      await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: 1,
      mobile: vp.phone,
    });
    await sleep(500);
    for (const mode of vp.phone ? ["small", "normal", "large"] : ["normal"]) {
      await setScale(mode);
      // Bảng nội dung: điện thoại >= 14 px
      for (const [id, toggle] of PANELS) {
        await open(toggle, true);
        const o = await scan("#" + id);
        if (vp.phone) {
          const bad = offenders(o, 14);
          check(
            !bad,
            `${vp.name} [${mode}] ${id}: mọi chữ >= 14 px${bad ? " (nhỏ hơn: " + bad + ")" : ""}`,
          );
        }
        if (mode === "large" && vp.phone)
          check(
            await noOverflow(),
            `${vp.name} [large] ${id}: không tràn ngang / dọc ngoài ý muốn`,
          );
        await open(toggle, false);
      }
      // Thẻ (.sheet-card: kết quả Bí cảnh / Quyết đấu, Chỉ dẫn người mới, Phiên bản cũ): mở bằng cách bỏ `hidden`
      for (const id of CARDS) {
        await evalJs(`document.getElementById(${JSON.stringify(id)}).hidden = false;0`);
        await sleep(450);
        const o = await scan("#" + id);
        if (vp.phone) {
          const bad = offenders(o, 14);
          check(
            !bad,
            `${vp.name} [${mode}] ${id} (thẻ): mọi chữ >= 14 px${bad ? " (nhỏ hơn: " + bad + ")" : ""}`,
          );
        }
        if (mode === "large" && vp.phone)
          check(
            await noOverflow(),
            `${vp.name} [large] ${id} (thẻ): không tràn ngang / dọc ngoài ý muốn`,
          );
        await evalJs(`document.getElementById(${JSON.stringify(id)}).hidden = true;0`);
        await sleep(100);
      }
      // Hộp thoại NPC: nội dung >= 14 px trên điện thoại (kể cả Nhỏ), co giãn theo cỡ chữ
      await evalJs(`window.__ui.onDialog(${JSON.stringify(DIALOG_MSG)});0`);
      await evalJs(
        'document.getElementById("dlg-body").dispatchEvent(new Event("pointerdown", { cancelable: true }));0', // bỏ qua hiệu ứng gõ chữ để lựa chọn hiện ra
      );
      await sleep(300);
      const dlg = await scan("#dialog-modal");
      if (vp.phone) {
        const bad = offenders(dlg, 14);
        check(
          !bad,
          `${vp.name} [${mode}] #dialog-modal (hộp thoại NPC): mọi chữ >= 14 px${bad ? " (nhỏ hơn: " + bad + ")" : ""}`,
        );
      }
      if (mode === "large" && vp.phone)
        check(await noOverflow(), `${vp.name} [large] #dialog-modal: không tràn ngang / dọc`);
      await evalJs("window.__ui.closeDialog();0");
      await sleep(100);
      // HUD: điện thoại >= 12 px; HUD không co giãn theo cỡ chữ
      if (vp.phone) {
        let worst = "";
        for (const sel of HUD) {
          const o = await scan(sel);
          if (o)
            worst +=
              (worst && offenders(o, 12) ? " | " : "") +
              (offenders(o, 12) ? sel + " " + offenders(o, 12) : "");
        }
        check(
          !worst,
          `${vp.name} [${mode}] HUD: mọi nhãn >= 12 px${worst ? " (nhỏ hơn: " + worst + ")" : ""}`,
        );
        if (mode === "large")
          check(await noOverflow(), `${vp.name} [large] HUD: không tràn ngang / dọc`);
      }
    }
    await setScale("normal");
  }

  // Máy tính: cỡ gốc giữ ở Vừa, co giãn theo Nhỏ / Lớn (không sàn 14 px); HUD không đổi
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(500);
  const sizeOf = (sel) =>
    evalJs(`parseFloat(getComputedStyle(document.querySelector(${JSON.stringify(sel)})).fontSize)`);
  await open("toggleInventory", true);
  const hudBase = await sizeOf("#hud-name");
  const near = (a, b) => Math.abs(a - b) < 0.01;
  await setScale("normal");
  const base = await sizeOf("#inv-count");
  await setScale("large");
  const large = await sizeOf("#inv-count");
  await setScale("small");
  const small = await sizeOf("#inv-count");
  const hudLarge = await sizeOf("#hud-name");
  check(base === 12, `máy tính [Vừa]: #inv-count giữ cỡ gốc 12 px (${base})`);
  check(
    near(large, 12 * 1.15) && near(small, 12 * 0.9),
    `máy tính: Lớn ${large} px (12 x 1,15), Nhỏ ${small} px (12 x 0,9), không sàn 14 px`,
  );
  check(
    hudBase === hudLarge,
    `HUD không co giãn theo cỡ chữ (#hud-name ${hudBase} -> ${hudLarge} px)`,
  );
  await open("toggleInventory", false);
  // Hộp thoại NPC trên máy tính: chữ 14 px giữ ở Vừa, co giãn theo Nhỏ / Lớn
  await evalJs(`window.__ui.onDialog(${JSON.stringify(DIALOG_MSG)});0`);
  await evalJs(
    'document.getElementById("dlg-body").dispatchEvent(new Event("pointerdown", { cancelable: true }));0',
  );
  await sleep(300);
  await setScale("normal");
  const dBase = await sizeOf("#dlg-text");
  await setScale("large");
  const dLarge = await sizeOf("#dlg-text");
  await setScale("small");
  const dSmall = await sizeOf("#dlg-text");
  check(
    dBase === 14 && near(dLarge, 14 * 1.15) && near(dSmall, 14 * 0.9),
    `máy tính: chữ hộp thoại NPC Vừa ${dBase} px, Lớn ${dLarge} (14 x 1,15), Nhỏ ${dSmall} (14 x 0,9)`,
  );
  await evalJs("window.__ui.closeDialog();0");
  // Lưu lựa chọn và nạp lại trang
  await setScale("large");
  check(
    (await evalJs('localStorage.getItem("tg_ui_scale")')) === "1.15",
    "lựa chọn lưu vào tg_ui_scale (số 1.15: cùng định dạng với display.ts, một nguồn)",
  );
  // Đổi kích thước / xoay máy SAU khi chọn: display.ts ghi lại --ui-scale mỗi lần cập nhật, cỡ chữ đã chọn không được về 1
  for (const [w, h] of [
    [1100, 700],
    [700, 1100],
    [1280, 720],
  ]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(450);
    check(
      (await evalJs('document.documentElement.style.getPropertyValue("--ui-scale")')) === "1.15",
      `đổi cỡ cửa sổ ${w}x${h}: cỡ chữ Lớn vẫn giữ (--ui-scale 1.15)`,
    );
  }
  await send("Page.reload");
  for (let k = 0; k < 40; k++) {
    await sleep(300);
    if (await evalJs("Boolean(window.__ui && window.__scene)")) break;
  }
  await sleep(500);
  check(
    (await evalJs('document.documentElement.style.getPropertyValue("--ui-scale")')) === "1.15" &&
      (await evalJs('document.getElementById("set-ui-scale").value')) === "large",
    "nạp lại trang: cỡ Lớn được áp lại và ô chọn đúng",
  );
  await evalJs('localStorage.removeItem("tg_ui_scale");0');

  check(pageErrors === 0, `không ngoại lệ trong trang (${pageErrors})`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
