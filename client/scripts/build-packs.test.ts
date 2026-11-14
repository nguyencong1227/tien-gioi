import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {
  buildPacksManifest,
  writePacksManifest,
  verifyPacksManifest,
  parsePackDir,
  toPosixPath,
} from "./build-packs.mjs";

describe("M7.15: build-packs (Trình tạo và kiểm tra manifest các gói tải theo nhu cầu)", () => {
  it("parsePackDir: phân tích chính xác tên thư mục gói", () => {
    expect(parsePackDir("core")).toEqual({ id: "core", kind: "core" });
    expect(parsePackDir("icons")).toEqual({ id: "icons", kind: "icons" });
    expect(parsePackDir("audio")).toEqual({ id: "audio", kind: "audio" });
    expect(parsePackDir("map-hac_phong")).toEqual({
      id: "map:hac_phong",
      kind: "map",
      mapId: "hac_phong",
    });
    expect(parsePackDir("map_lac_ha")).toEqual({
      id: "map:lac_ha",
      kind: "map",
      mapId: "lac_ha",
    });
    expect(parsePackDir("hd-core")).toEqual({ id: "hd:core", kind: "hd" });
    expect(parsePackDir("hd-map-hac_phong")).toEqual({
      id: "hd:map:hac_phong",
      kind: "hd",
    });
    expect(parsePackDir(".hidden")).toBeNull();
    expect(parsePackDir("random-dir")).toBeNull();
  });

  it("buildPacksManifest: xử lý đúng khi thư mục không tồn tại hoặc rỗng", () => {
    const nonExistent = path.join(os.tmpdir(), "tg-non-existent-packs-" + Date.now());
    expect(buildPacksManifest(nonExistent)).toEqual({ packs: [] });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-empty-packs-"));
    try {
      expect(buildPacksManifest(tmpDir)).toEqual({ packs: [] });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("buildPacksManifest: quét đầy đủ các loại gói, tính đúng bytes và sha256 tất định", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-packs-fixture-"));
    try {
      // 1. Tạo gói core
      const coreDir = path.join(tmpDir, "core");
      fs.mkdirSync(coreDir, { recursive: true });
      const coreFile1 = path.join(coreDir, "ui.png");
      const coreBuf1 = Buffer.from("test core png content");
      fs.writeFileSync(coreFile1, coreBuf1);

      // 2. Tạo gói map-hac_phong (kèm thư mục con vktt/)
      const mapDir = path.join(tmpDir, "map-hac_phong/vktt");
      fs.mkdirSync(mapDir, { recursive: true });
      const mapFile1 = path.join(mapDir, "tileset.webp");
      const mapBuf1 = Buffer.from("test map tileset webp");
      fs.writeFileSync(mapFile1, mapBuf1);

      // 3. Tạo gói icons
      const iconsDir = path.join(tmpDir, "icons");
      fs.mkdirSync(iconsDir, { recursive: true });
      const iconFile1 = path.join(iconsDir, "sword.webp");
      const iconBuf1 = Buffer.from("sword icon bytes");
      fs.writeFileSync(iconFile1, iconBuf1);

      // 4. Tạo gói audio
      const audioDir = path.join(tmpDir, "audio");
      fs.mkdirSync(audioDir, { recursive: true });
      const audioFile1 = path.join(audioDir, "ambient.ogg");
      const audioBuf1 = Buffer.from("ambient sound ogg");
      fs.writeFileSync(audioFile1, audioBuf1);

      // 5. Tạo gói hd-core
      const hdDir = path.join(tmpDir, "hd-core");
      fs.mkdirSync(hdDir, { recursive: true });
      const hdFile1 = path.join(hdDir, "ui_2x.png");
      const hdBuf1 = Buffer.from("hd ui 2x png content");
      fs.writeFileSync(hdFile1, hdBuf1);

      // Tệp ẩn và manifest.json giả lập bên trong (phải bị bỏ qua)
      fs.writeFileSync(path.join(coreDir, ".ignored"), "ignored");
      fs.writeFileSync(path.join(tmpDir, "manifest.json"), "ignored");

      const manifest = buildPacksManifest(tmpDir);

      // Danh sách gói phải sắp xếp theo id: audio, core, hd:core, icons, map:hac_phong
      expect(manifest.packs.map((p) => p.id)).toEqual([
        "audio",
        "core",
        "hd:core",
        "icons",
        "map:hac_phong",
      ]);

      // Kiểm tra chi tiết gói core
      const corePack = manifest.packs.find((p) => p.id === "core")!;
      expect(corePack.kind).toBe("core");
      expect(corePack.bytes).toBe(coreBuf1.length);
      expect(corePack.files).toHaveLength(1);
      expect(corePack.files[0]).toEqual({
        path: "core/ui.png",
        bytes: coreBuf1.length,
        sha256: crypto.createHash("sha256").update(coreBuf1).digest("hex"),
      });

      // Kiểm tra chi tiết gói map
      const mapPack = manifest.packs.find((p) => p.id === "map:hac_phong")!;
      expect(mapPack.kind).toBe("map");
      expect(mapPack.mapId).toBe("hac_phong");
      expect(mapPack.bytes).toBe(mapBuf1.length);
      expect(mapPack.files[0].path).toBe("map-hac_phong/vktt/tileset.webp");

      // Kiểm tra chi tiết gói hd
      const hdPack = manifest.packs.find((p) => p.id === "hd:core")!;
      expect(hdPack.kind).toBe("hd");
      expect(hdPack.bytes).toBe(hdBuf1.length);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("writePacksManifest và verifyPacksManifest: ghi và đối chiếu đồng bộ", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-packs-verify-"));
    const manifestPath = path.join(tmpDir, "manifest.json");

    try {
      const coreDir = path.join(tmpDir, "core");
      fs.mkdirSync(coreDir, { recursive: true });
      fs.writeFileSync(path.join(coreDir, "a.png"), "hello pack a");

      // 1. Trước khi ghi: verify thất bại vì chưa có manifest.json
      const verifyBefore = verifyPacksManifest(tmpDir, manifestPath);
      expect(verifyBefore.ok).toBe(false);
      expect(verifyBefore.error).toMatch(/Thiếu tệp manifest/);

      // 2. Ghi manifest
      const writeRes = writePacksManifest(tmpDir, manifestPath);
      expect(writeRes.written).toBe(true);
      expect(writeRes.packCount).toBe(1);
      expect(writeRes.fileCount).toBe(1);

      // 3. Sau khi ghi: verify thành công
      const verifyAfter = verifyPacksManifest(tmpDir, manifestPath);
      expect(verifyAfter.ok).toBe(true);
      expect(verifyAfter.manifest.packs).toHaveLength(1);

      // 4. Đột biến đỏ: thêm một tệp mới mà chưa ghi lại manifest -> verify phải báo lệch
      fs.writeFileSync(path.join(coreDir, "b.png"), "hello pack b");
      const verifyMutated = verifyPacksManifest(tmpDir, manifestPath);
      expect(verifyMutated.ok).toBe(false);
      expect(verifyMutated.error).toMatch(/không đồng bộ/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("toPosixPath: chuyển đường dẫn Windows ngược thành POSIX '/'", () => {
    expect(toPosixPath("a/b/c")).toBe("a/b/c");
  });
});
