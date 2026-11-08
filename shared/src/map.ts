// Bản đồ sinh tất định từ seed: client và server sinh ra cùng một bản đồ,
// nên không phải gửi dữ liệu bản đồ qua mạng.

export const TILE = 32;
export const MAP_W = 96;
export const MAP_H = 96;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;
export const MAP_SEED = 20261108;

export enum T {
  Grass = 0,
  TallGrass = 1,
  Dirt = 2,
  Water = 3,
  Tree = 4,
  Rock = 5,
  Stone = 6, // nền đá lát trong trấn
  Sand = 7,
}

export const BLOCKING = new Set<T>([T.Water, T.Tree, T.Rock]);

/** Lạc Hà Trấn: khu an toàn ở giữa bản đồ. */
export const TOWN = { cx: MAP_W / 2, cy: MAP_H / 2, r: 7 };
export const TOWN_PX = { x: TOWN.cx * TILE, y: TOWN.cy * TILE, r: TOWN.r * TILE };

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed: number, cell: number) {
  const rnd = mulberry32(seed);
  const gw = Math.ceil(MAP_W / cell) + 2;
  const gh = Math.ceil(MAP_H / cell) + 2;
  const g = Array.from({ length: gw * gh }, () => rnd());
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = x / cell,
      fy = y / cell;
    const x0 = Math.floor(fx),
      y0 = Math.floor(fy);
    const tx = smooth(fx - x0),
      ty = smooth(fy - y0);
    const v = (i: number, j: number) => g[j * gw + i];
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx;
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
}

function generate(): Uint8Array {
  const tiles = new Uint8Array(MAP_W * MAP_H);
  const elev = makeNoise(MAP_SEED, 14);
  const elev2 = makeNoise(MAP_SEED + 1, 5);
  const forest = makeNoise(MAP_SEED + 2, 9);
  const detail = mulberry32(MAP_SEED + 3);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const e = elev(x, y) * 0.75 + elev2(x, y) * 0.25;
      const f = forest(x, y);
      const r = detail();
      let t: T = T.Grass;
      if (e < 0.26) t = T.Water;
      else if (e < 0.3) t = T.Sand;
      else if (e > 0.8) t = T.Rock;
      else if (f > 0.62 && r < 0.55) t = T.Tree;
      else if (f > 0.5 && r < 0.4) t = T.TallGrass;
      else if (r < 0.03) t = T.Tree;
      // Viền bản đồ là núi đá
      if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) t = T.Rock;
      tiles[y * MAP_W + x] = t;
    }
  }

  // Lạc Hà Trấn + bốn con đường đất tỏa ra
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const d = Math.hypot(x + 0.5 - TOWN.cx, y + 0.5 - TOWN.cy);
      if (d <= TOWN.r) tiles[y * MAP_W + x] = T.Stone;
      else if (d <= TOWN.r + 2 && tiles[y * MAP_W + x] !== T.Stone) tiles[y * MAP_W + x] = T.Grass;
    }
  }
  const road = (dx: number, dy: number) => {
    let x = TOWN.cx,
      y = TOWN.cy;
    const wob = mulberry32(MAP_SEED + dx * 7 + dy * 13);
    while (x > 1 && y > 1 && x < MAP_W - 2 && y < MAP_H - 2) {
      for (let k = -1; k <= 0; k++) {
        const px = dx ? x : x + k,
          py = dy ? y : y + k;
        const i = py * MAP_W + px;
        if (tiles[i] !== T.Stone) tiles[i] = T.Dirt;
      }
      x += dx;
      y += dy;
      if (wob() < 0.25) {
        if (dx) y += wob() < 0.5 ? -1 : 1;
        else x += wob() < 0.5 ? -1 : 1;
      }
    }
  };
  road(1, 0);
  road(-1, 0);
  road(0, 1);
  road(0, -1);
  return tiles;
}

export const MAP_TILES = generate();

export function tileAt(tx: number, ty: number): T {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return T.Rock;
  return MAP_TILES[ty * MAP_W + tx] as T;
}

export function isBlockedPx(x: number, y: number): boolean {
  return BLOCKING.has(tileAt(Math.floor(x / TILE), Math.floor(y / TILE)));
}

/** Kiểm tra hình tròn bán kính r có chạm ô chặn không. */
export function circleBlocked(x: number, y: number, r: number): boolean {
  return (
    isBlockedPx(x - r, y - r) ||
    isBlockedPx(x + r, y - r) ||
    isBlockedPx(x - r, y + r) ||
    isBlockedPx(x + r, y + r) ||
    isBlockedPx(x, y)
  );
}

/** Di chuyển có trượt theo tường (tách trục X/Y). Dùng chung client và server. */
export function moveWithCollision(x: number, y: number, dx: number, dy: number, r: number) {
  let nx = x + dx,
    ny = y;
  if (circleBlocked(nx, ny, r)) nx = x;
  ny = y + dy;
  if (circleBlocked(nx, ny, r)) ny = y;
  return { x: nx, y: ny };
}

export function inTown(x: number, y: number, pad = 0): boolean {
  return Math.hypot(x - TOWN_PX.x, y - TOWN_PX.y) <= TOWN_PX.r + pad;
}

/** Độ nguy hiểm theo khoảng cách tới trấn: 0..1 */
export function dangerAt(x: number, y: number): number {
  const d = Math.hypot(x - TOWN_PX.x, y - TOWN_PX.y);
  return Math.min(1, Math.max(0, (d - TOWN_PX.r) / (WORLD_W * 0.5 - TOWN_PX.r)));
}
