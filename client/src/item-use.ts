// Nút hành động "dùng" của một vật phẩm trong túi (lớp THUẦN, không DOM): đan dược (`effect`) -> "Dùng"; kinh quyển (`teaches`, M7.4) -> "Học". Trang bị có nút Mặc riêng.
// Server quyết định kết quả (đủ cảnh giới, đã học tối đa...); client chỉ hiện đúng nút để người chơi bấm được.
import { realmLabel, skillOf, skillReqMet, type ItemDef } from "@tien-gioi/shared";

/** Nhãn nút dùng của món, hoặc `null` nếu không dùng được trực tiếp (nguyên liệu, trang bị). */
export function useLabelOf(def: Pick<ItemDef, "effect" | "teaches"> | undefined): string | null {
  if (!def) return null;
  if (def.teaches) return "Học";
  if (def.effect) return "Dùng";
  return null;
}

/** Dòng "Dạy: <chiêu> ..." của kinh quyển ở chi tiết túi: tên chiêu, cảnh giới cần, và đã đủ chưa (CÙNG `skillReqMet` với máy chủ `learnSkill`). */
export interface BookTeach {
  skillName: string;
  /** Đủ cảnh giới để học chưa (chưa đủ thì máy chủ từ chối, quyển còn nguyên) */
  ok: boolean;
  /** "Dạy: Hỏa Vân Kiếm · Đủ cảnh giới (Luyện Khí)" hoặc "Dạy: Thanh Tùng Phi Châm · Cần Trúc Cơ" */
  text: string;
}

/** Thông tin dạy của quyển `def` với người ở cảnh giới `realm` / bậc `tier`; `null` nếu không phải kinh quyển hoặc chiêu không có (dữ liệu hỏng). */
export function bookTeach(
  def: Pick<ItemDef, "teaches"> | undefined,
  realm: number,
  tier: number,
): BookTeach | null {
  if (!def?.teaches) return null;
  const skill = skillOf(def.teaches);
  if (!skill) return null;
  const req = realmLabel(skill.reqRealm, skill.reqTier);
  const ok = skillReqMet(skill, realm, tier);
  return {
    skillName: skill.name,
    ok,
    text: `Dạy: ${skill.name} · ${ok ? `Đủ cảnh giới (${req})` : `Cần ${req}`}`,
  };
}
