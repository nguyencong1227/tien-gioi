import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  auditAssets,
  auditContentSources,
  auditHashes,
  checkImageFileCjk,
  isAssetCredited,
  isUnderVktt,
  matchExactToken,
  parseContentSourceTable,
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

describe("Nguồn nội dung, hình ảnh và âm thanh bên ngoài (M7.16 #517, QUYET_DINH_M3 mục 19-20)", () => {
  const rootDir = path.resolve(__dirname, "../..");
  const contentSourcePath = path.resolve(rootDir, "docs/NGUON_NOI_DUNG.md");
  const creditsPath = path.resolve(rootDir, "CREDITS.md");

  it("docs/NGUON_NOI_DUNG.md tồn tại và chứa cấu trúc bảng nguồn hợp lệ (chưa có tệp thì audit sạch)", () => {
    expect(fs.existsSync(contentSourcePath)).toBe(true);
    const content = fs.readFileSync(contentSourcePath, "utf-8");
    expect(content).toContain("## 3. Bảng nguồn");
    expect(content).toContain("Đã duyệt chữ Hán");

    // Khi chưa có tệp ngoài nào được đưa vào repo thì kiểm tra không có lỗi
    const audit = auditContentSources(contentSourcePath, creditsPath, rootDir);
    expect(audit.entries).toEqual([]);
    expect(audit.missingInCredits).toEqual([]);
    expect(audit.missingFiles).toEqual([]);
    expect(audit.notInVkttDir).toEqual([]);
    expect(audit.missingCjkCheck).toEqual([]);
    expect(audit.cjkDetectedInFile).toEqual([]);
    expect(audit.unrecordedVkttFiles).toEqual([]);
    expect(audit.unrecordedCreditsVktt).toEqual([]);
  });

  it("checkImageFileCjk: không có dương tính giả trên toàn bộ ảnh thật hiện có trong client/public", () => {
    const publicDir = path.resolve(rootDir, "client/public");
    const allFiles = scanFiles(publicDir, rootDir);
    const imageFiles = allFiles.filter((f) => /\.(png|webp|svg|ico|jpg|jpeg)$/i.test(f));

    expect(imageFiles.length).toBeGreaterThanOrEqual(30);

    const falsePositives: string[] = [];
    for (const rel of imageFiles) {
      const full = path.resolve(rootDir, rel);
      const res = checkImageFileCjk(full);
      if (res.hasCjk) {
        falsePositives.push(`${rel} (báo ký tự '${res.match}')`);
      }
    }

    // Phép tái hiện từ review: 17/37 ảnh bị báo sai nếu quét binary như UTF-8
    // Với giải pháp mới: 0 dương tính giả!
    expect(falsePositives).toEqual([]);
  });

  it("parseContentSourceTable: trích xuất đúng 7 cột, không bị bỏ lọt dòng có 'trong repo' hoặc '---' ở ghi chú", () => {
    const tmpDocDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-content-source-"));
    const tmpDocFile = path.join(tmpDocDir, "NGUON_NOI_DUNG.md");

    // Tái hiện lỗi từ review: bảng 6 dòng ảnh, ghi chú có chữ "trong repo" hoặc "---" vẫn phải đọc đủ 6 dòng
    const sampleDoc = `
# Nguồn nội dung
## 3. Bảng nguồn
| Loại | Nguồn | Trong repo | Ngày | PR | Đã duyệt chữ Hán | Đã chỉnh gì |
|---|---|---|---|---|---|---|
| hinh_anh | site/img/item1.png | client/public/assets/vktt/item1.png | 14/11/2026 | #501 | KHONG_CHU | Đổi kích thước 32x32 |
| hinh_anh | site/img/item2.png | client/public/assets/vktt/item2.png | 14/11/2026 | #501 | KHONG_CHU | Tệp đặt trong repo gốc |
| hinh_anh | site/img/item3.png | client/public/assets/vktt/item3.png | 14/11/2026 | #501 | DA_XOA_CHU_HAN | Cắt viền --- làm mịn |
| am_thanh | site/audio/hit.mp3 | client/public/audio/vktt/hit.mp3 | 14/11/2026 | #501 | KHONG_AP_DUNG | Nén 64kbps |
| cong_phap | /content/cong_phap.yaml | shared/src/skills.ts id kiem_khi | 14/11/2026 | #501 | KHONG_AP_DUNG | Giữ nguyên văn, sửa số |
| du_lieu | /content/items.yaml | shared/src/items.ts id hoa_linh | 14/11/2026 | #501 | KHONG_AP_DUNG | Chỉnh giá trong repo |
## 4. Kiểm tự động
`;
    try {
      fs.writeFileSync(tmpDocFile, sampleDoc);
      const entries = parseContentSourceTable(tmpDocFile);
      expect(entries).toHaveLength(6);

      expect(entries[0].type).toBe("hinh_anh");
      expect(entries[0].inRepo).toBe("client/public/assets/vktt/item1.png");
      expect(entries[0].cjkChecked).toBe("KHONG_CHU");

      expect(entries[1].notes).toBe("Tệp đặt trong repo gốc");
      expect(entries[2].notes).toBe("Cắt viền --- làm mịn");

      expect(entries[4].type).toBe("cong_phap");
      expect(entries[4].inRepo).toBe("shared/src/skills.ts id kiem_khi");
      expect(entries[4].cjkChecked).toBe("KHONG_AP_DUNG");
    } finally {
      fs.rmSync(tmpDocDir, { recursive: true, force: true });
    }
  });

  it("parseContentSourceTable: ném lỗi khi dòng dữ liệu sai số cột hoặc sai Loại", () => {
    const tmpDocDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-content-err-"));
    const tmpDocFile = path.join(tmpDocDir, "NGUON_NOI_DUNG.md");

    try {
      // Thiếu cột (chỉ có 5 cột)
      fs.writeFileSync(
        tmpDocFile,
        `
## 3. Bảng nguồn
| Loại | Nguồn | Trong repo | Ngày | PR |
|---|---|---|---|---|
| hinh_anh | src/a.png | client/public/assets/vktt/a.png | 14/11/2026 | #501 |
`,
      );
      expect(() => parseContentSourceTable(tmpDocFile)).toThrow(/phải có đúng 7 cột/);

      // Loại không hợp lệ
      fs.writeFileSync(
        tmpDocFile,
        `
## 3. Bảng nguồn
| Loại | Nguồn | Trong repo | Ngày | PR | Đã duyệt chữ Hán | Đã chỉnh gì |
|---|---|---|---|---|---|---|
| loai_la | src/a.png | client/public/assets/vktt/a.png | 14/11/2026 | #501 | KHONG_CHU | n/a |
`,
      );
      expect(() => parseContentSourceTable(tmpDocFile)).toThrow(/Loại 'loai_la' không hợp lệ/);
    } finally {
      fs.rmSync(tmpDocDir, { recursive: true, force: true });
    }
  });

  it("dòng code dữ liệu (cong_phap, trang_bi, du_lieu) không đòi có trong CREDITS.md, không kiểm đĩa", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-data-audit-"));
    const tmpDoc = path.join(tmpDir, "NGUON_NOI_DUNG.md");
    const tmpCredits = path.join(tmpDir, "CREDITS.md");

    try {
      // Dòng cong_phap trỏ vào code, CREDITS.md hoàn toàn không nhắc tới nó
      fs.writeFileSync(
        tmpDoc,
        `
## 3. Bảng nguồn
| Loại | Nguồn | Trong repo | Ngày | PR | Đã duyệt chữ Hán | Đã chỉnh gì |
|---|---|---|---|---|---|---|
| cong_phap | /content/he_hoa.yaml id chem | shared/src/skills.ts id kiem_khi_chem | 14/11/2026 | #518 | KHONG_AP_DUNG | 12 chiêu thức |
`,
      );
      fs.writeFileSync(tmpCredits, "# CREDITS\n");

      const audit = auditContentSources(tmpDoc, tmpCredits, tmpDir);
      expect(audit.missingInCredits).toEqual([]);
      expect(audit.missingFiles).toEqual([]);
      expect(audit.notInVkttDir).toEqual([]);
      expect(audit.missingCjkCheck).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("cột 'Đã duyệt chữ Hán': ảnh CHỈ nhận KHONG_CHU hoặc DA_XOA_CHU_HAN; âm thanh/dữ liệu CHỈ nhận KHONG_AP_DUNG", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-cjk-values-"));
    const tmpDoc = path.join(tmpDir, "NGUON_NOI_DUNG.md");
    const tmpCredits = path.join(tmpDir, "CREDITS.md");

    // Tạo các tệp giả trên đĩa trong tmpDir
    const imgDir = path.join(tmpDir, "client/public/assets/vktt");
    fs.mkdirSync(imgDir, { recursive: true });
    fs.writeFileSync(path.join(imgDir, "ok1.png"), "dummy");
    fs.writeFileSync(path.join(imgDir, "ok2.png"), "dummy");
    fs.writeFileSync(path.join(imgDir, "bad_ok.png"), "dummy");
    fs.writeFileSync(path.join(imgDir, "bad_daduyet.png"), "dummy");
    fs.writeFileSync(path.join(imgDir, "bad_na.png"), "dummy");
    fs.writeFileSync(path.join(imgDir, "bad_dash.png"), "dummy");

    fs.writeFileSync(
      tmpDoc,
      `
## 3. Bảng nguồn
| Loại | Nguồn | Trong repo | Ngày | PR | Đã duyệt chữ Hán | Đã chỉnh gì |
|---|---|---|---|---|---|---|
| hinh_anh | src/1 | client/public/assets/vktt/ok1.png | 14/11/2026 | #501 | KHONG_CHU | nén |
| hinh_anh | src/2 | client/public/assets/vktt/ok2.png | 14/11/2026 | #501 | DA_XOA_CHU_HAN | nén |
| hinh_anh | src/3 | client/public/assets/vktt/bad_ok.png | 14/11/2026 | #501 | OK | nén |
| hinh_anh | src/4 | client/public/assets/vktt/bad_daduyet.png | 14/11/2026 | #501 | DA_DUYET | nén |
| hinh_anh | src/5 | client/public/assets/vktt/bad_na.png | 14/11/2026 | #501 | KHONG_AP_DUNG | nén |
| hinh_anh | src/6 | client/public/assets/vktt/bad_dash.png | 14/11/2026 | #501 | - | nén |
| cong_phap | src/7 | shared/src/skills.ts id bad_skill | 14/11/2026 | #501 | KHONG_CHU | n/a |
`,
    );

    fs.writeFileSync(
      tmpCredits,
      `
| All | ok1.png, ok2.png, bad_ok.png, bad_daduyet.png, bad_na.png, bad_dash.png | Vạn Kiếp | phép |
`,
    );

    try {
      const audit = auditContentSources(tmpDoc, tmpCredits, tmpDir);

      // Ảnh hợp lệ: ok1.png và ok2.png không có trong missingCjkCheck
      expect(audit.missingCjkCheck).not.toContain("client/public/assets/vktt/ok1.png");
      expect(audit.missingCjkCheck).not.toContain("client/public/assets/vktt/ok2.png");

      // Ảnh sai giá trị (OK, DA_DUYET, KHONG_AP_DUNG, -): đều BÁO ĐỎ
      expect(audit.missingCjkCheck).toContain("client/public/assets/vktt/bad_ok.png");
      expect(audit.missingCjkCheck).toContain("client/public/assets/vktt/bad_daduyet.png");
      expect(audit.missingCjkCheck).toContain("client/public/assets/vktt/bad_na.png");
      expect(audit.missingCjkCheck).toContain("client/public/assets/vktt/bad_dash.png");

      // Dữ liệu cong_phap nhưng để KHONG_CHU (thay vì KHONG_AP_DUNG) -> BÁO ĐỎ
      expect(audit.missingCjkCheck).toContain("shared/src/skills.ts id bad_skill");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("hình/âm bắt buộc phải có trên đĩa, có trong CREDITS.md và nằm dưới thư mục có đoạn vktt/", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-vktt-req-"));
    const tmpDoc = path.join(tmpDir, "NGUON_NOI_DUNG.md");
    const tmpCredits = path.join(tmpDir, "CREDITS.md");

    // Tạo 1 file thật nằm SAI thư mục (không có vktt/)
    const notVkttDir = path.join(tmpDir, "client/public/assets/items");
    fs.mkdirSync(notVkttDir, { recursive: true });
    fs.writeFileSync(path.join(notVkttDir, "outside.png"), "dummy");

    fs.writeFileSync(
      tmpDoc,
      `
## 3. Bảng nguồn
| Loại | Nguồn | Trong repo | Ngày | PR | Đã duyệt chữ Hán | Đã chỉnh gì |
|---|---|---|---|---|---|---|
| hinh_anh | src/out | client/public/assets/items/outside.png | 14/11/2026 | #501 | KHONG_CHU | nén |
| hinh_anh | src/ghost | client/public/assets/vktt/non_existent.png | 14/11/2026 | #501 | KHONG_CHU | nén |
`,
    );

    fs.writeFileSync(
      tmpCredits,
      `
| Asset | client/public/assets/items/outside.png | Vạn Kiếp | CC |
`,
    );

    try {
      const audit = auditContentSources(tmpDoc, tmpCredits, tmpDir);

      // outside.png vi phạm thư mục (không có đoạn vktt/)
      expect(audit.notInVkttDir).toContain("client/public/assets/items/outside.png");

      // non_existent.png vi phạm file thật trên đĩa và thiếu trong CREDITS.md
      expect(audit.missingFiles).toContain("client/public/assets/vktt/non_existent.png");
      expect(audit.missingInCredits).toContain("client/public/assets/vktt/non_existent.png");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("chiều ngược: bắt tệp đĩa dưới vktt/ không có dòng trong bảng và CREDITS nhắc Vạn Kiếp thiếu dòng", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-reverse-check-"));
    const tmpDoc = path.join(tmpDir, "NGUON_NOI_DUNG.md");
    const tmpCredits = path.join(tmpDir, "CREDITS.md");

    const vkttDir = path.join(tmpDir, "client/public/assets/vktt");
    fs.mkdirSync(vkttDir, { recursive: true });

    // Tạo 2 tệp trên đĩa: recorded.png (có trong bảng) và stolen.png (bỏ quên không khai báo)
    fs.writeFileSync(path.join(vkttDir, "recorded.png"), "dummy");
    fs.writeFileSync(path.join(vkttDir, "stolen.png"), "dummy");

    fs.writeFileSync(
      tmpDoc,
      `
## 3. Bảng nguồn
| Loại | Nguồn | Trong repo | Ngày | PR | Đã duyệt chữ Hán | Đã chỉnh gì |
|---|---|---|---|---|---|---|
| hinh_anh | src/rec | client/public/assets/vktt/recorded.png | 14/11/2026 | #501 | KHONG_CHU | nén |
`,
    );

    // CREDITS có recorded.png và một dòng Vạn Kiếp khác không có trong bảng
    fs.writeFileSync(
      tmpCredits,
      `
| Item | client/public/assets/vktt/recorded.png | Vạn Kiếp Tu Tiên | phép |
| Forgotten | client/public/audio/vktt/forgotten.mp3 | Vạn Kiếp Tu Tiên | phép |
`,
    );

    try {
      const audit = auditContentSources(tmpDoc, tmpCredits, tmpDir);

      // stolen.png có trên đĩa nhưng KHÔNG có trong bảng -> BÁO ĐỎ
      expect(audit.unrecordedVkttFiles).toContain("client/public/assets/vktt/stolen.png");
      expect(audit.unrecordedVkttFiles).not.toContain("client/public/assets/vktt/recorded.png");

      // Dòng forgotten.mp3 trong CREDITS nhắc tới Vạn Kiếp nhưng không có trong bảng -> BÁO ĐỎ
      expect(audit.unrecordedCreditsVktt.length).toBe(1);
      expect(audit.unrecordedCreditsVktt[0]).toContain("forgotten.mp3");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("checkImageFileCjk: phát hiện chính xác ký tự CJK trong tệp SVG", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-svg-cjk-"));
    const cleanSvg = path.join(tmpDir, "clean.svg");
    const cjkSvg = path.join(tmpDir, "cjk.svg");

    try {
      fs.writeFileSync(
        cleanSvg,
        `<svg xmlns="http://www.w3.org/2000/svg"><text>Tiên Giới Tu Chân</text></svg>`,
      );
      // Viết bằng mã thoát ký tự chữ Hán để file test không tự chứa chữ Hán
      fs.writeFileSync(
        cjkSvg,
        `<svg xmlns="http://www.w3.org/2000/svg"><text>\u843d\u971e\u93ae</text></svg>`,
      );

      const resClean = checkImageFileCjk(cleanSvg);
      expect(resClean.hasCjk).toBe(false);

      const resCjk = checkImageFileCjk(cjkSvg);
      expect(resCjk.hasCjk).toBe(true);
      expect(resCjk.match).toBe("\u843d");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("isUnderVktt: nhận diện đúng đoạn đường dẫn vktt độc lập và chống lọt path traversal", () => {
    expect(isUnderVktt("client/public/assets/vktt/items/sword.png")).toBe(true);
    expect(isUnderVktt("assets/vktt/sword.png")).toBe(true);
    expect(isUnderVktt("client/public/audio/vktt/skill.mp3")).toBe(true);
    expect(isUnderVktt("vktt/sword.png")).toBe(true);

    // Không được khớp chuỗi con giả
    expect(isUnderVktt("client/public/assets/vktt_item/sword.png")).toBe(false);
    expect(isUnderVktt("client/public/assets/my_vktt/sword.png")).toBe(false);
    expect(isUnderVktt("client/public/assets/items/sword.png")).toBe(false);

    // Chống lọt path traversal (tệp thực chất nằm ngoài vktt/)
    expect(isUnderVktt("client/public/assets/vktt/../items/sword.png")).toBe(false);
  });

  it("isAssetCredited: tệp vktt trùng tên với tệp Tiên Giới không được qua mặt kiểm CREDITS", () => {
    // CREDITS chỉ có dòng ghi nhận cho tệp hoi_huyet_dan.png của Tiên Giới (Dev B, CC0)
    const mockCredits = `
| Items | client/public/assets/items/hoi_huyet_dan.png | Dev B | CC0 |
`;

    // Tệp của Tiên Giới khớp bình thường
    expect(isAssetCredited("client/public/assets/items/hoi_huyet_dan.png", mockCredits)).toBe(true);

    // Tệp cùng tên của Vạn Kiếp Tu Tiên (dưới vktt/) KHÔNG ĐƯỢC coi là đã ghi nhận nếu chưa có dòng riêng cho nó
    expect(isAssetCredited("client/public/assets/vktt/items/hoi_huyet_dan.png", mockCredits)).toBe(
      false,
    );

    // Nếu CREDITS có ghi nhận đúng đường dẫn (đầy đủ hoặc ngắn có vktt/) thì mới qua
    const mockCreditsVktt = `
| Items | client/public/assets/items/hoi_huyet_dan.png | Dev B | CC0 |
| VKTT Items | assets/vktt/items/hoi_huyet_dan.png | Vạn Kiếp Tu Tiên | phép |
`;
    expect(
      isAssetCredited("client/public/assets/vktt/items/hoi_huyet_dan.png", mockCreditsVktt),
    ).toBe(true);
  });

  it("parseContentSourceTable: dòng bảng có ghi chú chứa cụm 'chưa có tệp nào' vẫn được đọc bình thường", () => {
    const tmpDocDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-content-phrase-"));
    const tmpDocFile = path.join(tmpDocDir, "NGUON_NOI_DUNG.md");

    const sampleDoc = `
## 3. Bảng nguồn
| Loại | Nguồn | Trong repo | Ngày | PR | Đã duyệt chữ Hán | Đã chỉnh gì |
|---|---|---|---|---|---|---|
| hinh_anh | site/img/sword.png | client/public/assets/vktt/sword.png | 14/11/2026 | #501 | KHONG_CHU | chưa có tệp nào đẹp bằng |
`;
    try {
      fs.writeFileSync(tmpDocFile, sampleDoc);
      const entries = parseContentSourceTable(tmpDocFile);
      expect(entries).toHaveLength(1);
      expect(entries[0].notes).toBe("chưa có tệp nào đẹp bằng");
    } finally {
      fs.rmSync(tmpDocDir, { recursive: true, force: true });
    }
  });

  it("parseContentSourceTable: tự động bóc backtick bọc quanh ô markdown và ném lỗi khi trùng đường dẫn", () => {
    const tmpDocDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-content-ticks-"));
    const tmpDocFile = path.join(tmpDocDir, "NGUON_NOI_DUNG.md");

    // Thử bảng có backtick bọc quanh các ô
    const docWithTicks = `
## 3. Bảng nguồn
| Loại | Nguồn | Trong repo | Ngày | PR | Đã duyệt chữ Hán | Đã chỉnh gì |
|---|---|---|---|---|---|---|
| \`hinh_anh\` | \`src/a.png\` | \`client/public/assets/vktt/a.png\` | 14/11/2026 | #501 | \`KHONG_CHU\` | nén |
`;

    // Thử bảng có 2 dòng trùng nhau đường dẫn 'Trong repo'
    const docWithDups = `
## 3. Bảng nguồn
| Loại | Nguồn | Trong repo | Ngày | PR | Đã duyệt chữ Hán | Đã chỉnh gì |
|---|---|---|---|---|---|---|
| hinh_anh | src/a.png | client/public/assets/vktt/dup.png | 14/11/2026 | #501 | KHONG_CHU | nén 1 |
| hinh_anh | src/b.png | client/public/assets/vktt/dup.png | 14/11/2026 | #501 | KHONG_CHU | nén 2 |
`;

    try {
      fs.writeFileSync(tmpDocFile, docWithTicks);
      const entries = parseContentSourceTable(tmpDocFile);
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("hinh_anh");
      expect(entries[0].inRepo).toBe("client/public/assets/vktt/a.png");
      expect(entries[0].cjkChecked).toBe("KHONG_CHU");

      fs.writeFileSync(tmpDocFile, docWithDups);
      expect(() => parseContentSourceTable(tmpDocFile)).toThrow(/Trùng đường dẫn 'Trong repo'/);
    } finally {
      fs.rmSync(tmpDocDir, { recursive: true, force: true });
    }
  });
});
