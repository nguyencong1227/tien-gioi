// E2E THẬT gói tải theo nhu cầu lúc qua cổng (M7.15, #516; docs/THIET_KE_GIAO_DIEN_DO_HOA.md mục 10.2): server Colyseus thật + Chrome headless +
// client đã build. Máy chủ trong tiến trình tự dựng `/packs/manifest.json` giả và tệp gói CHẬM (độ trễ chọn theo bản đồ), ghi lại từng yêu cầu.
// Kiểm HỢP ĐỒNG, không kiểm hình ảnh:
//  1. Gói bản đồ đích BẮT ĐẦU TẢI NGAY LÚC GỬI `travel` (không đợi màn chuyển cảnh khép / `travelTo`): yêu cầu tệp tới trong vòng 300 ms.
//  2. Đang chờ gói thì màn chuyển cảnh vẫn hiện; gói về (2 s) mới ẩn; sang đúng bản đồ, 0 lỗi.
//     Chờ gói xảy ra TRƯỚC khi vào phòng mới (B review #541, S1): trong lúc chờ, nhân vật KHÔNG ở trong phòng của bản đồ đích (máy chủ không
//     dựng nhân vật ở điểm xuất hiện để quái đánh trong lúc client ở màn chuyển cảnh, không điều khiển được; chết do quái là mất kiếp).
//  3. Gói chậm hơn 8 s: VẪN qua cổng (ẩn màn chuyển cảnh trong khoảng 8-11 s, không đợi hết 12 s, không báo lỗi), và việc tải KHÔNG bị huỷ
//     (tệp vẫn về trọn, yêu cầu không bị đóng giữa chừng).
//  4. Tải trước, mỗi đường một ca: 4g đứng xa cổng thì tải gói bản đồ kề lúc rảnh; 3g đứng sát cổng thì tải gói bên kia cổng (mỗi gói một lần).
//  5. Tiết kiệm dữ liệu: không tải trước gì (chỉ tải khi qua cổng).
// Chạy: `npm run build -w client && npm run e2e:goi-tai -w server` (cần google-chrome).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Tab, sleep, listenWithRetry, removeTmpDirs, getChromeGpuFlags } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 38000 + Math.floor(Math.random() * 2000);
let PORT = pickPort();
const CDP = 9800 + Math.floor(Math.random() * 300);
const out = (m: string) => console.log(m);

/** Mỗi yêu cầu tệp gói đã tới máy chủ giả. */
interface PackReq {
  mapId: string;
  at: number;
  /** Trình duyệt đóng kết nối trước khi ta trả xong (= việc tải bị huỷ) */
  aborted: boolean;
  done: boolean;
}

async function main() {
  out("=== E2E THẬT gói tải theo nhu cầu lúc qua cổng: server Colyseus thật + Chrome headless ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-goi-tai-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-goi-tai-chrome-"));
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");
  const { savePlayer, hashSecret } = await import("../src/store.js");

  // --- Máy chủ gói giả: manifest + tệp chậm ---
  const FILE_BYTES = 1000;
  const SHA = "ab".repeat(32);
  const delays: Record<string, number> = { am_suong: 2000, hac_phong: 12000 };
  const reqs: PackReq[] = [];
  const manifest = {
    packs: ["am_suong", "hac_phong"].map((id) => ({
      id: `map:${id}`,
      kind: "map",
      mapId: id,
      files: [{ path: `map/${id}/t.bin`, bytes: FILE_BYTES, sha256: SHA }],
      bytes: FILE_BYTES,
    })),
  };
  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/packs/manifest.json", (_req, res) =>
    res.set("Cache-Control", "no-store").json(manifest),
  );
  app.get("/packs/map/:id/t.bin", async (req, res) => {
    const rec: PackReq = { mapId: req.params.id, at: Date.now(), aborted: false, done: false };
    reqs.push(rec);
    req.on("close", () => {
      if (!res.writableEnded) rec.aborted = true;
    });
    await sleep(delays[req.params.id] ?? 0);
    if (rec.aborted) return;
    res.set("Cache-Control", "no-store").send(Buffer.alloc(FILE_BYTES));
    rec.done = true;
  });
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  defineRooms(gameServer);
  try {
    PORT = await listenWithRetry(httpServer, PORT, { explicit: false, pick: pickPort });
  } catch (err) {
    await removeTmpDirs(dataDir, chromeDir);
    throw err;
  }

  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  let failed: string | null = null;
  const ok = (m: string) => out(`  ✓ ${m}`);
  const must = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };
  /** Số người đang ở trong (các) phòng Colyseus của bản đồ `mapId`, đọc thẳng từ máy chủ */
  const clientsIn = async (mapId: string) => {
    const { roomNameOf } = await import("@tien-gioi/shared");
    return (await matchMaker.query({ name: roomNameOf(mapId) })).reduce((n, r) => n + r.clients, 0);
  };
  /** Sau `ms` kể từ BÂY GIỜ, đếm người trong phòng của `mapId` (chạy song song với `crossPortal`) */
  const probeClients = (mapId: string, ms: number) => sleep(ms).then(() => clientsIn(mapId));

  try {
    chrome = spawn(
      "google-chrome",
      [
        "--headless=new",
        "--no-sandbox",
        ...getChromeGpuFlags(),
        `--remote-debugging-port=${CDP}`,
        `--user-data-dir=${chromeDir}`,
        "--window-size=1280,720",
        "about:blank",
      ],
      { stdio: "ignore", detached: true },
    );
    let targets: any[] = [];
    for (const start = Date.now(); Date.now() - start < 8000;) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP}/json`);
        if (res.ok) {
          targets = (await res.json()) as any[];
          break;
        }
      } catch {
        await sleep(150);
      }
    }
    const first = targets.find((t) => t.type === "page");
    if (!first?.webSocketDebuggerUrl) throw new Error("Không kết nối được Chrome DevTools");
    tab = await Tab.open("A", first.webSocketDebuggerUrl);
    const T = tab;
    const ev = (expr: string) => T.ev(expr) as Promise<any>;

    // Pha 3 dùng nhân vật khác: phiên cũ còn chờ nối lại (RECONNECT_GRACE_S) nên không đăng nhập lại cùng tên ngay được
    let NAME = "Goi Tai Cong";
    let SECRET = "e2e_secret_gt_1111111111111";
    const { getMap } = await import("@tien-gioi/shared");
    const north = getMap("hac_phong")!.portal("hac_phong_bac")!;
    // Nhân vật lưu sẵn cạnh cổng bắc Hắc Phong (trong khu an toàn): khỏi đi bộ qua bản đồ dày quái. Client vào phòng Lạc Hà rồi `wrong_map` đưa về đúng phòng.
    const saveChar = (mapId: string, x: number, y: number) =>
      savePlayer({
        name: NAME,
        secretHash: hashSecret(SECRET),
        realm: 3,
        tier: 0,
        exp: 0,
        mapId,
        x,
        y,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    let scriptId: string | null = null;
    /** Đặt `navigator.connection` giả (mạng + tiết kiệm dữ liệu) và đạo hiệu / mã bí mật cho lần tải trang kế */
    const setStorage = async (conn: { effectiveType: string; saveData: boolean }) => {
      if (scriptId)
        await T.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId });
      const r = await T.send("Page.addScriptToEvaluateOnNewDocument", {
        source:
          `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)});` +
          ` localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)});` +
          ` Object.defineProperty(navigator, "connection", { configurable: true, value: ${JSON.stringify(conn)} });`,
      });
      scriptId = String(r.result?.identifier ?? "");
    };
    const login = async () => {
      await T.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?debug=1` });
      await T.waitFor(
        `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
        "form đăng nhập",
      );
      await T.ev(
        `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME)}; document.getElementById('login-form').requestSubmit(); 1`,
      );
      await T.waitFor(
        `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
        "vào game thành công",
      );
      await T.waitFor(
        `window.__scene && window.__scene.map && window.__scene.map.def.id === 'hac_phong'`,
        "vào đúng phòng Hắc Phong Cốc",
        30000,
      );
    };

    // Đi bộ tới cổng `id` bằng joystick ảo (BFS trên ô) rồi đứng sát tâm cổng (như e2e-chuyen-canh)
    const walkToPortal = async (id: string) => {
      const P = `window.__scene.map.portals.find((q) => q.id === ${JSON.stringify(id)})`;
      await ev(`(() => { const s = window.__scene, m = s.map, W = m.def.w, H = m.def.h, tiles = m.tiles, p = ${P}, J = window.__joystick;
        window.__walkErr = ''; if (!p) { window.__walkErr = 'bản đồ này không có cổng ' + ${JSON.stringify(id)}; return 0; }
        const bad = (i) => { const t = tiles[i]; return t === 3 || t === 4 || t === 5; };
        const sx = Math.floor(s.predX / 32), sy = Math.floor(s.predY / 32), gx = Math.floor(p.x / 32), gy = Math.floor(p.y / 32);
        const prev = new Int32Array(W * H).fill(-2); const q = [sy * W + sx]; prev[q[0]] = -1;
        for (let h = 0; h < q.length; h++) { const c = q[h], cx = c % W, cy = (c - cx) / W;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx;
            if (prev[n] !== -2 || bad(n)) continue; prev[n] = c; q.push(n); } }
        const goal = gy * W + gx; if (prev[goal] === -2) { window.__walkErr = 'không có đường tới cổng'; return 0; }
        const path = []; for (let c = goal; c !== -1; c = prev[c]) path.push([(c % W) * 32 + 16, Math.floor(c / W) * 32 + 16]); path.reverse();
        let i = 1; window.__walkLen = path.length;
        window.__walkTimer = setInterval(() => { if (Math.hypot(s.predX - p.x, s.predY - p.y) < 30 || i >= path.length) { J.x = 0; J.y = 0; J.active = false; clearInterval(window.__walkTimer); return; }
          const [tx, ty] = path[i], dx = tx - s.predX, dy = ty - s.predY, d = Math.hypot(dx, dy);
          if (d < 8) { i++; return; } J.x = dx / d; J.y = dy / d; J.active = true; }, 40); return 1; })()`);
      must(!(await ev(`window.__walkErr`)), `có đường đi bộ tới cổng ${id}`);
      try {
        await T.waitFor(
          `!!window.__scene.nearPortal && Math.hypot(window.__scene.predX - ${P}.x, window.__scene.predY - ${P}.y) < 40`,
          `tới sát tâm cổng ${id}`,
          45000,
        );
      } catch (err) {
        // Chẩn đoán: đứng ở đâu, cổng ở đâu, đã đi được bao nhiêu ô, lỗi console
        out(
          `  (chẩn đoán đi bộ: ${await ev(`JSON.stringify({ map: window.__scene.map.def.id, pred: [window.__scene.predX, window.__scene.predY], me: (() => { const m = window.__scene.me && window.__scene.me(); return m ? [m.x, m.y] : null; })(), portal: (() => { const p = ${P}; return p ? [p.x, p.y] : null; })(), walkErr: window.__walkErr, walkLen: window.__walkLen, over: document.getElementById('transition-overlay').hidden, near: !!window.__scene.nearPortal, reconnecting: window.__scene.isReconnecting })`)}; console: ${T.errors.slice(0, 4).join(" | ")})`,
        );
        throw err;
      }
      await ev(
        `(() => { const J = window.__joystick; J.x = 0; J.y = 0; J.active = false; return 1; })()`,
      );
      await sleep(700); // đợi vị trí THẬT của server đuổi kịp vị trí đoán trước (server kiểm khoảng cách tới cổng)
    };

    const overlayHidden = `document.getElementById('transition-overlay').hidden === true`;
    /** Qua cổng `id` sang `destMapId`: trả thời điểm gửi và thời điểm màn chuyển cảnh ẩn lại */
    const crossPortal = async (id: string, destMapId: string, timeout: number) => {
      const t0 = Date.now();
      await ev(`window.__scene.travelPortal(${JSON.stringify(id)}); 1`);
      await T.waitFor(
        `document.getElementById('transition-overlay').classList.contains('active') && !document.getElementById('transition-overlay').hidden`,
        "màn chuyển cảnh hiện",
        5000,
      );
      await T.waitFor(
        `window.__scene.map.def.id === ${JSON.stringify(destMapId)}`,
        `sang bản đồ ${destMapId}`,
        timeout,
      );
      const swapped = Date.now();
      await T.waitFor(overlayHidden, "màn chuyển cảnh ẩn lại", timeout);
      return { t0, swapped, hidden: Date.now() };
    };

    // ---------------- Pha 1: tiết kiệm dữ liệu (không tải trước), qua cổng chờ gói ----------------
    out("\n--- Tiết kiệm dữ liệu: chỉ tải khi qua cổng; gói về trong 2 s ---");
    await saveChar("hac_phong", north.spawn.x, north.spawn.y);
    await setStorage({ effectiveType: "4g", saveData: true });
    await login();
    await sleep(6500); // quá hạn `requestIdleCallback` (5 s): nếu có tải trước thì đã thấy yêu cầu
    must(reqs.length === 0, `tiết kiệm dữ liệu: KHÔNG tải trước gói nào (${reqs.length} yêu cầu)`);
    ok("tiết kiệm dữ liệu: không có yêu cầu gói nào trước khi qua cổng");
    await walkToPortal("hac_phong_bac");
    must(reqs.length === 0, "đi sát cổng cũng không tải trước khi tiết kiệm dữ liệu");

    const probeA = probeClients("am_suong", 1100); // gói cần 2 s: ở giây thứ 1,1 vẫn đang chờ
    const a = await crossPortal("hac_phong_bac", "am_suong", 20000);
    const midA = await probeA;
    must(
      midA === 0,
      `đang chờ gói: nhân vật CHƯA ở trong phòng đích (am_suong có ${midA} người; vào phòng trước rồi mới chờ thì quái đánh trong lúc không điều khiển được)`,
    );
    ok("đang chờ gói (1,1 s): nhân vật chưa vào phòng am_suong");
    must(
      (await clientsIn("am_suong")) === 1,
      "qua cổng xong thì nhân vật đã ở trong phòng am_suong",
    );
    const ra = reqs.filter((r) => r.mapId === "am_suong");
    must(ra.length === 1, `gói am_suong được yêu cầu đúng một lần (${ra.length})`);
    must(
      ra[0].at - a.t0 < 300,
      `gói bắt đầu tải NGAY lúc gửi travel, không đợi màn chuyển cảnh / travelTo (${ra[0].at - a.t0} ms sau lúc gửi)`,
    );
    ok(
      `gói am_suong tải bắt đầu ${ra[0].at - a.t0} ms sau lúc gửi travel (song song với màn chuyển cảnh)`,
    );
    must(
      a.hidden - a.t0 >= delays.am_suong - 150,
      `màn chuyển cảnh CHỜ gói về (${a.hidden - a.t0} ms >= ${delays.am_suong} ms)`,
    );
    must(
      a.hidden - a.t0 < delays.am_suong + 2500,
      `chờ SONG SONG, không nối đuôi nhiều bước (${a.hidden - a.t0} ms)`,
    );
    must(ra[0].done && !ra[0].aborted, "gói am_suong về trọn vẹn");
    // Cảnh đối chiếu vị trí một lần ngay khi gắn phòng mới (`setupNetwork(false)` gọi `reconcile()`): vị trí đoán trước phải theo phòng mới ngay,
    // không kẹt ở toạ độ bản đồ cũ (đứng yên không có patch nào để đối chiếu lại)
    const arrive = getMap("hac_phong")!.portal("hac_phong_bac")!;
    const dest = getMap(arrive.toMap)!.portal(arrive.toPortal)!;
    const off = Number(
      await ev(
        `Math.hypot(window.__scene.predX - ${dest.spawn.x}, window.__scene.predY - ${dest.spawn.y})`,
      ),
    );
    must(
      off < 40,
      `sang bản đồ mới: vị trí đoán trước theo chỗ xuất hiện (${off.toFixed(0)} px lệch, không kẹt ở toạ độ bản đồ cũ)`,
    );
    ok(`vị trí đoán trước đúng chỗ xuất hiện ở bản đồ mới (lệch ${off.toFixed(1)} px)`);
    ok(
      `màn chuyển cảnh ẩn sau ${a.hidden - a.t0} ms (gói chậm ${delays.am_suong} ms): đã chờ gói rồi mới vào`,
    );

    // ---------------- Pha 2: gói chậm hơn 8 s ----------------
    out("\n--- Gói chậm 12 s (> 8 s): vẫn qua cổng ở ~8 s, việc tải không bị huỷ ---");
    await sleep(900); // đợi cảnh đối chiếu vị trí với phòng mới (predX / predY) trước khi tính đường đi bộ
    await walkToPortal("am_suong_nam");
    const probeB = probeClients("hac_phong", 4000); // gói cần 12 s, giờ chờ 8 s: ở giây thứ 4 vẫn đang chờ, KHÔNG được ở trong phòng đích
    const b = await crossPortal("am_suong_nam", "hac_phong", 30000);
    const midB = await probeB;
    must(
      midB === 0,
      `đang chờ gói chậm (4 s): nhân vật CHƯA ở trong phòng hac_phong (có ${midB} người; Hắc Phong Cốc có quái, lúc vào không có bảo hộ)`,
    );
    ok(
      "đang chờ gói chậm (4 s): nhân vật chưa vào phòng hac_phong (không đứng cho quái đánh trên màn chuyển cảnh)",
    );
    const rb = reqs.filter((r) => r.mapId === "hac_phong");
    must(rb.length >= 1, "gói hac_phong được yêu cầu");
    must(
      rb[0].at - b.t0 < 300,
      `gói hac_phong bắt đầu tải ngay lúc gửi travel (${rb[0].at - b.t0} ms)`,
    );
    const waited = b.hidden - b.t0;
    must(
      waited >= 7500 && waited < 11000,
      `quá 8 s thì VẪN qua cổng, không đợi hết ${delays.hac_phong} ms (${waited} ms)`,
    );
    ok(`vẫn qua cổng sau ${waited} ms dù gói cần ${delays.hac_phong} ms`);
    must(
      !(await ev(`!!document.querySelector('#toast p.bad')`)),
      "không có thông báo lỗi chuyển bản đồ",
    );
    must(!rb[0].aborted && !rb[0].done, "hết giờ KHÔNG huỷ việc tải (yêu cầu vẫn mở, chưa xong)");
    await T.waitFor(`window.__scene.map.def.id === 'hac_phong'`, "vẫn ở Hắc Phong Cốc", 5000);
    for (let k = 0; k < 60 && !rb[0].done; k++) await sleep(250);
    must(rb[0].done && !rb[0].aborted, "gói chậm về trọn vẹn SAU khi đã vào (không bị huỷ)");
    ok("gói chậm về muộn trọn vẹn, yêu cầu không bị đóng giữa chừng");
    must(
      reqs.filter((r) => r.mapId === "hac_phong").length === 1,
      "không tải lại gói chậm lần hai",
    );

    // ---------------- Pha 3: tải trước, MỖI đường một ca (đường kia bị tắt) ----------------
    // 3a: 4g, đứng XA mọi cổng (> 1200 px): chỉ còn đường "bản đồ kề lúc rảnh" (`prefetchNeighbors`, cần đúng 4g).
    // 3b: 3g (không còn tải bản đồ kề), đứng SÁT cổng: chỉ còn đường "lại gần cổng" (`mapsNearPortals`, cho phép 3g).
    // Không tách thì gỡ một trong hai đường vẫn xanh vì đường kia tải thay.
    delays.am_suong = 0;
    delays.hac_phong = 0;
    const hp = getMap("hac_phong")!;
    const far = (() => {
      for (let y = 1400; y < 1700; y += 32)
        for (let x = 1900; x < 2300; x += 32)
          if (
            !hp.circleBlocked(x, y, 40) &&
            hp.portals.every((q) => Math.hypot(q.x - x, q.y - y) > 1300)
          )
            return { x, y };
      throw new Error("không tìm được chỗ đứng xa cổng ở Hắc Phong Cốc");
    })();
    const loginAs = async (name: string, secret: string, x: number, y: number, net: string) => {
      NAME = name;
      SECRET = secret;
      reqs.length = 0;
      await saveChar("hac_phong", x, y);
      await setStorage({ effectiveType: net, saveData: false });
      await login();
    };
    const waitReq = async (mapId: string, ms: number) => {
      for (let k = 0; k < ms / 250 && !reqs.some((r) => r.mapId === mapId); k++) await sleep(250);
      return reqs.some((r) => r.mapId === mapId);
    };

    out("\n--- Mạng 4g, đứng xa cổng: vào bản đồ xong tự tải trước gói bản đồ kề lúc rảnh ---");
    await loginAs("Goi Tai Ba", "e2e_secret_gt_3333333333333", far.x, far.y, "4g");
    must(
      Number(
        await ev(
          `Math.min(...window.__scene.map.portals.map((q) => Math.hypot(q.x - window.__scene.predX, q.y - window.__scene.predY)))`,
        ),
      ) > 1250,
      "đứng xa mọi cổng (> 1200 px)",
    );
    must(
      await waitReq("am_suong", 12000),
      "4g: gói bản đồ kề Âm Sương được tải trước dù đứng xa cổng (đường bản đồ kề)",
    );
    ok("4g, xa cổng: tải trước gói bản đồ kề lúc rảnh");

    out("\n--- Mạng 3g, đứng sát cổng: lại gần cổng thì tải trước gói bên kia ---");
    await loginAs("Goi Tai Bon", "e2e_secret_gt_4444444444444", north.spawn.x, north.spawn.y, "3g");
    must(
      await waitReq("am_suong", 12000),
      "3g: gói bên kia cổng được tải trước khi đứng sát cổng (đường lại gần cổng)",
    );
    ok("3g, sát cổng: tải trước gói bản đồ bên kia cổng");
    await sleep(1500);
    must(
      reqs.filter((r) => r.mapId === "am_suong").length === 1,
      "mỗi gói tải trước đúng một lần (không lặp mỗi 150 ms theo vòng cập nhật cổng)",
    );
    ok("không tải lặp lại");

    must(T.errors.length === 0, `0 lỗi console / exception (${T.errors.slice(0, 2).join(" | ")})`);
    ok("0 lỗi console / exception");
    out("\n=== E2E GÓI TẢI LÚC QUA CỔNG ĐẠT ===");
  } catch (err) {
    failed = err instanceof Error ? err.message : String(err);
    out(`\n  ✗ THẤT BẠI: ${failed}`);
  } finally {
    if (tab) {
      try {
        tab.close();
      } catch {
        /* bỏ qua */
      }
    }
    if (chrome?.pid) {
      try {
        process.kill(-chrome.pid, "SIGKILL");
      } catch {
        chrome.kill("SIGKILL");
      }
    }
    await new Promise<void>((r) => httpServer.close(() => r()));
    await gameServer.gracefullyShutdown(false);
    try {
      await sleep(1200);
      execSync(`rm -rf "${dataDir}" "${chromeDir}"`);
      await sleep(600);
      execSync(`rm -rf "${chromeDir}"`);
    } catch {
      /* bỏ qua */
    }
  }
  if (failed) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error("Lỗi thực thi main:", err);
  process.exit(1);
});
