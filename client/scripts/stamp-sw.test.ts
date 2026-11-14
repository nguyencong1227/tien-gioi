import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildPrecacheUrls, stampServiceWorker } from "./stamp-sw.mjs";

describe("M7.15: stamp-sw (Đóng dấu Service Worker và chỉ precache gói core)", () => {
  it("buildPrecacheUrls: chỉ đưa gói core (gắn băm ?v=) vào PRECACHE_URLS, loại trừ các gói khác", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-stamp-sw-"));
    try {
      const packsDir = path.join(tmpDir, "packs");
      fs.mkdirSync(packsDir, { recursive: true });

      // Manifest có core, map:hac_phong, icons, audio, hd:core
      const shaCore = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const shaMap = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      const shaIcons = "9999999999999999999999999999999999999999999999999999999999999999";

      const manifest = {
        packs: [
          {
            id: "core",
            kind: "core",
            files: [{ path: "core/ui.png", bytes: 1000, sha256: shaCore }],
            bytes: 1000,
          },
          {
            id: "map:hac_phong",
            kind: "map",
            files: [{ path: "map-hac_phong/tileset.webp", bytes: 2000, sha256: shaMap }],
            bytes: 2000,
          },
          {
            id: "icons",
            kind: "icons",
            files: [{ path: "icons/sword.webp", bytes: 500, sha256: shaIcons }],
            bytes: 500,
          },
        ],
      };
      fs.writeFileSync(path.join(packsDir, "manifest.json"), JSON.stringify(manifest));

      // Danh sách tất cả các file thu thập được từ dist
      const allFiles = [
        "/index.html",
        "/assets/index-abc.js",
        "/packs/manifest.json",
        "/packs/core/ui.png",
        "/packs/map-hac_phong/tileset.webp",
        "/packs/icons/sword.webp",
      ];

      const precache = buildPrecacheUrls(tmpDir, allFiles);

      // Phải có: "/", "/index.html", "/assets/index-abc.js"
      expect(precache).toContain("/");
      expect(precache).toContain("/index.html");
      expect(precache).toContain("/assets/index-abc.js");

      // Phải có file của core gắn băm 12 ký tự:
      expect(precache).toContain(`/packs/core/ui.png?v=${shaCore.slice(0, 12)}`);

      // Tuyệt đối KHÔNG có file thô của core hoặc file của gói khác
      expect(precache).not.toContain("/packs/core/ui.png");
      expect(precache).not.toContain("/packs/manifest.json");
      expect(precache).not.toContain("/packs/map-hac_phong/tileset.webp");
      expect(precache).not.toContain(`/packs/map-hac_phong/tileset.webp?v=${shaMap.slice(0, 12)}`);
      expect(precache).not.toContain("/packs/icons/sword.webp");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("stampServiceWorker: ghi đúng CACHE_NAME và PRECACHE_URLS vào sw.js", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-stamp-run-"));
    try {
      fs.writeFileSync(path.join(tmpDir, "index.html"), "<html>test</html>");
      const templateSw = `const CACHE_NAME = "tien-gioi-static-v1";\nconst PRECACHE_URLS = ["/", "/index.html"];\n`;
      const swPath = path.join(tmpDir, "sw.js");
      fs.writeFileSync(swPath, templateSw);

      const res = stampServiceWorker(tmpDir, swPath);
      expect(res.buildVersion).toHaveLength(8);
      expect(res.precacheCount).toBeGreaterThan(0);

      const updatedSw = fs.readFileSync(swPath, "utf8");
      expect(updatedSw).toContain(`const CACHE_NAME = "tien-gioi-static-${res.buildVersion}";`);
      expect(updatedSw).toContain(`const PRECACHE_URLS = [`);
      expect(updatedSw).toContain(`"/index.html"`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
