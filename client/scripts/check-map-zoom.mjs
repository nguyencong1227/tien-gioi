import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process */
// Kiểm phóng to / kéo bản đồ lớn (QUYET_DINH_M3 mục 17.2, #496 bước 3) bằng sự kiện THẬT qua CDP (`Input.dispatch*`): lăn chuột, kéo chuột,
// nút +/-/"Về chỗ mình", phím +/-/mũi tên/Home, chụm hai ngón (cảm ứng), mở lại thì về mặc định, mũi tên không làm nhân vật đi. Cần client đang
// chạy (`npm run dev -w client`, cổng của dev B là 5183). Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/check-map-zoom.mjs [--url http://127.0.0.1:5183]
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-map-zoom-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    ...getChromeGpuFlags(),
    "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4",
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
    source: "try{localStorage.setItem('tg_newbie_guide_dismissed','1')}catch(e){}",
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1` });
  for (let k = 0; k < 40; k++) {
    await sleep(300);
    if (await evalJs("Boolean(window.__scene && window.__scene.me && window.__scene.me())")) break;
  }
  await sleep(600);
  await evalJs(`(() => {
    const sc = window.__scene, me = sc.me();
    sc.predX = me.x; sc.predY = me.y;
    return 0;
  })()`);

  const cam = () =>
    evalJs(
      `JSON.stringify((() => { const c = window.__scene.mapCtl; return { zoom: +c.cam.zoom.toFixed(4), cx: Math.round(c.cam.cx), cy: Math.round(c.cam.cy), follow: c.follow }; })())`,
    ).then((s) => JSON.parse(s));
  const rectOf = (sel) =>
    evalJs(
      `JSON.stringify((() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })())`,
    ).then((s) => JSON.parse(s));
  const canvasHash = () =>
    evalJs(`(() => {
      const c = document.getElementById("worldmap"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let h = 0; for (let i = 0; i < d.length; i += 37) h = (h * 31 + d[i]) | 0; return h;
    })()`);
  const mouse = (type, x, y, extra = {}) =>
    send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
  const click = async (sel) => {
    const r = await rectOf(sel);
    const x = r.x + r.w / 2;
    const y = r.y + r.h / 2;
    await mouse("mouseMoved", x, y, { button: "none" });
    await mouse("mousePressed", x, y, { buttons: 1 });
    await mouse("mouseReleased", x, y, { buttons: 0 });
    await sleep(160);
  };
  const key = async (code, k, vk) => {
    await send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      code,
      key: k,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      code,
      key: k,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
    });
    await sleep(160);
  };
  const open = async () => {
    await evalJs("window.__ui.toggleMapModal(true); 1");
    await sleep(700);
  };
  const close = async () => {
    await key("Escape", "Escape", 27);
    await sleep(250);
  };
  const shown = () => evalJs("window.__ui.isMapModalOpen()");

  console.log("\n--- Mở bản đồ lớn ---");
  await open();
  let c = await cam();
  check(c.zoom === 1 && c.follow, `mở lần đầu: zoom 1 và bám theo mình (${JSON.stringify(c)})`);
  check(
    (await evalJs("document.activeElement && document.activeElement.id")) === "worldmap",
    "focus nằm ở bản đồ (mũi tên / +/- / Home dùng được ngay)",
  );
  const hash1 = await canvasHash();
  const cv = await rectOf("#worldmap");
  const mx = cv.x + cv.w / 2;
  const my = cv.y + cv.h / 2;

  console.log("\n--- Chuột: lăn, nút, kéo ---");
  await mouse("mouseMoved", mx, my, { button: "none" });
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: mx,
    y: my,
    deltaX: 0,
    deltaY: -300,
  });
  await sleep(200);
  c = await cam();
  check(c.zoom > 1, `lăn chuột lên: phóng to (zoom ${c.zoom})`);
  check(
    (await canvasHash()) !== hash1,
    "ảnh bản đồ ĐỔI sau khi phóng (vẽ lại ngay, không đợi 250 ms)",
  );
  const zAfterWheel = c.zoom;
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: mx,
    y: my,
    deltaX: 0,
    deltaY: 300,
  });
  await sleep(200);
  c = await cam();
  check(c.zoom < zAfterWheel, `lăn chuột xuống: thu nhỏ (zoom ${c.zoom})`);

  await click("#map-zoom-in");
  await click("#map-zoom-in");
  c = await cam();
  const zIn = c.zoom;
  check(zIn > 1.5, `bấm nút + hai lần: phóng to (zoom ${zIn})`);
  await click("#map-zoom-out");
  c = await cam();
  check(c.zoom < zIn, `bấm nút − : thu nhỏ (zoom ${c.zoom})`);

  // người chơi mock đứng sát biên TÂY bản đồ nên tâm nhìn đang ở giới hạn trái: kéo sang TRÁI (tâm nhìn đi sang phải) mới có chỗ đi
  const before = await cam();
  await mouse("mousePressed", mx, my, { buttons: 1 });
  for (let s = 1; s <= 6; s++) await mouse("mouseMoved", mx - s * 15, my - s * 5, { buttons: 1 });
  await mouse("mouseReleased", mx - 90, my - 30, { buttons: 0 });
  await sleep(200);
  c = await cam();
  check(!c.follow, "kéo chuột: thôi bám theo mình");
  check(
    c.cx > before.cx && c.cy > before.cy,
    `kéo chuột sang trái / lên: tâm nhìn đi sang phải / xuống (${before.cx},${before.cy}) -> (${c.cx},${c.cy})`,
  );
  // kéo ngược lại về phía biên (không còn chỗ đi): tâm nhìn bị kẹp, không trượt ra ngoài bản đồ
  const edge = await cam();
  await mouse("mousePressed", mx, my, { buttons: 1 });
  for (let s = 1; s <= 8; s++) await mouse("mouseMoved", mx + s * 60, my + s * 60, { buttons: 1 });
  await mouse("mouseReleased", mx + 480, my + 480, { buttons: 0 });
  await sleep(200);
  c = await cam();
  check(
    c.cx <= edge.cx && c.cx >= 0 && c.cy >= 0,
    `kéo quá xa về phía biên: tâm nhìn bị kẹp trong bản đồ (cx ${c.cx}, cy ${c.cy})`,
  );

  // chuột PHẢI không phải thao tác kéo (menu ngữ cảnh có thể nuốt pointerup và để con trỏ ma)
  const beforeRight = await cam();
  await mouse("mousePressed", mx, my, { button: "right", buttons: 2 });
  for (let s = 1; s <= 4; s++)
    await mouse("mouseMoved", mx + s * 20, my, { button: "right", buttons: 2 });
  await mouse("mouseReleased", mx + 80, my, { button: "right", buttons: 0 });
  await sleep(200);
  c = await cam();
  check(
    c.cx === beforeRight.cx && c.cy === beforeRight.cy && c.zoom === beforeRight.zoom,
    "chuột phải + di chuyển: KHÔNG kéo bản đồ",
  );
  await click("#map-recenter");
  c = await cam();
  check(c.follow, "nút 'Về chỗ mình': bám lại, giữ mức phóng");

  console.log("\n--- Bàn phím trên bản đồ ---");
  await evalJs("document.getElementById('worldmap').focus(); 1");
  const meBefore = await evalJs(
    "JSON.stringify({ x: window.__scene.predX, y: window.__scene.predY })",
  );
  const z0 = (await cam()).zoom;
  await key("Equal", "=", 187);
  check((await cam()).zoom > z0, "phím + (Equal): phóng to");
  await key("Minus", "-", 189);
  check(Math.abs((await cam()).zoom - z0) < 1e-6, "phím − (Minus): thu nhỏ về mức cũ");
  const kb = await cam();
  await key("ArrowRight", "ArrowRight", 39);
  c = await cam();
  check(
    !c.follow && c.cx > kb.cx,
    `mũi tên phải: kéo khung nhìn sang phải, thôi bám (cx ${kb.cx} -> ${c.cx})`,
  );
  await key("ArrowDown", "ArrowDown", 40);
  check((await cam()).cy > kb.cy, "mũi tên xuống: kéo khung nhìn xuống");
  const meAfter = await evalJs(
    "JSON.stringify({ x: window.__scene.predX, y: window.__scene.predY })",
  );
  check(
    meBefore === meAfter,
    "mũi tên trên bản đồ KHÔNG làm nhân vật đi (vị trí đoán trước không đổi)",
  );
  await key("Home", "Home", 36);
  check((await cam()).follow, "phím Home: về chỗ mình");

  console.log("\n--- Sơ đồ nối ba bản đồ, chú giải, xem bản đồ khác ---");
  const nodes = JSON.parse(
    await evalJs(
      `JSON.stringify([...document.querySelectorAll("#map-graph .mg-node")].map((b) => ({ id: b.dataset.mapId, cur: b.getAttribute("aria-current"), pressed: b.getAttribute("aria-pressed"), h: Math.round(b.getBoundingClientRect().height) })))`,
    ),
  );
  check(nodes.length === 3, `sơ đồ nối có 3 nút bản đồ (${nodes.map((n) => n.id).join(", ")})`);
  const hereNode = nodes.find((n) => n.id === "lac_ha");
  check(
    hereNode?.cur === "location" && hereNode?.pressed === "true",
    "nút bản đồ mình đứng (lac_ha): aria-current='location' và đang được xem",
  );
  check(
    nodes.every((n) => n.h >= 44),
    "mọi nút sơ đồ cao >= 44 px (mục bấm)",
  );
  const legendState = () =>
    evalJs(
      `JSON.stringify({ exp: document.getElementById("map-legend-toggle").getAttribute("aria-expanded"), hidden: document.getElementById("map-legend").hidden })`,
    ).then((x) => JSON.parse(x));
  let lg = await legendState();
  check(lg.exp === "true" && !lg.hidden, "chú giải mặc định MỞ ở màn rộng");
  await click("#map-legend-toggle");
  lg = await legendState();
  check(lg.exp === "false" && lg.hidden, "bấm 'Chú giải': đóng (aria-expanded=false, ẩn)");
  await click("#map-legend-toggle");
  lg = await legendState();
  check(lg.exp === "true" && !lg.hidden, "bấm lần nữa: mở lại");

  const hashHere = await canvasHash();
  await click('#map-graph .mg-node[data-map-id="hac_phong"]');
  const view = JSON.parse(
    await evalJs(
      `JSON.stringify({ id: window.__scene.mapViewId, title: document.getElementById("map-title").textContent, sub: document.getElementById("map-coords").textContent, pressed: document.querySelector('#map-graph .mg-node[data-map-id="hac_phong"]').getAttribute("aria-pressed"), herePressed: document.querySelector('#map-graph .mg-node[data-map-id="lac_ha"]').getAttribute("aria-pressed") })`,
    ),
  );
  check(view.id === "hac_phong", `bấm nút Hắc Phong: đang xem hac_phong (${view.id})`);
  check(view.title.includes("Hắc Phong Cốc"), `tiêu đề đổi theo bản đồ đang xem (${view.title})`);
  check(
    view.sub.includes("Đang xem bản đồ khác"),
    "phụ đề nói rõ đang xem bản đồ KHÁC bản đồ mình đứng",
  );
  check(
    view.pressed === "true" && view.herePressed === "false",
    "nút đang xem được đánh dấu (aria-pressed)",
  );
  check((await canvasHash()) !== hashHere, "ảnh bản đồ ĐỔI sang bản đồ Hắc Phong");
  c = await cam();
  check(
    c.zoom === 1 && !c.follow,
    `đổi bản đồ xem: zoom 1, không bám (không có 'mình' ở bản đồ đó) (${JSON.stringify(c)})`,
  );
  await click("#map-zoom-in");
  await click("#map-zoom-in");
  c = await cam();
  check(c.zoom > 1.5 && !c.follow, `phóng được ở bản đồ đang xem khác (zoom ${c.zoom})`);
  await click("#map-recenter");
  const back = JSON.parse(
    await evalJs(
      `JSON.stringify({ id: window.__scene.mapViewId, title: document.getElementById("map-title").textContent })`,
    ),
  );
  check(
    back.id === null && back.title.includes("Lạc Hà"),
    `'Về chỗ mình' khi xem bản đồ khác: quay về bản đồ mình đứng (${back.title})`,
  );
  c = await cam();
  check(c.follow && c.zoom === 1, "về bản đồ mình: zoom 1, bám theo mình");
  await click('#map-graph .mg-node[data-map-id="am_suong"]');
  await close();
  await open();
  check(
    (await evalJs("window.__scene.mapViewId")) === null,
    "đang xem Âm Sương rồi đóng / mở lại: về xem bản đồ mình đứng",
  );

  console.log("\n--- Cảm ứng: chụm hai ngón ---");
  await close();
  check(!(await shown()), "Esc đóng bản đồ lớn");
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await open();
  c = await cam();
  check(
    c.zoom === 1 && c.follow,
    `mở lại: về mặc định zoom 1, bám theo mình (${JSON.stringify(c)})`,
  );
  const cv2 = await rectOf("#worldmap");
  const tx = cv2.x + cv2.w / 2;
  const ty = cv2.y + cv2.h / 2;
  const touch = (type, pts) =>
    send("Input.dispatchTouchEvent", {
      type,
      touchPoints: pts.map((p, idx) => ({ x: p.x, y: p.y, id: idx + 1 })),
    });
  await touch("touchStart", [
    { x: tx - 40, y: ty },
    { x: tx + 40, y: ty },
  ]);
  for (let s = 1; s <= 6; s++)
    await touch("touchMove", [
      { x: tx - 40 - s * 12, y: ty },
      { x: tx + 40 + s * 12, y: ty },
    ]);
  await touch("touchEnd", []);
  await sleep(250);
  c = await cam();
  check(c.zoom > 2, `chụm hai ngón ra xa: phóng to (zoom ${c.zoom})`);
  check(!c.follow, "chụm hai ngón: thôi bám theo mình");
  await touch("touchStart", [{ x: tx, y: ty }]);
  for (let s = 1; s <= 6; s++) await touch("touchMove", [{ x: tx + s * 12, y: ty }]);
  await touch("touchEnd", []);
  await sleep(250);
  const dragged = await cam();
  check(
    dragged.cx < c.cx,
    `kéo một ngón sang phải: tâm nhìn đi sang trái (cx ${c.cx} -> ${dragged.cx})`,
  );

  console.log("\n--- Qua cổng (changeMap trên CÙNG scene) cập nhật sơ đồ nối ---");
  // main.ts khi qua cổng gọi activeScene.changeMap(newRoom, finalMap) chứ không tạo lại scene; mock dùng lại chính room hiện tại
  const graphState = () =>
    evalJs(`JSON.stringify({
      hidden: document.getElementById("map-graph").hidden,
      current: [...document.querySelectorAll("#map-graph .mg-node[aria-current]")].map((b) => b.dataset.mapId),
      pressed: [...document.querySelectorAll("#map-graph .mg-node[aria-pressed=true]")].map((b) => b.dataset.mapId),
      title: document.getElementById("map-title").textContent,
      view: window.__scene.mapViewId })`).then(JSON.parse);
  const goMap = async (id) => {
    await evalJs(
      `(() => { const sc = window.__scene; sc.changeMap(sc.room, window.__getMap(${JSON.stringify(id)})); return 1; })()`,
    );
    await sleep(500);
  };
  await close();
  await goMap("hac_phong");
  await open();
  let gs = await graphState();
  check(
    !gs.hidden && gs.current.length === 1 && gs.current[0] === "hac_phong",
    `sau khi qua cổng sang Hắc Phong: 'đang đứng' (aria-current) ở hac_phong (${JSON.stringify(gs.current)})`,
  );
  check(
    gs.pressed.length === 1 && gs.pressed[0] === "hac_phong" && gs.title.includes("Hắc Phong Cốc"),
    `đang xem bản đồ mình vừa tới (${JSON.stringify(gs.pressed)}, ${gs.title})`,
  );
  // đang xem bản đồ khác (Âm Sương) với bản đồ lớn MỞ rồi qua cổng: về xem bản đồ mình đứng, camera / tiêu đề theo bản đồ mới
  await click('#map-graph .mg-node[data-map-id="am_suong"]');
  await goMap("lac_ha");
  gs = await graphState();
  check(
    gs.view === null && gs.title.includes("Lạc Hà") && gs.current[0] === "lac_ha",
    `qua cổng khi đang xem Âm Sương (bản đồ lớn mở): về xem Lạc Hà (${gs.view}, ${gs.title}, ${JSON.stringify(gs.current)})`,
  );
  c = await cam();
  check(
    c.follow && c.zoom === 1,
    `camera bản đồ lớn đặt lại sau khi qua cổng (${JSON.stringify(c)})`,
  );
  await close();
  await goMap("bi_canh_linh_hu");
  await open();
  gs = await graphState();
  check(gs.hidden === true, `vào bí cảnh (không thuộc sơ đồ): sơ đồ nối ẨN (hidden=${gs.hidden})`);
  await close();
  await goMap("lac_ha");
  await open();
  gs = await graphState();
  check(
    !gs.hidden && gs.current.length === 1 && gs.current[0] === "lac_ha",
    `ra khỏi bí cảnh về Lạc Hà: sơ đồ hiện lại, 'đang đứng' ở lac_ha (${gs.hidden}, ${JSON.stringify(gs.current)})`,
  );

  check(pageErrors === 0, `0 lỗi console / exception (${pageErrors})`);
  ws.close();
} finally {
  chrome.kill("SIGKILL");
  await sleep(600);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    // dọn thư mục tạm không bắt buộc
  }
}
if (failures > 0) {
  console.log(`\n✗ ${failures} kiểm tra ĐỎ`);
  process.exit(1);
}
console.log("\n🎉 KIỂM PHÓNG TO / KÉO BẢN ĐỒ LỚN PASS 100%!");
