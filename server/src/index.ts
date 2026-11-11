import http from "node:http";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { defineRooms, WorldRoom } from "./rooms/WorldRoom";
import { SectService } from "./sect-service";
import { portPolicy, startupWarnings } from "./startup";
import { startAudit } from "./audit";
import { minProtocolOf } from "./protocol";
import { mountAuth } from "./auth-http";
import { mountCors } from "./cors";
import { createStores } from "./stores";
import { Monitor, mountMetrics, thresholdsOf } from "./metrics";

// Đọc .env.local ở gốc repo (cổng riêng cho từng dev). Không có file thì dùng mặc định.
const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

for (const w of startupWarnings(process.env)) console.warn(`[CẢNH BÁO] ${w}`);
// Nhật ký kiểm toán (M4 2.4): một dòng JSON mỗi sự kiện nhạy cảm ra stdout; AUDIT_LOG=off tắt
if (startAudit(process.env)) console.log("Nhật ký kiểm toán: bật (AUDIT_LOG=off để tắt)");

// Cổng 2567 chỉ của bản chạy thật: dev / test / bot dùng cổng riêng (portPolicy từ chối, thoát mã 1)
const portCheck = portPolicy(process.env);
if (!portCheck.ok) {
  console.error(`[LỖI] ${portCheck.error}`);
  process.exit(1);
}
const PORT = portCheck.port;

async function main() {
  // Backend lưu trữ chung cho nhân vật, chân linh, tài khoản, phiên (STORE=file mặc định | pg + DATABASE_URL)
  const stores = await createStores(process.env);
  WorldRoom.minProtocol = minProtocolOf(process.env).value; // client cũ hơn mức này bị từ chối khi vào phòng (M4 2.5)
  WorldRoom.players = stores.players;
  WorldRoom.souls = stores.souls;
  WorldRoom.sects = new SectService(stores.sects); // tông môn cùng backend với nhân vật / chân linh (`SECTS=off` gỡ tính năng)
  console.log(`Lưu trữ: ${stores.kind === "pg" ? "PostgreSQL" : "tệp JSON"}`);

  const app = express();
  // CORS theo danh sách cho phép (CORS_ORIGINS, mặc định TẮT) cho /health và /api/*: gắn TRƯỚC mountAuth (app đóng gói khác nguồn)
  const cors = mountCors(app, process.env);
  if (cors.enabled)
    console.log(`CORS: cho phép ${cors.origins.length} nguồn (${cors.origins.join(", ")})`);
  // /health (kèm authMode) và, khi AUTH_MODE=account, API tài khoản /api/auth/*: gắn TRƯỚC trang tĩnh bên dưới
  const { auth } = mountAuth(app, {
    env: process.env,
    accounts: stores.accounts,
    sessions: stores.sessions,
    players: stores.players,
    souls: stores.souls,
  });
  WorldRoom.auth = auth; // vào phòng bằng token phiên (null: chế độ cũ, tên + mã bí mật)
  // Giám sát (M4 3.3): canh ngưỡng tick / hàng đợi ghi trong log; `/metrics` chỉ bật khi đặt METRICS_TOKEN (trước trang tĩnh)
  const monitor = new Monitor(WorldRoom.hub, {
    store: stores.kind,
    thresholds: thresholdsOf(process.env).value,
  });
  const { enabled: metricsOn } = mountMetrics(app, { env: process.env, monitor });
  monitor.start();
  console.log(
    `Giám sát: /metrics ${metricsOn ? "bật (METRICS_TOKEN)" : "tắt (đặt METRICS_TOKEN để bật)"}`,
  );
  // Dọn phiên hết hạn mỗi giờ (unref: không giữ tiến trình sống)
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
  // Tắt máy an toàn: Colyseus đóng phòng (lưu nhân vật) rồi mới đóng kết nối DB
  gameServer.onShutdown(() => {
    monitor.stop();
    return stores.close();
  });
  await gameServer.listen(PORT);
  console.log(`Tiên Giới server: http://localhost:${PORT}`);
}

main().catch((e) => {
  // Chỉ in thông báo do ta viết (lỗi cấu hình): không in URL kết nối vì có mật khẩu
  console.error(`[LỖI] Không khởi động được server: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
