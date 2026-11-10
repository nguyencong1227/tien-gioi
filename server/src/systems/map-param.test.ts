// Bước 0 nhiều bản đồ (#123): mọi system đọc bản đồ từ `w.map`, không đọc hằng toàn cục.
// Dùng một bản đồ nhỏ KHÁC bản đồ mặc định (kích thước, seed, trấn khác): nếu chỗ nào còn đọc hằng toàn cục
// (WORLD_W, TOWN_PX, circleBlocked...) thì quái / người chơi sẽ nằm ngoài hoặc đè lên ô chặn của bản đồ nhỏ.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP,
  GameMap,
  MONSTERS,
  PLAYER_RADIUS,
  TILE,
  TOWN_PX,
  WORLD_W,
  type MapDef,
} from "@tien-gioi/shared";
import { applyInputs, safeSpot } from "./movement";
import { spawnInitial } from "./monsters";
import { tickWorld } from "./tick";
import { addPlayer, makeWorld } from "./test-helpers";

const SMALL_DEF: MapDef = {
  id: "nho",
  name: "Bản đồ nhỏ",
  seed: 777,
  w: 40,
  h: 56,
  town: { cx: 20, cy: 28, r: 5 },
};
const small = new GameMap(SMALL_DEF);

describe("system đọc bản đồ từ World.map (#123, 0b)", () => {
  it("bản đồ nhỏ thật sự khác mặc định (điều kiện để các test dưới có giá trị)", () => {
    expect(small.worldW).toBeLessThan(WORLD_W);
    expect(small.townPx.x).not.toBe(TOWN_PX.x);
    expect(makeWorld().w.map).toBe(DEFAULT_MAP);
    expect(makeWorld(small).w.map).toBe(small);
  });

  it("quái chỉ sinh trong bản đồ của phòng: trong khung, ngoài trấn, không đè ô chặn", () => {
    const { w } = makeWorld(small);
    spawnInitial(w);
    const ms = [...w.state.monsters.values()];
    expect(ms.length).toBeGreaterThan(0);
    for (const m of ms) {
      const def = MONSTERS.find((d) => d.id === m.kind)!;
      expect(m.x, m.kind).toBeGreaterThanOrEqual(64);
      expect(m.x, m.kind).toBeLessThanOrEqual(small.worldW - 64);
      expect(m.y, m.kind).toBeGreaterThanOrEqual(64);
      expect(m.y, m.kind).toBeLessThanOrEqual(small.worldH - 64);
      expect(small.inTown(m.x, m.y, 160), `${m.kind} trong trấn`).toBe(false);
      expect(small.circleBlocked(m.x, m.y, def.radius), `${m.kind} đè ô chặn`).toBe(false);
    }
  });

  it("safeSpot chọn chỗ trong trấn của bản đồ đó, không đè ô chặn; tọa độ lưu hỏng thì về trấn", () => {
    for (let i = 0; i < 50; i++) {
      const s = safeSpot(small);
      expect(small.inTown(s.x, s.y), "trong trấn").toBe(true);
      expect(small.circleBlocked(s.x, s.y, PLAYER_RADIUS)).toBe(false);
    }
    // Tọa độ hợp lệ trên bản đồ mặc định nhưng nằm ngoài bản đồ nhỏ (chặn bởi Rock): không được dùng
    const out = safeSpot(small, 2500, 2500);
    expect(small.inTown(out.x, out.y)).toBe(true);
    // Tọa độ hợp lệ thì giữ nguyên
    const ok = safeSpot(small, small.townPx.x, small.townPx.y);
    expect(ok).toEqual({ x: small.townPx.x, y: small.townPx.y });
  });

  it("applyInputs va chạm theo bản đồ truyền vào: viền núi của bản đồ nhỏ chặn, dù bản đồ mặc định còn đi tiếp được", () => {
    // Hàng ô mà ở bản đồ nhỏ đi được tới sát viền phải (cột 39 là núi), còn ở bản đồ mặc định các ô phía sau trống
    const x0 = 38 * TILE + 16;
    let y0 = -1;
    for (let ty = 2; ty < 54 && y0 < 0; ty++) {
      const y = ty * TILE + 16;
      const smallFree = !small.circleBlocked(x0, y, PLAYER_RADIUS);
      const defFree = [x0, x0 + 32, x0 + 64, x0 + 96].every(
        (x) => !DEFAULT_MAP.circleBlocked(x, y, PLAYER_RADIUS),
      );
      if (smallFree && defFree) y0 = y;
    }
    expect(y0, "tìm được hàng thử").toBeGreaterThan(0);
    const { w } = makeWorld(small);
    const { p, c } = addPlayer(w, "chay");
    p.x = x0;
    p.y = y0;
    for (let i = 0; i < 60; i++) {
      c.inputs.push({ seq: i + 1, dx: 1, dy: 0 });
      applyInputs(w.map, p, c);
    }
    expect(p.x).toBeLessThan(39 * TILE); // dừng trước viền núi của bản đồ nhỏ
    expect(small.circleBlocked(p.x, p.y, PLAYER_RADIUS)).toBe(false);
  });

  it("chạy nhiều tick (vùng nhìn, di chuyển, quái) trên bản đồ nhỏ không lỗi, người chơi và quái nằm trong bản đồ", () => {
    const { w } = makeWorld(small);
    spawnInitial(w);
    const { p, c } = addPlayer(w, "a");
    const { p: q, c: c2 } = addPlayer(w, "b");
    for (const pl of [p, q]) {
      const s = safeSpot(small);
      pl.x = s.x;
      pl.y = s.y;
    }
    for (let t = 0; t < 100; t++) {
      w.now += 50;
      c.inputs.push({ seq: t + 1, dx: Math.cos(t / 9), dy: Math.sin(t / 9) });
      c2.inputs.push({ seq: t + 1, dx: -1, dy: 0.3 });
      tickWorld(w, 50);
    }
    for (const pl of [p, q]) {
      expect(pl.x).toBeGreaterThan(0);
      expect(pl.x).toBeLessThan(small.worldW);
      expect(pl.y).toBeGreaterThan(0);
      expect(pl.y).toBeLessThan(small.worldH);
      expect(small.circleBlocked(pl.x, pl.y, PLAYER_RADIUS)).toBe(false);
    }
    w.state.monsters.forEach((m) => {
      expect(m.x).toBeLessThan(small.worldW);
      expect(m.y).toBeLessThan(small.worldH);
    });
  });
});
