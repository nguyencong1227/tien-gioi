// Đo thời gian TÌM quái bằng mã server thật (#406 mục 7): phần mà `hunt-check.ts` ghi rõ là "không kiểm".
// Mô hình (`simulate.ts`) giả định `ASSUME.searchSec[loài]` giây từ lúc hạ con này tới lúc chạm con kế tiếp. Ở đây dựng một `World` thật
// (bản đồ thật, quái sinh bằng `spawnInitial`, hồi sinh bằng `topUpMonsters` mỗi MONSTER_RESPAWN_MS, AI quái thật gồm phát hiện + đuổi)
// và cho MỘT thợ săn đi săn đúng một loài: luôn tới con GẦN NHẤT THEO ĐƯỜNG ĐI (Dijkstra trên lưới ô, tránh tường / nước), tới tầm thì
// đánh `slash` thật tới khi hết con trong tầm. Thợ săn bất tử (khí huyết được đặt lại mỗi tick): chỉ đo đi lại, không đo sống chết.
//
// Đây là CẬN DƯỚI của thời gian tìm quái: người thật do dự, nhìn bản đồ, đả tọa, bị quái khác chặn; không có người tranh quái.
// Nên: đo <= giả định thì giả định là hợp lý (có chỗ cho người thật); đo > giả định x 1,25 thì mô hình LẠC QUAN và phải sửa `ASSUME.searchSec`.
// Không kiểm: nhiều người tranh cùng đàn quái, người thật (cần bot: #410).
import {
  MAPS,
  MONSTERS,
  MONSTER_BY_ID,
  MONSTER_RESPAWN_MS,
  PLAYER_RADIUS,
  SKILLS,
  TICK_MS,
  TILE,
  getMap,
  statsFor,
  type GameMap,
} from "@tien-gioi/shared";
import { slash } from "../systems/combat";
import { setEquipment } from "../systems/equipment";
import { safeSpot, syncPublicPos } from "../systems/movement";
import { tickMonsters, spawnInitial, topUpMonsters } from "../systems/monsters";
import { applyStats } from "../systems/progression";
import { addPlayer, makeWorld } from "../systems/test-helpers";
import { ASSUME, bestGear, minutesToFinish, simulate } from "./simulate";
import { median, seeded } from "./hunt-check";
import { KIM_DAN_MONSTER_IDS, rateWithPills, withKimDan } from "./kim-dan-sau";

/** Số lần hạ đầu bỏ đi (đi từ trấn ra bãi, chưa phải trạng thái ổn định) */
const WARM_KILLS = 2;
/** Số hạt giống (mỗi hạt giống một cách rải quái khác nhau) */
export const SEARCH_SEEDS = 3;
/** Quái "trùm" (Xích Mãng, Hắc Giao) chỉ 2-6 con trên cả bản đồ nên thời gian tìm phụ thuộc mạnh vào chỗ chúng được rải: nhiều hạt giống hơn (B đo ở #459: 3 hạt giống ra 30,5 s, 12 hạt giống ra 37,8 s cho Xích Mãng ở Lạc Hà, tầm nhìn 640 px) */
export const SEARCH_SEEDS_BOSS = 12;
/** Số lần hạ tính mỗi hạt giống (loài thường / trùm: trùm mỗi trận rất dài nên ít lần hơn) */
export const SEARCH_KILLS = 12;
export const SEARCH_KILLS_BOSS = 6;
/** Chạy tối đa (giây mô phỏng) mỗi hạt giống, phòng quái hết sạch */
const MAX_SECONDS = 3 * 3600;
/** Tính lại đường đi mỗi bấy nhiêu tick (1 giây) */
const REPLAN_TICKS = 20;
/** Bước thẳng tới con quái khi đã hết đường tính và còn cách nó không quá chừng này (px, ~3 ô) */
const FINAL_APPROACH_PX = 100;

// --- Vùng nhìn ---------------------------------------------------------------------------------------------------------

/** Vùng nhìn CHỮ NHẬT quanh người chơi: nửa rộng / nửa cao (px thế giới). Vô hạn = biết vị trí MỌI con trên bản đồ. */
export interface SearchView {
  hw: number;
  hh: number;
}

/**
 * Bản sao luật `fitZoom` của client (`client/src/gfx/scale.ts`; server không import client): zoom cơ sở theo cạnh ngắn, kẹp 0,75-1,3,
 * rồi nâng lên đủ để vùng nhìn nằm gọn trong 1900 x 1100 px thế giới. Vùng nhìn thật = kích thước màn hình CSS / zoom (đổi luật bên
 * client thì cập nhật cả ở đây; test giữ ba cỡ chuẩn dưới).
 */
function fitZoom(cssW: number, cssH: number): number {
  const minZoom = Math.max(0.75, cssW / 1900, cssH / 1100);
  const base = Math.min(1.3, Math.max(0.75, Math.min(cssW, cssH) / 640));
  return Math.max(base, minZoom);
}

/** Vùng nhìn của màn hình CSS `cssW` x `cssH` (px) theo `fitZoom`. */
export function viewOfScreen(cssW: number, cssH: number): SearchView {
  const z = fitZoom(cssW, cssH);
  return { hw: cssW / z / 2, hh: cssH / z / 2 };
}

/**
 * Các mức nhìn đem đo: biết hết bản đồ (cận dưới tuyệt đối), màn hình máy tính 1280 x 720 (zoom 1,125 -> 1138 x 640 px),
 * điện thoại NGANG 844 x 390 (zoom kẹp 0,75 -> 1125 x 520 px: nhìn rộng hơn máy tính theo chiều ngang) và điện thoại DỌC 390 x 844
 * (zoom 0,767 -> 508 x 1100 px: hẹp nhất). Quái "ngủ" ngoài `MONSTER_WAKE_DIST` (900 px) vẫn đứng yên, người chơi không nhìn thấy chúng
 * bằng mắt nên không tính. (Bản đầu của #459 dùng hình tròn bán kính 640 / 320 px: nhãn "320 px = điện thoại" chỉ là cận bi quan.)
 */
export const SEARCH_VIEWS = {
  all: { hw: Infinity, hh: Infinity },
  pc: viewOfScreen(1280, 720),
  phone: viewOfScreen(844, 390),
  phonePortrait: viewOfScreen(390, 844),
} as const satisfies Record<string, SearchView>;

/** Tên ngắn của mức nhìn dùng trong tài liệu (kèm kích thước màn hình thật) */
export const SEARCH_VIEW_LABELS: Record<keyof typeof SEARCH_VIEWS, string> = {
  all: "Biết hết bản đồ",
  pc: "Máy tính 1280x720",
  phone: "Điện thoại ngang 844x390",
  phonePortrait: "Điện thoại dọc 390x844",
};

// --- Lưới ô để tìm đường ---------------------------------------------------------------------------------------------

export interface Grid {
  w: number;
  h: number;
  /** 1 = đi được (cả vòng tròn người chơi không chạm ô chặn) */
  free: Uint8Array;
  // bộ nhớ nháp của Dijkstra, tái dùng giữa các lần gọi (đánh dấu bằng `stamp` để khỏi xoá cả mảng)
  dist: Float64Array;
  parent: Int32Array;
  stamp: Uint32Array;
  run: number;
}

const grids = new WeakMap<GameMap, Grid>();

/** Lưới `w` x `h` ô với `free[i]` = 1 nếu đi được (bộ nhớ nháp của Dijkstra đi kèm). */
export function newGrid(w: number, h: number, free: Uint8Array): Grid {
  return {
    w,
    h,
    free,
    dist: new Float64Array(w * h),
    parent: new Int32Array(w * h),
    stamp: new Uint32Array(w * h),
    run: 0,
  };
}

export function gridOf(map: GameMap): Grid {
  let g = grids.get(map);
  if (g) return g;
  const w = Math.round(map.worldW / TILE),
    h = Math.round(map.worldH / TILE);
  const free = new Uint8Array(w * h);
  for (let ty = 0; ty < h; ty++)
    for (let tx = 0; tx < w; tx++)
      free[ty * w + tx] = map.circleBlocked((tx + 0.5) * TILE, (ty + 0.5) * TILE, PLAYER_RADIUS)
        ? 0
        : 1;
  g = newGrid(w, h, free);
  grids.set(map, g);
  return g;
}

/** Heap nhị phân tối thiểu theo khoá (tái dùng bộ nhớ giữa các lần). */
class MinHeap {
  keys: number[] = [];
  vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  clear() {
    this.keys.length = 0;
    this.vals.length = 0;
  }
  push(k: number, v: number) {
    const keys = this.keys,
      vals = this.vals;
    let i = keys.length;
    keys.push(k);
    vals.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= k) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = k;
    vals[i] = v;
  }
  pop(): number {
    const keys = this.keys,
      vals = this.vals;
    const top = vals[0];
    const lk = keys.pop()!,
      lv = vals.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= lk) break;
        keys[i] = keys[c];
        vals[i] = vals[c];
        i = c;
      }
      keys[i] = lk;
      vals[i] = lv;
    }
    return top;
  }
}

const heap = new MinHeap();
const SQRT2 = Math.SQRT2;

/**
 * Đường đi ngắn nhất (8 hướng, không cắt góc tường) từ ô chứa (sx, sy) tới ô ĐẦU TIÊN thuộc `goals` (tập chỉ số ô); dừng ngay khi tới.
 * Trả về danh sách chỉ số ô từ ô xuất phát tới ô đích kèm độ dài (đơn vị ô), hoặc null nếu không tới được.
 */
export function planPath(
  g: Grid,
  sx: number,
  sy: number,
  goals: ReadonlySet<number>,
): { cells: number[]; length: number } | null {
  const { w, h, free, dist, parent, stamp } = g;
  const tx0 = Math.min(w - 1, Math.max(0, Math.floor(sx / TILE)));
  const ty0 = Math.min(h - 1, Math.max(0, Math.floor(sy / TILE)));
  const start = ty0 * w + tx0;
  const run = ++g.run;
  heap.clear();
  dist[start] = 0;
  parent[start] = -1;
  stamp[start] = run;
  heap.push(0, start);
  while (heap.size > 0) {
    const key = heap.keys[0];
    const cur = heap.pop();
    if (key > dist[cur]) continue; // bản cũ của ô đã có đường tốt hơn
    if (goals.has(cur)) {
      const cells: number[] = [];
      for (let c = cur; c !== -1; c = parent[c]) cells.push(c);
      cells.reverse();
      return { cells, length: key };
    }
    const cx = cur % w,
      cy = (cur / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx,
          ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (!free[ni]) continue;
        // không cắt góc: đi chéo thì hai ô kề theo trục phải đi được
        if (dx !== 0 && dy !== 0 && (!free[cy * w + nx] || !free[ny * w + cx])) continue;
        const nd = key + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
        if (stamp[ni] === run && dist[ni] <= nd) continue;
        stamp[ni] = run;
        dist[ni] = nd;
        parent[ni] = cur;
        heap.push(nd, ni);
      }
    }
  }
  return null;
}

// --- Quét bãi: nhớ chỗ đã nhìn -----------------------------------------------------------------------------------------

/** Cạnh ô thô của bản đồ quét (ô lưới): 8 ô = 256 px, cỡ một nửa chiều cao vùng nhìn máy tính */
const SWEEP_CELL = 8;

interface Sweep {
  cw: number;
  /** Với mỗi ô thô: chỉ số ô lưới đi được nằm trong vùng loài này sinh ra (độ nguy hiểm đủ, ngoài khu an toàn), gần tâm ô thô nhất; -1 nếu không có */
  goal: Int32Array;
  /** Toạ độ tâm ô thô (px) */
  cx: Float64Array;
  cy: Float64Array;
}

const sweeps = new WeakMap<GameMap, Map<string, Sweep>>();

/** Các ô thô của bản đồ mà loài `def` có thể sinh ra (cùng điều kiện với `spawnMonster`: người chơi biết quái ở vùng nào). */
function sweepOf(map: GameMap, def: (typeof MONSTERS)[number]): Sweep {
  let byKind = sweeps.get(map);
  if (!byKind) sweeps.set(map, (byKind = new Map()));
  let sw = byKind.get(def.id);
  if (sw) return sw;
  const grid = gridOf(map);
  const cw = Math.ceil(grid.w / SWEEP_CELL),
    ch = Math.ceil(grid.h / SWEEP_CELL);
  // ô đi được từ trấn (loang 4 hướng): ổ kín / đảo nước không tới được thì không đưa vào đích quét (thợ săn không đứng ì đi tìm chỗ không tới được)
  const reach = new Uint8Array(grid.w * grid.h);
  const from = safeSpot(map, map.townPx.x, map.townPx.y);
  const stack = [
    Math.min(grid.h - 1, Math.floor(from.y / TILE)) * grid.w +
      Math.min(grid.w - 1, Math.floor(from.x / TILE)),
  ];
  reach[stack[0]] = 1;
  while (stack.length > 0) {
    const c = stack.pop()!;
    const cx0 = c % grid.w,
      cy0 = (c / grid.w) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx0 + dx,
        ny = cy0 + dy;
      if (nx < 0 || ny < 0 || nx >= grid.w || ny >= grid.h) continue;
      const ni = ny * grid.w + nx;
      if (!grid.free[ni] || reach[ni]) continue;
      reach[ni] = 1;
      stack.push(ni);
    }
  }
  const goal = new Int32Array(cw * ch).fill(-1);
  const cx = new Float64Array(cw * ch),
    cy = new Float64Array(cw * ch);
  for (let j = 0; j < ch; j++)
    for (let i = 0; i < cw; i++) {
      const c = j * cw + i;
      const midX = (i + 0.5) * SWEEP_CELL * TILE,
        midY = (j + 0.5) * SWEEP_CELL * TILE;
      cx[c] = midX;
      cy[c] = midY;
      let best = Infinity;
      for (let ty = j * SWEEP_CELL; ty < Math.min(grid.h, (j + 1) * SWEEP_CELL); ty++)
        for (let tx = i * SWEEP_CELL; tx < Math.min(grid.w, (i + 1) * SWEEP_CELL); tx++) {
          if (!reach[ty * grid.w + tx]) continue;
          const x = (tx + 0.5) * TILE,
            y = (ty + 0.5) * TILE;
          const d = map.dangerAt(x, y);
          if (d < def.minDanger || (def.id === "tho" && d > 0.45) || map.inSafe(x, y, 160))
            continue;
          const dist = Math.hypot(x - midX, y - midY);
          if (dist < best) {
            best = dist;
            goal[c] = ty * grid.w + tx;
          }
        }
    }
  sw = { cw, goal, cx, cy };
  byKind.set(def.id, sw);
  return sw;
}

// --- Thợ săn --------------------------------------------------------------------------------------------------------

export interface SearchRun {
  /** Giây tìm quái trước mỗi lần hạ (đã bỏ WARM_KILLS lần đầu) */
  searches: number[];
  /** Tổng giây mô phỏng đã chạy */
  simSeconds: number;
}

/**
 * Một thợ săn bất tử của (bậc `realm`, `tier`) săn loài `monsterId` ở bản đồ `mapId` cho tới đủ `kills` lần hạ (sau khi bỏ lần khởi động).
 * `view`: vùng nhìn chữ nhật (nửa rộng, nửa cao; px). Vô hạn = biết vị trí MỌI con trên bản đồ (cận dưới tuyệt đối); hữu hạn = chỉ biết con
 * trong vùng nhìn; không thấy con nào thì QUÉT: đi tới ô thô gần nhất (theo đường đi) thuộc vùng loài này sinh ra mà chưa nhìn tới trong
 * lượt quét này (người chơi biết quái ở vùng nào và không đi lại chỗ vừa nhìn; không còn đi ngẫu nhiên: đuôi dài của khám phá ngẫu nhiên
 * làm số đo nhiễu, B nêu ở #459).
 */
export function searchRun(
  mapId: string,
  monsterId: string,
  realm: number,
  tier: number,
  kills: number,
  seed: number,
  view: SearchView = SEARCH_VIEWS.all,
): SearchRun {
  const saved = Math.random;
  Math.random = seeded(seed);
  try {
    const map = getMap(mapId)!;
    const { w } = makeWorld(map);
    spawnInitial(w);
    const { p } = addPlayer(w, "H", realm, tier);
    const gear = bestGear(realm, tier);
    setEquipment(p, gear);
    applyStats(p, true);
    const from = safeSpot(map, map.townPx.x, map.townPx.y);
    p.x = from.x;
    p.y = from.y;
    syncPublicPos(p);
    const speed = statsFor(realm, tier, gear).speed;
    const grid = gridOf(map);
    const slashS = SKILLS.slash;
    const reachOf = (kind: string) => slashS.range + MONSTER_BY_ID[kind].radius - 4;

    w.now = 1_000_000;
    const dt = TICK_MS / 1000;
    const step = speed * dt;
    let nextTopUp = w.now + MONSTER_RESPAWN_MS;
    let t = 0;
    let searchAcc = 0;
    const searches: number[] = [];
    let seen = 0;
    let waypoints: { x: number; y: number }[] = [];
    let wpi = 0;
    let replanIn = 0;
    let exploring = false;
    // con đang đuổi (khoá mục tiêu): người chơi không đổi ý mỗi giây; nếu không thợ săn dao động giữa hai con có đường dài gần bằng nhau
    // (một con ở bên kia vách đá, một con ở bên này) và đứng ì cả nghìn giây mô phỏng
    let lockId: string | null = null;
    // con thấy được mà không có đường tới (đứng trong ổ kín): bỏ qua tới thời điểm này
    const ignoreUntil = new Map<string, number>();
    const sweep = Number.isFinite(view.hw) ? sweepOf(map, MONSTER_BY_ID[monsterId]) : null;
    const seenAt = sweep ? new Float64Array(sweep.goal.length).fill(-Infinity) : null;

    const count = () => {
      let n = 0;
      w.state.monsters.forEach((m) => {
        if (m.kind === monsterId) n++;
      });
      return n;
    };

    while (t < MAX_SECONDS && searches.length < kills) {
      w.now += TICK_MS;
      t += dt;
      w.tick++;
      if (w.now >= nextTopUp) {
        topUpMonsters(w);
        nextTopUp += MONSTER_RESPAWN_MS;
      }
      tickMonsters(w, dt);
      // bất tử: chỉ đo đi lại
      p.dead = false;
      p.hp = p.maxHp;

      // con cùng loài gần nhất theo đường chim bay (để biết có trong tầm đánh chưa)
      let near = null as { id: string; x: number; y: number; d: number } | null;
      w.state.monsters.forEach((m, id) => {
        if (m.kind !== monsterId) return;
        const d = Math.hypot(m.x - p.x, m.y - p.y);
        if (d <= reachOf(m.kind) && (!near || d < near.d)) near = { id, x: m.x, y: m.y, d };
      });

      if (near) {
        // Thời gian trận đã đo ở `hunt-check.ts`; ở đây chỉ đo thời gian TÌM (không tính trận), nên rút ngắn trận bằng cách đặt máu con bị đánh
        // về 1: trùm hàng nghìn máu đánh cả trăm giây mô phỏng làm bảng này chậm gấp ~5 lần mà không đổi số đo nào.
        const target = w.state.monsters.get(near.id);
        if (target) target.hp = 1;
        const before = count();
        slash(w, "H", Math.atan2(near.y - p.y, near.x - p.x));
        const died = before - count();
        for (let i = 0; i < died; i++) {
          if (++seen > WARM_KILLS) searches.push(searchAcc);
          searchAcc = 0;
        }
        waypoints = [];
        replanIn = 0;
        exploring = false;
        lockId = null;
        continue;
      }

      // chưa có con nào trong tầm: đi tìm
      searchAcc += dt;
      if (replanIn-- <= 0 || (exploring && waypoints.length > 0 && wpi >= waypoints.length)) {
        replanIn = REPLAN_TICKS;
        const goals = new Set<number>();
        // đích là ô con quái đứng; nếu ô đó bị chặn (đứng sát tường) thì lấy các ô đi được quanh nó
        const goalTiles = (m: { x: number; y: number }, owner?: Map<number, string>, id = "") => {
          const mx = Math.floor(m.x / TILE),
            my = Math.floor(m.y / TILE);
          const add = (gi: number) => {
            goals.add(gi);
            owner?.set(gi, id);
          };
          const own = my * grid.w + mx;
          if (grid.free[own]) return add(own);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const gx = mx + dx,
                gy = my + dy;
              if (gx < 0 || gy < 0 || gx >= grid.w || gy >= grid.h) continue;
              const gi = gy * grid.w + gx;
              if (grid.free[gi]) add(gi);
            }
        };
        // giữ con đã chọn nếu còn sống và chưa ra quá xa vùng nhìn (người chơi vừa thấy nó đi khuất thì vẫn theo)
        let locked = lockId ? w.state.monsters.get(lockId) : undefined;
        if (
          locked &&
          (locked.kind !== monsterId ||
            Math.abs(locked.x - p.x) > 2 * view.hw ||
            Math.abs(locked.y - p.y) > 2 * view.hh)
        )
          locked = undefined;
        if (!locked) lockId = null;
        const owner = new Map<number, string>();
        if (locked) goalTiles(locked);
        else
          w.state.monsters.forEach((m, id) => {
            if (m.kind !== monsterId) return;
            if (Math.abs(m.x - p.x) > view.hw || Math.abs(m.y - p.y) > view.hh) return; // chưa thấy
            if ((ignoreUntil.get(id) ?? -Infinity) > t) return;
            goalTiles(m, owner, id);
          });
        // thấy con nào thì đuổi theo con gần nhất (theo đường đi); không thấy thì quét tới ô thô gần nhất chưa nhìn
        let path: ReturnType<typeof planPath> = null;
        if (goals.size > 0) {
          path = planPath(grid, p.x, p.y, goals);
          if (path) lockId = lockId ?? owner.get(path.cells[path.cells.length - 1]) ?? null;
          else if (lockId) {
            ignoreUntil.set(lockId, t + 60);
            lockId = null;
          } else for (const id of new Set(owner.values())) ignoreUntil.set(id, t + 60);
        }
        exploring = false;
        if (!path && sweep && seenAt) {
          for (let c = 0; c < seenAt.length; c++)
            if (Math.abs(sweep.cx[c] - p.x) <= view.hw && Math.abs(sweep.cy[c] - p.y) <= view.hh)
              seenAt[c] = t;
          // ô thô gần nhất (theo đường đi) CHƯA nhìn trong lượt quét này; nhìn hết một vòng thì quét lại từ đầu. (Bản đầu cho ô "cũ" sau 60 giây
          // rồi đi tới ô cũ gần nhất: thợ săn dao động quanh một cụm ô gần nhau cả nghìn giây mà không sang chỗ trùm đứng.)
          const nextTargets = () => {
            const target = new Set<number>();
            for (let c = 0; c < seenAt.length; c++)
              if (sweep.goal[c] >= 0 && seenAt[c] === -Infinity) target.add(sweep.goal[c]);
            return target;
          };
          let target = nextTargets();
          if (target.size === 0) {
            seenAt.fill(-Infinity);
            for (let c = 0; c < seenAt.length; c++)
              if (Math.abs(sweep.cx[c] - p.x) <= view.hw && Math.abs(sweep.cy[c] - p.y) <= view.hh)
                seenAt[c] = t;
            target = nextTargets();
          }
          path = target.size > 0 ? planPath(grid, p.x, p.y, target) : null;
          exploring = true;
        }
        waypoints = path
          ? path.cells.slice(1).map((c) => ({
              x: ((c % grid.w) + 0.5) * TILE,
              y: (((c / grid.w) | 0) + 0.5) * TILE,
            }))
          : [];
        wpi = 0;
      }
      let left = step;
      while (left > 0 && wpi < waypoints.length) {
        const wp = waypoints[wpi];
        const d = Math.hypot(wp.x - p.x, wp.y - p.y);
        if (d <= left) {
          p.x = wp.x;
          p.y = wp.y;
          left -= d;
          wpi++;
        } else {
          p.x += ((wp.x - p.x) / d) * left;
          p.y += ((wp.y - p.y) / d) * left;
          left = 0;
        }
      }
      // hết đường đã tính mà chưa trong tầm đánh (ô đích là ô kề con quái, không phải đúng chỗ nó đứng): bước thẳng tới nó
      if (left > 0 && wpi >= waypoints.length) {
        let best = Infinity,
          bx = 0,
          by = 0;
        w.state.monsters.forEach((m) => {
          if (m.kind !== monsterId) return;
          const d = Math.hypot(m.x - p.x, m.y - p.y);
          if (d < best) {
            best = d;
            bx = m.x;
            by = m.y;
          }
        });
        // chỉ khi rất gần (cùng vùng thông thoáng với ô đích), tránh đi xuyên tường
        if (best <= FINAL_APPROACH_PX) {
          const k = Math.min(1, left / best);
          p.x += (bx - p.x) * k;
          p.y += (by - p.y) * k;
        }
      }
    }
    return { searches, simSeconds: t };
  } finally {
    Math.random = saved;
  }
}

// --- Bảng đối chiếu -------------------------------------------------------------------------------------------------

/** Bậc đại diện của từng loài (cùng bậc với `hunt-check.ts` / `simulate.ts`: bậc nào săn loài đó). */
const TIER_OF: Record<string, [number, number]> = {
  tho: [1, 0],
  lang: [1, 4],
  ho: [2, 2],
  mang: [3, 0],
  suong_ho: [3, 0],
  thach_quy: [3, 0],
  doc_thiem: [3, 0],
  hac_giao: [3, 0],
};

export interface SearchCase {
  mapId: string;
  monsterId: string;
  realm: number;
  tier: number;
}

/** Mọi cặp (bản đồ thường, loài) có giả định thời gian tìm trong `ASSUME.searchSec` và có quái ở bản đồ đó. */
export function searchCases(): SearchCase[] {
  const out: SearchCase[] = [];
  for (const def of MAPS) {
    const map = getMap(def.id)!;
    for (const m of MONSTERS) {
      if (map.monsterCapOf(m.id) <= 0 || !(m.id in ASSUME.searchSec) || !(m.id in TIER_OF))
        continue;
      const [realm, tier] = TIER_OF[m.id];
      out.push({ mapId: def.id, monsterId: m.id, realm, tier });
    }
  }
  return out;
}

export interface SearchRow {
  mapId: string;
  mapName: string;
  monsterId: string;
  /** Số quái cùng loài trên bản đồ (trần `monsterCap`) */
  cap: number;
  assumed: number;
  mean: number;
  median: number;
  p90: number;
  n: number;
  /** mean / assumed */
  ratio: number;
}

export function searchCheck(c: SearchCase, view: SearchView = SEARCH_VIEWS.all): SearchRow {
  const map = getMap(c.mapId)!;
  const def = MONSTER_BY_ID[c.monsterId];
  const kills = def.boss ? SEARCH_KILLS_BOSS : SEARCH_KILLS;
  const all: number[] = [];
  const seeds = def.boss ? SEARCH_SEEDS_BOSS : SEARCH_SEEDS;
  for (let seed = 1; seed <= seeds; seed++)
    all.push(...searchRun(c.mapId, c.monsterId, c.realm, c.tier, kills, seed, view).searches);
  const sorted = all.slice().sort((a, b) => a - b);
  const mean = all.reduce((s, x) => s + x, 0) / all.length;
  const assumed = ASSUME.searchSec[c.monsterId];
  return {
    mapId: c.mapId,
    mapName: map.def.name,
    monsterId: c.monsterId,
    cap: map.monsterCapOf(c.monsterId),
    assumed,
    mean,
    median: median(all),
    p90: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))],
    n: all.length,
    ratio: mean / assumed,
  };
}

/** Ngưỡng của #406 mục 7: mô hình lạc quan hơn đo quá ~25% thì phải sửa giả định. */
export const SEARCH_OPTIMISM_LIMIT = 1.25;

// --- Độ nhạy: nếu thợ săn tìm quái nhanh như số đo thì nhịp tu luyện thế nào -----------------------------------------------

export interface SearchPace {
  luyenKhi: number;
  trucCo: number;
  /** Phút RIÊNG cảnh giới Kim Đan (ba bậc) khi người chơi săn bãi tốt nhất kể cả Xích Mãng ("tối ưu" của mục Kim Đan sau nội dung) */
  kimDan: number;
  /** Như trên khi chỉ săn bãi mới (không đụng Xích Mãng) */
  kimDanNoMang: number;
  /** Nguồn tu vi nhanh nhất ở từng bậc Kim Đan, kịch bản tối ưu (tên loài hoặc "đả tọa") */
  kimDanSources: string[];
  /** Tu vi / giờ của Xích Mãng (kể cả Tụ Khí Đan rơi) chia cho bãi mới tốt nhất, mỗi bậc Kim Đan; 0 nếu Xích Mãng không an toàn (tiêu chí #406: <= ~1,5) */
  mangRatio: number[];
}

export interface SearchSensitivity {
  /** Phút cộng dồn tới hết Luyện Khí / Trúc Cơ / Kim Đan với giả định của mô hình */
  model: SearchPace;
  /** Như trên khi `ASSUME.searchSec` = số đo (cận dưới: thợ săn hoàn hảo; loài có ở nhiều bản đồ thì lấy bản đồ chậm hơn) */
  measured: SearchPace;
  /** Số giây tìm quái đã thay vào (loài -> giây) */
  searchSec: Record<string, number>;
}

function finishMinutes(): SearchPace {
  const best = withKimDan(() => simulate(3));
  const fresh = withKimDan(() => simulate(3), true);
  return {
    luyenKhi: minutesToFinish(best, 1),
    trucCo: minutesToFinish(best, 2),
    kimDan: minutesToFinish(best, 3) - minutesToFinish(best, 2),
    kimDanNoMang: minutesToFinish(fresh, 3) - minutesToFinish(fresh, 2),
    kimDanSources: best.filter((r) => r.realm === 3).map((r) => r.source),
    mangRatio: [0, 1, 2].map((tier) => {
      const mang = rateWithPills(MONSTER_BY_ID.mang, tier) ?? 0;
      const fresh = Math.max(
        ...KIM_DAN_MONSTER_IDS.map((id) => rateWithPills(MONSTER_BY_ID[id], tier) ?? 0),
      );
      return mang / fresh;
    }),
  };
}

/** Chạy `fn` với `ASSUME.searchSec` bị ghi đè bởi `over` (khôi phục sau khi xong, kể cả khi `fn` ném lỗi). */
function withSearchSec<T>(over: Record<string, number>, fn: () => T): T {
  const saved = { ...ASSUME.searchSec };
  try {
    Object.assign(ASSUME.searchSec, over);
    return fn();
  } finally {
    for (const k of Object.keys(ASSUME.searchSec)) delete ASSUME.searchSec[k];
    Object.assign(ASSUME.searchSec, saved);
  }
}

/** Chạy `simulate` hai lần: với `ASSUME.searchSec` của mô hình và với số đo của `rows` (khôi phục sau khi xong). */
export function searchSensitivity(rows: readonly SearchRow[]): SearchSensitivity {
  const model = finishMinutes();
  const searchSec: Record<string, number> = {};
  for (const r of rows) searchSec[r.monsterId] = Math.max(searchSec[r.monsterId] ?? 0, r.mean);
  return { model, measured: withSearchSec(searchSec, finishMinutes), searchSec };
}

/** Dạng của độ "vụng" (người chơi chậm hơn thợ săn): NHÂN (chậm gấp k lần ở mọi nơi) hay CỘNG (mất thêm b giây cố định mỗi lần tìm). */
export type SlackMode = "nhan" | "cong";

/**
 * Độ vụng ước lượng từ các loài THƯỜNG (mô hình đã cho chúng thời gian tìm lớn hơn số đo): nhân = trung vị (giả định / đo), cộng = trung vị
 * (giả định - đo). Truyền số đo của MỌI cỡ màn hình một lượt: số đo thô của trùm gần y hệt giữa ba cỡ (Xích Mãng Lạc Hà 21,2 / 22,1 / 22,8 giây)
 * nên một hệ số riêng từng cỡ chỉ thêm nhiễu của loài thường (review của B ở #460). Hai dạng là hai GIẢ THUYẾT chưa kiểm chứng; số đo của bot / người (#410) phân xử.
 */
export function slackOf(rows: readonly SearchRow[], mode: SlackMode): number {
  const xs = rows
    .filter((r) => !MONSTER_BY_ID[r.monsterId].boss)
    .map((r) => (mode === "nhan" ? r.assumed / r.mean : r.assumed - r.mean))
    .sort((x, y) => x - y);
  return xs[Math.floor(xs.length / 2)];
}

export interface SearchCalibrated {
  mode: SlackMode;
  /** Hệ số (nhân) hoặc số giây (cộng) đã dùng */
  slack: number;
  /** Giây tìm thay vào cho từng trùm: số đo (bản đồ chậm hơn) nhân / cộng `slack`; loài thường giữ giả định của mô hình */
  searchSec: Record<string, number>;
  pace: SearchPace;
}

/** Nhịp tu luyện khi loài thường giữ giả định mô hình còn trùm lấy số đo cộng độ vụng `slack` (so công bằng với phần còn lại của mô hình). */
export function searchCalibrated(
  rows: readonly SearchRow[],
  slack: number,
  mode: SlackMode,
): SearchCalibrated {
  const searchSec: Record<string, number> = {};
  for (const r of rows)
    if (MONSTER_BY_ID[r.monsterId].boss) {
      const v = mode === "nhan" ? r.mean * slack : r.mean + slack;
      searchSec[r.monsterId] = Math.max(searchSec[r.monsterId] ?? 0, v);
    }
  return { mode, slack, searchSec, pace: withSearchSec(searchSec, finishMinutes) };
}

/**
 * Số giây giữa hai lần hạ Xích Mãng NHỎ NHẤT mà tiêu chí #406 mục 1 (không nguồn nào vượt `limit` lần bãi mới tốt nhất cùng bậc) còn đạt
 * (chia đôi; tỉ lệ giảm khi thời gian tìm tăng). 0 nếu đạt ở mọi giá trị, Infinity nếu không bao giờ đạt. Đây là ngưỡng để so với số đo của bot (#410).
 */
export function breakEvenMangSec(limit = 1.5): number {
  const worst = (t: number) => Math.max(...withSearchSec({ mang: t }, finishMinutes).mangRatio);
  let lo = 1,
    hi = 600;
  if (worst(hi) > limit) return Infinity;
  if (worst(lo) <= limit) return 0;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (worst(mid) > limit) lo = mid;
    else hi = mid;
  }
  return hi;
}

// --- Mục 10 của CAN_BANG.md -----------------------------------------------------------------------------------------

const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const n1 = (x: number) => x.toFixed(1);
const gio = (min: number) => (min / 60).toFixed(1);

/** Mục 10 của "Kim Đan sau nội dung" trong `docs/CAN_BANG.md`. */
export function renderSearchCheck(): string {
  const cases = searchCases();
  type ViewKey = keyof typeof SEARCH_VIEWS;
  const keys = Object.keys(SEARCH_VIEWS) as ViewKey[];
  const real = keys.filter((k) => k !== "all");
  const byView = Object.fromEntries(
    keys.map((k) => [k, cases.map((c) => searchCheck(c, SEARCH_VIEWS[k]))]),
  ) as Record<ViewKey, SearchRow[]>;
  const size = (k: ViewKey) =>
    `${Math.round(SEARCH_VIEWS[k].hw * 2)}x${Math.round(SEARCH_VIEWS[k].hh * 2)} px`;
  const label = (k: ViewKey) =>
    k === "all" ? SEARCH_VIEW_LABELS[k] : `${SEARCH_VIEW_LABELS[k]} (nhìn ${size(k)})`;
  const cell = (r: SearchRow) => `${n1(r.mean)} (${n1(r.median)})`;
  const lines = cases.map((c, i) => {
    const first = byView.all[i];
    return `| ${first.mapName} | ${MONSTER_BY_ID[c.monsterId].name} | ${first.cap} | ${first.assumed} | ${keys.map((k) => cell(byView[k][i])).join(" | ")} |`;
  });
  const worstAll = Math.max(...byView.all.map((r) => r.ratio));
  const normal = (rows: SearchRow[]) => rows.filter((r) => !MONSTER_BY_ID[r.monsterId].boss);
  const range = (rows: SearchRow[]) =>
    `${Math.min(...rows.map((r) => r.ratio)).toFixed(2)}x - ${Math.max(...rows.map((r) => r.ratio)).toFixed(2)}x`;
  const only = (rows: SearchRow[], id: string) => rows.filter((r) => r.monsterId === id);
  const secRange = (rows: SearchRow[]) =>
    `${n0(Math.min(...rows.map((r) => r.mean)))} - ${n0(Math.max(...rows.map((r) => r.mean)))}`;
  const sens = Object.fromEntries(keys.map((k) => [k, searchSensitivity(byView[k])])) as Record<
    ViewKey,
    SearchSensitivity
  >;
  const src = (p: SearchPace) =>
    [...new Set(p.kimDanSources)].map((id) => MONSTER_BY_ID[id]?.name ?? id).join(", ");
  const paceRow = (name: string, p: SearchPace) =>
    `| ${name} | ${n0(p.luyenKhi)} | ${n0(p.trucCo)} | ${n0(p.kimDan)} (${gio(p.kimDan)} giờ) | ${n0(p.kimDanNoMang)} (${gio(p.kimDanNoMang)} giờ) | ${src(p)} | ${p.mangRatio.map((r) => r.toFixed(2)).join(" / ")} |`;
  const model = sens.all.model;
  const worstMang = (p: SearchPace) => Math.max(...p.mangRatio);
  // độ vụng: MỘT hệ số chung cho mọi cỡ màn hình (xem `slackOf`), hai dạng giả thuyết
  const pooled = real.flatMap((k) => byView[k]);
  const modes: SlackMode[] = ["nhan", "cong"];
  const slack = { nhan: slackOf(pooled, "nhan"), cong: slackOf(pooled, "cong") };
  const modeName = {
    nhan: `Nhân (người chậm gấp ${slack.nhan.toFixed(1)}x)`,
    cong: `Cộng (người mất thêm ${n0(slack.cong)} giây)`,
  };
  const cal = modes.flatMap((mode) =>
    real.map((k) => ({ mode, view: k, c: searchCalibrated(byView[k], slack[mode], mode) })),
  );
  const calRows = cal.map(({ mode, view, c }) => {
    const p = c.pace;
    return `| ${modeName[mode]} | ${label(view)} | ${n0(c.searchSec.mang)} | ${n0(c.searchSec.hac_giao)} | ${n0(p.kimDan)} (${gio(p.kimDan)} giờ) | ${n0(p.kimDanNoMang)} (${gio(p.kimDanNoMang)} giờ) | ${p.mangRatio.map((r) => r.toFixed(2)).join(" / ")} |`;
  });
  const calVerdict = (mode: SlackMode) =>
    cal
      .filter((x) => x.mode === mode)
      .map(
        (x) =>
          `${SEARCH_VIEW_LABELS[x.view].toLowerCase()} ${worstMang(x.c.pace).toFixed(2)}x ${worstMang(x.c.pace) <= 1.5 ? "ĐẠT" : "KHÔNG ĐẠT"}`,
      )
      .join("; ");
  const calPace = (mode: SlackMode) => cal.filter((x) => x.mode === mode).map((x) => x.c.pace);
  const range1 = (xs: number[], f: (x: number) => string) => {
    const lo = f(Math.min(...xs)),
      hi = f(Math.max(...xs));
    return lo === hi ? lo : `${lo}-${hi}`;
  };
  const calMangSec = (mode: SlackMode) =>
    range1(
      cal.filter((x) => x.mode === mode).map((x) => x.c.searchSec.mang),
      n0,
    );
  const calKimDan = (mode: SlackMode) =>
    range1(
      calPace(mode).map((p) => p.kimDan),
      gio,
    );
  const breakEven = breakEvenMangSec();
  const verdict = (name: string, p: SearchPace) =>
    `${name} ${worstMang(p) <= 1.5 ? "ĐẠT" : "KHÔNG ĐẠT"} (tối đa ${worstMang(p).toFixed(2)}x)`;
  const criterion = [
    verdict("mô hình", model),
    ...keys.map((k) => verdict(SEARCH_VIEW_LABELS[k].toLowerCase(), sens[k].measured)),
  ].join("; ");
  const hours = real
    .map(
      (k) =>
        `${SEARCH_VIEW_LABELS[k].toLowerCase()} ${gio(sens[k].measured.kimDan)} / ${gio(sens[k].measured.kimDanNoMang)} giờ`,
    )
    .join(", ");
  const bossRows = only(byView.pc, "hac_giao");
  return `### 10. Thời gian tìm quái (#406 mục 7)

Phần mục 9 không kiểm. \`ASSUME.searchSec\` (giây từ lúc hạ con này tới lúc chạm con kế tiếp) quyết định tu vi / giờ của MỌI bãi, nhưng trước đây chỉ là con số đoán. Đây là số đo bằng mã server thật (\`search-check.ts\`): dựng \`World\` của từng bản đồ (quái sinh bằng \`spawnInitial\`, hồi sinh bằng \`topUpMonsters\` mỗi ${MONSTER_RESPAWN_MS / 1000} giây, AI quái thật gồm phát hiện + đuổi), một thợ săn bất tử săn đúng một loài: tới con GẦN NHẤT THEO ĐƯỜNG ĐI (Dijkstra trên lưới ô, tránh tường và nước), tới tầm thì đánh \`slash\` thật. Thời gian tìm = các giây không có con nào trong tầm đánh, tính từ lúc hạ con trước (bỏ ${WARM_KILLS} lần hạ đầu: đi từ trấn ra bãi). Loài thường: ${SEARCH_SEEDS} cách rải quái (hạt giống) x ${SEARCH_KILLS} lần hạ. Trùm (Xích Mãng, Hắc Giao: chỉ 2-6 con cả bản đồ nên thời gian tìm phụ thuộc mạnh vào chỗ chúng được rải): ${SEARCH_SEEDS_BOSS} hạt giống x ${SEARCH_KILLS_BOSS} lần hạ (với 3 hạt giống số Xích Mãng nhiễu: review của B ở #459).

Bốn mức hiểu biết của thợ săn (đo càng thật thì càng chậm): **biết hết bản đồ** (cận dưới tuyệt đối: vị trí mọi con luôn hiện ra) và ba cỡ màn hình thật theo luật \`fitZoom\` của client (\`client/src/gfx/scale.ts\`, vùng nhìn CHỮ NHẬT quanh người chơi): **máy tính 1280x720** (${size("pc")}), **điện thoại ngang 844x390** (${size("phone")}: nhìn rộng gần bằng máy tính, thấp hơn) và **điện thoại dọc 390x844** (${size("phonePortrait")}: hẹp nhất). Chỉ thấy con trong vùng nhìn; không thấy con nào thì QUÉT: đi (theo đường ngắn nhất) tới ô thô 256 px gần nhất thuộc vùng loài đó sinh ra (độ nguy hiểm đủ, ngoài khu an toàn: người chơi biết quái ở vùng nào) mà chưa nhìn tới trong lượt quét này (nhìn hết một vòng thì quét lại). Lần đầu bản đồ được đo bằng đi ngẫu nhiên (#459): đuôi dài làm số đo nhiễu (một lần lạc 500 giây kéo cả trung bình), nên đổi thành quét có trí nhớ; không còn tung ngẫu nhiên nào ngoài chỗ quái được rải. Mỗi ô: trung bình giây (trung vị).

| Bản đồ | Loài | Số con | Giả định (s) | ${keys.map(label).join(" | ")} |
|---|---|---:|---:|${keys.map(() => "---:").join("|")}|
${lines.join("\n")}

- **Mô hình KHÔNG lạc quan:** thợ săn biết hết bản đồ (cận dưới) đo tối đa **${worstAll.toFixed(2)}x** giả định (ngưỡng #406: mô hình lạc quan nếu > ${SEARCH_OPTIMISM_LIMIT}x). \`search-check.test.ts\` giữ điều này: ai hạ \`ASSUME.searchSec\` xuống dưới cận dưới thì test đỏ.
- **Loài thường: giả định nằm trên cận dưới và quanh các mức nhìn thật.** Đo / giả định: ${real.map((k) => `${range(normal(byView[k]))} ở ${SEARCH_VIEW_LABELS[k].toLowerCase()}`).join("; ")} (quét theo vùng sinh: người thật có thể khéo hơn nhờ nhớ chỗ quái hay đứng, hoặc vụng hơn vì do dự). Không sửa số nào.
- **Xích Mãng (giả định ${ASSUME.searchSec.mang} giây) và Hắc Giao (${ASSUME.searchSec.hac_giao} giây) là chỗ nhạy:** Xích Mãng đo ${real.map((k) => `${secRange(only(byView[k], "mang"))} giây ở ${SEARCH_VIEW_LABELS[k].toLowerCase()}`).join("; ")} (quái thưa: ${only(
    byView.all,
    "mang",
  )
    .map((r) => `${r.cap} con ở ${r.mapName}`)
    .join(
      ", ",
    )}); Hắc Giao (${bossRows[0].cap} con) ${real.map((k) => `${n0(only(byView[k], "hac_giao")[0].mean)} giây ở ${SEARCH_VIEW_LABELS[k].toLowerCase()}`).join("; ")}.

**Nhịp tu luyện nhạy với giả định này.** Cùng \`simulate(3)\` như mục "Kim Đan sau nội dung" (một người, quái an toàn nhanh nhất mỗi bậc; "tối ưu" kể cả Xích Mãng, "bãi mới" không đụng Xích Mãng), thay \`ASSUME.searchSec\` bằng số đo từng mức nhìn (loài ở nhiều bản đồ: lấy bản đồ chậm hơn). Phút cộng dồn tới hết Luyện Khí và Trúc Cơ, rồi phút RIÊNG cảnh giới Kim Đan (mục tiêu: 5-7 giờ):

| Giả định tìm quái | Hết Luyện Khí (cộng dồn) | Hết Trúc Cơ (cộng dồn) | Riêng Kim Đan (tối ưu) | Riêng Kim Đan (bãi mới) | Nguồn nhanh nhất ở Kim Đan (tối ưu) | Xích Mãng / bãi mới tốt nhất (Sơ / Trung / Hậu) |
|---|---:|---:|---:|---:|---|---:|
${paceRow("Mô hình (giả định hiện tại)", model)}
${keys.map((k) => paceRow(label(k), sens[k].measured)).join("\n")}

Tiêu chí #406 mục 1 ("không nguồn nào vượt ~1,5x bãi mới tốt nhất cùng bậc", cột cuối): ${criterion}.

**So công bằng: hiệu chỉnh theo độ vụng của loài thường.** Thợ săn là thuật toán (biết loài sống ở vùng nào, đường đi hoàn hảo, không bao giờ dừng), nên mọi số đo ở trên đều nhanh hơn giả định của mô hình; mô hình đã chừa cho người chơi thật một khoảng thời gian tìm quái lớn hơn thợ săn (do dự, đả tọa, nhặt đồ, tranh quái). So Xích Mãng / Hắc Giao với số đo THÔ là so không công bằng (mô hình cho chúng 90 giây, không chừa khoảng ấy). Bảng dưới giữ giả định mô hình cho loài thường và đặt Xích Mãng / Hắc Giao = số đo (bản đồ chậm hơn) cộng độ vụng. Độ vụng chỉ ước lượng được từ các loài thường (trung vị trên ${pooled.filter((r) => !MONSTER_BY_ID[r.monsterId].boss).length} dòng: 8 loài x ${real.length} cỡ màn hình, ${SEARCH_SEEDS} hạt giống) và **dạng của nó là giả thuyết chưa kiểm chứng**, nên cho hai dạng: NHÂN (người chậm gấp k lần thợ săn ở mọi nơi) và CỘNG (người mất thêm b giây cố định mỗi lần tìm). Một hệ số CHUNG cho cả ba cỡ màn hình, vì số đo thô của trùm gần y hệt giữa ba cỡ (Xích Mãng Lạc Hà ${real.map((k) => n1(byView[k].find((r) => r.monsterId === "mang" && r.mapId === "lac_ha")!.mean)).join(" / ")} giây) nên hệ số riêng từng cỡ chỉ thêm nhiễu của loài thường. Thật nằm đâu đó giữa hai dạng; **số đo của bot / người (#410) mới phân xử được**.

| Giả thuyết độ vụng | Mức nhìn | Xích Mãng (s, giả định 90) | Hắc Giao (s, giả định 90) | Riêng Kim Đan (tối ưu) | Riêng Kim Đan (bãi mới) | Xích Mãng / bãi mới tốt nhất (Sơ / Trung / Hậu) |
|---|---|---:|---:|---:|---:|---:|
${calRows.join("\n")}

Tiêu chí #406 mục 1 sau hiệu chỉnh (tối đa của ba bậc; ĐẠT khi <= 1,5x), nhân: ${calVerdict("nhan")}. Cộng: ${calVerdict("cong")}. Xích Mãng tìm mỗi ${calMangSec("nhan")} giây (nhân) hoặc ${calMangSec("cong")} giây (cộng) chứ không phải ${ASSUME.searchSec.mang}; nhịp Kim Đan "tối ưu" ra ${calKimDan("nhan")} giờ (nhân) hoặc ${calKimDan("cong")} giờ (cộng), mục tiêu 5-7. ${cal.every((x) => worstMang(x.c.pace) > 1.5) ? `Cả hai giả thuyết ở cả ${real.length} cỡ màn hình đều KHÔNG ĐẠT (ít nhất một bậc vượt 1,5x; từng bậc ở cột cuối của bảng).` : "Có dòng ĐẠT, có dòng KHÔNG ĐẠT: xem từng dòng ở cột cuối."} Lấy bản đồ CHẬM hơn của Xích Mãng (Lạc Hà Trấn, 2 con) là cách nghiêng về phía mô hình: người chơi chọn Hắc Phong Cốc (6 con) sẽ tìm nhanh hơn (số đo thô ${range1(
    real.map((k) => byView[k].find((r) => r.monsterId === "mang" && r.mapId === "hac_phong")!.mean),
    n1,
  )} giây so với ${range1(
    real.map((k) => byView[k].find((r) => r.monsterId === "mang" && r.mapId === "lac_ha")!.mean),
    n1,
  )} giây).

**Ngưỡng hoà vốn cho #410.** Chạy \`simulate\` với \`ASSUME.searchSec.mang\` = T, tiêu chí #406 mục 1 đạt khi T >= **${Number.isFinite(breakEven) ? n0(breakEven) : "(không xác định)"} giây** giữa hai lần hạ Xích Mãng (mô hình hiện tại: ${ASSUME.searchSec.mang} giây, tối đa ${Math.max(...model.mangRatio).toFixed(2)}x). Bot (#410) là thuật toán như thợ săn ở đây, nên so số đo của bot với ngưỡng đó phải trừ độ vụng: bot đo NGẮN hơn ~${Number.isFinite(breakEven) ? n0(breakEven / slack.nhan) : "?"} giây (giả thuyết nhân) hoặc ~${Number.isFinite(breakEven) ? n0(Math.max(0, breakEven - slack.cong)) : "?"} giây (giả thuyết cộng) thì Xích Mãng nhanh quá mức tiêu chí; dài hơn thì đạt.

Đọc bảng: nhịp Kim Đan là hàm của giả định tìm quái. Mô hình ra ${gio(model.kimDan)} giờ (tối ưu) / ${gio(model.kimDanNoMang)} giờ (bãi mới); thợ săn ${hours}; biết hết bản đồ ${gio(sens.all.measured.kimDan)} / ${gio(sens.all.measured.kimDanNoMang)} giờ. Phần lớn chênh lệch tới từ Xích Mãng (nguồn nhanh nhất của cả ba bậc ở kịch bản tối ưu: ${src(model)}): giả định ${ASSUME.searchSec.mang} giây cho nó là một con số đoán và là cái quyết định nhịp "tối ưu". **Không sửa \`ASSUME.searchSec\` trong PR này**: số đo là thợ săn thuật toán, không phải người; con số quyết định là thời gian giữa hai lần hạ Xích Mãng của người chơi / bot thật (#410: bot chỉ nên biết quái trong vùng nhìn CHỮ NHẬT theo \`fitZoom\` như các cột trên, không đọc \`state.monsters\` của cả bản đồ). Khi bot (#410) có số đo, chọn giữa (a) giảm mật độ / kéo dài hồi sinh Xích Mãng (\`shared/\`, PR riêng) và (b) chấp nhận đường tắt Xích Mãng (đã có ca "tìm nhanh" 30 giây trong \`kim-dan.ts\`), hoặc sửa \`ASSUME.searchSec.mang\` cho khớp nếu số đo cao hơn ngưỡng hoà vốn. Số hạt giống nhiều hơn (${SEARCH_SEEDS_BOSS} cho trùm) và thợ săn khoá mục tiêu / quét vòng đã loại các lần kẹt hàng nghìn giây mô phỏng của bản đầu (#459).
`;
}
