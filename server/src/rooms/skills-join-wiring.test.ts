// Canh nối mã (B, #1112): vào phòng / nối lại mạng phải gửi `skills` ÉP (`force`) để kèm `mastery` (`{}` nếu chưa có điểm): client hiện thanh luyện 0 / N ngay thay vì đợi điểm đầu tiên.
// Tin gửi lúc VÀO phòng đến client TRƯỚC khi test kịp `onMessage` nên không bắt được bằng Colyseus thật; kiểm bằng đọc nguồn (như `windup-wiring.test.ts` của client) cộng test hành vi của
// `sendSkills` ở `mastery.test.ts` (ép luôn kèm, `{}` nếu rỗng).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const room = readFileSync(path.join(here, "WorldRoom.ts"), "utf8");

describe("WorldRoom: gửi sổ chiêu ÉP lúc vào phòng và nối lại", () => {
  it("onJoin: sendSkills(world, sessionId, true)", () => {
    expect(room).toContain("sendSkills(this.world, client.sessionId, true)");
    expect(room).not.toMatch(/sendSkills\(this\.world, client\.sessionId\)/);
  });
  it("nối lại sau rớt mạng: sendSkills(world, sid, true)", () => {
    expect(room).toContain("sendSkills(this.world, sid, true)");
    expect(room).not.toMatch(/sendSkills\(this\.world, sid\)/);
  });
});
