import http from "node:http";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { defineRooms, WorldRoom } from "./rooms/WorldRoom";
import { startupWarnings } from "./startup";
import { mountAuth } from "./auth-http";

// Đọc .env.local ở gốc repo (cổng riêng cho từng dev). Không có file thì dùng mặc định.
const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

for (const w of startupWarnings(process.env)) console.warn(`[CẢNH BÁO] ${w}`);

const PORT = Number(process.env.PORT ?? 2567);
const app = express();
// /health (kèm authMode) và, khi AUTH_MODE=account, API tài khoản /api/auth/*: gắn TRƯỚC trang tĩnh bên dưới
const { auth } = mountAuth(app, { env: process.env });
// Dọn phiên hết hạn mỗi giờ (unref: không giữ tiến trình sống)
WorldRoom.auth = auth; // vào phòng bằng token phiên (null: chế độ cũ, tên + mã bí mật)
if (auth) setInterval(() => void auth.sweep().catch(() => {}), 3_600_000).unref();

// Production: phục vụ luôn bản build của client (client/dist) từ cùng server
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const server = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server }) });
defineRooms(gameServer);
gameServer.listen(PORT).then(() => console.log(`Tiên Giới server: http://localhost:${PORT}`));
