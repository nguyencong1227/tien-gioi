import Phaser from "phaser";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  LINH_HU_MAP_ID,
  TRAVEL_JOIN_TIMEOUT_MS,
  JOIN_BAD_TOKEN,
  JOIN_NEED_CHARACTER,
  getMap,
  isDungeonMap,
  type TravelToMsg,
  type LimboMsg,
} from "@tien-gioi/shared";
import { WorldScene } from "./scenes/WorldScene";
import { ui } from "./ui";
import { buildMockThuMonDialog, isMockDungeonEnabled, MOCK_DUNGEON_SAMPLES } from "./dungeon";
import { isMockDuelEnabled, MOCK_DUEL_SAMPLES } from "./duel";
import { captureEarlyMessages } from "./early-messages";
import { joinWithRedirect } from "./connection";
import { clearToken, getToken } from "./auth";
import { initAuthUi, switchAuthView } from "./auth-ui";

const NAME_KEY = "tien-gioi:name";
const SECRET_KEY = "tien-gioi:secret";

function createMockDungeonRoom(): any {
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
    onStateChange: () => {},
    onLeave: () => {},
    send: (type: string, data: any) => {
      if (import.meta.env.DEV) console.log("[mock-dungeon-send]", type, data);
    },
    leave: () => {},
    state: {
      players: new Map([
        [
          "mock-session-01",
          {
            name: "Trương Tiểu Phàm",
            realm: 1,
            tier: 8,
            hp: 2500,
            maxHp: 2500,
            mp: 1200,
            maxMp: 1200,
            exp: 8000,
            x: 512,
            y: 896,
            lastSeq: 0,
            dead: false,
            meditating: false,
          },
        ],
      ]),
      monsters: new Map(),
      loot: new Map(),
    },
  };
}

function serverUrl() {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  // Dev: client chạy ở Vite, server ở cổng PORT (.env.local, mặc định 2567). Production: cùng một địa chỉ.
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
let isReconnecting = false;
let isTraveling = false;

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
    const { room, mapId } = await joinWithRedirect({
      client,
      storage: localStorage,
      name,
      secret: secret(),
    });
    localStorage.setItem(NAME_KEY, name);
    await start(room, mapId);
  },
});

// Chế độ máy chủ giả lập (?dungeon=mock hoặc ?duel=mock) để thử nghiệm và chụp ảnh không cần server thật
if (typeof window !== "undefined" && (isMockDungeonEnabled() || isMockDuelEnabled())) {
  const mockRoom = createMockDungeonRoom();
  start(mockRoom, DEFAULT_MAP_ID).catch((err) => {
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
  activeScene?.setReconnecting(true);
  ui.showReconnectFailed(FAIL_TEXT);
}

function setupRoomLifecycle(room: Room) {
  activeToken = room.reconnectionToken;

  // Lắng nghe sự kiện đi qua cổng chuyển phòng (M3 bước 1)
  room.onMessage("travelTo", async (msg: TravelToMsg) => {
    if (!msg?.mapId || !activeClient || isTraveling) return;
    const targetMap = getMap(msg.mapId);
    if (!targetMap) return;

    isTraveling = true;
    activeScene?.setReconnecting(true);
    ui.showTransition(targetMap.def.name);

    try {
      // Chờ màn hình chuyển cảnh mờ dần (350ms)
      await new Promise((r) => setTimeout(r, 350));

      // Chủ động rời phòng cũ (không kích hoạt luồng reconnect)
      room.leave(true);

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
      ui.toast({
        text: `Không thể chuyển bản đồ: ${err?.message || "lỗi kết nối"}. Vui lòng đăng nhập lại để vào bản đồ mới.`,
        tone: "bad",
      });
      showDisconnected();
    }
  });

  room.onLeave(async (code) => {
    // Nếu đang trong quá trình chuyển phòng, bỏ qua xử lý rớt mạng
    if (isTraveling) return;

    // 1000: đóng bình thường; 4000-4999: mã của ứng dụng (4000 chủ động thoát, 4429 bị ngắt vì spam)
    if (code === 1000 || (code >= 4000 && code <= 4999)) {
      if (code !== 1000) showDisconnected();
      return;
    }

    // Nếu rớt mạng trong phòng bí cảnh: rời run ngay (không có allowReconnection), không cố nối lại
    if (activeScene && isDungeonMap(activeScene.map.def.id)) {
      showDisconnected();
      return;
    }

    // Các mã khác (1006 rớt mạng, 1001 đi khỏi...): tự động thử nối lại trong tối đa 20s
    if (!activeToken || !activeClient || isReconnecting) return;
    isReconnecting = true;
    activeScene?.setReconnecting(true);

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
          unlocks: { du_am: 1 },
          origins: [],
        },
        keepable: ["lang_nha_kiem", "tho_nhung_bao", "long_tho"],
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
        onRebirth: () => {
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
      hide: () => ui.hideDuelHud(),
    };
  }
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#2b2620",
    render: { batchSize: 8192 },
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    input: { activePointers: 3 },
    scene: [activeScene],
  });
  setupRoomLifecycle(room);
}

// Chỉ đăng ký Service Worker ở bản build production; không bật khi chạy npm run dev để tránh làm lệch cache Vite HMR.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
