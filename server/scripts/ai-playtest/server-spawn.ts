// Dựng server Colyseus THẬT (in-process) cho bộ chơi thử AI (#1194, QUYET_DINH_M3 mục 60.1).
//
// Đóng gói lại pattern của `e2e-ban-phim.ts` (express + Colyseus Server + WebSocketTransport +
// defineRooms + listenWithRetry + DATA_DIR temp) thành một hàm trả về đối tượng đóng gói
// (port + url + close()), để harness chơi NHIỀU viewport dùng CHUNG một server — mỗi viewport là
// một tab Chrome đăng nhập một đạo hiệu khác nhau. Server chạy từ mã `main` hiện tại (import động
// `defineRooms`), nên manifest.commit ghi đúng SHA mà server thử được dựng từ.
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { listenWithRetry } from "../e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
// File ở server/scripts/ai-playtest/ (sâu hơn e2e-ban-phim.ts một tầng) → ba `..` để về gốc repo.
const repoRoot = path.resolve(here, "../../..");
/** Bản client phục vụ cho server thử: PHẢI build trước (`npm run build -w client`). */
export const clientDist = path.resolve(repoRoot, "client/dist");

export interface PlaytestServer {
  /** Cổng server thử (không phải 2567). */
  port: number;
  /** URL gốc phục vụ client + WebSocket (dùng cho tab Chrome). */
  url: string;
  /** Thư mục DATA_DIR tạm (chứa players/sects/...); xoá khi close(). */
  dataDir: string;
  /** Ngắt server + xoá thư mục tạm. An toàn gọi nhiều lần. */
  close(): Promise<void>;
}

export interface SpawnOptions {
  /** Chọn cổng thử (tránh cổng dev / 2567). */
  pickPort: () => number;
  /** Bật cờ chặn đường (AMBUSH=on) cho scenario gặp chặn đường (mục 52). */
  ambush?: boolean;
}

/** SHA ngắn của HEAD hiện tại (dùng cho `manifest.commit`). */
export function currentHeadSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: repoRoot, encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Dựng server Colyseus thật phục vụ bản client đã build, lắng nghe trên cổng do `pickPort` chọn
 * (thử lại với cổng mới nếu bận, như `listenWithRetry`). Ném `Error` rõ nếu client/dist chưa build
 * hoặc không bind được cổng. DATA_DIR là thư mục tạm riêng — KHÔNG đụng dữ liệu dev / production.
 */
export async function spawnPlaytestServer(opts: SpawnOptions): Promise<PlaytestServer> {
  if (!existsSync(path.join(clientDist, "index.html"))) {
    throw new Error(
      `client/dist chưa có: chạy \`npm run build -w client\` trước khi chơi thử AI (server phục vụ bản build này).`,
    );
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-playtest-data-"));
  // store.ts / account-store.ts / soul.ts đọc DATA_DIR LÚC NẠP module → đặt TRƯỚC khi import defineRooms.
  process.env.DATA_DIR = dataDir;
  if (opts.ambush) process.env.AMBUSH = "on";

  // Import ĐỘNG sau khi DATA_DIR (và AMBUSH) đã đặt: defineRooms dựng World đọc các env này một lần.
  const { defineRooms } = await import("../../src/rooms/WorldRoom.js");

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(express.static(clientDist));
  // Mọi đường khác trả index.html (client-side routing; `?debug` để lộ `window.__scene`).
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  defineRooms(gameServer);

  let port: number;
  try {
    port = await listenWithRetry(httpServer, opts.pickPort(), {
      explicit: false,
      pick: opts.pickPort,
    });
  } catch (err) {
    await cleanup();
    throw err;
  }

  async function cleanup() {
    try {
      await gameServer.gracefullyShutdown(false).catch(() => {});
    } catch {
      /* đang tắt */
    }
    try {
      await new Promise<void>((r) => httpServer.close(() => r()));
    } catch {
      /* đang tắt */
    }
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* bỏ qua */
    }
  }

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    dataDir,
    close: cleanup,
  };
}
