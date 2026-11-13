import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COIN_CAP, CURRENCY_NAME, KIM_DAN_RECIPES, RECIPES } from "@tien-gioi/shared";
import { canAffordFee, feeChipText, recipeFee } from "./forge-fee";

describe("recipeFee (khớp luật craftFee của server)", () => {
  it("số nguyên dương là có phí; vượt trần bị kẹp ở COIN_CAP", () => {
    expect(recipeFee(1)).toBe(1);
    expect(recipeFee(3000)).toBe(3000);
    expect(recipeFee(COIN_CAP)).toBe(COIN_CAP);
    expect(recipeFee(COIN_CAP * 4)).toBe(COIN_CAP);
  });

  it("thiếu, 0, âm, lẻ, NaN, vô hạn, sai kiểu: MIỄN PHÍ (0), không ném lỗi", () => {
    for (const bad of [undefined, null, 0, -5, 2.5, Number.NaN, Infinity, -Infinity, "500", {}, []])
      expect(recipeFee(bad), String(bad)).toBe(0);
  });

  it("dữ liệu thật: 9 công thức Kim Đan đều có phí nguyên dương <= COIN_CAP; công thức cũ miễn phí", () => {
    for (const r of KIM_DAN_RECIPES) {
      expect(recipeFee(r.coin), r.id).toBe(r.coin);
      expect(recipeFee(r.coin), r.id).toBeGreaterThan(0);
      expect(recipeFee(r.coin), r.id).toBeLessThanOrEqual(COIN_CAP);
    }
    const old = RECIPES.filter((r) => !KIM_DAN_RECIPES.includes(r));
    expect(old.length).toBeGreaterThanOrEqual(9);
    for (const r of old) expect(recipeFee(r.coin), r.id).toBe(0);
  });
});

describe("canAffordFee (biên có == cần)", () => {
  it("có == cần là ĐỦ; thiếu 1 là THIẾU; thừa 1 là đủ", () => {
    expect(canAffordFee(3000, 3000)).toBe(true);
    expect(canAffordFee(3000, 2999)).toBe(false);
    expect(canAffordFee(3000, 3001)).toBe(true);
    expect(canAffordFee(COIN_CAP, COIN_CAP)).toBe(true);
    expect(canAffordFee(1, 0)).toBe(false);
  });

  it("phí 0 (miễn phí) luôn đủ, kể cả ví trống hoặc hỏng", () => {
    expect(canAffordFee(0, 0)).toBe(true);
    expect(canAffordFee(0, Number.NaN)).toBe(true);
    expect(canAffordFee(0, -5)).toBe(true);
  });

  it("số dư hỏng (NaN, vô hạn, âm, sai kiểu) với phí dương: KHÔNG đủ, không ném lỗi", () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, -1, undefined, null, "9999", {}])
      expect(canAffordFee(500, bad as unknown as number), String(bad)).toBe(false);
  });

  it("khớp luật server trên dữ liệu thật: mỗi công thức Kim Đan, ví == phí rèn được, ví == phí - 1 thì không", () => {
    for (const r of KIM_DAN_RECIPES) {
      const fee = recipeFee(r.coin);
      expect(canAffordFee(fee, fee), r.id).toBe(true);
      expect(canAffordFee(fee, fee - 1), r.id).toBe(false);
    }
  });
});

describe("feeChipText", () => {
  it("'Linh thạch có/cần' với dấu chấm nghìn kiểu Việt, cùng kiểu chip nguyên liệu", () => {
    expect(feeChipText(3000, 700)).toBe(`${CURRENCY_NAME} 700/3.000`);
    expect(feeChipText(20000, 1234567)).toBe(`${CURRENCY_NAME} 1.234.567/20.000`);
  });

  it("số dư hỏng (âm, NaN, lẻ) hiện an toàn, không ra 'NaN'", () => {
    expect(feeChipText(500, -3)).toBe(`${CURRENCY_NAME} 0/500`);
    expect(feeChipText(500, Number.NaN)).toBe(`${CURRENCY_NAME} 0/500`);
    expect(feeChipText(500, 12.9)).toBe(`${CURRENCY_NAME} 12/500`);
  });
});

describe("ui.ts dùng phí rèn", () => {
  const ui = readFileSync(new URL("./ui.ts", import.meta.url), "utf-8");
  it("bảng Lò Rèn tính phí bằng recipeFee, tắt nút Rèn khi thiếu tiền và vẽ lại khi ví đổi", () => {
    expect(ui).toContain("recipeFee(rec.coin)");
    expect(ui).toContain("feeChipText(fee, currentCoin)");
    // phép so ví / phí đi qua hàm thuần đã test biên, KHÔNG so thẳng trong ui.ts
    expect(ui).toContain("canAffordFee(fee, currentCoin)");
    expect(ui).not.toMatch(/currentCoin\s*>=?\s*fee\b/);
    expect(ui).toMatch(/if \(!enoughCoin\) canCraft = false;/);
    // onWallet vẽ lại bảng rèn khi đang mở
    const wallet = ui.slice(ui.indexOf("onWallet(m: WalletMsg)"));
    expect(wallet.slice(0, 900)).toContain("if (forgeModalOpen) renderForgeModal();");
  });
});
