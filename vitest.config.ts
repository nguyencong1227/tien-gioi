import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/**/*.test.ts", "server/**/*.test.ts", "client/**/*.test.ts"],
    environment: "node",
    // Colyseus gọi process.send() (tích hợp pm2) nếu chạy trong tiến trình con: dùng worker thread thay vì fork
    pool: "threads",
    // Test tích hợp (server Colyseus thật, nhiều tab / phòng) chạy chậm hơn nhiều khi CI hoặc máy dùng chung đang tải nặng: 5 giây mặc
    // định làm test đỏ giả (WorldRoom.dungeon.test.ts quá hạn dù thường chỉ ~1 giây). Treo thật vẫn đỏ, chỉ muộn hơn; mỗi `waitFor` có hạn riêng.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
