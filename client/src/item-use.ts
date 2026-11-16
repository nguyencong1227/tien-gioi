// Nút hành động "dùng" của một vật phẩm trong túi (lớp THUẦN, không DOM): đan dược (`effect`) -> "Dùng"; kinh quyển (`teaches`, M7.4) -> "Học". Trang bị có nút Mặc riêng.
// Server quyết định kết quả (đủ cảnh giới, đã học tối đa...); client chỉ hiện đúng nút để người chơi bấm được.
import {
  REALMS,
  canAttemptBreakthrough,
  clampStatusEffect,
  realmLabel,
  skillOf,
  skillReqMet,
  statusEffectFigures,
  statusOf,
  type ItemDef,
} from "@tien-gioi/shared";
import { effectText } from "./status-badges";

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

/** Bối cảnh để quyết định nút "Dùng" của vật phẩm gắn trạng thái có mờ không (tất cả lấy từ state của CHÍNH MÌNH, client không tin gì khác). */
export interface UseContext {
  /** Id các trạng thái đang còn hiệu lực (từ `StatusTracker.active`) */
  activeIds: ReadonlySet<string>;
  realm: number;
  tier: number;
  exp: number;
  expMax: number;
}

/**
 * Lý do ngắn vì sao nút "Dùng" của vật phẩm nên MỜ, hoặc `null` nếu dùng được (nghề nhỏ #514, issue #769). Chỉ cho vật phẩm `effect.kind === "status"`;
 * món khác luôn `null`. Cùng THỨ TỰ kiểm với máy chủ (`useItem` ở `server/src/systems/inventory.ts`): hiệu lực không hợp lệ, sai bậc / chưa đủ tu vi, rồi mới
 * "đang còn hiệu lực", để lý do hiện ra trùng lý do máy chủ sẽ báo. Máy chủ vẫn là nơi quyết định (từ chối thì KHÔNG trừ vật phẩm): client chỉ mờ nút cho
 * người chơi khỏi bấm hụt, và đường bấm khác (nhấp đúp, Enter) vẫn gửi tin để máy chủ báo lý do.
 */
export function useBlockReason(
  def: Pick<ItemDef, "effect"> | undefined,
  ctx: UseContext,
): string | null {
  const e = def?.effect;
  if (e?.kind !== "status") return null;
  const eff = clampStatusEffect(e);
  if (!eff) return "Không dùng được";
  if (e.forRealm !== undefined) {
    const forRealm = Math.trunc(e.forRealm);
    if (ctx.realm !== forRealm || !canAttemptBreakthrough(ctx.realm, ctx.tier, ctx.exp, ctx.expMax))
      return `Cần đỉnh ${REALMS[forRealm]?.name ?? "cảnh giới"}, đầy tu vi`;
  }
  if (ctx.activeIds.has(eff.id)) return "Đang còn hiệu lực";
  return null;
}

/**
 * Dòng "Hiệu lực: cộng 15% xác suất đột phá lần kế · 15 phút" ở chi tiết túi của vật phẩm gắn trạng thái, tính từ số máy chủ THẬT SỰ áp dụng
 * (`clampStatusEffect` kẹp theo `STATUSES`, phần trăm / thời gian qua `statusEffectFigures` như bài kiểm mô tả của D), nên không phụ thuộc chữ viết tay
 * trong `desc`. `null` nếu không phải vật phẩm gắn trạng thái (hoặc hiệu lực hỏng: máy chủ cũng từ chối).
 */
export function statusEffectLine(def: Pick<ItemDef, "effect"> | undefined): string | null {
  const e = def?.effect;
  if (e?.kind !== "status") return null;
  const eff = clampStatusEffect(e);
  const st = eff ? statusOf(eff.id) : undefined;
  if (!eff || !st) return null;
  const time = statusEffectFigures(eff).time;
  return `Hiệu lực: ${effectText(st, eff.ratio)} · ${time[time.length - 1]}`;
}
