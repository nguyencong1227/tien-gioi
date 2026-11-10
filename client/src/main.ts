import Phaser from "phaser";
import { Client, type Room } from "colyseus.js";
import { ROOM_NAME, type JoinOptions } from "@tien-gioi/shared";
import { WorldScene } from "./scenes/WorldScene";
import { ui } from "./ui";

const NAME_KEY = "tien-gioi:name";
const SECRET_KEY = "tien-gioi:secret";

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

const form = document.getElementById("login-form") as HTMLFormElement;
const nameInput = document.getElementById("login-name") as HTMLInputElement;
const btn = document.getElementById("login-btn") as HTMLButtonElement;
const err = document.getElementById("login-err")!;
nameInput.value = localStorage.getItem(NAME_KEY) ?? "";

let activeClient: Client | null = null;
let activeScene: WorldScene | null = null;
let activeToken: string | null = null;
let isReconnecting = false;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  btn.disabled = true;
  err.textContent = "";
  const name = nameInput.value.trim();
  try {
    const client = new Client(serverUrl());
    activeClient = client;
    const room = await client.joinOrCreate(ROOM_NAME, {
      name,
      secret: secret(),
    } satisfies JoinOptions);
    localStorage.setItem(NAME_KEY, name);
    await start(room);
  } catch (e: any) {
    err.textContent =
      e?.message && !/^\d+$/.test(e.message) ? e.message : "Không kết nối được máy chủ.";
    btn.disabled = false;
  }
});

const FAIL_TEXT = "Mất kết nối với Tiên Giới. Tải lại trang để vào lại.";

/** Không nối lại được: chặn điều khiển, giữ banner cố định kèm nút "Tải lại trang". */
function showDisconnected() {
  activeScene?.setReconnecting(true);
  ui.showReconnectFailed(FAIL_TEXT);
}

function setupRoomLifecycle(room: Room) {
  activeToken = room.reconnectionToken;

  room.onLeave(async (code) => {
    // 1000: đóng bình thường; 4000-4999: mã của ứng dụng (4000 chủ động thoát, 4429 bị ngắt vì spam)
    if (code === 1000 || (code >= 4000 && code <= 4999)) {
      if (code !== 1000) showDisconnected();
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

async function start(room: Room) {
  // Chờ font tiếng Việt tải xong trước khi Phaser vẽ Text lên canvas lần đầu
  await Promise.race([
    document.fonts.load('16px "Noto Serif"', "Tiếng Việt"),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  ui.show();
  if (
    typeof window !== "undefined" &&
    (import.meta.env.DEV || new URLSearchParams(location.search).has("debug"))
  ) {
    (window as any).__ui = ui;
  }
  activeScene = new WorldScene(room);
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
