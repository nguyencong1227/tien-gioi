import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm DẤU HIỆU TINH ANH (M7.3 bước 6, A #651; `Monster.elite` uint8 = 1, client `client/src/elite.ts` + `WorldScene.setMonsterElite`) trong Chrome THẬT (`?skills=mock`, không cần máy
// chủ): đặt `elite = 1` lên quái trong state giả rồi đo DOM, đối tượng Phaser và ĐIỂM ẢNH THẬT, ở bốn khung nhìn:
//  - tinh anh: chữ "★ <tên> tinh anh" màu vàng trên đầu, vầng sáng cam dưới chân (dưới sprite), thanh máu to hơn màu cam LUÔN hiện kể cả khi đầy; quái thường bên cạnh KHÔNG có gì
//    trong số đó (không nhãn, không vầng sáng, thanh máu ẩn khi đầy);
//  - điểm ảnh: vùng quanh tinh anh có thêm nhiều điểm vàng cam so với lúc chưa là tinh anh (thấy từ xa), vùng quanh quái thường thì không;
//  - bản đồ lớn: thoi cam viền trắng cho từng tinh anh (đè lên chấm đỏ), quái thường chỉ có chấm đỏ; chú giải có mục "Tinh anh";
//  - nút Mục tiêu ghi "<tên> tinh anh" khi khoá tinh anh, tên thường khi khoá quái thường;
//  - bỏ cờ tinh anh (`elite = 0`): nhãn / vầng sáng / thanh máu về như quái thường, không để rác;
//  - gợi ý "nên đi đội" (mục 22.2): toast "★ <tên> tinh anh: nên đi đội." đúng MỘT lần mỗi loài (bật / tắt cờ lại không nhắc lần nữa), KHÔNG nhắc khi đang đi đội và vẫn nhắc loài đó
//    khi rời đội; chú giải bản đồ ghi "nên đi đội";
//  - không tạo đối tượng mới mỗi khung (số con của container đứng yên); vầng sáng nhịp theo sóng chung, giảm chuyển động thì đứng yên; 0 lỗi JS.
// Có thể chụp ảnh: `--shots <thư mục>`. Cần client đang chạy (`npm run dev -w client`, cổng của dev B là 5183).
//   node client/scripts/check-elite-badge.mjs [--url http://127.0.0.1:5183] [--shots /tmp/tg-b-shots]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE_URL = argOf("--url", "http://127.0.0.1:5183");
const SHOTS = argOf("--shots", "");
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-elite-"));
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
  let scriptId = null;
  const setStorage = async (reduced) => {
    if (scriptId) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId });
    const r = await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high');${reduced ? "localStorage.setItem('tg_reduced_motion','1')" : "localStorage.removeItem('tg_reduced_motion')"}}catch(e){}`,
    });
    scriptId = String(r.result?.identifier ?? "");
  };
  const open = async (W, H, mobile) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: W,
      height: H,
      deviceScaleFactor: 1,
      mobile,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=2&debug=1` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (
        await evalJs(
          "Boolean(window.__scene && window.__scene.me && window.__scene.me() && window.__scene.state?.monsters && window.__ui)",
        )
      )
        break;
    }
    await sleep(1200);
    // mock không chạy đối chiếu: đặt người chơi giữa trấn, camera nhìn vào đó và đứng yên
    await evalJs(`(() => { const sc = window.__scene, me = sc.me(), t = sc.map.townPx;
      me.x = t.x; me.y = t.y; sc.predX = me.x; sc.predY = me.y; sc.pending.length = 0; sc.hasMe = true;
      sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(me.x, me.y); return 1; })()`);
    await sleep(500);
    // Đếm mọi toast "tinh anh ..." xuất hiện từ lúc này (toast tự gỡ sau 3 giây nên phải bắt lúc thêm vào)
    await evalJs(
      `(() => { window.__eliteToasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.textContent && n.textContent.includes("tinh anh")) window.__eliteToasts.push(n.textContent); }).observe(document.getElementById("toast"), { childList: true }); return 1; })()`,
    );
  };
  const spawn = (id, kind, dx, dy, extra = "") =>
    evalJs(
      `(() => { const sc = window.__scene; sc.state.monsters.set(${JSON.stringify(id)}, { kind: ${JSON.stringify(kind)}, x: sc.predX + ${dx}, y: sc.predY + ${dy}, angle: 0, hp: 100, maxHp: 100, fx: 0, elite: 0${extra} }); return 1; })()`,
    );
  const ent = (id) =>
    J(`(() => { const e = window.__scene.monsters.get(${JSON.stringify(id)}); if (!e) return null;
      return { label: e.label ? { text: e.label.text, color: e.label.style.color, visible: e.label.visible } : null,
        aura: e.eliteAura ? { visible: e.eliteAura.visible, w: Math.round(e.eliteAura.width), index: e.root.list.indexOf(e.eliteAura), sprite: e.root.list.indexOf(e.sprite) } : null,
        barShown: e.lastBarKey !== -1 && e.lastBarKey !== undefined, elite: !!e.elite, children: e.root.list.length, x: e.root.x, y: e.root.y }; })()`);
  /** Chụp canvas của trò chơi (điểm ảnh thật) vào window[name] ở khung kế tiếp */
  const grab = (name) =>
    evalJs(`new Promise((resolve) => {
      const sc = window.__scene, r = sc.game.canvas.getBoundingClientRect();
      sc.game.renderer.snapshotArea(0, 0, Math.round(r.width), Math.round(r.height), (img) => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        window[${JSON.stringify(name)}] = x.getImageData(0, 0, c.width, c.height).data;
        const wv = sc.cameras.main.worldView;
        resolve(JSON.stringify({ w: img.width, h: img.height, wvx: wv.x, wvy: wv.y, wvw: wv.width, wvh: wv.height }));
      });
    })`).then((s) => JSON.parse(s));
  /** Số điểm ảnh VÀNG CAM (r cao, g vừa, b thấp, r - b lớn) trong hộp quanh toạ độ thế giới (wx, wy) rộng `half` px thế giới */
  const goldIn = (name, info, wx, wy, half) =>
    evalJs(`(() => { const D = window[${JSON.stringify(name)}], W = ${info.w}, k = ${info.w / info.wvw};
      const cx = (${wx} - ${info.wvx}) * k, cy = (${wy} - ${info.wvy}) * k, h = ${half} * k; let n = 0;
      for (let y = Math.max(0, Math.floor(cy - h)); y < Math.min(${info.h}, Math.ceil(cy + h)); y++) for (let x = Math.max(0, Math.floor(cx - h)); x < Math.min(W, Math.ceil(cx + h)); x++) {
        const i = (y * W + x) * 4, r = D[i], g = D[i + 1], b = D[i + 2];
        if (r > 215 && g > 120 && g < 225 && b < 120 && r - b > 110) n++;
      } return n; })()`);

  for (const [W, H, mobile] of [
    [1280, 720, false],
    [844, 390, true],
    [390, 844, true],
    [360, 640, true],
  ]) {
    console.log(`\n--- ${W}x${H}${mobile ? " (cảm ứng)" : ""} ---`);
    await setStorage(false);
    await open(W, H, mobile);
    await spawn("e1", "lang", 110, -30);
    await spawn("e2", "cot_tuong", -120, -40);
    await spawn("n1", "ho", 0, 110);
    await sleep(500);
    // A: chưa ai là tinh anh
    const a = { e1: await ent("e1"), e2: await ent("e2"), n1: await ent("n1") };
    check(
      !a.e1.label && !a.e1.aura && !a.e1.barShown && !a.n1.label && !a.n1.aura && !a.n1.barShown,
      "chưa tinh anh: không nhãn, không vầng sáng, thanh máu ẩn khi đầy máu",
    );
    const infoA = await grab("shotA");
    // B: đặt cờ tinh anh lên hai con (Hôi Lang, Cốt Tượng); Hắc Hổ vẫn thường
    await evalJs(
      `(() => { const m = window.__scene.state.monsters; m.get("e1").elite = 1; m.get("e2").elite = 1; return 1; })()`,
    );
    await sleep(600);
    const b = { e1: await ent("e1"), e2: await ent("e2"), n1: await ent("n1") };
    check(
      b.e1.label?.text === "★ Hôi Lang tinh anh" && b.e2.label?.text === "★ Cốt Tượng tinh anh",
      `nhãn trên đầu: "${b.e1.label?.text}" / "${b.e2.label?.text}"`,
    );
    check(
      b.e1.label?.color === "#ffd76a" && b.e1.label?.visible === true,
      `nhãn màu vàng (${b.e1.label?.color}) và hiện`,
    );
    check(
      b.e1.aura?.visible === true &&
        b.e2.aura?.visible === true &&
        b.e1.aura.index > 0 &&
        b.e1.aura.index < b.e1.aura.sprite,
      `vầng sáng cam dưới chân, NẰM DƯỚI sprite (chỉ số ${b.e1.aura?.index} < sprite ${b.e1.aura?.sprite})`,
    );
    check(
      b.e2.aura.w > b.e1.aura.w,
      `vầng sáng theo cỡ thân: Cốt Tượng (${b.e2.aura?.w} px) rộng hơn Hôi Lang (${b.e1.aura?.w} px)`,
    );
    check(
      b.e1.barShown && b.e2.barShown,
      "thanh máu tinh anh LUÔN hiện, kể cả khi đầy máu (thấy từ xa)",
    );
    check(
      !b.n1.label && !b.n1.aura && !b.n1.barShown && !b.n1.elite,
      "quái thường bên cạnh (Hắc Hổ) KHÔNG đổi: không nhãn, không vầng sáng, thanh máu ẩn",
    );
    // Gợi ý nên đi đội: mỗi loài đúng MỘT toast, nhãn tên theo loài
    const hints = await J("window.__eliteToasts");
    check(
      hints.length === 2 &&
        hints.includes("★ Hôi Lang tinh anh: nên đi đội.") &&
        hints.includes("★ Cốt Tượng tinh anh: nên đi đội."),
      `gợi ý nên đi đội: đúng một toast mỗi loài (${JSON.stringify(hints)})`,
    );
    const infoB = await grab("shotB");
    const goldE1 =
      (await goldIn("shotB", infoB, b.e1.x, b.e1.y, 70)) -
      (await goldIn("shotA", infoA, a.e1.x, a.e1.y, 70));
    const goldE2 =
      (await goldIn("shotB", infoB, b.e2.x, b.e2.y, 90)) -
      (await goldIn("shotA", infoA, a.e2.x, a.e2.y, 90));
    const goldN1 =
      (await goldIn("shotB", infoB, b.n1.x, b.n1.y, 70)) -
      (await goldIn("shotA", infoA, a.n1.x, a.n1.y, 70));
    check(
      goldE1 > 55 && goldE2 > 55,
      `điểm ảnh: quanh tinh anh có thêm điểm vàng cam (Hôi Lang +${goldE1}, Cốt Tượng +${goldE2})`,
    );
    check(
      Math.abs(goldN1) < 40,
      `điểm ảnh: quanh quái thường gần như không đổi (${goldN1 >= 0 ? "+" : ""}${goldN1})`,
    );
    if (SHOTS) {
      const png = await send("Page.captureScreenshot", { format: "png" });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(
        path.join(SHOTS, `tinh-anh-${W}x${H}.png`),
        Buffer.from(png.result.data, "base64"),
      );
    }
    // Bản đồ lớn: thoi cam cho từng tinh anh, quái thường chỉ chấm đỏ; chú giải có mục Tinh anh
    const orangeMap = () =>
      evalJs(`(() => { const c = document.getElementById("worldmap"); if (!c) return -1; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0;
        for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 255) < 14 && Math.abs(d[i + 1] - 138) < 14 && Math.abs(d[i + 2] - 43) < 18) n++; return n; })()`);
    await evalJs("window.__ui.toggleMapModal(true); 0");
    await sleep(900);
    const mapWith = await orangeMap();
    await evalJs(
      `(() => { const m = window.__scene.state.monsters; m.get("e1").elite = 0; m.get("e2").elite = 0; return 1; })()`,
    );
    await sleep(900);
    const mapWithout = await orangeMap();
    check(
      mapWith > 20 && mapWithout < 5,
      `bản đồ lớn: thoi cam của tinh anh (${mapWith} điểm ảnh cam; hết tinh anh còn ${mapWithout})`,
    );
    const legend = await J(
      `[...document.querySelectorAll("#map-legend span")].map((s) => s.textContent.trim())`,
    );
    check(
      legend.some((t) => t.startsWith("Tinh anh") && t.includes("nên đi đội")),
      `chú giải bản đồ có mục "Tinh anh" kèm "nên đi đội" (${legend.find((t) => t.startsWith("Tinh anh"))})`,
    );
    await evalJs("window.__ui.toggleMapModal(false); 0");
    // Bỏ cờ tinh anh: về như quái thường, không để rác
    await sleep(300);
    const c = { e1: await ent("e1"), e2: await ent("e2") };
    check(
      !c.e1.label && c.e1.aura?.visible === false && !c.e1.barShown && !c.e1.elite,
      "bỏ cờ tinh anh: nhãn bị dọn, vầng sáng ẩn, thanh máu ẩn lại",
    );
    // Nút Mục tiêu
    await evalJs(`(() => { window.__scene.state.monsters.get("e1").elite = 1; return 1; })()`);
    await sleep(300);
    const targetText = async (id) => {
      await evalJs(`window.__scene.setLockedTarget(${JSON.stringify(id)}); 0`);
      return evalJs(`document.getElementById("btn-target-label")?.textContent ?? ""`);
    };
    const tElite = await targetText("e1");
    const tNormal = await targetText("n1");
    await evalJs("window.__scene.setLockedTarget(null); 0");
    check(
      tElite === "Hôi Lang tinh anh" && tNormal === "Hắc Hổ",
      `nút Mục tiêu: "${tElite}" (tinh anh) / "${tNormal}" (thường)`,
    );
    // Bật / tắt cờ tinh anh lại (e1 vừa bị bỏ rồi bật lại) KHÔNG nhắc lần hai
    const again = await J("window.__eliteToasts");
    check(again.length === 2, `bật lại cờ tinh anh: không nhắc lần hai (${again.length} toast)`);
    // Đang đi đội (2 người): tinh anh loài MỚI không nhắc; rời đội thì loài đó được nhắc
    await evalJs(`(() => { const sc = window.__scene, me = sc.me();
      window.__ui.onParty({ leader: me.name, members: [
        { name: me.name, realm: 1, tier: 1, hp: 10, maxHp: 10, x: sc.predX, y: sc.predY },
        { name: "Đồng đội thử", realm: 1, tier: 1, hp: 10, maxHp: 10, x: sc.predX + 50, y: sc.predY } ] });
      return 1; })()`);
    await spawn("e3", "ho", -60, 130, ", elite: 1");
    await sleep(500);
    const inParty = await J("window.__eliteToasts");
    check(inParty.length === 2, `đang đi đội: không nhắc loài mới (${inParty.length} toast)`);
    await evalJs(`(() => { window.__ui.onParty({ leader: "", members: [] }); return 1; })()`);
    await sleep(500);
    const leftParty = await J("window.__eliteToasts");
    check(
      leftParty.length === 3 && leftParty[2] === "★ Hắc Hổ tinh anh: nên đi đội.",
      `rời đội: loài chưa được nhắc giờ được nhắc (${JSON.stringify(leftParty.slice(2))})`,
    );
    await evalJs(`(() => { window.__scene.state.monsters.delete("e3"); return 1; })()`);
    // không tạo đối tượng mới mỗi khung: số con của container đứng yên trong 1,5 giây
    const ch0 = (await ent("e1")).children;
    await sleep(1500);
    const ch1 = (await ent("e1")).children;
    check(ch0 === ch1, `không tạo đối tượng mới mỗi khung (số con container ${ch0} -> ${ch1})`);
    // vầng sáng nhịp theo sóng chung
    const scales = [];
    for (let i = 0; i < 8; i++) {
      scales.push(await evalJs(`window.__scene.monsters.get("e1").eliteAura.scaleX`));
      await sleep(180);
    }
    check(
      Math.max(...scales) - Math.min(...scales) > 0.02,
      `vầng sáng nhịp theo sóng chung (scale ${Math.min(...scales).toFixed(3)} - ${Math.max(...scales).toFixed(3)})`,
    );
    // chấm trạng thái nằm cao hơn nhãn khi tinh anh có hiệu ứng (giống trùm): không lỗi, vẫn vẽ
    await evalJs(`(() => { window.__scene.state.monsters.get("e1").fx = 1; return 1; })()`);
    await sleep(300);
    const pips = await J(`window.__scene.monsterPips("e1")`);
    check(
      pips && pips.n >= 1 && pips.visible,
      `tinh anh có huy hiệu trạng thái: vẫn vẽ (${JSON.stringify(pips)})`,
    );
    await evalJs(`(() => { window.__scene.state.monsters.get("e1").fx = 0; return 1; })()`);
  }

  // Giảm chuyển động: vầng sáng đứng yên (vẫn hiện)
  console.log("\n--- 1280x720, GIẢM CHUYỂN ĐỘNG ---");
  await setStorage(true);
  await open(1280, 720, false);
  await spawn("e1", "lang", 110, -30, "");
  await evalJs(`(() => { window.__scene.state.monsters.get("e1").elite = 1; return 1; })()`);
  await sleep(600);
  const still = [];
  for (let i = 0; i < 8; i++) {
    still.push(
      await J(
        `(() => { const a = window.__scene.monsters.get("e1").eliteAura; return [a.scaleX, a.alpha, a.visible]; })()`,
      ),
    );
    await sleep(180);
  }
  check(
    still.every((s) => s[0] === 1 && s[1] === still[0][1] && s[2] === true) && still[0][1] >= 0.4,
    `giảm chuyển động: vầng sáng đứng yên (scale 1, độ đục ${still[0][1]}) mà vẫn hiện`,
  );

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
