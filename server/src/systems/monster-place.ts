// Dựng một con quái vào thế giới (state + dữ liệu riêng). Tách khỏi `monsters.ts` để `boss.ts` (trùm triệu hồi quái con) dùng được mà không vòng import.
import { bossDefOf, type MonsterKind } from "@tien-gioi/shared";
import { Monster } from "../schema";
import { type World } from "../world";
import { newBossCtrl } from "./boss-state";
import { eliteDefOf } from "./elite";

/**
 * Quái KHÔNG có mục tiêu (lang thang, về nhà) chỉ áp bước di chuyển mỗi WANDER_STRIDE tick, với bước dài gấp bấy nhiêu lần:
 * tốc độ trung bình y hệt, nhưng vị trí trong state chỉ đổi 1/WANDER_STRIDE số lần (#80). Quái chạy chậm (~1 px/tick) và client
 * nội suy vị trí quái nên không nhìn ra; quái có mục tiêu (đang đuổi / đánh) vẫn di chuyển mỗi tick.
 * Vị trí thật vẫn nằm trong state (không tách vị trí mô phỏng) nên các system khác đọc `m.x`, `m.y` như cũ.
 */
export const WANDER_STRIDE = 4;

/** Dựng một con quái `def` ở (x, y): vào state và dữ liệu riêng. Không kiểm vị trí (người gọi lo). */
export function placeMonster(w: World, def: MonsterKind, x: number, y: number, elite = false) {
  if (elite) def = eliteDefOf(def); // tinh anh (M7.3, `elite.ts`): số liệu nhân, `id` giữ nguyên
  const id = `m${++w.monsterSeq}`;
  const m = new Monster();
  m.kind = def.id;
  if (elite) m.elite = 1; // đặt MỘT lần lúc sinh
  m.x = x;
  m.y = y;
  m.hp = def.hp;
  m.maxHp = def.hp;
  w.state.monsters.set(id, m);
  // Trùm nhiều chiêu (mục 42): chỉ khi phòng bật `bossMoves` và loài có bộ chiêu trong `BOSSES`; không thì chạy như cũ (đòn thường / đập đất / lao)
  const bossDef = w.bossMoves && !elite ? bossDefOf(def.id) : undefined;
  w.mctrl.set(id, {
    def,
    homeX: x,
    homeY: y,
    target: null,
    nextAttack: 0,
    wanderX: x,
    wanderY: y,
    nextWander: 0,
    damageBy: new Map(),
    hpFrac: 0,
    // Lệch pha theo số thứ tự để quái không cùng nhúc nhích một tick (không dùng random: giữ nguyên chuỗi của bench có seed)
    strideLeft: w.monsterSeq % WANDER_STRIDE,
    ...(elite ? { elite: true as const } : {}),
    ...(bossDef ? { boss: newBossCtrl(bossDef, w.monsterSeq) } : {}),
  });
  return id;
}
