// Tin "DỪNG" khi nhả phím di chuyển (QUYET_DINH_M3 mục 41: di chuyển "trôi" trên v0.3.1). Lớp THUẦN (không DOM / Phaser) nên test được.
//
// Vì sao cần: client chỉ gửi `input` lúc ĐANG đi. Khi mạng đứng rồi xả dồn, máy chủ còn một hàng input cũ và tiếp tục đẩy nhân vật đi sau khi người chơi đã nhả phím.
// Nên khi hết ý định đi (nhả phím / nhả cần điều khiển / bị choáng / mở bảng chặn phím) sau khi ĐÃ gửi input di chuyển, client gửi NGAY một input dừng
// `{ seq, dx: 0, dy: 0 }` (kiểm mỗi KHUNG VẼ, không chờ nhịp 20 Hz của `fixedStep`), rồi LẶP thêm ở các bước kế tiếp cho chắc (người dùng yêu cầu, mục 41.2).
// Máy chủ cũ coi dx = dy = 0 là một bước KHÔNG di chuyển và vẫn cập nhật `lastSeq`, nên tương thích; máy chủ mới dùng nó để xoá hàng input còn tồn.

/** Số tin dừng gửi cho mỗi lần dừng: 1 tin ngay lúc nhả + (STOP_REPEATS - 1) tin lặp ở các bước 50 ms kế tiếp. */
export const STOP_REPEATS = 3;

export class StopBurst {
  /** Đã gửi input di chuyển mà chưa gửi tin dừng nào sau đó */
  private owed = false;
  /** Số tin dừng lặp còn phải gửi ở các bước kế tiếp */
  private left = 0;

  constructor(private readonly repeats: number = STOP_REPEATS) {}

  /** Vừa gửi một input di chuyển thật (dx, dy khác 0): từ giờ nhả phím là phải gửi tin dừng. Cũng huỷ các tin lặp còn dở (người chơi đi lại). */
  moved(): void {
    this.owed = true;
    this.left = 0;
  }

  /**
   * Gọi MỖI KHUNG VẼ với `active` = đang có ý đi VÀ đi được. Trả số tin dừng phải gửi NGAY (0 hoặc 1): đúng một lần ở khung đầu tiên sau lúc hết ý định đi,
   * và chỉ khi trước đó đã gửi input di chuyển (bấm quá ngắn, chưa tới bước nào thì chưa có gì để dừng).
   */
  frame(active: boolean): number {
    if (active) {
      this.left = 0;
      return 0;
    }
    if (!this.owed) return 0;
    this.owed = false;
    this.left = Math.max(0, this.repeats - 1);
    return 1;
  }

  /** Gọi mỗi bước 50 ms (`fixedStep`) KHI KHÔNG ĐI. Trả số tin dừng lặp phải gửi bước này (0 hoặc 1). Đi lại thì huỷ phần lặp. */
  tick(active: boolean): number {
    if (active) {
      this.left = 0;
      return 0;
    }
    if (this.left <= 0) return 0;
    this.left--;
    return 1;
  }

  /** Không gửi được nữa (đang nối lại, ở Hoàng Tuyền, đã gục, đổi phòng): bỏ mọi tin dừng còn nợ. */
  reset(): void {
    this.owed = false;
    this.left = 0;
  }
}
