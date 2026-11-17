// Ô nhập SỐ LƯỢNG dùng chung (QUYET_DINH_M3 mục 47): dùng cho góp / rút / mua / nộp ở tông môn và Vứt / Bán ở túi đồ.
// Có: ô gõ số (`inputmode="numeric"`: điện thoại hiện bàn phím số), nút − / +, nút nhanh ×10 / ×100, nút Tối đa (kẹp theo giới hạn do nơi dùng đặt),
// giữ nút −/+ thì tăng / giảm nhanh dần, chữ xem trước kết quả, Enter = xác nhận, Esc = huỷ. Chỉ `createElement` + `textContent` (không `innerHTML`).
// Phần logic thuần (đọc chữ, kẹp, nhịp giữ) ở `qty-input.ts`. Server vẫn kiểm số lượng: ô này chỉ giúp người chơi thấy trước điều sẽ được gửi.
import {
  QTY_HOLD_DELAY_MS,
  applyHold,
  applyQtyAction,
  parseQty,
  qtyDisabled,
  qtyHoldStep,
  type QtyAction,
} from "./qty-input";

export interface QtyStepperOptions {
  doc?: Document;
  /** Nhãn đọc cho trình đọc màn hình của ô gõ, ví dụ "Số lượng góp" */
  label: string;
  /** id của ô gõ và hai nút −/+ (giữ id cũ của hộp mà ô này thay thế để tập lệnh kiểm / E2E tìm được); bỏ trống = không đặt id */
  ids?: { input?: string; minus?: string; plus?: string };
  /** Chữ gợi ý khi ô trống (mặc định "Số lượng") */
  placeholder?: string;
  /** Giới hạn trên hiện tại (số nguyên; < 1 = không còn gì để chọn, mọi nút khoá). Đổi sau bằng `setMax`. */
  max: number;
  /** Số lượng ban đầu (kẹp vào [1, max]); mặc định 1 */
  initial?: number;
  /** Chữ xem trước kết quả của số lượng đang chọn ("+30 cống hiến", "còn lại 12"); bỏ trống thì chỉ hiện chữ báo lỗi / kẹp */
  preview?: (qty: number) => string;
  /** Mỗi khi số lượng (hoặc tính hợp lệ) đổi: `null` = ô trống / hỏng */
  onChange?: (qty: number | null) => void;
  /** Enter trong ô khi số lượng hợp lệ */
  onConfirm?: (qty: number) => void;
  /** Esc trong ô (luôn rời ô và chặn nổi bọt; Esc lần kế mới đóng hộp chứa): nơi dùng có hộp riêng cần đóng thì đặt hàm này */
  onCancel?: () => void;
  /** Hẹn giờ (đưa vào được để test); mặc định của trình duyệt */
  timers?: {
    setTimeout: (fn: () => void, ms: number) => unknown;
    clearTimeout: (id: unknown) => void;
  };
}

export interface QtyStepper {
  readonly el: HTMLElement;
  /** Số lượng hợp lệ đang chọn, hoặc `null` (ô trống / hỏng / không còn gì để chọn) */
  getQty(): number | null;
  /** Đọc lại CHỮ HIỆN TẠI trong ô rồi trả số lượng (dùng lúc xác nhận: chữ có thể vừa bị đổi bằng mã mà chưa có sự kiện `input`) */
  read(): number | null;
  setQty(n: number): void;
  setMax(max: number): void;
  focus(): void;
  /** Xoá ô về TRỐNG (sau khi gửi xong): `getQty()` = null, không báo lỗi; `setMax` về sau không tự điền lại số 1 cho tới khi người chơi gõ / bấm nút / `setQty` */
  clear(): void;
  /** Dừng mọi hẹn giờ giữ nút (gọi khi gỡ ô khỏi cây DOM) */
  destroy(): void;
}

const BUTTONS: Array<{ action: QtyAction; text: string; label: string; cls: string }> = [
  { action: "minus", text: "−", label: "Bớt một", cls: "qty-btn" },
  { action: "plus", text: "+", label: "Thêm một", cls: "qty-btn" },
  { action: "x10", text: "×10", label: "Nhân mười", cls: "qty-btn qty-btn-quick" },
  { action: "x100", text: "×100", label: "Nhân một trăm", cls: "qty-btn qty-btn-quick" },
  { action: "max", text: "Tối đa", label: "Chọn số tối đa", cls: "qty-btn qty-btn-max" },
];

export function createQtyStepper(opts: QtyStepperOptions): QtyStepper {
  const doc = opts.doc ?? document;
  const tm = opts.timers ?? {
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id as number),
  };
  let max = Number.isFinite(opts.max) ? Math.floor(opts.max) : 0;

  const root = doc.createElement("div");
  root.className = "qty-stepper";
  const row = doc.createElement("div");
  row.className = "qty-row";
  const input = doc.createElement("input");
  input.type = "text";
  input.className = "qty-input";
  input.setAttribute("inputmode", "numeric");
  input.setAttribute("pattern", "[0-9]*");
  input.setAttribute("enterkeyhint", "done");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("aria-label", opts.label);
  if (opts.ids?.input) input.id = opts.ids.input;
  input.setAttribute("placeholder", opts.placeholder ?? "Số lượng");
  const note = doc.createElement("p");
  note.className = "qty-note";
  note.setAttribute("role", "status");
  note.setAttribute("aria-live", "polite");

  const buttons = new Map<QtyAction, HTMLButtonElement>();
  for (const b of BUTTONS) {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = b.cls;
    btn.textContent = b.text;
    btn.setAttribute("aria-label", b.label);
    if (b.action === "minus" && opts.ids?.minus) btn.id = opts.ids.minus;
    if (b.action === "plus" && opts.ids?.plus) btn.id = opts.ids.plus;
    buttons.set(b.action, btn);
  }
  // MỘT hàng gói được (rộng thì cả sáu điều khiển nằm một dòng, hẹp thì tự xuống dòng): thanh hành động của kho đồ dính đáy màn hình nên càng thấp càng tốt (điện thoại ngang cao ~390 px).
  // Thứ tự DOM (Tab đi theo): − [ô] + ×10 ×100 Tối đa
  row.append(
    buttons.get("minus")!,
    input,
    buttons.get("plus")!,
    buttons.get("x10")!,
    buttons.get("x100")!,
    buttons.get("max")!,
  );
  root.append(row, note);

  let qty: number | null = null;
  let cleared = false;
  let invalid = false;
  let errNote = "";

  const render = () => {
    const dis = qtyDisabled(qty, max);
    for (const [a, btn] of buttons) btn.disabled = dis[a];
    input.disabled = max < 1;
    if (invalid) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
    note.textContent = errNote || (qty !== null && opts.preview ? opts.preview(qty) : "");
    note.classList.toggle("bad", invalid || (max < 1 && errNote !== ""));
  };

  /** Đặt số lượng (null = trống) rồi vẽ lại; `writeInput` ghi số vào ô (khi đổi bằng nút / kẹp). */
  const commit = (next: number | null, writeInput: boolean, msg = "") => {
    const changed = next !== qty;
    qty = next;
    cleared = false;
    invalid = false;
    errNote = msg;
    if (writeInput) input.value = next === null ? "" : String(next);
    render();
    if (changed) opts.onChange?.(qty);
  };

  const fromText = () => {
    const r = parseQty(input.value, max);
    if (r.invalid) {
      const changed = qty !== null;
      qty = null;
      invalid = true;
      errNote = r.note;
      render();
      if (changed) opts.onChange?.(null);
      return;
    }
    commit(r.qty, r.clamped, r.note); // bị kẹp thì ghi đè lại số đã kẹp để người chơi thấy đúng thứ sẽ gửi
  };

  input.addEventListener("input", fromText);
  input.addEventListener("blur", () => {
    // rời ô khi còn trống / hỏng mà còn gì để chọn: nhắc, không tự đoán số
    if (max >= 1 && qty === null && !invalid) {
      errNote = "Nhập số lượng từ 1 trở lên.";
      render();
    }
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (qty !== null) opts.onConfirm?.(qty);
      else {
        errNote = invalid
          ? errNote
          : max < 1
            ? "Không còn gì để chọn."
            : "Nhập số lượng từ 1 trở lên.";
        render();
      }
    } else if (e.key === "Escape") {
      // Esc = HUỶ: rời ô (bỏ tiêu điểm) và chặn nổi bọt, đúng quy ước của `processEscapeKey` (đang gõ trong ô thì Esc không đóng thẳng hộp chính; Esc lần kế mới đóng).
      // Nơi dùng có `onCancel` (hộp riêng của nó) thì được gọi thêm.
      e.preventDefault();
      e.stopPropagation();
      input.blur();
      opts.onCancel?.();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      commit(applyQtyAction(qty, e.key === "ArrowUp" ? "plus" : "minus", max) || null, true);
    }
  });

  // --- nút: chuột / chạm = pointerdown (bước ngay + giữ lặp), bàn phím = click không chuột (`detail` 0) ---
  let holdTimer: unknown = null;
  let holdIndex = 0;
  const stopHold = () => {
    if (holdTimer !== null) tm.clearTimeout(holdTimer);
    holdTimer = null;
  };
  const step = (action: QtyAction) => commit(applyQtyAction(qty, action, max) || null, true);
  const holdTick = (dir: "plus" | "minus") => {
    const next = applyHold(qty, dir, holdIndex, max);
    const wait = qtyHoldStep(holdIndex).nextMs;
    holdIndex++;
    commit(next || null, true);
    const atEnd = dir === "plus" ? next >= max : next <= 1;
    holdTimer = atEnd ? null : tm.setTimeout(() => holdTick(dir), wait);
  };
  for (const [action, btn] of buttons) {
    btn.addEventListener("pointerdown", (e) => {
      if (btn.disabled) return;
      e.preventDefault(); // không cướp tiêu điểm của ô gõ (bàn phím số của điện thoại giữ nguyên)
      step(action);
      if (action === "minus" || action === "plus") {
        stopHold();
        holdIndex = 0;
        holdTimer = tm.setTimeout(() => holdTick(action), QTY_HOLD_DELAY_MS);
      }
    });
    btn.addEventListener("click", (e) => {
      if (e.detail !== 0) return; // chuột / chạm đã xử lý ở pointerdown
      if (!btn.disabled) step(action);
    });
    for (const ev of ["pointerup", "pointercancel", "pointerleave", "blur"] as const)
      btn.addEventListener(ev, stopHold);
  }

  const initial = Number.isFinite(opts.initial) ? Math.floor(opts.initial as number) : 1;
  commit(
    max < 1 ? null : Math.min(max, Math.max(1, initial)),
    true,
    max < 1 ? "Không còn gì để chọn." : "",
  );

  return {
    el: root,
    getQty: () => qty,
    read: () => {
      fromText();
      return qty;
    },
    setQty: (n) => {
      stopHold();
      commit(
        max < 1 ? null : Math.min(max, Math.max(1, Math.floor(Number.isFinite(n) ? n : 1))),
        true,
      );
    },
    setMax: (m) => {
      stopHold();
      max = Number.isFinite(m) ? Math.floor(m) : 0;
      if (max < 1) commit(null, true, "Không còn gì để chọn.");
      else if (qty === null && cleared)
        render(); // người chơi vừa gửi xong và ô đang trống: giữ trống
      else if (qty === null) commit(Math.min(max, 1), true);
      else commit(Math.min(max, qty), true);
    },
    clear: () => {
      stopHold();
      const changed = qty !== null;
      qty = null;
      invalid = false;
      errNote = "";
      input.value = "";
      render();
      cleared = true;
      if (changed) opts.onChange?.(null);
    },
    focus: () => input.focus(),
    destroy: stopHold,
  };
}
