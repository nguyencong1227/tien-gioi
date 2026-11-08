// Joystick ảo cho màn hình cảm ứng: chạm vào nửa trái màn hình để hiện, kéo để đi.
const RADIUS = 56;

export const joystick = { x: 0, y: 0, active: false };

export function setupJoystick() {
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
