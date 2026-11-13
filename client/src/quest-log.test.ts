import { describe, expect, it } from "vitest";
import { QUESTS, QUEST_BY_ID } from "@tien-gioi/shared";
import { MAIN_QUEST_TOTAL, doneRows, doneSummary } from "./quest-log";

const MAIN = QUESTS.filter((q) => !q.daily).map((q) => q.id);
const DAILY = QUESTS.filter((q) => q.daily).map((q) => q.id);

describe("doneRows (tab Đã hoàn thành của Sổ nhiệm vụ)", () => {
  it("chuỗi chính theo THỨ TỰ CHUỖI dù server gửi lộn xộn, nhiệm vụ lặp xếp sau", () => {
    expect(MAIN.length).toBeGreaterThanOrEqual(15); // chuỗi dài (Phàm Nhân -> Trúc Cơ -> Kim Đan): đúng ca cần gọn
    expect(DAILY.length).toBeGreaterThan(0);
    const shuffled = [...MAIN].reverse();
    const rows = doneRows(shuffled, [DAILY[0]]);
    expect(rows.map((r) => r.id)).toEqual([...MAIN, DAILY[0]]);
    expect(rows.at(-1)!.daily).toBe(true);
    expect(rows.slice(0, -1).every((r) => !r.daily)).toBe(true);
  });

  it("mỗi hàng mang tiêu đề + mô tả của nhiệm vụ", () => {
    const [row] = doneRows([MAIN[0]], []);
    expect(row.title).toBe(QUEST_BY_ID[MAIN[0]].title);
    expect(row.desc).toBe(QUEST_BY_ID[MAIN[0]].desc);
  });

  it("bỏ id lạ, id độc, sai kiểu và id trùng (danh sách từ file lưu không đáng tin)", () => {
    const rows = doneRows(
      [
        MAIN[1],
        "khong_co",
        "constructor",
        "__proto__",
        "toString",
        MAIN[1],
        7 as unknown as string,
      ],
      [DAILY[0], DAILY[0], "hasOwnProperty"],
    );
    expect(rows.map((r) => r.id)).toEqual([MAIN[1], DAILY[0]]);
  });

  it("rỗng thì không có hàng", () => {
    expect(doneRows([], [])).toEqual([]);
  });

  it("một id đã có ở `done` thì không lặp lại ở `dailyDone` (và ngược lại)", () => {
    expect(doneRows([MAIN[0]], [MAIN[0]]).map((r) => r.id)).toEqual([MAIN[0]]);
  });
});

describe("doneSummary", () => {
  it("mẫu số là số nhiệm vụ chính tuyến THẬT của game, không chép cứng", () => {
    expect(MAIN_QUEST_TOTAL).toBe(MAIN.length);
    expect(doneSummary([])).toBe(`Chính tuyến 0 / ${MAIN.length}`);
    expect(doneSummary(doneRows(MAIN, []))).toBe(`Chính tuyến ${MAIN.length} / ${MAIN.length}`);
  });

  it("có phần lặp hôm nay chỉ khi đã làm nhiệm vụ lặp", () => {
    const some = doneRows(MAIN.slice(0, 3), []);
    expect(doneSummary(some)).not.toContain("Lặp");
    const withDaily = doneRows(MAIN.slice(0, 3), DAILY.slice(0, 2));
    expect(doneSummary(withDaily)).toBe(`Chính tuyến 3 / ${MAIN.length} · Lặp hôm nay: 2`);
  });
});
