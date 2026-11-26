import { describe, expect, it } from "vitest";
import { TAP_CLICK_DEDUPE_MS, createTapDedupe } from "./tap-dedupe";

// Mô phỏng đúng thứ tự `bindTap`: `pointerdown` (ghi mốc, chạy `fn`), `pointerup` (ghi mốc), `click` (bỏ qua hay chạy `fn`?). Trả số lần `fn` chạy.
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

describe("createTapDedupe (bindTap: mốc là pointerdown HOẶC pointerup gần nhất)", () => {
  it("click ngay sau lần nhả bị bỏ qua dù nhấn giữ bao lâu (bản cũ chỉ ghi mốc ở pointerdown: giữ >= 400 ms chạy `fn` hai lần)", () => {
    for (const holdMs of [0, 100, 250, 299, 300, 400, 450, 700, 1200, 5000]) {
      expect(
        tapOnce(createTapDedupe(), 1000, 1000 + holdMs, 1000 + holdMs + 4),
        `giữ ${holdMs} ms`,
      ).toBe(1);
    }
  });

  it("click tới muộn sau lần nhả (khung chậm ~160-250 ms) vẫn bị bỏ qua", () => {
    for (const lag of [1, 50, 161, 250, TAP_CLICK_DEDUPE_MS - 1]) {
      expect(tapOnce(createTapDedupe(), 0, 500, 500 + lag), `trễ ${lag} ms`).toBe(1);
    }
  });

  it("`click` tổng hợp ngay sau `pointerdown` mà KHÔNG có `pointerup` vẫn bị bỏ qua như bản cũ (mốc pointerdown được giữ)", () => {
    for (const gap of [0, 4, 100, 299]) {
      expect(tapOnce(createTapDedupe(), 1000, null, 1000 + gap), `cách ${gap} ms`).toBe(1);
    }
    // quá cửa sổ mà vẫn chưa có lần nhả nào: coi là click độc lập
    expect(tapOnce(createTapDedupe(), 1000, null, 1000 + TAP_CLICK_DEDUPE_MS), "đúng cửa sổ").toBe(
      2,
    );
  });

  it("click độc lập (không có lần chạm nào trước đó: el.click(), trợ năng) chạy `fn`, kể cả ngay sau khi tải trang", () => {
    const d = createTapDedupe();
    expect(d.ignoreClick(0)).toBe(false);
    expect(d.ignoreClick(10)).toBe(false);
    expect(d.ignoreClick(performance.now())).toBe(false);
  });

  it("click cách lần chạm cuối >= cửa sổ là một lần bấm mới (không bị nuốt)", () => {
    const d = createTapDedupe();
    d.up(1000);
    expect(d.ignoreClick(1000 + TAP_CLICK_DEDUPE_MS - 1)).toBe(true);
    expect(d.ignoreClick(1000 + TAP_CLICK_DEDUPE_MS)).toBe(false);
    expect(d.ignoreClick(1000 + TAP_CLICK_DEDUPE_MS + 1)).toBe(false);
  });

  it("hai lần bấm nhanh liền nhau: click của mỗi lần đều bị bỏ, lần hai không bị nuốt (`fn` chạy ở pointerdown của lần hai)", () => {
    const d = createTapDedupe();
    // lần 1: nhấn 0, nhả 60, click 64; lần 2: nhấn 140, nhả 200, click 204
    d.down(0);
    d.up(60);
    expect(d.ignoreClick(64)).toBe(true);
    d.down(140);
    d.up(200);
    expect(d.ignoreClick(204)).toBe(true);
  });

  it("cửa sổ tuỳ chỉnh", () => {
    const d = createTapDedupe(50);
    d.up(100);
    expect(d.ignoreClick(149)).toBe(true);
    expect(d.ignoreClick(150)).toBe(false);
  });
});
