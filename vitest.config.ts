import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/**/*.test.ts", "server/**/*.test.ts"],
    environment: "node",
    // Colyseus gọi process.send() (tích hợp pm2) nếu chạy trong tiến trình con: dùng worker thread thay vì fork
    pool: "threads",
  },
});
