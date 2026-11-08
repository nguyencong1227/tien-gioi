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
  return import.meta.env.DEV ? `${proto}://${location.hostname}:${__SERVER_PORT__}` : `${proto}://${location.host}`;
}

/** Mã bí mật giữ tên nhân vật, lưu trong máy (bản thử, chưa có tài khoản thật). */
function secret() {
  let s = localStorage.getItem(SECRET_KEY);
  if (!s) {
    s = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(SECRET_KEY, s);
  }
  return s;
}

const form = document.getElementById("login-form") as HTMLFormElement;
const nameInput = document.getElementById("login-name") as HTMLInputElement;
const btn = document.getElementById("login-btn") as HTMLButtonElement;
const err = document.getElementById("login-err")!;
nameInput.value = localStorage.getItem(NAME_KEY) ?? "";

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  btn.disabled = true;
  err.textContent = "";
  const name = nameInput.value.trim();
  try {
    const client = new Client(serverUrl());
    const room = await client.joinOrCreate(ROOM_NAME, { name, secret: secret() } satisfies JoinOptions);
    localStorage.setItem(NAME_KEY, name);
    start(room);
  } catch (e: any) {
    err.textContent = e?.message && !/^\d+$/.test(e.message) ? e.message : "Không kết nối được máy chủ.";
    btn.disabled = false;
  }
});

function start(room: Room) {
  ui.show();
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#2b2620",
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    input: { activePointers: 3 },
    scene: [new WorldScene(room)],
  });
  room.onLeave((code) => {
    if (code !== 1000) ui.toast({ text: "Mất kết nối với Tiên Giới. Tải lại trang để vào lại.", tone: "bad" });
  });
}
