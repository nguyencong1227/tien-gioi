import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  readPngDimensions,
  checkBundleGzip,
  checkAtlasTileset,
  calculateStaticTextureMemory,
  checkPerfBudget,
} from "./check-perf-budget.mjs";

describe("M5.1: check-perf-budget (Kiểm tra ngân sách hiệu năng tĩnh)", () => {
  it("readPngDimensions: đọc chính xác kích thước PNG từ header IHDR", () => {
    // Tạo buffer PNG hợp lệ tối thiểu 24 bytes
    const buf = Buffer.alloc(24);
    // Signature: 89 50 4E 47 0D 0A 1A 0A
    buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    // Length: 13 bytes
    buf.writeUInt32BE(13, 8);
    // Type: IHDR
    buf.set([0x49, 0x48, 0x44, 0x52], 12);
    // Width: 640
    buf.writeUInt32BE(640, 16);
    // Height: 480
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
      // 1. Tạo tệp bundle bình thường (10 KB)
      const normalContent = Buffer.alloc(10 * 1024, "a");
      fs.writeFileSync(path.join(assetsDir, "index-abc12345.js"), normalContent);

      const resNormal = checkBundleGzip(tmpDir, 520);
      expect(resNormal.ok).toBe(true);
      expect(resNormal.file).toBe("index-abc12345.js");
      expect(resNormal.rawBytes).toBe(10 * 1024);
      expect(resNormal.gzipKb).toBeLessThan(1);

      // 2. Đột biến đỏ: Ngân sách bị siết quá chặt (ví dụ 0.01 KB) -> Bắt buộc phải báo vi phạm
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
      // Giả lập atlas.png (200 KB), tileset.png (100 KB), atlas.json (50 KB) = 350 KB
      fs.writeFileSync(path.join(tmpDir, "atlas.png"), Buffer.alloc(200 * 1024));
      fs.writeFileSync(path.join(tmpDir, "tileset.png"), Buffer.alloc(100 * 1024));
      fs.writeFileSync(path.join(tmpDir, "atlas.json"), Buffer.alloc(50 * 1024));

      const res = checkAtlasTileset(tmpDir, 1024);
      expect(res.ok).toBe(true);
      expect(res.totalKb).toBeCloseTo(350, 0);
      expect(res.files.length).toBe(3);

      // Đột biến đỏ: Ngân sách bị siết xuống 300 KB -> Bắt buộc báo vi phạm
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
      // Tạo một ảnh PNG giả lập 100x100 (chiếm 100*100*4 = 40.000 bytes = ~0.038 MB)
      const pngBuf = Buffer.alloc(24);
      pngBuf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      pngBuf.writeUInt32BE(100, 16);
      pngBuf.writeUInt32BE(100, 20);
      fs.writeFileSync(path.join(tmpDir, "sample.png"), pngBuf);

      const res = calculateStaticTextureMemory(tmpDir);
      // Gồm: sample.png (40.000 B) + fx-font (576*1008*4 = 2.322.432 B) + fx-atlas (192*32*4 = 24.576 B) + decor-tileset (320*32*4 = 40.960 B) + light-vignette (128*128*4 = 65.536 B) + light-white (4*4*4 = 64 B) + blob-shadow (64*28*4 = 7.168 B)
      const expectedBytes = 40000 + 2322432 + 24576 + 40960 + 65536 + 64 + 7168;
      expect(res.totalBytes).toBe(expectedBytes);
      expect(res.items.some((i) => i.name === "sample.png")).toBe(true);
      expect(res.items.some((i) => i.name.includes("fx-font"))).toBe(true);
      expect(res.items.some((i) => i.name.includes("fx-atlas"))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("checkPerfBudget: tích hợp toàn diện và kiểm tra đột biến đỏ khi vượt ngưỡng", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-budget-all-"));
    const distDir = path.join(tmpDir, "dist");
    const assetsDir = path.join(tmpDir, "assets");
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
        }),
      );

      const passRes = checkPerfBudget({ budgetPath, distDir, assetsDir });
      expect(passRes.ok).toBe(true);
      expect(passRes.errors.length).toBe(0);

      // 2. Đột biến đỏ: Cấu hình budget cực thấp làm cả 3 chỉ số đều đỏ
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
