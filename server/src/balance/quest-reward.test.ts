// Canh số liệu mục "Thưởng tu vi nhiệm vụ một lần" trong docs/CAN_BANG.md (mục 66.4, #1333).
// `can-bang-sync.test.ts` chỉ giữ tệp tài liệu khớp bản sinh; test này giữ NGUYÊN LÝ tính (phân loại chính / phụ, tổng thanh 3 bậc, %):
// nếu ai đổi cách phân loại hay số nhiệm vụ khiến một cảnh giới vượt trần, test đỏ dù CAN_BANG.md đã sinh lại.
import { describe, expect, it } from "vitest";
import { questRewardSummary, renderQuestReward } from "./quest-reward";

// Trần đã chốt ở shared/src/kim-dan-world.test.ts (bước 2 #1333): chuỗi chính <= 10 %, việc phụ <= 4 % tổng thanh mỗi cảnh giới.
const CAP_MAIN = 0.1;
const CAP_SIDE = 0.04;
// Ngưỡng A đặt (comment #1333): tổng thưởng 1-lần > ~12 % tổng thanh một cảnh giới thì báo A trước khi chốt.
const SHORTEN_REPORT = 0.12;

describe("quest-reward summary (mục CAN_BANG.md)", () => {
  const rows = questRewardSummary();

  it("có đủ Trúc Cơ / Kim Đan / Nguyên Anh", () => {
    expect(rows.map((r) => r.name)).toEqual(["Trúc Cơ", "Kim Đan", "Nguyên Anh"]);
  });

  it("chuỗi chính <= 10 %, việc phụ <= 4 % tổng thanh mỗi cảnh giới (trần #1362)", () => {
    for (const r of rows) {
      expect(r.after.main / r.bar, `${r.name} chuỗi chính`).toBeLessThanOrEqual(CAP_MAIN);
      expect(r.after.side / r.bar, `${r.name} việc phụ`).toBeLessThanOrEqual(CAP_SIDE);
    }
  });

  it("bước 2 #1362 nâng chuỗi chính lên: sau >= trước ở mọi cảnh giới", () => {
    for (const r of rows) {
      expect(r.after.main, `${r.name} chuỗi chính sau phải >= trước`).toBeGreaterThanOrEqual(
        r.before.main,
      );
    }
  });

  it("tổng thưởng 1-lần (sau) KHÔNG vượt ngưỡng báo A ~12 % (nếu vượt: báo A trước khi chốt, comment #1333)", () => {
    for (const r of rows) {
      const shorten = (r.after.main + r.after.side) / r.bar;
      expect(shorten, `${r.name} rút ngắn 1-lần`).toBeLessThanOrEqual(SHORTEN_REPORT + 0.005);
    }
  });

  it("render ra mục Markdown đúng heading + mọi cảnh giới", () => {
    const md = renderQuestReward();
    expect(md).toContain("## Thưởng tu vi nhiệm vụ một lần");
    for (const r of rows) expect(md).toContain(r.name);
  });
});
