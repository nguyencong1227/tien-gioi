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
 * Chia `total` Linh thạch (số nguyên dương) cho những người trong `weights` theo tỉ lệ trọng số, tổng chia ra
 * đúng bằng `total` (phương pháp phần dư lớn nhất: không làm tròn mất tiền, không sinh thêm). Trọng số không
 * dương / không hữu hạn bị bỏ qua. Phần dư chia cho người có phần lẻ lớn nhất, bằng nhau thì ngẫu nhiên
 * (`rng` truyền vào để test), để một người không luôn được phần lẻ. Không có ai đủ điều kiện thì trả Map rỗng.
 */
export function splitCoin(
  total: number,
  weights: ReadonlyMap<string, number>,
  rng: () => number = Math.random,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!Number.isInteger(total) || total <= 0) return out;
  const eligible = [...weights].filter(([, wt]) => Number.isFinite(wt) && wt > 0);
  const sum = eligible.reduce((s, [, wt]) => s + wt, 0);
  if (eligible.length === 0 || !(sum > 0)) return out;
  const parts = eligible.map(([sid, wt]) => {
    const exact = (total * wt) / sum;
    return { sid, base: Math.floor(exact), rem: exact - Math.floor(exact), tie: rng() };
  });
  let left = total - parts.reduce((s, x) => s + x.base, 0);
  parts.sort((a, b) => b.rem - a.rem || a.tie - b.tie);
  for (const x of parts) {
    const extra = left > 0 ? 1 : 0;
    left -= extra;
    if (x.base + extra > 0) out.set(x.sid, x.base + extra);
  }
  return out;
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
