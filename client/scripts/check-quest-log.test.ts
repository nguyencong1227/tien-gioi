import { describe, expect, it } from "vitest";
import { MAX_ROW_PX, MIN_TAP_PX, VIEWPORTS, judgeQuestLog } from "./check-quest-log.mjs";

const good = () => ({
  expectedRows: 23,
  rows: 23,
  heights: Array.from({ length: 23 }, () => 46),
  overflowX: 0,
  clippedTitles: 0,
  descHiddenBefore: true,
  openedOk: true,
  closedOk: true,
  lastReachable: true,
  touch: true,
});

describe("judgeQuestLog (kiểm Sổ nhiệm vụ gọn khi chuỗi dài, #409)", () => {
  it("số đo tốt thì không lỗi", () => {
    expect(judgeQuestLog(good())).toEqual([]);
  });

  it("đúng năm khung nhìn như snap-sheet, máy tính đứng đầu (Chrome không tắt được giả lập cảm ứng)", () => {
    expect(VIEWPORTS.map((v) => v.name)).toEqual([
      "1280x720",
      "768x1024",
      "844x390",
      "390x844",
      "360x640",
    ]);
    const firstTouch = VIEWPORTS.findIndex((v) => v.mobile);
    expect(VIEWPORTS.slice(firstTouch).every((v) => v.mobile)).toBe(true);
    expect(firstTouch).toBeGreaterThan(0);
  });

  it("ĐỘT BIẾN: thiếu hàng / dữ liệu rỗng / hàng thấp hơn ô bấm (chỉ cảm ứng) / không gọn / tràn / cắt chữ -> đỏ", () => {
    const bad = (patch: object) => judgeQuestLog({ ...good(), ...patch });
    expect(bad({ rows: 22 })).toEqual([expect.stringContaining("số hàng 22")]);
    expect(bad({ expectedRows: 0, rows: 0, heights: [] })[0]).toContain("dữ liệu mẫu rỗng");
    const short = Array.from({ length: 23 }, () => MIN_TAP_PX - 8);
    expect(bad({ heights: short }).join()).toContain(`thấp hơn ${MIN_TAP_PX}px`);
    expect(bad({ heights: short, touch: false })).toEqual([]); // máy tính dùng chuột: không đòi 44 px
    const fat = Array.from({ length: 23 }, () => MAX_ROW_PX + 30); // trở lại thẻ nhiều dòng như trước
    expect(bad({ heights: fat }).join()).toContain("không gọn");
    expect(bad({ overflowX: 12 }).join()).toContain("tràn ngang");
    expect(bad({ clippedTitles: 2 }).join()).toContain("bị cắt chữ");
  });

  it("ĐỘT BIẾN: mô tả hiện sẵn, bấm không mở / không đóng, không cuộn tới hàng cuối -> đỏ", () => {
    const bad = (patch: object) => judgeQuestLog({ ...good(), ...patch }).join();
    expect(bad({ descHiddenBefore: false })).toContain("hiện sẵn");
    expect(bad({ openedOk: false })).toContain("không mở");
    expect(bad({ closedOk: false })).toContain("không đóng");
    expect(bad({ lastReachable: false })).toContain("hàng cuối");
  });

  it("mức gọn nằm giữa hàng đóng một dòng (~46 px) và thẻ cũ nhiều dòng (> 100 px)", () => {
    expect(MAX_ROW_PX).toBeGreaterThan(MIN_TAP_PX);
    expect(MAX_ROW_PX).toBeLessThan(100);
  });
});
