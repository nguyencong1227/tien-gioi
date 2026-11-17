// QUYET_DINH_M3 mục 30 (16/11, giữ nguyên ở mục 54 17/11): quái Âm Sương Trạch + Hàn Vân Lĩnh (kể cả hai trùm) có KHÍ HUYẾT x1,5 và TU VI x2 so với số gốc v0.3.0. Bảng số nhập THẲNG (không tính từ
// số cũ) để đột biến một chữ số bất kỳ làm test đỏ; chỉ `hp` và `exp` đổi (sát thương, tốc độ, tầm, Linh thạch rơi, đồ rơi KHÔNG đổi: đã có test riêng ở `currency.test.ts` / `drops`).
import { describe, expect, it } from "vitest";
import { MONSTER_BY_ID } from "./game";

/** id -> [hp gốc, hp mới, exp gốc, exp mới] */
const MUC30: Record<string, [number, number, number, number]> = {
  suong_ho: [1600, 2400, 110, 220],
  thach_quy: [6500, 9750, 215, 430],
  doc_thiem: [2600, 3900, 230, 460],
  hac_giao: [50000, 75000, 3200, 6400],
  han_lang: [2900, 4350, 660, 1320],
  phong_nha: [2800, 4200, 760, 1520],
  cot_tuong: [11800, 17700, 1290, 2580],
  doc_tuoc: [4700, 7050, 1380, 2760],
  thien_han_vuong: [82000, 123000, 19200, 38400],
};

describe("cân bằng mục 30: quái Âm Sương / Hàn Vân máu x1,5, tu vi x2", () => {
  it("bảng số mới đúng như người dùng chốt (hp / exp gốc của loài)", () => {
    for (const [id, [, hp, , exp]] of Object.entries(MUC30)) {
      expect(MONSTER_BY_ID[id]!.hp, `${id} hp`).toBe(hp);
      expect(MONSTER_BY_ID[id]!.exp, `${id} exp`).toBe(exp);
    }
  });

  it("đúng hệ số: hp mới = 1,5 x gốc, exp mới = 2 x gốc (bảng gốc v0.3.0 nhập thẳng)", () => {
    for (const [id, [hp0, hp1, exp0, exp1]] of Object.entries(MUC30)) {
      expect(hp1, `${id} hp`).toBe(hp0 * 1.5);
      expect(exp1, `${id} exp`).toBe(exp0 * 2);
    }
  });

  it("hai trùm (Hắc Giao, Thiên Hàn Vương) vẫn là trùm; loài NGOÀI mục 30 (Lạc Hà, Hắc Phong, bí cảnh) giữ NGUYÊN số, không bị nhân nhầm", () => {
    expect(MONSTER_BY_ID.hac_giao!.boss).toBe(true);
    expect(MONSTER_BY_ID.thien_han_vuong!.boss).toBe(true);
    const outside: Record<string, [number, number]> = {
      tho: [40, 4],
      lang: [140, 10],
      ho: [600, 35],
      mang: [4000, 900],
      yeu_vuong: [100000, 4500],
    };
    for (const [id, [hp, exp]] of Object.entries(outside)) {
      expect(id in MUC30, id).toBe(false);
      expect(MONSTER_BY_ID[id]!.hp, `${id} hp`).toBe(hp);
      expect(MONSTER_BY_ID[id]!.exp, `${id} exp`).toBe(exp);
    }
  });
});
