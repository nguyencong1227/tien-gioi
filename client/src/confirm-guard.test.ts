import { describe, expect, it } from "vitest";
import { CONFIRM_GUARD_MAX_WAIT_MS, CONFIRM_GUARD_MS, createConfirmGuard } from "./confirm-guard";

/** Mô phỏng cú chạm mở hộp: pointerdown (hộp mở ngay) -> giữ `holdMs` -> pointerup -> `click` sau `clickLagMs` ở nút xác nhận. Trả: `click` có bị bỏ qua không. */
function openByTouchThenClick(holdMs: number, clickLagMs: number, t0 = 1000): boolean {
  const g = createConfirmGuard();
  g.pointerDown(t0); // pha bắt, trước bộ xử lý của nút mở hộp
  g.open(t0);
  g.pointerUp(t0 + holdMs);
  return g.ignoreInside(t0 + holdMs + clickLagMs);
}

describe("createConfirmGuard: click ma của hộp xác nhận (ghép cặp với cú chạm mở hộp)", () => {
  it("click của cú chạm mở hộp bị bỏ qua dù giữ bao lâu và click tới trễ bao lâu (bản cũ: cửa sổ 450 ms từ lúc mở)", () => {
    for (const hold of [0, 100, 355, 449, 450, 700, 1200]) {
      for (const lag of [1, 85, 114, 400, 1000]) {
        expect(openByTouchThenClick(hold, lag), `giữ ${hold} ms, click trễ ${lag} ms`).toBe(true);
      }
    }
  });

  it("nhật ký thật: pointerdown +0, pointerup +355, click +469 (sau cửa sổ 450 ms) vẫn bị bỏ qua", () => {
    expect(openByTouchThenClick(355, 114)).toBe(true);
  });

  it("chỉ bỏ qua ĐÚNG MỘT click: click thứ hai sau cửa sổ là bấm thật", () => {
    const g = createConfirmGuard();
    g.pointerDown(0);
    g.open(0);
    g.pointerUp(700);
    expect(g.ignoreInside(800)).toBe(true);
    expect(g.ignoreInside(1500)).toBe(false);
  });

  it("lần nhấn MỚI sau khi nhả (bấm xác nhận thật) xoá khoản nợ: nhận ngay khi qua cửa sổ", () => {
    const g = createConfirmGuard();
    g.pointerDown(0);
    g.open(0);
    g.pointerUp(300);
    // người chơi đọc xong, nhấn "Vứt" ở +900 ms (pointerdown pha bắt rồi bộ xử lý của nút)
    g.pointerDown(900);
    expect(g.ignoreInside(900)).toBe(false);
  });

  it("lần nhấn mới trong cửa sổ 450 ms vẫn bị cận dưới chặn (bấm ngay khi hộp vừa mở)", () => {
    const g = createConfirmGuard();
    g.pointerDown(0);
    g.open(0);
    g.pointerUp(60);
    g.pointerDown(200);
    expect(g.ignoreInside(200)).toBe(true);
    expect(g.ignoreInside(CONFIRM_GUARD_MS)).toBe(false);
  });

  it("hộp mở KHÔNG do cú chạm (phím tắt, hoặc ở `click` sau khi nhả): không có khoản nợ, qua cửa sổ là nhận", () => {
    const g = createConfirmGuard();
    g.open(5000); // không con trỏ nào đang nhấn
    expect(g.ignoreInside(5000 + CONFIRM_GUARD_MS - 1)).toBe(true);
    expect(g.ignoreInside(5000 + CONFIRM_GUARD_MS)).toBe(false);
    expect(g.ignoreInside(5000 + CONFIRM_GUARD_MS + 1)).toBe(false);
  });

  it("cú chạm bị huỷ (không có click) quá hạn thì không nuốt nhầm thao tác sau", () => {
    const g = createConfirmGuard();
    g.pointerDown(0);
    g.open(0);
    g.pointerUp(100); // kéo ngón ra khỏi nút: không có click
    expect(g.ignoreInside(100 + CONFIRM_GUARD_MAX_WAIT_MS)).toBe(false);
  });

  it("chưa nhả ngón thì chưa có click để bỏ: kích hoạt bằng phím sau cửa sổ vẫn nhận", () => {
    const g = createConfirmGuard();
    g.pointerDown(0);
    g.open(0);
    expect(g.ignoreInside(900)).toBe(false);
  });

  it("pointerup bị mất: lần nhấn kế tiếp coi lần trước đã nhả, không treo trạng thái", () => {
    const g = createConfirmGuard();
    g.pointerDown(0);
    g.open(0);
    g.pointerDown(2000); // không thấy pointerup của lần đầu
    expect(g.ignoreInside(2000)).toBe(false);
  });

  it("click rơi xuống nút BÊN DƯỚI sau khi hộp đóng ở pointerdown: bỏ qua một lần dù trễ, rồi nhận", () => {
    const g = createConfirmGuard();
    g.pointerDown(0); // nhấn nút Giữ lại / Vứt trong hộp
    g.closed(0);
    g.pointerUp(600);
    expect(g.ignoreAfterClose(700)).toBe(true);
    expect(g.ignoreAfterClose(800)).toBe(false);
    // hộp đóng bằng phím: không có khoản nợ
    const h = createConfirmGuard();
    h.closed(9000);
    expect(h.ignoreAfterClose(9000 + CONFIRM_GUARD_MS)).toBe(false);
    expect(h.ignoreAfterClose(9100)).toBe(true); // vẫn trong cận dưới 450 ms
  });

  it("chưa từng mở / đóng: không chặn nhầm click độc lập", () => {
    const g = createConfirmGuard();
    expect(g.ignoreAfterClose(10)).toBe(false);
    expect(g.ignoreAfterClose(performance.now())).toBe(false);
  });

  it("expire(): thao tác CHỦ Ý bằng phím (X giữ lại) bỏ cửa sổ và khoản nợ", () => {
    const g = createConfirmGuard();
    g.pointerDown(0);
    g.open(0);
    g.pointerUp(50);
    g.expire();
    expect(g.ignoreInside(100)).toBe(false);
  });

  it("đồng hồ lùi / số hỏng coi như còn trong cửa sổ (an toàn)", () => {
    const g = createConfirmGuard();
    g.open(5000);
    expect(g.ignoreInside(4000)).toBe(true);
    expect(g.ignoreInside(Number.NaN)).toBe(true);
  });
});
