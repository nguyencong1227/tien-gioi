/**
 * Vùng phát hình chữ nhật cho công thức có `zone` (thời tiết). Tách khỏi `fx.ts` để test được không cần Phaser.
 */

/** Nguồn điểm ngẫu nhiên trong hình chữ nhật căn giữa gốc (`getRandomPoint` là giao diện Phaser đòi cho `emitZone` kiểu random). */
export interface ZoneSource {
  w: number;
  h: number;
  getRandomPoint(p: { x: number; y: number }): void;
}

export function makeZoneSource(w: number, h: number): ZoneSource {
  return {
    w,
    h,
    getRandomPoint(p) {
      p.x = (Math.random() - 0.5) * this.w;
      p.y = (Math.random() - 0.5) * this.h;
    },
  };
}
