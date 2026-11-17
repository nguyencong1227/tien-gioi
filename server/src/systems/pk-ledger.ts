// Sổ chống ĐỔI THẮNG / CÀY PK (M9, docs/PHAN_CONG_M9.md mục 3 và 7). Hai hạn mức mỗi ngày (`dayKey`, UTC+7), CẢ HAI phải còn thì trận mới được tính vào thống kê PK của linh hồn (`Soul.social.pk`, bảng `pk`):
//  1. CẶP KHÔNG THỨ TỰ: một cặp linh hồn chỉ tính tối đa `BOARD_PK_PAIR_DAY_CAP` trận (tổng, bất kể ai thắng): hai người thay phiên thắng nhau không nhân đôi hạn mức (review của B ở #1038);
//  2. MỖI LINH HỒN THẮNG: tối đa `PK_DAY_WIN_CAP` trận thắng được tính mỗi ngày (mọi đối thủ cộng lại): một tài khoản chính x nhiều tài khoản phụ không cày vô hạn (mỗi phụ chỉ 3 thắng / ngày nhưng tổng bị trần).
// Trận vượt hạn mức KHÔNG tính cho cả hai bên (người thua cũng không bị ghi thua: tránh bơm điểm hai chiều). Chỉ tính trận phân thắng thua bằng hạ gục (`ko`): đầu hàng / bỏ chạy không tính
// (một tài khoản phụ đầu hàng ngay giây đầu sẽ cho thắng miễn phí): xem `systems/social.ts`.
// Sổ nằm trong BỘ NHỚ của `Hub` (cả tiến trình, mọi phòng): khởi động lại thì sổ rỗng (kẻ cày thêm được tối đa một hạn mức sau mỗi lần khởi động: chấp nhận, rẻ hơn lưu bền);
// chặn trên `PK_LEDGER_MAX` mục mỗi ngày (quá thì dọn sạch: thà nới tạm còn hơn phình), chỉ giữ NGÀY HIỆN TẠI.
import { BOARD_PK_PAIR_DAY_CAP } from "@tien-gioi/shared";

/** Số trận thắng tối đa của MỘT linh hồn được tính mỗi ngày (mọi đối thủ cộng lại). Đề xuất của A, chỉnh theo số liệu thật. */
export const PK_DAY_WIN_CAP = 10;
/** Số mục tối đa trong sổ của một ngày (cặp + người thắng). */
export const PK_LEDGER_MAX = 20_000;

export class PkLedger {
  private day = "";
  private readonly pairs = new Map<string, number>();
  private readonly wins = new Map<string, number>();

  /**
   * Thử tính MỘT trận thắng của linh hồn `winner` trước linh hồn `loser` vào ngày `day`. `true` = còn trong CẢ HAI hạn mức (đã ghi vào sổ); `false` = vượt một hạn mức hoặc trận không hợp lệ
   * (cùng một linh hồn, khoá rỗng) và KHÔNG ghi gì.
   */
  tryCount(winner: string, loser: string, day: string): boolean {
    if (winner === "" || loser === "" || winner === loser) return false;
    if (day !== this.day) {
      this.day = day;
      this.pairs.clear();
      this.wins.clear();
    }
    const pairKey = winner < loser ? `${winner}\u0000${loser}` : `${loser}\u0000${winner}`;
    const pairN = this.pairs.get(pairKey) ?? 0;
    const winN = this.wins.get(winner) ?? 0;
    if (pairN >= BOARD_PK_PAIR_DAY_CAP || winN >= PK_DAY_WIN_CAP) return false;
    if (this.pairs.size + this.wins.size >= PK_LEDGER_MAX) {
      this.pairs.clear();
      this.wins.clear();
    }
    this.pairs.set(pairKey, (this.pairs.get(pairKey) ?? 0) + 1);
    this.wins.set(winner, (this.wins.get(winner) ?? 0) + 1);
    return true;
  }

  /** Số mục đang ghi (để test / `/metrics`). */
  get size(): number {
    return this.pairs.size + this.wins.size;
  }
}
