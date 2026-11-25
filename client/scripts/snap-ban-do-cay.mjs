/* global console, Buffer, setTimeout */
// Chụp ảnh CỠ THẬT (1280x720) của cây ở bốn bản đồ cảnh mới (QUYET_DINH_M3 mục 73: thân cây và tán cây phải LIỀN nhau): chế độ mock (không cần máy chủ), lớp hình Tiled bật (?visual=1).
// Mỗi bản đồ ba ảnh: (1) `cum`: cụm cây dày nhất (cửa sổ 40 x 22 ô có nhiều ô thân cây nhất); (2) `sau-cay`: nhân vật đứng PHÍA BẮC một cây (chân cao hơn gốc cây) -> bị tán che;
// (3) `truoc-cay`: nhân vật đứng PHÍA NAM cây (chân thấp hơn gốc) -> che rễ cây. Cùng toạ độ camera trước / sau khi sửa nên ảnh ghép được.
//
//   node client/scripts/snap-ban-do-cay.mjs --out /tmp/anh-cay --tag truoc [--maps lac_ha,hac_phong,am_suong,han_van] [--url <client đang chạy sẵn>]
//
// Mặc định tự dựng Vite của cây này (như các `check-*`); khởi động Chrome bằng `launchChrome` (chờ 60 s khi CI, thử lại một lần, dọn cả nhóm tiến trình).
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import WebSocket from "ws";
import { resolveClientUrl } from "./client-url.mjs";
import { launchChrome } from "./chrome-launch.mjs";
import { waitUntilTrue } from "./chrome-wait.mjs";

const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const OUT = argOf("--out", "");
const TAG = argOf("--tag", "anh");
const MAPS = argOf("--maps", "lac_ha,hac_phong,am_suong,han_van").split(",");
if (!OUT) {
  console.error("Thiếu --out <thư mục>");
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });
const BASE_URL = await resolveClientUrl(argOf("--url", ""));

let launched = null;
try {
  launched = await launchChrome({ name: "snap-cay" });
  const ws = new WebSocket(launched.page.webSocketDebuggerUrl);
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
    new Promise((res) => {
      const id = nextId++;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.result?.exceptionDetails)
      throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result?.result?.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const id of MAPS) {
    await send("Page.navigate", { url: `${BASE_URL}/?dungeon=mock&debug=1&visual=1&map=${id}` });
    const ready = await waitUntilTrue(
      async () =>
        Boolean(
          await evalJs(
            `Boolean(window.__scene && window.__getMap && window.__ui && window.__scene.visualMap && window.__scene.visualLayers.length >= 3 && !document.getElementById("ui")?.hidden)`,
          ),
        ),
      60000,
      300,
    );
    if (!ready) throw new Error(`${id}: cảnh / lớp hình không sẵn sàng`);
    await new Promise((r) => setTimeout(r, 1500)); // camera ổn định, nền hiện đủ
    // Ẩn HUD / chữ nổi / huy hiệu mock để ảnh chỉ còn cảnh
    await evalJs(`(() => {
      for (const sel of ["#ui", "#dungeon-mock-badge", "#duel-mock-badge", "#chat", "#toast"]) { const e = document.querySelector(sel); if (e) e.style.visibility = "hidden"; }
      window.__scene.room.send = () => {};
      return 1;
    })()`);
    // Chọn cụm cây dày nhất (dữ liệu decor GID 620: cùng nguồn trước / sau khi sửa) + một cây ở rìa phía nam để xếp lớp theo y
    const pick = await evalJs(`(() => {
      const sc = window.__scene, vm = sc.visualMap, W = vm.width, H = vm.height, TILE = 32;
      const tree = (x, y) => x >= 0 && y >= 0 && x < W && y < H && vm.decor[y * W + x] === 620;
      const WW = 40, WH = 22;
      let best = { n: -1, x: 0, y: 0 };
      for (let y0 = 0; y0 + WH <= H; y0 += 2)
        for (let x0 = 0; x0 + WW <= W; x0 += 2) {
          let n = 0;
          for (let y = y0; y < y0 + WH; y++) for (let x = x0; x < x0 + WW; x++) if (tree(x, y)) n++;
          if (n > best.n) best = { n, x: x0, y: y0 };
        }
      // cây ở rìa nam của cụm: ô (x, y) là cây, hai ô phía nam không phải cây, hai ô cạnh phía nam trống
      let edge = null;
      for (let y = best.y + 2; y < best.y + WH - 3 && !edge; y++)
        for (let x = best.x + 4; x < best.x + WW - 4 && !edge; x++)
          if (tree(x, y) && !tree(x, y + 1) && !tree(x, y + 2) && !tree(x - 1, y + 1) && !tree(x + 1, y + 1)) edge = { x, y };
      return { n: best.n, cx: (best.x + WW / 2) * TILE, cy: (best.y + WH / 2) * TILE, edge: edge && { x: (edge.x + 0.5) * TILE, y: (edge.y + 1) * TILE } };
    })()`);
    const shot = async (name) => {
      await new Promise((r) => setTimeout(r, 500));
      const r = await send("Page.captureScreenshot", { format: "png" });
      const file = path.join(OUT, `${TAG}-${id}-${name}.png`);
      fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
      console.log(`  ${file}`);
    };
    console.log(
      `${id}: cụm cây ${pick.n} ô thân; cây rìa nam ${pick.edge ? `(${pick.edge.x}, ${pick.edge.y})` : "không có"}`,
    );
    const place = (px, py, cx, cy) =>
      evalJs(
        `(() => { const sc = window.__scene; sc.predX = ${px}; sc.predY = ${py}; sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(${cx}, ${cy}); return 1; })()`,
      );
    // (1) cụm: nhân vật ngoài khung hình (đứng giữa cụm sẽ che cảnh)
    await place(pick.cx, pick.cy, pick.cx, pick.cy);
    await evalJs(
      `(() => { const sc = window.__scene; sc.predX = 0; sc.predY = 0; sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(${pick.cx}, ${pick.cy}); return 1; })()`,
    );
    await shot("cum");
    if (pick.edge) {
      const { x, y } = pick.edge;
      // (2) sau cây: chân cao hơn gốc 22 px (cùng cột) -> tán che; (3) trước cây: chân thấp hơn gốc 26 px -> che rễ
      await place(x, y - 22, x, y - 20);
      await shot("sau-cay");
      await place(x, y + 26, x, y - 20);
      await shot("truoc-cay");
    }
  }
  ws.close();
} finally {
  if (launched) await launched.close();
}
console.log("XONG");
process.exit(0);
