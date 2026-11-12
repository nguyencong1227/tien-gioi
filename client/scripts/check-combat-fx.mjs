/* global console, setTimeout, fetch, process, Buffer */
// Kiểm hiệu ứng chiến đấu (hạt, rung, chữ bay, hồi máu, quái tan) trong Chrome thật (M5.2 #329). Cần client đang chạy
// (`npm run dev -w client`, cổng của dev B là 5183). Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/check-combat-fx.mjs [--url http://127.0.0.1:5183] [--shot docs/screenshots/combat-fx.webp]
// Đo số HẠT SỐNG THẬT của Phaser (không đọc sổ ngân sách) và trạng thái rung của camera.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const i = process.argv.indexOf("--url");
const BASE_URL = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "http://127.0.0.1:5183";
const CDP_PORT = 39800 + Math.floor(Math.random() * 300);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-combat-fx-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
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
  const J = async (expression) => JSON.parse(await evalJs(`JSON.stringify(${expression})`));

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
  await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1` });
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

  /** Số hạt đang SỐNG THẬT trong mọi emitter của cảnh. */
  const alive = () =>
    evalJs(
      `window.__scene.children.list.filter((c) => c.type === 'ParticleEmitter').reduce((n, e) => n + e.getAliveParticleCount(), 0)`,
    );
  const shaking = () => evalJs("window.__scene.cameras.main.shakeEffect.isRunning");
  const floats = () => evalJs("window.__fx.stats().floatsActive");
  /** Chờ rung cũ tắt và hạt cũ tan để mỗi ca đo độc lập. */
  const settle = async () => {
    await evalJs("window.__scene.cameras.main.resetFX(); 0");
    // Chờ hạt tan HẾT (thăm dò, tối đa 12 s): đồng hồ trò chơi chậm lại khi máy bận nên chờ cố định không đủ
    for (let k = 0; k < 120; k++) {
      await sleep(100);
      if (
        (await evalJs(
          `window.__scene.children.list.filter((c) => c.type === 'ParticleEmitter').reduce((n, e) => n + e.getAliveParticleCount(), 0)`,
        )) === 0 &&
        k >= 9
      )
        break;
    }
  };
  /** Phát tin dmg như server gửi (đi qua đúng đường onHitFx), `mine` bằng cách giả lập một đòn vừa ra. */
  const dmg = (o, mine) =>
    evalJs(`(() => {
      const sc = window.__scene;
      sc.lastAttack = ${mine ? "{ at: sc.time.now, range: 64 }" : "null"};
      sc.onHitFx(Object.assign({ x: sc.predX + 30, y: sc.predY }, ${JSON.stringify(o)}));
      return 1;
    })()`);

  /** Chụp canvas WebGL (điểm ảnh thật) vào window[name]. */
  const snap = (name) =>
    evalJs(`new Promise((resolve) => {
      const s = window.__scene, r = s.game.canvas.getBoundingClientRect();
      s.game.renderer.snapshotArea(0, 0, Math.round(r.width), Math.round(r.height), (img) => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        window[${JSON.stringify(name)}] = x.getImageData(0, 0, c.width, c.height).data; resolve(1);
      });
    })`);
  /**
   * Chạy `js` TRONG trang rồi chụp ở khung hình KẾ TIẾP (snapshotArea chạy sau lần vẽ tới): đo theo khung hình chứ không theo
   * đồng hồ tường nên không lệch khi máy bận (chữ bay mờ dần theo thời gian thật, mà vòng CDP có thể chậm hàng trăm ms).
   */
  const act = (js, name) =>
    evalJs(`new Promise((resolve) => {
      const sc = window.__scene, r = sc.game.canvas.getBoundingClientRect();
      ${js};
      sc.game.renderer.snapshotArea(0, 0, Math.round(r.width), Math.round(r.height), (img) => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        window[${JSON.stringify(name)}] = x.getImageData(0, 0, c.width, c.height).data; resolve(1);
      });
    })`);
  const dmgJs = (o, mine) =>
    `sc.lastAttack = ${mine ? "{ at: sc.time.now, range: 64 }" : "null"}; sc.onHitFx(Object.assign({ x: sc.predX + 30, y: sc.predY }, ${JSON.stringify(o)}))`;
  /** Số điểm ảnh trong ảnh chụp thoả điều kiện `cond` (biểu thức JS theo r, g, b). */
  const count = (name, cond) =>
    evalJs(`(() => { const D = window[${JSON.stringify(name)}]; let n = 0;
      for (let i = 0; i < D.length; i += 4) { const r = D[i], g = D[i + 1], b = D[i + 2]; if (${cond}) n++; }
      return n; })()`);
  // Màu chữ (chữ vẽ NORMAL nên điểm ảnh giữ đúng màu; nền cỏ ~ (145,175,100) không rơi vào các khoảng này)
  const GOLD = "r > 200 && g > 150 && g < 235 && b < 130 && r - b > 110"; // 0xffd34d: "Bạo!" chí mạng
  const RED = "r > 200 && g < 150 && b < 140 && r - g > 70"; // 0xff6b5e: mình bị đánh
  const GREEN = "g > 200 && r < 175 && b > 125 && g - r > 60"; // 0x7dffa0: hồi máu

  await settle();
  check((await alive()) === 0 && (await floats()) === 0, "ban đầu không hạt, không chữ bay");
  await snap("base");
  // Ảnh nền có sẵn vài điểm ảnh gần các màu này (nhân vật, cây): đo phần TĂNG so với nền
  const base0 = {
    gold: await count("base", GOLD),
    red: await count("base", RED),
    green: await count("base", GREEN),
  };

  const WHITE = "r > 235 && g > 215 && b > 150"; // tia lửa (ADD) và chữ trắng chồng lên cỏ thành rất sáng

  // 1) Mình đánh thường: tia lửa + chữ, KHÔNG rung
  await snap("pre1"); // đối chứng NGAY TRƯỚC (nền có thể trôi chậm), thay vì ảnh nền chụp từ đầu phiên
  const white0 = await count("pre1", WHITE);
  await act(dmgJs({ target: "quai-1", amount: 12 }, true), "s1");
  let n = await alive();
  check(n > 0 && n <= 8, `đòn thường: ${n} hạt sống (hit-spark 8)`);
  check(!(await shaking()), "đòn thường không rung màn hình");
  check((await floats()) === 1, "đòn thường: một chữ bay");
  const white1 = await count("s1", WHITE);
  check(
    white1 - white0 > 20,
    `đòn thường: điểm ảnh trắng sáng ${white0} -> ${white1} (tia lửa + chữ thật sự được vẽ)`,
  );
  await settle();

  // 1b) Dồn đòn lên CÙNG mục tiêu (nit của A ở #349): các chữ bay xếp hàng lệch lên, không đè lên nhau
  await settle();
  const ys = await J(`(() => {
    const sc = window.__scene;
    sc.lastAttack = null;
    const base = { target: "quai-chong", x: sc.predX + 30, y: sc.predY };
    sc.onHitFx({ ...base, amount: 11 });
    sc.onHitFx({ ...base, amount: 22, crit: true });
    sc.onHitFx({ ...base, amount: 33 });
    sc.onHitFx({ ...base, amount: 44, crit: true });
    return sc.children.list.filter((c) => c.type === "BitmapText" && c.visible).map((c) => ({ t: c.text, y: Math.round(c.y) }));
  })()`);
  const sortedY = ys.map((f) => f.y).sort((a, b) => a - b);
  const minGap =
    sortedY.length > 1 ? Math.min(...sortedY.slice(1).map((v, i) => v - sortedY[i])) : 0;
  check(ys.length === 4, `dồn 4 đòn lên cùng mục tiêu: ${ys.length} chữ bay`);
  check(
    minGap >= 10,
    `4 chữ xếp 4 hàng, hai chữ gần nhất cách ${minGap} px (>= 10, không đè nhau): ${ys.map((f) => `${f.t}@${f.y}`).join(" | ")}`,
  );
  // Mục tiêu KHÁC không bị đẩy lên: hai đòn lên quái A (hàng 0, 1) rồi một đòn lên quái B => chữ của B ở hàng 0 (cùng độ cao với chữ đầu của A)
  await settle();
  const ys2 = await J(`(() => {
    const sc = window.__scene;
    sc.lastAttack = null;
    const at = (id, amount) => {
      const before = new Set(sc.children.list.filter((c) => c.type === "BitmapText" && c.visible));
      sc.onHitFx({ target: id, x: sc.predX + 30, y: sc.predY, amount });
      return sc.children.list.filter((c) => c.type === "BitmapText" && c.visible && !before.has(c)).map((c) => Math.round(c.y))[0];
    };
    return { a1: at("quai-a", 1), a2: at("quai-a", 2), b1: at("quai-b", 3) };
  })()`);
  check(
    ys2.a2 < ys2.a1 && ys2.b1 === ys2.a1,
    `mục tiêu khác ở hàng 0: A ${ys2.a1} -> ${ys2.a2} (lên một hàng), B ${ys2.b1} (= hàng 0 của A)`,
  );
  await settle();

  // 2) Mình chí mạng: nhiều hạt hơn + rung nhẹ (ưu tiên 2, hồ sơ Cao cho rung)
  await act(dmgJs({ target: "quai-1", amount: 40, crit: true }, true), "s2");
  n = await alive();
  check(n > 8 && n <= 16, `chí mạng của mình: ${n} hạt (hit-heavy 16)`);
  check(Boolean(await shaking()), "chí mạng của mình: màn hình rung nhẹ");
  let c = (await count("s2", GOLD)) - base0.gold;
  check(
    c > 40,
    `chí mạng: ${c} điểm ảnh vàng TĂNG so với nền, đúng màu chữ "Bạo!" trên canvas (> 40)`,
  );
  await settle();

  // 3) Người khác chí mạng gần mình: có hạt nhưng KHÔNG rung màn hình của mình
  await dmg({ target: "quai-1", amount: 40, crit: true }, false);
  await sleep(60);
  n = await alive();
  check(n > 0, `chí mạng của người khác: ${n} hạt`);
  check(!(await shaking()), "chí mạng của người khác không làm màn hình mình rung");
  await settle();

  // 4) Mình bị đánh nặng (>= 15 % khí huyết tối đa 2500): hạt đỏ + rung; bị đánh nhẹ: không rung
  await act(dmgJs({ target: "mock-session-01", amount: 500, toPlayer: true }, false), "s4");
  check(Boolean(await shaking()), "bị đòn nặng (500 / 2500): màn hình rung");
  c = (await count("s4", RED)) - base0.red;
  check(
    c > 30,
    `bị đòn nặng: ${c} điểm ảnh đỏ TĂNG so với nền, đúng màu chữ sát thương trên canvas (> 30)`,
  );
  await settle();
  await dmg({ target: "mock-session-01", amount: 30, toPlayer: true }, false);
  await sleep(60);
  n = await alive();
  check(n > 0 && !(await shaking()), `bị đòn nhẹ: ${n} hạt, không rung`);
  await settle();

  // 5) Hồi máu: khí huyết nhảy một bước lớn -> chữ "+N" xanh + hạt; hồi tự nhiên nhỏ thì không
  await evalJs(`(() => { window.__scene.state.players.get(window.__scene.sid).hp = 1000; 0; })()`);
  await sleep(250);
  await settle();
  const before = await floats();
  await evalJs(`(() => { window.__scene.state.players.get(window.__scene.sid).hp = 1003; 0; })()`);
  await sleep(150);
  check((await floats()) === before, "hồi tự nhiên (+3) không có chữ bay");
  await act("sc.state.players.get(sc.sid).hp = 1600", "s5");
  const txt = await evalJs(
    `window.__scene.children.list.filter((c) => c.type === 'BitmapText' && c.visible).map((c) => c.text).join('|')`,
  );
  check(/\+597/.test(txt ?? ""), `hồi máu lớn: chữ "+597" (${txt})`);
  check((await alive()) > 0, "hồi máu lớn: có hạt heal-glow");
  c = (await count("s5", GREEN)) - base0.green;
  check(
    c > 30,
    `hồi máu: ${c} điểm ảnh xanh TĂNG so với nền, đúng màu chữ "+597" trên canvas (> 30)`,
  );
  await settle();

  // 6) Quái biến khỏi state ngay trong màn hình: tan thành điểm sáng
  await evalJs(`(() => {
    const sc = window.__scene;
    sc.state.monsters.set("t-quai", { kind: "tho", x: sc.predX + 80, y: sc.predY, hp: 40, maxHp: 40, angle: 0 });
    0;
  })()`);
  await sleep(400);
  check((await alive()) === 0, "quái đang đứng yên: chưa có hạt");
  await snap("pre");
  const whitePre = await count("pre", WHITE);
  await act(`sc.state.monsters.delete("t-quai")`, "post");
  n = await alive();
  check(n > 0 && n <= 12, `quái gục trong màn hình: ${n} hạt tan (mon-vanish 12)`);
  const whitePost = await count("post", WHITE);
  check(
    whitePost - whitePre > 15,
    `quái tan: điểm ảnh trắng sáng ${whitePre} -> ${whitePost} (hạt thật sự được vẽ)`,
  );
  await settle();
  // ...còn quái ở xa ngoài khung camera rồi mới biến (rời vùng nhìn) thì KHÔNG nổ hạt
  await evalJs(`(() => {
    const sc = window.__scene;
    sc.state.monsters.set("t-xa", { kind: "tho", x: sc.predX + 3000, y: sc.predY, hp: 40, maxHp: 40, angle: 0 });
    0;
  })()`);
  await sleep(400);
  await evalJs(`window.__scene.state.monsters.delete("t-xa"); 0`);
  await sleep(120);
  check((await alive()) === 0, "quái rời vùng nhìn (ngoài camera): không nổ hạt");

  // Màn hình RỘNG (thu phóng thấp): quái còn sống ở xa 1200 px (ngoài vùng nhìn của server) vẫn nằm trong khung camera. Nó biến
  // khỏi state vì rời vùng nhìn, KHÔNG phải gục: không được nổ hạt. Cùng cảnh đó, quái gần 300 px biến thì nổ (gục thật).
  // (đếm số lần PHÁT mon-vanish thay vì đếm hạt: ở thu phóng 0,3 khung hình thấy cả cổng truyền tống nên hạt xoáy của cổng lẫn vào)
  await evalJs(
    `(() => { const f = window.__fx, o = f.play.bind(f); window.__vanish = 0; f.play = (id, x, y, op) => { if (id === "mon-vanish") window.__vanish++; return o(id, x, y, op); }; return 1; })()`,
  );
  await evalJs(
    `(() => { const sc = window.__scene; sc.cameras.main.setZoom(0.3); sc.cameras.main.centerOn(sc.predX, sc.predY); return 1; })()`,
  );
  await sleep(300);
  await evalJs(`(() => {
    const sc = window.__scene;
    sc.state.monsters.set("t-roi", { kind: "tho", x: sc.predX + 1200, y: sc.predY, hp: 40, maxHp: 40, angle: 0 });
    sc.state.monsters.set("t-gan", { kind: "tho", x: sc.predX + 300, y: sc.predY, hp: 40, maxHp: 40, angle: 0 });
    return 1;
  })()`);
  await sleep(500);
  const visFar = await evalJs(`window.__scene.monsters.get("t-roi").root.visible`);
  check(
    visFar === true,
    "(điều kiện thử) quái ở xa 1200 px đang HIỆN trong khung camera thu phóng 0,3",
  );
  await act(`sc.state.monsters.delete("t-roi")`, "far");
  check(
    (await evalJs("window.__vanish")) === 0,
    "quái còn sống rời vùng nhìn (xa 1200 px, vẫn trong khung): KHÔNG phát hạt tan",
  );
  await act(`sc.state.monsters.delete("t-gan")`, "near");
  check(
    (await evalJs("window.__vanish")) === 1,
    "quái gục gần (300 px) trong cùng cảnh: phát đúng 1 lần hạt tan",
  );
  await evalJs(
    `(() => { const sc = window.__scene; sc.cameras.main.setZoom(0.9375); sc.cameras.main.centerOn(sc.predX, sc.predY); return 1; })()`,
  );
  await settle();

  // Ảnh chụp (tuỳ chọn --shot <tệp.webp>): chí mạng + bị đòn nặng + hồi máu cùng lúc, phóng to quanh nhân vật
  const si = process.argv.indexOf("--shot");
  if (si >= 0 && process.argv[si + 1]) {
    await settle();
    await dmg({ target: "quai-1", amount: 88, crit: true }, true);
    await dmg({ target: "mock-session-01", amount: 420, toPlayer: true }, false);
    await evalJs(
      `(() => { const sc = window.__scene; sc.state.players.get(sc.sid).hp = 900; 0; })()`,
    );
    await sleep(200);
    await settle();
    await evalJs(
      `(() => { const sc = window.__scene; sc.state.players.get(sc.sid).hp = 1700; 0; })()`,
    );
    await dmg({ target: "quai-1", amount: 88, crit: true }, true);
    await dmg({ target: "mock-session-01", amount: 420, toPlayer: true }, false);
    await sleep(110);
    // Vị trí nhân vật trên màn hình (CSS px) = (toạ độ thế giới - góc nhìn camera) * thu phóng * tỉ lệ canvas / DPR
    const pos = await J(`(() => {
      const sc = window.__scene, cam = sc.cameras.main, r = sc.game.canvas.getBoundingClientRect();
      const sx = r.width / sc.scale.width, sy = r.height / sc.scale.height;
      return { x: r.left + (sc.predX - cam.worldView.x) * cam.zoom * sx, y: r.top + (sc.predY - cam.worldView.y) * cam.zoom * sy, zoom: cam.zoom * sx };
    })()`);
    const shot = await send("Page.captureScreenshot", {
      format: "webp",
      quality: 90,
      clip: {
        x: Math.max(0, pos.x - 140),
        y: Math.max(0, pos.y - 130),
        width: 280,
        height: 220,
        scale: 2.5,
      },
    });
    console.log(
      `    (nhân vật ở ${Math.round(pos.x)},${Math.round(pos.y)} px, thu phóng ${pos.zoom})`,
    );
    fs.writeFileSync(process.argv[si + 1], Buffer.from(shot.result.data, "base64"));
    console.log(`    (đã chụp ${process.argv[si + 1]})`);
    await settle();
  }

  // 7) Cảnh đông: 120 đòn của người khác (nửa chí mạng) trong ~1 giây không vượt ngân sách hạt / chữ bay của hồ sơ
  await settle();
  const lim = await J("window.__fx.stats()");
  // 120 đòn trong MỘT khung hình (vòng lặp đồng bộ trong trang): kết quả không phụ thuộc máy bận hay rảnh
  await evalJs(`(() => {
    const sc = window.__scene;
    sc.lastAttack = null;
    for (let k = 0; k < 120; k++)
      sc.onHitFx({ target: "quai-" + (k % 7), amount: 10 + k, crit: k % 2 === 0, x: sc.predX + 30, y: sc.predY });
    return 1;
  })()`);
  await sleep(40);
  const peak = await alive();
  const peakFloats = await floats();
  const st = await J("window.__fx.stats()");
  console.log(
    `    (số đo: đỉnh ${peak} hạt sống / trần ${lim.particleLimit}; đỉnh ${peakFloats} chữ bay; bỏ ${st.dropped} hiệu ứng, ${st.floatsDropped} chữ)`,
  );
  check(
    peak > 0 && peak <= lim.particleLimit,
    `cảnh đông: hạt sống ${peak} <= trần ${lim.particleLimit}`,
  );
  check(st.dropped > 0, `cảnh đông: ngân sách có bỏ bớt hiệu ứng ưu tiên thấp (${st.dropped})`);
  check(peakFloats <= 28, `cảnh đông: chữ bay ${peakFloats} <= damageNumbers (Cao 28)`);
  await settle();

  // 8) Giảm chuyển động: ít hạt hơn, không rung
  await evalJs(
    `(() => { const c = document.getElementById("set-reduced-motion"); c.checked = true; c.dispatchEvent(new Event("change")); })()`,
  );
  await sleep(200);
  await settle();
  await dmg({ target: "quai-1", amount: 40, crit: true }, true);
  await sleep(60);
  n = await alive();
  check(n > 0 && n <= 6, `giảm chuyển động: ${n} hạt (16 x 0,3 ≈ 5)`);
  check(!(await shaking()), "giảm chuyển động: không rung");

  check(pageErrors === 0, `không ngoại lệ trong trang (${pageErrors})`);
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
