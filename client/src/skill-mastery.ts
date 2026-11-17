/**
 * LUYỆN CHIÊU ở client (CT5 #1050, mục 51; máy chủ #1112): điểm luyện dở dang của từng chiêu (`SkillsMsg.mastery`, id -> điểm) và đoạn chữ + thanh tiến độ ở bảng Công pháp.
 * THUẦN (không DOM). Máy chủ là bên cộng điểm và quyết lên tầng; client chỉ HIỆN số đã nhận, KHÔNG tự cộng giữa hai lần gửi (không biết đòn nào trúng), nên thanh có thể trễ
 * tới một nhịp gửi (<= 30 s, lúc dùng chiêu): chữ nói rõ "cập nhật khi dùng chiêu", không hứa số tức thời.
 *
 * Luật nhận (hợp đồng `SkillsMsg.mastery`): CÓ trường = thay thế toàn bộ điểm đã nhớ; VẮNG trường = giữ nguyên (máy chủ giãn nhịp). Trừ khi tầng của chiêu ĐỔI giữa hai
 * tin: khi đó điểm đã nhớ của chiêu đó bỏ ngay (lên tầng thì điểm tầng cũ hết nghĩa; tin kế tiếp, nếu có, mang điểm mới). Chỉ hiện khi đã từng nhận trường `mastery` (xem
 * `SkillTracker.masteryKnown`): máy chủ chưa gửi (bản cũ) thì không vẽ thanh luôn kẹt ở 0.
 */
import { masteryNeedOf, skillOf, type SkillDef } from "@tien-gioi/shared";
import { fmtInt } from "./world-boss-view";

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Điểm luyện đã làm sạch từ trường `mastery` của tin: chỉ id chiêu THẬT, đã học, còn luyện được (`masteryNeedOf` khác `null`), điểm là số hữu hạn >= 0 và < điểm cần của
 * tầng hiện tại (làm tròn xuống). Mục sai bị bỏ riêng từng mục (không bỏ cả tin). Không phải đối tượng thì `null`.
 */
export function parseMastery(
  raw: unknown,
  learned: Readonly<Record<string, number>>,
): Record<string, number> | null {
  if (!isObj(raw)) return null;
  const out: Record<string, number> = {};
  for (const id of Object.keys(raw)) {
    const def = skillOf(id);
    if (!def || !Object.prototype.hasOwnProperty.call(learned, id)) continue;
    const need = masteryNeedOf(def, learned[id]!);
    const v = raw[id];
    if (need === null || typeof v !== "number" || !Number.isFinite(v)) continue;
    const p = Math.floor(v);
    if (p < 0 || p >= need) continue;
    out[id] = p;
  }
  return out;
}

/** Thanh tiến độ luyện lên tầng kế, hoặc một dòng chữ khi không có gì để luyện. */
export type MasteryView =
  | {
      kind: "bar";
      points: number;
      need: number;
      /** 0..100, làm tròn xuống (chỉ để đặt bề rộng thanh) */
      percent: number;
      text: string;
      aria: string;
    }
  | { kind: "note"; text: string };

/**
 * Đoạn luyện chiêu của một hàng ở bảng Công pháp. `null` khi chưa nên hiện (`known` = đã nhận trường `mastery` ít nhất một lần) hoặc tầng không hợp lệ. Còn luyện được thì
 * THANH (điểm / điểm cần); tầng kế chỉ bằng kinh quyển trùng (tầng tối đa - 1) hoặc đã tối đa thì một dòng chữ.
 */
export function masteryView(
  def: Pick<SkillDef, "name" | "grade">,
  level: number,
  points: number,
  maxLevel: number,
  known: boolean,
): MasteryView | null {
  if (!known || !Number.isInteger(level) || level < 1) return null;
  if (level >= maxLevel) return { kind: "note", text: "Đã đạt tầng tối đa." };
  const need = masteryNeedOf(def, level);
  if (need === null)
    return { kind: "note", text: `Tầng ${level + 1} chỉ nâng bằng kinh quyển trùng.` };
  const p = Number.isFinite(points) ? Math.min(need - 1, Math.max(0, Math.floor(points))) : 0;
  return {
    kind: "bar",
    points: p,
    need,
    percent: Math.min(100, Math.floor((p / need) * 100)),
    text: `Luyện lên tầng ${level + 1}: ${fmtInt(p)} / ${fmtInt(need)} điểm (cập nhật khi dùng chiêu)`,
    aria: `Luyện chiêu ${def.name} lên tầng ${level + 1}: ${fmtInt(p)} trên ${fmtInt(need)} điểm`,
  };
}
