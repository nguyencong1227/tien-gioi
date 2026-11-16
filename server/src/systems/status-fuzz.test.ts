// Fuzz kiểm tra luật trạng thái thuần (M7.2b + #514 nghề nhỏ, Refs #514, issue #770).
// Chuỗi thao tác NGẪU NHIÊN có hạt giống gắn / làm mới / hết hạn / vào khu an toàn gỡ DoT / tiêu hao đan hộ đạo.
// Sau MỖI bước kiểm các bất biến của chính sách (a) (docs/THIET_KE_NGHE_NHO.md mục 8.5):
//  1. Hộp luôn <= MAX_STATUSES (4).
//  2. Không trùng id trong hộp.
//  3. Mọi trạng thái trong hộp đều còn hạn (`until > now`).
//  4. Trạng thái CÓ HẠI mới (không bị miễn choáng / hết ô chặn) luôn VÀO khi hộp còn buff có lợi (khác dao_ho) để đẩy;
//     nạn nhân là buff có lợi hết hạn sớm nhất (khác dao_ho).
//  5. Buff CÓ LỢI mới KHÔNG BAO GIỜ làm mất một trạng thái có hại (dù sống lâu hơn tất cả).
//  6. Đan hộ đạo (`dao_ho`) không bị đẩy khi còn buff có lợi khác.
//  7. Khống chế (choáng `stun`, vỡ giáp `sunder`) chỉ mất khi hết hạn, không bị trạng thái khác đẩy ra.
// Mọi lỗi in kèm hạt + số bước để tái hiện.
import { describe, expect, it } from "vitest";
import {
  MAX_STATUSES,
  STATUSES,
  statusOf,
  type SkillEffect,
  type StatusDef,
  type StatusId,
} from "@tien-gioi/shared";
import {
  addStatus,
  newStatusBox,
  pruneStatuses,
  stripDots,
  takeStatus,
  type AddOpts,
  type StatusBox,
} from "./status-rules";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneBox(box: StatusBox): StatusBox {
  return {
    list: box.list.map((s) => ({ ...s })),
    stunImmuneUntil: box.stunImmuneUntil,
  };
}

function isControl(id: StatusId): boolean {
  const kind = statusOf(id)?.kind;
  return kind === "stun" || kind === "vuln";
}

function earliestBuff(box: StatusBox, withBreakAid: boolean): number {
  let victim = -1;
  for (let i = 0; i < box.list.length; i++) {
    const d = statusOf(box.list[i].id);
    if (!d || d.harmful) continue;
    if (!withBreakAid && d.kind === "breakAid") continue;
    if (victim < 0 || box.list[i].until < box.list[victim].until) victim = i;
  }
  return victim;
}

const BAD_IDS = ["constructor", "__proto__", "unknown_status", "", "null"];

interface FuzzCounters {
  added: number;
  refreshed: number;
  full: number;
  resisted: number;
  ignored: number;
  harmfulPushedBuff: number;
  beneficialDeniedByHarmful: number;
  daoHoProtected: number;
  controlPreserved: number;
  stripDotsCalled: number;
  takeStatusCalled: number;
}

function runStatusFuzz(seed: number, stepCount: number, counters?: FuzzCounters): void {
  const rand = rng(seed);
  const box = newStatusBox();
  let now = 1_000_000;

  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
  const chance = (p: number) => rand() < p;

  for (let step = 0; step < stepCount; step++) {
    const actionRoll = rand();

    if (actionRoll < 0.7) {
      // 70%: Gắn trạng thái ngẫu nhiên (addStatus)
      const valid = chance(0.92);
      const statusId = valid ? (pick(STATUSES) as StatusDef).id : (pick(BAD_IDS) as StatusId);
      const def = statusOf(statusId);

      const ms =
        statusId === "dao_ho"
          ? chance(0.9)
            ? 900_000
            : 600_000
          : chance(0.88)
            ? Math.floor(rand() * 15_000) + 500
            : chance(0.5)
              ? 60_000
              : -100;
      const ratio = chance(0.9) ? rand() * 0.4 + 0.05 : -0.1;
      const effect: SkillEffect = { status: statusId, ms, ratio, chance: 1 };

      const opts: AddOpts = {
        baseDmg: Math.floor(rand() * 200) + 10,
        maxHp: Math.floor(rand() * 1000) + 100,
        stunImmune: chance(0.12),
      };

      const before = cloneBox(box);
      // Giả lập trạng thái trước sau khi prune ở mốc `now`
      const prunedBefore = cloneBox(box);
      pruneStatuses(prunedBefore, now);

      const res = addStatus(box, effect, now, opts);
      const after = cloneBox(box);
      const where = `hạt ${seed} bước ${step} addStatus(${statusId}, ms=${ms}, ratio=${ratio})`;

      if (counters) {
        counters[res]++;
      }

      // --- Kiểm các bất biến cốt lõi ---
      // Bất biến 1: Trần MAX_STATUSES (4)
      expect(after.list.length, `${where}: số trạng thái vượt ${MAX_STATUSES}`).toBeLessThanOrEqual(
        MAX_STATUSES,
      );

      // Bất biến 2: Không trùng id
      const ids = after.list.map((s) => s.id);
      expect(new Set(ids).size, `${where}: có id trùng lặp [${ids.join(", ")}]`).toBe(ids.length);

      // Bất biến 3: Mọi mục còn hạn
      for (const s of after.list) {
        expect(s.until, `${where}: trạng thái ${s.id} đã hết hạn`).toBeGreaterThan(now);
      }

      // Bất biến 4: Trạng thái CÓ HẠI mới không bị chặn khi hộp còn buff có lợi để đẩy
      if (def?.harmful) {
        const stunBlocked =
          def.kind === "stun" && (opts.stunImmune || now < before.stunImmuneUntil);
        const victimBuffIdx = earliestBuff(prunedBefore, false);

        if (!stunBlocked && victimBuffIdx >= 0) {
          // Khi còn buff có lợi (khác dao_ho) và không bị miễn choáng: CÓ HẠI LUÔN VÀO!
          expect(res, `${where}: có hại bị chặn dù còn buff có lợi để đẩy`).not.toBe("full");

          if (res === "added" && prunedBefore.list.length >= MAX_STATUSES) {
            const victim = prunedBefore.list[victimBuffIdx];
            // Nạn nhân bị loại bỏ phải là victim
            const stillThere = after.list.some((s) => s.id === victim.id);
            expect(stillThere, `${where}: buff hết sớm nhất ${victim.id} không bị đẩy`).toBe(false);
            if (counters) counters.harmfulPushedBuff++;
          }
        }
      }

      // Bất biến 5: Buff CÓ LỢI mới KHÔNG BAO GIỜ làm mất một trạng thái có hại
      if (def && !def.harmful) {
        const harmfulBefore = prunedBefore.list.filter((s) => statusOf(s.id)?.harmful);
        for (const h of harmfulBefore) {
          const stillThere = after.list.some((s) => s.id === h.id);
          expect(
            stillThere,
            `${where}: buff có lợi ${def.id} đã làm mất trạng thái có hại ${h.id}`,
          ).toBe(true);
        }
        if (
          ms > 0 &&
          prunedBefore.list.length >= MAX_STATUSES &&
          earliestBuff(prunedBefore, true) < 0
        ) {
          expect(res, `${where}: buff mới phải bị từ chối khi chỉ toàn trạng thái có hại`).toBe(
            "full",
          );
          if (counters) counters.beneficialDeniedByHarmful++;
        }
      }

      // Bất biến 6: dao_ho không bị đẩy khi còn buff có lợi khác
      const hasDaoHo = prunedBefore.list.some((s) => s.id === "dao_ho");
      const hasOtherBuff = prunedBefore.list.some(
        (s) => !statusOf(s.id)?.harmful && s.id !== "dao_ho",
      );
      if (hasDaoHo && hasOtherBuff) {
        // Đặc biệt: khi trạng thái mới là CÓ HẠI, luật chính sách (a) bảo đảm dao_ho không bao giờ bị đẩy
        if (def?.harmful) {
          const daoHoAfter = after.list.some((s) => s.id === "dao_ho");
          expect(daoHoAfter, `${where}: dao_ho bị có hại đẩy dù còn buff có lợi khác`).toBe(true);
          if (counters) counters.daoHoProtected++;
        } else if (def && !def.harmful && ms < 900_000) {
          // Khi buff có lợi mới có thời hạn ngắn hơn dao_ho, dao_ho cũng không bị đẩy
          const daoHoAfter = after.list.some((s) => s.id === "dao_ho");
          expect(daoHoAfter, `${where}: dao_ho bị buff ngắn hơn đẩy ra`).toBe(true);
          if (counters) counters.daoHoProtected++;
        }
      }

      // Bất biến 7: Khống chế (choáng, vỡ giáp) chỉ mất khi hết hạn, không bị trạng thái khác đẩy ra
      const controlBefore = prunedBefore.list.filter((s) => isControl(s.id));
      for (const c of controlBefore) {
        const stillThere = after.list.some((s) => s.id === c.id);
        expect(stillThere, `${where}: khống chế ${c.id} bị trạng thái mới đẩy ra`).toBe(true);
        if (counters) counters.controlPreserved++;
      }
    } else if (actionRoll < 0.85) {
      // 15%: Thời gian trôi (pruneStatuses)
      const dt = chance(0.7) ? Math.floor(rand() * 5000) + 500 : chance(0.5) ? 20_000 : 950_000;
      now += dt;
      pruneStatuses(box, now);

      // Bất biến sau prune: mọi mục còn lại đều có until > now
      for (const s of box.list) {
        expect(
          s.until,
          `hạt ${seed} bước ${step} sau prune dt=${dt}: còn mục hết hạn`,
        ).toBeGreaterThan(now);
      }
    } else if (actionRoll < 0.93) {
      // 8%: Vào khu an toàn thanh tẩy DoT (stripDots)
      stripDots(box);
      if (counters) counters.stripDotsCalled++;

      for (const s of box.list) {
        expect(
          statusOf(s.id)?.kind,
          `hạt ${seed} bước ${step} sau stripDots: còn DoT ${s.id}`,
        ).not.toBe("dot");
      }
    } else {
      // 7%: Đột phá tiêu hao đan hộ đạo (takeStatus)
      const had = box.list.some((s) => s.id === "dao_ho" && s.until > now);
      const taken = takeStatus(box, "dao_ho", now);
      if (counters) counters.takeStatusCalled++;

      if (had) {
        expect(
          taken,
          `hạt ${seed} bước ${step}: có dao_ho còn hạn nhưng takeStatus trả undefined`,
        ).toBeDefined();
        expect(taken?.id).toBe("dao_ho");
      } else {
        expect(taken).toBeUndefined();
      }
      expect(
        box.list.some((s) => s.id === "dao_ho"),
        `hạt ${seed} bước ${step}: dao_ho chưa bị gỡ`,
      ).toBe(false);
    }
  }
}

const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);
const STEPS_PER_SEED = 1200;

describe("status-rules: fuzz kiểm tra chính sách (a) và trần MAX_STATUSES (#514, issue #770)", () => {
  it.each(SEEDS)(
    "hạt %i: chuỗi ngẫu nhiên 1200 thao tác gắn / gỡ / trôi giờ giữ vững bất biến",
    (seed) => {
      runStatusFuzz(seed, STEPS_PER_SEED);
    },
  );

  it("bộ fuzz thực sự kích hoạt toàn bộ các nhánh chính sách (a) (đầy đủ ca có hại đẩy buff, có lợi bị từ chối, dao_ho bảo vệ, khống chế giữ nguyên)", () => {
    const counters: FuzzCounters = {
      added: 0,
      refreshed: 0,
      full: 0,
      resisted: 0,
      ignored: 0,
      harmfulPushedBuff: 0,
      beneficialDeniedByHarmful: 0,
      daoHoProtected: 0,
      controlPreserved: 0,
      stripDotsCalled: 0,
      takeStatusCalled: 0,
    };

    for (const seed of SEEDS.slice(0, 8)) {
      runStatusFuzz(seed, STEPS_PER_SEED, counters);
    }

    // Xác nhận mọi nhánh kết quả addStatus đều được thử
    expect(counters.added, "nhánh added chưa lần nào chạy").toBeGreaterThan(0);
    expect(counters.refreshed, "nhánh refreshed chưa lần nào chạy").toBeGreaterThan(0);
    expect(counters.full, "nhánh full chưa lần nào chạy").toBeGreaterThan(0);
    expect(counters.resisted, "nhánh resisted chưa lần nào chạy").toBeGreaterThan(0);
    expect(counters.ignored, "nhánh ignored chưa lần nào chạy").toBeGreaterThan(0);

    // Xác nhận các tính chất cốt lõi của chính sách (a) đều được kiểm thử thật sự
    expect(
      counters.harmfulPushedBuff,
      "chưa lần nào có hại đẩy buff có lợi khi đủ ô",
    ).toBeGreaterThan(0);
    expect(
      counters.beneficialDeniedByHarmful,
      "chưa lần nào buff bị từ chối vì không được đẩy debuff",
    ).toBeGreaterThan(0);
    expect(
      counters.daoHoProtected,
      "chưa lần nào dao_ho được bảo vệ khi còn buff khác",
    ).toBeGreaterThan(0);
    expect(
      counters.controlPreserved,
      "chưa lần nào kiểm chứng khống chế không bị đẩy",
    ).toBeGreaterThan(0);
    expect(counters.stripDotsCalled, "chưa lần nào gọi stripDots").toBeGreaterThan(0);
    expect(counters.takeStatusCalled, "chưa lần nào gọi takeStatus").toBeGreaterThan(0);
  });
});
