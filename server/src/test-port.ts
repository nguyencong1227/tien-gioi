// Cổng TCP trống cho test tích hợp có máy chủ Colyseus thật (`WorldRoom*.test.ts`, `*-stress.test.ts`).
// Trước đây mỗi tệp tự chọn `BASE + Math.random() * N` trong các khoảng CHỒNG NHAU và nằm giữa dải cổng tạm của Linux (32768-60999):
// vitest chạy các tệp song song nên thỉnh thoảng hai tệp (hoặc một kết nối ra của tệp khác) trùng cổng -> `EADDRINUSE` làm đỏ CI
// không do mã (sect-stress 12/11/2026, #376). Nay hệ điều hành cấp cổng: bind cổng 0, đọc cổng thật, đóng, trả lại.
import net from "node:net";

/** Một cổng TCP đang trống trên 127.0.0.1 (hệ điều hành cấp, các lần gọi liên tiếp / song song cho cổng khác nhau). */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) =>
        err || !port ? reject(err ?? new Error("không lấy được cổng")) : resolve(port),
      );
    });
  });
}
