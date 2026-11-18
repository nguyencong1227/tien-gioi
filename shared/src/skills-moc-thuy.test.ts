// Kiểm dữ liệu chiêu nhóm Mộc + Thủy (CT7 #1052, Dev E): mọi chiêu hợp lệ theo `skillViolations`, đúng hệ, tên tiếng Việt (không chữ Hán), id như kỳ vọng.
import { describe, expect, it } from "vitest";
import { SKILLS_MOC_THUY } from "./skills-moc-thuy";
import { skillViolations } from "./skill-violations";

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
// Tên riêng (tông phái / quốc gia) của Vạn Kiếp Tu Tiên KHÔNG được làm của Tiên Giới (AGENTS.md, Asset nguồn 3): chữ mô tả dùng nguyên văn nhưng đổi tên riêng sang cách nói trung tính
const VKTT_PROPER =
  /Thanh Vân (Môn|Kiếm Tông)|Bắc Minh|Huyền Vũ Môn|Kim Đạo Tự|Đan Hà Cốc|đất Thịnh/;

describe("chiêu nhóm Mộc + Thủy (CT7 #1052)", () => {
  it("đủ các chiêu đã thêm, id duy nhất", () => {
    const expectIds = [
      "hu_thuy_chuong",
      "trien_xa_thu",
      "hac_sa_doc_chuong",
      "thi_doc_am_chuong",
      "thiem_to_cong",
      "doan_truong_chi_phap",
      "kho_moc_phung_xuan_quyet",
    ];
    expect(SKILLS_MOC_THUY.map((s) => s.id).sort()).toEqual([...expectIds].sort());
    expect(new Set(SKILLS_MOC_THUY.map((s) => s.id)).size).toBe(SKILLS_MOC_THUY.length);
  });

  it("chỉ hệ Mộc / Thủy (phạm vi Dev E); tên + mô tả tiếng Việt, KHÔNG chữ Hán", () => {
    for (const s of SKILLS_MOC_THUY) {
      expect(["moc", "thuy"], s.id).toContain(s.element);
      for (const t of [s.name, s.bookName, s.desc]) {
        expect(t.trim().length, s.id).toBeGreaterThan(0);
        expect(CJK.test(t), `${s.id}: chữ Hán trong ${t}`).toBe(false);
      }
    }
  });

  it("KHÔNG còn tên riêng (tông phái / quốc gia) của Vạn Kiếp trong tên và mô tả", () => {
    for (const s of SKILLS_MOC_THUY)
      for (const t of [s.name, s.bookName, s.desc])
        expect(VKTT_PROPER.test(t), `${s.id}: tên riêng của Vạn Kiếp trong '${t}'`).toBe(false);
  });

  it("hợp lệ theo skillViolations (dùng riêng và khi gom vào LEARNABLE_SKILLS)", () => {
    expect(skillViolations(SKILLS_MOC_THUY)).toEqual([]);
  });
});
