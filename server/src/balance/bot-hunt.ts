// Mô phỏng trận chiến bằng bot THẬT Nguyên Anh điều khiển như người (Issue #510 / M7.10 Refs #511).
// Khác với `huntFight` (chỉ đứng yên chém, không né, không đan dược):
//  1. Bot có độ trễ phản xạ (`reactionMs`, mặc định 200 ms).
//  2. Bot né đòn báo trước:
//     - Đập đất (`slam` của Cốt Tượng và Thiên Hàn Vương): chạy xuyên tâm ra khỏi vòng nguy hiểm.
//     - Đòn lao (`charger` của Hàn Lang): né vuông góc ra khỏi đường lao.
//     - Đạn tầm xa (`bolt` của Phong Nha): né ngang tránh đường đạn.
//  3. Bot uống đan dược (`thuong_hoi_huyet_dan`) khi khí huyết dưới 50%.
//  4. Hỗ trợ so sánh giữa `useOwnerGear = false` (chỉ 3 món công khai) và `useOwnerGear = true` (đủ hài, ngọc bội, pháp bảo).
//  5. Hỗ trợ đánh solo 4 loài Hàn Vân Lĩnh và đánh trùm Thiên Hàn Vương theo đội 3-4 người.

import {
  HAN_VAN_ID,
  ITEM_BY_ID,
  MONSTER_BY_ID,
  PLAYER_RADIUS,
  REALMS,
  SKILLS,
  TICK_MS,
  getMap,
  statsFor,
} from "@tien-gioi/shared";
import { slash } from "../systems/combat";
import { setEquipment } from "../systems/equipment";
import { tickMonsters } from "../systems/monsters";
import { tickBolts } from "../systems/bolt";
import { tickStatuses } from "../systems/status";
import { applyStats } from "../systems/progression";
import { addMonster, addPlayer, makeWorld } from "../systems/test-helpers";
import { ASSUME, bestGear } from "./simulate";
import { seeded, median } from "./hunt-check";

/** Chạy `fn` với `ASSUME.useOwnerGear = on`, rồi khôi phục. */
export function withOwnerGear<T>(on: boolean, fn: () => T): T {
  const saved = ASSUME.useOwnerGear;
  ASSUME.useOwnerGear = on;
  try {
    return fn();
  } finally {
    ASSUME.useOwnerGear = saved;
  }
}

const NA_REALM = 4;
export const HAN_VAN_MONSTERS = ["han_lang", "phong_nha", "cot_tuong", "doc_tuoc"] as const;

export interface BotFightOptions {
  realm?: number;
  tier: number;
  monsterId: string;
  useOwnerGear?: boolean;
  evade?: boolean;
  reactionMs?: number;
  party?: number;
  potionId?: string;
  potions?: number;
  seed?: number;
  maxSeconds?: number;
  runs?: number;
}

export interface BotFightResult {
  seconds: number;
  killed: boolean;
  deaths: number;
  /** Tổng sát thương đã nhận (tính cả lượng khí huyết đã hồi từ đan) */
  totalDamageTaken: number;
  /** Tỉ lệ khí huyết mất ròng cuối trận của người sống sót hoặc người chịu nhiều nhất (0..1) */
  worstLostFrac: number;
  /** Số đan dược mỗi người đã dùng */
  potionsUsed: number[];
  /** Thống kê né đòn */
  warnsTargeted: number;
  warnsEvaded: number;
  warnsHit: number;
}

/** Chạy một trận chiến mô phỏng bot thật đánh quái trong World */
export function botFight(options: BotFightOptions): BotFightResult {
  const realm = options.realm ?? NA_REALM;
  const tier = options.tier;
  const monsterId = options.monsterId;
  const useOwnerGear = options.useOwnerGear ?? false;
  const evade = options.evade ?? true;
  const reactionMs = options.reactionMs ?? 200;
  const partySize = options.party ?? 1;
  const potionId =
    options.potionId ?? (realm >= NA_REALM ? "thuong_hoi_huyet_dan" : "dai_hoi_huyet_dan");
  const potionsEach = options.potions ?? (monsterId === "thien_han_vuong" ? 8 : 4);
  const maxSeconds = options.maxSeconds ?? (monsterId === "thien_han_vuong" ? 600 : 300);

  const saved = Math.random;
  Math.random = seeded(options.seed ?? 1);

  try {
    const map = getMap(HAN_VAN_ID)!;
    const { w } = makeWorld(map);

    // Chuẩn bị trang bị
    const gear = withOwnerGear(useOwnerGear, () => bestGear(realm, tier));

    const sids = Array.from({ length: partySize }, (_, i) => `Bot_${i}`);
    const players = sids.map((sid, i) => {
      const { p, c } = addPlayer(w, sid, realm, tier);
      setEquipment(p, gear);
      applyStats(p, true);
      if (potionsEach > 0) {
        c.inv[0] = { itemId: potionId, qty: potionsEach };
      }
      p.x = map.townPx.x + 300 + i * 16;
      p.y = map.townPx.y;
      return p;
    });

    const hp0 = players.map((p) => p.hp);
    const speed = statsFor(realm, tier, gear).speed;
    const itemDef = ITEM_BY_ID[potionId];
    const potionHealFrac =
      itemDef?.effect && "pct" in itemDef.effect ? (itemDef.effect as any).pct : 0.7;
    const potionCooldown = itemDef?.cooldown ?? 10_000;

    const potionsUsed = sids.map(() => 0);
    const nextPotionAt = sids.map(() => 0);
    const nextSlashAt = sids.map(() => 0);

    // Sinh quái
    const monDef = MONSTER_BY_ID[monsterId];
    if (!monDef) throw new Error(`Không tìm thấy quái: ${monsterId}`);
    const { id: monId } = addMonster(w, monsterId, players[0].x + 40, players[0].y);

    w.now = 1_000_000;
    const dt = TICK_MS / 1000;
    let t = 0;

    let warnsTargeted = 0;
    let warnsEvaded = 0;
    let warnsHit = 0;

    // Theo dõi cú gồng slam đang diễn ra để tính né
    let activeSlam: {
      x: number;
      y: number;
      radius: number;
      startedAt: number;
      until: number;
      resolved: boolean;
      targetSids: string[];
    } | null = null;

    let prevSlamRemaining = 0;

    while (t < maxSeconds && w.state.monsters.has(monId) && players.some((p) => !p.dead)) {
      w.now += TICK_MS;
      t += dt;
      w.tick++;

      tickStatuses(w, dt);
      tickMonsters(w, dt);
      tickBolts(w, dt);

      const m = w.state.monsters.get(monId);
      if (!m) break;
      const mc = w.mctrl.get(monId);

      // 1. Quản lý cảnh báo đập đất (slam)
      if (mc?.slam) {
        if (!activeSlam) {
          // Bắt đầu cú đập đất mới
          const slamDef = monDef.slam!;
          const targetsInRing = players
            .filter(
              (p) =>
                !p.dead &&
                Math.hypot(p.x - mc.slam!.x, p.y - mc.slam!.y) <= slamDef.radius + PLAYER_RADIUS,
            )
            .map((p) => p.name);

          activeSlam = {
            x: mc.slam.x,
            y: mc.slam.y,
            radius: slamDef.radius,
            startedAt: w.now - 50,
            until: mc.slam.until,
            resolved: false,
            targetSids: targetsInRing,
          };
          warnsTargeted += targetsInRing.length;
        }
      } else if (activeSlam && !activeSlam.resolved) {
        // Slam đã đáp đòn xong hoặc bị ngắt
        activeSlam.resolved = true;
        for (const sid of activeSlam.targetSids) {
          const p = w.state.players.get(sid);
          if (p && !p.dead) {
            const dist = Math.hypot(p.x - activeSlam.x, p.y - activeSlam.y);
            if (dist > activeSlam.radius + PLAYER_RADIUS) {
              warnsEvaded++;
            } else {
              warnsHit++;
            }
          }
        }
        activeSlam = null;
      }

      // 2. Vòng lặp hành động của từng bot trong đội
      for (let i = 0; i < partySize; i++) {
        const p = players[i];
        if (p.dead) continue;
        const sid = sids[i];
        const c = w.ctrl.get(sid)!;

        // Uống đan khi máu sụt dưới 50%
        if (p.hp < p.maxHp * 0.5 && (c.inv[0]?.qty ?? 0) > 0 && w.now >= nextPotionAt[i]) {
          c.inv[0]!.qty--;
          potionsUsed[i]++;
          p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * potionHealFrac));
          nextPotionAt[i] = w.now + potionCooldown;
        }

        // Kiểm tra xem bot có đang phải né đòn không
        let evading = false;
        let evadeDx = 0;
        let evadeDy = 0;

        if (evade && activeSlam) {
          const dToCenter = Math.hypot(p.x - activeSlam.x, p.y - activeSlam.y);
          const reach = activeSlam.radius + PLAYER_RADIUS;
          const timeElapsed = w.now - activeSlam.startedAt;

          // Sau thời gian phản xạ reactionMs, bot bắt đầu chạy né
          if (timeElapsed >= reactionMs && dToCenter <= reach + 10) {
            evading = true;
            if (dToCenter > 0.001) {
              evadeDx = (p.x - activeSlam.x) / dToCenter;
              evadeDy = (p.y - activeSlam.y) / dToCenter;
            } else {
              evadeDx = 1;
              evadeDy = 0;
            }
          }
        }

        // Né đòn lao (charger) của Hàn Lang
        if (evade && !evading && mc?.ai?.phase === "windup") {
          // Khi charger gồng lao, sau reactionMs né vuông góc với hướng lao
          const timeElapsed = w.now - (mc.ai.until - (monDef.windupMs ?? 800));
          if (timeElapsed >= reactionMs) {
            evading = true;
            const perpAngle = mc.ai.angle + Math.PI / 2;
            evadeDx = Math.cos(perpAngle);
            evadeDy = Math.sin(perpAngle);
          }
        }

        if (evading) {
          // Di chuyển né
          const step = speed * dt;
          const next = map.moveWithCollision(
            p.x,
            p.y,
            evadeDx * step,
            evadeDy * step,
            PLAYER_RADIUS,
          );
          p.x = next.x;
          p.y = next.y;
        } else {
          // Không né: tiếp cận và tấn công quái
          const dx = m.x - p.x;
          const dy = m.y - p.y;
          const d = Math.hypot(dx, dy);
          const reach = SKILLS.slash.range + monDef.radius;

          if (d > reach && d > 0) {
            const step = speed * dt;
            const next = map.moveWithCollision(
              p.x,
              p.y,
              (dx / d) * step,
              (dy / d) * step,
              PLAYER_RADIUS,
            );
            p.x = next.x;
            p.y = next.y;
          }

          if (w.now >= nextSlashAt[i]) {
            const aim = Math.atan2(dy, dx);
            slash(w, sid, aim);
            nextSlashAt[i] = w.now + SKILLS.slash.cooldown;
          }
        }
      }
    }

    const deaths = players.filter((p) => p.dead).length;
    const killed = !w.state.monsters.has(monId);

    // Tính tổng sát thương gánh chịu
    let totalDamageTaken = 0;
    const lostFracs: number[] = [];
    for (let i = 0; i < partySize; i++) {
      const p = players[i];
      const healedHp = potionsUsed[i] * Math.round(hp0[i] * potionHealFrac);
      const lostHp = Math.max(0, hp0[i] - p.hp) + healedHp;
      totalDamageTaken += lostHp;
      lostFracs.push((hp0[i] - p.hp) / hp0[i]);
    }

    return {
      seconds: t,
      killed,
      deaths,
      totalDamageTaken,
      worstLostFrac: Math.max(...lostFracs),
      potionsUsed,
      warnsTargeted,
      warnsEvaded,
      warnsHit,
    };
  } finally {
    Math.random = saved;
  }
}

export interface BotHuntSummary {
  monsterId: string;
  realm: number;
  tier: number;
  party: number;
  useOwnerGear: boolean;
  evade: boolean;
  medianSeconds: number;
  medianTotalDmg: number;
  medianPotions: number;
  worstLostFrac: number;
  killedAll: boolean;
  deathsTotal: number;
}

/** Chạy nhiều trận lấy trung vị cho một cấu hình */
export function botHuntSummary(
  realm: number,
  tier: number,
  monsterId: string,
  options: Partial<BotFightOptions> = {},
  defaultRuns = 6,
): BotHuntSummary {
  const party = options.party ?? 1;
  const useOwnerGear = options.useOwnerGear ?? false;
  const evade = options.evade ?? true;
  const runs = options.runs ?? defaultRuns;

  const results: BotFightResult[] = [];
  for (let seed = 1; seed <= runs; seed++) {
    results.push(
      botFight({
        realm,
        tier,
        monsterId,
        party,
        useOwnerGear,
        evade,
        seed,
        ...options,
      }),
    );
  }

  const medianSeconds = median(results.map((r) => r.seconds));
  const medianTotalDmg = median(results.map((r) => r.totalDamageTaken));
  const medianPotions = median(
    results.map((r) => r.potionsUsed.reduce((a, b) => a + b, 0) / party),
  );
  const worstLostFrac = Math.max(...results.map((r) => r.worstLostFrac));
  const killedAll = results.every((r) => r.killed);
  const deathsTotal = results.reduce((sum, r) => sum + r.deaths, 0);

  return {
    monsterId,
    realm,
    tier,
    party,
    useOwnerGear,
    evade,
    medianSeconds,
    medianTotalDmg,
    medianPotions,
    worstLostFrac,
    killedAll,
    deathsTotal,
  };
}
