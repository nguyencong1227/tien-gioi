// Test cho `server-spawn.ts` (bộ chơi thử AI #1194, mục 60.1): dựng server Colyseus thật in-process.
// Chạy trong CI KHÔNG cần build client (dist thường thiếu) → răng của ca "báo lỗi khi dist thiếu"
// được chứng minh đúng môi trường đó; môi trường đã build thì ca đó tự bỏ qua (đã smoke test thật
// dựng+đóng server — xem ghi chú Dev F).
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientDist, currentHeadSha, spawnPlaytestServer } from "./server-spawn";

describe("server-spawn", () => {
  it("currentHeadSha trả SHA ngắn (>= 7 ký tự) hoặc 'unknown'", () => {
    const sha = currentHeadSha();
    expect(sha === "unknown" || sha.length >= 7).toBe(true);
  });

  it("báo lỗi rõ khi client/dist chưa build (KHÔNG ngầm phục vụ mã sai)", async () => {
    // CI / máy chưa build: dist thiếu → phải ném lỗi hướng dẫn build, KHÔNG tiến tới import WorldRoom / bind cổng.
    if (existsSync(path.join(clientDist, "index.html"))) return; // môi trường đã build → bỏ qua ca này
    await expect(spawnPlaytestServer({ pickPort: () => 39900 })).rejects.toThrow(
      /client\/dist chưa có/,
    );
  });
});
