// Gợi ý khi BỘ GÕ tiếng Việt chặn phím ở mức hệ thống (QUYET_DINH_M3 mục 25, điểm 3): Unikey / EVKey kiểu Telex đổi W -> ư, aa -> â, dd -> đ, nguyên âm + s -> dấu sắc bằng
// cách chèn Backspace + ký tự Unicode; trình duyệt có thể KHÔNG nhận được keydown / keyup của W A S D (`event.code` cũng không cứu được). Lớp THUẦN, test được.
// Phím di chuyển qua bộ gõ của Windows (key = "Process", keyCode 229, code đúng) đã đi được (`move-keys.ts`), nên KHÔNG là dấu hiệu cần gợi ý: chỉ đếm dấu hiệu CHÈN
// của bộ gõ kiểu hook mà người chơi không gõ chữ:
//  - keydown KHÔNG có `code` (Unicode chèn: code rỗng / Unidentified, keyCode 229 / 231, hoặc ký tự có dấu) khi không gõ ở ô nhập;
//  - Backspace NGAY SAU một phím chữ di chuyển (bộ gõ xoá chữ vừa gõ để thay bằng chữ có dấu);
//  - keyup của phím di chuyển KHÔNG có keydown trước (bộ gõ nuốt keydown).
// Đủ `IME_HINT_SCORE` dấu hiệu trong `IME_HINT_WINDOW_MS` thì gợi ý MỘT lần.
import { defaultMoveResolver, type MoveResolver } from "./move-keys";

export const IME_HINT_SCORE = 3;
export const IME_HINT_WINDOW_MS = 15_000;
/** Backspace sau phím chữ di chuyển trong chừng này ms là bộ gõ đang thay chữ (người chơi không kịp tự bấm) */
export const IME_BACKSPACE_MS = 150;

export const IME_HINT_TEXT =
  "Đang bật bộ gõ tiếng Việt? Hãy tắt bộ gõ (chuyển sang chế độ E) hoặc dùng 4 phím mũi tên để đi.";

export interface ImeKey {
  type: "down" | "up";
  code?: string;
  key?: string;
  keyCode?: number;
  /** Đang gõ ở ô nhập chữ (chat...): không tính dấu hiệu */
  typing: boolean;
  /** `keyup` của phím di chuyển có keydown trước không (`MoveKeys.keyUp`); keydown thì bỏ trống */
  wasHeld?: boolean;
  /** Đồng hồ (ms) của người gọi */
  at: number;
}

export class ImeSniffer {
  /** `resolve`: tra hướng của phím theo bảng phím hiện tại (di chuyển đổi được); mặc định WASD + mũi tên. */
  constructor(private readonly resolve: MoveResolver = defaultMoveResolver) {}

  private hits: number[] = [];
  private lastLetterAt = -Infinity;
  private shown = false;

  /** Đã gợi ý rồi chưa (mỗi phiên một lần). */
  get alreadyShown(): boolean {
    return this.shown;
  }

  /** Nạp một sự kiện phím; trả `true` đúng MỘT lần khi đủ dấu hiệu để hiện gợi ý. */
  feed(e: ImeKey): boolean {
    if (this.shown || e.typing) return false;
    const code = e.code ?? "";
    const isMove = this.resolve(code) !== null;
    const isMoveLetter = code.startsWith("Key") && isMove;
    if (e.type === "down") {
      if (isMoveLetter) this.lastLetterAt = e.at;
      const noCode = code === "" || code === "Unidentified";
      const synthetic =
        noCode && (e.keyCode === 229 || e.keyCode === 231 || (e.key ?? "").length === 1);
      if (synthetic && e.key !== "Shift" && e.key !== "Control" && e.key !== "Alt") this.hit(e.at);
      else if (code === "Backspace" && e.at - this.lastLetterAt <= IME_BACKSPACE_MS) this.hit(e.at);
    } else if (isMove && e.wasHeld === false) {
      this.hit(e.at);
    }
    return this.shown;
  }

  private hit(at: number): void {
    this.hits.push(at);
    this.hits = this.hits.filter((t) => at - t <= IME_HINT_WINDOW_MS);
    if (this.hits.length >= IME_HINT_SCORE) this.shown = true;
  }
}
