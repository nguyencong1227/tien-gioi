import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BACKUP_FILE_REGEX,
  formatBackupFilename,
  parseCliArgs,
  performBackup,
  selectOldBackups,
} from "./backup";

describe("selectOldBackups (chọn file sao lưu cũ cần xoá)", () => {
  it("trả về mảng rỗng khi danh sách file rỗng", () => {
    expect(selectOldBackups([], 14)).toEqual([]);
  });

  it("không xoá file nào nếu số lượng file khớp nhỏ hơn hoặc bằng keep", () => {
    const files = [
      "players-20261110-010000.tar.gz",
      "players-20261110-020000.tar.gz",
      "players-20261110-030000.tar.gz",
    ];
    expect(selectOldBackups(files, 3)).toEqual([]);
    expect(selectOldBackups(files, 5)).toEqual([]);
  });

  it("bỏ qua các file không khớp định dạng players-YYYYMMDD-HHMMSS.tar.gz", () => {
    const files = [
      "players-20261110-010000.tar.gz",
      "players-20261110-020000.tar.gz",
      "other-archive.tar.gz",
      "players.json",
      "players-invalid.tar.gz",
      ".DS_Store",
    ];
    // Chỉ có 2 file hợp lệ, keep = 1 -> chỉ xoá 1 file hợp lệ cũ hơn
    expect(selectOldBackups(files, 1)).toEqual(["players-20261110-010000.tar.gz"]);
  });

  it("giữ đúng N bản mới nhất và trả về danh sách các bản cũ hơn", () => {
    const files = [
      "players-20261101-000000.tar.gz", // cũ nhất
      "players-20261102-000000.tar.gz",
      "players-20261103-000000.tar.gz",
      "players-20261104-000000.tar.gz",
      "players-20261105-000000.tar.gz", // mới nhất
    ];
    // keep = 2 -> giữ 20261105 và 20261104, xoá 03, 02, 01 (theo thứ tự mới đến cũ)
    expect(selectOldBackups(files, 2)).toEqual([
      "players-20261103-000000.tar.gz",
      "players-20261102-000000.tar.gz",
      "players-20261101-000000.tar.gz",
    ]);
  });

  it("ném RangeError khi keep <= 0, NaN hoặc không phải số nguyên", () => {
    const files = ["players-20261110-010000.tar.gz"];
    expect(() => selectOldBackups(files, 0)).toThrow(RangeError);
    expect(() => selectOldBackups(files, -1)).toThrow(RangeError);
    expect(() => selectOldBackups(files, NaN)).toThrow(RangeError);
    expect(() => selectOldBackups(files, 1.5)).toThrow(RangeError);
  });
});

describe("parseCliArgs (kiểm tra đối số dòng lệnh)", () => {
  it("nhận đúng cờ --keep hợp lệ", () => {
    expect(parseCliArgs(["--keep=30"]).keep).toBe(30);
  });

  it("ném lỗi khi cờ --keep không hợp lệ hoặc <= 0", () => {
    expect(() => parseCliArgs(["--keep=0"])).toThrow(/số nguyên >= 1/);
    expect(() => parseCliArgs(["--keep=-5"])).toThrow(/số nguyên >= 1/);
    expect(() => parseCliArgs(["--keep=abc"])).toThrow(/số nguyên >= 1/);
    expect(() => parseCliArgs(["--keep="])).toThrow(/số nguyên >= 1/);
  });
});

describe("formatBackupFilename & BACKUP_FILE_REGEX", () => {
  it("sinh tên file khớp định dạng chuẩn", () => {
    const fixedDate = new Date(2026, 10, 10, 2, 15, 30); // Tháng 11 (0-indexed = 10)
    const name = formatBackupFilename(fixedDate);
    expect(name).toBe("players-20261110-021530.tar.gz");
    expect(BACKUP_FILE_REGEX.test(name)).toBe(true);
  });

  it("sinh tên file có hậu tố khi trùng trong cùng giây", () => {
    const fixedDate = new Date(2026, 10, 10, 2, 15, 30);
    const name = formatBackupFilename(fixedDate, "1");
    expect(name).toBe("players-20261110-021530-1.tar.gz");
    expect(BACKUP_FILE_REGEX.test(name)).toBe(true);
  });
});

describe("performBackup (tích hợp với thư mục tạm)", () => {
  it("báo lỗi nếu thư mục dữ liệu nguồn không tồn tại", () => {
    const nonExistent = path.join(os.tmpdir(), "tien-gioi-test-nonexistent-" + Date.now());
    expect(() =>
      performBackup({
        dataDir: nonExistent,
      }),
    ).toThrow(/Không tìm thấy thư mục dữ liệu nguồn/);
  });

  it("sao lưu thành công thư mục có dữ liệu, kiểm tra tar -tzf và phòng thủ keep", () => {
    const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-backup-test-"));
    try {
      const dataDir = path.join(tmpRoot, "players");
      const backupDir = path.join(tmpRoot, "backups");
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(
        path.join(dataDir, "hero1.json"),
        JSON.stringify({ name: "Tiên Nhân", realm: "Luyện Khí" }),
      );

      // Lần 1: sao lưu thành công
      const res1 = performBackup({
        dataDir,
        backupDir,
        keep: 2,
        now: new Date(2026, 10, 10, 1, 0, 0),
      });
      expect(res1.archiveName).toBe("players-20261110-010000.tar.gz");
      expect(res1.archiveSizeBytes).toBeGreaterThan(0);

      // Kiểm tra nội dung archive bằng `tar -tzf`
      const tarList = execFileSync("tar", ["-tzf", res1.archivePath], {
        encoding: "utf8",
      });
      expect(tarList).toContain("players/hero1.json");

      // Lần 2: tạo thêm bản sao lưu thứ hai
      const res2 = performBackup({
        dataDir,
        backupDir,
        keep: 2,
        now: new Date(2026, 10, 10, 2, 0, 0),
      });
      expect(res2.removedFiles).toEqual([]);

      // Lần 3: tạo bản thứ ba với keep=2 -> bản cũ nhất (010000) bị xoá, bản vừa tạo không bị xoá
      const res3 = performBackup({
        dataDir,
        backupDir,
        keep: 2,
        now: new Date(2026, 10, 10, 3, 0, 0),
      });
      expect(res3.removedFiles).toEqual(["players-20261110-010000.tar.gz"]);
      expect(res3.archiveName).toBe("players-20261110-030000.tar.gz");

      // Lần 4: kiểm tra hậu tố khi chạy trùng giây
      const res4 = performBackup({
        dataDir,
        backupDir,
        keep: 5,
        now: new Date(2026, 10, 10, 3, 0, 0),
      });
      expect(res4.archiveName).toBe("players-20261110-030000-1.tar.gz");
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe("khôi phục có kiểm chứng (M4 3.4 - Issue #276)", () => {
  it("khôi phục thành công bằng lệnh tar mục 7.3, kiem-save đạt 0 lỗi, SHA-256 khớp 100%", async () => {
    const { runRestoreVerification } = await import("./verify-restore");
    const res = await runRestoreVerification();
    expect(res.fileCount).toBeGreaterThanOrEqual(5);
    expect(res.hashMatch).toBe(true);
    expect(res.totalErrors).toBe(0);
    expect(res.auditReport.cleanFiles).toBe(1);
    expect(res.auditReport.cleanSouls).toBe(1);
    expect(res.auditReport.cleanSects).toBe(1);
    expect(res.auditReport.cleanAccounts).toBe(1);
    expect(res.auditReport.cleanSessions).toBe(1);
  });

  describe("kiểm chứng đột biến khôi phục (Mutation Testing)", () => {
    it("đỏ khi bản sao lưu bị thiếu thư mục souls/", async () => {
      const { createSampleGameData, hashDirectoryTree } = await import("./verify-restore");
      const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-restore-mut-souls-"));
      try {
        const dataDir = path.join(tmpRoot, "players");
        const backupDir = path.join(tmpRoot, "backups");
        await createSampleGameData(dataDir);
        const originalHashes = hashDirectoryTree(dataDir);

        // ĐỘT BIẾN: Xoá thư mục souls/ trước khi sao lưu
        rmSync(path.join(dataDir, "souls"), { recursive: true, force: true });

        const backupRes = performBackup({ dataDir, backupDir, keep: 2 });
        rmSync(dataDir, { recursive: true, force: true });

        // Khôi phục bằng lệnh tar
        execFileSync("tar", ["-xzf", backupRes.archivePath, "-C", tmpRoot], { stdio: "pipe" });

        const restoredHashes = hashDirectoryTree(dataDir);
        // Kiểm tra phát hiện thiếu file souls
        expect(restoredHashes.size).toBeLessThan(originalHashes.size);
        const missingSoul = [...originalHashes.keys()].some(
          (k) => k.startsWith("souls/") && !restoredHashes.has(k),
        );
        expect(missingSoul).toBe(true);
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it("đỏ khi bản sao lưu bị thiếu thư mục sects/", async () => {
      const { createSampleGameData, hashDirectoryTree } = await import("./verify-restore");
      const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-restore-mut-sects-"));
      try {
        const dataDir = path.join(tmpRoot, "players");
        const backupDir = path.join(tmpRoot, "backups");
        await createSampleGameData(dataDir);
        const originalHashes = hashDirectoryTree(dataDir);

        // ĐỘT BIẾN: Xoá thư mục sects/ trước khi sao lưu
        rmSync(path.join(dataDir, "sects"), { recursive: true, force: true });

        const backupRes = performBackup({ dataDir, backupDir, keep: 2 });
        rmSync(dataDir, { recursive: true, force: true });

        // Khôi phục bằng lệnh tar
        execFileSync("tar", ["-xzf", backupRes.archivePath, "-C", tmpRoot], { stdio: "pipe" });

        const restoredHashes = hashDirectoryTree(dataDir);
        // Kiểm tra phát hiện thiếu file sects
        expect(restoredHashes.size).toBeLessThan(originalHashes.size);
        const missingSect = [...originalHashes.keys()].some(
          (k) => k.startsWith("sects/") && !restoredHashes.has(k),
        );
        expect(missingSect).toBe(true);
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });
});
