import { describe, expect, it } from "vitest";
import { MOVE_CODES, MoveKeys, isImeEvent } from "./move-keys";
import { moveVector } from "./move-input";

const press = (m: MoveKeys, code: string, extra: Record<string, unknown> = {}) =>
  m.keyDown({ code, ...extra });
const none = { left: false, right: false, up: false, down: false };

describe("MoveKeys: nhận phím theo vị trí (code)", () => {
  it("WASD và mũi tên đều đi; phím khác không", () => {
    const m = new MoveKeys();
    expect(press(m, "KeyD")).toBe(true);
    expect(m.state()).toEqual({ ...none, right: true });
    m.keyUp({ code: "KeyD" });
    expect(press(m, "ArrowUp")).toBe(true);
    expect(m.state()).toEqual({ ...none, up: true });
    expect(press(m, "KeyJ")).toBe(false);
    expect(press(m, "Space")).toBe(false);
    expect(Object.keys(MOVE_CODES)).toHaveLength(8);
  });

  it("BỘ GÕ: key = 'Process', keyCode 229, isComposing vẫn đi (code đúng vị trí phím), không bị bỏ qua", () => {
    const m = new MoveKeys();
    // đúng sự kiện bộ gõ Telex / VNI của Windows đưa tới trình duyệt khi bấm W
    const ev = { code: "KeyW", key: "Process", keyCode: 229, isComposing: true };
    expect(isImeEvent(ev)).toBe(true);
    expect(press(m, "KeyW", ev)).toBe(true);
    expect(m.state().up).toBe(true);
    m.keyUp({ code: "KeyW" });
    expect(m.state()).toEqual(none);
  });

  it("sự kiện bộ gõ tự chèn (code rỗng / không xác định / Backspace giả) bị bỏ qua và KHÔNG làm mất phím đang giữ", () => {
    const m = new MoveKeys();
    press(m, "KeyW");
    for (const code of ["", "Unidentified", "Backspace", undefined as unknown as string]) {
      expect(m.keyDown({ code })).toBe(false);
      m.keyUp({ code });
    }
    expect(m.state().up).toBe(true);
    expect(m.heldCodes()).toEqual(["KeyW"]);
  });

  it("Ctrl / Meta / Alt + phím di chuyển (Ctrl+W đóng tab, Alt+Tab...) không tính là đi; keyup luôn nhả", () => {
    const m = new MoveKeys();
    expect(press(m, "KeyW", { ctrlKey: true })).toBe(false);
    expect(press(m, "KeyA", { metaKey: true })).toBe(false);
    expect(press(m, "KeyS", { altKey: true })).toBe(false);
    expect(m.any).toBe(false);
    press(m, "KeyD");
    m.keyUp({ code: "KeyD", ctrlKey: true }); // nhả khi đang giữ Ctrl: vẫn nhả
    expect(m.any).toBe(false);
  });

  it("đang gõ chữ (typing): không ghi nhận", () => {
    const m = new MoveKeys();
    expect(m.keyDown({ code: "KeyW" }, true)).toBe(false);
    expect(m.any).toBe(false);
  });

  it("keyUp trả `true` nếu phím đang giữ HOẶC đã bấm nhưng bị bỏ qua (Ctrl+W, đang gõ chữ); `false` chỉ với keyup mồ côi (bộ gõ nuốt keydown)", () => {
    const m = new MoveKeys();
    expect(m.keyUp({ code: "KeyD" })).toBe(false); // mồ côi
    press(m, "KeyD");
    expect(m.keyUp({ code: "KeyD" })).toBe(true);
    expect(m.keyUp({ code: "KeyD" })).toBe(false);
    m.keyDown({ code: "KeyW", ctrlKey: true }); // bị bỏ qua nhưng KHÔNG mồ côi
    expect(m.keyUp({ code: "KeyW" })).toBe(true);
    m.keyDown({ code: "KeyA" }, true); // đang gõ chữ
    expect(m.keyUp({ code: "KeyA" })).toBe(true);
    // phím đang giữ lúc clear() (Alt-Tab rồi nhả khi quay lại): keyup muộn KHÔNG mồ côi
    press(m, "KeyS");
    m.clear();
    expect(m.any).toBe(false);
    expect(m.keyUp({ code: "KeyS" })).toBe(true);
    expect(m.keyUp({ code: "KeyS" })).toBe(false); // chỉ một lần
  });

  it("clear() quên mọi phím (mất focus / ẩn tab / mở chat): không phím nào kẹt", () => {
    const m = new MoveKeys();
    press(m, "KeyW");
    press(m, "ArrowRight");
    expect(m.any).toBe(true);
    m.clear();
    expect(m.any).toBe(false);
    expect(m.state()).toEqual(none);
  });
});

describe("MoveKeys: phím giữ, lặp, đổi hướng nhanh", () => {
  it("phím lặp (keydown lặp khi giữ) không đổi thứ tự bấm", () => {
    const m = new MoveKeys();
    press(m, "KeyA");
    press(m, "KeyD");
    for (let i = 0; i < 20; i++) press(m, "KeyA", { repeat: true }); // A lặp khi giữ nhưng D bấm SAU
    expect(m.state()).toEqual({ ...none, right: true });
  });

  it("hai phím NGƯỢC nhau: phím bấm SAU thắng (đổi hướng nhanh không đứng im); nhả phím sau thì phím trước đi tiếp", () => {
    const m = new MoveKeys();
    press(m, "KeyA");
    expect(m.state()).toEqual({ ...none, left: true });
    press(m, "KeyD"); // bấm D khi A chưa kịp nhả
    expect(m.state()).toEqual({ ...none, right: true });
    expect(
      moveVector({ ...m.state(), keyboardBlocked: false, joystick: { active: false, x: 0, y: 0 } })
        .dx,
    ).toBe(1);
    m.keyUp({ code: "KeyA" });
    expect(m.state()).toEqual({ ...none, right: true });
    m.keyUp({ code: "KeyD" });
    expect(m.state()).toEqual(none);
  });

  it("đối xứng cả bốn chiều: phím bấm SAU luôn thắng (D rồi A -> trái; W rồi S -> xuống; S rồi W -> lên)", () => {
    const cases: [string, string, Partial<typeof none>][] = [
      ["KeyD", "KeyA", { left: true }],
      ["KeyA", "KeyD", { right: true }],
      ["KeyW", "KeyS", { down: true }],
      ["KeyS", "KeyW", { up: true }],
      ["ArrowLeft", "KeyD", { right: true }],
      ["KeyD", "ArrowLeft", { left: true }],
    ];
    for (const [first, second, want] of cases) {
      const m = new MoveKeys();
      press(m, first);
      press(m, second);
      expect(m.state(), `${first} rồi ${second}`).toEqual({ ...none, ...want });
    }
  });

  it("phím KẸT (mất keyup) không chặn hướng ngược lại: bấm phím ngược thì đi được", () => {
    const m = new MoveKeys();
    press(m, "KeyA"); // keyup của A không bao giờ tới
    press(m, "KeyD");
    expect(m.state().right).toBe(true);
    expect(m.state().left).toBe(false);
  });

  it("WASD và mũi tên cùng hướng: nhả một nhóm vẫn đi nếu nhóm kia còn giữ", () => {
    const m = new MoveKeys();
    press(m, "KeyD");
    press(m, "ArrowRight");
    m.keyUp({ code: "KeyD" });
    expect(m.state().right).toBe(true);
    m.keyUp({ code: "ArrowRight" });
    expect(m.state().right).toBe(false);
  });

  it("đi chéo: hai trục độc lập; hướng giữ lâu không bị phím lặp của trục kia làm mất", () => {
    const m = new MoveKeys();
    press(m, "KeyD");
    press(m, "KeyW");
    for (let i = 0; i < 10; i++) press(m, "KeyW", { repeat: true }); // OS chỉ lặp phím bấm cuối; D im lặng nhưng vẫn giữ
    expect(m.state()).toEqual({ ...none, right: true, up: true });
  });

  it("không tự hết hạn theo thời gian: phím giữ trước đó im lặng vẫn đang giữ (OS chỉ lặp phím bấm cuối)", () => {
    const m = new MoveKeys();
    press(m, "KeyD");
    press(m, "KeyW");
    // không có API hết hạn: trạng thái chỉ đổi bởi keyup / clear
    expect(m.state().right).toBe(true);
  });
});
