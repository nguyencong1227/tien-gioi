// Cân bằng PK thách đấu (M3 bước 5c): số liệu trong shared/ (`PK_DAMAGE_MULT`...) phải đạt mục tiêu thiết kế
// (docs/THIET_KE_PK.md mục 6). Sửa số mà test này đỏ thì xem lại docs/CAN_BANG.md mục "PK" (`npm run can-bang -w server`).
import { describe, expect, it } from "vitest";
import { DUEL_MAX_MS } from "@tien-gioi/shared";
import { PK_TARGET_SECONDS, duelOnce, representativeLevels, summarizeDuels } from "./pk";

describe("trận thách đấu liên tục giữa hai người cùng bậc (mô phỏng bằng mã server thật)", () => {
  it(`mọi bậc đại diện: trận kéo dài ${PK_TARGET_SECONDS.min}-${PK_TARGET_SECONDS.max} giây (không quá nhanh, không kéo lê), kể cả ca nhanh nhất / chậm nhất`, () => {
    const levels = representativeLevels();
    expect(levels.length).toBeGreaterThan(10);
    for (const l of levels) {
      const s = summarizeDuels(l, l, 8);
      expect(s.min, `${l.label} nhanh nhất`).toBeGreaterThanOrEqual(PK_TARGET_SECONDS.min);
      expect(s.max, `${l.label} chậm nhất`).toBeLessThanOrEqual(PK_TARGET_SECONDS.max);
    }
  });

  it("hết trận luôn có người thắng trước `DUEL_MAX_MS` (không có cặp cùng bậc nào đánh mãi không phân thắng bại)", () => {
    for (const l of representativeLevels()) {
      const o = duelOnce(l, l, 3);
      expect(o.result, l.label).not.toBe("draw");
      expect(o.result, l.label).not.toBe("none");
      expect(o.seconds * 1000, l.label).toBeLessThan(DUEL_MAX_MS);
    }
  });

  it("chênh bậc: bên mạnh hơn thắng nhiều hơn và trận ngắn hơn; chênh càng lớn càng nhanh (không hiệu chỉnh: câu hỏi 4 ở questions.md)", () => {
    const base = { realm: 1, tier: 4 };
    const even = summarizeDuels(base, base, 10);
    const gap1 = summarizeDuels({ realm: 1, tier: 5 }, base, 10);
    const gap3 = summarizeDuels({ realm: 1, tier: 7 }, base, 10);
    expect(gap1.winRate).toBeGreaterThan(0.5);
    expect(gap3.winRate).toBeGreaterThanOrEqual(gap1.winRate);
    expect(gap1.median).toBeLessThan(even.median);
    expect(gap3.median).toBeLessThan(gap1.median);
  });

  it("kết quả cố định theo hạt giống; mô phỏng trả lại `Math.random` như cũ", () => {
    const random = Math.random;
    const l = { realm: 1, tier: 8 };
    expect(duelOnce(l, l, 7)).toEqual(duelOnce(l, l, 7));
    expect(Math.random).toBe(random);
  });
});
