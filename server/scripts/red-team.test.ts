// Test đối kháng (Red Team) từng tin nhắn phía server (M4-sớm, Issue #252, docs/PHAN_CONG_M4.md mục 2.1).
// Kiểm tra chống hồi quy trong CI:
// 1. Tự động phát hiện 64 loại tin nhắn đăng ký của WorldRoom, so khớp tập hợp với EXPECTED_MESSAGE_TYPES.
// 2. 65 loại tin nhắn (64 tin đăng ký + 1 tin lạ handler '*') an toàn 100% trước 26 biến thể payload xấu
//    khi gửi từ CẢ HAI đối tượng người gửi: Poor Attacker (hồ sơ mới) và Rich Attacker (đầy tiền, đồ, cạnh NPC, có đội, có tông môn).
// 3. Không ném ngoại lệ [lỗi] trong handler (bắt qua console.error & onUncaughtException).
// 4. Không làm crash server, không unhandledRejection / uncaughtException.
// 5. Bất biến SỐNG: Observer bất biến; Attacker không tự tăng tiền, exp, realm, tổng đồ hoặc bất kỳ vật phẩm nào.
// 6. Rate-limit: người gửi spam bị ngắt đúng với mã 4429.

import { describe, expect, it } from "vitest";
import { MAX_TRACKED_TYPES, MESSAGE_TYPE_HEADROOM } from "../src/rate-limit";
import { EXPECTED_MESSAGE_TYPES, buildBadPayloads, runRedTeam } from "./red-team";

describe("Red Team Server Messages (#252)", () => {
  it("danh sách EXPECTED_MESSAGE_TYPES bao phủ đủ 64 loại tin nhắn hợp lệ của WorldRoom", () => {
    expect(EXPECTED_MESSAGE_TYPES.length).toBe(64);
  });

  it("#1250: số loại tin đã đăng ký còn dư địa dưới trần theo dõi của RateLimiter (thêm loại tin mới không làm phiên dùng đủ loại thấy loại cuối bị bỏ như spam)", () => {
    expect(EXPECTED_MESSAGE_TYPES.length + MESSAGE_TYPE_HEADROOM).toBeLessThanOrEqual(
      MAX_TRACKED_TYPES,
    );
  });

  it("tập payload xấu buildBadPayloads phủ đủ các nhóm nguy hiểm", () => {
    const fastPayloads = buildBadPayloads(true);
    const fullPayloads = buildBadPayloads(false);

    expect(fastPayloads.length).toBeGreaterThanOrEqual(20);
    expect(fullPayloads.length).toBeGreaterThan(fastPayloads.length);

    const categories = new Set(fastPayloads.map((p) => p.category));
    expect(categories.has("primitive")).toBe(true);
    expect(categories.has("number")).toBe(true);
    expect(categories.has("string")).toBe(true);
    expect(categories.has("prototype")).toBe(true);
    expect(categories.has("nested")).toBe(true);
    expect(categories.has("field")).toBe(true);
  });

  it("chạy red-team fast: tự phát hiện tin nhắn, an toàn 100% trước >2000 đòn tấn công (Poor + Rich)", async () => {
    const summary = await runRedTeam({ fast: true, verbose: false });

    // 1. So khớp tập hợp tin nhắn tự phát hiện với danh sách mong đợi (thiếu / thừa đều đỏ)
    expect(summary.discoveredMessageTypes.sort()).toEqual([...EXPECTED_MESSAGE_TYPES].sort());

    // 2. Độ phủ đòn đánh (>2000 attacks trên cả 2 đối tượng Poor & Rich)
    expect(summary.totalAttacks).toBeGreaterThanOrEqual(2000);
    expect(summary.failedAttacks).toBe(0);
    expect(summary.passedAttacks).toBe(summary.totalAttacks);

    // 3. Không có lỗi sập server và không có handler nào ném ngoại lệ ([lỗi])
    expect(summary.unhandledErrors).toHaveLength(0);
    expect(summary.handlerExceptions).toHaveLength(0);

    // 4. Cơ chế chống spam
    expect(summary.rateLimitKicked).toBe(true);

    // 5. Hiệu năng & bộ nhớ (ngưỡng chặt < 30 MB). Bộ nhớ đo bằng heap của CHÍNH luồng chạy bài (`heapDeltaMb`), KHÔNG bằng RSS cả tiến trình (`rssDeltaMb`):
    // vitest chạy `pool: "threads"` nên RSS cộng cả ~20 tệp test khác chạy song song (A đo 171 MB lúc chạy cả bộ, #1215) trong khi bài này chỉ tăng ~7-14 MB heap.
    expect(summary.payloadLatencyAvgMs).toBeLessThan(50);
    expect(Number.isFinite(summary.heapDeltaMb)).toBe(true);
    expect(summary.heapDeltaMb).toBeLessThan(30);
  }, 90_000);
});
