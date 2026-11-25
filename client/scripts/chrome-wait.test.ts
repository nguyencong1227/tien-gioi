import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { START_WAIT_MS, waitPageTarget, waitUntilTrue } from "./chrome-wait.mjs";
import { freePort } from "./free-port.mjs";

const servers: http.Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

/** Máy chủ /json giả của Chrome: trả `body()` mỗi lần được hỏi */
async function fakeCdp(port: number, body: () => unknown) {
  const server = http.createServer((req, res) => {
    if (req.url !== "/json") {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body()));
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
}

describe("chrome-wait: chờ Chrome sẵn sàng cho check-*.mjs ở nightly (#1458)", () => {
  it("hạn chờ mặc định 60 s (mức A chốt ở #1389), không còn 6 s / 15 s của từng script", () => {
    expect(START_WAIT_MS).toBe(60000);
  });

  it("waitPageTarget: Chrome mở cổng MUỘN (sau 400 ms) vẫn lấy được page target", async () => {
    const port = await freePort();
    setTimeout(() => {
      void fakeCdp(port, () => [
        { type: "background_page", id: "b" },
        { type: "page", id: "p", webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/p" },
      ]);
    }, 400);
    const page = await waitPageTarget(port, 5000);
    expect(page?.id).toBe("p");
  });

  it("waitPageTarget: cổng mở nhưng page xuất hiện sau (danh sách rỗng lúc đầu) vẫn đợi", async () => {
    const port = await freePort();
    let calls = 0;
    await fakeCdp(port, () =>
      ++calls < 4
        ? []
        : [{ type: "page", id: "p2", webSocketDebuggerUrl: "ws://127.0.0.1:1/devtools/page/p2" }],
    );
    const page = await waitPageTarget(port, 5000);
    expect(page?.id).toBe("p2");
    expect(calls).toBeGreaterThanOrEqual(4);
  });

  it("waitPageTarget: JSON hỏng / không phải mảng không làm sập, hết hạn thì trả null", async () => {
    const port = await freePort();
    await fakeCdp(port, () => ({ khong: "phai mang" }));
    expect(await waitPageTarget(port, 500)).toBeNull();
  });

  it("waitPageTarget: không có Chrome nào (cổng đóng) hết hạn thì trả null, không treo", async () => {
    const port = await freePort();
    const t0 = Date.now();
    expect(await waitPageTarget(port, 600)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it("waitUntilTrue: đợi tới khi điều kiện đúng; hết hạn trả giá trị giả cuối", async () => {
    let n = 0;
    expect(await waitUntilTrue(async () => ++n >= 3, 3000, 20)).toBe(true);
    expect(n).toBe(3);
    expect(await waitUntilTrue(async () => false, 150, 20)).toBe(false);
  });
});
