import { describe, expect, it } from "vitest";
import { TAP_CLICK_MAX_WAIT_MS, createTapDedupe } from "./tap-dedupe";

// Mô phỏng đúng thứ tự `bindTap`: `pointerdown` (ghi nợ, chạy `fn`), `pointerup` (làm mới mốc), `click` (bỏ qua hay chạy `fn`?). Trả số lần `fn` chạy.
function tapOnce(
  d: ReturnType<typeof createTapDedupe>,
  tDown: number,
  tUp: number | null,
  tClick: number,
) {
  let runs = 1; // `pointerdown` luôn chạy `fn`
  d.down(tDown);
  if (tUp !== null) d.up(tUp);
  if (!d.ignoreClick(tClick)) runs++;
  return runs;
}

describe("createTapDedupe (bindTap: ghép cặp pointerdown <-> click)", () => {
  it("click ngay sau lần nhả bị bỏ qua dù nhấn giữ bao lâu (bản đầu tính từ pointerdown: giữ >= 400 ms chạy `fn` hai lần)", () => {
    for (const holdMs of [0, 100, 250, 299, 300, 400, 450, 700, 1200, 5000]) {
      expect(
        tapOnce(createTapDedupe(), 1000, 1000 + holdMs, 1000 + holdMs + 4),
        `giữ ${holdMs} ms`,
      ).toBe(1);
    }
  });

  it("click tới TRỄ sau lần nhả vẫn bị bỏ qua, kể cả > 300 ms (bản hai: cửa sổ 300 ms từ pointerup; đo được 226 ms ở khung chậm, luồng chính bận còn hơn)", () => {
    for (const lag of [
      1,
      50,
      161,
      226,
      250,
      299,
      300,
      301,
      450,
      700,
      1000,
      TAP_CLICK_MAX_WAIT_MS - 1,
    ]) {
      expect(tapOnce(createTapDedupe(), 0, 500, 500 + lag), `trễ ${lag} ms`).toBe(1);
    }
  });

  it("`click` tổng hợp ngay sau `pointerdown` mà KHÔNG có `pointerup` vẫn bị bỏ qua như bản cũ", () => {
    for (const gap of [0, 4, 100, 299, 301, 1000]) {
      expect(tapOnce(createTapDedupe(), 1000, null, 1000 + gap), `cách ${gap} ms`).toBe(1);
    }
  });

  it("click độc lập (không có lần bấm nào chờ click: el.click(), trợ năng) chạy `fn`, kể cả ngay sau khi tải trang", () => {
    const d = createTapDedupe();
    expect(d.ignoreClick(0)).toBe(false);
    expect(d.ignoreClick(10)).toBe(false);
    expect(d.ignoreClick(performance.now())).toBe(false);
  });

  it("mỗi lần bấm chỉ nuốt ĐÚNG MỘT click: click thứ hai liền sau là click độc lập", () => {
    const d = createTapDedupe();
    d.down(0);
    d.up(60);
    expect(d.ignoreClick(64)).toBe(true);
    expect(d.ignoreClick(65)).toBe(false);
  });

  it("lần bấm bị huỷ (không có click) quá hạn thì không nuốt nhầm click độc lập về sau", () => {
    const d = createTapDedupe();
    d.down(1000); // kéo ngón ra khỏi nút, không có click
    d.up(1100);
    expect(d.ignoreClick(1100 + TAP_CLICK_MAX_WAIT_MS - 1)).toBe(true); // còn trong hạn: coi là click của lần bấm đó
    const e = createTapDedupe();
    e.down(1000);
    e.up(1100);
    expect(e.ignoreClick(1100 + TAP_CLICK_MAX_WAIT_MS)).toBe(false); // quá hạn: click độc lập
  });

  it("hai lần bấm nhanh liền nhau: click của mỗi lần đều bị bỏ, kể cả khi click lần một tới SAU pointerdown lần hai (không nhân đôi, không nuốt thiếu)", () => {
    const d = createTapDedupe();
    // lần 1: nhấn 0, nhả 60; lần 2: nhấn 140 (chạy `fn`); click của lần 1 tới trễ ở 150; nhả lần 2 ở 200; click lần 2 ở 204
    d.down(0);
    d.up(60);
    d.down(140);
    expect(d.ignoreClick(150)).toBe(true);
    d.up(200);
    expect(d.ignoreClick(204)).toBe(true);
    expect(d.ignoreClick(210)).toBe(false);
  });

  it("bấm liên tục không có click (chuột phải...) không tích nợ vô hạn", () => {
    const d = createTapDedupe();
    for (let i = 0; i < 100; i++) d.down(i);
    // vòng CHẶN (1000 lần): một bản `ignoreClick` không bao giờ trả nợ sẽ không làm test treo
    let swallowed = 0;
    for (let i = 0; i < 1000 && d.ignoreClick(200); i++) swallowed++;
    expect(swallowed).toBeLessThanOrEqual(8);
  });

  it("hạn chờ tuỳ chỉnh", () => {
    const d = createTapDedupe(50);
    d.down(100);
    expect(d.ignoreClick(149)).toBe(true);
    const e = createTapDedupe(50);
    e.down(100);
    expect(e.ignoreClick(150)).toBe(false);
  });
});
