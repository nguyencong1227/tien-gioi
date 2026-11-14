import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  readPngDimensions,
  readWebpDimensions,
  readImageDimensions,
  validatePackFilePath,
  checkWorstCaseTextureMemoryByTier,
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

  it("readWebpDimensions: đọc chính xác kích thước WebP (VP8X, VP8L, VP8) và từ chối buffer hỏng", () => {
    // 1. VP8X (Extended WebP)
    const bufVp8x = Buffer.alloc(30);
    bufVp8x.write("RIFF", 0, "ascii");
    bufVp8x.writeUInt32LE(22, 4);
    bufVp8x.write("WEBP", 8, "ascii");
    bufVp8x.write("VP8X", 12, "ascii");
    bufVp8x.writeUInt32LE(10, 16);
    // Canvas width 800 -> ghi 799 (24-bit LE: 0x00031f)
    bufVp8x[24] = 799 & 0xff;
    bufVp8x[25] = (799 >> 8) & 0xff;
    bufVp8x[26] = (799 >> 16) & 0xff;
    // Canvas height 600 -> ghi 599 (24-bit LE: 0x000257)
    bufVp8x[27] = 599 & 0xff;
    bufVp8x[28] = (599 >> 8) & 0xff;
    bufVp8x[29] = (599 >> 16) & 0xff;

    const dimVp8x = readWebpDimensions(bufVp8x);
    expect(dimVp8x).toEqual({ width: 800, height: 600 });

    // 2. VP8L (Lossless WebP)
    const bufVp8l = Buffer.alloc(25);
    bufVp8l.write("RIFF", 0, "ascii");
    bufVp8l.writeUInt32LE(17, 4);
    bufVp8l.write("WEBP", 8, "ascii");
    bufVp8l.write("VP8L", 12, "ascii");
    bufVp8l.writeUInt32LE(5, 16);
    bufVp8l[20] = 0x2f; // Signature
    // 14-bit width 1024 -> ghi 1023 (0x3ff); 14-bit height 768 -> ghi 767 (0x2ff)
    const packedBits = (1023 & 0x3fff) | ((767 & 0x3fff) << 14);
    bufVp8l.writeUInt32LE(packedBits, 21);

    const dimVp8l = readWebpDimensions(bufVp8l);
    expect(dimVp8l).toEqual({ width: 1024, height: 768 });

    // 3. VP8 (Lossy WebP)
    const bufVp8 = Buffer.alloc(30);
    bufVp8.write("RIFF", 0, "ascii");
    bufVp8.writeUInt32LE(22, 4);
    bufVp8.write("WEBP", 8, "ascii");
    bufVp8.write("VP8 ", 12, "ascii");
    bufVp8.writeUInt32LE(10, 16);
    bufVp8[23] = 0x9d;
    bufVp8[24] = 0x01;
    bufVp8[25] = 0x2a; // VP8 start code
    bufVp8.writeUInt16LE(320, 26);
    bufVp8.writeUInt16LE(240, 28);

    const dimVp8 = readWebpDimensions(bufVp8);
    expect(dimVp8).toEqual({ width: 320, height: 240 });

    // 4. Trường hợp lỗi
    expect(readWebpDimensions(null as unknown as Buffer)).toBeNull();
    expect(readWebpDimensions(Buffer.alloc(10))).toBeNull();
    const badRiff = Buffer.alloc(30);
    badRiff.write("NOPE", 0, "ascii");
    expect(readWebpDimensions(badRiff)).toBeNull();

    // VP8L sai signature
    bufVp8l[20] = 0x00;
    expect(readWebpDimensions(bufVp8l)).toBeNull();

    // VP8 sai sync code
    bufVp8[23] = 0x00;
    expect(readWebpDimensions(bufVp8)).toBeNull();
  });

  it("readImageDimensions: tự động nhận diện đuôi tệp PNG và WebP", () => {
    const pngBuf = Buffer.alloc(24);
    pngBuf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    pngBuf.writeUInt32BE(13, 8);
    pngBuf.set([0x49, 0x48, 0x44, 0x52], 12);
    pngBuf.writeUInt32BE(50, 16);
    pngBuf.writeUInt32BE(50, 20);

    expect(readImageDimensions(pngBuf, ".png")).toEqual({ width: 50, height: 50 });
    expect(readImageDimensions(pngBuf)).toEqual({ width: 50, height: 50 });
    expect(readImageDimensions(Buffer.alloc(10), ".unknown")).toBeNull();
  });

  it("validatePackFilePath: phát hiện các đường dẫn vi phạm luật client", () => {
    // Hợp lệ
    expect(validatePackFilePath("core/ui.png")).toBeNull();
    expect(validatePackFilePath("map-hac_phong/vktt/tileset.webp")).toBeNull();

    // Vi phạm
    expect(validatePackFilePath("")).toMatch(/rỗng/);
    expect(validatePackFilePath("/core/ui.png")).toMatch(/ký tự cấm/);
    expect(validatePackFilePath("core\\ui.png")).toMatch(/ký tự cấm/);
    expect(validatePackFilePath("core/ui.png?v=123")).toMatch(/ký tự cấm/);
    expect(validatePackFilePath("core/ui.png#tag")).toMatch(/ký tự cấm/);
    expect(validatePackFilePath("core/../ui.png")).toMatch(/không hợp lệ/);
    expect(validatePackFilePath("core/./ui.png")).toMatch(/không hợp lệ/);
    expect(validatePackFilePath("core//ui.png")).toMatch(/không hợp lệ/);
    expect(validatePackFilePath("a".repeat(201))).toMatch(/vượt quá giới hạn tối đa 200/);
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
      pngBuf.set([0x49, 0x48, 0x44, 0x52], 12);
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
        map: { maxKb: 1024 },
        icons: { maxKb: 3072 },
        audio: { maxKb: 5120 },
        hdMaxFactor: 3,
      },
    });
    expect(res.ok).toBe(true);
    expect(res.packs).toHaveLength(0);
    expect(res.errors).toHaveLength(0);
  });

  it("checkPacksBudget: phân biệt rõ ràng 4 loại gói với 4 hạn mức khác nhau (core 2048, map 1024, icons 3072, audio 5120)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-diff-limits-"));
    const packsDir = path.join(tmpDir, "packs");
    const manifestPath = path.join(packsDir, "manifest.json");

    try {
      // 4 hạn mức hoàn toàn khác số:
      const budgetPacks = {
        core: { maxKb: 2048 },
        map: { maxKb: 1024 },
        icons: { maxKb: 3072 },
        audio: { maxKb: 5120 },
        hdMaxFactor: 3,
      };

      // 1. Tạo gói map-hac_phong có dung lượng 1200 KB (lớn hơn trần map 1024 KB nhưng nhỏ hơn trần core 2048 KB)
      const mapDir = path.join(packsDir, "map-hac_phong");
      fs.mkdirSync(mapDir, { recursive: true });
      fs.writeFileSync(path.join(mapDir, "tileset.webp"), Buffer.alloc(1200 * 1024));

      writePacksManifest(packsDir, manifestPath);

      // Phải BÁO ĐỎ vì vượt 1024 KB của map (chứng minh không đọc nhầm trần 2048 KB của core)
      const res = checkPacksBudget({ packsDir, manifestPath, budgetPacks });
      expect(res.ok).toBe(false);
      expect(
        res.errors.some((e) => e.includes("Gói 'map:hac_phong'") && e.includes("1024 KB")),
      ).toBe(true);

      // Thêm gói icons 2500 KB (<= 3072 KB) và audio 4000 KB (<= 5120 KB)
      const iconsDir = path.join(packsDir, "icons");
      fs.mkdirSync(iconsDir, { recursive: true });
      fs.writeFileSync(path.join(iconsDir, "sword.webp"), Buffer.alloc(2500 * 1024));

      const audioDir = path.join(packsDir, "audio");
      fs.mkdirSync(audioDir, { recursive: true });
      fs.writeFileSync(path.join(audioDir, "bgm.ogg"), Buffer.alloc(4000 * 1024));

      writePacksManifest(packsDir, manifestPath);

      const resAll = checkPacksBudget({ packsDir, manifestPath, budgetPacks });
      const iconsPack = resAll.packs.find((p) => p.id === "icons");
      const audioPack = resAll.packs.find((p) => p.id === "audio");
      expect(iconsPack?.ok).toBe(true);
      expect(iconsPack?.limitKb).toBe(3072);
      expect(audioPack?.ok).toBe(true);
      expect(audioPack?.limitKb).toBe(5120);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("checkPacksBudget: phát hiện các lỗi vi phạm N1 từ manifest (id sai, đường dẫn chứa ký tự cấm)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-packs-n1-"));
    const manifestPath = path.join(tmpDir, "manifest.json");

    try {
      const budgetPacks = {
        core: { maxKb: 2048 },
        map: { maxKb: 1024 },
        icons: { maxKb: 3072 },
        audio: { maxKb: 5120 },
      };

      // Manifest chứa ID không hợp lệ và đường dẫn tệp chứa ký tự cấm (?, #, \, ..)
      const badManifest = {
        packs: [
          {
            id: "core@bad",
            kind: "core",
            files: [
              {
                path: "core/ui.png?v=123",
                bytes: 100,
                sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
              },
              {
                path: "core\\ui.png",
                bytes: 100,
                sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
              },
              {
                path: "core/../ui.png",
                bytes: 100,
                sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
              },
            ],
            bytes: 300,
          },
        ],
      };
      fs.writeFileSync(manifestPath, JSON.stringify(badManifest));

      const res = checkPacksBudget({
        manifestPath,
        budgetPacks,
      });

      expect(res.ok).toBe(false);
      expect(res.errors.some((e) => e.includes("Id gói 'core@bad' không hợp lệ"))).toBe(true);
      expect(res.errors.some((e) => e.includes("ký tự cấm"))).toBe(true);
      expect(res.errors.some((e) => e.includes("không hợp lệ"))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("checkWorstCaseTextureMemoryByTier: tính chính xác VRAM ca xấu nhất cho từng bậc đồ hoạ (N3)", () => {
    // Giả lập static = 10 MB (10 * 1024 * 1024 bytes)
    const staticBytes = 10 * 1024 * 1024;

    const mockPacks = [
      { id: "core", kind: "core", vramBytes: 15 * 1024 * 1024 },
      { id: "icons", kind: "icons", vramBytes: 5 * 1024 * 1024 },
      { id: "map:hac_phong", kind: "map", vramBytes: 12 * 1024 * 1024 },
      { id: "map:lac_ha", kind: "map", vramBytes: 8 * 1024 * 1024 },
      // Gói HD cho ultra:
      { id: "hd:core", kind: "hd", vramBytes: 40 * 1024 * 1024 },
      { id: "hd:icons", kind: "hd", vramBytes: 15 * 1024 * 1024 },
      { id: "hd:map:hac_phong", kind: "hd", vramBytes: 30 * 1024 * 1024 },
    ];

    // Bậc Thấp / Vừa / Cao: static(10) + core(15) + icons(5) + maxMap(12) = 42 MB
    // Bậc Rất cao (ultra): static(10) + hd:core(40) + hd:icons(15) + maxHdMap(30) = 95 MB
    const res = checkWorstCaseTextureMemoryByTier({
      staticTextureBytes: staticBytes,
      packs: mockPacks,
      tierLimits: { low: 48, mid: 80, high: 256, ultra: 512 },
    });

    expect(res.ok).toBe(true);
    expect(res.tiers.low.totalMb).toBe(42);
    expect(res.tiers.low.ok).toBe(true);
    expect(res.tiers.mid.totalMb).toBe(42);
    expect(res.tiers.high.totalMb).toBe(42);
    expect(res.tiers.ultra.totalMb).toBe(95);
    expect(res.tiers.ultra.ok).toBe(true);

    // Đột biến đỏ: Khi VRAM vượt trần bậc Thấp (ví dụ hạ trần low xuống 40 MB < 42 MB)
    const resOverLow = checkWorstCaseTextureMemoryByTier({
      staticTextureBytes: staticBytes,
      packs: mockPacks,
      tierLimits: { low: 40, mid: 80, high: 256, ultra: 512 },
    });
    expect(resOverLow.ok).toBe(false);
    expect(resOverLow.errors[0]).toMatch(/ở bậc low.*vượt ngân sách 40 MB/);
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
      // Gồm 3 vi phạm tĩnh cơ bản + các vi phạm VRAM theo bậc
      expect(failRes.errors.length).toBeGreaterThanOrEqual(3);
      expect(failRes.errors.some((e) => e.includes("Gói JS chính"))).toBe(true);
      expect(failRes.errors.some((e) => e.includes("Tổng dung lượng atlas"))).toBe(true);
      expect(failRes.errors.some((e) => e.includes("Tổng bộ nhớ texture"))).toBe(true);
      expect(failRes.errors.some((e) => e.includes("Bộ nhớ texture ca xấu nhất"))).toBe(true);
      expect(failRes.worstCaseTexture.ok).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
