// Phím DI CHUYỂN theo VỊ TRÍ phím (`event.code`), không theo `keyCode` (QUYET_DINH_M3 mục 25: "di chuyển bàn phím giật / không ăn / liệt nút"). Lớp THUẦN (không DOM) nên test được.
//
// Vì sao không dùng Phaser `addKeys` nữa: Phaser nhận phím theo `keyCode`. Bộ gõ tiếng Việt (Unikey / EVKey / bộ gõ của Windows theo Telex hay VNI) khiến sự kiện phím chữ
// tới trình duyệt với `key = "Process"`, `keyCode = 229` (đang soạn chữ), dù `code` vẫn là vị trí phím thật ("KeyW"). W A S D lại chính là phím dấu của Telex, nên người
// gõ tiếng Việt thấy nhân vật "liệt nút" ngay khi bật bộ gõ. `code` không đổi theo bộ gõ / kiểu bàn phím, nên là nguồn đáng tin duy nhất.
//
// Quy tắc:
//  - keydown của phím di chuyển (`MOVE_CODES`) được GHI NHẬN bất kể `key` / `keyCode` / `isComposing` (đó chính là ca bộ gõ). Sự kiện KHÔNG có `code` hợp lệ (chữ có dấu bộ gõ
//    tự chèn: `code` rỗng, `keyCode` 229 / 231, hoặc Backspace giả) bị bỏ qua, không làm mất phím đang giữ;
//  - phím kèm Ctrl / Meta / Alt (tổ hợp của trình duyệt / hệ điều hành) không tính là đi; keyup luôn nhả;
//  - ĐANG GÕ CHỮ ở ô nhập (`typing`) thì không ghi nhận; `clear()` khi mất focus / ẩn tab / mở ô chat / menu chuột phải (mất keyup);
//  - hai phím NGƯỢC nhau cùng giữ (đổi hướng nhanh, hoặc một phím kẹt vì mất keyup): phím bấm SAU thắng, nên bấm phím ngược lại luôn thoát được khỏi phím kẹt;
//  - KHÔNG tự hết hạn theo thời gian: hệ điều hành chỉ lặp phím được bấm cuối, nên phím giữ trước đó im lặng hàng giây vẫn đang giữ thật.
export type MoveDir = "left" | "right" | "up" | "down";

/** Vị trí phím -> hướng MẶC ĐỊNH. WASD và mũi tên (cả hai nhóm cùng lúc được). Phím THẬT do người chơi đổi được (`keybinds.ts`, `move.*`): `MoveKeys` nhận bộ tra hướng từ ngoài. */
export const MOVE_CODES: Readonly<Record<string, MoveDir>> = {
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
};

/** Phần của `KeyboardEvent` mà bộ theo dõi cần (để test không cần DOM). */
export interface KeyLike {
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/** Tra hướng của một phím (`event.code`): `null` nếu không phải phím di chuyển. Gọi MỖI LẦN cần nên đổi phím giữa lúc đang giữ vẫn đúng. */
export type MoveResolver = (code: string) => MoveDir | null;

/** Bộ tra mặc định: bảng `MOVE_CODES` (cho test và lúc chưa nối với bảng phím). */
export const defaultMoveResolver: MoveResolver = (code) =>
  Object.prototype.hasOwnProperty.call(MOVE_CODES, code) ? MOVE_CODES[code] : null;

export interface MoveState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export class MoveKeys {
  /** Phím đang giữ -> số thứ tự lần bấm (lớn hơn = bấm sau) */
  private held = new Map<string, number>();
  /** Phím di chuyển đã bấm xuống nhưng BỊ BỎ QUA (Ctrl / Alt, đang gõ chữ) hoặc đã bị `clear()` lúc đang giữ: keyup của chúng không phải keyup "mồ côi" */
  private ignored = new Set<string>();
  private order = 0;

  constructor(private readonly resolve: MoveResolver = defaultMoveResolver) {}

  /**
   * Ghi nhận keydown. `typing` = đang gõ ở ô nhập văn bản (không ghi nhận). Trả `true` nếu là phím di chuyển đã được ghi nhận (hoặc đang giữ: phím lặp
   * làm mới trạng thái, không đổi thứ tự bấm).
   */
  keyDown(e: KeyLike, typing = false): boolean {
    const code = e.code ?? "";
    if (this.resolve(code) === null) return false;
    if (typing || e.ctrlKey || e.metaKey || e.altKey) {
      this.ignored.add(code);
      return false;
    }
    if (!this.held.has(code)) this.held.set(code, ++this.order);
    return true;
  }

  /** keyup luôn nhả (kể cả khi kèm Ctrl / Alt hay đang ở ô nhập). Trả `true` nếu phím đó đang được giữ (keyup MỒ CÔI = `false` mà là phím di chuyển: dấu hiệu bộ gõ nuốt keydown). */
  keyUp(e: KeyLike): boolean {
    const code = e.code ?? "";
    const had = this.held.delete(code);
    return this.ignored.delete(code) || had;
  }

  /** Quên mọi phím đang giữ (mất focus, ẩn tab, mở chat, menu chuột phải: keyup có thể không bao giờ tới). */
  clear(): void {
    // keyup của phím đang giữ lúc quên (nhả sau khi quay lại cửa sổ) KHÔNG phải keyup mồ côi: ghi nhớ để `keyUp` trả `true`
    for (const code of this.held.keys()) this.ignored.add(code);
    this.held.clear();
  }

  /** Còn phím di chuyển nào đang giữ không. */
  get any(): boolean {
    return this.held.size > 0;
  }

  /** Số thứ tự bấm mới nhất của một hướng (0 = không giữ). */
  private latest(dir: MoveDir): number {
    let best = 0;
    for (const [code, n] of this.held) if (this.resolve(code) === dir && n > best) best = n;
    return best;
  }

  /** Hướng sau khi giải quyết cặp ngược nhau: phím bấm SAU thắng (không bao giờ triệt tiêu thành đứng im). */
  state(): MoveState {
    const l = this.latest("left");
    const r = this.latest("right");
    const u = this.latest("up");
    const d = this.latest("down");
    return {
      left: l > 0 && l > r,
      right: r > 0 && r > l,
      up: u > 0 && u > d,
      down: d > 0 && d > u,
    };
  }

  /** Mã phím đang giữ (cho chẩn đoán `?debug`). */
  heldCodes(): string[] {
    return [...this.held.keys()];
  }
}

/** Sự kiện này có phải của bộ gõ đang soạn chữ không (chỉ để đếm / chẩn đoán: KHÔNG dùng để bỏ qua phím di chuyển). */
export function isImeEvent(e: { key?: string; keyCode?: number; isComposing?: boolean }): boolean {
  return e.isComposing === true || e.key === "Process" || e.keyCode === 229;
}
