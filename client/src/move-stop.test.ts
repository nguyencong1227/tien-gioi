// Tin dừng khi nhả phím (QUYET_DINH_M3 mục 41.2): gửi NGAY ở khung vẽ đầu tiên, lặp ở các bước kế, đi lại thì huỷ.
import { describe, expect, it } from "vitest";
import { STOP_REPEATS, StopBurst } from "./move-stop";

/** Mô phỏng một lần nhả: trả tổng số tin dừng gửi ra (khung vẽ đầu tiên + `ticks` bước 50 ms không đi). */
function release(b: StopBurst, ticks = 10): number[] {
  const sent: number[] = [b.frame(false)];
  for (let i = 0; i < ticks; i++) sent.push(b.tick(false));
  return sent;
}

describe("StopBurst: tin dừng khi nhả phím", () => {
  it("chưa từng gửi input di chuyển thì không gửi tin dừng (không có gì để dừng)", () => {
    const b = new StopBurst();
    expect(release(b).reduce((a, n) => a + n, 0)).toBe(0);
  });

  it("đang đi (frame true) không gửi gì; nhả thì gửi NGAY đúng một tin ở khung đầu tiên", () => {
    const b = new StopBurst();
    b.moved();
    expect(b.frame(true)).toBe(0);
    expect(b.frame(true)).toBe(0);
    expect(b.frame(false)).toBe(1); // khung đầu tiên sau lúc nhả: không chờ nhịp 20 Hz
    expect(b.frame(false)).toBe(0); // các khung sau không gửi thêm (phần lặp đi theo bước 50 ms)
  });

  it(`một lần nhả = đúng ${STOP_REPEATS} tin (1 ngay + ${STOP_REPEATS - 1} lặp ở các bước kế), rồi im`, () => {
    const b = new StopBurst();
    b.moved();
    const sent = release(b);
    expect(sent[0]).toBe(1);
    expect(sent.reduce((a, n) => a + n, 0)).toBe(STOP_REPEATS);
    expect(sent.slice(1, STOP_REPEATS)).toEqual(Array(STOP_REPEATS - 1).fill(1)); // hai bước liền sau
    expect(sent.slice(STOP_REPEATS).every((n) => n === 0)).toBe(true);
    // nhả tiếp không gửi lại
    expect(release(b).reduce((a, n) => a + n, 0)).toBe(0);
  });

  it("đi lại GIỮA CHỪNG huỷ phần lặp còn dở; nhả lần nữa mới gửi bộ tin mới", () => {
    const b = new StopBurst();
    b.moved();
    expect(b.frame(false)).toBe(1);
    expect(b.tick(false)).toBe(1); // lặp 1
    b.moved(); // đi lại (input di chuyển mới) trước khi lặp 2: huỷ ngay, kể cả khi không có tick "đang đi" nào chen vào
    expect(b.tick(false)).toBe(0); // phần lặp cũ đã bị huỷ
    // nhả lần hai: đủ một bộ mới
    const sent = release(b);
    expect(sent.reduce((a, n) => a + n, 0)).toBe(STOP_REPEATS);
  });

  it("đang lặp mà frame báo ĐI (active) cũng huỷ phần lặp", () => {
    const b = new StopBurst();
    b.moved();
    expect(b.frame(false)).toBe(1);
    expect(b.frame(true)).toBe(0);
    expect(b.tick(false)).toBe(0);
  });

  it("bấm quá ngắn (chưa tới bước nào để gửi input di chuyển) thì không gửi tin dừng", () => {
    const b = new StopBurst();
    expect(b.frame(true)).toBe(0);
    expect(b.frame(false)).toBe(0);
    expect(b.tick(false)).toBe(0);
  });

  it("reset (đang nối lại, Hoàng Tuyền, đã gục, đổi phòng) bỏ mọi tin dừng còn nợ", () => {
    const b = new StopBurst();
    b.moved();
    b.reset();
    expect(release(b).reduce((a, n) => a + n, 0)).toBe(0);
    b.moved();
    expect(b.frame(false)).toBe(1);
    b.reset();
    expect(b.tick(false)).toBe(0);
  });

  it("tuỳ chỉnh số lần lặp: 1 = chỉ tin ngay; 5 = ngay + 4 lặp", () => {
    const one = new StopBurst(1);
    one.moved();
    expect(release(one).reduce((a, n) => a + n, 0)).toBe(1);
    const five = new StopBurst(5);
    five.moved();
    expect(release(five, 20).reduce((a, n) => a + n, 0)).toBe(5);
  });
});
