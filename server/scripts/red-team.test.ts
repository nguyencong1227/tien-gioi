// Test đối kháng (Red Team) từng tin nhắn phía server (M4-sớm, Issue #252, docs/PHAN_CONG_M4.md mục 2.1).
// Kiểm tra chống hồi quy trong CI:
// 1. 48 loại tin nhắn của WorldRoom an toàn 100% trước các payload xấu (kiểu sai, null, NaN, Infinity, chuỗi dài, NUL byte, prototype pollution, object/array lồng sâu, id lạ).
// 2. Không làm crash server, không unhandledRejection / uncaughtException.
// 3. Không thay đổi bất hợp pháp state của người khác (Observer) và người gửi (Attacker không tăng tiền/exp/đồ).
// 4. Rate-limit: người gửi spam bị ngắt đúng với mã 4429.
// 5. Transport: bảo vệ trước frame vượt trần 4KB.

import { describe, expect, it } from "vitest";
import { ALL_MESSAGE_TYPES, buildBadPayloads, runRedTeam } from "./red-team";

describe("Red Team Server Messages (#252)", () => {
  it("danh sách ALL_MESSAGE_TYPES bao phủ đủ 48 loại tin nhắn", () => {
    // 47 loại tin nhắn hợp lệ mà WorldRoom đăng ký + 1 tin lạ kiểm tra '*'
    expect(ALL_MESSAGE_TYPES.length).toBe(48);
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

  it("chạy red-team fast: 48 loại tin nhắn an toàn 100% trước >1000 payload xấu", async () => {
    const summary = await runRedTeam({ fast: true, verbose: false });

    expect(summary.totalAttacks).toBeGreaterThanOrEqual(1000);
    expect(summary.failedAttacks).toBe(0);
    expect(summary.passedAttacks).toBe(summary.totalAttacks);
    expect(summary.unhandledErrors).toHaveLength(0);
    expect(summary.rateLimitKicked).toBe(true);
    expect(summary.serverTickAvgMs).toBeLessThan(50);
    expect(summary.rssDeltaMb).toBeLessThan(100);
  }, 60_000);
});
