import { describe, expect, it } from "vitest";
import {
  extractLastLines,
  filterScripts,
  formatFailureDetails,
  formatResultTable,
  getE2eScripts,
  parseCliArgs,
  type ScriptResult,
} from "./e2e-all.js";

describe("e2e:all - Bộ chạy toàn diện E2E (M7.16, Issue #694)", () => {
  describe("getE2eScripts", () => {
    it("đọc đúng danh sách script bắt đầu bằng e2e và loại trừ e2e:all / e2e-all", () => {
      const mockPkg = {
        scripts: {
          dev: "tsx watch src/index.ts",
          start: "tsx src/index.ts",
          e2e: "tsx scripts/e2e.ts",
          "e2e:tai-khoan": "tsx scripts/e2e-account.ts",
          "e2e:noi-lai": "tsx scripts/e2e-noi-lai.ts",
          "e2e:all": "tsx scripts/e2e-all.ts",
          "e2e-all": "tsx scripts/e2e-all.ts",
          "shot:layout": "tsx scripts/shot-layout.ts",
          soak: "tsx scripts/soak.ts",
        },
      };

      const scripts = getE2eScripts(mockPkg);
      expect(scripts).toEqual(["e2e", "e2e:tai-khoan", "e2e:noi-lai"]);
      expect(scripts).not.toContain("e2e:all");
      expect(scripts).not.toContain("e2e-all");
      expect(scripts).not.toContain("shot:layout");
    });
  });

  describe("filterScripts", () => {
    const all = [
      "e2e",
      "e2e:tai-khoan",
      "e2e:bi-canh",
      "e2e:pk",
      "e2e:noi-lai",
      "e2e:chat-luong",
      "e2e:map",
    ];

    it("giữ nguyên nếu không có cờ only và skip", () => {
      const { selected, skipped } = filterScripts(all, {});
      expect(selected).toEqual(all);
      expect(skipped).toHaveLength(0);
    });

    it("lọc chính xác theo --only (hỗ trợ cả hậu tố hoặc chuỗi con)", () => {
      const { selected, skipped } = filterScripts(all, { only: ["noi-lai", "chat-luong"] });
      expect(selected).toEqual(["e2e:noi-lai", "e2e:chat-luong"]);
      expect(skipped).toHaveLength(0);
    });

    it("lọc bỏ qua theo --skip", () => {
      const { selected, skipped } = filterScripts(all, { skip: ["map", "pk"] });
      expect(selected).toEqual([
        "e2e",
        "e2e:tai-khoan",
        "e2e:bi-canh",
        "e2e:noi-lai",
        "e2e:chat-luong",
      ]);
      expect(skipped).toEqual(["e2e:pk", "e2e:map"]);
    });

    it("kết hợp cả --only và --skip", () => {
      const { selected, skipped } = filterScripts(all, {
        only: ["bi-canh", "noi-lai", "chat-luong"],
        skip: ["noi-lai"],
      });
      expect(selected).toEqual(["e2e:bi-canh", "e2e:chat-luong"]);
      expect(skipped).toEqual(["e2e:noi-lai"]);
    });
  });

  describe("parseCliArgs", () => {
    it("phân tích các cờ dòng lệnh CLI chuẩn", () => {
      const opts = parseCliArgs([
        "--only",
        "noi-lai,chat-luong",
        "--skip",
        "map",
        "--timeout",
        "120",
        "--logs",
        "/tmp/custom-logs",
        "--build",
        "--dry-run",
      ]);

      expect(opts.only).toEqual(["noi-lai", "chat-luong"]);
      expect(opts.skip).toEqual(["map"]);
      expect(opts.timeoutSec).toBe(120);
      expect(opts.logsDir).toBe("/tmp/custom-logs");
      expect(opts.build).toBe(true);
      expect(opts.dryRun).toBe(true);
      expect(opts.retry).toBe(true);
    });

    it("hỗ trợ cờ dạng --key=val và cờ tắt -o, -s, -t", () => {
      const opts = parseCliArgs(["-o", "pk", "-s", "dpr", "-t", "90", "--no-retry"]);

      expect(opts.only).toEqual(["pk"]);
      expect(opts.skip).toEqual(["dpr"]);
      expect(opts.timeoutSec).toBe(90);
      expect(opts.retry).toBe(false);
    });
  });

  describe("extractLastLines", () => {
    it("trích xuất tối đa n dòng cuối không rỗng", () => {
      const text = `
        Dòng 1
        Dòng 2
        Dòng 3
        Dòng 4
        Dòng 5
        Dòng 6
        Dòng 7
      `;
      const lines = extractLastLines(text, 3);
      expect(lines).toEqual(["Dòng 5", "Dòng 6", "Dòng 7"]);
    });

    it("trả về toàn bộ dòng nếu số dòng ít hơn count", () => {
      const text = "Lỗi A\nLỗi B";
      expect(extractLastLines(text, 5)).toEqual(["Lỗi A", "Lỗi B"]);
    });
  });

  describe("formatResultTable & formatFailureDetails", () => {
    const results: ScriptResult[] = [
      {
        script: "e2e",
        status: "XANH",
        durationSec: 5.2,
        attempts: 1,
      },
      {
        script: "e2e:noi-lai",
        status: "FLAKY",
        durationSec: 12.4,
        attempts: 2,
        note: "Thành công ở lần thử lại",
      },
      {
        script: "e2e:bi-canh",
        status: "ĐỎ",
        durationSec: 8.1,
        attempts: 2,
        note: "Mã thoát 1",
        logPath: "/tmp/e2e-bi-canh.log",
        lastLines: ["Error: Không tìm thấy quái", "at main (e2e-bi-canh.ts:100)"],
      },
      {
        script: "e2e:map",
        status: "BỎ QUA",
        durationSec: 0,
        attempts: 0,
        note: "Bỏ qua theo --skip",
      },
    ];

    it("tạo bảng Markdown đúng cấu trúc, có dòng tóm tắt", () => {
      const table = formatResultTable(results);
      expect(table).toContain("| STT | Script | Kết quả | Thời gian | Lần chạy | Ghi chú |");
      expect(table).toContain("| 1 | `e2e` | ✓ XANH | 5.2s | 1 |  |");
      expect(table).toContain(
        "| 2 | `e2e:noi-lai` | ⚠️ FLAKY | 12.4s | 2 | Thành công ở lần thử lại |",
      );
      expect(table).toContain("| 3 | `e2e:bi-canh` | ❌ ĐỎ | 8.1s | 2 | Mã thoát 1 |");
      expect(table).toContain("| 4 | `e2e:map` | ⏭ BỎ QUA | - | - | Bỏ qua theo --skip |");
      expect(table).toContain(
        "**Tổng kết:** 4 script | ✓ **Xanh:** 1 | ⚠️ **Flaky:** 1 | ❌ **Đỏ:** 1 | ⏭ **Bỏ qua:** 1 | ⏱ **Tổng thời gian:** 25.7s",
      );
    });

    it("tạo phần chi tiết lỗi trích dẫn dòng log của script ĐỎ", () => {
      const details = formatFailureDetails(results);
      expect(details).toContain("### Chi tiết lỗi (ĐỎ):");
      expect(details).toContain("#### ❌ `e2e:bi-canh` (log: `/tmp/e2e-bi-canh.log`)");
      expect(details).toContain("Error: Không tìm thấy quái");
      expect(details).toContain("at main (e2e-bi-canh.ts:100)");
      expect(details).not.toContain("`e2e:noi-lai`");
    });
  });
});
