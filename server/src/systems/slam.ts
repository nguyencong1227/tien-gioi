// Đập đất của quái (M7.3, #504, docs/PHAN_CONG_M7.md mục 6): `MonsterKind.slam` là đòn PHỤ độc lập với `behavior` (cận chiến hay `charger` đều dùng được).
// Luật chốt (server quyết định, người chơi tránh được):
//  - Người chơi trong `radius` và quái đã hết hồi (`nextSlam`) thì quái ĐỨNG GỒNG `windupMs` và gửi MỘT `fx` `warn` hình tròn (tâm = chỗ quái đứng, bán kính `radius`).
//  - Trúng tính theo VỊ TRÍ người chơi LÚC ĐÁP ĐÒN: bước ra ngoài vòng (bán kính + bán kính người chơi) trong lúc gồng thì KHÔNG trúng.
//  - Không trúng người trong khu an toàn; người chết / hồn lìa xác / thách đấu / đang né do `hurtPlayer` bỏ qua (một nơi giữ các luật này).
//  - Choáng (`stun`) NGẮT cú gồng (không đáp đòn) và phạt chờ cả `cdMs`: phần thưởng cho chiêu khống chế (M7.2b).
//  - Không bắt đầu gồng khi quái đang gồng / thở của `charger` (`mc.ai`); đang đập đất thì `charger` không bắt đầu lao (`monsters.ts` kiểm đập đất trước).
//  - Sát thương cố định `round(atk x mult)`, không dùng `Math.random` (giữ nguyên chuỗi của bench có seed).
// Mô-đun chỉ biết `World`; `monsters.ts` gọi `slamStep` mỗi tick cho quái có mục tiêu và có `def.slam`.
import { PLAYER_RADIUS } from "@tien-gioi/shared";
import type { Monster } from "../schema";
import type { MonsterCtrl, World } from "../world";
import { hurtPlayer } from "./combat";

/** Đáp đòn: mọi người còn trong vòng (tâm lúc gồng) mất `round(atk x mult)`. Quái đã chết giữa lúc gồng thì không gọi tới đây. */
function strike(w: World, id: string, m: Monster, mc: MonsterCtrl, x: number, y: number) {
  const slam = mc.def.slam!;
  w.events.fx({ kind: "mslash", by: id, x, y, angle: m.angle });
  const dmg = Math.round(mc.def.atk * slam.mult);
  const reach = slam.radius + PLAYER_RADIUS;
  // Gom trước rồi mới gây sát thương: `hurtPlayer` có thể làm người chơi chết / đổi `w.state.players` (luân hồi)
  const hit: string[] = [];
  w.state.players.forEach((p, sid) => {
    if (w.map.inSafe(p.x, p.y, 20)) return;
    if (Math.hypot(p.x - x, p.y - y) <= reach) hit.push(sid);
  });
  for (const sid of hit) {
    const p = w.state.players.get(sid);
    if (p) hurtPlayer(w, sid, p, dmg, m);
  }
}

/**
 * Một tick đập đất của quái có mục tiêu `target` ở khoảng cách `d`. Trả `true` nếu quái đang gồng / vừa đáp đòn tick này (người gọi KHÔNG di chuyển, KHÔNG
 * đánh thường, KHÔNG lao), `false` thì quái chạy như thường.
 */
export function slamStep(
  w: World,
  id: string,
  m: Monster,
  mc: MonsterCtrl,
  d: number,
  stunned: boolean,
): boolean {
  const def = mc.def;
  const slam = def.slam;
  if (!slam) return false;
  const cur = mc.slam;
  if (cur) {
    if (stunned) {
      // Bị choáng giữa lúc gồng: huỷ đòn, phạt chờ cả một vòng hồi
      mc.slam = undefined;
      mc.nextSlam = w.now + slam.cdMs;
      return true;
    }
    if (w.now >= cur.until) {
      mc.slam = undefined;
      mc.nextSlam = w.now + slam.cdMs;
      strike(w, id, m, mc, cur.x, cur.y);
    }
    return true;
  }
  if (stunned || mc.ai || w.now < (mc.nextSlam ?? 0)) return false;
  if (d > slam.radius + PLAYER_RADIUS) return false; // người chơi chưa vào vòng
  // Bắt đầu gồng: đứng yên, báo trước cho người ở gần (tâm vòng cố định tại chỗ quái đang đứng)
  mc.slam = { until: w.now + slam.windupMs, x: m.x, y: m.y };
  w.events.fx({ kind: "warn", shape: "circle", x: m.x, y: m.y, r: slam.radius, ms: slam.windupMs });
  return true;
}

/** Quái mất mục tiêu giữa lúc gồng: bỏ đòn đang dở (không đáp, không phạt hồi). `monsters.ts` gọi khi không có mục tiêu. */
export function cancelSlam(mc: MonsterCtrl) {
  if (mc.slam) mc.slam = undefined; // chỉ ghi khi đang gồng: đa số quái không có đập đất, không đổi hình dạng đối tượng mỗi tick
}
