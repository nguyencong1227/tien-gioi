// Điều khiển di chuyển cho màn hình cảm ứng, hai kiểu (Cài đặt -> "Điều khiển di chuyển", lưu `tg_touch_scheme`):
//   - joystick nổi (mặc định): chạm vào nửa trái màn hình để hiện, kéo để đi;
//   - nút hướng cố định (D-pad 8 chiều, #327): nằm cố định ở góc dưới trái, chạm / kéo trên nút để đi.
// Cả hai ghi cùng đối tượng `joystick` nên WorldScene không phân biệt.
import { dpadVector, parseTouchScheme, TOUCH_SCHEME_STORAGE_KEY, type TouchScheme } from "./dpad";

const RADIUS = 56;

export const joystick = { x: 0, y: 0, active: false };

function readStoredScheme(): TouchScheme {
  try {
    return parseTouchScheme(localStorage.getItem(TOUCH_SCHEME_STORAGE_KEY));
  } catch {
    return "float"; // trình duyệt chặn localStorage
  }
}

/** Kiểu điều khiển đang chọn (đọc từ `<html data-touch-scheme>` do `setTouchScheme` đặt). */
export function getTouchScheme(): TouchScheme {
  return parseTouchScheme(document.documentElement.dataset.touchScheme);
}

/** Đổi kiểu điều khiển: lưu lại, đặt `<html data-touch-scheme>` (CSS bật / tắt joystick nổi và D-pad), nhả mọi lần chạm đang giữ. */
export function setTouchScheme(scheme: TouchScheme, persist = true): void {
  document.documentElement.dataset.touchScheme = scheme;
  joystick.x = joystick.y = 0;
  joystick.active = false;
  if (persist) {
    try {
      localStorage.setItem(TOUCH_SCHEME_STORAGE_KEY, scheme);
    } catch {
      /* bỏ qua */
    }
  }
}

function setupDpad() {
  const pad = document.createElement("div");
  pad.id = "dpad";
  pad.setAttribute("role", "group");
  pad.setAttribute("aria-label", "Nút hướng di chuyển");
  const arrows = {
    up: "▲",
    right: "▶",
    down: "▼",
    left: "◀",
  } as const;
  const els = {} as Record<keyof typeof arrows, HTMLElement>;
  for (const k of Object.keys(arrows) as Array<keyof typeof arrows>) {
    const a = document.createElement("span");
    a.className = `dp dp-${k}`;
    a.textContent = arrows[k];
    a.setAttribute("aria-hidden", "true");
    pad.append(a);
    els[k] = a;
  }
  document.getElementById("ui")!.append(pad);

  let id: number | null = null;
  const update = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const r = pad.getBoundingClientRect();
    const v = dpadVector(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    joystick.x = v.x;
    joystick.y = v.y;
    for (const k of Object.keys(arrows) as Array<keyof typeof arrows>)
      els[k].classList.toggle("on", v[k]);
  };
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    joystick.x = joystick.y = 0;
    joystick.active = false;
    for (const k of Object.keys(els) as Array<keyof typeof arrows>) els[k].classList.remove("on");
  };
  pad.addEventListener("pointerdown", (e) => {
    if (id !== null) return;
    e.preventDefault();
    id = e.pointerId;
    pad.setPointerCapture(id);
    joystick.active = true;
    update(e);
  });
  pad.addEventListener("pointermove", update);
  pad.addEventListener("pointerup", end);
  pad.addEventListener("pointercancel", end);
}

export function setupJoystick() {
  // Dựng lại từ đầu nếu cảnh được tạo lại (tránh nhân đôi vùng chạm)
  document.getElementById("joyzone")?.remove();
  document.getElementById("dpad")?.remove();
  setupDpad();
  setTouchScheme(readStoredScheme(), false);
  const schemeSel = document.getElementById("set-touch-scheme") as HTMLSelectElement | null;
  if (schemeSel && !schemeSel.dataset.bound) {
    schemeSel.dataset.bound = "1";
    schemeSel.value = getTouchScheme();
    schemeSel.addEventListener("change", () => setTouchScheme(parseTouchScheme(schemeSel.value)));
  }
  if (new URLSearchParams(location.search).has("debug")) {
    (window as unknown as { __joystick: typeof joystick }).__joystick = joystick;
  }
  const zone = document.createElement("div");
  zone.id = "joyzone";
  const base = document.createElement("div");
  base.className = "joy-base";
  const knob = document.createElement("div");
  knob.className = "joy-knob";
  base.append(knob);
  zone.append(base);
  document.getElementById("ui")!.append(zone);

  let id: number | null = null;
  let ox = 0,
    oy = 0;

  zone.addEventListener("pointerdown", (e) => {
    if (id !== null) return;
    id = e.pointerId;
    zone.setPointerCapture(id);
    const r = zone.getBoundingClientRect();
    ox = e.clientX;
    oy = e.clientY;
    base.style.left = `${ox - r.left}px`;
    base.style.top = `${oy - r.top}px`;
    base.classList.add("on");
    joystick.active = true;
    move(e);
  });
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - ox,
      dy = e.clientY - oy;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = len < 8;
    joystick.x = dead ? 0 : dx / RADIUS;
    joystick.y = dead ? 0 : dy / RADIUS;
  };
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    joystick.x = joystick.y = 0;
    joystick.active = false;
    knob.style.transform = "";
    base.classList.remove("on");
  };
  zone.addEventListener("pointermove", move);
  zone.addEventListener("pointerup", end);
  zone.addEventListener("pointercancel", end);
}
