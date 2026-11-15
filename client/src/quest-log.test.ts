import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAIN_QUEST_START, QUESTS, QUEST_BY_ID } from "@tien-gioi/shared";
import {
  MAIN_QUEST_TOTAL,
  QUEST_KIND_BADGE,
  QUEST_KIND_LABEL,
  doneRows,
  doneSummary,
  questKind,
} from "./quest-log";

/** Chuỗi chính: đi từ nhiệm vụ đầu theo `next` (tính độc lập với `quest-log.ts`). */
const MAIN: string[] = [];
for (
  let id: string | undefined = MAIN_QUEST_START;
  id && !MAIN.includes(id);
  id = QUEST_BY_ID[id]?.next
)
  MAIN.push(id);
const DAILY = QUESTS.filter((q) => q.daily).map((q) => q.id);
/** Việc phụ: không lặp, không thuộc chuỗi chính. */
const SIDE = QUESTS.filter((q) => !q.daily && !MAIN.includes(q.id)).map((q) => q.id);

describe("loại nhiệm vụ: chính tuyến / việc phụ / lặp", () => {
  it("mọi nhiệm vụ thuộc đúng một loại và ba loại cộng lại đủ số nhiệm vụ của game", () => {
    expect(MAIN.length + SIDE.length + DAILY.length).toBe(QUESTS.length);
    for (const id of MAIN) expect(questKind(QUEST_BY_ID[id]), id).toBe("main");
    for (const id of SIDE) expect(questKind(QUEST_BY_ID[id]), id).toBe("side");
    for (const id of DAILY) expect(questKind(QUEST_BY_ID[id]), id).toBe("daily");
  });

  it("việc phụ có thật (Xích Mãng theo đội) và KHÔNG được gọi là chính tuyến; nhãn tiếng Việt đúng", () => {
    expect(SIDE).toContain("mang_hoan");
    expect(questKind(QUEST_BY_ID.mang_hoan)).toBe("side");
    expect(QUEST_KIND_LABEL).toEqual({ main: "Chính tuyến", side: "Việc phụ", daily: "Hằng ngày" });
    expect(QUEST_KIND_BADGE).toEqual({ main: "Chính", side: "Phụ", daily: "Lặp" });
  });

  it("id lạ / thiếu định nghĩa: coi là việc phụ, không ném lỗi", () => {
    expect(questKind(undefined)).toBe("side");
    expect(questKind({ id: "khong_co" })).toBe("side");
    expect(questKind({ id: "constructor" })).toBe("side");
  });
});

describe("doneRows (tab Đã hoàn thành của Sổ nhiệm vụ)", () => {
  it("chuỗi chính theo THỨ TỰ CHUỖI dù server gửi lộn xộn, rồi việc phụ, nhiệm vụ lặp xếp sau cùng", () => {
    expect(MAIN.length).toBeGreaterThanOrEqual(15); // chuỗi dài (Phàm Nhân -> Trúc Cơ -> Kim Đan -> Nguyên Anh): đúng ca cần gọn
    expect(DAILY.length).toBeGreaterThan(0);
    expect(SIDE.length).toBeGreaterThan(0);
    const shuffled = [...SIDE, ...MAIN].reverse();
    const rows = doneRows(shuffled, [DAILY[0]]);
    expect(rows.map((r) => r.id)).toEqual([...MAIN, ...SIDE, DAILY[0]]);
    expect(rows.at(-1)!.daily).toBe(true);
    expect(rows.filter((r) => r.side).map((r) => r.id)).toEqual(SIDE);
    expect(rows.slice(0, MAIN.length).every((r) => !r.daily && !r.side)).toBe(true);
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
  it("mẫu số là số nhiệm vụ trong CHUỖI CHÍNH của game, không chép cứng và không tính việc phụ", () => {
    expect(MAIN_QUEST_TOTAL).toBe(MAIN.length);
    expect(MAIN_QUEST_TOTAL).toBeLessThan(QUESTS.filter((q) => !q.daily).length);
    expect(doneSummary([])).toBe(`Chính tuyến 0 / ${MAIN.length}`);
    expect(doneSummary(doneRows(MAIN, []))).toBe(`Chính tuyến ${MAIN.length} / ${MAIN.length}`);
  });

  it("xong đủ chuỗi chính và mọi việc phụ vẫn ghi đúng 'chính tuyến N / N' (việc phụ không đẩy tử số quá mẫu số)", () => {
    expect(doneSummary(doneRows([...MAIN, ...SIDE], []))).toBe(
      `Chính tuyến ${MAIN.length} / ${MAIN.length} · Việc phụ: ${SIDE.length}`,
    );
  });

  it("có phần việc phụ / lặp chỉ khi đã làm", () => {
    const some = doneRows(MAIN.slice(0, 3), []);
    expect(doneSummary(some)).not.toContain("Lặp");
    expect(doneSummary(some)).not.toContain("Việc phụ");
    const withDaily = doneRows(MAIN.slice(0, 3), DAILY.slice(0, 2));
    expect(doneSummary(withDaily)).toBe(`Chính tuyến 3 / ${MAIN.length} · Lặp hôm nay: 2`);
    const all = doneRows([...MAIN.slice(0, 3), SIDE[0]], DAILY.slice(0, 2));
    expect(doneSummary(all)).toBe(`Chính tuyến 3 / ${MAIN.length} · Việc phụ: 1 · Lặp hôm nay: 2`);
  });
});

describe("giao diện dùng đúng loại nhiệm vụ (không gọi việc phụ là chính tuyến)", () => {
  const ui = fs.readFileSync(path.resolve(__dirname, "ui.ts"), "utf8");

  it("ui.ts dán nhãn thẻ đang làm / huy hiệu hộp thoại / hàng đã xong qua `questKind`, không còn nhãn cứng 'Chính tuyến' theo `daily`", () => {
    expect(ui).toContain("QUEST_KIND_LABEL[kind]");
    expect(ui).toContain("QUEST_KIND_BADGE[questKind(def)]");
    expect(ui).toContain('row.side ? "Việc phụ"');
    expect(ui).not.toMatch(/def\.daily \? "Hằng ngày" : "Chính tuyến"/);
    expect(ui).not.toMatch(/def\.daily \? "Lặp" : "Chính"/);
  });
});
