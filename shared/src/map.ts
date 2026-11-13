// Bản đồ sinh tất định từ seed: client và server sinh ra cùng một bản đồ,
// nên không phải gửi dữ liệu bản đồ qua mạng.
import { MONSTER_BY_ID, MONSTER_CAP, PLAYER_RADIUS } from "./game";

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
export const TOWN: Readonly<{ cx: number; cy: number; r: number }> = {
  cx: MAP_W / 2,
  cy: MAP_H / 2,
  r: 7,
};
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

  // Hang trùm (bí cảnh): san thành đất để trùm và người chơi luôn đứng được (bản đồ không có `lair` không đổi một ô nào)
  if (def.lair) {
    const { cx, cy, r } = def.lair;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) tiles[y * w + x] = T.Dirt;
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

/**
 * Cổng chuyển bản đồ, nằm ở rìa bản đồ (docs/THIET_KE_NHIEU_BAN_DO.md). Cổng luôn đi theo cặp:
 * đi qua cổng A (ở bản đồ X) thì tới bản đồ `A.toMap` và xuất hiện ở `spawn` của cổng `A.toPortal`;
 * cổng `A.toPortal` phải trỏ ngược lại A (test giữ: map.test.ts).
 * Luồng tin nhắn: shared/src/travel.ts.
 */
export interface PortalDef {
  /** Duy nhất trong cả game (khác bản đồ cũng không trùng) */
  readonly id: string;
  /** Tên hiện cho người chơi, vd "Bắc Môn Quan" */
  readonly name: string;
  /** Tâm cổng (px) */
  readonly x: number;
  readonly y: number;
  /** Đứng trong bán kính này (px) quanh tâm cổng thì được gửi `travel` */
  readonly r: number;
  /**
   * Bán kính khu an toàn quanh cổng (px, không nhỏ hơn `r`): quái không sinh ra, không đuổi vào
   * (`GameMap.inSafe`). Cổng ở rìa bản đồ là nơi rất nguy hiểm (`dangerAt` ~ 1), nên người vừa tới phải được yên.
   */
  readonly safeR: number;
  /** Chỗ người đi QUA cổng này (từ bản đồ bên kia) xuất hiện (px): trong `safeR`, ngoài `r`, không chặn */
  readonly spawn: Readonly<{ x: number; y: number }>;
  /** Bản đồ đích và cổng ở bản đồ đích */
  readonly toMap: string;
  readonly toPortal: string;
}

/** Mô tả một bản đồ: client và server cùng sinh ô từ `seed`, không gửi dữ liệu bản đồ qua mạng. */
export interface MapDef {
  readonly id: string;
  /**
   * Loại bản đồ: `world` (mặc định: một phòng sống mãi, nhiều người) hoặc `dungeon` (bí cảnh: phòng tạm của MỘT đội,
   * docs/THIET_KE_BI_CANH.md). Bản đồ `dungeon` KHÔNG nằm trong `MAPS` (không có phòng thường) mà ở `DUNGEON_MAPS`;
   * khu an toàn `town` của nó là cổng vào.
   */
  readonly kind?: "world" | "dungeon";
  /** Tên bản đồ (màn chuyển cảnh, danh sách). Lạc Hà giữ "Lạc Hà Trấn" cho tương thích */
  readonly name: string;
  readonly seed: number;
  /** Kích thước tính bằng ô */
  readonly w: number;
  readonly h: number;
  /** Khu an toàn (ô): tâm (số nguyên, ô chứa tâm) và bán kính */
  readonly town: Readonly<{ cx: number; cy: number; r: number }>;
  /** Tên khu an toàn hiện ở HUD khi đứng trong đó; bỏ trống thì dùng `name` */
  readonly townName?: string;
  /** Tên vùng hoang hiện ở HUD khi ra ngoài khu an toàn; bỏ trống thì dùng `name` */
  readonly wildName?: string;
  /** Cổng chuyển bản đồ; bỏ trống là bản đồ không có cổng */
  readonly portals?: readonly PortalDef[];
  /**
   * Hang trùm (chỉ bí cảnh): ô tâm (số nguyên) và bán kính (ô). Trùm sinh ra ĐÚNG ở tâm hang (server: PR 4b/4c), nền trong
   * bán kính được san thành đất (`T.Dirt`) nên luôn đi lại được. Client vẽ dấu hang trên bản đồ nhỏ từ `GameMap.lairPx`
   * thay vì chép toạ độ. Bỏ trống là bản đồ không có hang cố định.
   */
  readonly lair?: Readonly<{ cx: number; cy: number; r: number }>;
  /**
   * Số quái tối đa mỗi loại (khoá là `MonsterKind.id`, loại không có khoá thì không sinh ra ở bản đồ này).
   * Bỏ trống thì dùng `MONSTER_CAP` (như Lạc Hà Trấn từ trước tới giờ).
   */
  readonly monsterCap?: Readonly<Record<string, number>>;
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
  readonly townPx: Readonly<{ x: number; y: number; r: number }>;
  /** Từ mép trấn tới chỗ `dangerAt` đạt 1 (px): nửa cạnh ngắn của bản đồ trừ bán kính trấn */
  private readonly dangerSpanPx: number;
  /** Tên khu an toàn / vùng hoang để hiện ở HUD (đã có giá trị mặc định) */
  readonly townName: string;
  readonly wildName: string;
  /** Cổng chuyển bản đồ (rỗng nếu không có) */
  readonly portals: readonly PortalDef[];
  /** Số quái tối đa mỗi loại ở bản đồ này (đã có giá trị mặc định). Dùng `monsterCapOf` để tra theo id. */
  readonly monsterCap: Readonly<Record<string, number>>;
  /** Hang trùm tính bằng px (tâm và bán kính); `undefined` nếu bản đồ không có (xem `MapDef.lair`) */
  readonly lairPx: Readonly<{ x: number; y: number; r: number }> | undefined;

  constructor(readonly def: MapDef) {
    // Con đường đất đi từ ô (cx, cy) theo từng ô: số lẻ làm chỉ số mảng lệch và ghi hụt mà không báo lỗi
    for (const [field, v] of [
      ["w", def.w],
      ["h", def.h],
      ["town.cx", def.town.cx],
      ["town.cy", def.town.cy],
      ...(def.lair
        ? ([
            ["lair.cx", def.lair.cx],
            ["lair.cy", def.lair.cy],
          ] as const)
        : []),
    ] as const)
      if (!Number.isInteger(v))
        throw new Error(`MapDef ${def.id}: ${field} phải là số nguyên (${v})`);
    this.tiles = generate(def);
    this.worldW = def.w * TILE;
    this.worldH = def.h * TILE;
    this.townPx = { x: def.town.cx * TILE, y: def.town.cy * TILE, r: def.town.r * TILE };
    this.dangerSpanPx = Math.min(this.worldW, this.worldH) * 0.5 - this.townPx.r;
    // Trấn phủ kín nửa bản đồ thì dangerAt chia cho 0 hoặc số âm
    if (!(this.dangerSpanPx > 0))
      throw new Error(`MapDef ${def.id}: bán kính trấn phải nhỏ hơn nửa cạnh ngắn của bản đồ`);
    this.townName = def.townName ?? def.name;
    this.wildName = def.wildName ?? def.name;
    this.portals = def.portals ?? [];
    this.monsterCap = def.monsterCap ?? MONSTER_CAP;
    this.lairPx = def.lair
      ? { x: def.lair.cx * TILE, y: def.lair.cy * TILE, r: def.lair.r * TILE }
      : undefined;
    this.checkLair();
    this.checkPortals();
    this.checkMonsterCap();
  }

  /**
   * Hang trùm sai chỗ (không nằm gọn trong bản đồ, đè lên khu an toàn): báo ngay khi dựng bản đồ. Nền hang đã được `generate`
   * san phẳng nên không cần kiểm ô chặn; chỉ cần hang không bị khu an toàn (vẽ sau) nuốt mất.
   */
  private checkLair() {
    const l = this.def.lair;
    if (!l) return;
    const at = `MapDef ${this.def.id}: hang trùm`;
    if (!Number.isFinite(l.r) || !(l.r >= 1)) throw new Error(`${at}: r phải >= 1 ô (${l.r})`);
    // Viền bản đồ là núi đá: hang phải nằm gọn trong phần còn lại
    if (
      l.cx - l.r < 1 ||
      l.cy - l.r < 1 ||
      l.cx + l.r > this.def.w - 2 ||
      l.cy + l.r > this.def.h - 2
    )
      throw new Error(`${at}: không nằm gọn trong bản đồ`);
    const d = Math.hypot(l.cx - this.def.town.cx, l.cy - this.def.town.cy);
    if (d <= l.r + this.def.town.r + 2) throw new Error(`${at}: quá gần khu an toàn`);
  }

  /** Cổng sai chỗ (ngoài bản đồ, nằm trên ô chặn) làm người chơi kẹt hoặc không đi được: báo ngay khi dựng bản đồ. */
  private checkPortals() {
    const ids = new Set<string>();
    for (const p of this.portals) {
      const at = `MapDef ${this.def.id}: cổng ${p.id}`;
      if (typeof p.id !== "string" || !p.id || ids.has(p.id))
        throw new Error(`${at}: id rỗng hoặc trùng`);
      ids.add(p.id);
      for (const [f, v] of [
        ["x", p.x],
        ["y", p.y],
        ["r", p.r],
        ["safeR", p.safeR],
        ["spawn.x", p.spawn.x],
        ["spawn.y", p.spawn.y],
      ] as const)
        if (!Number.isFinite(v)) throw new Error(`${at}: ${f} phải là số hữu hạn (${v})`);
      if (!(p.r > 0) || p.safeR < p.r) throw new Error(`${at}: cần 0 < r <= safeR`);
      if (this.isBlockedPx(p.x, p.y)) throw new Error(`${at}: tâm cổng nằm trên ô chặn`);
      if (this.circleBlocked(p.spawn.x, p.spawn.y, PLAYER_RADIUS))
        throw new Error(`${at}: chỗ xuất hiện nằm trên ô chặn`);
      const dSpawn = Math.hypot(p.spawn.x - p.x, p.spawn.y - p.y);
      if (dSpawn <= p.r || dSpawn > p.safeR)
        throw new Error(`${at}: chỗ xuất hiện phải ngoài r và trong safeR của cổng`);
    }
  }

  private checkMonsterCap() {
    for (const [id, n] of Object.entries(this.monsterCap)) {
      if (!Object.prototype.hasOwnProperty.call(MONSTER_BY_ID, id))
        throw new Error(`MapDef ${this.def.id}: monsterCap có loại quái lạ "${id}"`);
      if (!Number.isInteger(n) || n < 0)
        throw new Error(`MapDef ${this.def.id}: monsterCap.${id} phải là số nguyên >= 0 (${n})`);
    }
  }

  /** Số quái tối đa của loại `id` ở bản đồ này (loại không khai báo là 0). Id lạ cũng là 0. */
  monsterCapOf(id: string): number {
    return Object.prototype.hasOwnProperty.call(this.monsterCap, id) ? this.monsterCap[id] : 0;
  }

  /** Tìm cổng theo id (id có thể đến từ client: id lạ trả `undefined`). */
  portal(id: unknown): PortalDef | undefined {
    return typeof id === "string" ? this.portals.find((p) => p.id === id) : undefined;
  }

  /** Cổng mà (x, y) đang đứng trong tầm `r` (điều kiện để gửi `travel`); không có thì `undefined`. */
  portalNear(x: number, y: number): PortalDef | undefined {
    return this.portals.find((p) => Math.hypot(x - p.x, y - p.y) <= p.r);
  }

  /**
   * Khu an toàn: trong trấn (cộng `pad`) hoặc trong `safeR` của một cổng (cộng `pad`).
   * Quái không sinh ra, không đuổi vào, không tấn công người đứng trong khu an toàn: nơi nào đang dùng `inTown`
   * để quyết định chuyện đó thì dùng `inSafe`; `inTown` chỉ còn nghĩa "đang ở trấn" (hồi phục nhanh, tên khu, âm nhạc).
   */
  inSafe(x: number, y: number, pad = 0): boolean {
    if (this.inTown(x, y, pad)) return true;
    return this.portals.some((p) => Math.hypot(x - p.x, y - p.y) <= p.safeR + pad);
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

  /**
   * Độ nguy hiểm theo khoảng cách tới trấn: 0..1. Đạt 1 ở khoảng cách bằng nửa cạnh NGẮN của bản đồ
   * (bản đồ vuông thì là nửa cạnh, như trước); bản đồ chữ nhật không bị "dài" làm loãng.
   */
  dangerAt(x: number, y: number): number {
    const d = Math.hypot(x - this.townPx.x, y - this.townPx.y);
    return Math.min(1, Math.max(0, (d - this.townPx.r) / this.dangerSpanPx));
  }

  /**
   * Bán kính (px) quanh tâm trấn mà ở đó `dangerAt = danger`: nghịch đảo của `dangerAt` theo khoảng cách.
   * Nơi vẽ vòng nguy hiểm (bản đồ nhỏ / lớn, mũi tên chỉ đường) gọi hàm này, không tự chép công thức.
   */
  dangerRadius(danger: number): number {
    return this.townPx.r + danger * this.dangerSpanPx;
  }
}

export const DEFAULT_MAP_ID = "lac_ha";
/** Bản đồ thứ hai: khu săn mạnh hơn, nối với Lạc Hà Trấn bằng cổng ở rìa phía bắc / nam. */
export const HAC_PHONG_ID = "hac_phong";
/** Bản đồ thứ ba (M6, #404): đầm lầy sương cho Kim Đan, nối với Hắc Phong Cốc bằng cổng ở rìa bắc / nam. */
export const AM_SUONG_ID = "am_suong";

/**
 * Danh sách bản đồ của game (docs/THIET_KE_NHIEU_BAN_DO.md). Toạ độ cổng (px) đã đối chiếu với ô sinh từ seed:
 * cổng nằm ở đầu mút con đường đất, ô xung quanh đi lại được (test giữ). Đổi seed / kích thước thì phải đặt lại cổng.
 */
export const MAPS: readonly MapDef[] = [
  {
    id: DEFAULT_MAP_ID,
    name: "Lạc Hà Trấn",
    seed: MAP_SEED,
    w: MAP_W,
    h: MAP_H,
    town: TOWN,
    townName: "Lạc Hà Trấn",
    wildName: "Vân Mộng Sơn",
    portals: [
      {
        id: "lac_ha_bac",
        name: "Bắc Môn Quan",
        x: 1536,
        y: 112,
        r: 64,
        safeR: 192,
        spawn: { x: 1536, y: 240 },
        toMap: HAC_PHONG_ID,
        toPortal: "hac_phong_nam",
      },
    ],
  },
  {
    id: HAC_PHONG_ID,
    name: "Hắc Phong Cốc",
    seed: 20261111,
    w: 128,
    h: 96,
    // Trạm an toàn nằm sát cổng phía nam: người mới tới thấy trạm trước, càng đi lên bắc càng nguy hiểm
    town: { cx: 64, cy: 84, r: 5 },
    townName: "Thanh Lộ Trạm",
    wildName: "Hắc Phong Cốc",
    portals: [
      {
        id: "hac_phong_nam",
        name: "Nam Môn Quan",
        x: 2112,
        y: 2960,
        r: 64,
        safeR: 192,
        spawn: { x: 2112, y: 2832 },
        toMap: DEFAULT_MAP_ID,
        toPortal: "lac_ha_bac",
      },
      // Cổng bắc (M6, #404): đầu mút đường đất phía bắc (ô 64-65, hàng 2-3), tâm ở giữa hai ô đường; tên khác "Bắc Môn Quan" của Lạc Hà
      {
        id: "hac_phong_bac",
        name: "Vọng Trạch Quan",
        x: 2080,
        y: 112,
        r: 64,
        safeR: 192,
        spawn: { x: 2080, y: 240 },
        toMap: AM_SUONG_ID,
        toPortal: "am_suong_nam",
      },
    ],
    // Tạm dùng các loại quái hiện có (không có Linh Thố); loại quái riêng của bản đồ thêm ở PR nội dung
    monsterCap: { lang: 20, ho: 36, mang: 6 },
  },
  {
    id: AM_SUONG_ID,
    name: "Âm Sương Trạch",
    // Seed chọn bằng cách quét 400 seed (server/src/balance/zz-scan, đã bỏ): đường nam tới sát rìa, liên thông 96% từ trạm, đủ chỗ cho từng loài
    // theo vùng nguy hiểm (sức chứa >= 300 lần số quái), nước + cát 20% (nhiều nhất bộ sinh ô cho phép)
    seed: 20261974,
    w: 128,
    h: 112,
    // Trạm an toàn ở phía nam, cách cổng ~10 ô: người mới tới thấy trạm trước, càng đi lên bắc càng nguy hiểm (như Hắc Phong Cốc)
    town: { cx: 64, cy: 98, r: 5 },
    townName: "Vọng Sương Trạm",
    wildName: "Âm Sương Trạch",
    portals: [
      {
        id: "am_suong_nam",
        name: "Hồi Phong Quan",
        // Đầu mút đường đất phía nam (ô 61-62, hàng 108), tâm ở giữa hai ô đường
        x: 1984,
        y: 3472,
        r: 64,
        safeR: 192,
        spawn: { x: 1984, y: 3344 },
        toMap: HAC_PHONG_ID,
        toPortal: "hac_phong_bac",
      },
    ],
    // Tổng 62 (Hắc Phong Cốc 62; trần ~70 để tick < 10 ms): số liệu quái ở game.ts (#403), vùng sinh theo `minDanger` của từng loài
    monsterCap: { suong_ho: 24, thach_quy: 18, doc_thiem: 18, hac_giao: 2 },
  },
];

/** Id bản đồ bí cảnh đầu tiên (docs/THIET_KE_BI_CANH.md). */
export const LINH_HU_MAP_ID = "bi_canh_linh_hu";

/**
 * Bản đồ bí cảnh: phòng tạm theo đội, KHÔNG có phòng thường (`defineRooms` chỉ đăng ký `MAPS`) và không bao giờ là chỗ
 * lưu của nhân vật. `getMap` vẫn tra được (client và server cùng dựng ô từ `seed`). Khu an toàn `town` là cổng vào ở
 * phía nam (`GameMap.townPx`: tâm + bán kính an toàn, không cần trường `entry` riêng); trùm ở hang phía bắc (`lair` ->
 * `GameMap.lairPx`). Không có cổng chuyển bản đồ: vào bằng NPC, ra khi hết run.
 */
export const DUNGEON_MAPS: readonly MapDef[] = [
  {
    id: LINH_HU_MAP_ID,
    kind: "dungeon",
    name: "Linh Hư Bí Cảnh",
    seed: 20261112,
    w: 64,
    h: 64,
    town: { cx: 32, cy: 56, r: 4 },
    townName: "Cổng Vào",
    wildName: "Linh Hư Bí Cảnh",
    // Hang trùm ở phía bắc, xa cổng vào ~47 ô (dangerAt = 1)
    lair: { cx: 32, cy: 9, r: 3 },
    // Quái nhỏ (dọn một lần, không hồi sinh ở bí cảnh) + đúng một trùm (`yeu_vuong`, game.ts)
    monsterCap: { lang: 12, ho: 10, yeu_vuong: 1 },
  },
];

export const MAP_BY_ID: Readonly<Record<string, MapDef>> = Object.fromEntries(
  [...MAPS, ...DUNGEON_MAPS].map((m) => [m.id, m]),
);

/** Bản đồ `id` là bí cảnh? Id lạ / sai kiểu là `false`. */
export function isDungeonMap(id: unknown): boolean {
  return (
    typeof id === "string" &&
    Object.prototype.hasOwnProperty.call(MAP_BY_ID, id) &&
    MAP_BY_ID[id].kind === "dungeon"
  );
}

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
