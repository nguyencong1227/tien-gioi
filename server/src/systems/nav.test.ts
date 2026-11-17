// Tìm đường theo bán kính thân (mục 48, #1012): lưới, A*, khe 1 ô / 2 ô, không tới được, trần CPU, tính tất định.
// Bản đồ thử dựng bằng `GameMap` thật rồi san phẳng `tiles` (mảng này sửa được) TRƯỚC khi hỏi tìm đường lần đầu (mặt nạ dựng lười, giữ theo bản đồ).
import { describe, expect, it } from "vitest";
import { DEFAULT_MAP, TILE, getMap, MAPS, type GameMap } from "@tien-gioi/shared";
import {
  NAV_CELL,
  NAV_MAX_NODES,
  inMainRegion,
  findPath,
  lineClear,
  navClassOf,
  navOpenNodes,
  squareFree,
} from "./nav";
import { flatMap, paint } from "./nav-test-helpers";

/** Mọi điểm của đường gấp khúc (lấy mẫu mỗi 4 px) đều thông cho cỡ thân `r`. */
function polylineFree(map: GameMap, pts: Float32Array, r: number): boolean {
  const cls = navClassOf(r);
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const dx = pts[i + 2] - pts[i];
    const dy = pts[i + 3] - pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
    for (let k = 0; k <= n; k++)
      if (!squareFree(map, pts[i] + (dx * k) / n, pts[i + 1] + (dy * k) / n, cls)) return false;
  }
  return true;
}

describe("navClassOf: cỡ thân làm tròn lên bội 4, kẹp [8, 32]", () => {
  it("các mốc", () => {
    expect(navClassOf(1)).toBe(8);
    expect(navClassOf(8)).toBe(8);
    expect(navClassOf(8.1)).toBe(12);
    expect(navClassOf(19.2)).toBe(20);
    expect(navClassOf(24)).toBe(24);
    expect(navClassOf(99)).toBe(32);
  });
});

describe("squareFree / lineClear", () => {
  it("hình vuông chạm mép ô chặn cũng tính là chạm; ngoài bản đồ là chặn", () => {
    const map = flatMap();
    paint(map, 10, 10, 10, 10);
    // Ô cây chiếm x 320..352, y 320..352
    expect(squareFree(map, 300, 336, 19)).toBe(true); // mép phải 319
    expect(squareFree(map, 300, 336, 20)).toBe(false); // mép phải 320: chạm ô
    expect(squareFree(map, 4, 100, 8)).toBe(false); // viền đá / ngoài bản đồ
  });

  it("đường thẳng bị cây chặn thì lineClear sai, vòng qua thì đúng", () => {
    const map = flatMap();
    paint(map, 10, 5, 10, 20);
    expect(lineClear(map, 200, 336, 500, 336, 10)).toBe(false);
    expect(lineClear(map, 200, 200, 500, 200, 10)).toBe(false); // y = 200 nằm trong cột cây (ô 5..20 -> 160..672)
    expect(lineClear(map, 200, 100, 500, 100, 10)).toBe(true); // phía trên đầu cột
    expect(lineClear(map, 200, 700, 500, 700, 10)).toBe(true); // phía dưới chân cột
  });
});

describe("findPath: đường A* theo cỡ thân", () => {
  it("không có vật cản: một đoạn thẳng, tới đích", () => {
    const map = flatMap();
    const p = findPath(map, 20, 200, 400, 900, 400, 30)!;
    expect(p.reached).toBe(true);
    expect(p.pts.length).toBeLessThanOrEqual(6); // đã làm thẳng
    const lx = p.pts[p.pts.length - 2];
    const ly = p.pts[p.pts.length - 1];
    expect(Math.hypot(lx - 900, ly - 400)).toBeLessThanOrEqual(30);
  });

  it("tường dài có lối ở cuối: đường vòng qua lối, mọi điểm thông cho cỡ thân", () => {
    const map = flatMap();
    paint(map, 20, 1, 20, 22); // tường dọc, lối ở dưới (ô 23..28)
    const r = 24;
    const p = findPath(map, r, 300, 400, 1000, 400, 40)!;
    expect(p.reached).toBe(true);
    expect(polylineFree(map, p.pts, r)).toBe(true);
    // Phải đi xuống dưới đầu tường (y > 23 * TILE) rồi mới sang bên kia
    let maxY = 0;
    for (let i = 1; i < p.pts.length; i += 2) maxY = Math.max(maxY, p.pts[i]);
    expect(maxY).toBeGreaterThan(22 * TILE);
    expect(
      Math.hypot(p.pts[p.pts.length - 2] - 1000, p.pts[p.pts.length - 1] - 400),
    ).toBeLessThanOrEqual(40);
  });

  it("khe 2 ô: thân to (bán kính di chuyển 24) lọt; khe 1 ô: thân to không lọt (đường chỉ tới gần đích), thân nhỏ lọt", () => {
    const wide = flatMap();
    paint(wide, 20, 1, 20, 13);
    paint(wide, 20, 16, 20, 28); // khe 2 ô: ô 14, 15
    expect(findPath(wide, 24, 300, 450, 1000, 450, 30)!.reached).toBe(true);

    const narrow = flatMap();
    paint(narrow, 20, 1, 20, 14);
    paint(narrow, 20, 16, 20, 28); // khe 1 ô: ô 15
    const big = findPath(narrow, 24, 300, 450, 1000, 450, 30)!;
    expect(big.reached).toBe(false);
    // Đường tới nút gần đích nhất: phía trái tường, sát tường
    expect(big.pts[big.pts.length - 2]).toBeLessThan(20 * TILE);
    const small = findPath(narrow, 10, 300, 450, 1000, 450, 30)!;
    expect(small.reached).toBe(true);
    expect(polylineFree(narrow, small.pts, 10)).toBe(true);
  });

  it("đích nằm trong ô kín: không tới được, đường tới điểm gần đích nhất, không đứng im ở xuất phát", () => {
    const map = flatMap();
    paint(map, 24, 12, 28, 12);
    paint(map, 24, 16, 28, 16);
    paint(map, 24, 12, 24, 16);
    paint(map, 28, 12, 28, 16); // hộp kín, trong là ô 25..27 x 13..15
    const goalX = 26 * TILE + 16;
    const goalY = 14 * TILE + 16;
    const p = findPath(map, 10, 200, 400, goalX, goalY, 20)!;
    expect(p.reached).toBe(false);
    const ex = p.pts[p.pts.length - 2];
    const ey = p.pts[p.pts.length - 1];
    expect(Math.hypot(ex - goalX, ey - goalY)).toBeLessThan(
      Math.hypot(200 - goalX, 400 - goalY) - 100,
    );
  });

  it("chỗ đứng nằm trong vật chặn: null (người gọi đi thẳng như cũ)", () => {
    const map = flatMap();
    paint(map, 10, 10, 14, 14);
    expect(findPath(map, 20, 12 * TILE, 12 * TILE, 900, 400, 30)).toBeNull();
  });

  it("thử lối khác (avoid): chặn điểm đang cố tới thì đường đổi", () => {
    const map = flatMap();
    paint(map, 20, 1, 20, 22);
    const a = findPath(map, 10, 300, 400, 1000, 400, 30)!;
    const bx = a.pts[2];
    const by = a.pts[3];
    const b = findPath(map, 10, 300, 400, 1000, 400, 30, { x: bx, y: by, r: 40 })!;
    expect(Array.from(b.pts)).not.toEqual(Array.from(a.pts));
  });

  it("tất định: cùng đầu vào cho đúng cùng đường", () => {
    const map = flatMap();
    paint(map, 20, 1, 20, 22);
    const a = findPath(map, 24, 300, 400, 1000, 400, 40)!;
    const b = findPath(map, 24, 300, 400, 1000, 400, 40)!;
    expect(Array.from(b.pts)).toEqual(Array.from(a.pts));
    expect(b.expanded).toBe(a.expanded);
  });

  it("trần số nút: không bao giờ xét quá NAV_MAX_NODES, kể cả khi đích ở trong hộp kín giữa bản đồ lớn", () => {
    const map = flatMap(96, 96);
    paint(map, 40, 40, 56, 40);
    paint(map, 40, 56, 56, 56);
    paint(map, 40, 40, 40, 56);
    paint(map, 56, 40, 56, 56);
    const p = findPath(map, 10, 500, 100, 48 * TILE, 48 * TILE, 20)!;
    expect(p.expanded).toBeLessThanOrEqual(NAV_MAX_NODES);
    expect(p.reached).toBe(false);
  });
});

describe("inMainRegion (chỗ sinh trùm nằm trong vùng chính của bản đồ)", () => {
  it("ô kín: không nối; ngoài trống: nối; khe hẹp chỉ thân nhỏ lọt", () => {
    const map = flatMap();
    paint(map, 24, 12, 28, 12);
    paint(map, 24, 16, 28, 16);
    paint(map, 24, 12, 24, 16);
    paint(map, 28, 12, 28, 16);
    expect(inMainRegion(map, 10, 26 * TILE + 16, 14 * TILE + 16)).toBe(false);
    expect(inMainRegion(map, 10, 900, 600)).toBe(true);
    const narrow = flatMap();
    paint(narrow, 24, 1, 24, 14);
    paint(narrow, 24, 16, 24, 28);
    // Bên phải tường chỉ thông qua khe 1 ô (ô 15): thân nhỏ nối được, thân to thì không
    expect(inMainRegion(narrow, 10, 30 * TILE, 450)).toBe(true);
    expect(inMainRegion(narrow, 24, 30 * TILE, 450)).toBe(false);
  });
});

describe("dữ liệu bản đồ thật", () => {
  it("lưới nút lẻ ô: nửa ô và có nút thông cho cả thân to ở mọi bản đồ", () => {
    expect(NAV_CELL).toBe(TILE / 2);
    for (const def of MAPS) {
      const map = getMap(def.id)!;
      expect(navOpenNodes(map, 24), def.id).toBeGreaterThan(1000);
      expect(navOpenNodes(map, 8), def.id).toBeGreaterThan(navOpenNodes(map, 24));
    }
  });

  it("tìm đường xuyên Lạc Hà Trấn: mỗi lần tìm xét <= NAV_MAX_NODES nút và chạy nhanh (ngân sách CPU)", () => {
    const map = DEFAULT_MAP;
    // Dựng mặt nạ trước (một lần mỗi cỡ thân), đo riêng phần tìm
    findPath(map, 24, map.townPx.x, map.townPx.y, map.townPx.x + 100, map.townPx.y, 30);
    const t0 = performance.now();
    let worst = 0;
    const N = 60;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const gx = map.townPx.x + Math.cos(a) * 1500;
      const gy = map.townPx.y + Math.sin(a) * 1300;
      const p = findPath(map, 24, map.townPx.x, map.townPx.y + 200, gx, gy, 30);
      if (p) worst = Math.max(worst, p.expanded);
    }
    const ms = (performance.now() - t0) / N;
    expect(worst).toBeLessThanOrEqual(NAV_MAX_NODES);
    // Ngân sách rộng (máy chủ dùng chung nhiều dev): một lần tìm trung bình dưới 5 ms; số đo thường < 1 ms
    expect(ms).toBeLessThan(5);
  });
});
