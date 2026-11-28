import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  executeScriptOnce,
  extractLastLines,
  filterScripts,
  findDescendantPgids,
  formatFailureDetails,
  formatResultTable,
  getE2eScripts,
  parseCliArgs,
  parseShard,
  retryAllowed,
  RETRY_MAX_TIMEOUT_SEC,
  runE2eAll,
  SCRIPT_TIMEOUT_SEC,
  shardScripts,
  timeoutSecFor,
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

    it("server/package.json thật chứa đúng e2e:inv-select và e2e:move-keys (#1386)", () => {
      const realPkgPath = path.resolve(__dirname, "../package.json");
      const realPkg = JSON.parse(readFileSync(realPkgPath, "utf-8"));
      const scripts = getE2eScripts(realPkg);
      expect(scripts).toContain("e2e:inv-select");
      expect(scripts).toContain("e2e:move-keys");
      expect(scripts.length).toBeGreaterThanOrEqual(61);
    });

    it("server/package.json thật nối đủ 30 check-* (lô đầu + act-confirm + sect-confirm + sect-vault nối lại ở #1477 + map-zoom + map-card + map-style + map-visual + minimap-zone + chat-title + quick-labels + bag-names + rarity + chuot-thap + newbie-guide + book-bag + status-speed + tap-hold + hud + equip-six + skill-book + skill-touch) vào nightly (#1458), mỗi dòng trỏ tới tệp check-<tên>.mjs có thật", () => {
      const realPkg = JSON.parse(readFileSync(path.resolve(__dirname, "../package.json"), "utf-8"));
      const batch = [
        "skills-panel",
        "social-shell",
        "sect-hall",
        "shop-qty",
        "forge-shop",
        "quest-log",
        "quest-reward",
        "quest-ready",
        "text-size",
        "act-confirm",
        "sect-confirm",
        "sect-vault",
        "map-zoom",
        "map-card",
        "map-style",
        "map-visual",
        "minimap-zone",
        "chat-title",
        "quick-labels",
        "bag-names",
        "rarity",
        "chuot-thap",
        "skill-touch",
        "newbie-guide",
        "book-bag",
        "status-speed",
        "tap-hold",
        "hud",
        "equip-six",
        "skill-book",
      ];
      for (const n of batch) {
        expect(realPkg.scripts[`e2e:${n}`], `thiếu e2e:${n}`).toBe(
          `node ../client/scripts/check-${n}.mjs`,
        );
        expect(
          existsSync(path.resolve(__dirname, `../../client/scripts/check-${n}.mjs`)),
          `thiếu client/scripts/check-${n}.mjs`,
        ).toBe(true);
      }
    });
  });

  describe("timeoutSecFor (hạn chờ riêng cho kịch bản chậm, #1458)", () => {
    it("lấy max(hạn chung, hạn riêng): kịch bản chậm không bị cắt bởi --timeout nhỏ, hạn chung lớn hơn vẫn thắng", () => {
      expect(timeoutSecFor("e2e:social-shell", 300)).toBe(SCRIPT_TIMEOUT_SEC["e2e:social-shell"]);
      expect(SCRIPT_TIMEOUT_SEC["e2e:social-shell"]).toBeGreaterThan(300);
      expect(timeoutSecFor("e2e:social-shell", 5000)).toBe(5000);
    });

    it("kịch bản không có hạn riêng (kể cả tên lạ như constructor) dùng hạn chung, không ra NaN", () => {
      expect(timeoutSecFor("e2e:ban-phim", 300)).toBe(300);
      expect(timeoutSecFor("constructor", 300)).toBe(300);
      expect(timeoutSecFor("toString", 300)).toBe(300);
    });

    it("retryAllowed: kịch bản có hạn chờ thực > 600 s (social-shell) KHÔNG thử lại; còn lại thử lại như cũ", () => {
      expect(RETRY_MAX_TIMEOUT_SEC).toBe(600);
      expect(retryAllowed("e2e:social-shell", 300)).toBe(false);
      expect(retryAllowed("e2e:ban-phim", 300)).toBe(true);
      expect(retryAllowed("e2e:sect-hall", 300)).toBe(true); // sàn 500 s <= 600 s
      expect(timeoutSecFor("e2e:chuyen-canh", 300)).toBe(480);
      expect(timeoutSecFor("e2e:inv-select", 300)).toBe(480);
      expect(retryAllowed("e2e:chuyen-canh", 300)).toBe(true); // sàn 480 s <= 600 s (#1501)
      expect(retryAllowed("e2e:inv-select", 300)).toBe(true); // sàn 480 s <= 600 s (#1501)
      expect(timeoutSecFor("e2e:hud", 300)).toBe(360); // CI đo tới 103,8 s: 3 x = 311 s > 300 (#1522)
      expect(retryAllowed("e2e:hud", 300)).toBe(true); // sàn 360 s <= 600 s
      expect(timeoutSecFor("e2e:skill-touch", 300)).toBe(420); // CI đo tới 138,3 s: 3 x = 415 s > 300 (#1524)
      expect(retryAllowed("e2e:skill-touch", 300)).toBe(true); // sàn 420 s <= 600 s
      expect(timeoutSecFor("e2e:shop-qty", 300)).toBe(540); // CI đo tới 162,6 s: 3 x = 488 s > 300 (#1530, #1532)
      expect(retryAllowed("e2e:shop-qty", 300)).toBe(true); // sàn 540 s <= 600 s
      expect(timeoutSecFor("e2e:skills-panel", 300)).toBe(360); // CI đo tới 106,7 s: 3 x = 320 s > 300 (#1532)
      expect(retryAllowed("e2e:skills-panel", 300)).toBe(true); // sàn 360 s <= 600 s
      // --timeout chung lớn hơn 600 s cũng làm mọi kịch bản không được thử lại (chống treo + thử lại ăn hết timeout-minutes)
      expect(retryAllowed("e2e:ban-phim", 900)).toBe(false);
    });

    it("không script nào có sàn <= 300 s (thừa) và mọi sàn <= 900 s (thống nhất A + C ở #1458: treo không ăn quá 15 phút của timeout-minutes 30 của shard)", () => {
      for (const [k, v] of Object.entries(SCRIPT_TIMEOUT_SEC)) {
        expect(v, `${k} sàn thừa (<= --timeout mặc định 300 s)`).toBeGreaterThan(300);
        expect(v, `${k} sàn quá lớn`).toBeLessThanOrEqual(900);
      }
    });

    it("mọi khoá trong SCRIPT_TIMEOUT_SEC là script e2e:* có thật ở server/package.json (chống gõ sai tên)", () => {
      const realPkg = JSON.parse(readFileSync(path.resolve(__dirname, "../package.json"), "utf-8"));
      const names = getE2eScripts(realPkg);
      for (const k of Object.keys(SCRIPT_TIMEOUT_SEC)) expect(names, `khoá lạ ${k}`).toContain(k);
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

    it("lọc chính xác inv-select và move-keys với --only (#1386)", () => {
      const list = [...all, "e2e:inv-select", "e2e:move-keys"];
      const { selected } = filterScripts(list, {
        only: ["inv-select", "move-keys"],
      });
      expect(selected).toEqual(["e2e:inv-select", "e2e:move-keys"]);
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

    it("resolve đường dẫn tương đối của --logs thành đường dẫn tuyệt đối theo cwd", () => {
      const opts = parseCliArgs(["--logs", "relative-logs"]);
      expect(path.isAbsolute(opts.logsDir)).toBe(true);
      expect(opts.logsDir).toBe(
        path.resolve(process.env.INIT_CWD ?? process.cwd(), "relative-logs"),
      );
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

    it("lọc bỏ các dòng boilerplate của npm error và trích xuất tối đa count dòng thực tế", () => {
      const text = `
        Dòng log thực tế 1
        Dòng log thực tế 2
        Error: Thất bại ở bước xác thực
            at Object.run (/server/scripts/test.ts:42)
        npm error Lifecycle script test failed
        npm error code 1
        npm error path /home/runner/work/tien-gioi
        npm error command failed
      `;
      const lines = extractLastLines(text, 15);
      expect(lines).not.toContain("npm error Lifecycle script test failed");
      expect(lines).toContain("Error: Thất bại ở bước xác thực");
      expect(lines).toContain("Dòng log thực tế 1");
      expect(lines.every((l) => !l.startsWith("npm error"))).toBe(true);
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

    it("khi timeout xảy ra, thư mục TMPDIR riêng (tg-e2eall-*) và file con detached ghi vào đó bị tự động xoá sạch", async () => {
      const marker = `tg_tmp_clean_${Date.now()}`;
      const logFile = path.join(os.tmpdir(), `${marker}.log`);

      // Script tạo file và thư mục con bên trong os.tmpdir() (vốn đã được trỏ tới privTmpDir qua biến môi trường TMPDIR)
      const scriptCode = `
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const leakDir = path.join(os.tmpdir(), 'tien-gioi-e2e-leak-chrome');
        fs.mkdirSync(leakDir, { recursive: true });
        fs.writeFileSync(path.join(leakDir, 'leak.txt'), 'chrome-leak-data');
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

      // Thư mục TMPDIR riêng của lần chạy này phải bị xoá sạch hoàn toàn
      expect(existsSync(result.privTmpDir)).toBe(false);

      try {
        if (existsSync(logFile)) rmSync(logFile);
      } catch {
        // Bỏ qua lỗi dọn file log test
      }
    });

    it("các mục tg-* do công cụ / dev khác tạo KHÔNG BAO GIỜ bị xoá nhầm khi runner timeout", async () => {
      const marker = `tg_foreign_probe_${Date.now()}`;
      const logFile = path.join(os.tmpdir(), `${marker}.log`);

      // Giả lập dev khác hoặc công cụ khác đang tạo ảnh hoặc lock trong /tmp
      const foreignDir = path.join(os.tmpdir(), `tg-foreign-probe-shots-${Date.now()}`);
      const foreignLock = path.join(os.tmpdir(), `tg-foreign-probe-${Date.now()}.lock`);
      mkdirSync(foreignDir, { recursive: true });
      writeFileSync(path.join(foreignDir, "anh.png"), "image-content");
      writeFileSync(foreignLock, "lock-content");

      const scriptCode = `
        setInterval(() => {}, 1000);
      `;

      const result = await executeScriptOnce("mock-timeout-foreign-safety", {
        cwd: process.cwd(),
        timeoutSec: 0.4,
        logFile,
        attempt: 1,
        command: { cmd: "node", args: ["-e", scriptCode] },
        graceMs: 100,
      });

      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(124);

      // Đảm bảo tuyệt đối: tài nguyên của dev khác VẪN NGUYÊN VẸN 100%
      expect(existsSync(foreignDir)).toBe(true);
      expect(existsSync(foreignLock)).toBe(true);

      // Dọn dẹp tài nguyên giả lập của test
      try {
        rmSync(foreignDir, { recursive: true, force: true });
        rmSync(foreignLock, { force: true });
        if (existsSync(logFile)) rmSync(logFile);
      } catch {
        // Bỏ qua
      }
    });
  });

  describe("parseShard (Phân tích và kiểm tra tính hợp lệ cờ --shard M/N, #1404)", () => {
    it("phân tích thành công các trường hợp hợp lệ", () => {
      expect(parseShard("1/2")).toEqual({ index: 1, total: 2 });
      expect(parseShard("2/2")).toEqual({ index: 2, total: 2 });
      expect(parseShard(" 1/5 ")).toEqual({ index: 1, total: 5 });
      expect(parseShard("3/10")).toEqual({ index: 3, total: 10 });
    });

    it("ném lỗi rõ ràng khi định dạng không đúng M/N", () => {
      expect(() => parseShard("abc")).toThrow(/Định dạng --shard không hợp lệ/);
      expect(() => parseShard("1-2")).toThrow(/Định dạng --shard không hợp lệ/);
      expect(() => parseShard("1/2/3")).toThrow(/Định dạng --shard không hợp lệ/);
      expect(() => parseShard("1")).toThrow(/Định dạng --shard không hợp lệ/);
      expect(() => parseShard("")).toThrow(/Định dạng --shard không hợp lệ/);
      expect(() => parseShard("1/")).toThrow(/Định dạng --shard không hợp lệ/);
      expect(() => parseShard("/2")).toThrow(/Định dạng --shard không hợp lệ/);
    });

    it("ném lỗi rõ ràng khi phạm vi vi phạm 1 <= M <= N", () => {
      expect(() => parseShard("0/2")).toThrow(/Phạm vi --shard không hợp lệ/);
      expect(() => parseShard("3/2")).toThrow(/Phạm vi --shard không hợp lệ/);
      expect(() => parseShard("1/0")).toThrow(/Phạm vi --shard không hợp lệ/);
      expect(() => parseShard("5/4")).toThrow(/Phạm vi --shard không hợp lệ/);
    });
  });

  describe("shardScripts (Chia kịch bản thuần túy pure function, #1404)", () => {
    const mockScripts = Array.from({ length: 32 }, (_, i) => `e2e:test-${i + 1}`);

    it("chia 32 kịch bản thành 2 shard đồng đều (mỗi shard 16 kịch bản)", () => {
      const shard1 = shardScripts(mockScripts, { index: 1, total: 2 });
      const shard2 = shardScripts(mockScripts, { index: 2, total: 2 });

      expect(shard1).toHaveLength(16);
      expect(shard2).toHaveLength(16);
      expect(shard1[0]).toBe("e2e:test-1");
      expect(shard2[0]).toBe("e2e:test-2");
    });

    it("chia 32 kịch bản thành 3 shard cân bằng (11, 11, 10)", () => {
      const s1 = shardScripts(mockScripts, { index: 1, total: 3 });
      const s2 = shardScripts(mockScripts, { index: 2, total: 3 });
      const s3 = shardScripts(mockScripts, { index: 3, total: 3 });

      expect(s1).toHaveLength(11);
      expect(s2).toHaveLength(11);
      expect(s3).toHaveLength(10);
      expect(s1.length + s2.length + s3.length).toBe(32);
    });

    it("hoạt động mượt mà với số kịch bản lẻ (ví dụ 33 kịch bản khi thêm kịch bản mới ở PR #1394)", () => {
      const oddScripts = Array.from({ length: 33 }, (_, i) => `e2e:test-${i + 1}`);
      const s1 = shardScripts(oddScripts, { index: 1, total: 2 });
      const s2 = shardScripts(oddScripts, { index: 2, total: 2 });

      expect(s1).toHaveLength(17);
      expect(s2).toHaveLength(16);
      expect(s1.length + s2.length).toBe(33);
    });

    it("bảo toàn bất biến: mọi kịch bản xuất hiện đúng MỘT lần duy nhất qua các shard M = 1..N", () => {
      const N = 4;
      const shards = Array.from({ length: N }, (_, i) =>
        shardScripts(mockScripts, { index: i + 1, total: N }),
      );

      // Tập hợp tất cả các kịch bản chạy trên các shard
      const allSharded: string[] = [];
      const seen = new Set<string>();

      for (let sIdx = 0; sIdx < N; sIdx++) {
        for (const script of shards[sIdx]) {
          // Không kịch bản nào bị trùng lặp
          expect(seen.has(script)).toBe(false);
          seen.add(script);
          allSharded.push(script);
        }
      }

      // Kích thước tập hợp phải bằng đúng số kịch bản ban đầu
      expect(seen.size).toBe(mockScripts.length);
      // Danh sách sau khi sort phải khớp 100% với ban đầu
      expect([...allSharded].sort()).toEqual([...mockScripts].sort());
    });

    it("bảo toàn thứ tự kịch bản ban đầu theo package.json trong mỗi shard", () => {
      const s1 = shardScripts(mockScripts, { index: 1, total: 2 });
      const s2 = shardScripts(mockScripts, { index: 2, total: 2 });

      // Chỉ số của từng phần tử trong shard phải tăng dần theo danh sách ban đầu
      let lastIndexS1 = -1;
      for (const item of s1) {
        const currIdx = mockScripts.indexOf(item);
        expect(currIdx).toBeGreaterThan(lastIndexS1);
        lastIndexS1 = currIdx;
      }

      let lastIndexS2 = -1;
      for (const item of s2) {
        const currIdx = mockScripts.indexOf(item);
        expect(currIdx).toBeGreaterThan(lastIndexS2);
        lastIndexS2 = currIdx;
      }
    });

    it("phối hợp đúng với filterScripts (lọc --only và --skip TRƯỚC, rồi mới chia shard)", () => {
      const all = ["e2e:a", "e2e:b", "e2e:c", "e2e:d", "e2e:e", "e2e:f", "e2e:g", "e2e:h"];
      // Giả sử có --skip e2e:c, e2e:g
      const { selected } = filterScripts(all, { skip: ["e2e:c", "e2e:g"] });
      expect(selected).toEqual(["e2e:a", "e2e:b", "e2e:d", "e2e:e", "e2e:f", "e2e:h"]);

      // Chia 2 shard trên 6 script còn lại
      const s1 = shardScripts(selected, { index: 1, total: 2 });
      const s2 = shardScripts(selected, { index: 2, total: 2 });

      expect(s1).toEqual(["e2e:a", "e2e:d", "e2e:f"]);
      expect(s2).toEqual(["e2e:b", "e2e:e", "e2e:h"]);
      expect(s1).not.toContain("e2e:c");
      expect(s2).not.toContain("e2e:g");
    });
  });

  describe("CLI --shard và mã thoát khi sai tham số (#1404)", () => {
    it("parseCliArgs nhận diện đúng cờ --shard M/N và --shard=M/N", () => {
      const opts1 = parseCliArgs(["--shard", "1/2"]);
      expect(opts1.shard).toEqual({ index: 1, total: 2 });

      const opts2 = parseCliArgs(["--shard=2/2"]);
      expect(opts2.shard).toEqual({ index: 2, total: 2 });
    });

    it("runE2eAll in thông báo lỗi và thoát mã 2 khi định dạng hoặc phạm vi --shard sai", async () => {
      // Sai định dạng
      const code1 = await runE2eAll(["--shard", "invalid-shard"]);
      expect(code1).toBe(2);

      // Sai phạm vi (M > N)
      const code2 = await runE2eAll(["--shard", "3/2"]);
      expect(code2).toBe(2);

      // Sai phạm vi (M < 1)
      const code3 = await runE2eAll(["--shard", "0/2"]);
      expect(code3).toBe(2);
    });

    it("runE2eAll với --dry-run và --shard 1/2 chạy thành công với mã thoát 0", async () => {
      const code = await runE2eAll(["--dry-run", "--shard", "1/2"]);
      expect(code).toBe(0);
    });

    it("runE2eAll với --dry-run nối đúng toRun: hai shard 1/2 và 2/2 rời nhau và hợp lại bằng toàn bộ kịch bản", async () => {
      const logs: string[] = [];
      const logSpy = vi.spyOn(console, "log").mockImplementation((msg: string) => {
        logs.push(msg);
      });

      try {
        // Shard 1/2
        const code1 = await runE2eAll(["--dry-run", "--shard", "1/2"]);
        expect(code1).toBe(0);

        const dryRun1Lines = [...logs];
        logs.length = 0;

        // Shard 2/2
        const code2 = await runE2eAll(["--dry-run", "--shard", "2/2"]);
        expect(code2).toBe(0);

        const dryRun2Lines = [...logs];

        const parseDryRunScripts = (lines: string[]): string[] => {
          return lines
            .filter((line) => /^\s+\d+\.\s+e2e/.test(line))
            .map((line) => line.trim().replace(/^\d+\.\s+/, ""));
        };

        const shard1Scripts = parseDryRunScripts(dryRun1Lines);
        const shard2Scripts = parseDryRunScripts(dryRun2Lines);

        const realPkgPath = path.resolve(__dirname, "../package.json");
        const realPkg = JSON.parse(readFileSync(realPkgPath, "utf-8"));
        const allPkgScripts = getE2eScripts(realPkg);

        // (a) Hai danh sách rời nhau hoàn toàn (không có kịch bản nào xuất hiện ở cả 2 shard)
        const set1 = new Set(shard1Scripts);
        for (const s of shard2Scripts) {
          expect(set1.has(s)).toBe(false);
        }

        // (b) Hợp của chúng = allPkgScripts (cùng độ dài, đủ phần tử)
        expect(shard1Scripts.length + shard2Scripts.length).toBe(allPkgScripts.length);
        const union = [...shard1Scripts, ...shard2Scripts].sort();
        expect(union).toEqual([...allPkgScripts].sort());

        // (c) Shard 1 có phần tử đầu = kịch bản đầu tiên của package.json
        expect(shard1Scripts[0]).toBe(allPkgScripts[0]);
        // (d) Shard 2 có phần tử đầu = kịch bản thứ hai của package.json
        expect(shard2Scripts[0]).toBe(allPkgScripts[1]);
      } finally {
        logSpy.mockRestore();
      }
    });

    it("runE2eAll kết hợp --only, --skip, --shard và --dry-run: lọc trước rồi mới chia shard (#1404)", async () => {
      const logs: string[] = [];
      const logSpy = vi.spyOn(console, "log").mockImplementation((msg: string) => {
        logs.push(msg);
      });

      try {
        // Tập hợp 3 script có thật trong package.json: e2e:bi-canh, e2e:pk, e2e:xa-hoi
        // Khi --skip pk: tập được chọn sau khi lọc là [e2e:bi-canh, e2e:xa-hoi]
        // Khi chia shard 1/2: index 1 lấy phần tử thứ nhất -> [e2e:bi-canh] (đúng 1 script)
        // Nếu chia shard trước rồi mới lọc (hoặc toRun = selected): kết quả sẽ khác
        const code = await runE2eAll([
          "--only",
          "bi-canh,pk,xa-hoi",
          "--skip",
          "pk",
          "--shard",
          "1/2",
          "--dry-run",
        ]);
        expect(code).toBe(0);

        const parseDryRunScripts = (lines: string[]): string[] => {
          return lines
            .filter((line) => /^\s+\d+\.\s+e2e/.test(line))
            .map((line) => line.trim().replace(/^\d+\.\s+/, ""));
        };

        const scripts = parseDryRunScripts(logs);
        expect(scripts).toEqual(["e2e:bi-canh"]);
      } finally {
        logSpy.mockRestore();
      }
    });

    it("runE2eAll khi shard rỗng (--only chan-duong --shard 2/2) thoát mã 0 và ghi REPORT.md thành công", async () => {
      const tempLogsDir = path.join(os.tmpdir(), `tg-e2e-empty-shard-${Date.now()}`);
      try {
        const code = await runE2eAll([
          "--only",
          "chan-duong",
          "--shard",
          "2/2",
          "--logs",
          tempLogsDir,
        ]);
        expect(code).toBe(0);

        // Đảm bảo thư mục logs và file REPORT.md được tạo thành công để bước upload-artifact không bị lỗi
        const reportFile = path.join(tempLogsDir, "REPORT.md");
        expect(existsSync(reportFile)).toBe(true);
        const reportContent = readFileSync(reportFile, "utf-8");
        expect(reportContent).toContain("# Báo cáo E2E Toàn diện");
      } finally {
        if (existsSync(tempLogsDir)) {
          rmSync(tempLogsDir, { recursive: true, force: true });
        }
      }
    });
  });
});
