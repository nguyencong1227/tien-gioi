import { describe, expect, it } from "vitest";
import { runMultiRoomLoadTest } from "./multi-room-load.js";
import { WorldRoom } from "../src/rooms/WorldRoom.js";

describe("multi-room-load (Refs #1470)", () => {
  it("đo đạc đa phòng thu thập số đo thật và phản ứng với tải (không viết cứng hằng số)", async () => {
    // 1. Chạy đo bình thường trong 2 giây
    const rep = await runMultiRoomLoadTest(2);
    expect(rep.roomCount).toBeGreaterThanOrEqual(11);
    expect(rep.rssBaseMb).toBeGreaterThan(50);
    expect(rep.rss11RoomsMb).toBeGreaterThan(50);

    // Số tick đo thật từ mẫu thực thi
    expect(rep.tickAvgMs).toBeGreaterThan(0);
    expect(rep.tickP95Ms).toBeGreaterThanOrEqual(rep.tickAvgMs);
    expect(rep.tickMaxMs).toBeGreaterThanOrEqual(rep.tickP95Ms);

    // Toàn bộ các phòng (world, bí cảnh, đấu trường) đều có số đo băng thông và patch thật
    expect(rep.rooms.length).toBe(8);
    for (const r of rep.rooms) {
      expect(r.botsCount).toBeGreaterThan(0);
      expect(r.avgBytePerTick).toBeGreaterThanOrEqual(0);
      expect(r.rxKbPerSec).toBeGreaterThanOrEqual(0);
    }

    // 2. Ca đột biến kiểm chứng: chèn busy-wait 5ms vào update của WorldRoom thì tick đo được phải tăng
    const origUpdate = (WorldRoom.prototype as any).update;
    try {
      (WorldRoom.prototype as any).update = function (dtMs: number) {
        const start = performance.now();
        while (performance.now() - start < 5) {
          // bận 5ms
        }
        return origUpdate.call(this, dtMs);
      };

      const repWithLoad = await runMultiRoomLoadTest(2);
      expect(
        repWithLoad.tickP95Ms,
        "p95 phải tăng lên tương ứng khi chèn tải delay 5ms",
      ).toBeGreaterThanOrEqual(4.5);
    } finally {
      (WorldRoom.prototype as any).update = origUpdate;
    }
  }, 60_000);
});
