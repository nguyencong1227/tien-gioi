import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  deepCompareEntities,
  compareDirectorySnapshots,
  verifyPhase,
  verifyArchiveSharedResolution,
  setupArchiveNodeModules,
  takeDirectorySnapshot,
  pickSoakDir,
} from "./kiem-nang-cap";

describe("kiem-nang-cap: deepCompareEntities", () => {
  it("trả về rỗng khi hai đối tượng giống hệt nhau", () => {
    const a = { name: "bot_1", coin: 100, realm: 2, inv: [{ itemId: "dan", qty: 2 }] };
    const b = { name: "bot_1", coin: 100, realm: 2, inv: [{ itemId: "dan", qty: 2 }] };
    expect(deepCompareEntities(a, b)).toEqual([]);
  });

  it("bỏ qua các trường biến động tự nhiên: updatedAt và life.playMs", () => {
    const a = {
      name: "bot_1",
      coin: 100,
      updatedAt: "2026-11-21T15:04:16.688Z",
      life: { playMs: 500, kills: 10 },
    };
    const b = {
      name: "bot_1",
      coin: 100,
      updatedAt: "2026-11-21T15:05:16.688Z",
      life: { playMs: 700, kills: 10 },
    };
    expect(deepCompareEntities(a, b)).toEqual([]);
  });

  it("N2: không phụ thuộc thứ tự khoá trong mảng các đối tượng", () => {
    const a = {
      inv: [
        { itemId: "dan", qty: 2, bind: true },
        { itemId: "kiem", qty: 1, level: 3 },
      ],
    };
    const b = {
      inv: [
        { bind: true, qty: 2, itemId: "dan" }, // Đảo thứ tự khoá
        { level: 3, itemId: "kiem", qty: 1 }, // Đảo thứ tự khoá
      ],
    };
    expect(deepCompareEntities(a, b)).toEqual([]);
  });

  it("N2: chỉ ra chính xác phần tử và trường sai lệch trong mảng", () => {
    const a = {
      inv: [
        { itemId: "dan", qty: 2 },
        { itemId: "kiem", qty: 1 },
      ],
    };
    const b = {
      inv: [
        { itemId: "dan", qty: 2 },
        { itemId: "kiem", qty: 5 }, // qty thay đổi
      ],
    };
    const diffs = deepCompareEntities(a, b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      keyPath: "inv[1].qty",
      before: 1,
      after: 5,
    });
  });

  it("N2: phát hiện khi mảng khác nhau về độ dài", () => {
    const a = { inv: [{ itemId: "dan", qty: 2 }] };
    const b = {
      inv: [
        { itemId: "dan", qty: 2 },
        { itemId: "kiem", qty: 1 },
      ],
    };
    const diffs = deepCompareEntities(a, b);
    expect(diffs.some((d) => d.keyPath === "inv.length")).toBe(true);
  });

  it("phát hiện sai lệch khi tiền bị đổi (kể cả tăng hay giảm)", () => {
    const a = { name: "bot_1", coin: 100 };
    const b1 = { name: "bot_1", coin: 150 };
    const diffs1 = deepCompareEntities(a, b1);
    expect(diffs1).toHaveLength(1);
    expect(diffs1[0]).toEqual({ keyPath: "coin", before: 100, after: 150 });

    const b2 = { name: "bot_1", coin: 50 };
    const diffs2 = deepCompareEntities(a, b2);
    expect(diffs2).toHaveLength(1);
    expect(diffs2[0]).toEqual({ keyPath: "coin", before: 100, after: 50 });
  });

  it("phát hiện sai lệch khi thay đổi cảnh giới hoặc tầng", () => {
    const a = { name: "bot_1", realm: 1, subRealm: 3 };
    const b = { name: "bot_1", realm: 2, subRealm: 1 };
    const diffs = deepCompareEntities(a, b);
    expect(diffs).toHaveLength(2);
  });

  it("phát hiện khi bị thiếu trường hoặc thêm trường lạ", () => {
    const a = { name: "bot_1", sect: "tinh_van" };
    const bMissing = { name: "bot_1" };
    const diffs1 = deepCompareEntities(a, bMissing);
    expect(diffs1).toHaveLength(1);
    expect(diffs1[0]).toEqual({ keyPath: "sect", before: "tinh_van", after: undefined });

    const bAdded = { name: "bot_1", sect: "tinh_van", extraField: 123 };
    const diffs2 = deepCompareEntities(a, bAdded);
    expect(diffs2).toHaveLength(1);
    expect(diffs2[0]).toEqual({ keyPath: "extraField", before: undefined, after: 123 });
  });
});

describe("kiem-nang-cap: compareDirectorySnapshots", () => {
  it("phát hiện tệp bị mất và tệp bị thêm", () => {
    const snapA = new Map([
      ["bot_1.json", { name: "bot_1", coin: 100 }],
      ["bot_2.json", { name: "bot_2", coin: 200 }],
    ]);
    const snapB = new Map([
      ["bot_1.json", { name: "bot_1", coin: 100 }],
      ["bot_3.json", { name: "bot_3", coin: 300 }],
    ]);

    const res = compareDirectorySnapshots(snapA, snapB);
    expect(res.missingFiles).toEqual(["bot_2.json"]);
    expect(res.addedFiles).toEqual(["bot_3.json"]);
    expect(res.mismatchedFiles).toHaveLength(0);
  });

  it("báo đúng tệp có nội dung khác biệt", () => {
    const snapA = new Map([["bot_1.json", { name: "bot_1", coin: 100 }]]);
    const snapB = new Map([["bot_1.json", { name: "bot_1", coin: 101 }]]);

    const res = compareDirectorySnapshots(snapA, snapB);
    expect(res.mismatchedFiles).toHaveLength(1);
    expect(res.mismatchedFiles[0].file).toBe("bot_1.json");
    expect(res.mismatchedFiles[0].diffs[0].keyPath).toBe("coin");
  });
});

describe("kiem-nang-cap: takeDirectorySnapshot", () => {
  it("N5: ném lỗi khi gặp tệp JSON cú pháp hỏng", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-snap-"));
    try {
      fs.writeFileSync(path.join(tmpDir, "broken.json"), "{ invalid json ");
      expect(() => takeDirectorySnapshot(tmpDir)).toThrow(/chứa JSON không hợp lệ/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("kiem-nang-cap: N1 - Archive Node Modules & Shared Resolution", () => {
  it("ném lỗi nếu không tìm thấy package @tien-gioi/shared", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-archive-"));
    try {
      expect(() => verifyArchiveSharedResolution(tmpDir)).toThrow(
        /Không tìm thấy @tien-gioi\/shared/,
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("ném lỗi nếu @tien-gioi/shared giải quyết ra ngoài archiveDir", () => {
    const tmpArchive = fs.mkdtempSync(path.join(os.tmpdir(), "test-archive-"));
    const outsideShared = fs.mkdtempSync(path.join(os.tmpdir(), "test-outside-shared-"));
    try {
      const scopeDir = path.join(tmpArchive, "node_modules", "@tien-gioi");
      fs.mkdirSync(scopeDir, { recursive: true });
      fs.symlinkSync(outsideShared, path.join(scopeDir, "shared"), "dir");

      expect(() => verifyArchiveSharedResolution(tmpArchive)).toThrow(
        /giải quyết ra ngoài archiveDir/,
      );
    } finally {
      fs.rmSync(tmpArchive, { recursive: true, force: true });
      fs.rmSync(outsideShared, { recursive: true, force: true });
    }
  });

  it("f2: ném lỗi nếu @tien-gioi/shared giải quyết tới thư mục anh em có chung tiền tố tên (archive-evil)", () => {
    const tmpArchive = fs.mkdtempSync(path.join(os.tmpdir(), "test-archive-"));
    const evilShared = fs.mkdtempSync(tmpArchive + "-evil");
    try {
      const scopeDir = path.join(tmpArchive, "node_modules", "@tien-gioi");
      fs.mkdirSync(scopeDir, { recursive: true });
      fs.symlinkSync(evilShared, path.join(scopeDir, "shared"), "dir");

      expect(() => verifyArchiveSharedResolution(tmpArchive)).toThrow(
        /giải quyết ra ngoài archiveDir/,
      );
    } finally {
      fs.rmSync(tmpArchive, { recursive: true, force: true });
      fs.rmSync(evilShared, { recursive: true, force: true });
    }
  });

  it("thiết lập đúng và xác nhận @tien-gioi/shared nằm trọn vẹn trong archiveDir", () => {
    const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "test-repo-"));
    const tmpArchive = fs.mkdtempSync(path.join(os.tmpdir(), "test-archive-"));
    try {
      // Giả lập repo có node_modules với third_party và @tien-gioi
      fs.mkdirSync(path.join(tmpRepo, "node_modules", "some-pkg"), { recursive: true });
      fs.mkdirSync(path.join(tmpRepo, "node_modules", "@tien-gioi"), { recursive: true });

      // Giả lập archive có shared
      fs.mkdirSync(path.join(tmpArchive, "shared"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpArchive, "shared", "package.json"),
        JSON.stringify({ name: "@tien-gioi/shared" }),
      );

      setupArchiveNodeModules(tmpArchive, tmpRepo);

      const resolved = verifyArchiveSharedResolution(tmpArchive);
      expect(resolved).toBe(fs.realpathSync(path.join(tmpArchive, "shared")));
      expect(resolved.startsWith(fs.realpathSync(tmpArchive))).toBe(true);

      // Third-party package cũng được symlink
      expect(fs.existsSync(path.join(tmpArchive, "node_modules", "some-pkg"))).toBe(true);
    } finally {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
      fs.rmSync(tmpArchive, { recursive: true, force: true });
    }
  });
});

describe("kiem-nang-cap: verifyPhase", () => {
  const baseBefore = new Map<string, Record<string, any>>([
    [
      "abc123player.json",
      {
        name: "Bot 001",
        coin: 100,
        realm: 1,
        updatedAt: "2026-11-21T15:04:16.688Z",
        life: { playMs: 10000 },
      },
    ],
    [
      "souls/bot_001.json",
      {
        soulKey: "bot_001",
        reincarnations: 0,
      },
    ],
  ]);

  it("ĐẠT khi tất cả tệp bảo toàn, bot đăng nhập đủ và có bằng chứng ghi nhận updatedAt (chuỗi ISO)", () => {
    const after = new Map<string, Record<string, any>>([
      [
        "abc123player.json",
        {
          name: "Bot 001",
          coin: 100,
          realm: 1,
          updatedAt: "2026-11-21T15:05:16.688Z", // tăng theo từ điển -> server thật sự nạp và ghi lại
          life: { playMs: 10060 }, // tăng do đả tọa
        },
      ],
      [
        "souls/bot_001.json",
        {
          soulKey: "bot_001",
          reincarnations: 0,
        },
      ],
    ]);

    const res = verifyPhase({
      phaseName: "TestPhase",
      snapshotBefore: baseBefore,
      snapshotAfter: after,
      loginCount: 1,
      expectedLogins: 1,
    });

    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("ĐẠT khi chỉ riêng updatedAt mới hơn (chuỗi ISO) trong khi life.playMs giữ nguyên", () => {
    const after = new Map<string, Record<string, any>>([
      [
        "abc123player.json",
        {
          name: "Bot 001",
          coin: 100,
          realm: 1,
          updatedAt: "2026-11-21T15:05:16.688Z", // tăng
          life: { playMs: 10000 }, // giữ nguyên
        },
      ],
      ["souls/bot_001.json", { soulKey: "bot_001", reincarnations: 0 }],
    ]);

    const res = verifyPhase({
      phaseName: "TestPhase",
      snapshotBefore: baseBefore,
      snapshotAfter: after,
      loginCount: 1,
      expectedLogins: 1,
    });

    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("ĐẠT khi updatedAt bằng nhau nhưng life.playMs tăng", () => {
    const after = new Map<string, Record<string, any>>([
      [
        "abc123player.json",
        {
          name: "Bot 001",
          coin: 100,
          realm: 1,
          updatedAt: "2026-11-21T15:04:16.688Z", // không đổi
          life: { playMs: 10060 }, // tăng do đả tọa
        },
      ],
      ["souls/bot_001.json", { soulKey: "bot_001", reincarnations: 0 }],
    ]);

    const res = verifyPhase({
      phaseName: "TestPhase",
      snapshotBefore: baseBefore,
      snapshotAfter: after,
      loginCount: 1,
      expectedLogins: 1,
    });

    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("ĐẠT khi updatedAt kiểu số tăng trong khi life.playMs giữ nguyên", () => {
    const numBefore = new Map<string, Record<string, any>>([
      [
        "abc123player.json",
        { name: "Bot 001", coin: 100, realm: 1, updatedAt: 1000, life: { playMs: 500 } },
      ],
    ]);
    const numAfter = new Map<string, Record<string, any>>([
      [
        "abc123player.json",
        { name: "Bot 001", coin: 100, realm: 1, updatedAt: 1500, life: { playMs: 500 } },
      ],
    ]);

    const res = verifyPhase({
      phaseName: "TestPhase",
      snapshotBefore: numBefore,
      snapshotAfter: numAfter,
      loginCount: 1,
      expectedLogins: 1,
    });

    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("Ca âm 0a: thất bại nếu updatedAt cũ hơn (chuỗi ISO) và life.playMs không tăng", () => {
    const after = new Map<string, Record<string, any>>([
      [
        "abc123player.json",
        {
          name: "Bot 001",
          coin: 100,
          realm: 1,
          updatedAt: "2026-11-21T15:03:00.000Z", // cũ hơn
          life: { playMs: 10000 }, // không tăng
        },
      ],
      ["souls/bot_001.json", { soulKey: "bot_001", reincarnations: 0 }],
    ]);

    const res = verifyPhase({
      phaseName: "TestPhase",
      snapshotBefore: baseBefore,
      snapshotAfter: after,
      loginCount: 1,
      expectedLogins: 1,
    });

    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("không có bằng chứng được server ghi lại"))).toBe(
      true,
    );
  });

  it("Ca âm 0b: thất bại nếu updatedAt kiểu số bị giảm và life.playMs không tăng", () => {
    const numBefore = new Map<string, Record<string, any>>([
      [
        "abc123player.json",
        { name: "Bot 001", coin: 100, realm: 1, updatedAt: 1000, life: { playMs: 500 } },
      ],
    ]);
    const numAfter = new Map<string, Record<string, any>>([
      [
        "abc123player.json",
        { name: "Bot 001", coin: 100, realm: 1, updatedAt: 800, life: { playMs: 500 } },
      ],
    ]);

    const res = verifyPhase({
      phaseName: "TestPhase",
      snapshotBefore: numBefore,
      snapshotAfter: numAfter,
      loginCount: 1,
      expectedLogins: 1,
    });

    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("không có bằng chứng được server ghi lại"))).toBe(
      true,
    );
  });

  it("Ca âm 1: thất bại nếu số bot đăng nhập không đạt expectedLogins", () => {
    const after = new Map<string, Record<string, any>>([
      [
        "abc123player.json",
        {
          name: "Bot 001",
          coin: 100,
          realm: 1,
          updatedAt: "2026-11-21T15:05:16.688Z",
          life: { playMs: 10060 },
        },
      ],
      ["souls/bot_001.json", { soulKey: "bot_001", reincarnations: 0 }],
    ]);

    const res = verifyPhase({
      phaseName: "TestPhase",
      snapshotBefore: baseBefore,
      snapshotAfter: after,
      loginCount: 0, // 0 đăng nhập
      expectedLogins: 1,
    });

    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("Số bot đăng nhập không đủ"))).toBe(true);
  });

  it("Ca âm 2: thất bại nếu có tệp bị mất (missingFiles)", () => {
    const after = new Map<string, Record<string, any>>([
      ["souls/bot_001.json", { soulKey: "bot_001", reincarnations: 0 }],
      // thiếu abc123player.json
    ]);

    const res = verifyPhase({
      phaseName: "TestPhase",
      snapshotBefore: baseBefore,
      snapshotAfter: after,
      loginCount: 1,
      expectedLogins: 1,
    });

    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("Có tệp bị mất"))).toBe(true);
  });

  it("Ca âm 3: thất bại nếu có tệp lạ bị thêm vào (addedFiles)", () => {
    const after = new Map<string, Record<string, any>>([
      [
        "abc123player.json",
        {
          name: "Bot 001",
          coin: 100,
          realm: 1,
          updatedAt: "2026-11-21T15:05:16.688Z",
          life: { playMs: 10060 },
        },
      ],
      ["souls/bot_001.json", { soulKey: "bot_001", reincarnations: 0 }],
      ["la_lung.json", { corrupted: true }],
    ]);

    const res = verifyPhase({
      phaseName: "TestPhase",
      snapshotBefore: baseBefore,
      snapshotAfter: after,
      loginCount: 1,
      expectedLogins: 1,
    });

    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("Có tệp bị thêm bất thường"))).toBe(true);
  });

  it("Ca âm 4: thất bại nếu có trường bị thay đổi giá trị (mismatchedFiles)", () => {
    const after = new Map<string, Record<string, any>>([
      [
        "abc123player.json",
        {
          name: "Bot 001",
          coin: 999, // tiền nhảy lên 999
          realm: 1,
          updatedAt: "2026-11-21T15:05:16.688Z",
          life: { playMs: 10060 },
        },
      ],
      ["souls/bot_001.json", { soulKey: "bot_001", reincarnations: 0 }],
    ]);

    const res = verifyPhase({
      phaseName: "TestPhase",
      snapshotBefore: baseBefore,
      snapshotAfter: after,
      loginCount: 1,
      expectedLogins: 1,
    });

    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("có trường sai lệch"))).toBe(true);
  });

  it("Ca âm 5: thất bại nếu không có bằng chứng server ghi lại (updatedAt và playMs không tăng)", () => {
    const after = new Map<string, Record<string, any>>([
      [
        "abc123player.json",
        {
          name: "Bot 001",
          coin: 100,
          realm: 1,
          updatedAt: "2026-11-21T15:04:16.688Z", // không tăng
          life: { playMs: 10000 }, // không tăng
        },
      ],
      ["souls/bot_001.json", { soulKey: "bot_001", reincarnations: 0 }],
    ]);

    const res = verifyPhase({
      phaseName: "TestPhase",
      snapshotBefore: baseBefore,
      snapshotAfter: after,
      loginCount: 1,
      expectedLogins: 1,
    });

    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("không có bằng chứng được server ghi lại"))).toBe(
      true,
    );
  });
});

describe("kiem-nang-cap: N9 - pickSoakDir & cách ly thư mục dữ liệu soak", () => {
  it("chọn đúng thư mục soak duy nhất trong thư mục tạm", () => {
    const soakTmp = "/tmp/tien-gioi-rc-soaktmp-xyz123";
    const entries = ["tien-gioi-soak-abc456", "some-other-file.log"];
    const picked = pickSoakDir(soakTmp, entries);
    expect(picked).toBe(path.join(soakTmp, "tien-gioi-soak-abc456"));
  });

  it("ném lỗi nếu không tìm thấy thư mục tien-gioi-soak-* nào", () => {
    const soakTmp = "/tmp/tien-gioi-rc-soaktmp-xyz123";
    const entries = ["not-a-soak-dir", "random.json"];
    expect(() => pickSoakDir(soakTmp, entries)).toThrow(
      /Kỳ vọng đúng 1 thư mục soak trong .* nhưng tìm thấy 0/,
    );
  });

  it("ném lỗi nếu có nhiều hơn 1 thư mục tien-gioi-soak-*", () => {
    const soakTmp = "/tmp/tien-gioi-rc-soaktmp-xyz123";
    const entries = ["tien-gioi-soak-111", "tien-gioi-soak-222"];
    expect(() => pickSoakDir(soakTmp, entries)).toThrow(
      /Kỳ vọng đúng 1 thư mục soak trong .* nhưng tìm thấy 2/,
    );
  });
});
