// Sổ chống ĐỔI THẮNG PK (M9, docs/PHAN_CONG_M9.md mục 3): một CẶP có thứ tự (người thắng, người thua) chỉ được tính tối đa `BOARD_PK_PAIR_DAY_CAP` trận thắng mỗi ngày (`dayKey`, UTC+7)
// vào thống kê PK của linh hồn (`Soul.social.pk`, bảng `pk`). Trận vượt hạn mức KHÔNG tính cho cả hai bên (người thua cũng không bị ghi thua: họ tự chọn đưa điểm, không để bảng bị bơm hai chiều).
// Sổ nằm trong BỘ NHỚ của `Hub` (cả tiến trình, mọi phòng): khởi động lại thì sổ rỗng (kẻ đổi thắng cày thêm được tối đa một hạn mức sau mỗi lần khởi động: chấp nhận, rẻ hơn lưu bền);
// bộ nhớ chặn trên `PK_LEDGER_MAX` cặp mỗi ngày (quá thì dọn sạch: thà nới tạm còn hơn phình), và chỉ giữ NGÀY HIỆN TẠI.
import { BOARD_PK_PAIR_DAY_CAP } from "@tien-gioi/shared";

/** Số cặp tối đa trong sổ của một ngày. */
export const PK_LEDGER_MAX = 20_000;

export class PkLedger {
  private day = "";
  private readonly counts = new Map<string, number>();

  /**
   * Thử tính MỘT trận thắng của linh hồn `winner` trước linh hồn `loser` vào ngày `day`. `true` = còn trong hạn mức (đã ghi vào sổ); `false` = vượt hạn mức hoặc trận không hợp lệ
   * (cùng một linh hồn, khoá rỗng) và KHÔNG ghi gì.
   */
  tryCount(winner: string, loser: string, day: string): boolean {
    if (winner === "" || loser === "" || winner === loser) return false;
    if (day !== this.day) {
      this.day = day;
      this.counts.clear();
    }
    const key = `${winner}\u0000${loser}`;
    const n = this.counts.get(key) ?? 0;
    if (n >= BOARD_PK_PAIR_DAY_CAP) return false;
    if (n === 0 && this.counts.size >= PK_LEDGER_MAX) this.counts.clear();
    this.counts.set(key, n + 1);
    return true;
  }

  /** Số cặp đang ghi (để test / `/metrics`). */
  get size(): number {
    return this.counts.size;
  }
}
