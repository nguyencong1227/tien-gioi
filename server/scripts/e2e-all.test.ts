import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanupNewTmpEntries,
  executeScriptOnce,
  extractLastLines,
  filterScripts,
  findDescendantPgids,
  formatFailureDetails,
  formatResultTable,
  getE2eScripts,
  getE2eTmpEntries,
  parseCliArgs,
  runE2eAll,
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

  describe("findDescendantPgids (Duyệt cây tiến trình con cháu)", () => {
    it("phân tích chuỗi ps mẫu và tìm chính xác các pgid con cháu của rootPid", () => {
      const mockPsOutput = `
         PID   PPID   PGID
           1      0      1
          50      1     50
         100     50    100
         200    100    200
         201    200    200
         202    201    300
         301    202    300
         302    301    400
         500      1    500
         501    500    600
      `;

      // Giả sử runner đang chạy ở PID 100 (selfPids = {100})
      // rootPid là 200 (tiến trình script npm/tsx)
      // Con cháu của 200:
      //   - 201 (con của 200, pgid 200) -> pgid === rootPid nên bỏ qua
      //   - 202 (con của 201, pgid 300) -> pgid 300 (nhóm Chrome)
      //   - 301 (con của 202, pgid 300) -> pgid 300
      //   - 302 (con của 301, pgid 400) -> pgid 400 (nhóm renderer/gpu)
      // Tiến trình 500, 501 không thuộc nhánh 200
      const selfPids = new Set([100]);
      const pgids = findDescendantPgids(mockPsOutput, 200, selfPids);

      expect(pgids.sort()).toEqual([300, 400]);
    });

    it("loại trừ các pgid thuộc selfPids để không bao giờ tự kill runner", () => {
      const mockPsOutput = `
         PID   PPID   PGID
         100      1    100
         200    100    200
         201    200    100
      `;
      const selfPids = new Set([100]);
      const pgids = findDescendantPgids(mockPsOutput, 200, selfPids);
      expect(pgids).toEqual([]);
    });
  });

  describe("filterScripts (Ưu tiên khớp chính xác trước khi rơi về chuỗi con)", () => {
    const all = [
      "e2e",
      "e2e:tai-khoan",
      "e2e:bi-canh",
      "e2e:pk",
      "e2e:ban",
      "e2e:ban-phim",
      "e2e:noi-lai",
      "e2e:chat-luong",
      "e2e:map",
    ];

    it("giữ nguyên nếu không có cờ only và skip", () => {
      const { selected, skipped } = filterScripts(all, {});
      expect(selected).toEqual(all);
      expect(skipped).toHaveLength(0);
    });

    it("ưu tiên khớp chính xác: --only ban chỉ lấy e2e:ban, không lấy e2e:ban-phim", () => {
      const { selected, skipped } = filterScripts(all, { only: ["ban"] });
      expect(selected).toEqual(["e2e:ban"]);
      expect(skipped).toHaveLength(0);
    });

    it("ưu tiên khớp chính xác: --skip ban chỉ bỏ e2e:ban, giữ nguyên e2e:ban-phim", () => {
      const { selected, skipped } = filterScripts(all, { skip: ["ban"] });
      expect(selected).toContain("e2e:ban-phim");
      expect(selected).not.toContain("e2e:ban");
      expect(skipped).toEqual(["e2e:ban"]);
    });

    it("rơi về chuỗi con khi không có khớp chính xác: --only chat lấy e2e:chat-luong", () => {
      const { selected } = filterScripts(all, { only: ["chat"] });
      expect(selected).toEqual(["e2e:chat-luong"]);
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

  describe("dry-run không tạo thư mục logs", () => {
    it("--dry-run không tạo thư mục log trên đĩa", async () => {
      const nonExistentDir = path.join(os.tmpdir(), `tien-gioi-test-dryrun-${Date.now()}`);
      expect(existsSync(nonExistentDir)).toBe(false);

      const code = await runE2eAll(["--dry-run", "--logs", nonExistentDir]);
      expect(code).toBe(0);
      expect(existsSync(nonExistentDir)).toBe(false);
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

  describe("executeScriptOnce và dọn dẹp tiến trình con detached khi timeout", () => {
    it("khi timeout xảy ra, toàn bộ tiến trình con cháu (kể cả detached: true) bị tiêu diệt sạch sẽ", async () => {
      const marker = `tg_test_marker_${Date.now()}`;
      const logFile = path.join(os.tmpdir(), `${marker}.log`);

      // Script giả lập: cha spawn con với detached: true (nhóm riêng giống Chrome), rồi cả hai cùng ngủ
      const scriptCode = `
        const { spawn } = require('child_process');
        const child = spawn('node', ['-e', 'process.title = "${marker}"; setInterval(() => {}, 1000);'], {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
        setInterval(() => {}, 1000);
      `;

      const result = await executeScriptOnce("mock-timeout-test", {
        cwd: process.cwd(),
        timeoutSec: 0.4, // timeout sau 400ms
        logFile,
        attempt: 1,
        command: { cmd: "node", args: ["-e", scriptCode] },
        graceMs: 100,
      });

      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(124);

      // Chờ thêm một nhịp ngắn để hệ điều hành hoàn tất thu hồi tiến trình
      await new Promise((r) => setTimeout(r, 200));

      // Kiểm tra trong danh sách tiến trình của máy: không còn tiến trình nào có marker
      const psCheck = execSync("ps -eo pid=,args=", { encoding: "utf-8" });
      expect(psCheck).not.toContain(marker);

      try {
        if (existsSync(logFile)) rmSync(logFile);
      } catch {
        // Bỏ qua lỗi dọn file log test
      }
    });

    it("khi timeout xảy ra, các thư mục tạm tien-gioi-e2e-* hoặc tg-* mới sinh ra bị tự động xoá sạch", async () => {
      const marker = `tg_tmp_clean_${Date.now()}`;
      const logFile = path.join(os.tmpdir(), `${marker}.log`);
      const testTmpFolder = path.join(os.tmpdir(), `tien-gioi-e2e-timeout-leak-${Date.now()}`);

      // Script tạo thư mục tạm trong os.tmpdir() rồi ngủ để bị timeout
      const scriptCode = `
        const fs = require('fs');
        fs.mkdirSync(${JSON.stringify(testTmpFolder)}, { recursive: true });
        setInterval(() => {}, 1000);
      `;

      const result = await executeScriptOnce("mock-timeout-tmp-cleanup", {
        cwd: process.cwd(),
        timeoutSec: 0.4,
        logFile,
        attempt: 1,
        command: { cmd: "node", args: ["-e", scriptCode] },
        graceMs: 100,
      });

      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(124);
      expect(result.log).toContain("[CLEANUP] Đã dọn dẹp");

      // Thư mục testTmpFolder phải được tự động dọn dẹp sạch sẽ
      expect(existsSync(testTmpFolder)).toBe(false);

      try {
        if (existsSync(logFile)) rmSync(logFile);
      } catch {
        // Bỏ qua lỗi dọn file log test
      }
    });
  });

  describe("getE2eTmpEntries & cleanupNewTmpEntries (Dọn thư mục tạm sót lại sau timeout)", () => {
    it("chỉ phát hiện và dọn các mục mới sinh ra có tiền tố tien-gioi-e2e- hoặc tg-", () => {
      const testRoot = path.join(os.tmpdir(), `tg-test-suite-${Date.now()}`);
      mkdirSync(testRoot, { recursive: true });

      const oldE2e = path.join(testRoot, "tien-gioi-e2e-old-folder");
      const otherFile = path.join(testRoot, "other-app-file");
      mkdirSync(oldE2e, { recursive: true });
      mkdirSync(otherFile, { recursive: true });

      // Chụp snapshot trước khi chạy
      const before = getE2eTmpEntries(testRoot);
      expect(before.has("tien-gioi-e2e-old-folder")).toBe(true);
      expect(before.has("other-app-file")).toBe(false);

      // Sinh mục mới trong lúc chạy
      const newE2e1 = path.join(testRoot, "tien-gioi-e2e-chrome-leak");
      const newE2e2 = path.join(testRoot, "tg-data-leak");
      const newOther = path.join(testRoot, "unrelated-folder");
      const runnerLog = path.join(testRoot, "tien-gioi-e2e-runner-logs");

      mkdirSync(newE2e1, { recursive: true });
      mkdirSync(newE2e2, { recursive: true });
      mkdirSync(newOther, { recursive: true });
      mkdirSync(runnerLog, { recursive: true });

      // Gọi cleanup với excludeDir là runnerLog
      const cleaned = cleanupNewTmpEntries(before, runnerLog, testRoot);

      expect(cleaned.sort()).toEqual(["tg-data-leak", "tien-gioi-e2e-chrome-leak"]);
      expect(existsSync(newE2e1)).toBe(false);
      expect(existsSync(newE2e2)).toBe(false);
      expect(existsSync(oldE2e)).toBe(true); // mục cũ không bị xoá
      expect(existsSync(newOther)).toBe(true); // mục khác không bị xoá
      expect(existsSync(runnerLog)).toBe(true); // thư mục logs không bị xoá

      // Dọn dẹp testRoot
      try {
        rmSync(testRoot, { recursive: true, force: true });
      } catch {
        // Bỏ qua
      }
    });
  });
});
