// Phí Linh thạch của công thức rèn (`RecipeDef.coin`, M6) cho bảng Lò Rèn. Phải khớp luật của server (`craftFee` ở
// server/src/systems/npc.ts): số nguyên dương trong 1..COIN_CAP là có phí, còn lại (thiếu, âm, lẻ, NaN, vô hạn) là MIỄN PHÍ, để
// nút "Rèn" không bao giờ sáng khi server sẽ từ chối (và ngược lại).
import { COIN_CAP, CURRENCY_NAME } from "@tien-gioi/shared";

/** Phí rèn thực tế của một công thức (0 = miễn phí). */
export function recipeFee(coin: unknown): number {
  return typeof coin === "number" && Number.isInteger(coin) && coin > 0
    ? Math.min(coin, COIN_CAP)
    : 0;
}

const fmt = (n: number) =>
  Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)).toLocaleString("vi-VN");

/** Chữ trên chip phí, cùng kiểu "có / cần" như chip nguyên liệu: "Linh thạch 700/3.000". */
export function feeChipText(fee: number, have: number): string {
  return `${CURRENCY_NAME} ${fmt(have)}/${fmt(fee)}`;
}
