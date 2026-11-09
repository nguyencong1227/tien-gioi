// Ví Linh thạch: mọi thay đổi số dư đều đi qua đây (kẹp 0..COIN_CAP, luôn số nguyên) rồi báo cho chủ bằng `wallet`.
// Số dư nằm trong `PlayerCtrl.coin`, không vào state chung; chỉ chủ nhận `WalletMsg` (hợp đồng: shared/src/currency.ts).
import { addCoin } from "@tien-gioi/shared";
import type { World } from "../world";

/** Gửi số dư hiện tại cho chủ (vào phòng, đồng bộ lại). `gained` là phần vừa đổi (có thể âm), bỏ trống khi chỉ đồng bộ. */
export function sendWallet(w: World, sid: string, gained?: number): void {
  const c = w.ctrl.get(sid);
  if (!c) return;
  w.events.wallet(sid, gained ? { coin: c.coin, gained } : { coin: c.coin });
}

/**
 * Cộng (amount > 0) hoặc trừ (amount < 0) Linh thạch. Trả về phần thực sự đổi: có thể nhỏ hơn |amount| khi chạm
 * trần hoặc sàn 0, và 0 nếu không đổi gì (khi đó không gửi tin). Số không hữu hạn hoặc lẻ được `addCoin` xử lý.
 */
export function changeCoin(w: World, sid: string, amount: number): number {
  const c = w.ctrl.get(sid);
  if (!c) return 0;
  const next = addCoin(c.coin, amount);
  const delta = next - c.coin;
  if (delta === 0) return 0;
  c.coin = next;
  sendWallet(w, sid, delta);
  return delta;
}

/**
 * Trừ đúng `amount` Linh thạch hoặc không trừ gì: trả false nếu số tiền không hợp lệ (không nguyên dương) hoặc
 * không đủ. Dùng cho mua hàng, nơi "trọn vẹn hoặc không gì cả".
 */
export function trySpendCoin(w: World, sid: string, amount: number): boolean {
  const c = w.ctrl.get(sid);
  if (!c || !Number.isInteger(amount) || amount <= 0 || c.coin < amount) return false;
  changeCoin(w, sid, -amount);
  return true;
}
