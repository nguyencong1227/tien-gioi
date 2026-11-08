import { defineConfig, loadEnv } from "vite";

// Cổng đọc từ .env.local ở gốc repo, để 2 dev chạy song song trên cùng một máy
// mà không đụng cổng nhau (xem docs/LAM_CHUNG_MAY.md).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const serverPort = env.PORT || "2567";
  const clientPort = Number(env.CLIENT_PORT || 5173);
  return {
    envDir: "..",
    server: { port: clientPort, strictPort: true },
    preview: { port: clientPort, strictPort: true },
    define: { __SERVER_PORT__: JSON.stringify(serverPort) },
    build: { chunkSizeWarningLimit: 2000 },
  };
});
