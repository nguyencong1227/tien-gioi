import { describe, expect, it } from "vitest";
import {
  TILE,
  MAP_W,
  MAP_H,
  MAP_TILES,
  TOWN,
  TOWN_PX,
  BLOCKING,
  T,
  tileAt,
  isBlockedPx,
  circleBlocked,
  moveWithCollision,
  inTown,
  dangerAt,
} from "./map";
import { PLAYER_RADIUS } from "./game";

/** Bộ sinh số ngẫu nhiên cố định để test lặp lại được. */
function rng(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

describe("bản đồ", () => {
  it("có đúng kích thước", () => {
    expect(MAP_TILES).toHaveLength(MAP_W * MAP_H);
  });

  it("viền bản đồ là núi đá, ra ngoài bản đồ cũng bị chặn", () => {
    for (let x = 0; x < MAP_W; x++) {
      expect(tileAt(x, 0)).toBe(T.Rock);
      expect(tileAt(x, MAP_H - 1)).toBe(T.Rock);
    }
    for (let y = 0; y < MAP_H; y++) {
      expect(tileAt(0, y)).toBe(T.Rock);
      expect(tileAt(MAP_W - 1, y)).toBe(T.Rock);
    }
    expect(tileAt(-1, 5)).toBe(T.Rock);
    expect(tileAt(5, MAP_H)).toBe(T.Rock);
  });

  it("Lạc Hà Trấn lát đá và đi lại được", () => {
    expect(tileAt(TOWN.cx, TOWN.cy)).toBe(T.Stone);
    expect(circleBlocked(TOWN_PX.x, TOWN_PX.y, PLAYER_RADIUS)).toBe(false);
    expect(inTown(TOWN_PX.x, TOWN_PX.y)).toBe(true);
    expect(dangerAt(TOWN_PX.x, TOWN_PX.y)).toBe(0);
  });

  it("phần lớn vùng đi được nối liền với trấn", () => {
    // Loang từ trấn qua các ô không chặn
    const seen = new Uint8Array(MAP_W * MAP_H);
    const stack = [TOWN.cy * MAP_W + TOWN.cx];
    seen[stack[0]] = 1;
    let reached = 0;
    while (stack.length) {
      const i = stack.pop()!;
      reached++;
      const x = i % MAP_W,
        y = (i / MAP_W) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          j = ny * MAP_W + nx;
        if (
          nx < 0 ||
          ny < 0 ||
          nx >= MAP_W ||
          ny >= MAP_H ||
          seen[j] ||
          BLOCKING.has(MAP_TILES[j] as T)
        )
          continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    const walkable = MAP_TILES.filter((t) => !BLOCKING.has(t as T)).length;
    expect(reached / walkable).toBeGreaterThan(0.6);
  });
});

describe("va chạm", () => {
  it("không đi xuyên tường khi lao thẳng ra viền bản đồ", () => {
    let p = { x: TOWN_PX.x, y: TOWN_PX.y };
    for (let i = 0; i < 2000; i++) p = moveWithCollision(p.x, p.y, -8, 0, PLAYER_RADIUS);
    expect(circleBlocked(p.x, p.y, PLAYER_RADIUS)).toBe(false);
    expect(p.x).toBeGreaterThan(TILE); // không lọt vào cột núi đá ở viền trái
  });

  it("đi ngẫu nhiên 5000 bước không bao giờ kẹt vào ô chặn", () => {
    const r = rng(42);
    let p = { x: TOWN_PX.x, y: TOWN_PX.y };
    for (let i = 0; i < 5000; i++) {
      const a = r() * Math.PI * 2;
      p = moveWithCollision(p.x, p.y, Math.cos(a) * 9, Math.sin(a) * 9, PLAYER_RADIUS);
      expect(circleBlocked(p.x, p.y, PLAYER_RADIUS)).toBe(false);
    }
  });

  it("trượt dọc tường: chạm tường theo X vẫn đi được theo Y", () => {
    // Tìm một ô chặn có ô trống ngay bên trái và một dải trống phía trên/dưới bên trái
    for (let ty = 3; ty < MAP_H - 3; ty++) {
      for (let tx = 3; tx < MAP_W - 3; tx++) {
        if (!BLOCKING.has(tileAt(tx, ty))) continue;
        const free = [-1, 0, 1].every(
          (d) => !BLOCKING.has(tileAt(tx - 1, ty + d)) && !BLOCKING.has(tileAt(tx - 2, ty + d)),
        );
        if (!free) continue;
        // Đứng sát mép trái của ô chặn, ở giữa ô theo chiều dọc
        const x = tx * TILE - PLAYER_RADIUS - 1,
          y = ty * TILE + TILE / 2;
        if (circleBlocked(x, y, PLAYER_RADIUS)) continue;
        const moved = moveWithCollision(x, y, 6, 6, PLAYER_RADIUS);
        expect(moved.x).toBe(x); // bị tường chặn theo X
        expect(moved.y).toBe(y + 6); // vẫn trượt theo Y
        return;
      }
    }
    throw new Error("Không tìm thấy chỗ phù hợp để thử trượt tường");
  });

  it("isBlockedPx khớp với loại ô", () => {
    for (let i = 0; i < 200; i++) {
      const tx = (i * 37) % MAP_W,
        ty = (i * 53) % MAP_H;
      expect(isBlockedPx(tx * TILE + 5, ty * TILE + 5)).toBe(BLOCKING.has(tileAt(tx, ty)));
    }
  });
});
