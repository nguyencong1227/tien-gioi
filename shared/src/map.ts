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

function makeNoise(seed: number, cell: number, w: number, h: number) {
  const rnd = mulberry32(seed);
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
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

function generate(def: MapDef): Uint8Array {
  const { seed, w, h, town } = def;
  const tiles = new Uint8Array(w * h);
  const elev = makeNoise(seed, 14, w, h);
  const elev2 = makeNoise(seed + 1, 5, w, h);
  const forest = makeNoise(seed + 2, 9, w, h);
  const detail = mulberry32(seed + 3);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
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
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) t = T.Rock;
      tiles[y * w + x] = t;
    }
  }

  // Lạc Hà Trấn + bốn con đường đất tỏa ra
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - town.cx, y + 0.5 - town.cy);
      if (d <= town.r) tiles[y * w + x] = T.Stone;
      else if (d <= town.r + 2 && tiles[y * w + x] !== T.Stone) tiles[y * w + x] = T.Grass;
    }
  }
  const road = (dx: number, dy: number) => {
    let x = town.cx,
      y = town.cy;
    const wob = mulberry32(seed + dx * 7 + dy * 13);
    while (x > 1 && y > 1 && x < w - 2 && y < h - 2) {
      for (let k = -1; k <= 0; k++) {
        const px = dx ? x : x + k,
          py = dy ? y : y + k;
        const i = py * w + px;
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

/** Mô tả một bản đồ: client và server cùng sinh ô từ `seed`, không gửi dữ liệu bản đồ qua mạng. */
export interface MapDef {
  id: string;
  name: string;
  seed: number;
  /** Kích thước tính bằng ô */
  w: number;
  h: number;
  /** Khu an toàn (ô): tâm và bán kính */
  town: { cx: number; cy: number; r: number };
}

/**
 * Một bản đồ đã sinh ô, kèm va chạm và các phép đo theo chính bản đồ đó.
 * Mọi nơi cần biết ô / va chạm / trấn nên nhận `GameMap` (vd `world.map`) thay vì đọc hằng toàn cục.
 */
export class GameMap {
  readonly tiles: Uint8Array;
  readonly worldW: number;
  readonly worldH: number;
  /** Khu an toàn tính bằng px */
  readonly townPx: { x: number; y: number; r: number };

  constructor(readonly def: MapDef) {
    this.tiles = generate(def);
    this.worldW = def.w * TILE;
    this.worldH = def.h * TILE;
    this.townPx = { x: def.town.cx * TILE, y: def.town.cy * TILE, r: def.town.r * TILE };
  }

  tileAt(tx: number, ty: number): T {
    if (tx < 0 || ty < 0 || tx >= this.def.w || ty >= this.def.h) return T.Rock;
    return this.tiles[ty * this.def.w + tx] as T;
  }

  isBlockedPx(x: number, y: number): boolean {
    return BLOCKING.has(this.tileAt(Math.floor(x / TILE), Math.floor(y / TILE)));
  }

  /** Kiểm tra hình tròn bán kính r có chạm ô chặn không. */
  circleBlocked(x: number, y: number, r: number): boolean {
    return (
      this.isBlockedPx(x - r, y - r) ||
      this.isBlockedPx(x + r, y - r) ||
      this.isBlockedPx(x - r, y + r) ||
      this.isBlockedPx(x + r, y + r) ||
      this.isBlockedPx(x, y)
    );
  }

  /** Di chuyển có trượt theo tường (tách trục X/Y). Dùng chung client và server. */
  moveWithCollision(x: number, y: number, dx: number, dy: number, r: number) {
    let nx = x + dx,
      ny = y;
    if (this.circleBlocked(nx, ny, r)) nx = x;
    ny = y + dy;
    if (this.circleBlocked(nx, ny, r)) ny = y;
    return { x: nx, y: ny };
  }

  inTown(x: number, y: number, pad = 0): boolean {
    return Math.hypot(x - this.townPx.x, y - this.townPx.y) <= this.townPx.r + pad;
  }

  /** Độ nguy hiểm theo khoảng cách tới trấn: 0..1 */
  dangerAt(x: number, y: number): number {
    const d = Math.hypot(x - this.townPx.x, y - this.townPx.y);
    return Math.min(1, Math.max(0, (d - this.townPx.r) / (this.worldW * 0.5 - this.townPx.r)));
  }
}

export const DEFAULT_MAP_ID = "lac_ha";

/** Danh sách bản đồ của game. Hiện chỉ có Lạc Hà Trấn (docs/THIET_KE_NHIEU_BAN_DO.md). */
export const MAPS: readonly MapDef[] = [
  { id: DEFAULT_MAP_ID, name: "Lạc Hà Trấn", seed: MAP_SEED, w: MAP_W, h: MAP_H, town: TOWN },
];

export const MAP_BY_ID: Readonly<Record<string, MapDef>> = Object.fromEntries(
  MAPS.map((m) => [m.id, m]),
);

const mapCache = new Map<string, GameMap>();

/**
 * Lấy bản đồ theo id (sinh một lần rồi nhớ). Id lạ trả `undefined`: id có thể đến từ client / file lưu,
 * nên không tra bảng trực tiếp (`MAP_BY_ID["constructor"]` không phải `undefined`).
 */
export function getMap(id: unknown): GameMap | undefined {
  if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(MAP_BY_ID, id))
    return undefined;
  let m = mapCache.get(id);
  if (!m) {
    m = new GameMap(MAP_BY_ID[id]);
    mapCache.set(id, m);
  }
  return m;
}

/** Bản đồ mặc định (Lạc Hà Trấn). */
export const DEFAULT_MAP: GameMap = getMap(DEFAULT_MAP_ID)!;

// ---- Tên cũ: trỏ tới bản đồ mặc định, giữ để chuyển dần sang `GameMap` (#123), không đổi hành vi ----

export const MAP_TILES = DEFAULT_MAP.tiles;

export function tileAt(tx: number, ty: number): T {
  return DEFAULT_MAP.tileAt(tx, ty);
}

export function isBlockedPx(x: number, y: number): boolean {
  return DEFAULT_MAP.isBlockedPx(x, y);
}

/** Kiểm tra hình tròn bán kính r có chạm ô chặn không. */
export function circleBlocked(x: number, y: number, r: number): boolean {
  return DEFAULT_MAP.circleBlocked(x, y, r);
}

/** Di chuyển có trượt theo tường (tách trục X/Y). Dùng chung client và server. */
export function moveWithCollision(x: number, y: number, dx: number, dy: number, r: number) {
  return DEFAULT_MAP.moveWithCollision(x, y, dx, dy, r);
}

export function inTown(x: number, y: number, pad = 0): boolean {
  return DEFAULT_MAP.inTown(x, y, pad);
}

/** Độ nguy hiểm theo khoảng cách tới trấn: 0..1 */
export function dangerAt(x: number, y: number): number {
  return DEFAULT_MAP.dangerAt(x, y);
}
