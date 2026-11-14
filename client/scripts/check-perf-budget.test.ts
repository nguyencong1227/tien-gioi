import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  readPngDimensions,
  checkBundleGzip,
  checkAtlasTileset,
  calculateStaticTextureMemory,
  calculateEffectiveFileSize,
  checkPacksBudget,
  checkPerfBudget,
} from "./check-perf-budget.mjs";
import { writePacksManifest } from "./build-packs.mjs";

describe("M5.1: check-perf-budget (Kiểm tra ngân sách hiệu năng tĩnh)", () => {
  it("readPngDimensions: đọc chính xác kích thước PNG từ header IHDR", () => {
    const buf = Buffer.alloc(24);
    buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    buf.writeUInt32BE(13, 8);
    buf.set([0x49, 0x48, 0x44, 0x52], 12);
    buf.writeUInt32BE(640, 16);
    buf.writeUInt32BE(480, 20);

    const dim = readPngDimensions(buf);
    expect(dim).toEqual({ width: 640, height: 480 });
  });

  it("readPngDimensions: từ chối buffer ngắn hoặc sai magic byte", () => {
    expect(readPngDimensions(null as unknown as Buffer)).toBeNull();
    expect(readPngDimensions(Buffer.alloc(10))).toBeNull();

    const badMagic = Buffer.alloc(24);
    badMagic.set([0x00, 0x11, 0x22, 0x33], 0);
    expect(readPngDimensions(badMagic)).toBeNull();
  });

  it("checkBundleGzip: tính đúng kích thước gzip và phát hiện vi phạm ngân sách (Đột biến đỏ)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-dist-"));
    const assetsDir = path.join(tmpDir, "assets");
    fs.mkdirSync(assetsDir, { recursive: true });

    try {
      const normalContent = Buffer.alloc(10 * 1024, "a");
      fs.writeFileSync(path.join(assetsDir, "index-abc12345.js"), normalContent);

      const resNormal = checkBundleGzip(tmpDir, 520);
      expect(resNormal.ok).toBe(true);
      expect(resNormal.file).toBe("index-abc12345.js");
      expect(resNormal.rawBytes).toBe(10 * 1024);
      expect(resNormal.gzipKb).toBeLessThan(1);

      const resMutated = checkBundleGzip(tmpDir, 0.01);
      expect(resMutated.ok).toBe(false);
      expect(resMutated.gzipKb).toBeGreaterThan(0.01);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("checkBundleGzip: ném lỗi nếu thiếu thư mục assets hoặc không có index-*.js", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-dist-empty-"));
    try {
      expect(() => checkBundleGzip(tmpDir, 520)).toThrow(/dist\/assets không tồn tại/);

      fs.mkdirSync(path.join(tmpDir, "assets"));
      expect(() => checkBundleGzip(tmpDir, 520)).toThrow(/Không tìm thấy tệp bundle JS chính/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("checkAtlasTileset: tính tổng dung lượng và bắt lỗi khi vượt ngân sách (Đột biến đỏ)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-assets-"));
    try {
      fs.writeFileSync(path.join(tmpDir, "atlas.png"), Buffer.alloc(200 * 1024));
      fs.writeFileSync(path.join(tmpDir, "tileset.png"), Buffer.alloc(100 * 1024));
      fs.writeFileSync(path.join(tmpDir, "atlas.json"), Buffer.alloc(50 * 1024));

      const res = checkAtlasTileset(tmpDir, 1024);
      expect(res.ok).toBe(true);
      expect(res.totalKb).toBeCloseTo(350, 0);
      expect(res.files.length).toBe(3);

      const resExceeded = checkAtlasTileset(tmpDir, 300);
      expect(resExceeded.ok).toBe(false);
      expect(resExceeded.totalKb).toBeGreaterThan(300);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("calculateStaticTextureMemory: tính chính xác VRAM RGBA từ ảnh và texture sinh bằng mã", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-vram-"));
    try {
      const pngBuf = Buffer.alloc(24);
      pngBuf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      pngBuf.writeUInt32BE(100, 16);
      pngBuf.writeUInt32BE(100, 20);
      fs.writeFileSync(path.join(tmpDir, "sample.png"), pngBuf);

      const res = calculateStaticTextureMemory(tmpDir);
      const expectedBytes = 40000 + 2322432 + 24576 + 40960 + 65536 + 64 + 65536 + 16384 + 7168;
      expect(res.totalBytes).toBe(expectedBytes);
      expect(res.items.some((i) => i.name === "sample.png")).toBe(true);
      expect(res.items.some((i) => i.name.includes("fx-font"))).toBe(true);
      expect(res.items.some((i) => i.name.includes("fx-atlas"))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("calculateEffectiveFileSize: tính byte đĩa cho ảnh/âm thanh và gzip cho văn bản", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-eff-"));
    try {
      const imgPath = path.join(tmpDir, "test.webp");
      const imgBuf = Buffer.alloc(1000, 0x12);
      fs.writeFileSync(imgPath, imgBuf);
      expect(calculateEffectiveFileSize(imgPath)).toBe(1000);

      const jsonPath = path.join(tmpDir, "test.json");
      const jsonBuf = Buffer.from(JSON.stringify({ repeat: "a".repeat(2000) }));
      fs.writeFileSync(jsonPath, jsonBuf);
      // Gzip văn bản lặp lại phải nhỏ hơn nhiều kích thước thô
      const eff = calculateEffectiveFileSize(jsonPath);
      expect(eff).toBeLessThan(jsonBuf.length);
      expect(eff).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("checkPacksBudget: hợp lệ khi không có packs và manifest (manifest rỗng là hợp lệ)", () => {
    const nonExistent = path.join(os.tmpdir(), "tg-no-packs-" + Date.now());
    const res = checkPacksBudget({
      packsDir: path.join(nonExistent, "packs"),
      manifestPath: path.join(nonExistent, "manifest.json"),
      budgetPacks: {
        core: { maxKb: 2048 },
        map: { maxKb: 2048 },
        icons: { maxKb: 3072 },
        audio: { maxKb: 5120 },
        hdMaxFactor: 3,
      },
    });
    expect(res.ok).toBe(true);
    expect(res.packs).toHaveLength(0);
    expect(res.errors).toHaveLength(0);
  });

  it("checkPacksBudget: kiểm tra ngân sách gói, hdMaxFactor và tính toàn vẹn 2 chiều", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-packs-budget-"));
    const packsDir = path.join(tmpDir, "packs");
    const manifestPath = path.join(packsDir, "manifest.json");

    try {
      // 1. Tạo gói core (100 KB)
      const coreDir = path.join(packsDir, "core");
      fs.mkdirSync(coreDir, { recursive: true });
      fs.writeFileSync(path.join(coreDir, "ui.webp"), Buffer.alloc(100 * 1024));

      // 2. Tạo gói hd-core (250 KB <= 3x core = 300 KB -> hợp lệ)
      const hdDir = path.join(packsDir, "hd-core");
      fs.mkdirSync(hdDir, { recursive: true });
      fs.writeFileSync(path.join(hdDir, "ui_2x.webp"), Buffer.alloc(250 * 1024));

      // Ghi manifest
      writePacksManifest(packsDir, manifestPath);

      const budgetPacks = {
        core: { maxKb: 2048 },
        map: { maxKb: 2048 },
        icons: { maxKb: 3072 },
        audio: { maxKb: 5120 },
        hdMaxFactor: 3,
      };

      // Kiểm tra hợp lệ
      const resPass = checkPacksBudget({ packsDir, manifestPath, budgetPacks });
      expect(resPass.ok).toBe(true);
      expect(resPass.errors).toHaveLength(0);
      expect(resPass.packs).toHaveLength(2);

      // Đột biến đỏ 1: Gói core vượt trần (siết trần core xuống 50 KB) -> Vi phạm
      const strictBudget = { ...budgetPacks, core: { maxKb: 50 } };
      const resCoreOver = checkPacksBudget({
        packsDir,
        manifestPath,
        budgetPacks: strictBudget,
      });
      expect(resCoreOver.ok).toBe(false);
      expect(resCoreOver.errors[0]).toMatch(/Gói 'core'.*vượt ngân sách/);

      // Đột biến đỏ 2: Gói HD vượt quá hdMaxFactor (ví dụ hdMaxFactor = 2, trong khi 250 KB > 2 * 100 KB)
      const strictHdBudget = { ...budgetPacks, hdMaxFactor: 2 };
      const resHdOver = checkPacksBudget({
        packsDir,
        manifestPath,
        budgetPacks: strictHdBudget,
      });
      expect(resHdOver.ok).toBe(false);
      expect(resHdOver.errors[0]).toMatch(/Gói 'hd:core'.*vượt ngân sách/);

      // Đột biến đỏ 3: Có tệp trên đĩa không có trong manifest
      fs.writeFileSync(path.join(coreDir, "untracked.png"), Buffer.alloc(100));
      const resUntracked = checkPacksBudget({ packsDir, manifestPath, budgetPacks });
      expect(resUntracked.ok).toBe(false);
      expect(
        resUntracked.errors.some((e) => e.includes("không được khai báo trong manifest")),
      ).toBe(true);

      // Xoá tệp untracked
      fs.unlinkSync(path.join(coreDir, "untracked.png"));

      // Đột biến đỏ 4: Tệp trên đĩa bị sửa nội dung (sai SHA-256)
      fs.writeFileSync(path.join(coreDir, "ui.webp"), Buffer.from("altered content"));
      const resTampered = checkPacksBudget({ packsDir, manifestPath, budgetPacks });
      expect(resTampered.ok).toBe(false);
      expect(resTampered.errors.some((e) => e.includes("sai mã băm SHA-256"))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("checkPerfBudget: tích hợp toàn diện gồm cả packs", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-budget-all-"));
    const distDir = path.join(tmpDir, "dist");
    const assetsDir = path.join(tmpDir, "assets");
    const packsDir = path.join(tmpDir, "packs");
    const manifestPath = path.join(packsDir, "manifest.json");
    const budgetPath = path.join(tmpDir, "perf-budget.json");

    fs.mkdirSync(path.join(distDir, "assets"), { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });

    try {
      // Bundle hợp lệ
      fs.writeFileSync(path.join(distDir, "assets/index-sample.js"), Buffer.alloc(5000, "x"));
      // Atlas hợp lệ
      fs.writeFileSync(path.join(assetsDir, "atlas.png"), Buffer.alloc(5000));

      // 1. Budget hợp lệ
      fs.writeFileSync(
        budgetPath,
        JSON.stringify({
          static: {
            bundleGzipKb: 520,
            atlasTilesetKb: 1024,
            textureMemoryMb: { low: 48, mid: 80, high: 128 },
          },
          packs: {
            core: { maxKb: 2048 },
            map: { maxKb: 2048 },
            icons: { maxKb: 3072 },
            audio: { maxKb: 5120 },
            hdMaxFactor: 3,
          },
        }),
      );

      const passRes = checkPerfBudget({
        budgetPath,
        distDir,
        assetsDir,
        packsDir,
        manifestPath,
      });
      expect(passRes.ok).toBe(true);
      expect(passRes.errors.length).toBe(0);

      // 2. Đột biến đỏ: Cấu hình budget cực thấp làm cả 4 chỉ số đều đỏ
      fs.writeFileSync(
        budgetPath,
        JSON.stringify({
          static: {
            bundleGzipKb: 0.001,
            atlasTilesetKb: 0.001,
            textureMemoryMb: { low: 0.001, mid: 0.001, high: 0.001 },
          },
        }),
      );

      const failRes = checkPerfBudget({ budgetPath, distDir, assetsDir });
      expect(failRes.ok).toBe(false);
      expect(failRes.errors.length).toBe(3);
      expect(failRes.errors[0]).toMatch(/Gói JS chính.*vượt ngân sách/);
      expect(failRes.errors[1]).toMatch(/Tổng dung lượng atlas.*vượt ngân sách/);
      expect(failRes.errors[2]).toMatch(/Tổng bộ nhớ texture.*vượt ngân sách/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
