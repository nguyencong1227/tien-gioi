// Cổng TCP trống cho các script Chrome / CDP (`check-*.mjs`, `snap-*.mjs`, `capture-viewports`, `leak-test`, `measure-mobile-perf`).
// Trước đây mỗi script tự chọn `BASE + Math.random() * N` trong các khoảng CHỒNG NHAU (vd 39700-39790 và 39800-39890 của hai script mới,
// 39800-40100 của check-combat-fx): hai script chạy cùng lúc (A review nhiều PR một lượt, CI) thỉnh thoảng trùng cổng và chết bằng
// "Không tìm thấy Chrome page target" (nit của A ở #451). Nay hệ điều hành cấp cổng, giống `freePort()` bên server (`server/src/test-port.ts`,
// #376): bind cổng 0, đọc cổng thật, đóng, trả lại. Còn một khe hở rất nhỏ giữa lúc đóng và lúc Chrome / máy chủ bind lại, nhưng hệ điều hành
// cấp các cổng khác nhau cho các lần gọi liên tiếp nên không còn trùng giữa các script.
import net from "node:net";

/** Một cổng TCP đang trống trên 127.0.0.1 (hệ điều hành cấp; các lần gọi liên tiếp / song song cho cổng khác nhau). */
export function freePort() {
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
