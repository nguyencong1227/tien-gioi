import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runReconnect, type ReconnectOptions } from "./reconnect";

/** Một lần thử mà ta tự quyết lúc nào xong (hoặc không bao giờ xong: socket keep-alive chết nuốt yêu cầu). */
function deferred<T>() {
  let resolve!: (v: T | null) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T | null>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const base = (over: Partial<ReconnectOptions<string>>): ReconnectOptions<string> => ({
  attempt: () => Promise.resolve(null),
  deadlineMs: 20000,
  stallMs: 2000,
  retryMs: 1500,
  isFatal: () => false,
  now: () => Date.now(),
  ...over,
});

describe("runReconnect: vòng nối lại không treo vì một lần thử treo (#694)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lần thử đầu thành công thì dừng ngay, không mở thêm lần nào", async () => {
    const attempt = vi.fn(() => Promise.resolve("phong-1"));
    const r = runReconnect(base({ attempt }));
    await expect(r).resolves.toBe("phong-1");
    await vi.advanceTimersByTimeAsync(30000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("lần thử đầu TREO MÃI (socket chết nuốt yêu cầu): sau stallMs mở lần thử mới và thành công", async () => {
    const calls: Array<ReturnType<typeof deferred<string>>> = [];
    const attempt = vi.fn(() => {
      const d = deferred<string>();
      calls.push(d);
      // Chỉ lần thứ 2 trở đi đi được (dùng kết nối mới)
      if (calls.length >= 2) d.resolve("phong-2");
      return d.promise;
    });
    const seconds: number[] = [];
    const r = runReconnect(base({ attempt, onAttempt: (s) => seconds.push(s) }));
    await vi.advanceTimersByTimeAsync(1999);
    expect(attempt).toHaveBeenCalledTimes(1); // chưa tới hạn treo
    await vi.advanceTimersByTimeAsync(2);
    await expect(r).resolves.toBe("phong-2");
    expect(attempt).toHaveBeenCalledTimes(2);
    // Banner được cập nhật ở mỗi lần thử (trước sửa: kẹt mãi "20 giây")
    expect(seconds).toEqual([20, 18]);
  });

  it("nhiều socket chết liên tiếp: lần thử thứ N mới đi được, vẫn xong trong hạn", async () => {
    let n = 0;
    const attempt = vi.fn(() => {
      n++;
      return n >= 4 ? Promise.resolve("phong-4") : new Promise<string>(() => {});
    });
    const r = runReconnect(base({ attempt }));
    await vi.advanceTimersByTimeAsync(3 * 2000 + 1);
    await expect(r).resolves.toBe("phong-4");
    expect(attempt).toHaveBeenCalledTimes(4);
  });

  it("lần thử CHẬM nhưng không chết: vẫn thắng dù lần song song mới chưa xong (không bỏ token)", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const queue = [first, second];
    const attempt = vi.fn(() => queue.shift()!.promise);
    const onLate = vi.fn();
    const r = runReconnect(base({ attempt, onLate }));
    await vi.advanceTimersByTimeAsync(2100); // đã mở lần 2
    expect(attempt).toHaveBeenCalledTimes(2);
    first.resolve("phong-cham");
    await expect(r).resolves.toBe("phong-cham");
    // Lần 2 về muộn sau khi đã có người thắng: giao cho onLate để đóng
    second.resolve("phong-thua");
    await vi.advanceTimersByTimeAsync(0);
    expect(onLate).toHaveBeenCalledWith("phong-thua");
  });

  it("lần thử thất bại (lỗi thường): nghỉ retryMs rồi thử lại", async () => {
    let n = 0;
    const attempt = vi.fn(() => {
      n++;
      return n === 1 ? Promise.reject(new Error("ECONNREFUSED")) : Promise.resolve("phong-2");
    });
    const r = runReconnect(base({ attempt }));
    await vi.advanceTimersByTimeAsync(1499);
    expect(attempt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    await expect(r).resolves.toBe("phong-2");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("lần thử trả null (chưa được): cũng thử lại", async () => {
    let n = 0;
    const attempt = vi.fn(() => Promise.resolve(++n === 1 ? null : "phong-2"));
    const r = runReconnect(base({ attempt }));
    await vi.advanceTimersByTimeAsync(1600);
    await expect(r).resolves.toBe("phong-2");
  });

  it("lỗi dứt khoát (token hết hạn): dừng cả vòng, không thử thêm", async () => {
    const attempt = vi.fn(() => Promise.reject(new Error("reconnection token expired")));
    const r = runReconnect(base({ attempt, isFatal: (e) => String(e).includes("expired") }));
    await expect(r).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(30000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("mọi lần thử đều treo: hết hạn tổng thì trả null đúng hạn, không treo", async () => {
    const attempt = vi.fn(() => new Promise<string>(() => {}));
    const r = runReconnect(base({ attempt, deadlineMs: 20000 }));
    let done = false;
    void r.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(19999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await expect(r).resolves.toBeNull();
    // Không mở thêm lần thử nào sau hạn
    const calls = attempt.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30000);
    expect(attempt).toHaveBeenCalledTimes(calls);
  });

  it("phòng về MUỘN sau khi hết hạn tổng: giao cho onLate để đóng", async () => {
    const d = deferred<string>();
    const onLate = vi.fn();
    const r = runReconnect(base({ attempt: () => d.promise, onLate, deadlineMs: 5000 }));
    await vi.advanceTimersByTimeAsync(5001);
    await expect(r).resolves.toBeNull();
    d.resolve("phong-muon");
    await vi.advanceTimersByTimeAsync(0);
    expect(onLate).toHaveBeenCalledWith("phong-muon");
  });

  it("giới hạn số lần thử đồng thời (maxInflight): không mở vô hạn lần thử treo", async () => {
    const attempt = vi.fn(() => new Promise<string>(() => {}));
    const r = runReconnect(base({ attempt, maxInflight: 3, deadlineMs: 20000 }));
    await vi.advanceTimersByTimeAsync(19000);
    expect(attempt).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(r).resolves.toBeNull();
  });

  it("attempt ném lỗi đồng bộ: coi như một lần thất bại, không làm sập vòng", async () => {
    let n = 0;
    const attempt = vi.fn((): Promise<string> => {
      if (++n === 1) throw new Error("boom");
      return Promise.resolve("phong-2");
    });
    const r = runReconnect(base({ attempt }));
    await vi.advanceTimersByTimeAsync(1600);
    await expect(r).resolves.toBe("phong-2");
  });
});
