// `ChatOut.titleId` (M9): danh hiệu của người nói trong chat toàn server là ID NGẮN như `Player.title`; kiểu chỉ THÊM trường tuỳ chọn (tin cũ không đổi).
import { describe, expect, it } from "vitest";
import { TITLES, TITLE_ID_RE, type ChatOut } from "./index";

describe("ChatOut.titleId", () => {
  it("trường tuỳ chọn: tin chat cũ (không có titleId) và tin có danh hiệu đều hợp kiểu (kiểm lúc biên dịch bằng `satisfies`)", () => {
    const old = { from: "A", text: "chào" } satisfies ChatOut;
    const withTitle = { from: "A", text: "chào", titleId: "tr1" } satisfies ChatOut;
    expect(old).not.toHaveProperty("titleId");
    expect(withTitle.titleId).toBe("tr1");
  });

  it("MỌI danh hiệu trong TITLES là id ngắn hợp lệ (TITLE_ID_RE): máy chủ điền Player.title vào titleId mà không phải làm sạch thêm", () => {
    expect(TITLES.length).toBeGreaterThan(0);
    for (const t of TITLES) expect(TITLE_ID_RE.test(t.id), t.id).toBe(true);
  });
});
