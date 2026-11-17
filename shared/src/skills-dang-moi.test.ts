// Kiểm dữ liệu chiêu DẠNG MỚI (CT9 lát 1 #1054): mọi chiêu hợp lệ theo `skillViolations`, MỖI hình mới có ít nhất một chiêu dùng nó (trước đây engine có hình mà chưa chiêu nào dùng),
// chiêu vận có `windupMs`, tên + mô tả tiếng Việt không chữ Hán, và KHÔNG có tên riêng của Vạn Kiếp (chiêu gốc Tiên Giới).
import { describe, expect, it } from "vitest";
import { SKILLS_DANG_MOI } from "./skills-dang-moi";
import { LEARNABLE_SKILLS } from "./skills";
import { SKILL_LIMITS } from "./skills";
import { skillViolations } from "./skill-violations";

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const VKTT_PROPER = /Thanh Vân (Môn|Kiếm Tông)|Bắc Minh|Huyền Vũ Môn|Kim Đạo Tự|Đan Hà Cốc/;

describe("chiêu dạng mới (CT9 lát 1 #1054)", () => {
  it("hợp lệ theo skillViolations (riêng và khi gom vào LEARNABLE_SKILLS); đủ 6 chiêu, id duy nhất", () => {
    expect(skillViolations(SKILLS_DANG_MOI)).toEqual([]);
    expect(SKILLS_DANG_MOI).toHaveLength(6);
    expect(new Set(SKILLS_DANG_MOI.map((s) => s.id)).size).toBe(6);
    for (const s of SKILLS_DANG_MOI) expect(LEARNABLE_SKILLS).toContain(s);
  });

  it("phủ MỌI hình mới của đợt chiêu: bẫy, đạn bay nhiều viên, vùng, sét lan, tượng; và có chiêu vận", () => {
    const shapes = new Set(SKILLS_DANG_MOI.map((s) => s.shape));
    for (const shape of ["trap", "bolt", "zone", "chain", "totem"] as const)
      expect(shapes.has(shape), shape).toBe(true);
    const vận = SKILLS_DANG_MOI.filter((s) => s.windupMs !== undefined);
    expect(vận.length).toBeGreaterThanOrEqual(1);
    for (const s of vận) {
      expect(s.windupMs!).toBeGreaterThanOrEqual(SKILL_LIMITS.windupMin);
      expect(s.mult, `${s.id}: chiêu vận đáng đợi phải mạnh hơn đòn thường`).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("đạn bay nhiều viên thật sự nhiều viên và xuyên; sét lan có nảy; vùng / tượng có nhịp", () => {
    const by = (id: string) => SKILLS_DANG_MOI.find((s) => s.id === id)!;
    expect(by("phi_kiem_tam_lien").count).toBeGreaterThanOrEqual(2);
    expect(by("phi_kiem_tam_lien").pierce).toBeGreaterThanOrEqual(1);
    expect(by("loi_lien_chau").bounces).toBeGreaterThanOrEqual(2);
    for (const id of ["liet_diem_tran", "hon_phien_tuong"]) {
      const s = by(id);
      expect(s.durationMs! / s.tickMs!, id).toBeGreaterThanOrEqual(3);
    }
  });

  it("tên + mô tả tiếng Việt, KHÔNG chữ Hán, KHÔNG tên riêng Vạn Kiếp", () => {
    for (const s of SKILLS_DANG_MOI)
      for (const t of [s.name, s.bookName, s.desc]) {
        expect(CJK.test(t), `${s.id}: ${t}`).toBe(false);
        expect(VKTT_PROPER.test(t), `${s.id}: ${t}`).toBe(false);
      }
  });
});
