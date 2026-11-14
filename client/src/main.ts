import Phaser from "phaser";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  LINH_HU_MAP_ID,
  TRAVEL_JOIN_TIMEOUT_MS,
  JOIN_BAD_TOKEN,
  JOIN_NEED_CHARACTER,
  NPCS,
  QUESTS,
  RECIPES,
  SHOPS,
  SKILLS_M7,
  getMap,
  isDungeonMap,
  type TravelToMsg,
  type LimboMsg,
  type SkillsMsg,
} from "@tien-gioi/shared";
import { WorldScene } from "./scenes/WorldScene";
import { ui } from "./ui";
import {
  buildMockThuMonDialog,
  dungeonFallenDeathText,
  dungeonFallenSubText,
  isMockDungeonEnabled,
  isMockDungeonFallen,
  MOCK_DUNGEON_SAMPLES,
} from "./dungeon";
import { isMockDuelEnabled, MOCK_DUEL_SAMPLES } from "./duel";
import { isMockSectEnabled, MOCK_SECT_SAMPLES } from "./sect";
import {
  isMockSkillsEnabled,
  mockAssign,
  mockCast,
  mockRealm,
  mockSkillCount,
  mockSkillsMsg,
} from "./skill-bar";
import { mockSpawnOf, mockStartMapId, mockSyncsState } from "./mock-map";
import { captureEarlyMessages } from "./early-messages";
import { joinWithRedirect, isClientOutdatedError } from "./connection";
import { clearToken, getToken } from "./auth";
import { initAuthUi, switchAuthView } from "./auth-ui";
import { setupPwa, canReloadSafely, isNativeApp, type PwaGameState } from "./pwa";
import { setupNativeApp, getOutdatedUiConfig, getAppUpdateUrl } from "./native-app";
import { HeartbeatController } from "./heartbeat";
import { sound } from "./audio";
import { initDisplay } from "./gfx/display";
import { initSheetSwipe } from "./gfx/sheet-swipe";
import { installTouchGuards } from "./touch";
import { initUiScale } from "./ui-scale";
import { getDisplay, onDisplayChange, setRenderScale } from "./gfx/display";
import {
  browserQualityEnv,
  getQuality,
  initQuality,
  onQualityChange,
  qualityFrame,
  refreshQuality,
  setQualityActive,
} from "./gfx/quality";
import {
  attachScale,
  canvasSizeFor,
  computeRenderScale,
  fpsLimitFor,
  type GameLike,
} from "./gfx/scale";
import { mountPerfOverlay } from "./gfx/perf-overlay";
import { browserPacksEnv, initPacks, packs } from "./gfx/packs";
import { isReducedMotion } from "./a11y";

// Lõi hiển thị M5 (#322): đặt data-form / data-orient / data-input và --safe-*, --vw, --vh lên <html> SỚM, trước khi dựng giao diện.
initDisplay();
// Chặn cử chỉ mặc định của trình duyệt trên cảm ứng (phóng to hai ngón / chạm đúp, trình đơn nhấn giữ) (#327)
installTouchGuards();
initUiScale(); // nối ô Cài đặt -> Cỡ chữ với display.ts (`setUiScale`); PHẢI sau initDisplay()
initSheetSwipe(); // vuốt tiêu đề tấm để đóng (điện thoại)

// Chất lượng đồ hoạ M5 (#323): hồ sơ Thấp / Vừa / Cao, Tự động + bộ điều tốc; SAU initDisplay (cần `form`)
initQuality(browserQualityEnv(() => getDisplay().form, isReducedMotion));
// Gói tải theo nhu cầu (#516): chỉ BỔ SUNG, thiếu gói trò chơi vẫn chạy. Gói `hd:*` bật khi bậc "Rất cao" ổn định (nối khi #538 vào main).
initPacks(browserPacksEnv({ isNative: isNativeApp, hdAllowed: () => false }));
document.addEventListener("visibilitychange", () => setQualityActive(!document.hidden));
if (typeof window.matchMedia === "function") {
  // Hệ điều hành đổi "giảm chuyển động" lúc đang chơi
  window
    .matchMedia("(prefers-reduced-motion: reduce)")
    .addEventListener?.("change", refreshQuality);
}

const NAME_KEY = "tien-gioi:name";
const SECRET_KEY = "tien-gioi:secret";

function createMockDungeonRoom(
  dead = false,
  spawn = mockSpawnOf(DEFAULT_MAP_ID),
  syncState = false,
  realm = 1,
): any {
  const handlers = new Map<string, ((msg: any) => void)[]>();
  return {
    sessionId: "mock-session-01",
    reconnectionToken: "mock-token-01",
    onMessage: (type: string, fn: (msg: any) => void) => {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type)!.push(fn);
      return () => {
        const list = handlers.get(type);
        if (list) {
          const idx = list.indexOf(fn);
          if (idx !== -1) list.splice(idx, 1);
        }
      };
    },
    // Giả lập máy chủ gửi tin `type` tới handler đã đăng ký của cảnh (script kiểm ở chế độ ?debug dùng để thử đúng đường tin nhắn, không gọi thẳng hàm)
    emit: (type: string, msg: unknown) => {
      for (const fn of handlers.get(type) ?? []) fn(msg);
    },
    // Máy chủ thật gọi lại ngay khi có state: cảnh lấy vị trí người chơi làm gốc (reconcile). Mock chỉ làm vậy khi `syncState` (xem mockSyncsState)
    onStateChange: (fn: () => void) => {
      if (syncState) setTimeout(fn, 0);
    },
    onLeave: () => {},
    send: (type: string, data: any) => {
      if (import.meta.env.DEV) console.log("[mock-dungeon-send]", type, data);
    },
    leave: () => {},
    state: {
      players: (() => {
        const pMap = new Map<string, any>([
          [
            "mock-session-01",
            {
              name: "Trương Tiểu Phàm",
              realm,
              tier: 8,
              hp: dead ? 0 : 2500,
              maxHp: 2500,
              mp: dead ? 0 : 1200,
              maxMp: 1200,
              exp: 8000,
              expMax: 10000,
              x: spawn.x,
              y: spawn.y,
              lastSeq: 0,
              dead,
              meditating: false,
            },
          ],
        ]);
        if (typeof window !== "undefined" && new URLSearchParams(location.search).has("crowd")) {
          const rawCount = parseInt(new URLSearchParams(location.search).get("crowd") || "30", 10);
          const count = Math.max(1, Math.min(100, isNaN(rawCount) ? 30 : rawCount));
          for (let i = 1; i <= count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const r = 30 + (i % 6) * 22;
            const px = Math.round(spawn.x + Math.cos(angle) * r);
            const py = Math.round(spawn.y + Math.sin(angle) * r);
            pMap.set(`mock-bot-${i}`, {
              name: `Đạo Hữu ${i}`,
              realm: (i % 4) + 1,
              tier: i % 9,
              hp: 2000,
              maxHp: 2000,
              mp: 1000,
              maxMp: 1000,
              exp: 500,
              expMax: 1000,
              x: px,
              y: py,
              px,
              py,
              angle,
              sect: i % 2 === 0 ? "Tiên" : undefined,
              duel: i % 4 === 0,
              weapon: i % 3 === 0 ? "lang_nha_kiem" : undefined,
              robe: i % 3 === 1 ? "tho_nhung_bao" : undefined,
              talisman: i % 3 === 2 ? "long_tho" : undefined,
              dead: false,
              meditating: i % 5 === 0,
            });
          }
        }
        return pMap;
      })(),
      monsters: new Map(),
      loot: new Map(),
    },
  };
}

/**
 * `?skills=mock&n=0|1|2|4[&realm=N]` (M7.6, #507): máy chủ giả gửi `skills` mẫu (chiêu thật từ `SKILLS_M7`, ô đầu đang hồi chiêu 3 giây) và đáp `cast` bằng hồi chiêu
 * giả để thấy đủ trạng thái ô chiêu không cần máy chủ thật. Không đoán gì ngoài hồi chiêu: không trừ linh lực, không gây sát thương.
 */
function installMockSkills(room: any) {
  const n = mockSkillCount(location.search);
  const ids = SKILLS_M7.slice(0, 5).map((d) => d.id);
  const realm = mockRealm(location.search, n);
  let cur = mockSkillsMsg(ids, n, n > 0 ? 3000 : 0);
  /** mốc (performance.now) hết hồi chiêu của từng ô 2-5 */
  const until: Record<number, number> = { 2: performance.now() + cur.cd[0], 3: 0, 4: 0, 5: 0 };
  const origSend = room.send;
  room.send = (type: string, data: any) => {
    origSend(type, data);
    if (type === "skillSlot") {
      // gắn / gỡ ô bằng đúng `assignSlot` của shared; từ chối thì gửi lại sổ đúng + toast như máy chủ thật
      const next = mockAssign(cur, data?.slot, data?.skillId, realm);
      if (next) cur = next;
      else room.emit("toast", { text: "Không gắn được chiêu vào ô này.", tone: "bad" });
      room.emit("skills", cur);
      return;
    }
    if (type !== "cast" || typeof data?.slot !== "number") return;
    const left = Math.max(0, (until[data.slot] ?? 0) - performance.now());
    const next = mockCast(cur, data.slot, left);
    if (!next) return;
    const now = performance.now();
    until[data.slot] = now + next.cd[data.slot - 2];
    // hồi chiêu của MỌI ô tính lại từ mốc hết hạn (ô khác đang hồi không bị xoá)
    const cd = [2, 3, 4, 5].map((s) => Math.max(0, until[s] - now)) as SkillsMsg["cd"];
    cur = { ...next, cd };
    room.emit("skills", cur);
  };
  // gửi sau khi cảnh đã đăng ký xong các handler (`start` dựng cảnh bất đồng bộ)
  setTimeout(() => room.emit("skills", cur), 400);
  (window as any).__mockSkills = { emit: () => room.emit("skills", cur) };
}

function serverUrl() {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  // Dev: client chạy ở Vite, server ở cổng PORT (.env.local; 2567 dành riêng cho bản chạy thật). Production: cùng một địa chỉ.
  return import.meta.env.DEV
    ? `${proto}://${location.hostname}:${__SERVER_PORT__}`
    : `${proto}://${location.host}`;
}

/** Mã bí mật giữ tên nhân vật, lưu trong máy (bản thử, chưa có tài khoản thật). */
function secret() {
  let s = localStorage.getItem(SECRET_KEY);
  if (!s) {
    s = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    localStorage.setItem(SECRET_KEY, s);
  }
  return s;
}

const nameInput = document.getElementById("login-name") as HTMLInputElement | null;
if (nameInput) nameInput.value = localStorage.getItem(NAME_KEY) ?? "";

let activeClient: Client | null = null;
let activeScene: WorldScene | null = null;
let activeToken: string | null = null;
let activeRoom: Room | null = null;
let activeHeartbeat: HeartbeatController | null = null;
let isReconnecting = false;
let isTraveling = false;

/** Dọn sạch bộ nhớ cache của Service Worker (nếu có) và tải lại trang để nạp client mới nhất (M4 2.5). */
async function handleOutdatedReload() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        await reg.unregister();
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // Bỏ qua lỗi dọn cache ngoại tuyến
    }
  }
  window.location.reload();
}

/** Hiển thị modal phiên bản quá cũ phù hợp với môi trường (Web hoặc Android Native, M4.2b #301). */
function showOutdatedModal(minVersion: number) {
  const isNative = isNativeApp();
  const cfg = getOutdatedUiConfig(minVersion, isNative, handleOutdatedReload, getAppUpdateUrl());
  ui.showClientOutdated(minVersion, cfg.onAction, {
    message: cfg.message,
    buttonLabel: cfg.buttonLabel,
  });
}

// Khởi tạo điều khiển phím Back và vòng đời ứng dụng Android Native (M4.2b).
// PHẢI nạp plugin thật `@capacitor/app` ở đây: bridge native KHÔNG tự điền `window.Capacitor.Plugins.App`,
// chỉ `registerPlugin("App")` (chạy khi gói JS này được import) mới điền. Thiếu import thì `setupNativeApp`
// không có plugin để gắn, phím Back không bao giờ được bắt và `appStateChange` không tới (A đo bằng
// @capacitor/core thật, review #314). Nạp động để bản web không tải thêm gói này.
if (isNativeApp()) {
  void import("@capacitor/app")
    .then(({ App }) =>
      setupNativeApp({
        isOutdatedOpen: () => ui.isOutdatedModalOpen(),
        isLoginOpen: () => {
          const loginEl = document.getElementById("login");
          return Boolean(loginEl && !loginEl.hidden);
        },
        handleEscape: () => ui.handleEscape(),
        showToast: (t) => ui.toast(t),
        getHeartbeat: () => activeHeartbeat,
        sound,
        capacitorApp: App,
      }),
    )
    .catch((e) => console.error("Không nạp được @capacitor/app (Back / vòng đời native tắt):", e));
}

initAuthUi({
  onTokenAuth: async (token, charName) => {
    const client = new Client(serverUrl());
    activeClient = client;
    try {
      const { room, mapId } = await joinWithRedirect({
        client,
        storage: localStorage,
        token,
        name: charName,
      });
      if (charName) localStorage.setItem(NAME_KEY, charName);
      await start(room, mapId);
    } catch (e: any) {
      if (isClientOutdatedError(e)) {
        showOutdatedModal(e.minVersion);
        return;
      }
      if (e?.code === JOIN_BAD_TOKEN) {
        clearToken();
        switchAuthView("login");
      } else if (e?.code === JOIN_NEED_CHARACTER) {
        switchAuthView("character");
      }
      throw e;
    }
  },
  onLegacyAuth: async (name) => {
    const client = new Client(serverUrl());
    activeClient = client;
    try {
      const { room, mapId } = await joinWithRedirect({
        client,
        storage: localStorage,
        name,
        secret: secret(),
      });
      localStorage.setItem(NAME_KEY, name);
      await start(room, mapId);
    } catch (e: any) {
      if (isClientOutdatedError(e)) {
        showOutdatedModal(e.minVersion);
        return;
      }
      throw e;
    }
  },
});

// Giả lập hiển thị modal phiên bản quá cũ khi có cờ ?outdated=N (phục vụ kiểm thử và nghiệm thu giao diện, M4 2.5)
if (
  typeof window !== "undefined" &&
  (import.meta.env.DEV || new URLSearchParams(location.search).has("debug"))
) {
  const outdatedParam = new URLSearchParams(location.search).get("outdated");
  if (outdatedParam !== null) {
    const minV = Number(outdatedParam) || 2;
    showOutdatedModal(minV);
  }
  (window as any).__showClientOutdated = (minV = 2) => showOutdatedModal(minV);
}

// Chế độ máy chủ giả lập (?dungeon=mock, ?dungeon=fallen, ?duel=mock hoặc ?sect=mock) để thử nghiệm và chụp ảnh không cần server thật
if (
  typeof window !== "undefined" &&
  (isMockDungeonEnabled() ||
    isMockDungeonFallen() ||
    isMockDuelEnabled() ||
    isMockSectEnabled() ||
    isMockSkillsEnabled() ||
    new URLSearchParams(location.search).has("crowd"))
) {
  const isFallen = isMockDungeonFallen();
  // `?map=<id>` (chỉ ở DEV / ?debug): mock khởi đầu ở bản đồ khác để harness đo đi qua Hắc Phong / Âm Sương (#408 bước 4)
  const startMapId = isFallen ? LINH_HU_MAP_ID : mockStartMapId();
  // Bí cảnh "gục" giữ điểm đứng cũ (ảnh chụp sẵn có); các bản đồ ngoài đứng giữa trấn của bản đồ đó
  const mockRoom = createMockDungeonRoom(
    isFallen,
    mockSpawnOf(isFallen ? DEFAULT_MAP_ID : startMapId),
    !isFallen && mockSyncsState(),
    isMockSkillsEnabled() ? mockRealm(location.search, mockSkillCount(location.search)) : 1,
  );
  if (isMockSkillsEnabled()) installMockSkills(mockRoom);
  start(mockRoom, startMapId)
    .then(() => {
      if (isFallen) {
        setTimeout(() => {
          (window as any).__mockDungeon?.showFallen?.();
        }, 150);
      } else if (isMockSectEnabled()) {
        setTimeout(() => {
          (window as any).__mockSect?.showLeader?.();
        }, 150);
      }
    })
    .catch((err) => {
      console.error("Lỗi khởi động máy chủ giả lập:", err);
    });
}

if (
  typeof window !== "undefined" &&
  (import.meta.env.DEV || new URLSearchParams(location.search).has("debug"))
) {
  (window as any).__switchAuthView = switchAuthView;
}

const FAIL_TEXT = "Mất kết nối với Tiên Giới. Tải lại trang để vào lại.";

/** Không nối lại được: chặn điều khiển, giữ banner cố định kèm nút "Tải lại trang". */
function showDisconnected() {
  activeHeartbeat?.stop();
  activeHeartbeat = null;
  activeScene?.setReconnecting(true);
  ui.showReconnectFailed(FAIL_TEXT);
}

/** Bắt đầu vòng lặp thử nối lại khi rớt mạng hoặc khi nhịp tim phát hiện chết (M4.2b). */
async function startReconnect(codeOrReason?: number | string) {
  // Nếu đang trong quá trình chuyển phòng, bỏ qua xử lý rớt mạng
  if (isTraveling) return;

  // Dừng nhịp tim của phòng cũ ngay khi bắt đầu nối lại
  activeHeartbeat?.stop();
  activeHeartbeat = null;

  // 1000: đóng bình thường; 4000-4999: mã của ứng dụng (4000 chủ động thoát, 4429 bị ngắt vì spam)
  if (typeof codeOrReason === "number") {
    if (codeOrReason === 1000 || (codeOrReason >= 4000 && codeOrReason <= 4999)) {
      if (codeOrReason !== 1000) showDisconnected();
      return;
    }
  }

  // Nếu rớt mạng trong phòng bí cảnh: rời run ngay (không có allowReconnection), không cố nối lại
  if (activeScene && isDungeonMap(activeScene.map.def.id)) {
    showDisconnected();
    return;
  }

  // Các mã khác (1006 rớt mạng, 1001 đi khỏi, heartbeat...): tự động thử nối lại trong tối đa 20s
  if (!activeToken || !activeClient || isReconnecting) return;
  isReconnecting = true;
  activeScene?.setReconnecting(true);

  // Đóng socket cũ êm nếu socket vẫn còn mở (tránh onLeave kích hoạt vòng nối lại lần 2)
  try {
    if ((activeRoom as any)?.connection?.isOpen) {
      (activeRoom as any).connection.close();
    }
  } catch {
    // Bỏ qua lỗi đóng socket cũ
  }

  const token = activeToken;
  const client = activeClient;
  const GRACE_SECONDS = 20;
  const RETRY_INTERVAL_MS = 1500;
  const deadline = Date.now() + GRACE_SECONDS * 1000;

  let reconnectedRoom: Room | null = null;

  while (Date.now() < deadline) {
    const remainingSec = Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
    ui.showReconnectNotice(`Mất kết nối, đang nối lại... (còn ${remainingSec} giây)`);

    try {
      reconnectedRoom = await client.reconnect(token);
      if (reconnectedRoom) break;
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      // Dừng sớm nếu server trả lỗi dứt khoát: phòng không tồn tại hoặc token hết hạn
      if (msg.includes("not found") || msg.includes("expired") || err?.code === 4212) {
        break;
      }
    }

    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
  }

  if (reconnectedRoom) {
    activeToken = reconnectedRoom.reconnectionToken;
    activeScene?.attachRoom(reconnectedRoom);
    activeScene?.setReconnecting(false);
    isReconnecting = false;
    ui.toast({ text: "Đã nối lại.", tone: "good" });
    setupRoomLifecycle(reconnectedRoom);
  } else {
    // Thất bại hẳn (hết 20 giây / token hết hạn): KHÔNG ẩn banner, vẫn chặn điều khiển
    isReconnecting = false;
    showDisconnected();
  }
}

function setupRoomLifecycle(room: Room) {
  activeRoom = room;
  activeToken = room.reconnectionToken;

  // Dọn dẹp bộ điều khiển nhịp tim của phòng trước (nếu có)
  activeHeartbeat?.stop();
  activeHeartbeat = null;

  // Khởi động nhịp tim (M4.2b: cả trong bí cảnh, chết sẽ gọi startReconnect -> showDisconnected)
  activeHeartbeat = new HeartbeatController({
    room,
    sound,
    onDead: () => {
      startReconnect("heartbeat");
    },
  });
  activeHeartbeat.start();
  if (
    typeof window !== "undefined" &&
    (import.meta.env.DEV || new URLSearchParams(location.search).has("debug"))
  ) {
    (window as any).__heartbeat = activeHeartbeat;
  }

  // Lắng nghe sự kiện đi qua cổng chuyển phòng (M3 bước 1)
  room.onMessage("travelTo", async (msg: TravelToMsg) => {
    if (!msg?.mapId || !activeClient || isTraveling) return;
    const targetMap = getMap(msg.mapId);
    if (!targetMap) return;

    isTraveling = true;
    activeHeartbeat?.stop();
    activeHeartbeat = null;
    activeScene?.setReconnecting(true);
    ui.showTransition(targetMap.def.name);

    try {
      // Chờ màn chuyển cảnh khép (mống mắt 400 ms, giảm chuyển động: mờ 300 ms); bấm / gõ phím thì bỏ qua (gfx/scene-transition.ts)
      await ui.transitionHold();

      // Chủ động rời phòng cũ (không kích hoạt luồng reconnect)
      room.leave(true);

      // Chờ gói bản đồ đích TRƯỚC khi vào phòng mới (B review #541, S1): lúc này nhân vật không ở phòng nào. Nếu chờ SAU khi vào, máy chủ đã dựng
      // nhân vật ở điểm xuất hiện (nhiều cổng nằm ngoài trấn, vùng nguy hiểm, không có bảo hộ lúc vào) và quái đánh trong tối đa 8 s trong khi
      // client ở màn chuyển cảnh không điều khiển được: chết do quái là mất kiếp. Gói đã bắt đầu tải từ lúc gửi `travel` (WorldScene.travelPortal),
      // giờ chờ tính từ đó; `takeMapWait` luôn resolve (quá 8 s / bí cảnh 3 s là `failed`: vẫn qua cổng, việc tải không bị huỷ) và KHÔNG nằm
      // trong `TRAVEL_JOIN_TIMEOUT_MS`.
      await packs().takeMapWait(msg.mapId);

      const token = getToken();
      const name = nameInput?.value.trim() || (localStorage.getItem(NAME_KEY) ?? "");
      const joinPromise = joinWithRedirect({
        client: activeClient,
        storage: localStorage,
        token: token || undefined,
        name: name || undefined,
        secret: token ? undefined : secret(),
        suggestedMapId: msg.mapId,
        roomId: msg.roomId,
      });

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Quá thời gian chuyển bản đồ.")),
          TRAVEL_JOIN_TIMEOUT_MS,
        );
      });

      const {
        room: newRoom,
        mapId: finalMapId,
        expiredDungeonFallback,
      } = await Promise.race([joinPromise, timeoutPromise]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });
      // NGAY sau khi vào phòng: server gửi inv / quests / skills / wallet / soul... lúc vào, colyseus.js bỏ tin không có handler (early-messages.ts)
      captureEarlyMessages(newRoom);
      const finalMap = getMap(finalMapId)!;

      // Cập nhật scene sang phòng mới và bản đồ mới
      activeScene?.changeMap(newRoom, finalMap);
      activeScene?.setReconnecting(false);
      isTraveling = false;

      // Thiết lập vòng đời mới cho phòng vừa vào
      setupRoomLifecycle(newRoom);

      // Sáng dần và thông báo kết quả
      ui.hideTransition();
      if (expiredDungeonFallback) {
        ui.toast({ text: "Bí cảnh đã hết hạn, đã đưa về Lạc Hà Trấn.", tone: "bad" });
      } else {
        ui.toast({ text: `Đã tiến nhập ${finalMap.def.name}.`, tone: "good" });
      }
    } catch (err: any) {
      isTraveling = false;
      ui.hideTransition();
      activeScene?.setReconnecting(false);
      if (isClientOutdatedError(err)) {
        showOutdatedModal(err.minVersion);
        return;
      }
      ui.toast({
        text: `Không thể chuyển bản đồ: ${err?.message || "lỗi kết nối"}. Vui lòng đăng nhập lại để vào bản đồ mới.`,
        tone: "bad",
      });
      showDisconnected();
    }
  });

  room.onLeave(async (code) => {
    // Sự kiện đóng MUỘN của phòng CŨ (vd socket nửa mở bị `close()` lúc nhịp tim phát hiện chết, nhưng chỉ thật sự đóng rất lâu sau,
    // khi mạng về hoặc hệ điều hành bỏ cuộc) KHÔNG được chạy lại vòng nối lại: nó dừng nhịp tim của phòng MỚI, chặn điều khiển và
    // thử nối lại bằng token mới (A bắt được khi review #310: E2E `onLeave.invoke(1006)` của phòng cũ làm banner "đang nối lại" hiện lại)
    if (room !== activeRoom) return;
    await startReconnect(code);
  });
}

async function start(room: Room, mapId: string) {
  captureEarlyMessages(room); // trước mọi await: tin lúc vào phòng tới trước khi cảnh đăng ký handler
  // Chờ font tiếng Việt tải xong trước khi Phaser vẽ Text lên canvas lần đầu
  await Promise.race([
    document.fonts.load('16px "Noto Serif"', "Tiếng Việt"),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  ui.show();
  ui.setCurrentMapId(mapId);
  const currentMap = getMap(mapId) || getMap(DEFAULT_MAP_ID)!;
  activeScene = new WorldScene(room, currentMap);
  if (
    typeof window !== "undefined" &&
    (import.meta.env.DEV || new URLSearchParams(location.search).has("debug"))
  ) {
    (window as any).__ui = ui;
    // Cho `check-quest-log.mjs` (#409): id mọi nhiệm vụ chính tuyến / lặp THẬT của game để nạp vào sổ nhiệm vụ
    // Cho `check-forge-shop.mjs` (#409): công thức rèn + cửa hàng THẬT của game (nguyên liệu, phí) để nạp túi / ví đúng ca "đủ" / "thiếu"
    (window as any).__catalog = () => ({
      recipes: RECIPES.map((r) => ({
        id: r.id,
        npcId: r.npcId,
        inputs: r.inputs,
        coin: r.coin ?? 0,
      })),
      shops: SHOPS.map((sh) => ({ npcId: sh.npcId, itemIds: sh.itemIds })),
      // Toạ độ NPC: bảng Rèn / Cửa hàng TỰ ĐÓNG khi không có NPC nào trong tầm nói chuyện (WorldScene), nên script phải đứng cạnh NPC
      npcs: NPCS.map((n) => ({ id: n.id, x: n.x, y: n.y, mapId: n.mapId ?? DEFAULT_MAP_ID })),
    });
    (window as any).__questIds = () => ({
      main: QUESTS.filter((q) => !q.daily).map((q) => q.id),
      daily: QUESTS.filter((q) => q.daily).map((q) => q.id),
    });
    (window as any).__scene = activeScene;
    (window as any).__debugLimbo = (mockData?: LimboMsg) => {
      const mock: LimboMsg = mockData || {
        summary: {
          kiep: 1,
          realm: 1,
          tier: 4,
          minutes: 42,
          kills: 68,
          bossKills: 1,
          gain: 16,
        },
        soul: {
          kiep: 1,
          duyen: 28,
          unlocks: { du_am: 1, khac: 1 },
          origins: [],
          engraved: ["ung_trao"],
        },
        keepable: ["lang_nha_kiem", "tho_nhung_bao", "long_tho"],
        // M7.2c: chiêu đã học ở kiếp vừa rồi (+ chiêu đang khắc) để thử bộ chọn "Khắc chân linh"
        engravable: ["ung_trao", "hoa_van_kiem", "me_tung_bo"],
      };
      ui.showLimbo(mock, {
        onBuy: (id) => {
          if (mock.soul.duyen >= 10) {
            mock.soul.duyen -= 10;
            if (id.startsWith("xuat_than:")) mock.soul.origins.push(id.slice(10));
            else mock.soul.unlocks[id] = (mock.soul.unlocks[id] || 0) + 1;
            ui.updateSoul(mock.soul);
          }
        },
        onRebirth: (choice) => {
          // script kiểm đọc đúng tin sẽ gửi (`engrave` vắng = giữ nguyên chiêu đã khắc)
          (window.__rebirthChoices ??= []).push(choice);
          ui.showReborn(mock.summary.kiep + 1);
        },
      });
    };
    (window as any).__mockDungeon = {
      openThuMonOk: () => ui.onDialog(buildMockThuMonDialog({ canOpen: true })),
      openThuMonFail: () =>
        ui.onDialog(
          buildMockThuMonDialog({
            canOpen: false,
            failReason: "member_low",
            failWho: "Lâm Kinh Vũ",
          }),
        ),
      showInvite: () => ui.onDungeonInvite(MOCK_DUNGEON_SAMPLES.invite()),
      enterBossFight: () => {
        const dMap = getMap(LINH_HU_MAP_ID)!;
        if (activeScene) {
          activeScene.changeMap(room, dMap);
          (activeScene as any).predX = dMap.lairPx ? dMap.lairPx.x : dMap.townPx.x;
          (activeScene as any).predY = dMap.lairPx ? dMap.lairPx.y + 70 : dMap.townPx.y;
          if (room?.state?.monsters) {
            room.state.monsters.set("boss_yeu_vuong", {
              kind: "yeu_vuong",
              x: dMap.lairPx ? dMap.lairPx.x : 512,
              y: dMap.lairPx ? dMap.lairPx.y : 150,
              hp: 68000,
              maxHp: 100000,
              angle: Math.PI / 2,
            });
          }
        }
        ui.onDungeonState(MOCK_DUNGEON_SAMPLES.stateBossFight());
      },
      showWon: () => {
        ui.onDungeonState(MOCK_DUNGEON_SAMPLES.stateLoot());
        ui.onDungeonEnd(MOCK_DUNGEON_SAMPLES.endWon());
      },
      showLost: () => {
        ui.onDungeonEnd(MOCK_DUNGEON_SAMPLES.endLost());
      },
      showFallen: (rewardsLeft = 2, exitInMs = 3000) => {
        const msg = MOCK_DUNGEON_SAMPLES.fallen(rewardsLeft, exitInMs);
        if (activeScene) {
          (activeScene as any).dungeonFallUntil = (activeScene as any).time?.now
            ? (activeScene as any).time.now + exitInMs
            : performance.now() + exitInMs;
        }
        ui.onDungeonFallen(msg);
        ui.onDungeonState(MOCK_DUNGEON_SAMPLES.stateBossFight());
        const remSec = Math.max(1, Math.ceil(exitInMs / 1000));
        ui.death(remSec, dungeonFallenDeathText(remSec, rewardsLeft), dungeonFallenSubText());
      },
    };
    (window as any).__mockDuel = {
      showInvite: (from = "Diệp Phàm") => ui.onDuelInvited(MOCK_DUEL_SAMPLES.invited(from)),
      showCountdown: (opponent = "Diệp Phàm") =>
        ui.onDuelState(MOCK_DUEL_SAMPLES.stateCountdown(opponent)),
      showFighting: (opponent = "Diệp Phàm") =>
        ui.onDuelState(MOCK_DUEL_SAMPLES.stateFighting(opponent)),
      updateOpponentHp: (hp: number, maxHp: number) => ui.updateDuelOpponentHp(hp, maxHp),
      showWon: (opponent = "Diệp Phàm") => ui.onDuelEnd(MOCK_DUEL_SAMPLES.endWon(opponent)),
      showLost: (opponent = "Diệp Phàm") => ui.onDuelEnd(MOCK_DUEL_SAMPLES.endLost(opponent)),
      showDraw: () => ui.onDuelEnd(MOCK_DUEL_SAMPLES.endDraw()),
      hide: () => {
        ui.hideDuelHud();
        ui.closeDuelEndModal();
      },
    };
    (window as any).__mockSect = {
      showNone: () => {
        ui.onSect({ sect: null });
        ui.toggleSectModal(true);
      },
      showLeader: () => {
        ui.onSect({ sect: MOCK_SECT_SAMPLES.leaderView() });
        ui.onSectPresence(MOCK_SECT_SAMPLES.presence());
        ui.toggleSectModal(true);
      },
      showElder: () => {
        ui.onSect({ sect: MOCK_SECT_SAMPLES.elderView() });
        ui.onSectPresence(MOCK_SECT_SAMPLES.presence());
        ui.toggleSectModal(true);
      },
      showMember: () => {
        ui.onSect({ sect: MOCK_SECT_SAMPLES.memberView() });
        ui.onSectPresence(MOCK_SECT_SAMPLES.presence());
        ui.toggleSectModal(true);
      },
      showInvite: () => {
        ui.onSectInvited(MOCK_SECT_SAMPLES.invited());
      },
      switchTab: (tab: "overview" | "members" | "treasury") => {
        ui.switchSectTab(tab);
      },
      openModal: () => ui.toggleSectModal(true),
      closeModal: () => ui.toggleSectModal(false),
    };

    if (isMockSectEnabled()) {
      (window as any).__mockSect.showLeader();
    }
  }
  // Scale Manager + DPR (#324): canvas = khung nhìn logic (CSS px) x renderScale, hiển thị bằng zoom = 1 / renderScale
  // (spike Chrome thật: `RESIZE` giữ canvas = CSS px nên mờ ở DPR 2-3, `RESIZE + zoom` bị bỏ qua; `NONE` + zoom đúng và
  // toạ độ chạm sai số 0). `attachScale` giữ khớp khi đổi kích thước / chất lượng và đổi giới hạn FPS lúc chạy.
  // Phông chữ bay (gfx/fx) được vẽ từ canvas bằng Noto Serif: đợi phông nạp xong (tối đa 1,5 s; ngoại tuyến thì dùng phông
  // dự phòng) để glyph đúng hình ngay từ đầu
  await Promise.race([
    document.fonts?.load?.('bold 38px "Noto Serif"', "Bạo!0123456789") ?? Promise.resolve(),
    new Promise((r) => setTimeout(r, 1500)),
  ]).catch(() => {});
  const d0 = getDisplay();
  const q0 = getQuality();
  const rs0 = computeRenderScale(d0.cssW, d0.cssH, d0.dpr, q0);
  setRenderScale(rs0); // trước khi cảnh tạo camera (camera zoom = fitZoom * renderScale)
  const size0 = canvasSizeFor(d0.cssW, d0.cssH, rs0);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#2b2620",
    render: { batchSize: 8192 },
    scale: { mode: Phaser.Scale.NONE, width: size0.width, height: size0.height, zoom: 1 / rs0 },
    input: { activePointers: 3 },
    // Tiết kiệm pin = ~30 FPS: ngưỡng 31 (ngưỡng 30 ra ~21 FPS ở 60 Hz: đo thật), đổi được lúc chạy bởi attachScale
    fps: { limit: fpsLimitFor(q0.targetFps) },
    scene: [activeScene],
  });
  attachScale(game as unknown as GameLike, {
    getDisplay,
    onDisplayChange: (cb) => onDisplayChange(() => cb()),
    getQuality,
    onQualityChange: (cb) => onQualityChange(() => cb()),
    setRenderScale,
  });
  // Cấp thời gian khung (thô, không làm mượt) cho bộ điều tốc chất lượng và lớp phủ ?perf=1
  game.events.on(Phaser.Core.Events.POST_STEP, () => qualityFrame(game.loop.rawDelta));
  if (new URLSearchParams(location.search).has("perf")) mountPerfOverlay();
  setupRoomLifecycle(room);
}

// Quản lý PWA và cập nhật an toàn: chỉ kích hoạt Service Worker ở production (hoặc khi test có ?pwa=1)
function getPwaGameState(): PwaGameState {
  const me = activeScene?.me();
  return {
    inDuel: ui.isDuelActive(),
    inDungeon: ui.isDungeonActive() || (activeScene ? isDungeonMap(activeScene.map.def.id) : false),
    isDungeonMap: activeScene ? isDungeonMap(activeScene.map.def.id) : false,
    inLimbo: ui.isLimboOpen(),
    isDead: Boolean(me?.dead),
    isTravelling: isTraveling,
    inCombat: activeScene ? activeScene.isInCombat() : false,
  };
}

let pendingPwaUpdate: (() => void) | null = null;

// Quản lý PWA và cập nhật an toàn: chỉ kích hoạt Service Worker ở web production (không bật khi build native)
if (!isNativeApp() && (import.meta.env.PROD || new URLSearchParams(location.search).has("pwa"))) {
  const pwa = setupPwa({
    getGameState: getPwaGameState,
    onUpdateReady: (applyUpdate, isSafe) => {
      pendingPwaUpdate = applyUpdate;
      if (isSafe) {
        ui.toast({ text: "Có bản cập nhật mới. Đang làm mới...", tone: "info" });
        setTimeout(() => {
          if (canReloadSafely(getPwaGameState())) {
            applyUpdate();
          }
        }, 1500);
      } else {
        ui.toast({ text: "Có bản cập nhật mới (sẽ áp dụng khi an toàn).", tone: "info" });
      }
    },
    onOfflineChange: (online) => {
      if (!online) {
        ui.toast({ text: "Đã ngắt kết nối mạng (chế độ ngoại tuyến).", tone: "bad" });
      } else {
        ui.toast({ text: "Đã có kết nối mạng trở lại.", tone: "good" });
      }
    },
  });

  if (typeof window !== "undefined") {
    (window as any).__pwa = {
      ...pwa,
      getGameState: getPwaGameState,
      getPendingUpdate: () => pendingPwaUpdate,
    };
  }
}
