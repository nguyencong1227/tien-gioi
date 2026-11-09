import { describe, expect, it } from "vitest";
import { BACKUP_FILE_REGEX, formatBackupFilename, selectOldBackups } from "./backup";

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

  it("trả về toàn bộ file hợp lệ khi keep <= 0", () => {
    const files = [
      "players-20261110-010000.tar.gz",
      "players-20261110-020000.tar.gz",
      "unrelated.txt",
    ];
    expect(selectOldBackups(files, 0)).toEqual([
      "players-20261110-020000.tar.gz",
      "players-20261110-010000.tar.gz",
    ]);
  });
});

describe("formatBackupFilename & BACKUP_FILE_REGEX", () => {
  it("sinh tên file khớp định dạng chuẩn", () => {
    const fixedDate = new Date(2026, 10, 10, 2, 15, 30); // Tháng 11 (0-indexed = 10)
    const name = formatBackupFilename(fixedDate);
    expect(name).toBe("players-20261110-021530.tar.gz");
    expect(BACKUP_FILE_REGEX.test(name)).toBe(true);
  });
});
