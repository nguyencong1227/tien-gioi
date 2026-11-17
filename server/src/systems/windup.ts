// CHIÊU VẬN (`SkillDef.windupMs`, mục 51, CT5 lát 2, docs/PHAN_CONG_CHIEU_THUC.md mục 3 / 3b điểm 2): vận khí `windupMs` rồi MỚI đáp (hiệu ứng hình + sát thương).
//  - Tiêu hao linh lực + hồi chiêu tính LÚC BẮT ĐẦU (ở `cast`); `fx cast` gửi lúc bắt đầu để người ở gần vẽ vòng tụ khí; hiệu ứng của hình gửi lúc ĐÁP.
//  - Người đang vận chậm `WINDUP_SLOW` (50%) bằng trạng thái `windup` (kind `slow`, KHÔNG tính vào `MAX_STATUSES`, không bao giờ bị từ chối): `moveSpeedMul` dùng chung nên client đoán đúng.
//  - Đang vận thì KHÔNG dùng chiêu khác (`cast` bỏ qua).
//  - HUỶ (không đáp, không hoàn tiêu hao) khi: choáng, chết, hồn lìa xác, vào Hoàng Tuyền, hoặc một trận thách đấu BẮT ĐẦU trong lúc vận. Người chơi rời phòng / qua cổng thì
//    điều khiển (`PlayerCtrl`) mất theo nên không còn gì để đáp. Huỷ thì máy chủ không gửi tin nào thêm (client tự tắt vòng tụ khí, mục 3b / `game.ts`).
//  - Lúc đáp dùng vị trí HIỆN TẠI của người vận và hướng lúc bắt đầu; `release` do `cast.ts` đưa vào qua `land` (tránh vòng import cast <-> windup).
import { SKILL_LIMITS, WINDUP_MAX_MS, WINDUP_SLOW, type SkillDef } from "@tien-gioi/shared";
import type { Player } from "../schema";
import type { PlayerCtrl, World } from "../world";
import { applyPlayerStatus, refreshMoveCache, sendStatus } from "./status";
import { takeStatus } from "./status-rules";

/** Một lần vận khí đang diễn ra (chỉ server, dữ liệu riêng của chủ, không lưu). */
export interface Windup {
  /** Lúc đáp (`w.now`, ms) */
  until: number;
  /** Id chiêu đang vận (để test / nhật ký) */
  skill: string;
  /** Lúc bắt đầu vận đã đang trong trận thách đấu chưa: chỉ trận BẮT ĐẦU sau đó mới huỷ vận */
  duelAtStart: boolean;
  /** Đáp chiêu (do `cast.ts` dựng) */
  land: () => void;
}

/** Thời gian vận (ms) đã kẹp theo hợp đồng của chiêu `def`: 0 = chiêu TỨC THỜI (không khai `windupMs`, hoặc giá trị không hợp lệ). */
export function windupMsOf(def: Pick<SkillDef, "windupMs">): number {
  const v = def.windupMs;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return 0;
  return Math.min(WINDUP_MAX_MS, Math.max(SKILL_LIMITS.windupMin, v));
}

/** Bắt đầu vận `ms` ms: ghi `c.windup` và gắn trạng thái `windup` (chậm 50%) lên chính mình. */
export function beginWindup(
  w: World,
  sid: string,
  c: PlayerCtrl,
  def: SkillDef,
  ms: number,
  land: () => void,
) {
  c.windup = { until: w.now + ms, skill: def.id, duelAtStart: w.duels.has(sid), land };
  applyPlayerStatus(w, sid, { status: "windup", ms, ratio: WINDUP_SLOW, chance: 1 }, 0, sid);
}

/** Dọn trạng thái vận: bỏ `c.windup` và gỡ trạng thái `windup` (người vận chạy nhanh lại ngay). */
function endWindup(w: World, sid: string, c: PlayerCtrl) {
  c.windup = undefined;
  const box = c.st;
  if (!box) return;
  const had = takeStatus(box, "windup", w.now) !== undefined; // hết hạn cùng lúc đáp thì `takeStatus` đã dọn sẵn: vẫn phải tính lại tốc độ
  refreshMoveCache(c, w.now);
  if (had) sendStatus(w, sid);
}

/**
 * Mỗi tick, CHỈ cho người đang vận (`tickWorld` kiểm `c.windup` trước): huỷ nếu gặp điều kiện huỷ, đáp nếu tới giờ. Gọi TRƯỚC các `return` sớm của `tickWorld` (người chết, ở Hoàng Tuyền,
 * hồn lìa xác đều bị bỏ qua ở đó nhưng vẫn phải huỷ vận).
 */
export function tickWindup(w: World, sid: string, p: Player, c: PlayerCtrl) {
  const k = c.windup;
  if (!k) return;
  if (
    p.dead ||
    c.limbo ||
    c.stunned ||
    (w.ghosts.size > 0 && w.ghosts.has(sid)) ||
    (!k.duelAtStart && w.duels.has(sid))
  ) {
    endWindup(w, sid, c); // huỷ: tiêu hao không hoàn
    return;
  }
  if (w.now < k.until) return;
  endWindup(w, sid, c);
  k.land();
}
