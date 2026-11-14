import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";

// Cổng đọc từ .env.local ở gốc repo, để 2 dev chạy song song trên cùng một máy
// mà không đụng cổng nhau (xem docs/LAM_CHUNG_MAY.md).
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, "..", "");
  const clientEnv = loadEnv(mode, ".", "");
  const env = { ...rootEnv, ...clientEnv };
  // Mặc định mẫu của Dev A; KHÔNG dùng 2567 (cổng của bản chạy thật: client dev không được trỏ vào đó)
  const serverPort = env.PORT || "2597";
  const clientPort = Number(env.CLIENT_PORT || 5173);
  // Số phiên bản hiện ở Cài đặt (Giới thiệu và ghi công): lấy từ package.json gốc, cùng nguồn với `release-consistency.test.ts`
  const appVersion = (
    JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as {
      version: string;
    }
  ).version;
  const proxy = {
    "/api": { target: `http://localhost:${serverPort}` },
    "/health": { target: `http://localhost:${serverPort}` },
  };
  return {
    envDir: "..",
    server: { port: clientPort, strictPort: true, proxy },
    preview: { port: clientPort, strictPort: true, proxy },
    define: {
      __SERVER_PORT__: JSON.stringify(serverPort),
      __APP_VERSION__: JSON.stringify(appVersion),
      ...(clientEnv.VITE_NATIVE !== undefined
        ? {
            "import.meta.env.VITE_NATIVE": JSON.stringify(clientEnv.VITE_NATIVE),
          }
        : {}),
      ...(clientEnv.VITE_SERVER_URL !== undefined
        ? {
            "import.meta.env.VITE_SERVER_URL": JSON.stringify(clientEnv.VITE_SERVER_URL),
          }
        : {}),
    },
    // Cỡ gói (M7): bản production dùng bản dựng ĐÃ NÉN của chính Phaser (`phaser-arcade-physics.min.js`: terser của đội Phaser, không có Matter vì game không dùng vật lý)
    // thay cho `dist/phaser.js` (mã nguồn không nén 7,8 MB để esbuild tự nén). gzip của gói chính ~497 KB -> ~463 KB (-34 KB); dev vẫn dùng bản đọc được. Cần Matter
    // (hoặc cần tên `Phaser.Physics.Matter`) thì đổi sang `phaser.min.js` (+33 KB gzip). Xem docs/THIET_KE_GIAO_DIEN_DO_HOA.md mục 10.6.
    resolve:
      mode === "production"
        ? { alias: [{ find: /^phaser$/, replacement: "phaser/dist/phaser-arcade-physics.min.js" }] }
        : {},
    build: { chunkSizeWarningLimit: 2000 },
  };
});
