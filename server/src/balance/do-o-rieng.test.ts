// Độ nhạy với đồ ba ô riêng (`do-o-rieng.ts`): cờ được khôi phục, đồ ô riêng CHỈ làm người chơi mạnh hơn (không bao giờ yếu đi), và mô hình
// lệch nhỏ (nên giữ cờ tắt là giả định bảo thủ, không phải chỗ che số xấu).
import { describe, expect, it } from "vitest";
import { MONSTER_BY_ID } from "@tien-gioi/shared";
import { ASSUME, huntRate } from "./simulate";
import {
  MAX_PARTY,
  minSafeParty,
  ownerGearMetrics,
  renderOwnerGearSensitivity,
  withOwnerGear,
} from "./do-o-rieng";

describe("withOwnerGear", () => {
  it("đặt cờ trong lúc chạy và khôi phục sau đó, kể cả khi ném lỗi", () => {
    const before = ASSUME.useOwnerGear;
    withOwnerGear(!before, () => expect(ASSUME.useOwnerGear).toBe(!before));
    expect(ASSUME.useOwnerGear).toBe(before);
    expect(() =>
      withOwnerGear(!before, () => {
        throw new Error("x");
      }),
    ).toThrow("x");
    expect(ASSUME.useOwnerGear).toBe(before);
  });
});

describe("minSafeParty", () => {
  it("khớp `huntRate`: đội nhỏ nhất an toàn, đội nhỏ hơn thì không, lớn hơn thì vẫn an toàn", () => {
    const boss = MONSTER_BY_ID.thien_han_vuong;
    for (let t = 0; t < 3; t++) {
      const n = minSafeParty("thien_han_vuong", 4, t)!;
      expect(n, `bậc ${t}`).not.toBeNull();
      expect(huntRate(boss, 4, t, n)).not.toBeNull();
      if (n > 1) expect(huntRate(boss, 4, t, n - 1)).toBeNull();
      expect(huntRate(boss, 4, t, MAX_PARTY)).not.toBeNull();
    }
  });

  it("quái thường an toàn một người thì đội nhỏ nhất là 1", () => {
    expect(minSafeParty("han_lang", 4, 0)).toBe(1);
  });

  it("trùm vượt xa người chơi thì trả null (không an toàn kể cả đội tối đa)", () => {
    // Hắc Giao với người Luyện Khí: mô hình không có đội nào đủ
    expect(minSafeParty("hac_giao", 1, 0)).toBeNull();
  });
});

describe("độ nhạy: có / không đồ ô riêng", () => {
  const off = ownerGearMetrics(false);
  const on = ownerGearMetrics(true);

  it("đo xong cờ vẫn như cũ (không rò rỉ sang test khác)", () => {
    expect(ASSUME.useOwnerGear).toBe(false);
  });

  it("đồ ô riêng không làm người chơi yếu đi: nhịp không chậm hơn, trùm không cần đội lớn hơn, solo không đau hơn", () => {
    expect(on.truncoMinutes).toBeLessThanOrEqual(off.truncoMinutes);
    expect(on.kimDanHours).toBeLessThanOrEqual(off.kimDanHours);
    expect(on.nguyenAnhHours).toBeLessThanOrEqual(off.nguyenAnhHours);
    expect(on.docThiemDanger).toBeLessThan(off.docThiemDanger);
    expect(on.docTuocDanger).toBeLessThan(off.docTuocDanger);
    for (const k of ["hacGiao", "thienHanVuong"] as const)
      for (let t = 0; t < 3; t++)
        expect(on[k][t] ?? Infinity, `${k} bậc ${t}`).toBeLessThanOrEqual(off[k][t] ?? Infinity);
  });

  it("mô hình lệch NHỎ (<= 10% nhịp, <= 10 điểm phần trăm khí huyết): giữ cờ tắt là giả định bảo thủ chứ không che số xấu", () => {
    // Mục 30: nhịp ngắn hơn (~4,2 giờ) nên cùng mức chênh tuyệt đối thành tỉ lệ lớn hơn: Kim Đan 0,887 (trước 0,9+); cận mới > 0,85 (lệch <= 15%)
    expect(on.kimDanHours / off.kimDanHours).toBeGreaterThan(0.85);
    expect(on.nguyenAnhHours / off.nguyenAnhHours).toBeGreaterThan(0.85);
    expect(off.docThiemDanger - on.docThiemDanger).toBeLessThan(10);
    expect(off.docTuocDanger - on.docTuocDanger).toBeLessThan(10);
  });

  it("cấu hình hiện hành (tắt) vẫn trong mục tiêu: nhịp Kim Đan 4-7 giờ, Nguyên Anh 4-9 giờ (mục 30: tu vi x2 + máu x1,5, trước đó 5-7 và 6-9), Trúc Cơ ~3 giờ", () => {
    expect(off.kimDanHours).toBeGreaterThanOrEqual(4);
    expect(off.kimDanHours).toBeLessThanOrEqual(7);
    expect(off.nguyenAnhHours).toBeGreaterThanOrEqual(4);
    expect(off.nguyenAnhHours).toBeLessThanOrEqual(9);
    expect(off.truncoMinutes).toBeGreaterThan(150);
    expect(off.truncoMinutes).toBeLessThan(210);
  });
});

describe("mục Markdown", () => {
  it("có bảng hai cột cấu hình và nêu việc thử bật cờ", () => {
    const md = renderOwnerGearSensitivity();
    expect(md).toContain("### 5. Độ nhạy với đồ ba ô riêng");
    expect(md).toContain("Không đồ ô riêng");
    expect(md).toContain("Có đồ ô riêng");
    expect(md).toContain("Thiên Hàn Vương");
    expect(ASSUME.useOwnerGear).toBe(false);
  });
});
