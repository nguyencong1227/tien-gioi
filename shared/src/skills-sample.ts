// Chiêu MẪU cho giao diện (mục 51, CT1 #1046): B dựng sổ chiêu 48-80 chiêu (lọc theo hệ / phẩm / cảnh giới, tìm, biểu tượng theo `style`) khi dữ liệu thật CHƯA đủ. KHÔNG dùng ở máy chủ
// (không vào `LEARNABLE_SKILLS`, không có kinh quyển). Tất định theo `n`; mọi chiêu mẫu đều qua `skillViolations`.
import { ELEMENTS, SKILL_FX_IDS, SKILL_SHAPES, type SkillDef, type StatusId } from "./skills";
import { SKILL_GRADES, SKILL_STYLES, skillEffect } from "./skill-kit";

const EFFECT_OF: Readonly<Record<string, StatusId>> = {
  hoa: "burn",
  moc: "poison",
  kim: "bleed",
  bang: "chill",
  tho: "sunder",
  thuy: "regen",
  phong: "haste",
};

/** `n` chiêu mẫu (mặc định 60, tối đa 200): lần lượt qua mọi hệ, hình, cảnh giới 1-4, phẩm, phong cách, hiệu ứng client; id `mau_<số>`, tên "Chiêu Mẫu <số>". */
export function sampleSkills(n = 60): SkillDef[] {
  const count = Math.max(0, Math.min(200, Math.floor(Number.isFinite(n) ? n : 60)));
  const out: SkillDef[] = [];
  for (let i = 0; i < count; i++) {
    const el = ELEMENTS[i % ELEMENTS.length].id;
    const shape = SKILL_SHAPES[i % SKILL_SHAPES.length];
    const realm = 1 + (i % 4);
    const grade = SKILL_GRADES[(i >> 1) % SKILL_GRADES.length];
    const rarity = Math.min(4, Math.max(grade, 0)) as 0 | 1 | 2 | 3 | 4; // grade g khớp rarity g
    const heal = shape === "self";
    const status = EFFECT_OF[el] ?? (heal ? "shield" : undefined); // chiêu tự thân luôn có hiệu ứng (hộ thể khi hệ không có trạng thái riêng)
    const hits = shape === "fan" ? 3 : 1;
    const num = String(i + 1).padStart(2, "0");
    out.push({
      id: `mau_${i + 1}`,
      name: `Chiêu Mẫu ${num}`,
      bookName: `Kinh Mẫu ${num}`,
      desc: `Chiêu mẫu số ${num} dùng để dựng giao diện sổ chiêu khi dữ liệu thật chưa đủ; không có trong trò chơi.`,
      element: el,
      shape,
      cooldown: 3000 + (i % 7) * 500,
      mpPct: 0.06 + (i % 6) * 0.02,
      range: shape === "self" ? 0 : 90 + (i % 5) * 30,
      arc: shape === "cone" || shape === "fan" ? Math.PI / 2 : undefined,
      width: shape === "line" || shape === "fan" ? 24 : undefined,
      count: shape === "fan" ? hits : undefined,
      reach: shape === "ground" || shape === "dash" ? 90 : undefined,
      mult: heal || shape === "dash" ? 0 : Math.round(((1 + realm * 0.2) / hits) * 10) / 10, // fan chia đều cho số tia: tổng không vượt khung
      effects: status ? [skillEffect(status, 2, status === "regen" ? 0.05 : 0.2, 1)] : [],
      dodgeMs: shape === "dash" ? 300 : undefined,
      reqRealm: realm,
      reqTier: 0,
      rarity,
      price: 50 * (1 + rarity) * realm,
      fx: SKILL_FX_IDS[i % SKILL_FX_IDS.length],
      style: SKILL_STYLES[i % SKILL_STYLES.length],
      grade,
    });
  }
  return out;
}
