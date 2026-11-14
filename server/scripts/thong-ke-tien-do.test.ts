import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import {
  calcStats,
  unescapePgCopy,
  sanitizeRecord,
  readDirProgress,
  readBackupProgress,
  getOptimalModel,
  buildProgressReport,
  formatMarkdownReport,
  KD_REALM,
  KD_HAU_KY_TIER,
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

describe("thong-ke-tien-do: unescapePgCopy", () => {
  it("giải mã các ký tự thoát PostgreSQL COPY text format", () => {
    expect(unescapePgCopy("\\N")).toBe("");
    expect(unescapePgCopy("hello\\tworld")).toBe("hello\tworld");
    expect(unescapePgCopy("line1\\nline2")).toBe("line1\nline2");
    expect(unescapePgCopy("line1\\rline2")).toBe("line1\rline2");
    expect(unescapePgCopy("path\\\\to\\\\file")).toBe("path\\to\\file");
    expect(unescapePgCopy('quote\\"test\\"')).toBe('quote"test"');
  });

  it("giải mã đúng JSON chứa dấu ngoặc kép bị pg_dump escape kép", () => {
    // pg_dump khi xuất cột JSON có chứa nháy kép: {"name": "Lạc Hà \"Trấn\""}
    // sẽ nhân đôi dấu \ thành: {"name": "Lạc Hà \\\"Trấn\\\""}
    const dumpedJson = String.raw`{"name": "Lạc Hà \\\"Trấn\\\"", "desc": "Bản đồ \\\\ sơn cốc"}`;
    const unescaped = unescapePgCopy(dumpedJson);
    const parsed = JSON.parse(unescaped);
    expect(parsed.name).toBe('Lạc Hà "Trấn"');
    expect(parsed.desc).toBe("Bản đồ \\ sơn cốc");
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
      skillsCount: 0,
      skillsTotalLevels: 0,
      equippedSkillsCount: 0,
    });

    // Tuyệt đối không leak name hay secret
    expect((rec as any).name).toBeUndefined();
    expect((rec as any).secretHash).toBeUndefined();
    expect((rec as any).coin).toBeUndefined();
  });

  it("thống kê chính xác số lượng chiêu và ô gắn nhưng không lưu / leak tên chiêu", () => {
    const raw = {
      name: "Kiếm Tu Lạc Hà",
      realm: 2,
      tier: 1,
      skills: {
        learned: {
          hoa_van_kiem: 2,
          bon_thach_quyen: 1,
          thanh_tung_phi_cham: 3,
        },
        slots: ["hoa_van_kiem", "thanh_tung_phi_cham", "", ""],
      },
      life: { playMs: 7200000, kills: 80, bossKills: 1 },
    };
    const rec = sanitizeRecord(raw)!;
    expect(rec.skillsCount).toBe(3);
    expect(rec.skillsTotalLevels).toBe(6); // 2 + 1 + 3 = 6
    expect(rec.equippedSkillsCount).toBe(2);
    // Tuyệt đối không leak danh sách tên chiêu hay object learned / slots vào record
    expect((rec as any).skills).toBeUndefined();
    expect((rec as any).learned).toBeUndefined();
    expect((rec as any).slots).toBeUndefined();
  });

  it("bỏ qua chiêu tầng 0 và kẹp tầng tối đa 3 khi thống kê (diệt đột biến N4, N5)", () => {
    const raw = {
      name: "Tán Tu",
      realm: 1,
      skills: {
        learned: {
          chieu_chua_hoc: 0,
          chieu_am: -1,
          chieu_tang_cao: 7,
          chieu_hop_le: 2,
        },
      },
    };
    const rec = sanitizeRecord(raw)!;
    // Chỉ đếm chieu_tang_cao và chieu_hop_le (tầng 0 và âm bị bỏ qua)
    expect(rec.skillsCount).toBe(2);
    // chieu_tang_cao kẹp về 3; chieu_hop_le là 2 -> tổng là 3 + 2 = 5
    expect(rec.skillsTotalLevels).toBe(5);
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
  it("đọc stream, giải nén và unescape chuỗi JSON từ khối COPY", async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "test-thong-ke-backup-"));
    const backupFile = path.join(tmpDir, "test-backup.sql.gz");
    try {
      const p1Json = String.raw`{"name": "Player \\\"1\\\"", "realm": 3, "tier": 2, "mapId": "am_suong", "life": {"playMs": 18000000, "kills": 200, "bossKills": 3}}`;
      const p2Json = String.raw`{"name": "Player 2", "realm": 2, "tier": 0, "mapId": "hac_phong", "life": {"playMs": 10800000, "kills": 80, "bossKills": 1}}`;
      const sqlContent = [
        "-- PostgreSQL backup dump",
        "SET statement_timeout = 0;",
        "CREATE TABLE public.characters (name_key text, name text, data jsonb, updated_at timestamp);",
        "COPY public.characters (name_key, name, data, updated_at) FROM stdin;",
        `player1\tPlayer 1\t${p1Json}\t2026-11-14 12:00:00+00`,
        `player2\tPlayer 2\t${p2Json}\t2026-11-14 12:05:00+00`,
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

describe("thong-ke-tien-do: mô hình tối ưu simulate & buildProgressReport", () => {
  it("getOptimalModel trả về mốc thời gian và ngưỡng cân bằng chuẩn xác", () => {
    const model = getOptimalModel();
    expect(model.preKdFinishHours).toBeCloseTo(2.86, 1);
    expect(model.kdHauKyReachHours).toBeCloseTo(6.03, 1);
    expect(model.kdFinishHours).toBeCloseTo(8.3, 1);
    // Ngưỡng Kim Đan Hậu kỳ = 2.86 + 0.7 * (6.03 - 2.86) ~ 5.08h
    expect(model.kdHauKyThresholdHours).toBeCloseTo(5.08, 1);
    // Ngưỡng hết Kim Đan = 2.86 + 4.0 = ~6.86h
    expect(model.postKdThresholdHours).toBeCloseTo(6.86, 1);
  });

  it("cảnh báo QUÁ NHANH khi trung vị Kim Đan Hậu kỳ < ngưỡng ~5.08h", () => {
    // 5 mẫu với 4.8h (< 5.08h) -> cảnh báo
    const records = [
      {
        realm: KD_REALM,
        tier: KD_HAU_KY_TIER,
        playMs: 4.5 * 3600000,
        kills: 100,
        bossKills: 1,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM,
        tier: KD_HAU_KY_TIER,
        playMs: 4.7 * 3600000,
        kills: 110,
        bossKills: 1,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM,
        tier: KD_HAU_KY_TIER,
        playMs: 4.8 * 3600000,
        kills: 120,
        bossKills: 2,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM,
        tier: KD_HAU_KY_TIER,
        playMs: 4.9 * 3600000,
        kills: 130,
        bossKills: 2,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM,
        tier: KD_HAU_KY_TIER,
        playMs: 5.0 * 3600000,
        kills: 140,
        bossKills: 3,
        mapId: "am_suong",
      },
    ];

    const report = buildProgressReport(records, 0);
    expect(report.kdHauKyCount).toBe(5);
    expect(report.kdHauKyMedianHours).toBeCloseTo(4.8);
    expect(report.verdict).toContain("🚨 CẢNH BÁO (QUÁ NHANH)");
    expect(report.verdict).toContain("Trung vị giờ chơi tích luỹ tới Kim Đan Hậu kỳ");
  });

  it("báo 'Chưa thấy dấu hiệu quá nhanh (cận trên)' khi trung vị Kim Đan Hậu kỳ >= ngưỡng", () => {
    // 5 mẫu với 5.5h (>= 5.08h)
    const records = [
      {
        realm: KD_REALM,
        tier: KD_HAU_KY_TIER,
        playMs: 5.2 * 3600000,
        kills: 100,
        bossKills: 1,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM,
        tier: KD_HAU_KY_TIER,
        playMs: 5.4 * 3600000,
        kills: 110,
        bossKills: 1,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM,
        tier: KD_HAU_KY_TIER,
        playMs: 5.5 * 3600000,
        kills: 120,
        bossKills: 2,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM,
        tier: KD_HAU_KY_TIER,
        playMs: 5.8 * 3600000,
        kills: 130,
        bossKills: 2,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM,
        tier: KD_HAU_KY_TIER,
        playMs: 6.0 * 3600000,
        kills: 140,
        bossKills: 3,
        mapId: "am_suong",
      },
    ];

    const report = buildProgressReport(records, 0);
    expect(report.kdHauKyMedianHours).toBeCloseTo(5.5);
    expect(report.verdict).toContain("Chưa thấy dấu hiệu quá nhanh (cận trên)");
    expect(report.verdict).not.toContain("ĐẠT MỤC TIÊU");
  });

  it("đánh giá nhóm vượt qua Kim Đan (realm > KD_REALM) với mốc ~6.86h theo #406", () => {
    // 5 mẫu ở Nguyên Anh (realm 4) với playMs = 6.5h (< 6.86h, trong Kim Đan chỉ mất ~3.64h < 4h) -> CẢNH BÁO
    const fastRecords = [
      {
        realm: KD_REALM + 1,
        tier: 0,
        playMs: 6.0 * 3600000,
        kills: 200,
        bossKills: 5,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM + 1,
        tier: 0,
        playMs: 6.2 * 3600000,
        kills: 210,
        bossKills: 5,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM + 1,
        tier: 0,
        playMs: 6.5 * 3600000,
        kills: 220,
        bossKills: 6,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM + 1,
        tier: 0,
        playMs: 6.6 * 3600000,
        kills: 230,
        bossKills: 6,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM + 1,
        tier: 0,
        playMs: 6.7 * 3600000,
        kills: 240,
        bossKills: 7,
        mapId: "am_suong",
      },
    ];
    const fastReport = buildProgressReport(fastRecords, 0);
    expect(fastReport.postKdCount).toBe(5);
    expect(fastReport.postKdMedianHours).toBeCloseTo(6.5);
    expect(fastReport.verdict).toContain("🚨 CẢNH BÁO (QUÁ NHANH)");
    expect(fastReport.verdict).toContain("Nhóm vượt qua Kim Đan");
    expect(fastReport.verdict).toContain("dưới ngưỡng 4.0h theo #406");

    // 5 mẫu ở Nguyên Anh với playMs = 7.2h (>= 6.86h, trong Kim Đan >= 4h) -> Chưa thấy dấu hiệu quá nhanh
    const normalRecords = [
      {
        realm: KD_REALM + 1,
        tier: 0,
        playMs: 7.0 * 3600000,
        kills: 200,
        bossKills: 5,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM + 1,
        tier: 0,
        playMs: 7.1 * 3600000,
        kills: 210,
        bossKills: 5,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM + 1,
        tier: 0,
        playMs: 7.2 * 3600000,
        kills: 220,
        bossKills: 6,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM + 1,
        tier: 0,
        playMs: 7.5 * 3600000,
        kills: 230,
        bossKills: 6,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM + 1,
        tier: 0,
        playMs: 8.0 * 3600000,
        kills: 240,
        bossKills: 7,
        mapId: "am_suong",
      },
    ];
    const normalReport = buildProgressReport(normalRecords, 0);
    expect(normalReport.verdict).toContain("Chưa thấy dấu hiệu quá nhanh (cận trên)");
    expect(normalReport.verdict).not.toContain("ĐẠT MỤC TIÊU");
  });

  it("báo cờ tham khảo khi ít hơn 5 mẫu", () => {
    const records = [
      {
        realm: KD_REALM,
        tier: KD_HAU_KY_TIER,
        playMs: 2.5 * 3600000,
        kills: 50,
        bossKills: 1,
        mapId: "am_suong",
      },
      {
        realm: KD_REALM,
        tier: KD_HAU_KY_TIER,
        playMs: 3.0 * 3600000,
        kills: 60,
        bossKills: 1,
        mapId: "am_suong",
      },
    ];

    const report = buildProgressReport(records, 0);
    expect(report.kdHauKyCount).toBe(2);
    expect(report.verdict).toContain("⚠️ THAM KHẢO");
    expect(report.verdict).toContain("chưa đủ mẫu");
  });

  it("formatMarkdownReport hiển thị bảng đúng định dạng, xử lý nhóm 1 người gọn gàng và không leak tên", () => {
    const records = [
      // 1 người Kim Đan Sơ kỳ
      { realm: KD_REALM, tier: 0, playMs: 3.0 * 3600000, kills: 50, bossKills: 1, mapId: "lac_ha" },
      // 2 người Phàm Nhân
      { realm: 0, tier: 0, playMs: 0.1 * 3600000, kills: 2, bossKills: 0, mapId: "lac_ha" },
      { realm: 0, tier: 0, playMs: 0.2 * 3600000, kills: 4, bossKills: 0, mapId: "lac_ha" },
    ];

    const report = buildProgressReport(records, 0);
    const md = formatMarkdownReport(report, "test-source");

    expect(md).toContain(
      "| Cảnh giới - Bậc | Số người | Giờ chơi tích luỹ (Min / Med / Max) | Mô hình tới bậc | Trung vị / Mô hình | Quái hạ TB | Trùm hạ TB | Chiêu / Ô TB | Bản đồ |",
    );
    expect(md).toContain("## 3. Thống kê chiêu thức / công pháp đã học (M7.10 #511)");
    expect(md).toContain("Phàm Nhân");
    expect(md).toContain("Kim Đan Sơ kỳ");
    // Nhóm 1 người in gọn `**3.0** h`
    expect(md).toContain("**3.0** h");
    // Nhóm 2 người in `0.1 / **0.2** / 0.2 h`
    expect(md).toContain("0.1 / **0.2** / 0.2 h");
    // Ghi chú về luân hồi và bảo vệ riêng tư
    expect(md).toContain("Dư âm tu hành");
    expect(md).toContain("Ghi chú bảo vệ quyền riêng tư");
  });
});
