import { describe, expect, it } from "vitest";
import path from "node:path";
// @ts-expect-error - Script mjs chạy trực tiếp trong Node CLI không có d.ts
import {
  auditAssets,
  isAssetCredited,
  matchExactToken,
  scanFiles,
} from "../scripts/check-credits.mjs";

describe("Rà soát tài sản và giấy phép (check-credits)", () => {
  const rootDir = path.resolve(__dirname, "../..");
  const creditsPath = path.resolve(rootDir, "CREDITS.md");
  const assetsDir = path.resolve(rootDir, "client/public/assets");
  const iconsDir = path.resolve(rootDir, "client/public/icons");

  it("mọi tệp trong client/public/assets và client/public/icons đều được khai báo trong CREDITS.md", () => {
    const { scanned, missing } = auditAssets(creditsPath, [assetsDir, iconsDir]);
    expect(scanned.length).toBeGreaterThanOrEqual(24);
    expect(missing).toEqual([]);
  });

  it("phát hiện chính xác tệp hợp lệ qua các định dạng khớp trọn token", () => {
    const mockCredits = `
| Tileset | client/public/assets/tileset.png | Dev B | CC0 |
| Atlas | assets/atlas.png | Dev B | CC0 |
| Items | hoi_huyet_dan.png, hoi_linh_dan.png | Dev B | CC0 |
| Icon | icons/icon.svg, icon-512.png | Dev C | CC0 |
    `;

    expect(isAssetCredited("client/public/assets/tileset.png", mockCredits)).toBe(true);
    expect(isAssetCredited("client/public/assets/atlas.png", mockCredits)).toBe(true);
    expect(isAssetCredited("client/public/assets/items/hoi_huyet_dan.png", mockCredits)).toBe(true);
    expect(isAssetCredited("client/public/icons/icon.svg", mockCredits)).toBe(true);
  });

  it("báo đỏ khi có tệp đột biến hoặc chuỗi con giả mạo (chống lọt chuỗi con)", () => {
    const mockCredits = `
| Icon | client/public/icons/icon.svg, client/public/icons/icon-512.png | Dev C | CC0 |
| Items | client/public/assets/items/hoi_huyet_dan.png | Dev B | CC0 |
    `;

    // 1. Tệp lạ hoàn toàn
    expect(isAssetCredited("client/public/assets/unknown_sprite.png", mockCredits)).toBe(false);
    expect(isAssetCredited("client/public/icons/stolen_icon.png", mockCredits)).toBe(false);

    // 2. Chuỗi con của tệp hợp lệ (trước đây bị lọt vì includes)
    expect(isAssetCredited("client/public/icons/con.svg", mockCredits)).toBe(false);
    expect(isAssetCredited("client/public/icons/512.png", mockCredits)).toBe(false);
    expect(isAssetCredited("icons/con.svg", mockCredits)).toBe(false);
    expect(isAssetCredited("icons/512.png", mockCredits)).toBe(false);

    // 3. Tệp mới trong thư mục items không được dùng wildcard để lọt
    expect(isAssetCredited("client/public/assets/items/x.png", mockCredits)).toBe(false);
    expect(isAssetCredited("client/public/assets/items/stolen_pill.png", mockCredits)).toBe(false);
  });

  it("matchExactToken: kiểm tra ranh giới từ độc lập", () => {
    const text = "Dùng icon.svg và icon-512.png cho PWA";
    expect(matchExactToken(text, "icon.svg")).toBe(true);
    expect(matchExactToken(text, "icon-512.png")).toBe(true);

    // Không được khớp chuỗi con dính ký tự tên file
    expect(matchExactToken(text, "con.svg")).toBe(false);
    expect(matchExactToken(text, "512.png")).toBe(false);
    expect(matchExactToken(text, "icon")).toBe(false);
  });

  it("scanFiles đọc đúng danh sách tệp đĩa", () => {
    const files = scanFiles(iconsDir);
    expect(files).toContain("client/public/icons/icon.svg");
    expect(files).toContain("client/public/icons/icon-192.png");
  });
});
