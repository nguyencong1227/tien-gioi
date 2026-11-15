// Mô hình tinh anh (`tinh-anh.ts`): hệ số khớp `systems/elite.ts`, tinh anh nguy hiểm hơn đúng cỡ, và mục Markdown nêu rủi ro.
import { describe, expect, it } from "vitest";
import { MONSTER_BY_ID } from "@tien-gioi/shared";
import { ELITE_ATK_MULT, ELITE_HP_MULT, canBeElite } from "../systems/elite";
import { ELITE_CASES, eliteRows, renderTinhAnh } from "./tinh-anh";

describe("mô hình tinh anh", () => {
  const rows = eliteRows();

  it("mọi loài trong bảng đúng là loài có thể sinh tinh anh (không trùm, không quái hiền)", () => {
    expect(rows).toHaveLength(ELITE_CASES.length);
    for (const c of ELITE_CASES) expect(canBeElite(MONSTER_BY_ID[c.id]), c.id).toBe(true);
  });

  it("thời gian hạ tinh anh = x ELITE_HP_MULT (cùng dps), khí huyết mất = x ELITE_HP_MULT x ELITE_ATK_MULT so với loài thường", () => {
    for (const r of rows) {
      // làm tròn máu / công của def nhân nên cho sai số nhỏ
      expect(r.eliteSec / r.normalSec, r.id).toBeCloseTo(ELITE_HP_MULT, 1);
      expect(r.eliteDanger / r.normalDanger, r.id).toBeCloseTo(ELITE_HP_MULT * ELITE_ATK_MULT, 0);
    }
  });

  it("tinh anh nguy hiểm gấp ~3-4x nhưng Luyện Khí / Trúc Cơ vẫn an toàn đứng yên; từ Kim Đan thì cần né / đan / đội (không phải tự sát)", () => {
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.lang.eliteDanger).toBeLessThan(0.5);
    expect(by.ho.eliteDanger).toBeLessThan(0.5);
    for (const id of [
      "suong_ho",
      "thach_quy",
      "doc_thiem",
      "han_lang",
      "phong_nha",
      "cot_tuong",
      "doc_tuoc",
    ])
      expect(by[id].eliteDanger, id).toBeGreaterThan(0.5);
    // nhưng loài thường cùng bậc vẫn trong ngưỡng an toàn của mô hình (<= 50 %): tinh anh là NGOẠI LỆ hiếm, không phải mặt bằng
    for (const r of rows) expect(r.normalDanger, r.id).toBeLessThanOrEqual(0.5);
  });

  it("mục Markdown nêu rủi ro mất kiếp và xin quyết định người dùng", () => {
    const md = renderTinhAnh();
    expect(md).toContain("## Tinh anh");
    expect(md).toContain("mini-trùm");
    expect(md).toContain("Hoàng Tuyền");
    for (const c of ELITE_CASES) expect(md).toContain(MONSTER_BY_ID[c.id].name);
  });
});
