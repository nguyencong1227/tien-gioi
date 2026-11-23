// Kiểm dữ liệu chiêu nhóm Kim + Thổ (CT6 #1051 + CT17 #1187): mọi chiêu hợp lệ theo `skillViolations`, đúng hệ, tên + mô tả tiếng Việt (không chữ Hán), id như kỳ vọng, và KHÔNG còn tên riêng của Vạn Kiếp
// (môn phái, tự viện, tông) trong mô tả (quy tắc Asset nguồn 3).
import { describe, expect, it } from "vitest";
import { SKILLS_KIM_THO } from "./skills-kim-tho";
import { skillViolations } from "./skill-violations";

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
/** Tên riêng của Vạn Kiếp đã gặp trong mô tả nguồn (môn phái / tự viện / cốc / tông): không được lọt vào mô tả chiêu của Tiên Giới. */
const VKTT_PROPER = /Thanh Vân (Môn|Kiếm Tông)|Bắc Minh|Huyền Vũ Môn|Kim Đạo Tự|Đan Hà Cốc/;

describe("chiêu nhóm Kim + Thổ (CT6 lát 1 #1051 + CT17 lát 1 #1187)", () => {
  it("đủ các chiêu đã thêm, id duy nhất", () => {
    const expectIds = [
      // CT6 lát 1 (#1051): 6 chiêu Trúc Cơ -> Nguyên Anh.
      "thanh_van_kiem_khi",
      "ban_thach_ho_the",
      "thu_thuy_kiem_anh",
      "liet_dia_nhat_quyen",
      "phan_nhac_tram",
      "van_kiem_quy_tong",
      // CT17 lát 1 (#1187, G): Kim +2, Thổ +2, mở rộng xuống Luyện Khí.
      "kim_thoa_xuyen_tam",
      "thiet_sa_chuong",
      "thuc_giap_phi_tan",
      "chuong_vu_phong_lam",
    ];
    expect(SKILLS_KIM_THO.map((s) => s.id).sort()).toEqual([...expectIds].sort());
    expect(new Set(SKILLS_KIM_THO.map((s) => s.id)).size).toBe(SKILLS_KIM_THO.length);
  });

  it("chỉ hệ Kim / Thổ; tên + mô tả tiếng Việt, KHÔNG chữ Hán, KHÔNG tên riêng của Vạn Kiếp", () => {
    for (const s of SKILLS_KIM_THO) {
      expect(["kim", "tho"], s.id).toContain(s.element);
      for (const t of [s.name, s.bookName, s.desc]) {
        expect(t.trim().length, s.id).toBeGreaterThan(0);
        expect(CJK.test(t), `${s.id}: chữ Hán trong ${t}`).toBe(false);
        expect(VKTT_PROPER.test(t), `${s.id}: tên riêng Vạn Kiếp trong ${t}`).toBe(false);
      }
    }
  });

  it("hợp lệ theo skillViolations (dùng riêng và khi gom vào LEARNABLE_SKILLS)", () => {
    expect(skillViolations(SKILLS_KIM_THO)).toEqual([]);
  });

  it("phủ Luyện Khí -> Nguyên Anh và cả hai hệ (CT6 lấp khoảng trống Kim Đan, CT17 mở rộng xuống Luyện Khí)", () => {
    expect(new Set(SKILLS_KIM_THO.map((s) => s.reqRealm))).toEqual(new Set([1, 2, 3, 4]));
    expect(new Set(SKILLS_KIM_THO.map((s) => s.element))).toEqual(new Set(["kim", "tho"]));
    // CT6 lát 1 đặt đúng ba chiêu Kim Đan (reqRealm 3) để lấp khoảng trống của hệ.
    expect(SKILLS_KIM_THO.filter((s) => s.reqRealm === 3).length).toBeGreaterThanOrEqual(3);
  });
});
