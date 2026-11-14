// Cổng TCP trống cho test tích hợp có máy chủ Colyseus thật (`WorldRoom*.test.ts`, `*-stress.test.ts`).
// Trước đây mỗi tệp tự chọn `BASE + Math.random() * N` trong các khoảng CHỒNG NHAU và nằm giữa dải cổng tạm của Linux (32768-60999):
// vitest chạy các tệp song song nên thỉnh thoảng hai tệp (hoặc một kết nối ra của tệp khác) trùng cổng -> `EADDRINUSE` làm đỏ CI
// không do mã (sect-stress 12/11/2026, #376, #570). Nay hệ điều hành cấp cổng: bind cổng 0, đọc cổng thật, đóng, trả lại.
//
// Cải tiến #570:
// 1. Mặc định bind trên `::` (IPv6 wildcard, dual-stack) thay vì 127.0.0.1, khớp với hành vi mặc định của Colyseus Server.listen(port).
//    Tự động fallback về 127.0.0.1 nếu môi trường không hỗ trợ IPv6 (EAFNOSUPPORT / EADDRNOTAVAIL).
// 2. Cung cấp helper `listenWithRetry(server, maxRetries)`: tự động xin cổng mới và thử lại nếu vấp phải race condition EADDRINUSE.
import net from "node:net";

/**
 * Một cổng TCP đang trống do hệ điều hành cấp (bind cổng 0).
 * Mặc định probe trên `::` (khớp với Colyseus server.listen); tự động fallback về 127.0.0.1 nếu không có IPv6.
 */
export function freePort(host?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", (err: any) => {
      // Nếu host mặc định (::) không khả dụng trên môi trường, fallback về 127.0.0.1
      if (!host && (err?.code === "EAFNOSUPPORT" || err?.code === "EADDRNOTAVAIL")) {
        freePort("127.0.0.1").then(resolve, reject);
        return;
      }
      reject(err);
    });
    const targetHost = host ?? "::";
    srv.listen(0, targetHost, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) =>
        err || !port ? reject(err ?? new Error("không lấy được cổng")) : resolve(port),
      );
    });
  });
}

/**
 * Khởi động máy chủ Colyseus (hoặc đối tượng có phương thức .listen(port))
 * với cơ chế tự động thử lại khi gặp EADDRINUSE (M4 #376, #570).
 * Thử tối đa maxRetries lần (mặc định 5), mỗi lần xin freePort() mới.
 */
export async function listenWithRetry(
  server: { listen: (port: number) => Promise<any> },
  maxRetries = 5,
): Promise<number> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const port = await freePort();
    try {
      await server.listen(port);
      return port;
    } catch (err: any) {
      lastErr = err;
      if (
        err &&
        (err.code === "EADDRINUSE" || String(err?.message ?? err).includes("EADDRINUSE"))
      ) {
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error(`listenWithRetry: thất bại sau ${maxRetries} lần thử cổng`);
}
