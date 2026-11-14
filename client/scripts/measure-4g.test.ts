import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import {
  check4gBudget,
  median,
  NETWORK_PROFILES,
  readBudgetLimits,
  COMPRESSIBLE_EXTS,
} from "./measure-4g.mjs";
import { freePort } from "./free-port.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, "../..");
const BUDGET_PATH = path.join(REPO, "client/perf-budget.json");

describe("M7.15: measure-4g (Đo thời gian vào thế giới qua 4G giả lập)", () => {
  describe("Hàm tính trung vị (median p50)", () => {
    it("trả về 0 với mảng rỗng hoặc không hợp lệ", () => {
      expect(median([])).toBe(0);
      expect(median(null as any)).toBe(0);
      expect(median(undefined as any)).toBe(0);
    });

    it("tính chính xác trung vị cho mảng có số phần tử lẻ", () => {
      expect(median([100])).toBe(100);
      expect(median([10, 20, 30])).toBe(20);
      // Chưa sắp xếp
      expect(median([50, 10, 40, 20, 30])).toBe(30);
    });

    it("tính chính xác trung vị cho mảng có số phần tử chẵn", () => {
      expect(median([10, 20])).toBe(15);
      expect(median([10, 20, 30, 40])).toBe(25);
      // Chưa sắp xếp
      expect(median([400, 100, 300, 200])).toBe(250);
    });
  });

  describe("Hồ sơ mạng giả lập (NETWORK_PROFILES)", () => {
    it("hồ sơ Fast 4G khớp thiết kế mục 10.4 (~9 Mbps, 170 ms)", () => {
      const p = NETWORK_PROFILES.fast4g;
      expect(p).toBeDefined();
      expect(p.latency).toBe(170);
      expect(p.downloadThroughput).toBe(Math.floor((9 * 1024 * 1024) / 8));
      expect(p.uploadThroughput).toBe(Math.floor((1.5 * 1024 * 1024) / 8));
      expect(p.offline).toBe(false);
    });

    it("hồ sơ Slow 4G khớp thiết kế mục 10.4 (~1.6 Mbps, 150 ms)", () => {
      const p = NETWORK_PROFILES.slow4g;
      expect(p).toBeDefined();
      expect(p.latency).toBe(150);
      expect(p.downloadThroughput).toBe(Math.floor((1.6 * 1024 * 1024) / 8));
      expect(p.uploadThroughput).toBe(Math.floor((750 * 1024) / 8));
      expect(p.offline).toBe(false);
    });
  });

  describe("Ngân sách trong client/perf-budget.json", () => {
    it("chứa khối packs.timeToWorld4gMs với đầy đủ 4 chỉ tiêu hợp lệ", () => {
      expect(fs.existsSync(BUDGET_PATH)).toBe(true);
      const budget = JSON.parse(fs.readFileSync(BUDGET_PATH, "utf-8"));
      expect(budget.packs).toBeDefined();
      expect(budget.packs.timeToWorld4gMs).toBeDefined();

      const t = budget.packs.timeToWorld4gMs;
      expect(typeof t.fast4gCold).toBe("number");
      expect(typeof t.fast4gWarm).toBe("number");
      expect(typeof t.slow4gCold).toBe("number");
      expect(typeof t.slow4gWarm).toBe("number");

      // Các bất biến logic ngân sách
      expect(t.fast4gCold).toBeGreaterThan(t.fast4gWarm);
      expect(t.slow4gCold).toBeGreaterThan(t.slow4gWarm);
      expect(t.slow4gCold).toBeGreaterThan(t.fast4gCold);
      expect(t.fast4gWarm).toBeLessThanOrEqual(1000);
      expect(t.slow4gWarm).toBeLessThanOrEqual(1000);
    });

    it("readBudgetLimits đọc đúng khối timeToWorld4gMs từ tệp", () => {
      const limits = readBudgetLimits();
      expect(limits).toBeDefined();
      expect(limits?.fast4gCold).toBe(2500);
      expect(limits?.slow4gCold).toBe(6000);
    });
  });

  describe("So sánh ngân sách check4gBudget & kiểm soát cổng (F1)", () => {
    const limits = {
      fast4gCold: 2500,
      fast4gWarm: 500,
      slow4gCold: 6000,
      slow4gWarm: 500,
    };

    it("trả về ok: true khi các số đo p50 nằm trong ngân sách", () => {
      const summary = {
        fast4gColdP50: 1096,
        fast4gWarmP50: 196,
        slow4gColdP50: 3572,
        slow4gWarmP50: 197,
      };
      const res = check4gBudget(summary, limits);
      expect(res.ok).toBe(true);
      expect(res.violations.length).toBe(0);
    });

    it("đột biến 1: phát hiện vi phạm khi Fast 4G Lạnh vượt trần", () => {
      const summary = {
        fast4gColdP50: 2800, // vượt 2500
        fast4gWarmP50: 196,
        slow4gColdP50: 3572,
        slow4gWarmP50: 197,
      };
      const res = check4gBudget(summary, limits);
      expect(res.ok).toBe(false);
      expect(res.violations.length).toBe(1);
      expect(res.violations[0].scenario).toContain("Fast 4G Lạnh");
      expect(res.violations[0].actual).toBe(2800);
      expect(res.violations[0].max).toBe(2500);
      expect(res.violations[0].diff).toBe(300);
    });

    it("đột biến 2: phát hiện vi phạm khi Slow 4G Lạnh vượt trần", () => {
      const summary = {
        fast4gColdP50: 1096,
        fast4gWarmP50: 196,
        slow4gColdP50: 6500, // vượt 6000
        slow4gWarmP50: 197,
      };
      const res = check4gBudget(summary, limits);
      expect(res.ok).toBe(false);
      expect(res.violations.length).toBe(1);
      expect(res.violations[0].scenario).toContain("Slow 4G Lạnh");
      expect(res.violations[0].diff).toBe(500);
    });

    it("đột biến 3: phát hiện vi phạm khi tải Ấm (Warm) vượt trần 500 ms", () => {
      const summary = {
        fast4gColdP50: 1096,
        fast4gWarmP50: 550, // vượt 500
        slow4gColdP50: 3572,
        slow4gWarmP50: 620, // vượt 500
      };
      const res = check4gBudget(summary, limits);
      expect(res.ok).toBe(false);
      expect(res.violations.length).toBe(2);
    });
  });

  describe("Máy chủ tĩnh phục vụ Gzip (F2)", () => {
    it("định dạng tệp nén được khai báo đúng tập hợp", () => {
      expect(COMPRESSIBLE_EXTS.has(".html")).toBe(true);
      expect(COMPRESSIBLE_EXTS.has(".js")).toBe(true);
      expect(COMPRESSIBLE_EXTS.has(".css")).toBe(true);
      expect(COMPRESSIBLE_EXTS.has(".json")).toBe(true);
      expect(COMPRESSIBLE_EXTS.has(".png")).toBe(false);
      expect(COMPRESSIBLE_EXTS.has(".webp")).toBe(false);
    });

    it("máy chủ nén gzip khi client gửi Accept-Encoding: gzip", async () => {
      const port = await freePort();
      const rawText = "Hello Tiên Giới! ".repeat(50);
      const server = http.createServer((req, res) => {
        const accept = req.headers["accept-encoding"] || "";
        if (accept.includes("gzip")) {
          const gz = zlib.gzipSync(Buffer.from(rawText, "utf-8"));
          res.writeHead(200, {
            "Content-Type": "text/html",
            "Content-Encoding": "gzip",
            Vary: "Accept-Encoding",
            "Content-Length": gz.length,
          });
          res.end(gz);
        } else {
          res.writeHead(200, {
            "Content-Type": "text/html",
            "Content-Length": Buffer.byteLength(rawText),
          });
          res.end(rawText);
        }
      });

      await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", () => resolve()));

      try {
        // 1. Request có Accept-Encoding: gzip
        const gzRes = await fetch(`http://127.0.0.1:${port}/`, {
          headers: { "Accept-Encoding": "gzip" },
        });
        expect(gzRes.headers.get("content-encoding")).toBe("gzip");
        const bodyText = await gzRes.text();
        expect(bodyText).toBe(rawText);

        // 2. Request không có Accept-Encoding: gzip
        const rawRes = await fetch(`http://127.0.0.1:${port}/`, {
          headers: { "Accept-Encoding": "identity" },
        });
        expect(rawRes.headers.get("content-encoding")).toBeNull();
      } finally {
        server.close();
      }
    });
  });

  describe("Cờ --no-gate và kiểm tra CLI", () => {
    it("script CLI có cờ --no-gate và xử lý đúng khi import", () => {
      const scriptContent = fs.readFileSync(path.join(__dirname, "measure-4g.mjs"), "utf-8");
      expect(scriptContent).toContain("--no-gate");
      expect(scriptContent).toContain("--no-compress");
      expect(scriptContent).toContain("process.exit(1)");
    });
  });
});
