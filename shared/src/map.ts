// Bản đồ sinh tất định từ seed: client và server sinh ra cùng một bản đồ,
// nên không phải gửi dữ liệu bản đồ qua mạng.
import { MONSTER_BY_ID, MONSTER_CAP, PLAYER_RADIUS } from "./game";
import { mapDefFromTiled } from "./tiled";

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
/** Số trùm (quái `boss: true`) SINH SẴN tối đa mỗi bản đồ (QUYET_DINH_M3 mục 55 / 56); `MapDef` kiểm lúc dựng (`checkMonsterCap`). Không tính trùm sự kiện thế giới, quái con trùm triệu hồi, đối thủ chặn đường. */
export const MAX_BOSSES_PER_MAP = 6;

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

/**
 * Vùng sinh quái / trùm theo DỮ LIỆU (docs/THIET_KE_BAN_DO_TILED.md mục 4 và 6, lát cắt S5): chữ nhật hoặc elip trong khung `x, y, w, h` (px thế giới; `x, y` là GÓC TRÊN TRÁI của khung
 * như Tiled ghi, không phải tâm). Loài `monster` chỉ sinh trong các vùng của nó khi bản đồ khai; bản đồ không khai vùng cho loài nào thì loài đó sinh theo cách cũ (`dangerAt` + `minDanger`).
 */
export interface SpawnZoneDef {
  /** `MonsterKind.id` */
  readonly monster: string;
  readonly shape: "rect" | "ellipse";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Số con CÙNG loài tối đa đang sống trong vùng này (số nguyên >= 1); bỏ trống thì vùng không tự giới hạn (vẫn theo `monsterCap` của bản đồ) */
  readonly max?: number;
}

const NO_ZONES: readonly SpawnZoneDef[] = [];

/** (x, y) có nằm trong vùng không (elip: phương trình chuẩn trên khung; chữ nhật: khung kín ở cạnh trên / trái, hở ở cạnh dưới / phải). */
export function inSpawnZone(z: SpawnZoneDef, x: number, y: number): boolean {
  if (z.shape === "rect") return x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h;
  const rx = z.w / 2;
  const ry = z.h / 2;
  const dx = (x - (z.x + rx)) / rx;
  const dy = (y - (z.y + ry)) / ry;
  return dx * dx + dy * dy <= 1;
}

/** Mô tả một bản đồ: client và server cùng sinh ô từ `seed`, không gửi dữ liệu bản đồ qua mạng. */
export interface MapDef {
  readonly id: string;
  /**
   * Loại bản đồ: `world` (mặc định: một phòng sống mãi, nhiều người), `dungeon` (bí cảnh: phòng tạm của MỘT đội,
   * docs/THIET_KE_BI_CANH.md) hoặc `arena` (đấu trường chặn đường: phòng tạm của MỘT người, docs/THIET_KE_CHAN_DUONG.md).
   * Bản đồ `dungeon` / `arena` KHÔNG nằm trong `MAPS` (không có phòng thường) mà ở `DUNGEON_MAPS` / `ARENA_MAPS`;
   * khu an toàn `town` của `dungeon` là cổng vào, còn `arena` KHÔNG có khu an toàn (`inTown` / `inSafe` luôn `false`: không đứng
   * chỗ nào để né kẻ chặn đường hay hồi nhanh; `town` chỉ là chỗ đứng lúc vào, trải đá cho đẹp).
   */
  readonly kind?: "world" | "dungeon" | "arena";
  /** Chỉ `arena`: id bản đồ thường mà đấu trường này dựng cho (trang trí theo vùng; chỗ về sau trận là chỗ cũ trên bản đồ đó). */
  readonly arenaFor?: string;
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
   * Hang trùm (bí cảnh) / chỗ kẻ địch đứng lúc bắt đầu (đấu trường chặn đường): ô tâm (số nguyên) và bán kính (ô). Trùm sinh ra ĐÚNG ở tâm hang (server: PR 4b/4c), nền trong
   * bán kính được san thành đất (`T.Dirt`) nên luôn đi lại được. Client vẽ dấu hang trên bản đồ nhỏ từ `GameMap.lairPx`
   * thay vì chép toạ độ. Bỏ trống là bản đồ không có hang cố định.
   */
  readonly lair?: Readonly<{ cx: number; cy: number; r: number }>;
  /**
   * Số quái tối đa mỗi loại (khoá là `MonsterKind.id`, loại không có khoá thì không sinh ra ở bản đồ này).
   * Bỏ trống thì dùng `MONSTER_CAP` (như Lạc Hà Trấn từ trước tới giờ).
   */
  readonly monsterCap?: Readonly<Record<string, number>>;
  /** Vùng sinh quái theo dữ liệu (từ đối tượng `spawnZone` của tệp Tiled); bỏ trống là bản đồ sinh quái theo cách cũ (`dangerAt`) */
  readonly spawnZones?: readonly SpawnZoneDef[];
  /**
   * Ô DỰNG SẴN (loại ô `T`, đúng `w * h`, hàng trước cột sau) từ tệp Tiled (`mapDefFromTiled`, docs/THIET_KE_BAN_DO_TILED.md). Có thì `GameMap` dùng đúng các ô này
   * (đã gồm trấn, đường, hang: tệp là nguồn duy nhất) và KHÔNG sinh theo `seed`; không có thì sinh theo `seed` như trước.
   */
  readonly tiles?: Uint8Array;
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
  /** Vùng sinh quái theo dữ liệu (rỗng nếu bản đồ không khai: sinh theo cách cũ). Dùng `spawnZonesOf` để tra theo loài. */
  readonly spawnZones: readonly SpawnZoneDef[];
  /** Vùng sinh gom theo loài (dựng một lần: `spawnZonesOf` không cấp phát mỗi lần gọi) */
  private readonly zonesByMonster = new Map<string, SpawnZoneDef[]>();
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
    if (def.tiles) {
      if (def.tiles.length !== def.w * def.h)
        throw new Error(
          `MapDef ${def.id}: tiles có ${def.tiles.length} ô, cần ${def.w * def.h} (w * h)`,
        );
      for (let i = 0; i < def.tiles.length; i++)
        if (def.tiles[i]! > T.Sand)
          throw new Error(`MapDef ${def.id}: tiles[${i}] = ${def.tiles[i]} không phải loại ô T`);
      this.tiles = Uint8Array.from(def.tiles); // chép: sửa mảng nguồn sau đó không làm đổi va chạm
    } else this.tiles = generate(def);
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
    this.spawnZones = def.spawnZones ?? [];
    this.lairPx = def.lair
      ? { x: def.lair.cx * TILE, y: def.lair.cy * TILE, r: def.lair.r * TILE }
      : undefined;
    this.checkLair();
    this.checkPortals();
    this.checkMonsterCap();
    this.checkSpawnZones();
    for (const z of this.spawnZones) {
      const list = this.zonesByMonster.get(z.monster);
      if (list) list.push(z);
      else this.zonesByMonster.set(z.monster, [z]);
    }
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
    let bosses = 0;
    for (const [id, n] of Object.entries(this.monsterCap)) {
      if (!Object.prototype.hasOwnProperty.call(MONSTER_BY_ID, id))
        throw new Error(`MapDef ${this.def.id}: monsterCap có loại quái lạ "${id}"`);
      if (!Number.isInteger(n) || n < 0)
        throw new Error(`MapDef ${this.def.id}: monsterCap.${id} phải là số nguyên >= 0 (${n})`);
      if (MONSTER_BY_ID[id]!.boss) bosses += n;
    }
    // LUẬT CHUNG (QUYET_DINH_M3 mục 55 / 56): tối đa `MAX_BOSSES_PER_MAP` trùm sinh sẵn mỗi bản đồ (quái `boss: true` trong `monsterCap`). Không tính trùm sự kiện thế giới,
    // quái con trùm triệu hồi, đối thủ chặn đường (phòng solo): ba thứ đó không nằm trong `monsterCap`.
    if (bosses > MAX_BOSSES_PER_MAP)
      throw new Error(
        `MapDef ${this.def.id}: ${bosses} trùm sinh sẵn vượt giới hạn ${MAX_BOSSES_PER_MAP} mỗi bản đồ (monsterCap)`,
      );
  }

  /**
   * Vùng sinh sai (loài lạ, số không hữu hạn, khung rỗng, tràn ra ngoài bản đồ hay đè viền núi, `max` không phải số nguyên >= 1): báo ngay khi dựng bản đồ. Chỗ đứng có hợp lệ thật hay không
   * (ô chặn, khu an toàn, liên thông) là việc của `spawnZoneViolations` ở server, kiểm trên dữ liệu thật.
   */
  private checkSpawnZones() {
    this.spawnZones.forEach((z, i) => {
      const at = `MapDef ${this.def.id}: vùng sinh #${i + 1}`;
      if (!Object.prototype.hasOwnProperty.call(MONSTER_BY_ID, z.monster))
        throw new Error(`${at}: loại quái lạ "${String(z.monster)}"`);
      if (z.shape !== "rect" && z.shape !== "ellipse")
        throw new Error(`${at}: shape phải là rect hoặc ellipse`);
      for (const [f, v] of [
        ["x", z.x],
        ["y", z.y],
        ["w", z.w],
        ["h", z.h],
      ] as const)
        if (!Number.isFinite(v)) throw new Error(`${at}: ${f} phải là số hữu hạn (${v})`);
      if (!(z.w >= TILE) || !(z.h >= TILE))
        throw new Error(`${at}: khung phải rộng / cao ít nhất một ô (${TILE} px)`);
      // Viền bản đồ là núi đá một ô: vùng nằm gọn trong phần còn lại
      if (
        z.x < TILE ||
        z.y < TILE ||
        z.x + z.w > this.worldW - TILE ||
        z.y + z.h > this.worldH - TILE
      )
        throw new Error(`${at}: không nằm gọn trong bản đồ (bỏ viền một ô)`);
      if (z.max !== undefined && (!Number.isInteger(z.max) || z.max < 1))
        throw new Error(`${at}: max phải là số nguyên >= 1 (${z.max})`);
    });
  }

  /** Các vùng sinh của loài `id` (rỗng: bản đồ không khai vùng cho loài này, sinh theo cách cũ). Id lạ cũng rỗng. */
  spawnZonesOf(id: string): readonly SpawnZoneDef[] {
    return this.zonesByMonster.get(id) ?? NO_ZONES;
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
    if (this.def.kind === "arena") return false; // đấu trường chặn đường không có khu an toàn
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
    if (this.def.kind === "arena") return false; // không hồi nhanh / không tính là trấn
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
/** Bản đồ thứ tư (M7.5, #506): băng nguyên cho Nguyên Anh, nối với Âm Sương Trạch bằng cổng ở rìa bắc / nam. */
export const HAN_VAN_ID = "han_van";

/**
 * ĐỊNH NGHĨA SINH THEO `seed` của bốn bản đồ thường: nguồn gốc cũ, nay là "đồng hồ chuẩn" của test và đầu vào của công cụ `npm run map:bake -w server`
 * (sinh ra `shared/maps/<id>.logic.json`). Trò chơi KHÔNG dựng bản đồ từ đây mà từ `MAPS` (đọc tệp); đấu trường chặn đường vẫn lấy `seed` / tên từ đây.
 * Toạ độ cổng (px) đã đối chiếu với ô sinh từ seed: cổng nằm ở đầu mút con đường đất, ô xung quanh đi lại được (test giữ). Đổi seed / kích thước thì phải đặt lại cổng.
 * Khi một bản đồ đầu tiên được sửa TAY (lát cắt S6), nó ra khỏi danh sách này (tệp thành nguồn duy nhất) và test "đồng hồ chuẩn" của nó bị gỡ.
 */
export const PROCEDURAL_MAPS: readonly MapDef[] = [
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
      // Cổng bắc (M7.5, #506): đầu mút đường đất phía bắc (ô 66-67, hàng 3-4; đường lượn nhẹ nên hàng 2 và 5-7 lệch sang 67-68), tâm ở giữa hai ô đường ở hàng 3. Seed của Âm Sương KHÔNG đổi (ô giữ nguyên, tệp lưu
      // vẫn hợp lệ); chỉ thêm khu an toàn bán kính 192 px quanh cổng ở rìa bắc, nên quái sinh sau này tránh vùng đó (vị trí sinh ngẫu nhiên khác trước).
      {
        id: "am_suong_bac",
        name: "Lăng Hàn Quan",
        x: 2144,
        y: 112,
        r: 64,
        safeR: 192,
        spawn: { x: 2144, y: 240 },
        toMap: HAN_VAN_ID,
        toPortal: "han_van_nam",
      },
    ],
    // Tổng 66 (Hắc Giao 6, mục 56; trần ~70 để tick < 10 ms): số liệu quái ở game.ts (#403), vùng sinh theo `minDanger` của từng loài
    monsterCap: { suong_ho: 24, thach_quy: 18, doc_thiem: 18, hac_giao: 6 },
  },
  {
    id: HAN_VAN_ID,
    name: "Hàn Vân Lĩnh",
    // Seed chọn bằng cách quét 300 seed (20262000-20262299; công cụ quét tạm, đã bỏ): đường nam tới sát rìa (hai ô đường ở hàng 124), liên thông 97,8 % từ trạm,
    // nước + cát chỉ ~7,6 % (băng nguyên thoáng, nhiều cỏ và cây), sức chứa quái theo dải nguy hiểm >= 500 lần số quái dự kiến (62 con ở cổng M7.5b)
    seed: 20262122,
    w: 128,
    h: 128,
    // Trạm an toàn ở phía nam, cách cổng ~10 ô: người mới tới thấy trạm trước, càng đi lên bắc càng nguy hiểm (như Âm Sương Trạch)
    town: { cx: 64, cy: 114, r: 5 },
    townName: "Hàn Vân Trạm",
    wildName: "Hàn Vân Lĩnh",
    portals: [
      {
        id: "han_van_nam",
        name: "Hồi Sương Quan",
        // Đầu mút đường đất phía nam (ô 63-64, hàng 124-125), tâm ở giữa hai ô đường
        x: 2048,
        y: 3984,
        r: 64,
        safeR: 192,
        spawn: { x: 2048, y: 3856 },
        toMap: AM_SUONG_ID,
        toPortal: "am_suong_bac",
      },
      { id: "han_van_bac", name: "Vọng Lang Quan", x: 1920, y: 112, r: 64, safeR: 192, spawn: { x: 1904, y: 240 }, toMap: "lang_hoang", toPortal: "lang_hoang_nam" },
    ],
    // Bốn loài Nguyên Anh + trùm Thiên Hàn Vương (M7.5b, #506). Tổng 62 (như Hắc Phong Cốc / Âm Sương Trạch; trần ~70 để tick < 10 ms): số liệu quái ở
    // game.ts, vùng sinh theo `minDanger` của từng loài (0,2 / 0,4 / 0,55 / 0,7 / 0,85)
    monsterCap: { han_lang: 20, phong_nha: 16, cot_tuong: 12, doc_tuoc: 12, thien_han_vuong: 2 },
  },
  {
    id: "lang_hoang", name: "Lang Hoang", seed: 20264331, w: 128, h: 112, town: { cx: 64, cy: 98, r: 5 }, townName: "Tuyết Đao Quan", wildName: "Lang Hoang",
    portals: [
      { id: "lang_hoang_nam", name: "Hồi Tuyết Quan", x: 2080, y: 3472, r: 64, safeR: 192, spawn: { x: 2080, y: 3344 }, toMap: HAN_VAN_ID, toPortal: "han_van_bac" },
      { id: "lang_hoang_bac", name: "Vọng Kinh Quan", x: 2112, y: 112, r: 64, safeR: 192, spawn: { x: 2096, y: 240 }, toMap: "uy_van", toPortal: "uy_van_nam" },
    ],
    monsterCap: { han_lang: 20, phong_nha: 16 },
  },
  {
    id: "uy_van", name: "Uy Vân Kinh", seed: 20267448, w: 128, h: 112, town: { cx: 64, cy: 98, r: 5 }, townName: "Uy Vân Kinh", wildName: "Huyết Trận Uy Vân",
    portals: [{ id: "uy_van_nam", name: "Hồi Lang Quan", x: 2048, y: 3472, r: 64, safeR: 192, spawn: { x: 2048, y: 3344 }, toMap: "lang_hoang", toPortal: "lang_hoang_bac" }],
    monsterCap: { han_lang: 20, phong_nha: 16 },
  },
];

/**
 * Danh sách bản đồ thường của game (docs/THIET_KE_NHIEU_BAN_DO.md). Ban đầu là các định nghĩa sinh theo `seed` (`PROCEDURAL_MAPS`); `adoptTiledMaps` (bên dưới) thay từng mục bằng bản
 * dựng từ TỆP Tiled (`shared/maps/<id>.logic.json`, docs/THIET_KE_BAN_DO_TILED.md mục 4a): cùng id / thứ tự, cùng ô / cổng / trấn từng byte (test `tiled-maps.test.ts`). SERVER nhận tệp lúc
 * `defineRooms` (xem `shared/src/map-files.ts`); CLIENT cũng nhận tệp (S3a): `client/src/game-modules.ts` gọi `adoptTiledMapFiles()` khi chunk game tải xong, TRƯỚC khi dựng `WorldScene`, nên hai bên dựng bản đồ từ CÙNG tệp (từ S6 tệp sửa tay khác `seed`); 4 tệp ~16 KB gzip KHÔNG nằm trong gói KHỞI ĐỘNG.
 * Mảng này được SỬA TẠI CHỖ bởi `adoptTiledMaps`: giữ tham chiếu `MAPS` thì thấy bản mới.
 */
const worldDefs: MapDef[] = [...PROCEDURAL_MAPS];
export const MAPS: readonly MapDef[] = worldDefs;

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

/** Id đấu trường chặn đường dựng cho bản đồ thường `mapId` (một đấu trường mỗi bản đồ để trang trí theo vùng). */
export function arenaMapIdOf(mapId: string): string {
  return `arena_${mapId}`;
}

/**
 * Đấu trường CHẶN ĐƯỜNG (docs/THIET_KE_CHAN_DUONG.md mục 5): phòng tạm của MỘT người, nhỏ (32x32 ô), một cái cho mỗi bản đồ thường (cùng vùng, hạt giống khác).
 * Không có khu an toàn (xem `MapDef.kind`), không cổng, không quái sinh tự nhiên (`monsterCap` rỗng: kẻ chặn đường do server đặt). Người chơi vào ở phía nam
 * (`townPx`), kẻ địch phía bắc / giữa. `getMap` tra được (client và server cùng dựng ô từ `seed`); `defineRooms` chỉ đăng ký `MAPS` nên phòng do server mở (CD3).
 */
export const ARENA_MAPS: readonly MapDef[] = PROCEDURAL_MAPS.map((m) => ({
  id: arenaMapIdOf(m.id),
  kind: "arena",
  arenaFor: m.id,
  name: `Đấu Trường ${m.wildName ?? m.name}`,
  seed: (m.seed + 7919) >>> 0,
  w: 32,
  h: 32,
  town: { cx: 16, cy: 27, r: 2 },
  townName: "Chỗ Đứng",
  wildName: m.wildName ?? m.name,
  // Chỗ kẻ địch đứng lúc bắt đầu: nền san phẳng thành đất (đi lại được), phía bắc, xa chỗ đứng của người chơi (~17 ô)
  lair: { cx: 16, cy: 10, r: 5 },
  monsterCap: {},
}));

const mapById: Record<string, MapDef> = Object.fromEntries(
  [...MAPS, ...DUNGEON_MAPS, ...ARENA_MAPS].map((m) => [m.id, m]),
);
export const MAP_BY_ID: Readonly<Record<string, MapDef>> = mapById;

/** Bản đồ `id` là đấu trường chặn đường? Id lạ / sai kiểu là `false`. */
export function isArenaMap(id: unknown): boolean {
  return (
    typeof id === "string" &&
    Object.prototype.hasOwnProperty.call(MAP_BY_ID, id) &&
    MAP_BY_ID[id].kind === "arena"
  );
}

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
 * Nhận TỆP Tiled cho các bản đồ thường: với mỗi `id` -> JSON, dựng `MapDef` bằng `mapDefFromTiled` (ném lỗi gom MỌI vi phạm nếu tệp sai, hoặc `id` không phải bản đồ thường / lệch id trong tệp)
 * và thay bản định nghĩa cũ ở `MAPS` / `MAP_BY_ID`, bỏ `GameMap` đã nhớ của id đó (lần `getMap` sau dựng từ tệp). Gọi MỘT lần lúc khởi động, TRƯỚC khi ai dùng `getMap(id)` của các id này.
 * Chưa gọi thì mọi thứ vẫn là bản sinh theo `seed` (cùng từng byte ở S2, nên gọi sớm hay muộn không đổi kết quả hiện nay; khi tệp bị sửa tay ở S6 thì PHẢI nhận trước khi dùng). Trả danh sách id đã nhận.
 */
export function adoptTiledMaps(sources: Readonly<Record<string, unknown>>): string[] {
  const done: string[] = [];
  for (const [id, src] of Object.entries(sources)) {
    const idx = worldDefs.findIndex((d) => d.id === id);
    if (idx < 0) throw new Error(`adoptTiledMaps: '${id}' không phải bản đồ thường`);
    const def = mapDefFromTiled(src, TILE);
    if (def.id !== id) throw new Error(`adoptTiledMaps: tệp của '${id}' khai id '${def.id}'`);
    worldDefs[idx] = def;
    mapById[id] = def;
    mapCache.delete(id);
    done.push(id);
  }
  return done;
}

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

/**
 * Bản đồ mặc định (Lạc Hà Trấn) DỰNG MỘT LẦN lúc nạp module (từ `seed`). SAU `adoptTiledMaps` (server nhận tệp ở `defineRooms`) `getMap(DEFAULT_MAP_ID)` là bản dựng từ TỆP và KHÁC đối tượng này
 * (cùng từng byte ở S2, nhưng khi tệp Lạc Hà bị sửa tay ở S6 thì `DEFAULT_MAP` là bản CŨ). Vì vậy mã nguồn server / client KHÔNG được nhập `DEFAULT_MAP` (test `no-global-map-imports` canh):
 * dùng `getMap(DEFAULT_MAP_ID)!` (hoặc `world.map` / `scene.map`). Chỉ còn cho các test cũ và cho tên cũ bên dưới.
 * @deprecated dùng `getMap(DEFAULT_MAP_ID)!`.
 */
export const DEFAULT_MAP: GameMap = getMap(DEFAULT_MAP_ID)!;

// ---- Tên cũ: trỏ tới bản đồ mặc định, giữ để chuyển dần sang `GameMap` (#123). Các HÀM tra `getMap(DEFAULT_MAP_ID)` mỗi lần gọi (theo bản đã nhận tệp); `MAP_TILES` là ảnh chụp lúc nạp module ----

/** @deprecated ảnh chụp lúc nạp module (bản sinh theo seed): dùng `getMap(DEFAULT_MAP_ID)!.tiles`. */
export const MAP_TILES = DEFAULT_MAP.tiles;

export function tileAt(tx: number, ty: number): T {
  return getMap(DEFAULT_MAP_ID)!.tileAt(tx, ty);
}

export function isBlockedPx(x: number, y: number): boolean {
  return getMap(DEFAULT_MAP_ID)!.isBlockedPx(x, y);
}

/** Kiểm tra hình tròn bán kính r có chạm ô chặn không. */
export function circleBlocked(x: number, y: number, r: number): boolean {
  return getMap(DEFAULT_MAP_ID)!.circleBlocked(x, y, r);
}

/** Di chuyển có trượt theo tường (tách trục X/Y). Dùng chung client và server. */
export function moveWithCollision(x: number, y: number, dx: number, dy: number, r: number) {
  return getMap(DEFAULT_MAP_ID)!.moveWithCollision(x, y, dx, dy, r);
}

export function inTown(x: number, y: number, pad = 0): boolean {
  return getMap(DEFAULT_MAP_ID)!.inTown(x, y, pad);
}

/** Độ nguy hiểm theo khoảng cách tới trấn: 0..1 */
export function dangerAt(x: number, y: number): number {
  return getMap(DEFAULT_MAP_ID)!.dangerAt(x, y);
}
