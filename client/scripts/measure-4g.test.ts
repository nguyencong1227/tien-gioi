import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { median, NETWORK_PROFILES } from "./measure-4g.mjs";

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
  });
});
