// `CREDITS.md` và `docs/RA_SOAT_TAI_SAN.md` có các khối marker SINH TỰ ĐỘNG (`npm run assets -w client`
// hoặc `node client/scripts/sync-asset-docs.mjs`). Test này buộc tài liệu trên đĩa phải khớp chính xác
// với số liệu tài sản thực tế: thêm icon vào gen-assets.mjs mà quên chạy lại lệnh thì CI đỏ ngay
// (theo Issue #1368, mẫu can-bang-sync.test.ts, bảo vệ chống sót xung đột merge #1371).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  generateRaSoatItemRows,
  resolveTheirsContent,
  syncAssetDocs,
} from "../scripts/sync-asset-docs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../..");
const creditsFile = path.resolve(rootDir, "CREDITS.md");
const raSoatFile = path.resolve(rootDir, "docs/RA_SOAT_TAI_SAN.md");

describe("Đồng bộ tài liệu tài sản tự động (#1368, #1371, mẫu can-bang-sync)", () => {
  it("CREDITS.md và docs/RA_SOAT_TAI_SAN.md khớp 100% bản sinh từ đĩa (nếu đỏ: chạy `npm run assets -w client`)", () => {
    const { errors, stats } = syncAssetDocs({ checkOnly: true });
    expect(errors).toEqual([]);
    expect(stats.itemCount).toBeGreaterThanOrEqual(130);
    expect(stats.totalScanned).toBeGreaterThanOrEqual(149);
    expect(stats.totalAtlasFrames).toBeGreaterThanOrEqual(492);
  });

  it("generateRaSoatItemRows: giữ mô tả từ cả bản ours và bản theirs khi ghép, ours thắng khi trùng (#1371)", () => {
    const ours = `| 28 | \`client/public/assets/items/kinh_a.png\` | Mô tả A từ ours | Tác giả A ours | **CC0 1.0** | ✓ Hợp lệ |`;
    const theirs = `| 28 | \`client/public/assets/items/kinh_a.png\` | Mô tả A từ theirs | Tác giả A theirs | **CC0 1.0** | ✓ Hợp lệ |
| 29 | \`client/public/assets/items/kinh_b.png\` | Mô tả B từ theirs | Tác giả B theirs | **CC0 1.0** | ✓ Hợp lệ |`;
    const rows = generateRaSoatItemRows(["kinh_a.png", "kinh_b.png"], ours, theirs);
    // 1. Khi trùng id kinh_a.png: bản ours thắng
    expect(rows).toContain("Mô tả A từ ours");
    expect(rows).toContain("Tác giả A ours");
    expect(rows).not.toContain("Mô tả A từ theirs");
    // 2. Icon kinh_b.png mới từ nhánh theirs: giữ nguyên mô tả và tác giả chi tiết của theirs
    expect(rows).toContain("Mô tả B từ theirs");
    expect(rows).toContain("Tác giả B theirs");
  });

  it("resolveTheirsContent: đọc được nội dung từ đường dẫn tệp tạm (tránh E2BIG) và chuỗi dự phòng", () => {
    // 1. Chuỗi truyền trực tiếp có độ ưu tiên cao nhất
    expect(resolveTheirsContent("nội dung trực tiếp", "THEIRS_TEST_FILE", "THEIRS_TEST_STR")).toBe(
      "nội dung trực tiếp",
    );

    // 2. Đọc từ tệp tạm khi direct rỗng
    const tmpFile = path.resolve(rootDir, "client/src/test-theirs-tmp.md");
    try {
      fs.writeFileSync(tmpFile, "mô tả từ tệp tạm trong tmpdir", "utf8");
      process.env.THEIRS_TEST_FILE = tmpFile;
      delete process.env.THEIRS_TEST_STR;
      expect(resolveTheirsContent("", "THEIRS_TEST_FILE", "THEIRS_TEST_STR")).toBe(
        "mô tả từ tệp tạm trong tmpdir",
      );

      // 3. Dự phòng biến môi trường chuỗi khi không có file
      delete process.env.THEIRS_TEST_FILE;
      process.env.THEIRS_TEST_STR = "mô tả từ biến chuỗi";
      expect(resolveTheirsContent("", "THEIRS_TEST_FILE", "THEIRS_TEST_STR")).toBe(
        "mô tả từ biến chuỗi",
      );

      // 4. File cấu hình nhưng không tồn tại trên đĩa thì bỏ qua và rơi vào chuỗi
      process.env.THEIRS_TEST_FILE = "/duong/dan/khong/ton/tai.md";
      expect(resolveTheirsContent("", "THEIRS_TEST_FILE", "THEIRS_TEST_STR")).toBe(
        "mô tả từ biến chuỗi",
      );
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      delete process.env.THEIRS_TEST_FILE;
      delete process.env.THEIRS_TEST_STR;
    }
  });

  it("đột biến: sửa sai số đếm hoặc thiếu marker trong CREDITS.md / RA_SOAT_TAI_SAN.md làm sync báo lỗi", () => {
    const origCredits = fs.readFileSync(creditsFile, "utf8");
    const origRaSoat = fs.readFileSync(raSoatFile, "utf8");

    try {
      // Đột biến 1: sửa sai số lượng icon trong CREDITS.md
      const mutatedCredits = origCredits.replace(
        /<!-- AUTO-CREDITS-ITEM-COUNT:START -->[\s\S]*?<!-- AUTO-CREDITS-ITEM-COUNT:END -->/,
        "<!-- AUTO-CREDITS-ITEM-COUNT:START -->999 tệp<!-- AUTO-CREDITS-ITEM-COUNT:END -->",
      );
      expect(mutatedCredits).not.toBe(origCredits);
      fs.writeFileSync(creditsFile, mutatedCredits, "utf8");
      const res1 = syncAssetDocs({ checkOnly: true });
      expect(res1.errors.length).toBeGreaterThan(0);
      expect(res1.errors[0]).toContain("CREDITS.md");

      // Khôi phục CREDITS, đột biến RA_SOAT
      fs.writeFileSync(creditsFile, origCredits, "utf8");
      const mutatedRaSoat = origRaSoat.replace(
        /<!-- AUTO-RA-SOAT-ATLAS-ITEM-ROW:START -->[\s\S]*?<!-- AUTO-RA-SOAT-ATLAS-ITEM-ROW:END -->/,
        "<!-- AUTO-RA-SOAT-ATLAS-ITEM-ROW:START -->| `item-*` | 999 | Biểu tượng vật phẩm trong thế giới (rơi trên đất), một khung cho mỗi icon ở bảng trên |<!-- AUTO-RA-SOAT-ATLAS-ITEM-ROW:END -->",
      );
      expect(mutatedRaSoat).not.toBe(origRaSoat);
      fs.writeFileSync(raSoatFile, mutatedRaSoat, "utf8");
      const res2 = syncAssetDocs({ checkOnly: true });
      expect(res2.errors.length).toBeGreaterThan(0);
      expect(res2.errors[0]).toContain("docs/RA_SOAT_TAI_SAN.md");
    } finally {
      // Đảm bảo luôn khôi phục lại nội dung gốc
      fs.writeFileSync(creditsFile, origCredits, "utf8");
      fs.writeFileSync(raSoatFile, origRaSoat, "utf8");
    }
  });

  it("đột biến: phát hiện dấu xung đột git chưa giải quyết (<<<<<<< / ======= / >>>>>>>) hoặc marker lặp", () => {
    const origCredits = fs.readFileSync(creditsFile, "utf8");
    const origRaSoat = fs.readFileSync(raSoatFile, "utf8");

    try {
      // Đột biến 1: chèn <<<<<<< HEAD vào đầu CREDITS.md
      fs.writeFileSync(creditsFile, "<<<<<<< HEAD\n" + origCredits, "utf8");
      const resConflict1 = syncAssetDocs({ checkOnly: true });
      expect(resConflict1.errors.length).toBeGreaterThan(0);
      expect(resConflict1.errors.some((e) => e.includes("dấu xung đột git"))).toBe(true);

      // Đột biến 2: chèn ======= vào docs/RA_SOAT_TAI_SAN.md
      fs.writeFileSync(creditsFile, origCredits, "utf8");
      fs.writeFileSync(raSoatFile, "=======\n" + origRaSoat, "utf8");
      const resConflict2 = syncAssetDocs({ checkOnly: true });
      expect(resConflict2.errors.length).toBeGreaterThan(0);
      expect(resConflict2.errors.some((e) => e.includes("dấu xung đột git"))).toBe(true);

      // Đột biến 3: nhân đôi marker <!-- AUTO-CREDITS-ITEMS:START --> trong CREDITS.md
      fs.writeFileSync(raSoatFile, origRaSoat, "utf8");
      const duplicatedMarker = origCredits.replace(
        "<!-- AUTO-CREDITS-ITEMS:START -->",
        "<!-- AUTO-CREDITS-ITEMS:START -->\n<!-- AUTO-CREDITS-ITEMS:START -->",
      );
      fs.writeFileSync(creditsFile, duplicatedMarker, "utf8");
      const resDuplicate = syncAssetDocs({ checkOnly: true });
      expect(resDuplicate.errors.length).toBeGreaterThan(0);
      expect(
        resDuplicate.errors.some(
          (e) => e.includes("nhiều hơn một lần") || e.includes("lỗi marker"),
        ),
      ).toBe(true);
    } finally {
      // Luôn khôi phục nội dung gốc
      fs.writeFileSync(creditsFile, origCredits, "utf8");
      fs.writeFileSync(raSoatFile, origRaSoat, "utf8");
    }
  });
});
