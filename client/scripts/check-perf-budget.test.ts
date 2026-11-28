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
  checkTotalJsGzip,
  MAP_FILES_CHUNK_RE,
  findStartupChunk,
  checkAtlasTileset,
  checkAiAssets,
  DEFAULT_AI_LIMITS,
  DEFAULT_ART_FILE_KB,
  DEFAULT_ART_PACK_KB,
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

  it("findStartupChunk / checkBundleGzip: gói KHỞI ĐỘNG là chunk index.html nạp, KHÔNG phải tệp lớn nhất (#1097)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-dist-startup-"));
    const assetsDir = path.join(tmpDir, "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    try {
      // chunk khởi động nhỏ; một chunk `index-*.js` khác (tải sau) LỚN hơn: cách cũ (lớn nhất) sẽ chọn nhầm
      fs.writeFileSync(path.join(assetsDir, "index-start111.js"), Buffer.alloc(2 * 1024, "a"));
      fs.writeFileSync(
        path.join(assetsDir, "index-later222.js"),
        Buffer.from(Array.from({ length: 200 * 1024 }, (_, i) => (i * 7919) % 251)),
      );
      fs.writeFileSync(
        path.join(tmpDir, "index.html"),
        '<html><head><script type="module" crossorigin src="/assets/index-start111.js"></script></head></html>',
      );
      const names = fs.readdirSync(assetsDir);
      expect(findStartupChunk(tmpDir, names)).toBe("index-start111.js");
      const r = checkBundleGzip(tmpDir, 520);
      expect(r.file).toBe("index-start111.js");
      expect(r.rawBytes).toBe(2 * 1024);
      // không có index.html -> dự phòng: tệp index-*.js lớn nhất
      fs.rmSync(path.join(tmpDir, "index.html"));
      expect(findStartupChunk(tmpDir, names)).toBeNull();
      expect(checkBundleGzip(tmpDir, 520).file).toBe("index-later222.js");
      // index.html trỏ tới tệp không có -> cũng dự phòng
      fs.writeFileSync(
        path.join(tmpDir, "index.html"),
        '<script type="module" src="/assets/index-khongco.js"></script>',
      );
      expect(findStartupChunk(tmpDir, names)).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("checkTotalJsGzip: cộng gzip MỌI tệp .js (không chỉ gói khởi động) và bắt vượt trần (Đột biến đỏ)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-dist-total-"));
    const assetsDir = path.join(tmpDir, "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    try {
      // byte giả ngẫu nhiên (LCG có hạt) để gzip không nén được gần hết
      const noise = (n: number, seed: number) => {
        let x = seed;
        return Buffer.from(
          Array.from({ length: n }, () => {
            x = (Math.imul(x, 1103515245) + 12345) >>> 0;
            return (x >>> 16) & 255;
          }),
        );
      };
      fs.writeFileSync(path.join(assetsDir, "index-a.js"), noise(20 * 1024, 31));
      fs.writeFileSync(path.join(assetsDir, "phaser-b.js"), noise(40 * 1024, 37));
      fs.writeFileSync(path.join(assetsDir, "style.css"), noise(30 * 1024, 41)); // không phải JS: không tính
      fs.writeFileSync(path.join(assetsDir, "x.js.map"), noise(30 * 1024, 43)); // bản đồ nguồn: không tính
      const r = checkTotalJsGzip(tmpDir, 1000);
      expect(r.files.map((f) => f.file)).toEqual(["index-a.js", "phaser-b.js"]);
      expect(r.gzipKb).toBeGreaterThan(40);
      expect(r.gzipKb).toBeCloseTo(
        r.files.reduce((a, f) => a + f.gzipKb, 0),
        1,
      );
      expect(r.ok).toBe(true);
      expect(checkTotalJsGzip(tmpDir, 10).ok).toBe(false);
      expect(() => checkTotalJsGzip(path.join(tmpDir, "khong-co"), 10)).toThrow(/không tồn tại/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("perf-budget.json thật: có HAI trần (khởi động + tổng JS), khởi động nhỏ hơn tổng, tổng giữ 560 KB (#1088: 540; S3a #1206 nâng +8 cho tệp bản đồ Tiled nhận ở client; 28/11/2026 nâng +12 cho nội dung chương 5-6, #1465 / #1466)", () => {
    const budget = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../perf-budget.json"), "utf-8"),
    ) as { static: Record<string, number> };
    expect(typeof budget.static.startupGzipKb).toBe("number");
    expect(typeof budget.static.totalJsGzipKb).toBe("number");
    expect(budget.static.startupGzipKb).toBeLessThan(budget.static.totalJsGzipKb!);
    expect(budget.static.startupGzipKb).toBeLessThanOrEqual(500);
    expect(budget.static.totalJsGzipKb).toBeLessThanOrEqual(560);
    expect(budget.static.bundleGzipKb).toBeUndefined();
  });

  it("perf-budget.json thật (#1283): trần RIÊNG cho dữ liệu bản đồ có mặt, > 0 và <= 48 KB (nâng thì phải sửa test này có chủ ý)", () => {
    const budget = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../perf-budget.json"), "utf-8"),
    ) as { static: Record<string, number> };
    expect(typeof budget.static.mapFilesGzipKb).toBe("number");
    expect(budget.static.mapFilesGzipKb).toBeGreaterThan(0);
    expect(budget.static.mapFilesGzipKb).toBeLessThanOrEqual(48);
    // dữ liệu bản đồ nhỏ hơn trần MÃ: không thể coi nó là chỗ giấu mã thoải mái
    expect(budget.static.mapFilesGzipKb).toBeLessThan(budget.static.totalJsGzipKb!);
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

  it("checkPacksBudget: gói ảnh minh hoạ AI `art` có trần riêng (512 KB mỗi gói, 60 KB mỗi ảnh), KHÔNG rơi về trần 2048 KB của core", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-art-limits-"));
    const packsDir = path.join(tmpDir, "packs");
    const manifestPath = path.join(packsDir, "manifest.json");
    try {
      const budgetPacks = {
        core: { maxKb: 2048 },
        map: { maxKb: 1024 },
        icons: { maxKb: 3072 },
        audio: { maxKb: 5120 },
        art: { maxKb: 512, maxFileKb: 60 },
      };
      const art = path.join(packsDir, "art-trum");
      fs.mkdirSync(art, { recursive: true });
      // 4 thẻ trùm 30 KB = 120 KB: hợp lệ
      for (const n of ["a", "b", "c", "d"])
        fs.writeFileSync(path.join(art, `${n}.webp`), Buffer.alloc(30 * 1024));
      writePacksManifest(packsDir, manifestPath);
      let res = checkPacksBudget({ packsDir, manifestPath, budgetPacks });
      expect(res.errors).toEqual([]);
      expect(res.packs.find((p) => p.id === "art:trum")?.limitKb).toBe(512);
      // Cả gói 600 KB (vượt 512, còn dưới 2048 của core): ĐỎ, chứng minh không đọc nhầm trần core
      for (const n of ["e", "f", "g", "h", "i", "j", "k", "l", "m", "n"])
        fs.writeFileSync(path.join(art, `${n}.webp`), Buffer.alloc(48 * 1024));
      writePacksManifest(packsDir, manifestPath);
      res = checkPacksBudget({ packsDir, manifestPath, budgetPacks });
      expect(res.errors.some((e) => e.includes("Gói 'art:trum'") && e.includes("512 KB"))).toBe(
        true,
      );
      // Một ảnh 80 KB trong gói nhỏ: gói còn trong trần nhưng ảnh vượt trần mỗi ảnh 60 KB: ĐỎ
      fs.rmSync(art, { recursive: true });
      fs.mkdirSync(art, { recursive: true });
      fs.writeFileSync(path.join(art, "to.webp"), Buffer.alloc(80 * 1024));
      writePacksManifest(packsDir, manifestPath);
      res = checkPacksBudget({ packsDir, manifestPath, budgetPacks });
      expect(res.errors.some((e) => e.includes("to.webp") && e.includes("60 KB"))).toBe(true);
      expect(res.errors.some((e) => e.includes("Gói 'art:trum'"))).toBe(false);
      // Thiếu `packs.art` trong ngân sách: dùng mặc định 512 / 60, KHÔNG bỏ kiểm
      const { art: _bỏ, ...noArt } = budgetPacks;
      res = checkPacksBudget({ packsDir, manifestPath, budgetPacks: noArt });
      expect(res.ok).toBe(false);
      expect(DEFAULT_ART_PACK_KB).toBe(512);
      expect(DEFAULT_ART_FILE_KB).toBe(60);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("perf-budget.json thật: có mục packs.art (tai-dan-nen) và các số khớp mặc định trong mã", () => {
    const real = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../perf-budget.json"), "utf8"),
    );
    expect(real.packs.art.load).toBe("tai-dan-nen");
    expect(real.packs.art.maxKb).toBe(DEFAULT_ART_PACK_KB);
    expect(real.packs.art.maxFileKb).toBe(DEFAULT_ART_FILE_KB);
    // Không precache: tổng ảnh minh hoạ tải ngay vẫn bị trần riêng 300 KB (A giữ, #998)
    expect(real.static.aiAssets.totalKb).toBe(300);
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
            startupGzipKb: 0.001,
            totalJsGzipKb: 0.001,
            atlasTilesetKb: 0.001,
            textureMemoryMb: { low: 0.001, mid: 0.001, high: 0.001 },
          },
        }),
      );

      const failRes = checkPerfBudget({ budgetPath, distDir, assetsDir });
      expect(failRes.ok).toBe(false);
      // Gồm 3 vi phạm tĩnh cơ bản + các vi phạm VRAM theo bậc
      expect(failRes.errors.length).toBeGreaterThanOrEqual(3);
      expect(failRes.errors.some((e) => e.includes("Gói JS khởi động"))).toBe(true);
      expect(failRes.errors.some((e) => e.includes("Tổng JS"))).toBe(true);
      expect(failRes.errors.some((e) => e.includes("Tổng dung lượng atlas"))).toBe(true);
      expect(failRes.errors.some((e) => e.includes("Tổng bộ nhớ texture"))).toBe(true);
      expect(failRes.errors.some((e) => e.includes("Bộ nhớ texture ca xấu nhất"))).toBe(true);
      expect(failRes.worstCaseTexture.ok).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("#1283: dữ liệu bản đồ (chunk map-files-*.js) có trần RIÊNG, tách khỏi trần TỔNG mã JS", () => {
  // byte giả ngẫu nhiên (LCG có hạt) để gzip không nén được gần hết
  const noise = (n: number, seed: number) => {
    let x = seed;
    return Buffer.from(
      Array.from({ length: n }, () => {
        x = (Math.imul(x, 1103515245) + 12345) >>> 0;
        return (x >>> 16) & 255;
      }),
    );
  };
  /** Dựng dist giả: `{ tên tệp: số byte ngẫu nhiên }`, chạy `fn(distDir)`, rồi dọn. */
  const withDist = <T>(files: Record<string, number>, fn: (distDir: string) => T): T => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-dist-mapfiles-"));
    const assetsDir = path.join(tmpDir, "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    try {
      let seed = 7;
      for (const [name, bytes] of Object.entries(files)) {
        fs.writeFileSync(path.join(assetsDir, name), noise(bytes, (seed += 13)));
      }
      return fn(tmpDir);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };
  const KB = 1024;

  it("MAP_FILES_CHUNK_RE khớp CHẶT: chỉ `map-files-<băm>.js`; tên gần giống KHÔNG được miễn", () => {
    for (const ok of ["map-files-DMwuQVDW.js", "map-files-a_b-C.js", "map-files-0.js"]) {
      expect(MAP_FILES_CHUNK_RE.test(ok), ok).toBe(true);
    }
    for (const bad of [
      "map-files.js", // không băm
      "map-files-.js", // băm rỗng
      "mapfiles-x.js",
      "xmap-files-a.js", // neo đầu
      "index-map-files-a.js",
      "map-files-a.js.map", // neo cuối
      "map-files-a.json",
      "map-files-a.css",
      "map-files-a b.js",
    ]) {
      expect(MAP_FILES_CHUNK_RE.test(bad), bad).toBe(false);
    }
  });

  it("chunk map-files bị LOẠI khỏi tổng mã và kiểm riêng; không khai báo trần riêng thì KHÔNG miễn trừ gì (fail-safe)", () => {
    withDist(
      { "index-a.js": 20 * KB, "phaser-b.js": 40 * KB, "map-files-abc.js": 30 * KB },
      (d) => {
        const r = checkTotalJsGzip(d, 1000, 48);
        expect(r.files.map((f) => f.file)).toEqual(["index-a.js", "phaser-b.js"]);
        expect(r.mapFiles?.files.map((f) => f.file)).toEqual(["map-files-abc.js"]);
        expect(r.mapFiles?.gzipKb).toBeGreaterThan(29);
        expect(r.mapFiles?.limitKb).toBe(48);
        expect(r.warning).toBeNull();

        // tổng mã KHÔNG gồm dữ liệu bản đồ: trần sát ngay trên số đo vẫn qua, thấp hơn một chút thì đỏ
        expect(r.gzipKb).toBeGreaterThan(59);
        expect(r.gzipKb).toBeLessThan(62);
        expect(checkTotalJsGzip(d, r.gzipKb, 48).ok).toBe(true);
        expect(checkTotalJsGzip(d, r.gzipKb - 0.5, 48).ok).toBe(false);

        // không truyền trần riêng: mọi tệp tính vào tổng (không ai được miễn khi chưa có trần riêng cho nó)
        const all = checkTotalJsGzip(d, 1000);
        expect(all.files.map((f) => f.file)).toEqual([
          "index-a.js",
          "map-files-abc.js",
          "phaser-b.js",
        ]);
        expect(all.mapFiles).toBeNull();
        expect(all.warning).toBeNull();
        expect(all.gzipKb).toBeGreaterThan(r.gzipKb + 29);
        expect(checkTotalJsGzip(d, r.gzipKb, undefined).ok).toBe(false);
      },
    );
  });

  it("trần RIÊNG chặn khi vượt (kể cả khi ai đó nhét mã vào chunk map-files): đúng bằng trần thì qua (<=)", () => {
    withDist({ "index-a.js": 10 * KB, "map-files-abc.js": 60 * KB }, (d) => {
      const r = checkTotalJsGzip(d, 1000, 48);
      expect(r.ok).toBe(true); // tổng mã không bị ảnh hưởng
      expect(r.mapFiles?.gzipKb).toBeGreaterThan(48);
      expect(r.mapFiles?.ok).toBe(false);
      const exact = checkTotalJsGzip(d, 1000, r.mapFiles!.gzipKb);
      expect(exact.mapFiles?.ok).toBe(true);
      expect(checkTotalJsGzip(d, 1000, r.mapFiles!.gzipKb - 0.5).mapFiles?.ok).toBe(false);
    });
  });

  it("tên chunk LẠ (đổi tên / gộp / giả) KHÔNG được miễn: tính đủ vào tổng mã", () => {
    for (const odd of ["mapfiles-x.js", "map-files.js", "xmap-files-a.js", "map-files-.js"]) {
      withDist({ "index-a.js": 5 * KB, [odd]: 30 * KB }, (d) => {
        const r = checkTotalJsGzip(d, 1000, 48);
        expect(
          r.files.map((f) => f.file),
          odd,
        ).toContain(odd);
        expect(r.mapFiles?.files, odd).toEqual([]);
        expect(r.gzipKb, odd).toBeGreaterThan(34); // gồm cả 30 KB của tệp lạ
        // trần tổng đủ chặt thì tệp lạ làm đỏ (không trốn được bằng cách đổi tên)
        expect(checkTotalJsGzip(d, 20, 48).ok, odd).toBe(false);
      });
    }
  });

  it("không có chunk map-files nào: cảnh báo + tính đủ vào tổng; có thì không cảnh báo", () => {
    withDist({ "index-a.js": 5 * KB, "phaser-b.js": 5 * KB }, (d) => {
      const r = checkTotalJsGzip(d, 1000, 48);
      expect(r.warning).toMatch(/Không thấy chunk dữ liệu bản đồ/);
      expect(r.mapFiles?.files).toEqual([]);
      expect(r.mapFiles?.ok).toBe(true);
      expect(r.files).toHaveLength(2);
    });
    withDist({ "index-a.js": 5 * KB, "map-files-q.js": 5 * KB }, (d) => {
      expect(checkTotalJsGzip(d, 1000, 48).warning).toBeNull();
    });
  });

  it("checkPerfBudget: vượt trần riêng làm đỏ với lời nêu tên chunk; không vượt thì xanh dù tổng cả hai lớn hơn trần mã", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-budget-mapfiles-"));
    const assetsDir = path.join(tmpRoot, "assets");
    const packsDir = path.join(tmpRoot, "packs");
    const budgetPath = path.join(tmpRoot, "perf-budget.json");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, "atlas.png"), Buffer.alloc(5000));
    const budgetOf = (staticPart: Record<string, unknown>) =>
      JSON.stringify({
        static: {
          startupGzipKb: 1000,
          atlasTilesetKb: 1024,
          textureMemoryMb: { low: 48, mid: 80, high: 128 },
          ...staticPart,
        },
        packs: { core: { maxKb: 2048 }, map: { maxKb: 2048 }, hdMaxFactor: 3 },
      });
    try {
      withDist({ "index-sample.js": 8 * KB, "map-files-xyz.js": 30 * KB }, (distDir) => {
        const run = () =>
          checkPerfBudget({
            budgetPath,
            distDir,
            assetsDir,
            packsDir,
            manifestPath: path.join(packsDir, "manifest.json"),
          });

        // 1. Trần mã chỉ vừa phần mã (~8 KB), dữ liệu bản đồ 30 KB nằm dưới trần riêng 48: XANH
        fs.writeFileSync(budgetPath, budgetOf({ totalJsGzipKb: 12, mapFilesGzipKb: 48 }));
        const ok = run();
        expect(ok.errors).toEqual([]);
        expect(ok.ok).toBe(true);
        expect(ok.warnings).toEqual([]);
        expect(ok.totalJs?.mapFiles?.files.map((f) => f.file)).toEqual(["map-files-xyz.js"]);

        // 2. Trần riêng thấp hơn dữ liệu thật: ĐỎ, nêu tên chunk, trần tổng mã vẫn xanh
        fs.writeFileSync(budgetPath, budgetOf({ totalJsGzipKb: 12, mapFilesGzipKb: 5 }));
        const over = run();
        expect(over.ok).toBe(false);
        expect(
          over.errors.some((e) => e.includes("Dữ liệu bản đồ") && e.includes("map-files-xyz.js")),
        ).toBe(true);
        expect(over.errors.some((e) => e.includes("Tổng JS"))).toBe(false);

        // 3. Ngân sách CHƯA khai báo trần riêng: chunk tính đủ vào tổng mã nên trần 12 KB đỏ (không có miễn trừ ngầm)
        fs.writeFileSync(budgetPath, budgetOf({ totalJsGzipKb: 12 }));
        const none = run();
        expect(none.ok).toBe(false);
        expect(none.errors.some((e) => e.includes("Tổng JS"))).toBe(true);
        expect(none.totalJs?.mapFiles).toBeNull();
      });

      // 4. Dist không có chunk map-files nhưng ngân sách khai báo trần riêng: cảnh báo (không phải lỗi)
      withDist({ "index-sample.js": 8 * KB }, (distDir) => {
        fs.writeFileSync(budgetPath, budgetOf({ totalJsGzipKb: 100, mapFilesGzipKb: 48 }));
        const res = checkPerfBudget({
          budgetPath,
          distDir,
          assetsDir,
          packsDir,
          manifestPath: path.join(packsDir, "manifest.json"),
        });
        expect(res.ok).toBe(true);
        expect(res.warnings).toHaveLength(1);
        expect(res.warnings[0]).toMatch(/Không thấy chunk dữ liệu bản đồ/);
      });
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe("M7.12 #513: trần dung lượng ảnh do AI sinh (checkAiAssets, perf-budget.json static.aiAssets)", () => {
  const KB = 1024;
  const mk = (files: Record<string, number>) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-ai-budget-"));
    for (const [name, kb] of Object.entries(files)) {
      const full = path.join(dir, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, Buffer.alloc(Math.round(kb * KB), 1));
    }
    return dir;
  };
  const limits = { maxFileKb: 150, totalKb: 300 };

  it("ngân sách thật: mỗi ảnh <= 150 KB, tổng <= 300 KB (số của docs/KE_HOACH_DO_HOA_AI.md mục 9.4 (c))", () => {
    const budget = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../perf-budget.json"), "utf8"),
    );
    expect(budget.static.aiAssets).toEqual({ maxFileKb: 150, totalKb: 300 });
  });

  it("thư mục không tồn tại hoặc rỗng: hợp lệ (chưa có ảnh AI nào)", () => {
    const none = checkAiAssets(path.join(os.tmpdir(), "tg-khong-co-thu-muc-ai"), limits);
    expect(none).toMatchObject({ ok: true, totalBytes: 0, files: [], errors: [] });
    expect(checkAiAssets(mk({}), limits).ok).toBe(true);
  });

  it("trong trần thì qua; đúng bằng trần thì qua (<=); đo cả thư mục con", () => {
    const r = checkAiAssets(mk({ "a.webp": 150, "b.webp": 100, "sub/c.webp": 50 }), limits);
    expect(r.ok).toBe(true);
    expect(r.totalKb).toBe(300);
    expect(r.files.map((f) => f.file)).toEqual(["a.webp", "b.webp", "sub/c.webp"]);
  });

  it("ĐỘT BIẾN: một ảnh vượt trần mỗi ảnh => đỏ, nêu tên ảnh", () => {
    const r = checkAiAssets(mk({ "nang.webp": 150.5, "nho.webp": 10 }), limits);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain("nang.webp");
    expect(r.files.find((f) => f.file === "nang.webp")?.over).toBe(true);
    expect(r.files.find((f) => f.file === "nho.webp")?.over).toBe(false);
  });

  it("ĐỘT BIẾN: tổng vượt trần (mỗi ảnh đều nhỏ) => đỏ", () => {
    const r = checkAiAssets(
      mk({ "a.webp": 100, "b.webp": 100, "c.webp": 100, "d.webp": 1 }),
      limits,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toContain("Tổng dung lượng ảnh AI");
    expect(r.files.every((f) => !f.over)).toBe(true);
  });

  /**
   * Môi trường GIẢ trọn vẹn cho `checkPerfBudget` (dist + assets + packs + ngân sách trong thư mục tạm): KHÔNG đụng `client/dist` thật (ở CI bước Test chạy TRƯỚC Build nên
   * thư mục đó chưa có: test phụ thuộc nó xanh ở máy dev và đỏ ở CI).
   */
  const fakeEnv = (aiFiles: Record<string, number>, budgetStatic: Record<string, unknown> = {}) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-ai-env-"));
    const distDir = path.join(tmp, "dist");
    const assetsDir = path.join(tmp, "assets");
    const packsDir = path.join(tmp, "packs");
    fs.mkdirSync(path.join(distDir, "assets"), { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, "assets/index-sample.js"), Buffer.alloc(5000, "x"));
    fs.writeFileSync(path.join(assetsDir, "atlas.png"), Buffer.alloc(5000));
    for (const [name, kb] of Object.entries(aiFiles)) {
      fs.mkdirSync(path.join(assetsDir, "ai"), { recursive: true });
      fs.writeFileSync(path.join(assetsDir, "ai", name), Buffer.alloc(Math.round(kb * KB), 1));
    }
    const budgetPath = path.join(tmp, "perf-budget.json");
    fs.writeFileSync(
      budgetPath,
      JSON.stringify({
        static: {
          bundleGzipKb: 520,
          atlasTilesetKb: 1024,
          textureMemoryMb: { low: 48, mid: 80, high: 128 },
          ...budgetStatic,
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
    return {
      budgetPath,
      distDir,
      assetsDir,
      packsDir,
      manifestPath: path.join(packsDir, "manifest.json"),
    };
  };

  it("checkPerfBudget có `aiAssets` và đọc đúng thư mục ai (assets/ai của môi trường giả)", () => {
    const aiLimits = { aiAssets: { maxFileKb: 150, totalKb: 300 } };
    const bad = checkPerfBudget(fakeEnv({ "x.webp": 151 }, aiLimits));
    expect(bad.aiAssets.ok).toBe(false);
    expect(bad.ok).toBe(false);
    expect(bad.errors.join("\n")).toContain("x.webp");
    const good = checkPerfBudget(fakeEnv({ "y.webp": 100 }, aiLimits));
    expect(good.aiAssets.ok).toBe(true);
    expect(good.aiAssets.files.map((f: { file: string }) => f.file)).toEqual(["y.webp"]);
    expect(good.ok).toBe(true);
    // chưa có ảnh nào (không có cả thư mục ai): hợp lệ
    expect(checkPerfBudget(fakeEnv({}, aiLimits)).aiAssets.files).toEqual([]);
  });

  it("ảnh AI THẬT của repo: đúng ảnh đã khai báo (login_bg.webp + 5 thẻ bản đồ, #513) và nằm trong trần của perf-budget.json thật", () => {
    const budget = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../perf-budget.json"), "utf8"),
    );
    const real = checkAiAssets(
      path.resolve(__dirname, "../public/assets/ai"),
      budget.static.aiAssets,
    );
    expect(real.ok).toBe(true);
    // thêm ảnh AI thì thêm tên vào đây CÙNG LÚC với JSON nguồn / CREDITS.md / RA_SOAT_TAI_SAN.md (các test credits cũng đếm)
    expect(real.files.map((f: { file: string }) => f.file)).toEqual([
      "login_bg.webp",
      "the_am_suong.webp",
      "the_hac_phong.webp",
      "the_han_van.webp",
      "the_lac_ha.webp",
      "the_linh_hu.webp",
    ]);
    for (const f of real.files)
      expect(f.kb, f.file).toBeLessThanOrEqual(budget.static.aiAssets.maxFileKb);
    expect(real.totalKb).toBeLessThanOrEqual(budget.static.aiAssets.totalKb);
  });

  it("ngân sách thiếu `static.aiAssets`: dùng trần mặc định 150 / 300 KB (không lặng lẽ bỏ kiểm tra)", () => {
    expect(DEFAULT_AI_LIMITS).toEqual({ maxFileKb: 150, totalKb: 300 });
    const res = checkPerfBudget(fakeEnv({ "x.webp": 151 })); // ngân sách giả KHÔNG có aiAssets
    expect(res.aiAssets.limits).toEqual({ maxFileKb: 150, totalKb: 300 });
    expect(res.aiAssets.ok).toBe(false);
    expect(res.ok).toBe(false);
  });
});
