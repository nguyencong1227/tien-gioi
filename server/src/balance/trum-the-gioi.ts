// Cân bằng TRÙM THẾ GIỚI (M9.10 #1029, QUYET_DINH_M3 mục 59 ưu tiên 2): chọn `WorldBossSlot.hpMult`. Bộ chiêu `BOSSES` được cân cho đội 3-4 người hạ trong 1-2 phút (`trum.ts`), quá mỏng cho
// sự kiện `durationMin` phút của cả server nên khung giờ nhân MÁU của loài. Hai mô hình cho cùng một khung (chạy bộ thực thi trùm THẬT `fightBossMoves`, rẻ: vài chục ms mỗi trận):
//  - "né hoàn hảo" (cận LẠC QUAN, mọi đòn có báo trước đều né được: `boss-data-dodge.test.ts` / `trum.ts` mục 3): không ai chết, thời gian = máu thật / (số người x DPS mỗi người x uptime). DPS mỗi
//    người đo từ trận của đội nhỏ ở máu gốc (`PER_PLAYER_PARTY` người, 0 chết, gồm cả thời gian diệt quái con); uptime = `ASSUME_DUNGEON.bossUptime` (né làm đánh chậm đi);
//  - "không né" (cận BI QUAN: người đứng cạnh trùm đánh thường, uống đan, trùm trúng mọi đòn): chạy thẳng đội N người với máu nhân; chết là chết THẬT (bản đồ thường: Hoàng Tuyền, mất kiếp).
// Người chơi thật nằm giữa hai cận. `minPlayers` (né hoàn hảo) = số người ít nhất hạ được trùm TRONG `durationMin`: mục tiêu của M9.10 là cộng đồng nhỏ vẫn hạ được (không một mình) nhưng
// không dễ như đội bí cảnh. Số ở đây là ĐỀ XUẤT: chỉ ĐO và báo vi phạm (`worldBossBalanceViolations`).
import {
  BOSSES,
  WORLD_BOSS_SCHEDULE,
  MONSTER_BY_ID,
  worldBossHpOf,
  type WorldBossSlot,
} from "@tien-gioi/shared";
import { ASSUME_DUNGEON } from "./dungeon";
import { ASSUME_BOSS, bossStep, fightBossMoves } from "./trum";

/** Giả định riêng của trùm thế giới. */
export const ASSUME_WORLD_BOSS = {
  /** Đội nhỏ dùng đo DPS mỗi người (trận ở máu gốc phải hạ được với 0 chết). */
  perPlayerParty: 5,
  /** Số hạt giống đo DPS và chạy mô hình "không né". */
  runs: 4,
  /** Cỡ đội đo (theo issue #1029: 5 / 20 / 50 người). */
  parties: [5, 20, 50] as readonly number[],
  /** Mục tiêu: số người tối thiểu hạ được trùm trong thời lượng (né hoàn hảo) nằm trong khoảng này. */
  minPlayers: { min: 4, max: 8 },
  /** Mục tiêu: đội 50 người (cận lạc quan) không hạ nhanh hơn chừng này phút (sự kiện không biến thành trò 2 phút). */
  fastestMinutes: 3,
} as const;

export interface WorldBossRow {
  slot: WorldBossSlot;
  /** Máu thật. */
  hp: number;
  /** DPS thật mỗi người (máu / giây, đã chia uptime), đo ở bậc đúng bậc của trùm; `null` nếu đội nhỏ không hạ nổi trùm gốc. */
  dpsPerPlayer: number | null;
  /** Phút THẬT để đội `n` người hạ trùm khi né hoàn hảo. */
  dodgeMinutes: Record<number, number | null>;
  /** Số người ít nhất hạ được trong `durationMin` (né hoàn hảo); `null` nếu không đo được. */
  minPlayers: number | null;
  /** Mô hình "không né": tỉ lệ trận hạ được, phút thật trung bình (trận thắng), số người chết trung bình mỗi trận. */
  noDodge: Record<number, { winRate: number; minutes: number | null; deaths: number }>;
}

/** DPS thật mỗi người từ trận đội nhỏ ở máu gốc (hạt giống 1..runs, chỉ tính trận thắng với 0 chết). */
export function perPlayerDps(boss: string): number | null {
  const def = BOSSES.find((b) => b.kind === boss);
  if (!def) return null;
  const hp = MONSTER_BY_ID[boss].hp;
  const n = ASSUME_WORLD_BOSS.perPlayerParty;
  let sum = 0;
  let k = 0;
  for (let seed = 1; seed <= ASSUME_WORLD_BOSS.runs; seed++) {
    const f = fightBossMoves(def, n, seed, 1);
    if (f.killed && f.deaths === 0) {
      sum += hp / f.seconds / n;
      k++;
    }
  }
  return k > 0 ? (sum / k) * ASSUME_DUNGEON.bossUptime : null;
}

/** Đo MỘT khung giờ. */
export function measureSlot(slot: WorldBossSlot): WorldBossRow {
  const def = BOSSES.find((b) => b.kind === slot.boss);
  if (!def) throw new Error(`khung ${slot.id}: loài ${slot.boss} không có bộ chiêu`);
  const hp = worldBossHpOf(slot);
  const dps = perPlayerDps(slot.boss);
  const dodgeMinutes: WorldBossRow["dodgeMinutes"] = {};
  for (const n of ASSUME_WORLD_BOSS.parties)
    dodgeMinutes[n] = dps === null ? null : hp / (n * dps) / 60;
  const minPlayers = dps === null ? null : Math.ceil(hp / (dps * slot.durationMin * 60));
  const noDodge: WorldBossRow["noDodge"] = {};
  const limit = slot.durationMin * 60 * ASSUME_DUNGEON.bossUptime; // trận thật dài ra 1 / uptime nên hết giờ sớm hơn theo giây mô phỏng
  for (const n of ASSUME_WORLD_BOSS.parties) {
    let wins = 0;
    let sec = 0;
    let deaths = 0;
    for (let seed = 1; seed <= ASSUME_WORLD_BOSS.runs; seed++) {
      const f = fightBossMoves(
        def,
        n,
        seed,
        slot.hpMult ?? 1,
        Math.min(limit, ASSUME_BOSS.maxSeconds * 4),
      );
      deaths += f.deaths;
      if (f.killed) {
        wins++;
        sec += f.seconds;
      }
    }
    noDodge[n] = {
      winRate: wins / ASSUME_WORLD_BOSS.runs,
      minutes: wins > 0 ? sec / wins / ASSUME_DUNGEON.bossUptime / 60 : null,
      deaths: deaths / ASSUME_WORLD_BOSS.runs,
    };
  }
  return { slot, hp, dpsPerPlayer: dps, dodgeMinutes, minPlayers, noDodge };
}

export function measureSchedule(
  slots: readonly WorldBossSlot[] = WORLD_BOSS_SCHEDULE,
): WorldBossRow[] {
  return slots.map(measureSlot);
}

/**
 * Chỗ vi phạm mục tiêu (rỗng = đạt): số người tối thiểu (né hoàn hảo) trong `minPlayers`; đội 50 người không hạ nhanh hơn `fastestMinutes` phút. Không đo được DPS (đội nhỏ không hạ nổi
 * trùm gốc) cũng là vi phạm (không có cơ sở chọn hệ số).
 */
export function worldBossBalanceViolations(
  rows: readonly WorldBossRow[] = measureSchedule(),
): string[] {
  const bad: string[] = [];
  const { min, max } = ASSUME_WORLD_BOSS.minPlayers;
  for (const r of rows) {
    const at = `khung "${r.slot.id}" (${r.slot.boss}, hpMult ${r.slot.hpMult ?? 1})`;
    if (r.minPlayers === null || r.dpsPerPlayer === null) {
      bad.push(
        `${at}: đội ${ASSUME_WORLD_BOSS.perPlayerParty} người không hạ nổi trùm gốc (không đo được DPS)`,
      );
      continue;
    }
    if (r.minPlayers < min || r.minPlayers > max)
      bad.push(
        `${at}: cần ít nhất ${r.minPlayers} người (né hoàn hảo) để hạ trong ${r.slot.durationMin} phút, mục tiêu ${min}-${max}`,
      );
    const fast = r.dodgeMinutes[Math.max(...ASSUME_WORLD_BOSS.parties)];
    if (fast !== null && fast < ASSUME_WORLD_BOSS.fastestMinutes)
      bad.push(
        `${at}: đội ${Math.max(...ASSUME_WORLD_BOSS.parties)} người hạ trong ${fast.toFixed(1)} phút (< ${ASSUME_WORLD_BOSS.fastestMinutes})`,
      );
  }
  return bad;
}

// ---------- Báo cáo Markdown cho docs/CAN_BANG.md ----------

const f0 = (n: number) => Math.round(n).toLocaleString("vi-VN");
const f1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Mục "Trùm thế giới" của `docs/CAN_BANG.md` (sinh từ `WORLD_BOSS_SCHEDULE` thật; lịch rỗng thì chỉ nói chưa có). */
export function renderWorldBossBalance(
  slots: readonly WorldBossSlot[] = WORLD_BOSS_SCHEDULE,
): string {
  const head = `## Trùm thế giới: máu nhân \`hpMult\` (M9.10 #1029, mục 59)

> Phần này sinh từ \`server/src/balance/trum-the-gioi.ts\` (chạy bộ thực thi trùm thật \`fightBossMoves\`, máu = \`worldBossHpOf\`). Hai cận cho cùng một khung giờ: **né hoàn hảo** (không ai chết; thời gian = máu thật / (số người x DPS mỗi người x ${ASSUME_DUNGEON.bossUptime})) và **không né** (đứng đánh thường, uống đan, trùm trúng mọi đòn; chết là chết THẬT ở bản đồ thường). Người chơi thật nằm giữa. DPS mỗi người đo từ đội ${ASSUME_WORLD_BOSS.perPlayerParty} người hạ trùm ở máu gốc (${ASSUME_WORLD_BOSS.runs} hạt giống). Mục tiêu: số người tối thiểu hạ được trong thời lượng là ${ASSUME_WORLD_BOSS.minPlayers.min}-${ASSUME_WORLD_BOSS.minPlayers.max} (cộng đồng nhỏ vẫn hạ được, không một mình), đội ${Math.max(...ASSUME_WORLD_BOSS.parties)} người không dưới ${ASSUME_WORLD_BOSS.fastestMinutes} phút.
`;
  if (slots.length === 0)
    return `${head}
**Chưa có khung giờ nào** (\`WORLD_BOSS_SCHEDULE\` rỗng, #1029): chưa có gì để đo; lịch rỗng thì tính năng không chạy. Khi có lịch, chạy lại \`npm run can-bang -w server\`.
`;
  const rows = measureSchedule(slots);
  const parties = ASSUME_WORLD_BOSS.parties;
  const table = rows
    .map((r) => {
      const dodge = parties
        .map((n) => (r.dodgeMinutes[n] === null ? "-" : `${f1(r.dodgeMinutes[n]!)} ph`))
        .join(" / ");
      const nd = parties
        .map((n) => {
          const x = r.noDodge[n]!;
          return `${pct(x.winRate)}${x.minutes === null ? "" : ` ${f1(x.minutes)} ph`}, ${f1(x.deaths)} chết`;
        })
        .join(" / ");
      return `| ${r.slot.id} | ${MONSTER_BY_ID[r.slot.boss]?.name ?? r.slot.boss} x${r.slot.hpMult ?? 1} (${f0(r.hp)} máu) | ${r.slot.mapId} | ${String(r.slot.hour).padStart(2, "0")}:${String(r.slot.minute).padStart(2, "0")} / ${r.slot.durationMin} ph | ${r.dpsPerPlayer === null ? "-" : f0(r.dpsPerPlayer)} | **${r.minPlayers ?? "-"}** | ${dodge} | ${nd} |`;
    })
    .join("\n");
  const violations = worldBossBalanceViolations(rows);
  return `${head}
| Khung | Trùm (máu thật) | Bản đồ | Giờ / thời lượng | DPS mỗi người | **Người tối thiểu** | Né hoàn hảo: ${parties.join(" / ")} người | Không né: ${parties.join(" / ")} người (thắng, thời gian thật, chết) |
|---|---|---|---|--:|--:|---|---|
${table}

${violations.length === 0 ? "**Không vi phạm mục tiêu nào.**" : `**VI PHẠM (${violations.length}):**\n\n${violations.map((v) => `- ${v}`).join("\n")}`}
`;
}
