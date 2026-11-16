import { describe, expect, it } from "vitest";
import { DEFAULT_MAP, PLAYER_RADIUS, type GameMap } from "@tien-gioi/shared";
import { savePos } from "./movement";

// Vị trí lưu vào hồ sơ (WorldRoom.persist): làm tròn thường có thể đẩy tâm vào tường tới 0,5 px dù chỗ đứng thật hợp lệ
// (soak 30 phút --m7, #741: `kiem-save` báo pos_blocked). `savePos` phải chọn toạ độ nguyên KHÔNG bị chặn khi có.
const map: GameMap = DEFAULT_MAP;
const blocked = (x: number, y: number) => map.circleBlocked(x, y, PLAYER_RADIUS);

/** Các vị trí thật HỢP LỆ nhưng làm tròn thường rơi vào tường (quét một dải quanh tường ở Lạc Hà Trấn, tất định) */
function roundIntoWall(limit: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 1900.3; y < 2100 && out.length < limit; y += 3.1) {
    for (let x = 1000.1; x < 1200 && out.length < limit; x += 0.37) {
      if (!blocked(x, y) && blocked(Math.round(x), Math.round(y))) out.push({ x, y });
    }
  }
  return out;
}

describe("savePos: toạ độ nguyên lưu vào hồ sơ không bị chặn khi vị trí thật hợp lệ", () => {
  it("có vị trí thật hợp lệ mà làm tròn thường rơi vào tường (không thì các test dưới vô nghĩa)", () => {
    expect(roundIntoWall(30).length).toBe(30);
  });

  it("vị trí thật hợp lệ: toạ độ lưu là số nguyên, KHÔNG bị chặn, lệch vị trí thật < 1,5 px (kể cả khi làm tròn thường rơi vào tường)", () => {
    const cases = roundIntoWall(30);
    let fixed = 0;
    for (const c of cases) {
      const s = savePos(map, c.x, c.y);
      expect(Number.isInteger(s.x) && Number.isInteger(s.y), `${c.x},${c.y}`).toBe(true);
      expect(blocked(s.x, s.y), `${c.x},${c.y} -> ${s.x},${s.y}`).toBe(false);
      expect(Math.hypot(s.x - c.x, s.y - c.y), `${c.x},${c.y}`).toBeLessThan(1.5);
      // GẦN NHẤT: bằng khoảng cách nhỏ nhất tới một trong bốn góc floor / ceil KHÔNG bị chặn (tính độc lập trong test)
      let nearest = Infinity;
      for (const cx of [Math.floor(c.x), Math.ceil(c.x)])
        for (const cy of [Math.floor(c.y), Math.ceil(c.y)])
          if (!blocked(cx, cy)) nearest = Math.min(nearest, Math.hypot(cx - c.x, cy - c.y));
      expect(Math.hypot(s.x - c.x, s.y - c.y), `${c.x},${c.y}`).toBeCloseTo(nearest, 9);
      if (blocked(Math.round(c.x), Math.round(c.y))) fixed++;
    }
    expect(fixed).toBe(cases.length); // mọi ca đều là ca làm tròn thường sẽ hỏng
  });

  it("làm tròn thường không bị chặn thì giữ ĐÚNG làm tròn thường (không đổi hành vi ở chỗ thoáng)", () => {
    for (const [x, y] of [
      [1500.4, 1500.6],
      [1234.5, 987.49],
      [2000, 2000],
    ] as const) {
      if (blocked(Math.round(x), Math.round(y))) continue;
      expect(savePos(map, x, y)).toEqual({ x: Math.round(x), y: Math.round(y) });
    }
    // trấn (thoáng): luôn đúng làm tròn thường
    const t = map.townPx;
    expect(savePos(map, t.x + 0.4, t.y - 0.4)).toEqual({
      x: Math.round(t.x + 0.4),
      y: Math.round(t.y - 0.4),
    });
  });

  it("vị trí thật nằm trong tường (không có điểm nguyên thoáng): trả làm tròn thường, không ném lỗi (safeSpot xử lý lúc vào lại)", () => {
    let wall: { x: number; y: number } | null = null;
    for (let y = 1900; y < 2100 && !wall; y += 8) {
      for (let x = 1000; x < 1200 && !wall; x += 8) if (blocked(x, y)) wall = { x, y };
    }
    expect(wall).not.toBeNull();
    // đi sâu vào tường: mọi góc đều bị chặn
    const s = savePos(map, wall!.x + 0.3, wall!.y + 0.3);
    expect(s).toEqual({ x: Math.round(wall!.x + 0.3), y: Math.round(wall!.y + 0.3) });
  });
});
