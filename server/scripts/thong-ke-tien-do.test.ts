import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import {
  calcStats,
  sanitizeRecord,
  readDirProgress,
  readBackupProgress,
  buildProgressReport,
  formatMarkdownReport,
} from "./thong-ke-tien-do";

describe("thong-ke-tien-do: calcStats", () => {
  it("xử lý mảng rỗng", () => {
    expect(calcStats([])).toEqual({ min: 0, max: 0, median: 0, mean: 0 });
  });

  it("xử lý mảng 1 phần tử", () => {
    expect(calcStats([5.5])).toEqual({ min: 5.5, max: 5.5, median: 5.5, mean: 5.5 });
  });

  it("tính trung vị mảng có số lượng phần tử lẻ", () => {
    const res = calcStats([10, 2, 5]); // sorted: [2, 5, 10] -> median 5
    expect(res.min).toBe(2);
    expect(res.max).toBe(10);
    expect(res.median).toBe(5);
    expect(res.mean).toBeCloseTo((2 + 5 + 10) / 3);
  });

  it("tính trung vị mảng có số lượng phần tử chẵn", () => {
    const res = calcStats([10, 2, 8, 4]); // sorted: [2, 4, 8, 10] -> median (4 + 8) / 2 = 6
    expect(res.min).toBe(2);
    expect(res.max).toBe(10);
    expect(res.median).toBe(6);
    expect(res.mean).toBe(6);
  });
});

describe("thong-ke-tien-do: sanitizeRecord & quyền riêng tư", () => {
  it("trả về null nếu input không hợp lệ", () => {
    expect(sanitizeRecord(null)).toBeNull();
    expect(sanitizeRecord(undefined)).toBeNull();
    expect(sanitizeRecord("chuoi")).toBeNull();
    expect(sanitizeRecord([1, 2, 3])).toBeNull();
  });

  it("làm sạch và trích xuất đúng trường, bỏ qua hoàn toàn tên và thông tin nhạy cảm", () => {
    const raw = {
      name: "Đạo Sĩ Siêu Cấp",
      secretHash: "ab12cd34ef56",
      realm: 3,
      tier: 2,
      mapId: "am_suong",
      life: {
        playMs: 14400000, // 4 giờ
        kills: 120,
        bossKills: 2,
      },
      equipment: { weapon: "kiem_go" },
      coin: 50000,
    };

    const rec = sanitizeRecord(raw);
    expect(rec).not.toBeNull();
    expect(rec).toEqual({
      realm: 3,
      tier: 2,
      playMs: 14400000,
      kills: 120,
      bossKills: 2,
      mapId: "am_suong",
    });

    // Tuyệt đối không leak name hay secret
    expect((rec as any).name).toBeUndefined();
    expect((rec as any).secretHash).toBeUndefined();
    expect((rec as any).coin).toBeUndefined();
  });

  it("kẹp realm và tier trong giới hạn hợp lệ", () => {
    const raw = {
      realm: 999,
      tier: 999,
      life: { playMs: -500 },
    };
    const rec = sanitizeRecord(raw)!;
    expect(rec.realm).toBeLessThan(10);
    expect(rec.tier).toBeLessThan(3);
    expect(rec.playMs).toBe(0);
    expect(rec.mapId).toBe("lac_ha");
  });
});

describe("thong-ke-tien-do: đọc thư mục JSON", () => {
  it("đọc thư mục, bỏ qua tệp hỏng và đếm đúng số lượng", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "test-thong-ke-dir-"));
    try {
      // 1. File hợp lệ 1
      writeFileSync(
        path.join(tmpDir, "p1.json"),
        JSON.stringify({
          name: "P1",
          realm: 1,
          tier: 0,
          mapId: "lac_ha",
          life: { playMs: 3600000, kills: 10, bossKills: 0 },
        }),
      );

      // 2. File hợp lệ 2
      writeFileSync(
        path.join(tmpDir, "p2.json"),
        JSON.stringify({
          name: "P2",
          realm: 1,
          tier: 1,
          mapId: "hac_phong",
          life: { playMs: 7200000, kills: 30, bossKills: 1 },
        }),
      );

      // 3. File JSON hỏng cú pháp
      writeFileSync(path.join(tmpDir, "corrupted.json"), "{ invalid json ");

      // 4. File không phải json (phải bị bỏ qua)
      writeFileSync(path.join(tmpDir, "readme.txt"), "hello");

      const res = await readDirProgress(tmpDir);
      expect(res.totalFiles).toBe(3); // 3 file .json
      expect(res.corruptedCount).toBe(1);
      expect(res.records.length).toBe(2);
      expect(res.records[0].realm).toBe(1);
      expect(res.records[0].tier).toBe(0);
      expect(res.records[1].realm).toBe(1);
      expect(res.records[1].tier).toBe(1);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("thong-ke-tien-do: đọc tệp sao lưu .sql.gz (COPY characters)", () => {
  it("đọc stream và giải nén tệp .sql.gz, trích xuất dữ liệu JSON từ khối COPY", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "test-thong-ke-backup-"));
    const backupFile = path.join(tmpDir, "test-backup.sql.gz");
    try {
      const sqlContent = [
        "-- PostgreSQL backup dump",
        "SET statement_timeout = 0;",
        "CREATE TABLE public.characters (name_key text, name text, data jsonb, updated_at timestamp);",
        "COPY public.characters (name_key, name, data, updated_at) FROM stdin;",
        `player1\tPlayer 1\t{"name": "Player 1", "realm": 3, "tier": 2, "mapId": "am_suong", "life": {"playMs": 18000000, "kills": 200, "bossKills": 3}}\t2026-11-14 12:00:00+00`,
        `player2\tPlayer 2\t{"name": "Player 2", "realm": 2, "tier": 0, "mapId": "hac_phong", "life": {"playMs": 10800000, "kills": 80, "bossKills": 1}}\t2026-11-14 12:05:00+00`,
        `corrupted\tCorrupted\t{ invalid json here\t2026-11-14 12:10:00+00`,
        "\\.",
        "-- Other table",
        "COPY public.souls (soul_key, data) FROM stdin;",
        "soul1\t{}\n\\.",
      ].join("\n");

      const compressed = zlib.gzipSync(Buffer.from(sqlContent, "utf8"));
      writeFileSync(backupFile, compressed);

      const res = await readBackupProgress(backupFile);
      expect(res.totalRows).toBe(3);
      expect(res.corruptedCount).toBe(1);
      expect(res.records.length).toBe(2);

      const r1 = res.records[0];
      expect(r1.realm).toBe(3);
      expect(r1.tier).toBe(2);
      expect(r1.playMs).toBe(18000000);
      expect(r1.mapId).toBe("am_suong");

      const r2 = res.records[1];
      expect(r2.realm).toBe(2);
      expect(r2.tier).toBe(0);
      expect(r2.playMs).toBe(10800000);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("thong-ke-tien-do: buildProgressReport & formatMarkdownReport", () => {
  it("nhóm đúng theo cảnh giới và đưa ra kết luận cân bằng chuẩn xác", () => {
    // Tạo 5 mẫu Kim Đan Hậu kỳ (realm 3, tier 2) với giờ chơi quanh 3.5h (< 4.0h)
    const records = [
      { realm: 3, tier: 2, playMs: 3.0 * 3600000, kills: 100, bossKills: 1, mapId: "am_suong" },
      { realm: 3, tier: 2, playMs: 3.2 * 3600000, kills: 110, bossKills: 1, mapId: "am_suong" },
      { realm: 3, tier: 2, playMs: 3.5 * 3600000, kills: 120, bossKills: 2, mapId: "am_suong" },
      { realm: 3, tier: 2, playMs: 3.8 * 3600000, kills: 130, bossKills: 2, mapId: "am_suong" },
      { realm: 3, tier: 2, playMs: 4.0 * 3600000, kills: 140, bossKills: 3, mapId: "am_suong" },
      // 1 mẫu Luyện Khí Tầng 1
      { realm: 1, tier: 0, playMs: 0.2 * 3600000, kills: 5, bossKills: 0, mapId: "lac_ha" },
    ];

    const report = buildProgressReport(records, 0);
    expect(report.totalPlayers).toBe(6);
    expect(report.groups.length).toBe(2);
    expect(report.kdHauKyCount).toBe(5);
    expect(report.kdHauKyMedianHours).toBeCloseTo(3.5);
    // Đủ 5 mẫu và median 3.5h < 4.0h -> Cảnh báo
    expect(report.verdict).toContain("🚨 CẢNH BÁO");

    const md = formatMarkdownReport(report, "test source");
    expect(md).toContain("Kim Đan Hậu kỳ");
    expect(md).toContain("Luyện Khí Tầng 1");
    expect(md).toContain("~3.5 h");
    expect(md).toContain("chưa đủ mẫu (< 5)"); // Luyện Khí chỉ có 1 mẫu
    expect(md).toContain("🚨 CẢNH BÁO");
    // Không chứa tên người chơi
    expect(md).not.toContain("name");
    expect(md).not.toContain("Đạo Sĩ");
  });

  it("báo đạt mục tiêu khi trung vị Kim Đan Hậu kỳ >= 4.0 giờ", () => {
    const records = [
      { realm: 3, tier: 2, playMs: 4.5 * 3600000, kills: 100, bossKills: 1, mapId: "am_suong" },
      { realm: 3, tier: 2, playMs: 4.8 * 3600000, kills: 110, bossKills: 1, mapId: "am_suong" },
      { realm: 3, tier: 2, playMs: 5.2 * 3600000, kills: 120, bossKills: 2, mapId: "am_suong" },
      { realm: 3, tier: 2, playMs: 5.5 * 3600000, kills: 130, bossKills: 2, mapId: "am_suong" },
      { realm: 3, tier: 2, playMs: 6.0 * 3600000, kills: 140, bossKills: 3, mapId: "am_suong" },
    ];

    const report = buildProgressReport(records, 0);
    expect(report.kdHauKyMedianHours).toBeCloseTo(5.2);
    expect(report.verdict).toContain("✅ ĐẠT MỤC TIÊU");
  });

  it("báo cờ tham khảo khi ít hơn 5 mẫu", () => {
    const records = [
      { realm: 3, tier: 2, playMs: 2.5 * 3600000, kills: 50, bossKills: 1, mapId: "am_suong" },
      { realm: 3, tier: 2, playMs: 3.0 * 3600000, kills: 60, bossKills: 1, mapId: "am_suong" },
    ];

    const report = buildProgressReport(records, 0);
    expect(report.kdHauKyCount).toBe(2);
    expect(report.verdict).toContain("⚠️ THAM KHẢO");
    expect(report.verdict).toContain("< 5 mẫu");
  });
});
