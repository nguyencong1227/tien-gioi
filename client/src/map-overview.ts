/**
 * Dữ liệu cho bản đồ nhỏ và bản đồ lớn (QUYET_DINH_M3 mục 17.2, issue #496 bước 1).
 *
 * Mô-đun THUẦN (không đụng DOM / Phaser / mạng) để test: từ `GameMap` + `MapDef` + bảng quái + bảng NPC dựng ra mọi thứ
 * lớp vẽ cần, để `WorldScene` / `ui.ts` chỉ còn việc tô màu và đặt nhãn:
 *  - `terrain`: loại ô (`T`) của CẢ bản đồ, 1 ô = 1 phần tử, và `terrainRGBA` hạ mẫu theo ĐỘ ƯU TIÊN (nước / đá / cây thắng cỏ)
 *    nên đường đất và nước vẫn thấy khi thu nhỏ (trung bình màu sẽ làm mất chúng). Dựng ảnh MỘT lần mỗi bản đồ rồi `putImageData`,
 *    đừng tô lại từng ô mỗi 250 ms;
 *  - `zones`: khu quái theo cấp, lấy từ quy tắc sinh quái THẬT của server (`systems/monsters.ts: spawnMonster`: số lượng > 0,
 *    `dangerAt >= minDanger`, ngoài khu an toàn, không trên ô chặn), KHÔNG chép số;
 *  - `portals` (kèm TÊN bản đồ đích), `npcs`, `town`, `lair`, `bosses`;
 *  - `mapGraph` / `mapGraphLayout`: sơ đồ nối các bản đồ ngoài từ `MAPS[].portals`.
 *
 * Mọi toạ độ là px của bản đồ đó (như `GameMap`); chia cho `TILE` để ra ô. Bản dựng được nhớ theo id bản đồ (bản đồ sinh theo
 * seed, bất biến), nên gọi lại không tốn.
 */
import {
  BLOCKING,
  DEFAULT_MAP_ID,
  MAP_BY_ID,
  MAPS,
  MONSTERS,
  REALMS,
  T,
  TILE,
  getMap,
  npcsOfMap,
  type GameMap,
  type MonsterKind,
  type PortalDef,
} from "@tien-gioi/shared";

/** Ô quanh cổng / trấn mà quái không sinh ra (khớp `spawnMonster`: `inSafe(x, y, 160)`). */
export const SPAWN_SAFE_PAD = 160;
/** Loài này chỉ sinh ở vùng ít nguy hiểm (khớp `spawnMonster`: Linh Thố `d > 0.45` bị bỏ). */
const TAME_KIND = "tho";
const TAME_MAX_DANGER = 0.45;

/** Một khu quái: vùng nơi loài MẠNH NHẤT sinh được là `kind` (các vòng đồng tâm theo độ nguy hiểm). */
export interface Zone {
  /** Loài mạnh nhất sinh ở vùng này */
  readonly kindId: string;
  readonly name: string;
  /** Cấp theo bậc người chơi (`MonsterKind.level`, `stepOf`) và nhãn đọc được ("Luyện Khí tầng 3", "Kim Đan sơ kỳ") */
  readonly level: number;
  readonly levelLabel: string;
  /** Mọi loài thường (không trùm) sinh được ở ít nhất một ô của vùng, cấp tăng dần */
  readonly kindIds: readonly string[];
  /** Số ô thuộc vùng */
  readonly cells: number;
  /** Chỗ đặt nhãn (px): một ô THUỘC vùng, gần trọng tâm nhất (vùng hình vòng thì trọng tâm có thể rơi ra ngoài) */
  readonly labelX: number;
  readonly labelY: number;
}

export interface PortalInfo {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly safeR: number;
  /** Bản đồ đích: id và TÊN (người chơi cần biết "Qua cổng đi đâu") */
  readonly toMapId: string;
  readonly toMapName: string;
  /** Tên cổng bên kia (cùng cặp) */
  readonly toPortalName: string;
  /** Hướng cổng so với tâm bản đồ: dùng đặt mũi tên / xếp sơ đồ */
  readonly dir: Dir;
}

export interface NpcInfo {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly x: number;
  readonly y: number;
}

export interface BossInfo {
  readonly kindId: string;
  readonly name: string;
  readonly level: number;
  readonly levelLabel: string;
  /** Số con tối đa ở bản đồ này */
  readonly cap: number;
}

export type Dir = "N" | "S" | "E" | "W";

export interface MapOverview {
  readonly mapId: string;
  readonly name: string;
  /** Kích thước bản đồ (ô) */
  readonly w: number;
  readonly h: number;
  /** Loại ô (`T`), hàng trước cột sau: `terrain[y * w + x]`. Sao chép từ `GameMap.tiles`, bất biến. */
  readonly terrain: Uint8Array;
  /** Chỉ số vùng quái của từng ô (`zones[zoneOfCell[i] - 1]`), 0 = không có quái sinh ở ô này */
  readonly zoneOfCell: Uint8Array;
  /** Khu quái, cấp tăng dần (chỉ số trùng `zoneOfCell - 1`) */
  readonly zones: readonly Zone[];
  readonly bosses: readonly BossInfo[];
  readonly portals: readonly PortalInfo[];
  readonly npcs: readonly NpcInfo[];
  /** Khu an toàn (trấn / trạm) hoặc `null` nếu bán kính 0 */
  readonly town: Readonly<{ x: number; y: number; r: number; name: string }> | null;
  readonly lair: Readonly<{ x: number; y: number; r: number }> | null;
}

/** Nhãn cấp quái / bậc: 0 Phàm Nhân, 1-9 Luyện Khí tầng N, rồi mỗi cảnh giới ba kỳ ("Trúc Cơ sơ kỳ"...). Ngoài thang trả "?". */
export function levelLabel(step: number): string {
  if (!Number.isInteger(step) || step < 0) return "?";
  let s = step;
  for (const r of REALMS) {
    if (s < r.tiers.length) {
      const t = r.tiers[s];
      return t ? `${r.name} ${t.toLowerCase()}` : r.name;
    }
    s -= r.tiers.length;
  }
  return "?";
}

function dirOf(x: number, y: number, worldW: number, worldH: number): Dir {
  const dx = x - worldW / 2;
  const dy = y - worldH / 2;
  // Cổng ở rìa: trục lệch nhiều hơn (theo tỉ lệ nửa kích thước) quyết định hướng
  if (Math.abs(dx) / worldW > Math.abs(dy) / worldH) return dx < 0 ? "W" : "E";
  return dy < 0 ? "N" : "S";
}

function spawnable(map: GameMap, kind: MonsterKind, x: number, y: number): boolean {
  const d = map.dangerAt(x, y);
  if (d < kind.minDanger || (kind.id === TAME_KIND && d > TAME_MAX_DANGER)) return false;
  return !map.inSafe(x, y, SPAWN_SAFE_PAD) && !map.circleBlocked(x, y, kind.radius);
}

function buildZones(map: GameMap): { zones: Zone[]; zoneOfCell: Uint8Array; bosses: BossInfo[] } {
  const { w, h } = map.def;
  // Loài thường sinh ở bản đồ này, cấp tăng dần (cùng cấp: minDanger tăng dần, rồi id để ổn định)
  const kinds = MONSTERS.filter((k) => !k.boss && map.monsterCapOf(k.id) > 0).sort(
    (a, b) => a.level - b.level || a.minDanger - b.minDanger || (a.id < b.id ? -1 : 1),
  );
  const n = kinds.length;
  const zoneOfCell = new Uint8Array(w * h);
  const area = new Array<number>(n).fill(0);
  const sumX = new Array<number>(n).fill(0);
  const sumY = new Array<number>(n).fill(0);
  // canIn[i][j]: loài j sinh được ở ít nhất một ô của vùng i
  const canIn = kinds.map(() => new Array<boolean>(n).fill(false));
  const can = new Array<boolean>(n).fill(false);

  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      let best = -1; // chỉ số trong `kinds` của loài mạnh nhất sinh được ở ô này
      for (let j = 0; j < n; j++) {
        can[j] = spawnable(map, kinds[j], cx, cy);
        if (can[j]) best = j; // `kinds` xếp cấp tăng dần nên loài sinh được cuối cùng là mạnh nhất
      }
      if (best < 0) continue;
      zoneOfCell[ty * w + tx] = best + 1;
      area[best]++;
      sumX[best] += cx;
      sumY[best] += cy;
      for (let j = 0; j < n; j++) if (can[j]) canIn[best][j] = true;
    }
  }

  // Chỉ giữ vùng thực sự có ô; đánh số lại để `zoneOfCell` liền mạch
  const remap = new Map<number, number>();
  const zones: Zone[] = [];
  for (let i = 0; i < n; i++) {
    if (area[i] === 0) continue;
    const k = kinds[i];
    const mx = sumX[i] / area[i];
    const my = sumY[i] / area[i];
    // Ô của vùng gần trọng tâm nhất
    let bx = mx;
    let by = my;
    let bd = Infinity;
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        if (zoneOfCell[ty * w + tx] !== i + 1) continue;
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        const d = (cx - mx) * (cx - mx) + (cy - my) * (cy - my);
        if (d < bd) {
          bd = d;
          bx = cx;
          by = cy;
        }
      }
    }
    zones.push({
      kindId: k.id,
      name: k.name,
      level: k.level,
      levelLabel: levelLabel(k.level),
      kindIds: kinds.filter((_, j) => canIn[i][j]).map((o) => o.id),
      cells: area[i],
      labelX: bx,
      labelY: by,
    });
    remap.set(i + 1, zones.length);
  }
  for (let i = 0; i < zoneOfCell.length; i++) {
    const z = zoneOfCell[i];
    if (z !== 0) zoneOfCell[i] = remap.get(z) ?? 0;
  }

  const bosses: BossInfo[] = MONSTERS.filter((k) => k.boss && map.monsterCapOf(k.id) > 0).map(
    (k) => ({
      kindId: k.id,
      name: k.name,
      level: k.level,
      levelLabel: levelLabel(k.level),
      cap: map.monsterCapOf(k.id),
    }),
  );
  return { zones, zoneOfCell, bosses };
}

function portalInfo(map: GameMap, p: PortalDef): PortalInfo {
  const to = MAP_BY_ID[p.toMap];
  const toPortal = to?.portals?.find((q) => q.id === p.toPortal);
  return {
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    safeR: p.safeR,
    toMapId: p.toMap,
    toMapName: to?.name ?? "?",
    toPortalName: toPortal?.name ?? "?",
    dir: dirOf(p.x, p.y, map.worldW, map.worldH),
  };
}

const cache = new Map<string, MapOverview>();

/** Dữ liệu tổng quan của bản đồ `mapId` (id lạ -> `undefined`). Được nhớ: bản đồ bất biến. */
export function getMapOverview(mapId: string): MapOverview | undefined {
  const hit = cache.get(mapId);
  if (hit) return hit;
  const map = getMap(mapId);
  if (!map) return undefined;
  const ov = buildMapOverview(map);
  cache.set(mapId, ov);
  return ov;
}

/** Dựng dữ liệu tổng quan từ một `GameMap` (không nhớ; dùng `getMapOverview` ở chỗ thường). */
export function buildMapOverview(map: GameMap): MapOverview {
  const { zones, zoneOfCell, bosses } = buildZones(map);
  const t = map.townPx;
  const lair = map.lairPx;
  return {
    mapId: map.def.id,
    name: map.def.name,
    w: map.def.w,
    h: map.def.h,
    terrain: Uint8Array.from(map.tiles),
    zoneOfCell,
    zones,
    bosses,
    portals: map.portals.map((p) => portalInfo(map, p)),
    npcs: npcsOfMap(map.def.id).map((n) => ({
      id: n.id,
      name: n.name,
      title: n.title,
      x: n.x,
      y: n.y,
    })),
    town: t.r > 0 ? { x: t.x, y: t.y, r: t.r, name: map.townName } : null,
    lair: lair ? { x: lair.x, y: lair.y, r: lair.r } : null,
  };
}

// ---------------------------------------------------------------- Địa hình -> ảnh

export type Rgb = readonly [number, number, number];

/**
 * Bảng màu địa hình TƯƠNG PHẢN cho bản đồ (nước xanh đậm, đá / núi xám sáng, cây xanh thẫm, đường đất vàng nâu sáng nổi trên cỏ,
 * nền trấn xám nhạt). Lớp vẽ có thể thay bằng màu theo `MAP_STYLES` miễn giữ độ tương phản (test giữ khoảng cách giữa nước / đường / cỏ).
 */
export const MAP_PALETTE: Readonly<Record<T, Rgb>> = {
  [T.Grass]: [78, 120, 62],
  [T.TallGrass]: [60, 98, 52],
  [T.Dirt]: [214, 178, 112],
  [T.Water]: [44, 98, 168],
  [T.Tree]: [28, 66, 40],
  [T.Rock]: [150, 150, 146],
  [T.Stone]: [196, 190, 176],
  [T.Sand]: [226, 208, 150],
};

/**
 * Độ ưu tiên khi hạ mẫu (số lớn thắng): thứ cản đường và thứ dẫn đường nổi hơn cỏ nền.
 * Nước > đá > cây > đường đất > nền trấn > cát > cỏ cao > cỏ.
 */
const TERRAIN_PRIORITY: Readonly<Record<T, number>> = {
  [T.Water]: 7,
  [T.Rock]: 6,
  [T.Tree]: 5,
  [T.Dirt]: 4,
  [T.Stone]: 3,
  [T.Sand]: 2,
  [T.TallGrass]: 1,
  [T.Grass]: 0,
};

/**
 * Ảnh địa hình RGBA (`outW * outH * 4` byte, dùng cho `new ImageData(rgba, outW, outH)`): mỗi điểm ảnh gom một khối ô của bản đồ
 * và lấy loại ô có ĐỘ ƯU TIÊN cao nhất trong khối (không trung bình: đường đất mảnh vẫn hiện khi thu nhỏ). `outW` / `outH` nên giữ
 * tỉ lệ `w:h` của bản đồ (`overviewSize`). Không cấp phát gì ngoài mảng kết quả.
 */
export function terrainRGBA(
  ov: Pick<MapOverview, "terrain" | "w" | "h">,
  outW: number,
  outH: number,
  palette: Readonly<Record<T, Rgb>> = MAP_PALETTE,
): Uint8ClampedArray {
  if (!(Number.isInteger(outW) && outW > 0 && Number.isInteger(outH) && outH > 0))
    throw new Error(`terrainRGBA: kích thước ảnh không hợp lệ (${outW}x${outH})`);
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let py = 0; py < outH; py++) {
    const y0 = Math.floor((py * ov.h) / outH);
    const y1 = Math.max(y0 + 1, Math.floor(((py + 1) * ov.h) / outH));
    for (let px = 0; px < outW; px++) {
      const x0 = Math.floor((px * ov.w) / outW);
      const x1 = Math.max(x0 + 1, Math.floor(((px + 1) * ov.w) / outW));
      let best: T = T.Grass;
      let bestP = -1;
      for (let y = y0; y < y1 && y < ov.h; y++) {
        for (let x = x0; x < x1 && x < ov.w; x++) {
          const tile = ov.terrain[y * ov.w + x] as T;
          const p = TERRAIN_PRIORITY[tile] ?? 0;
          if (p > bestP) {
            bestP = p;
            best = tile;
          }
        }
      }
      const c = palette[best] ?? palette[T.Grass];
      const o = (py * outW + px) * 4;
      out[o] = c[0];
      out[o + 1] = c[1];
      out[o + 2] = c[2];
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Kích thước ảnh vừa khung `maxW x maxH` mà giữ tỉ lệ bản đồ (số nguyên >= 1). */
export function overviewSize(
  ov: Pick<MapOverview, "w" | "h">,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  const s = Math.min(maxW / ov.w, maxH / ov.h);
  return { w: Math.max(1, Math.floor(ov.w * s)), h: Math.max(1, Math.floor(ov.h * s)) };
}

/** Ô có chặn đường không (nước / cây / đá): lớp vẽ dùng để chọn chỗ đặt nhãn tránh ô chặn. */
export function isBlockingTerrain(tile: number): boolean {
  return BLOCKING.has(tile as T);
}

// ---------------------------------------------------------------- Sơ đồ nối bản đồ

export interface GraphNode {
  readonly mapId: string;
  readonly name: string;
  /** Toạ độ lưới của sơ đồ: Bắc = y giảm, Đông = x tăng; bản đồ gốc (Lạc Hà) ở (0, 0) */
  readonly gx: number;
  readonly gy: number;
}

export interface GraphEdge {
  readonly fromMapId: string;
  readonly toMapId: string;
  /** Cổng ở bên `from` và cổng ở bên `to` (tên hiện trên sơ đồ) */
  readonly fromPortalId: string;
  readonly toPortalId: string;
  readonly fromPortalName: string;
  readonly toPortalName: string;
  /** Hướng rời bản đồ `from` qua cổng này */
  readonly dir: Dir;
}

export interface MapGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

const STEP: Readonly<Record<Dir, readonly [number, number]>> = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
};

/**
 * Sơ đồ nối các bản đồ ngoài (`MAPS`, không có bí cảnh): mỗi cặp cổng là MỘT cạnh (liệt kê theo từng chiều: mỗi cặp hai cạnh `A->B`, `B->A`).
 * Xếp ô lưới bằng cách đi từ Lạc Hà theo HƯỚNG cổng (cổng ở rìa bắc thì bản đồ bên kia nằm phía trên); ô đã có bản đồ khác thì
 * dịch thêm một bước cùng hướng để không chồng. Toàn bộ lấy từ `MAPS[].portals`, không chép tay.
 */
export function mapGraph(): MapGraph {
  const edges: GraphEdge[] = [];
  for (const def of MAPS) {
    const map = getMap(def.id);
    if (!map) continue;
    for (const p of map.portals) {
      const to = MAP_BY_ID[p.toMap];
      const back = to?.portals?.find((q) => q.id === p.toPortal);
      if (!to || !back) continue;
      edges.push({
        fromMapId: def.id,
        toMapId: p.toMap,
        fromPortalId: p.id,
        toPortalId: p.toPortal,
        fromPortalName: p.name,
        toPortalName: back.name,
        dir: dirOf(p.x, p.y, map.worldW, map.worldH),
      });
    }
  }

  const pos = new Map<string, [number, number]>();
  const taken = new Set<string>();
  const place = (id: string, gx: number, gy: number) => {
    pos.set(id, [gx, gy]);
    taken.add(`${gx},${gy}`);
  };
  place(DEFAULT_MAP_ID, 0, 0);
  const queue = [DEFAULT_MAP_ID];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const [cx, cy] = pos.get(cur)!;
    for (const e of edges) {
      if (e.fromMapId !== cur || pos.has(e.toMapId)) continue;
      const [dx, dy] = STEP[e.dir];
      let gx = cx + dx;
      let gy = cy + dy;
      while (taken.has(`${gx},${gy}`)) {
        gx += dx;
        gy += dy;
      }
      place(e.toMapId, gx, gy);
      queue.push(e.toMapId);
    }
  }
  const nodes: GraphNode[] = [];
  for (const def of MAPS) {
    const p = pos.get(def.id);
    if (p) nodes.push({ mapId: def.id, name: def.name, gx: p[0], gy: p[1] });
  }
  return { nodes, edges };
}
