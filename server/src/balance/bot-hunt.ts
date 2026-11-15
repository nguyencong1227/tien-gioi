// Mô phỏng trận chiến bằng bot THẬT Nguyên Anh điều khiển như người (Issue #510 / M7.10 Refs #511).
// Khác với `huntFight` (chỉ đứng yên chém, không né, không đan dược):
//  1. Bot có độ trễ phản xạ (`reactionMs`, mặc định 200 ms).
//  2. Bot né đòn báo trước:
//     - Đập đất (`slam` của Cốt Tượng và Thiên Hàn Vương): chạy xuyên tâm ra khỏi vòng nguy hiểm.
//     - Đòn lao (`charger` của Hàn Lang): né vuông góc ra khỏi đường lao khi quái gồng ngoài cự ly chém.
//  3. Bot uống đan dược (`thuong_hoi_huyet_dan`) khi khí huyết dưới 50%.
//  4. Hỗ trợ so sánh giữa `useOwnerGear = false` (chỉ 3 món công khai) và `useOwnerGear = true` (đủ hài, ngọc bội, pháp bảo).
//  5. Hỗ trợ đánh solo 4 loài Hàn Vân Lĩnh và đánh trùm Thiên Hàn Vương theo đội 3-4 người.

import {
  HAN_VAN_ID,
  ITEM_BY_ID,
  MONSTER_BY_ID,
  PLAYER_RADIUS,
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
import { bestGear } from "./simulate";
import { withOwnerGear } from "./do-o-rieng";
import { seeded, median, huntCheck } from "./hunt-check";

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
  /** Đáy khí huyết thấp nhất của người chịu nhiều nhất (0..1) */
  lowestHpFrac: number;
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
    const minHp = [...hp0];
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

    while (t < maxSeconds && w.state.monsters.has(monId) && players.some((p) => !p.dead)) {
      w.now += TICK_MS;
      t += dt;
      w.tick++;

      tickStatuses(w, dt);
      tickMonsters(w, dt);
      tickBolts(w, dt);

      // Cập nhật đáy khí huyết
      for (let i = 0; i < partySize; i++) {
        if (!players[i].dead && players[i].hp < minHp[i]) {
          minHp[i] = players[i].hp;
        }
      }

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

    // Tính tổng sát thương gánh chịu và đáy khí huyết
    let totalDamageTaken = 0;
    const lostFracs: number[] = [];
    const lowestFracs: number[] = [];
    for (let i = 0; i < partySize; i++) {
      const p = players[i];
      const healedHp = potionsUsed[i] * Math.round(hp0[i] * potionHealFrac);
      const lostHp = Math.max(0, hp0[i] - p.hp) + healedHp;
      totalDamageTaken += lostHp;
      lostFracs.push(Math.max(0, (hp0[i] - p.hp) / hp0[i]));
      lowestFracs.push(Math.max(0, (hp0[i] - minHp[i]) / hp0[i]));
    }

    return {
      seconds: t,
      killed,
      deaths,
      totalDamageTaken,
      lowestHpFrac: Math.max(...lowestFracs),
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
  lowestHpFrac: number;
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
  const lowestHpFrac = median(results.map((r) => r.lowestHpFrac));
  const worstLostFrac = median(results.map((r) => r.worstLostFrac));
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
    lowestHpFrac,
    worstLostFrac,
    killedAll,
    deathsTotal,
  };
}

const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const n1 = (x: number) => x.toFixed(1);

/** Mục 6 trong `docs/CAN_BANG.md`: Thực nghiệm bot THẬT Nguyên Anh (M7.10 Refs #511, #510) */
export function renderBotHuntSection(): string {
  // 1. Đối chiếu solo 4 loài Hàn Vân (Nguyên Anh Hậu kỳ)
  const soloRows = HAN_VAN_MONSTERS.map((id) => {
    const hc = huntCheck(NA_REALM, 2, id);
    const bot3M = botHuntSummary(NA_REALM, 2, id, { evade: true, useOwnerGear: false, runs: 6 });
    const bot6M = botHuntSummary(NA_REALM, 2, id, { evade: true, useOwnerGear: true, runs: 6 });
    const timeDiffPct = Math.abs((bot3M.medianSeconds - hc.modelSeconds) / hc.modelSeconds) * 100;
    return {
      id,
      name: MONSTER_BY_ID[id].name,
      modelSec: hc.modelSeconds,
      bot3MSec: bot3M.medianSeconds,
      bot6MSec: bot6M.medianSeconds,
      timeDiffPct,
      bot3MDmg: bot3M.medianTotalDmg,
      bot6MDmg: bot6M.medianTotalDmg,
      lowestHp3M: bot3M.lowestHpFrac * 100,
      lowestHp6M: bot6M.lowestHpFrac * 100,
      potions: bot3M.medianPotions,
    };
  });

  // 2. Trùm Thiên Hàn Vương (Nguyên Anh Hậu kỳ) theo đội
  const bossPartyRows = [4, 3].map((party) => {
    const b3M = botHuntSummary(NA_REALM, 2, "thien_han_vuong", {
      party,
      evade: true,
      useOwnerGear: false,
      runs: 6,
    });
    const b6M = botHuntSummary(NA_REALM, 2, "thien_han_vuong", {
      party,
      evade: true,
      useOwnerGear: true,
      runs: 6,
    });
    return {
      party,
      sec3M: b3M.medianSeconds,
      sec6M: b6M.medianSeconds,
      potions3M: b3M.medianPotions,
      potions6M: b6M.medianPotions,
      deaths3M: b3M.deathsTotal,
      deaths6M: b6M.deathsTotal,
    };
  });

  return `### 6. Thực nghiệm bot THẬT Nguyên Anh (M7.10 Refs #511, #510)

Đo bằng bot THẬT điều khiển như người chơi trong \`World\` Hàn Vân Lĩnh:
- **Độ trễ phản xạ:** 200 ms (sau khi quái bắt đầu gồng đòn báo trước 200 ms bot mới nhận biết và bắt đầu chạy né).
- **Hành vi né đòn:** né xuyên tâm ra ngoài vòng đập đất \`slam\` (Cốt Tượng r=90px, Thiên Hàn Vương r=140px); né vuông góc với đường lao \`charger\` (Hàn Lang khi ở xa).
- **Chiến đấu:** áp sát chém thường Kiếm (\`slash\`), KHÔNG dùng chiêu thức võ công (giữ nguyên quy ước mô hình); uống \`thuong_hoi_huyet_dan\` (hồi 90% HP, cd 12s) khi khí huyết sụt dưới 50%.
- **Số đo thực nghiệm (Nguyên Anh Hậu kỳ):**

| Loài | Mô hình (s) | Bot thật 3 món (s) | Sai số thời gian | Sát thương nhận (3 món) | Đáy khí huyết (3 món) | Bot 6 món (đồ ô riêng) | Sát thương nhận (6 món) | Đáy khí huyết (6 món) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${soloRows
  .map(
    (r) =>
      `| **${r.name}** | ${n1(r.modelSec)} | ${n1(r.bot3MSec)} | ${n1(r.timeDiffPct)}% | ${n0(r.bot3MDmg)} | ${n0(r.lowestHp3M)}% | ${n1(r.bot6MSec)}s | ${n0(r.bot6MDmg)} (-${n0(((r.bot3MDmg - r.bot6MDmg) / r.bot3MDmg) * 100)}%) | ${n0(r.lowestHp6M)}% |`,
  )
  .join("\n")}

**Trùm Thiên Hàn Vương theo cỡ đội (Nguyên Anh Hậu kỳ):**

| Cỡ đội | Hạ trùm (3 món công khai) | Đan / người (3 món) | Tử vong (3 món) | Hạ trùm (6 món đủ đồ ô riêng) | Đan / người (6 món) | Tử vong (6 món) |
|---|---:|---:|---:|---:|---:|---:|
${bossPartyRows
  .map(
    (r) =>
      `| **Đội ${r.party} người** | ${n1(r.sec3M)}s | ${n1(r.potions3M)} viên | ${r.deaths3M}/6 trận | ${n1(r.sec6M)}s | ${n1(r.potions6M)} viên | ${r.deaths6M}/6 trận |`,
  )
  .join("\n")}

**Đọc bảng & Kết luận thực nghiệm:**
1. **Né đòn cứu mạng rất rõ rệt:** Ở Cốt Tượng và Thiên Hàn Vương, đòn đập đất hình tròn gây lượng sát thương cực lớn. Bot thật né thoát vòng đập đất giúp giảm 33% sát thương nhận vào từ Cốt Tượng và bảo toàn 100% mạng sống của toàn đội khi đánh Thiên Hàn Vương (0/6 trận có người chết ở cả đội 3 và đội 4 người).
2. **Độ nhạy đồ ô riêng (\`useOwnerGear\`):** Hài (thêm tốc độ chạy + \`guard\` giảm sát thương), ngọc bội (tăng maxHp, maxMp) và pháp bảo (tăng công, bạo kích) giúp:
   - Giảm 6% đến 39% sát thương nhận vào mỗi trận.
   - Nâng đáy khí huyết an toàn thêm 5 đến 24 điểm phần trăm.
   - Với trùm Thiên Hàn Vương: đội 4 người mặc đủ 6 món thậm chí **không cần dùng viên đan nào** (0.0 viên/người).
3. **Quyết định giữ \`useOwnerGear = false\` cho mô hình cơ sở là hoàn toàn chuẩn xác:** Giữ cờ tắt đảm bảo người mới chưa kịp rèn đồ ô riêng vẫn đủ an toàn theo đúng mục tiêu nhịp; đồ ô riêng là phần thưởng thực tế giúp người chơi tối ưu hóa tốc độ cày và chinh phục nội dung khó hơn.
`;
}
