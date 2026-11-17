// DPS thật của mọi chiêu học được (CT10 #1055): khung theo VAI. Chiêu mới của D / E / G / A tự bị kiểm (đọc `LEARNABLE_SKILLS`), nên chiêu lệch khung làm test đỏ kèm số đo để chỉnh lại
// `mult` / `cooldown` trước khi vào `main`. Khung ĐỀ XUẤT (A duyệt) dựa trên 18 chiêu đã duyệt từ M7: chiêu gây sát thương / khống chế mạnh hơn chỉ chém 1,10-1,60 lần ở MỘT mục tiêu (18 chiêu cũ
// đo được 1,11-1,40), không quá 2,0 lần ở nhóm ba mục tiêu; chiêu thủ / hồi / tăng ích không vượt 1,10 lần (không lấn át chiêu sát thương) và không thấp hơn 0,85 lần (không phạt quá nặng việc mất lượt chém).
import { describe, expect, it } from "vitest";
import { LEARNABLE_SKILLS, SKILL_BY_ID } from "@tien-gioi/shared";
import { measureAllSkills, measureSkill, renderSkillDpsMarkdown, roleOf } from "./skills-dps";

const rows = measureAllSkills();
const fmt = (r: (typeof rows)[number]) =>
  `${r.id} (${r.shape}, ${r.role}): 1 mục tiêu ${r.single.toFixed(2)}×, 3 mục tiêu ${r.group.toFixed(2)}×`;

describe("DPS thật của chiêu (CT10)", () => {
  it("đo đủ MỌI chiêu học được, số hữu hạn và ổn định (hạt giống): đo hai lần cho đúng một số", () => {
    expect(rows.map((r) => r.id)).toEqual(LEARNABLE_SKILLS.map((d) => d.id));
    for (const r of rows) {
      expect(Number.isFinite(r.single) && Number.isFinite(r.group), r.id).toBe(true);
      expect(r.single, r.id).toBeGreaterThan(0);
    }
    const again = measureSkill(SKILL_BY_ID[rows[0].id]);
    expect([again.single, again.group]).toEqual([rows[0].single, rows[0].group]);
  });

  it("chiêu sát thương / khống chế: 1 mục tiêu trong khung 1,10-1,60 lần chỉ chém; 3 mục tiêu <= 2,0 lần", () => {
    const bad = rows
      .filter((r) => r.role === "sat_thuong" || r.role === "khong_che")
      .filter((r) => r.single < 1.1 || r.single > 1.6 || r.group > 2.0)
      .map(fmt);
    expect(bad).toEqual([]);
  });

  it("chiêu thủ / hồi / tăng ích: 0,85-1,10 lần chỉ chém (không lấn át chiêu sát thương, không bị phạt quá nặng)", () => {
    const bad = rows
      .filter((r) => r.role === "thu" || r.role === "hoi" || r.role === "tang_ich")
      .filter((r) => r.single < 0.85 || r.single > 1.1)
      .map(fmt);
    expect(bad).toEqual([]);
  });

  it("vai theo dữ liệu: có chiêu thuộc cả năm vai ở đâu đó là không bắt buộc, nhưng `roleOf` phân loại đúng ca điển hình", () => {
    expect(roleOf(SKILL_BY_ID.hoa_van_kiem)).toBe("sat_thuong");
    expect(roleOf(SKILL_BY_ID.kim_chung_trao)).toBe("thu");
    expect(roleOf(SKILL_BY_ID.bich_thuy_hoi_xuan)).toBe("hoi");
    expect(roleOf(SKILL_BY_ID.cuu_cung_khon_sat)).toBe("khong_che");
    expect(roleOf(SKILL_BY_ID.van_hanh_bo)).toBe("tang_ich");
  });

  it("mục CAN_BANG.md liệt kê mọi chiêu theo cảnh giới", () => {
    const md = renderSkillDpsMarkdown(rows);
    for (const d of LEARNABLE_SKILLS) expect(md, d.id).toContain(`**${d.name}**`);
    expect(md).toContain("## DPS thật của mọi chiêu học được");
  });
});
