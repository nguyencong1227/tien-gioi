import { describe, it, expect, vi } from "vitest";
import {
  DOUBLE_TAP_MS,
  GUARDED_SELECTOR,
  installTouchGuards,
  isDoubleTap,
  isEditableTarget,
  isGuardedTarget,
  type TouchGuardDoc,
} from "./touch";

/** Phần tử giả: `closest` khớp theo tập id cho trước. */
const el = (tag: string, guardedIds: string[] = [], editable = false) => ({
  tagName: tag,
  isContentEditable: editable,
  closest: (sel: string) => (sel === GUARDED_SELECTOR && guardedIds.length ? {} : null),
});

function fakeDoc() {
  const handlers = new Map<string, Array<(e: any) => void>>();
  const doc: TouchGuardDoc = {
    addEventListener: (type, cb) => {
      handlers.set(type, [...(handlers.get(type) ?? []), cb]);
    },
    removeEventListener: (type, cb) => {
      handlers.set(
        type,
        (handlers.get(type) ?? []).filter((h) => h !== cb),
      );
    },
  };
  const fire = (type: string, target: unknown = el("DIV")) => {
    const e = { type, target, preventDefault: vi.fn() };
    for (const h of handlers.get(type) ?? []) h(e);
    return e;
  };
  return { doc, fire, count: (t: string) => (handlers.get(t) ?? []).length };
}

describe("touch: hàm thuần", () => {
  it("isDoubleTap: chỉ khi hai lần chạm cách nhau < DOUBLE_TAP_MS và có lần chạm trước", () => {
    expect(isDoubleTap(0, 1000)).toBe(false); // chưa từng chạm
    expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS - 1)).toBe(true);
    expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS)).toBe(false);
    expect(isDoubleTap(2000, 1000)).toBe(false); // đồng hồ lùi (không hợp lệ)
  });

  it("isEditableTarget: input / textarea / select / contenteditable; rác thì false", () => {
    expect(isEditableTarget(el("input"))).toBe(true);
    expect(isEditableTarget(el("TEXTAREA"))).toBe(true);
    expect(isEditableTarget(el("select"))).toBe(true);
    expect(isEditableTarget(el("DIV", [], true))).toBe(true);
    expect(isEditableTarget(el("BUTTON"))).toBe(false);
    for (const bad of [null, undefined, 5, "x"]) expect(isEditableTarget(bad)).toBe(false);
  });

  it("isGuardedTarget: vùng điều khiển thì true; ô nhập chữ trong vùng điều khiển vẫn false", () => {
    expect(isGuardedTarget(el("BUTTON", ["#skills"]))).toBe(true);
    expect(isGuardedTarget(el("DIV"))).toBe(false);
    expect(isGuardedTarget(el("INPUT", ["#skills"]))).toBe(false);
    expect(isGuardedTarget(null)).toBe(false);
    expect(isGuardedTarget({ tagName: "DIV" })).toBe(false); // không có closest
  });

  it("selector bảo vệ gồm canvas, joystick, cụm kỹ năng, thanh đan dược và các nút ngữ cảnh", () => {
    for (const id of [
      "#game",
      "#joyzone",
      "#skills",
      "#quickbar",
      "#btn-talk",
      "#btn-pickup",
      "#btn-portal",
    ])
      expect(GUARDED_SELECTOR).toContain(id);
  });
});

describe("touch: installTouchGuards", () => {
  it("chặn gesturestart / gesturechange / gestureend (phóng to hai ngón trên Safari iOS)", () => {
    const f = fakeDoc();
    installTouchGuards(f.doc, () => 0);
    for (const t of ["gesturestart", "gesturechange", "gestureend"])
      expect(f.fire(t).preventDefault).toHaveBeenCalledTimes(1);
  });

  it("chạm đúp trên vùng điều khiển bị chặn, chạm đơn và chạm cách xa không bị chặn", () => {
    const f = fakeDoc();
    let t = 1000;
    installTouchGuards(f.doc, () => t);
    const pad = el("BUTTON", ["#skills"]);
    expect(f.fire("touchend", pad).preventDefault).not.toHaveBeenCalled(); // lần đầu
    t += 100;
    expect(f.fire("touchend", pad).preventDefault).toHaveBeenCalledTimes(1); // chạm đúp
    t += DOUBLE_TAP_MS + 10;
    expect(f.fire("touchend", pad).preventDefault).not.toHaveBeenCalled(); // quá xa
  });

  it("bấm nhanh hai lần vào nút / ô ngoài vùng điều khiển (túi đồ, hộp thoại...) KHÔNG bị nuốt click thứ hai", () => {
    const f = fakeDoc();
    let t = 1000;
    installTouchGuards(f.doc, () => t);
    const slot = el("BUTTON"); // vd ô túi đồ: dùng `click`, không nằm trong GUARDED_SELECTOR
    f.fire("touchend", slot);
    t += 100;
    expect(f.fire("touchend", slot).preventDefault).not.toHaveBeenCalled();
    const div = el("DIV");
    f.fire("touchend", div);
    t += 100;
    expect(f.fire("touchend", div).preventDefault).not.toHaveBeenCalled();
  });

  it("chạm đúp trong ô nhập chữ KHÔNG bị chặn (vẫn chọn từ / đặt con trỏ được)", () => {
    const f = fakeDoc();
    let t = 1000;
    installTouchGuards(f.doc, () => t);
    f.fire("touchend", el("INPUT"));
    t += 100;
    expect(f.fire("touchend", el("INPUT")).preventDefault).not.toHaveBeenCalled();
  });

  it("trình đơn nhấn giữ: chặn trên vùng điều khiển, không chặn ở chỗ khác hay ô nhập chữ", () => {
    const f = fakeDoc();
    installTouchGuards(f.doc, () => 0);
    expect(f.fire("contextmenu", el("BUTTON", ["#skills"])).preventDefault).toHaveBeenCalledTimes(
      1,
    );
    expect(f.fire("contextmenu", el("DIV")).preventDefault).not.toHaveBeenCalled();
    expect(f.fire("contextmenu", el("INPUT", ["#game"])).preventDefault).not.toHaveBeenCalled();
  });

  it("hàm gỡ không để lại người nghe", () => {
    const f = fakeDoc();
    const off = installTouchGuards(f.doc, () => 0);
    expect(f.count("gesturestart") + f.count("touchend") + f.count("contextmenu")).toBe(3);
    off();
    expect(f.count("gesturestart") + f.count("gesturechange") + f.count("gestureend")).toBe(0);
    expect(f.count("touchend") + f.count("contextmenu")).toBe(0);
  });
});
