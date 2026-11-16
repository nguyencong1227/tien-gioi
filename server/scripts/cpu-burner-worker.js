// Worker tính toán tải CPU nền (Issue #752)
// Chạy vòng lặp tính toán để giả lập tải CPU khi chạy test, tự động dừng khi nhận tin 'stop'
import process from "node:process";
import { parentPort } from "node:worker_threads";

let running = true;
parentPort?.on("message", (msg) => {
  if (msg === "stop") {
    running = false;
    process.exit(0);
  }
});

while (running) {
  for (let i = 0; i < 500000; i++) {
    Math.sqrt(Math.random() * 1000000);
  }
}
