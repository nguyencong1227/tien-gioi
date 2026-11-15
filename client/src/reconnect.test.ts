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

describe("runReconnect: lần thử THUA lỗi dứt khoát không được phá lần thắng (review B ở #705)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  // Đo trên server Colyseus thật: POST reconnect không "tiêu" token, nên hai lần thử song song cùng được nhận chỗ; lần vào sau bị
  // từ chối với "seat reservation expired." hoặc "reconnection token invalid or expired." (cả hai khớp `isFatal` của main.ts).
  const isFatal = (e: unknown) => String((e as Error)?.message ?? "").includes("expired");

  it("mạng chậm: lần thua (lỗi expired) về TRƯỚC lần thắng thì vẫn nối được, không gọi onLate", async () => {
    let n = 0;
    const attempt = vi.fn(
      () =>
        new Promise<string>((res, rej) => {
          n++;
          if (n === 1)
            setTimeout(() => res("phong-thang"), 3100); // lần 1 chậm nhưng sống
          else setTimeout(() => rej(new Error("reconnection token invalid or expired.")), 1000); // lần 2 mở lúc 2000 ms, lỗi lúc 3000 ms
        }),
    );
    const onLate = vi.fn();
    const r = runReconnect(base({ attempt, isFatal, onLate }));
    await vi.advanceTimersByTimeAsync(3200);
    await expect(r).resolves.toBe("phong-thang");
    expect(onLate).not.toHaveBeenCalled();
  });

  it("lỗi dứt khoát khi còn lần thử TREO MÃI: không mở lần mới, hết hạn tổng thì trả null", async () => {
    let n = 0;
    const attempt = vi.fn(() => {
      n++;
      return n === 1
        ? new Promise<string>(() => {})
        : Promise.reject(new Error("room has been disposed (expired)"));
    });
    const r = runReconnect(base({ attempt, isFatal, deadlineMs: 20000 }));
    let done = false;
    void r.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(2100); // lần 2 mở lúc 2000 ms và lỗi dứt khoát ngay
    expect(attempt).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10000);
    expect(done).toBe(false); // còn lần 1 đang chạy: chờ nó (có thể về muộn), không kết thúc sớm
    expect(attempt).toHaveBeenCalledTimes(2); // và không mở thêm lần nào sau lỗi dứt khoát
    await vi.advanceTimersByTimeAsync(8000);
    await expect(r).resolves.toBeNull();
  });

  it("lỗi dứt khoát khi một lần thử KHÁC sắp tới hạn treo: hạn treo đó không mở thêm lần mới", async () => {
    const first = deferred<string>();
    let n = 0;
    const attempt = vi.fn(() => (++n === 1 ? first.promise : new Promise<string>(() => {})));
    const r = runReconnect(base({ attempt, isFatal, deadlineMs: 20000 }));
    await vi.advanceTimersByTimeAsync(2100); // lần 2 mở lúc 2000 ms (treo), hạn treo của nó là 4000 ms
    first.reject(new Error("token expired")); // lần 1 dứt khoát lúc 2100 ms, lần 2 còn chạy nên vòng chưa kết thúc
    await vi.advanceTimersByTimeAsync(5000); // qua 4000 ms: hạn treo của lần 2 KHÔNG được mở lần 3
    expect(attempt).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20000);
    await expect(r).resolves.toBeNull();
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("lỗi dứt khoát ở lần thử CUỐI còn chạy thì kết thúc ngay (không đợi hết hạn)", async () => {
    const first = deferred<string>();
    let n = 0;
    const attempt = vi.fn(() =>
      ++n === 1 ? first.promise : Promise.reject(new Error("seat reservation expired.")),
    );
    const r = runReconnect(base({ attempt, isFatal, deadlineMs: 20000 }));
    await vi.advanceTimersByTimeAsync(2100); // lần 2 lỗi dứt khoát, lần 1 còn chạy
    let done = false;
    void r.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    first.reject(new Error("token expired")); // lần 1 cũng dứt khoát: hết lần thử đang chạy
    await expect(r).resolves.toBeNull();
  });
});
