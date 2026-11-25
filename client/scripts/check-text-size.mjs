/* global console, setTimeout, process */
// Cổng kiểm cỡ chữ (M5.1 #326, docs/THIET_KE_GIAO_DIEN_DO_HOA.md mục 4.2 điều 2) trong Chrome thật: trên điện thoại chữ NỘI DUNG (bảng, hộp thoại)
// >= 14 px và nhãn HUD >= 12 px, kể cả khi chọn cỡ chữ Nhỏ; trên máy tính cỡ chữ gốc giữ nguyên ở Vừa và co giãn theo Nhỏ / Lớn; không tràn
// ngang ở cỡ Lớn. Đo `font-size` TÍNH RA của mọi nút văn bản đang hiện. Mặc định tự dựng Vite của cây này trên cổng trống (tự tắt khi xong); `--url` để dùng client đang chạy sẵn.
// Dùng chế độ mock (?duel=mock&debug=1) nên KHÔNG cần server.
//   node client/scripts/check-text-size.mjs [--url <client đang chạy sẵn, tuỳ chọn>]
import WebSocket from "ws";
import { resolveClientUrl } from "./client-url.mjs";
import { launchChrome } from "./chrome-launch.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const i = process.argv.indexOf("--url");
const BASE_URL = await resolveClientUrl(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "");
let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures++;
};
let launched = null;
try {
  launched = await launchChrome({ name: "text-size" });
  const page = launched.page;
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
  await send("Page.navigate", { url: `${BASE_URL}/?duel=mock&debug=1&crowd=6&social=1` });
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
    ["social-modal", "toggleSocialModal"], // M9 (cờ `?social=1` bật ở địa chỉ trang): ba tab Xếp hạng / Thành tựu / Sự kiện
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
  // Lời đề nghị chặn đường mẫu (cùng dạng `ambushOffer` của máy chủ): văn mẫu dài, mức "Cầm đầu", số lớn có dấu chấm ngăn nghìn
  const AMBUSH_MSG = {
    id: "0123456789abcdef",
    scene:
      "Đường đi bỗng vắng hẳn. Từ bụi cỏ ven lối, một bóng đen lao ra chắn trước mặt, mắt đỏ ngầu. Gió cuốn bụi mù mịt, tiếng gầm gừ vang lên từ phía sau những tảng đá lớn bên đường.",
    foe: { name: "Đạo Tặc Đầu Lĩnh", tier: "leader", count: 3 },
    price: { exp: 123456, coin: { price: 12345, enough: true } },
    ms: 10000,
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
      // Hộp thoại gặp chặn đường (mục 52, CD7): chữ >= 14 px trên điện thoại (kể cả Nhỏ), không tràn khi cỡ Lớn; ba nút hiện đủ
      await evalJs(`window.__ui.onAmbushOffer(${JSON.stringify(AMBUSH_MSG)});0`);
      await sleep(300);
      const amb = await scan("#ambush-modal");
      if (vp.phone) {
        const bad = offenders(amb, 14);
        check(
          !bad,
          `${vp.name} [${mode}] #ambush-modal (chặn đường): mọi chữ >= 14 px${bad ? " (nhỏ hơn: " + bad + ")" : ""}`,
        );
      }
      if (mode === "large" && vp.phone)
        check(await noOverflow(), `${vp.name} [large] #ambush-modal: không tràn ngang / dọc`);
      await evalJs('window.__ui.onAmbushEnd({ result: "canceled" });0');
      await sleep(100);
      // Banner trùm thế giới (M9.7, `#wb-banner`) lúc đang diễn ra (có danh sách đóng góp): là lớp phủ kiểu HUD nằm trên màn chiến đấu nên theo sàn HUD (nhãn >= 12 px trên điện thoại, kể cả Nhỏ), không tràn khi cỡ Lớn
      await evalJs(`window.__ui.setWorldBoss(window.__sample.worldBoss("live"));0`);
      await sleep(300);
      const wb = await scan("#wb-banner");
      check(
        wb !== null && Object.keys(wb).length > 0,
        `${vp.name} [${mode}] #wb-banner: hiện có chữ`,
      );
      if (vp.phone && wb) {
        const bad = offenders(wb, 12);
        check(
          !bad,
          `${vp.name} [${mode}] #wb-banner (trùm thế giới, kiểu HUD): mọi nhãn >= 12 px${bad ? " (nhỏ hơn: " + bad + ")" : ""}`,
        );
      }
      if (mode === "large" && vp.phone)
        check(await noOverflow(), `${vp.name} [large] #wb-banner: không tràn ngang / dọc`);
      await evalJs(`window.__ui.setWorldBoss(window.__sample.worldBoss("none"));0`);
      await sleep(100);
      // Đấu trường chặn đường (CD7 bước 3): HUD, bảng xác nhận bỏ chạy, thẻ kết quả: chữ >= 14 px trên điện thoại, không tràn ở cỡ Lớn
      await evalJs(
        `window.__ui.onAmbushState(${JSON.stringify({ msLeft: 83000, price: { exp: 123456, coin: { price: 12345, enough: true } } })});0`,
      );
      await sleep(300);
      const hud = await scan("#ambush-hud");
      await evalJs('document.getElementById("ahud-flee").click();0');
      await sleep(300);
      const flee = await scan("#ambush-flee-modal");
      if (vp.phone) {
        for (const [name, o] of [
          ["#ambush-hud (HUD đấu trường)", hud],
          ["#ambush-flee-modal (xác nhận bỏ chạy)", flee],
        ]) {
          const bad = offenders(o, 14);
          check(
            !bad,
            `${vp.name} [${mode}] ${name}: mọi chữ >= 14 px${bad ? " (nhỏ hơn: " + bad + ")" : ""}`,
          );
        }
      }
      if (mode === "large" && vp.phone)
        check(
          await noOverflow(),
          `${vp.name} [large] đấu trường chặn đường: không tràn ngang / dọc`,
        );
      await evalJs(
        'window.__ui.onAmbushEnd({ result: "won", rewards: { exp: 360, coin: 48, items: [] } });0',
      );
      await sleep(200);
      const res = await scan("#ambush-result");
      if (vp.phone) {
        const bad = offenders(res, 14);
        check(
          !bad,
          `${vp.name} [${mode}] #ambush-result (thẻ kết quả): mọi chữ >= 14 px${bad ? " (nhỏ hơn: " + bad + ")" : ""}`,
        );
      }
      await evalJs("window.__ui.hideAmbush();0");
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
  if (launched) await launched.close();
}
console.log(failures ? `\n${failures} khẳng định SAI` : "\nTất cả khẳng định đúng");
process.exit(failures ? 1 : 0);
