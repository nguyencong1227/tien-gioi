import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  auditAssets,
  auditHashes,
  isAssetCredited,
  matchExactToken,
  scanFiles,
  sha256File,
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

  it("auditAssets mặc định rà cả client/public/fonts (phông tự lưu, #331)", () => {
    const { scanned, missing } = auditAssets(creditsPath);
    expect(
      scanned.filter((f) => f.startsWith("client/public/fonts/")).length,
    ).toBeGreaterThanOrEqual(5);
    expect(missing).toEqual([]);
  });
});

describe("SHA-256 của tài sản bên thứ ba (check-credits, #331)", () => {
  const rootDir = path.resolve(__dirname, "../..");
  const fontsDir = path.resolve(rootDir, "client/public/fonts");

  it("mọi tệp trong client/public/fonts có băm thật cùng dòng với tên tệp trong CREDITS.md", () => {
    const { hashed, wrongHash } = auditHashes();
    expect(hashed).toContain("client/public/fonts/noto-serif-latin-wght-normal.woff2");
    expect(hashed).toContain("client/public/fonts/OFL.txt");
    expect(wrongHash).toEqual([]);
  });

  // Thư mục phông giả + CREDITS.md giả nằm ở HAI thư mục tạm riêng (CREDITS.md không được tính là tệp cần băm)
  function withTempFont(content: Buffer, creditsLine: (name: string, sha: string) => string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-credits-fonts-"));
    const docDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-credits-doc-"));
    try {
      const file = path.join(dir, "demo.woff2");
      fs.writeFileSync(file, content);
      const credits = path.join(docDir, "CREDITS.md");
      fs.writeFileSync(credits, creditsLine("demo.woff2", sha256File(file)) + "\n");
      return auditHashes(credits, [dir]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(docDir, { recursive: true, force: true });
    }
  }

  it("băm đúng cùng dòng với tên tệp thì qua", () => {
    const r = withTempFont(
      Buffer.from("noi dung phong"),
      (n, h) => `| \`${n}\` | nguồn | tác giả | OFL | ngày | \`${h}\` |`,
    );
    expect(r.wrongHash).toEqual([]);
    expect(r.hashed.length).toBe(1);
  });

  it("đột biến: thiếu băm, băm cũ (tệp đã đổi), băm nằm ở dòng khác, băm của tệp khác -> đỏ", () => {
    // thiếu băm
    expect(
      withTempFont(Buffer.from("a"), (n) => `| \`${n}\` | nguồn | tác giả | OFL | ngày |`)
        .wrongHash,
    ).toHaveLength(1);
    // băm cũ: ghi băm của nội dung khác
    const stale = sha256File(path.join(fontsDir, "OFL.txt"));
    expect(
      withTempFont(
        Buffer.from("b"),
        (n) => `| \`${n}\` | nguồn | tác giả | OFL | ngày | \`${stale}\` |`,
      ).wrongHash,
    ).toHaveLength(1);
    // băm đúng nhưng ở dòng KHÁC với tên tệp
    expect(
      withTempFont(Buffer.from("c"), (n, h) => `| \`${n}\` | nguồn |\n| tệp khác | \`${h}\` |`)
        .wrongHash,
    ).toHaveLength(1);
  });
});

describe("Tài liệu rà soát khớp số tệp thật (M6, #411)", () => {
  const rootDir = path.resolve(__dirname, "../..");
  const { scanned } = auditAssets(path.resolve(rootDir, "CREDITS.md"));
  const doc = (rel: string) => fs.readFileSync(path.resolve(rootDir, rel), "utf8");

  it("CREDITS.md mục 4 và docs/RA_SOAT_TAI_SAN.md ghi ĐÚNG số tệp tĩnh quét được (thêm tài sản mà quên cập nhật tài liệu thì đỏ)", () => {
    expect(doc("CREDITS.md")).toContain(
      `quét qua script tự động (\`npm run check:credits\`):** ${scanned.length} tệp`,
    );
    expect(doc("docs/RA_SOAT_TAI_SAN.md")).toContain(`(${scanned.length} tệp tĩnh =`);
    expect(doc("docs/RA_SOAT_TAI_SAN.md")).toContain(`**${scanned.length} tệp**`);
  });

  it("số tệp theo thư mục khớp tài liệu: assets 34, icons 5, fonts 5; icon vật phẩm 31 = số vật phẩm của game", () => {
    const under = (d: string) =>
      scanned.filter((f) => f.replace(/\\/g, "/").includes(`client/public/${d}/`));
    const items = under("assets").filter((f) => f.replace(/\\/g, "/").includes("/items/"));
    expect(under("assets")).toHaveLength(34);
    expect(under("icons")).toHaveLength(5);
    expect(under("fonts")).toHaveLength(5);
    expect(items).toHaveLength(31);
    const credits = doc("CREDITS.md");
    expect(credits).toContain("`client/public/assets/`: 34 tệp");
    expect(credits).toContain("31 biểu tượng vật phẩm");
  });

  it("mọi icon vật phẩm có một hàng trong bảng của docs/RA_SOAT_TAI_SAN.md (thiếu hàng thì đỏ)", () => {
    const text = doc("docs/RA_SOAT_TAI_SAN.md");
    const icons = scanned
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => f.includes("client/public/assets/items/"));
    const missing = icons.filter((f) => !text.includes(`\`${f}\``));
    expect(missing).toEqual([]);
  });
});
