// Kiểm ĐỘNG trên DỮ LIỆU THẬT: bot né hoàn hảo (`boss-dodge-bot.ts`, lời hứa phản xạ 400 ms + 150 px/giây) KHÔNG BAO GIỜ bị trúng bộ chiêu của MỌI trùm trong `BOSSES`
// (từng giai đoạn, nhiều seed), còn bot đứng yên ở chỗ xấu nhất thì bị trúng (đối chứng). Đây là cổng chặn cho PR dữ liệu trùm của E (#872) và mọi lần đổi `BOSSES`:
// `bossViolations` kiểm TĨNH, bài này chạy bộ thực thi thật. Dữ liệu thêm trùm / chiêu mới tự được phủ, không cần sửa test.
// Nếu đỏ: in `kind`, giai đoạn, seed và chiêu làm bot trúng; sửa DỮ LIỆU (tăng báo trước / giảm vùng) hoặc mở issue `dev-a` nếu nghi bộ thực thi.
import { describe, expect, it } from "vitest";
import { BOSSES, bossViolations } from "@tien-gioi/shared";
import { runDodgeBot } from "./boss-dodge-bot";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const SIM_MS = 40_000;

describe("bot né hoàn hảo trên dữ liệu trùm THẬT (BOSSES)", () => {
  it("dữ liệu hiện có qua `bossViolations` (tiền đề của bài kiểm động)", () => {
    expect(bossViolations()).toEqual([]);
  });

  for (const def of BOSSES) {
    for (let ph = 0; ph < def.phases.length; ph++) {
      it(`${def.kind} giai đoạn ${ph} (${def.phases[ph]!.id}): bot né KHÔNG bao giờ trúng (${SEEDS.length} seed x ${SIM_MS / 1000} giây)`, () => {
        let casts = 0;
        const seen: Record<string, number> = {};
        const fails: string[] = [];
        for (const seed of SEEDS) {
          const r = runDodgeBot(seed, def, "dodge", SIM_MS, { phase: ph, roam: true });
          casts += r.casts;
          for (const [id, n] of Object.entries(r.byAbility)) seen[id] = (seen[id] ?? 0) + n;
          if (r.hurt.length > 0)
            fails.push(
              `${def.kind} gđ ${ph} seed ${seed}: bot né bị trúng ${r.hurt.length} lần, đầu tiên ở chiêu ${r.hurt[0]!.ability} lúc +${r.hurt[0]!.at - 10_000} ms`,
            );
        }
        expect(fails, fails.join("\n")).toEqual([]);
        // MỌI chiêu sát thương của giai đoạn phải thật sự được vận và kiểm (`cond` không được khiến chiêu nào không bao giờ chạm tới)
        for (const id of def.phases[ph]!.abilities) {
          const a = def.abilities.find((q) => q.id === id)!;
          if (a.shape.t === "summon" || a.shape.t === "buff") continue;
          expect(
            seen[id] ?? 0,
            `${def.kind} gđ ${ph}: chiêu ${id} không được kiểm lần nào`,
          ).toBeGreaterThan(0);
        }
        // chiêu của giai đoạn này chỉ có summon / buff thì không có đòn nào để né: không đòi số đòn
        const dmg = def.phases[ph]!.abilities.some((id) => {
          const a = def.abilities.find((q) => q.id === id)!;
          return a.shape.t !== "summon" && a.shape.t !== "buff";
        });
        if (dmg)
          expect(casts, "giai đoạn có chiêu sát thương mà không đòn nào được kiểm").toBeGreaterThan(
            0,
          );
      });

      it(`${def.kind} giai đoạn ${ph}: đối chứng, bot đứng yên bị trúng (bài kiểm có răng)`, () => {
        const dmg = def.phases[ph]!.abilities.some((id) => {
          const a = def.abilities.find((q) => q.id === id)!;
          return a.shape.t !== "summon" && a.shape.t !== "buff";
        });
        if (!dmg) return;
        let casts = 0;
        let hits = 0;
        for (const seed of SEEDS.slice(0, 3)) {
          const r = runDodgeBot(seed, def, "stand", 20_000, { phase: ph, roam: true });
          casts += r.casts;
          hits += r.hitCasts;
        }
        expect(casts).toBeGreaterThan(0);
        expect(hits / casts, `trúng ${hits} / ${casts} đòn`).toBeGreaterThanOrEqual(0.9);
      });
    }
  }
});
