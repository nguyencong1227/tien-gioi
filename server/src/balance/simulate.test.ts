// Giữ đường cong tu luyện trong mục tiêu của #28. Sửa số liệu trong shared/ mà test này đỏ
// thì xem lại docs/CAN_BANG.md (chạy `npm run can-bang -w server`).
import { describe, expect, it } from "vitest";
import {
  MONSTERS,
  MONSTER_BY_ID,
  PARTY_MAX,
  expToNext,
  killExp,
  meditateExpPerSec,
} from "@tien-gioi/shared";
import { bestOption, huntRate, minutesToFinish, partyRatio, simulate } from "./simulate";

describe("đường cong tu luyện", () => {
  const rows = simulate();

  it("hết Luyện Khí khoảng 1 giờ (50–70 phút)", () => {
    const m = minutesToFinish(rows, 1);
    expect(m).toBeGreaterThanOrEqual(50);
    expect(m).toBeLessThanOrEqual(70);
  });

  it("hết Trúc Cơ khoảng 3 giờ (2 giờ 40 – 3 giờ 20)", () => {
    const m = minutesToFinish(rows, 2);
    expect(m).toBeGreaterThanOrEqual(160);
    expect(m).toBeLessThanOrEqual(200);
  });

  it("không bậc Luyện Khí nào quá nhanh hoặc quá lâu (2–10 phút)", () => {
    for (const r of rows.filter((x) => x.realm === 1)) {
      expect(r.minutes, r.label).toBeGreaterThanOrEqual(2);
      expect(r.minutes, r.label).toBeLessThanOrEqual(10);
    }
  });

  it("săn quái luôn nhanh hơn chỉ ngồi đả tọa", () => {
    for (const r of rows) expect(r.source, r.label).not.toBe("đả tọa");
  });

  it("quái mạnh hơn được ưa chuộng khi đủ sức: Hôi Lang từ Luyện Khí, Hắc Hổ khi đủ an toàn", () => {
    expect(bestOption(1, 0).source).toBe("lang");
    const firstSafeHo = rows.find((r) => huntRate(MONSTER_BY_ID.ho, r.realm, r.tier));
    expect(firstSafeHo && bestOption(firstSafeHo.realm, firstSafeHo.tier).source).toBe("ho");
  });
});

describe("tu vi khi hạ quái", () => {
  it("quái không quá thấp so với người chơi thì đủ tu vi; thấp hơn nhiều thì giảm, tối thiểu 25%", () => {
    const lang = MONSTER_BY_ID.lang; // cấp 1
    expect(killExp(lang, 1, 0)).toBe(lang.exp);
    expect(killExp(lang, 1, 4)).toBe(lang.exp); // cao hơn 4 bậc: chưa giảm
    expect(killExp(lang, 1, 5)).toBe(Math.round(lang.exp * 0.85));
    expect(killExp(lang, 5, 0)).toBe(Math.round(lang.exp * 0.25));
  });

  it("đả tọa: mỗi cảnh giới tốn nhiều thời gian hơn cho một thanh tu vi", () => {
    const secPerBar = (realm: number) => expToNext(realm, 0) / meditateExpPerSec(realm, 0);
    expect(secPerBar(1)).toBeGreaterThan(secPerBar(0));
    expect(secPerBar(2)).toBeGreaterThan(secPerBar(1));
    expect(secPerBar(3)).toBeGreaterThan(secPerBar(2));
  });
});

describe("đi theo đội (mô hình, #74)", () => {
  const rows = simulate();

  it("đội 1 người cho đúng kết quả đánh một mình ở mọi bậc", () => {
    for (const r of rows) {
      expect(partyRatio(r.realm, r.tier, 1).ratio, r.label).toBe(1);
      for (const m of MONSTERS) {
        expect(huntRate(m, r.realm, r.tier, 1)?.rate, `${r.label} ${m.id}`).toBe(
          huntRate(m, r.realm, r.tier)?.rate,
        );
      }
    }
  });

  it("đội đông thì quái nào một người đánh được, cả đội cũng đánh được (mỗi người chịu ít sát thương hơn)", () => {
    for (const r of rows) {
      for (const m of MONSTERS) {
        if (!huntRate(m, r.realm, r.tier)) continue;
        for (let n = 2; n <= PARTY_MAX; n++) {
          expect(huntRate(m, r.realm, r.tier, n), `${r.label} ${m.id} đội ${n}`).not.toBeNull();
        }
      }
    }
  });

  it("đội đánh được quái mà một người chưa dám (có ít nhất một bậc đội chọn quái khác người lẻ)", () => {
    const differ = rows.filter((r) => {
      const p = partyRatio(r.realm, r.tier, PARTY_MAX);
      return p.party !== p.solo;
    });
    expect(differ.length).toBeGreaterThan(0);
  });
});
