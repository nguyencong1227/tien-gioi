// `CREDITS.md` và `docs/RA_SOAT_TAI_SAN.md` có các khối marker SINH TỰ ĐỘNG (`npm run assets -w client`
// hoặc `node client/scripts/sync-asset-docs.mjs`). Test này buộc tài liệu trên đĩa phải khớp chính xác
// với số liệu tài sản thực tế: thêm icon vào gen-assets.mjs mà quên chạy lại lệnh thì CI đỏ ngay
// (theo Issue #1368, mẫu can-bang-sync.test.ts).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { syncAssetDocs } from "../scripts/sync-asset-docs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../..");
const creditsFile = path.resolve(rootDir, "CREDITS.md");
const raSoatFile = path.resolve(rootDir, "docs/RA_SOAT_TAI_SAN.md");

describe("Đồng bộ tài liệu tài sản tự động (#1368, mẫu can-bang-sync)", () => {
  it("CREDITS.md và docs/RA_SOAT_TAI_SAN.md khớp 100% bản sinh từ đĩa (nếu đỏ: chạy `npm run assets -w client`)", () => {
    const { errors, stats } = syncAssetDocs({ checkOnly: true });
    expect(errors).toEqual([]);
    expect(stats.itemCount).toBeGreaterThanOrEqual(130);
    expect(stats.totalScanned).toBeGreaterThanOrEqual(149);
    expect(stats.totalAtlasFrames).toBeGreaterThanOrEqual(492);
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
});
