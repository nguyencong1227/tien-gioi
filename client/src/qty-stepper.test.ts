import { describe, expect, it, vi } from "vitest";
import { createQtyStepper, type QtyStepper, type QtyStepperOptions } from "./qty-stepper";

// ---------- DOM giả đủ dùng ----------
class FakeEl {
  tag: string;
  className = "";
  type = "";
  value = "";
  textContent = "";
  disabled = false;
  children: FakeEl[] = [];
  attrs = new Map<string, string>();
  handlers = new Map<string, Array<(e: any) => void>>();
  classes = new Set<string>();
  focused = false;
  classList = {
    toggle: (c: string, on: boolean) => void (on ? this.classes.add(c) : this.classes.delete(c)),
    contains: (c: string) => this.classes.has(c),
  };
  constructor(tag: string) {
    this.tag = tag;
  }
  append(...k: FakeEl[]) {
    this.children.push(...k);
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  addEventListener(t: string, h: (e: any) => void) {
    const a = this.handlers.get(t) ?? [];
    a.push(h);
    this.handlers.set(t, a);
  }
  fire(t: string, e: Record<string, unknown> = {}) {
    const ev = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...e,
    };
    for (const h of this.handlers.get(t) ?? []) h(ev);
    return ev;
  }
  focus() {
    this.focused = true;
  }
}

/** Hẹn giờ giả: chạy tay theo thứ tự thời gian */
function fakeTimers() {
  let now = 0;
  let seq = 1;
  const q = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimeout: (fn: () => void, ms: number) => {
      const id = seq++;
      q.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (id: unknown) => void q.delete(id as number),
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...q.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at;
        q.delete(next[0]);
        next[1].fn();
      }
      now = end;
    },
    pending: () => q.size,
  };
}

function make(o: Partial<QtyStepperOptions> = {}) {
  const timers = fakeTimers();
  const doc = { createElement: (t: string) => new FakeEl(t) } as unknown as Document;
  const onChange = vi.fn();
  const onConfirm = vi.fn();
  const s: QtyStepper = createQtyStepper({
    doc,
    label: "Số lượng góp",
    max: 120,
    onChange,
    onConfirm,
    timers,
    ...o,
  });
  const root = s.el as unknown as FakeEl;
  const row = root.children[0]!;
  const quick = root.children[1]!;
  const note = root.children[2]!;
  const input = row.children[1]!;
  const btn = {
    minus: row.children[0]!,
    plus: row.children[2]!,
    x10: quick.children[0]!,
    x100: quick.children[1]!,
    max: quick.children[2]!,
  };
  const type = (text: string) => {
    input.value = text;
    input.fire("input");
  };
  const press = (b: FakeEl) => b.fire("pointerdown");
  return { s, timers, onChange, onConfirm, input, btn, note, type, press, root };
}

describe("qty-stepper: dựng và thuộc tính", () => {
  it("ô gõ có inputmode numeric, pattern số, enterkeyhint, tắt autocomplete, có nhãn đọc màn hình; mặc định 1", () => {
    const { input, s } = make();
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("pattern")).toBe("[0-9]*");
    expect(input.getAttribute("enterkeyhint")).toBe("done");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("aria-label")).toBe("Số lượng góp");
    expect(input.type).toBe("text");
    expect(input.value).toBe("1");
    expect(s.getQty()).toBe(1);
  });

  it("năm nút đều là button type=button có nhãn tiếng Việt; vùng báo là role=status aria-live=polite", () => {
    const { btn, note } = make();
    for (const b of Object.values(btn)) {
      expect(b.tag).toBe("button");
      expect(b.type).toBe("button");
      expect(b.getAttribute("aria-label")).toBeTruthy();
    }
    expect(btn.max.textContent).toBe("Tối đa");
    expect(note.getAttribute("role")).toBe("status");
    expect(note.getAttribute("aria-live")).toBe("polite");
  });

  it("initial được kẹp vào [1, max]", () => {
    expect(make({ initial: 500 }).s.getQty()).toBe(120);
    expect(make({ initial: 0 }).s.getQty()).toBe(1);
    expect(make({ initial: 7 }).s.getQty()).toBe(7);
  });
});

describe("qty-stepper: gõ số", () => {
  it("gõ số hợp lệ: cập nhật số lượng, báo onChange, không ghi đè ô", () => {
    const { type, s, onChange, input } = make();
    type("37");
    expect(s.getQty()).toBe(37);
    expect(input.value).toBe("37");
    expect(onChange).toHaveBeenLastCalledWith(37);
  });

  it("gõ 9999 (vượt max 120): kẹp về 120, GHI ĐÈ lại ô và báo 'Chỉ có tối đa 120'", () => {
    const { type, s, input, note } = make();
    type("9999");
    expect(s.getQty()).toBe(120);
    expect(input.value).toBe("120");
    expect(note.textContent).toBe("Chỉ có tối đa 120.");
  });

  it("gõ chữ / dấu âm / số lẻ: số lượng null, aria-invalid, chữ báo; KHÔNG ghi đè ô (người chơi tự sửa)", () => {
    for (const bad of ["abc", "-5", "3.5a", "1e3"]) {
      const { type, s, input, note } = make();
      type(bad);
      expect(s.getQty(), bad).toBeNull();
      expect(input.getAttribute("aria-invalid"), bad).toBe("true");
      expect(input.value, bad).toBe(bad);
      expect(note.textContent, bad).not.toBe("");
      expect(note.classList.contains("bad"), bad).toBe(true);
    }
  });

  it("sửa lại thành số hợp lệ thì hết lỗi (bỏ aria-invalid, bỏ chữ báo)", () => {
    const { type, s, input, note } = make();
    type("abc");
    type("12");
    expect(s.getQty()).toBe(12);
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(note.textContent).toBe("");
    expect(note.classList.contains("bad")).toBe(false);
  });

  it("xoá hết (trống): số lượng null nhưng CHƯA báo lỗi; rời ô khi còn trống thì nhắc nhập", () => {
    const { type, s, note, input } = make();
    type("");
    expect(s.getQty()).toBeNull();
    expect(note.textContent).toBe("");
    input.fire("blur");
    expect(note.textContent).toBe("Nhập số lượng từ 1 trở lên.");
  });

  it("'1.000' (dấu phân nhóm) đọc là 1000 và kẹp theo max", () => {
    const { type, s } = make({ max: 5000 });
    type("1.000");
    expect(s.getQty()).toBe(1000);
  });
});

describe("qty-stepper: nút", () => {
  it("− và + đổi một đơn vị; ×10 / ×100 nhân; Tối đa lấy max", () => {
    const { btn, press, s, input } = make({ max: 5000 });
    press(btn.plus);
    expect(s.getQty()).toBe(2);
    press(btn.x10);
    expect(s.getQty()).toBe(20);
    press(btn.x100);
    expect(s.getQty()).toBe(2000);
    press(btn.minus);
    expect(s.getQty()).toBe(1999);
    press(btn.max);
    expect(s.getQty()).toBe(5000);
    expect(input.value).toBe("5000");
  });

  it("nút chạm trần / chạm 1 bị khoá đúng chỗ và không làm gì khi bấm", () => {
    const { btn, press, s } = make({ max: 50 });
    expect(btn.minus.disabled).toBe(true);
    press(btn.minus);
    expect(s.getQty()).toBe(1);
    press(btn.max);
    expect(s.getQty()).toBe(50);
    expect(btn.plus.disabled).toBe(true);
    expect(btn.x10.disabled).toBe(true);
    expect(btn.x100.disabled).toBe(true);
    expect(btn.max.disabled).toBe(true);
    expect(btn.minus.disabled).toBe(false);
  });

  it("pointerdown giữ tiêu cấp của ô (preventDefault: bàn phím số của điện thoại không tắt)", () => {
    const { btn } = make();
    expect(btn.plus.fire("pointerdown").preventDefault).toHaveBeenCalled();
  });

  it("bàn phím: Enter / Cách trên nút sinh `click` không chuột (detail 0) -> bước đúng MỘT lần; click của chuột (detail 1) sau pointerdown KHÔNG bước đôi", () => {
    const { btn, s, press } = make();
    btn.plus.fire("click", { detail: 0 });
    expect(s.getQty()).toBe(2);
    press(btn.plus); // chuột: pointerdown bước (3) rồi click (detail 1) bị bỏ
    btn.plus.fire("click", { detail: 1 });
    expect(s.getQty()).toBe(3);
  });

  it("xem trước: chữ do nơi dùng cấp theo số lượng; đổi số thì đổi chữ", () => {
    const { btn, press, note } = make({ preview: (q) => `+${q * 5} cống hiến` });
    expect(note.textContent).toBe("+5 cống hiến");
    press(btn.x10);
    expect(note.textContent).toBe("+50 cống hiến");
  });
});

describe("qty-stepper: giữ nút −/+", () => {
  it("giữ + : chờ QTY_HOLD_DELAY_MS rồi lặp, nhanh dần; nhả (pointerup) thì dừng hẳn, không còn hẹn giờ", () => {
    const { btn, press, timers, s } = make({ max: 5000 });
    press(btn.plus); // bước ngay: 2
    expect(s.getQty()).toBe(2);
    timers.advance(379);
    expect(s.getQty()).toBe(2); // chưa tới nhịp giữ
    timers.advance(2);
    expect(s.getQty()).toBeGreaterThan(2);
    timers.advance(3000);
    const big = s.getQty()!;
    expect(big).toBeGreaterThan(100); // nhanh dần
    btn.plus.fire("pointerup");
    expect(timers.pending()).toBe(0);
    timers.advance(5000);
    expect(s.getQty()).toBe(big); // đứng yên sau khi nhả
  });

  it("giữ + tới trần thì tự dừng ở max (không vượt, không còn hẹn giờ)", () => {
    const { btn, press, timers, s } = make({ max: 40 });
    press(btn.plus);
    timers.advance(20_000);
    expect(s.getQty()).toBe(40);
    expect(timers.pending()).toBe(0);
  });

  it("giữ − tới 1 thì dừng ở 1", () => {
    const { btn, press, timers, s } = make({ initial: 60, max: 100 });
    press(btn.minus);
    timers.advance(20_000);
    expect(s.getQty()).toBe(1);
    expect(timers.pending()).toBe(0);
  });

  it("rời nút (pointerleave) hoặc huỷ (pointercancel) cũng dừng; destroy() dừng mọi hẹn giờ", () => {
    for (const ev of ["pointerleave", "pointercancel", "blur"]) {
      const { btn, press, timers } = make();
      press(btn.plus);
      btn.plus.fire(ev);
      expect(timers.pending(), ev).toBe(0);
    }
    const { btn, press, timers, s } = make();
    press(btn.plus);
    s.destroy();
    expect(timers.pending()).toBe(0);
  });
});

describe("qty-stepper: bàn phím trong ô", () => {
  it("Enter khi hợp lệ: onConfirm với đúng số; không hợp lệ: KHÔNG gọi và báo", () => {
    const { type, input, onConfirm, note } = make();
    type("9");
    const ev = input.fire("keydown", { key: "Enter" });
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledWith(9);
    onConfirm.mockClear();
    type("abc");
    input.fire("keydown", { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(note.textContent).not.toBe("");
    type("");
    input.fire("keydown", { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(note.textContent).toBe("Nhập số lượng từ 1 trở lên.");
  });

  it("Esc: có onCancel thì gọi và CHẶN nổi bọt; không có onCancel thì để Esc đi tiếp (nơi bắt Esc chung đóng hộp)", () => {
    const onCancel = vi.fn();
    const a = make({ onCancel });
    const e1 = a.input.fire("keydown", { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(e1.stopPropagation).toHaveBeenCalled();
    const b = make();
    const e2 = b.input.fire("keydown", { key: "Escape" });
    expect(e2.stopPropagation).not.toHaveBeenCalled();
    expect(e2.preventDefault).not.toHaveBeenCalled();
  });

  it("mũi tên lên / xuống ±1", () => {
    const { input, s } = make({ initial: 10 });
    input.fire("keydown", { key: "ArrowUp" });
    expect(s.getQty()).toBe(11);
    input.fire("keydown", { key: "ArrowDown" });
    input.fire("keydown", { key: "ArrowDown" });
    expect(s.getQty()).toBe(9);
  });
});

describe("qty-stepper: giới hạn đổi theo thời gian (setMax / setQty)", () => {
  it("setMax nhỏ hơn số đang chọn: kẹp xuống và ghi lại vào ô", () => {
    const { s, input, onChange } = make({ initial: 80 });
    s.setMax(30);
    expect(s.getQty()).toBe(30);
    expect(input.value).toBe("30");
    expect(onChange).toHaveBeenLastCalledWith(30);
  });

  it("setMax(0): không còn gì để chọn: qty null, ô và mọi nút khoá, có chữ báo; setMax lại thì mở và về 1", () => {
    const { s, input, btn, note } = make();
    s.setMax(0);
    expect(s.getQty()).toBeNull();
    expect(input.disabled).toBe(true);
    for (const b of Object.values(btn)) expect(b.disabled).toBe(true);
    expect(note.textContent).toBe("Không còn gì để chọn.");
    s.setMax(15);
    expect(s.getQty()).toBe(1);
    expect(input.disabled).toBe(false);
  });

  it("setMax khi đang gõ hỏng: dọn lỗi, về số hợp lệ", () => {
    const { s, type, input } = make();
    type("abc");
    s.setMax(50);
    expect(s.getQty()).toBe(1);
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("setQty kẹp vào [1, max]; giá trị hỏng thành 1; focus() đặt tiêu điểm vào ô", () => {
    const { s, input } = make();
    s.setQty(999);
    expect(s.getQty()).toBe(120);
    s.setQty(Number.NaN);
    expect(s.getQty()).toBe(1);
    s.focus();
    expect(input.focused).toBe(true);
  });

  it("onChange chỉ bắn khi giá trị đổi (không bắn thừa khi bấm nút đã khoá hoặc gõ lại cùng số)", () => {
    const { type, onChange } = make();
    onChange.mockClear();
    type("1");
    expect(onChange).not.toHaveBeenCalled();
    type("2");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("qty-stepper: id giữ chỗ và đọc lại chữ hiện tại", () => {
  it("ids đặt id cho ô gõ và hai nút −/+ (để tập lệnh kiểm tìm được); không đặt thì không có id", () => {
    const { input, btn } = make({
      ids: { input: "sect-input-deposit", minus: "m", plus: "p" },
    });
    expect((input as unknown as { id: string }).id).toBe("sect-input-deposit");
    expect((btn.minus as unknown as { id: string }).id).toBe("m");
    expect((btn.plus as unknown as { id: string }).id).toBe("p");
    const b = make();
    expect((b.input as unknown as { id?: string }).id).toBeUndefined();
  });

  it("read() đọc lại chữ ĐANG có trong ô: chữ đổi bằng mã không kèm sự kiện input vẫn được tính đúng lúc xác nhận", () => {
    const { s, input } = make();
    input.value = "88"; // KHÔNG bắn sự kiện input
    expect(s.getQty()).toBe(1); // bản lưu cũ
    expect(s.read()).toBe(88);
    expect(s.getQty()).toBe(88);
    input.value = "9999";
    expect(s.read()).toBe(120); // kẹp theo max và ghi đè ô
    expect(input.value).toBe("120");
    input.value = "x";
    expect(s.read()).toBeNull();
  });
});

describe("qty-stepper: clear() và placeholder", () => {
  it("có placeholder (mặc định 'Số lượng', đổi được)", () => {
    expect(make().input.getAttribute("placeholder")).toBe("Số lượng");
    expect(make({ placeholder: "Số Linh thạch" }).input.getAttribute("placeholder")).toBe(
      "Số Linh thạch",
    );
  });

  it("clear(): ô trống, qty null, KHÔNG báo lỗi, báo onChange(null) một lần; setMax về sau KHÔNG tự điền 1", () => {
    const { s, input, note, onChange } = make({ initial: 30 });
    onChange.mockClear();
    s.clear();
    expect(input.value).toBe("");
    expect(s.getQty()).toBeNull();
    expect(note.textContent).toBe("");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(null);
    s.setMax(500); // ví đổi sau khi gửi
    expect(input.value).toBe("");
    expect(s.getQty()).toBeNull();
    s.clear(); // gọi lần nữa: không báo thừa
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("sau clear(): bấm + từ ô trống ra 1; gõ và setQty hoạt động lại bình thường; setMax không còn giữ trống", () => {
    const a = make();
    a.s.clear();
    a.press(a.btn.plus);
    expect(a.s.getQty()).toBe(1);
    expect(a.input.value).toBe("1");
    const b = make();
    b.s.clear();
    b.type("25");
    expect(b.s.getQty()).toBe(25);
    b.s.setMax(300);
    expect(b.input.value).toBe("25");
    const c = make();
    c.s.clear();
    c.s.setQty(40);
    expect(c.s.getQty()).toBe(40);
    c.s.clear();
    c.press(c.btn.x10);
    expect(c.s.getQty()).toBe(10);
  });
});
