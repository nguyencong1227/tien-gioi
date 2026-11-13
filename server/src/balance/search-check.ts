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
/** Số lần hạ tính mỗi hạt giống (loài thường / trùm: trùm mỗi trận rất dài nên ít lần hơn) */
export const SEARCH_KILLS = 12;
export const SEARCH_KILLS_BOSS = 6;
/** Chạy tối đa (giây mô phỏng) mỗi hạt giống, phòng quái hết sạch */
const MAX_SECONDS = 3 * 3600;
/** Tính lại đường đi mỗi bấy nhiêu tick (1 giây) */
const REPLAN_TICKS = 20;
/** Bước thẳng tới con quái khi đã hết đường tính và còn cách nó không quá chừng này (px, ~3 ô) */
const FINAL_APPROACH_PX = 100;

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

// --- Thợ săn --------------------------------------------------------------------------------------------------------

export interface SearchRun {
  /** Giây tìm quái trước mỗi lần hạ (đã bỏ WARM_KILLS lần đầu) */
  searches: number[];
  /** Tổng giây mô phỏng đã chạy */
  simSeconds: number;
}

/**
 * Một thợ săn bất tử của (bậc `realm`, `tier`) săn loài `monsterId` ở bản đồ `mapId` cho tới đủ `kills` lần hạ (sau khi bỏ lần khởi động).
 * `view`: bán kính nhìn thấy quái (px). Vô hạn = biết vị trí MỌI con trên bản đồ (cận dưới tuyệt đối); hữu hạn = chỉ biết con trong tầm nhìn,
 * không thấy con nào thì đi tới một điểm ngẫu nhiên cách `view` - 2 x `view` để khám phá (gần người chơi thật hơn).
 */
export function searchRun(
  mapId: string,
  monsterId: string,
  realm: number,
  tier: number,
  kills: number,
  seed: number,
  view = Infinity,
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
      let near = null as { x: number; y: number; d: number } | null;
      w.state.monsters.forEach((m) => {
        if (m.kind !== monsterId) return;
        const d = Math.hypot(m.x - p.x, m.y - p.y);
        if (d <= reachOf(m.kind) && (!near || d < near.d)) near = { x: m.x, y: m.y, d };
      });

      if (near) {
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
        continue;
      }

      // chưa có con nào trong tầm: đi tìm
      searchAcc += dt;
      if (replanIn-- <= 0 || (exploring && wpi >= waypoints.length)) {
        replanIn = REPLAN_TICKS;
        const goals = new Set<number>();
        w.state.monsters.forEach((m) => {
          if (m.kind !== monsterId) return;
          if (Math.hypot(m.x - p.x, m.y - p.y) > view) return; // chưa thấy
          const mx = Math.floor(m.x / TILE),
            my = Math.floor(m.y / TILE);
          // đích là ô con quái đứng; nếu ô đó bị chặn (đứng sát tường) thì lấy các ô đi được quanh nó
          const own = my * grid.w + mx;
          if (grid.free[own]) return void goals.add(own);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const gx = mx + dx,
                gy = my + dy;
              if (gx < 0 || gy < 0 || gx >= grid.w || gy >= grid.h) continue;
              const gi = gy * grid.w + gx;
              if (grid.free[gi]) goals.add(gi);
            }
        });
        // thấy con nào thì đuổi theo con gần nhất (theo đường đi); không thấy thì khám phá, giữ đường khám phá đang đi tới khi hết
        let path: ReturnType<typeof planPath> = null;
        let keep = false;
        if (goals.size > 0) {
          path = planPath(grid, p.x, p.y, goals);
          exploring = false;
        } else if (exploring && wpi < waypoints.length) {
          keep = true;
        } else {
          const lo = Number.isFinite(view) ? view : 800;
          const target = new Set<number>();
          for (let i = 0; i < 40 && target.size === 0; i++) {
            const a = Math.random() * Math.PI * 2,
              r = lo * (1 + Math.random());
            const gx = Math.floor((p.x + Math.cos(a) * r) / TILE),
              gy = Math.floor((p.y + Math.sin(a) * r) / TILE);
            if (gx >= 0 && gy >= 0 && gx < grid.w && gy < grid.h && grid.free[gy * grid.w + gx])
              target.add(gy * grid.w + gx);
          }
          path = target.size > 0 ? planPath(grid, p.x, p.y, target) : null;
          exploring = true;
        }
        if (!keep) {
          waypoints = path
            ? path.cells.slice(1).map((c) => ({
                x: ((c % grid.w) + 0.5) * TILE,
                y: (((c / grid.w) | 0) + 0.5) * TILE,
              }))
            : [];
          wpi = 0;
        }
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

/**
 * Các mức tầm nhìn đem đo (px): biết hết bản đồ (cận dưới), màn hình máy tính (~nửa chiều rộng 1280 px), màn hình điện thoại ngang
 * (~nửa chiều rộng 640 px). Quái "ngủ" ngoài `MONSTER_WAKE_DIST` (900 px) vẫn đứng yên, người chơi không nhìn thấy chúng bằng mắt nên không tính.
 */
export const SEARCH_VIEWS = { all: Infinity, pc: 640, phone: 320 } as const;

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

export function searchCheck(c: SearchCase, view = Infinity): SearchRow {
  const map = getMap(c.mapId)!;
  const def = MONSTER_BY_ID[c.monsterId];
  const kills = def.boss ? SEARCH_KILLS_BOSS : SEARCH_KILLS;
  const all: number[] = [];
  for (let seed = 1; seed <= SEARCH_SEEDS; seed++)
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

/** Chạy `simulate` hai lần: với `ASSUME.searchSec` của mô hình và với số đo của `rows` (khôi phục sau khi xong). */
export function searchSensitivity(rows: readonly SearchRow[]): SearchSensitivity {
  const model = finishMinutes();
  const searchSec: Record<string, number> = {};
  for (const r of rows) searchSec[r.monsterId] = Math.max(searchSec[r.monsterId] ?? 0, r.mean);
  const saved = { ...ASSUME.searchSec };
  try {
    Object.assign(ASSUME.searchSec, searchSec);
    return { model, measured: finishMinutes(), searchSec };
  } finally {
    for (const k of Object.keys(ASSUME.searchSec)) delete ASSUME.searchSec[k];
    Object.assign(ASSUME.searchSec, saved);
  }
}

// --- Mục 10 của CAN_BANG.md -----------------------------------------------------------------------------------------

const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const n1 = (x: number) => x.toFixed(1);
const gio = (min: number) => (min / 60).toFixed(1);

/** Mục 10 của "Kim Đan sau nội dung" trong `docs/CAN_BANG.md`. */
export function renderSearchCheck(): string {
  const cases = searchCases();
  const views = Object.entries(SEARCH_VIEWS) as [keyof typeof SEARCH_VIEWS, number][];
  const byView = Object.fromEntries(
    views.map(([k, v]) => [k, cases.map((c) => searchCheck(c, v))]),
  ) as Record<keyof typeof SEARCH_VIEWS, SearchRow[]>;
  const cell = (r: SearchRow) => `${n1(r.mean)} (${n1(r.median)})`;
  const lines = cases.map((c, i) => {
    const all = byView.all[i],
      pc = byView.pc[i],
      phone = byView.phone[i];
    return `| ${all.mapName} | ${MONSTER_BY_ID[c.monsterId].name} | ${all.cap} | ${all.assumed} | ${cell(all)} | ${cell(pc)} | ${cell(phone)} |`;
  });
  const worstAll = Math.max(...byView.all.map((r) => r.ratio));
  const normal = (rows: SearchRow[]) => rows.filter((r) => !MONSTER_BY_ID[r.monsterId].boss);
  const pcNormal = normal(byView.pc),
    phoneNormal = normal(byView.phone);
  const range = (rows: SearchRow[]) =>
    `${Math.min(...rows.map((r) => r.ratio)).toFixed(2)}x - ${Math.max(...rows.map((r) => r.ratio)).toFixed(2)}x`;
  const mang = (rows: SearchRow[]) => rows.filter((r) => r.monsterId === "mang");
  const mangRange = (rows: SearchRow[]) =>
    `${n0(Math.min(...mang(rows).map((r) => r.mean)))} - ${n0(Math.max(...mang(rows).map((r) => r.mean)))}`;
  const sens = {
    all: searchSensitivity(byView.all),
    pc: searchSensitivity(byView.pc),
    phone: searchSensitivity(byView.phone),
  };
  const src = (p: SearchPace) =>
    [...new Set(p.kimDanSources)].map((id) => MONSTER_BY_ID[id]?.name ?? id).join(", ");
  const paceRow = (label: string, p: SearchPace) =>
    `| ${label} | ${n0(p.luyenKhi)} | ${n0(p.trucCo)} | ${n0(p.kimDan)} (${gio(p.kimDan)} giờ) | ${n0(p.kimDanNoMang)} (${gio(p.kimDanNoMang)} giờ) | ${src(p)} | ${p.mangRatio.map((r) => r.toFixed(2)).join(" / ")} |`;
  const model = sens.all.model;
  const worstMang = (p: SearchPace) => Math.max(...p.mangRatio);
  const verdict = (label: string, p: SearchPace) =>
    `${label} ${worstMang(p) <= 1.5 ? "ĐẠT" : "KHÔNG ĐẠT"} (tối đa ${worstMang(p).toFixed(2)}x)`;
  const criterion = [
    verdict("mô hình", model),
    verdict(`tầm nhìn ${SEARCH_VIEWS.pc} px`, sens.pc.measured),
    verdict(`tầm nhìn ${SEARCH_VIEWS.phone} px`, sens.phone.measured),
    verdict("biết hết bản đồ", sens.all.measured),
  ].join("; ");
  const bossRow = byView.pc.find((r) => r.monsterId === "hac_giao")!;
  return `### 10. Thời gian tìm quái (#406 mục 7)

Phần mục 9 không kiểm. \`ASSUME.searchSec\` (giây từ lúc hạ con này tới lúc chạm con kế tiếp) quyết định tu vi / giờ của MỌI bãi, nhưng trước đây chỉ là con số đoán. Đây là số đo bằng mã server thật (\`search-check.ts\`): dựng \`World\` của từng bản đồ (quái sinh bằng \`spawnInitial\`, hồi sinh bằng \`topUpMonsters\` mỗi ${MONSTER_RESPAWN_MS / 1000} giây, AI quái thật gồm phát hiện + đuổi), một thợ săn bất tử săn đúng một loài: tới con GẦN NHẤT THEO ĐƯỜNG ĐI (Dijkstra trên lưới ô, tránh tường và nước), tới tầm thì đánh \`slash\` thật. Thời gian tìm = các giây không có con nào trong tầm đánh, tính từ lúc hạ con trước (bỏ ${WARM_KILLS} lần hạ đầu: đi từ trấn ra bãi). ${SEARCH_SEEDS} cách rải quái (hạt giống) x ${SEARCH_KILLS} lần hạ (trùm: ${SEARCH_KILLS_BOSS}).

Ba mức hiểu biết của thợ săn (đo càng thật thì càng chậm): **biết hết bản đồ** (cận dưới tuyệt đối: vị trí mọi con luôn hiện ra), **tầm nhìn ${SEARCH_VIEWS.pc} px** (nửa chiều rộng màn hình máy tính 1280 px), **tầm nhìn ${SEARCH_VIEWS.phone} px** (nửa chiều rộng điện thoại ngang). Hai mức sau chỉ thấy con trong bán kính đó; không thấy con nào thì đi tới một điểm ngẫu nhiên cách ${SEARCH_VIEWS.phone}-${SEARCH_VIEWS.pc} px trở lên để khám phá (cách khám phá ngây thơ hơn người thật, người thật nhớ chỗ quái hay đứng). Mỗi ô: trung bình giây (trung vị).

| Bản đồ | Loài | Số con | Giả định (s) | Biết hết bản đồ | Tầm nhìn ${SEARCH_VIEWS.pc} px | Tầm nhìn ${SEARCH_VIEWS.phone} px |
|---|---|---:|---:|---:|---:|---:|
${lines.join("\n")}

- **Mô hình KHÔNG lạc quan:** thợ săn biết hết bản đồ (cận dưới) đo tối đa **${worstAll.toFixed(2)}x** giả định (ngưỡng #406: mô hình lạc quan nếu > ${SEARCH_OPTIMISM_LIMIT}x). \`search-check.test.ts\` giữ điều này: ai hạ \`ASSUME.searchSec\` xuống dưới cận dưới thì test đỏ.
- **Loài thường: giả định nằm giữa hai mức nhìn.** Đo / giả định ${range(pcNormal)} ở tầm nhìn ${SEARCH_VIEWS.pc} px và ${range(phoneNormal)} ở ${SEARCH_VIEWS.phone} px (điện thoại, khám phá ngẫu nhiên: thô hơn người thật). Không sửa số nào.
- **Xích Mãng (giả định ${ASSUME.searchSec.mang} giây) và Hắc Giao (${ASSUME.searchSec.hac_giao} giây) là chỗ nhạy:** Xích Mãng đo ${mangRange(byView.pc)} giây ở ${SEARCH_VIEWS.pc} px và ${mangRange(byView.phone)} giây ở ${SEARCH_VIEWS.phone} px (quái thưa: ${byView.all
    .filter((r) => r.monsterId === "mang")
    .map((r) => `${r.cap} con ở ${r.mapName}`)
    .join(", ")}); Hắc Giao (${bossRow.cap} con) ${n0(bossRow.mean)} giây ở ${SEARCH_VIEWS.pc} px.

**Nhịp tu luyện nhạy với giả định này.** Cùng \`simulate(3)\` như mục "Kim Đan sau nội dung" (một người, quái an toàn nhanh nhất mỗi bậc; "tối ưu" kể cả Xích Mãng, "bãi mới" không đụng Xích Mãng), thay \`ASSUME.searchSec\` bằng số đo từng mức nhìn (loài ở nhiều bản đồ: lấy bản đồ chậm hơn). Phút cộng dồn tới hết Luyện Khí và Trúc Cơ, rồi phút RIÊNG cảnh giới Kim Đan (mục tiêu: 5-7 giờ):

| Giả định tìm quái | Hết Luyện Khí (cộng dồn) | Hết Trúc Cơ (cộng dồn) | Riêng Kim Đan (tối ưu) | Riêng Kim Đan (bãi mới) | Nguồn nhanh nhất ở Kim Đan (tối ưu) | Xích Mãng / bãi mới tốt nhất (Sơ / Trung / Hậu) |
|---|---:|---:|---:|---:|---|---:|
${paceRow("Mô hình (giả định hiện tại)", model)}
${paceRow("Biết hết bản đồ (cận dưới)", sens.all.measured)}
${paceRow(`Tầm nhìn ${SEARCH_VIEWS.pc} px`, sens.pc.measured)}
${paceRow(`Tầm nhìn ${SEARCH_VIEWS.phone} px`, sens.phone.measured)}

Tiêu chí #406 mục 1 ("không nguồn nào vượt ~1,5x bãi mới tốt nhất cùng bậc", cột cuối): ${criterion}.

Đọc bảng: nhịp Kim Đan là hàm của giả định tìm quái. Mô hình ra ${gio(model.kimDan)} giờ (tối ưu) / ${gio(model.kimDanNoMang)} giờ (bãi mới); thợ săn nhìn rộng ra ${gio(sens.pc.measured.kimDan)} / ${gio(sens.pc.measured.kimDanNoMang)} giờ, nhìn hẹp ra ${gio(sens.phone.measured.kimDan)} / ${gio(sens.phone.measured.kimDanNoMang)} giờ, biết hết bản đồ ${gio(sens.all.measured.kimDan)} / ${gio(sens.all.measured.kimDanNoMang)} giờ. Phần lớn chênh lệch tới từ Xích Mãng (nguồn nhanh nhất của cả ba bậc ở kịch bản tối ưu: ${src(model)}): giả định ${ASSUME.searchSec.mang} giây cho nó là một con số đoán và là cái quyết định nhịp "tối ưu". **Không sửa \`ASSUME.searchSec\`**: số đo là thợ săn thuật toán, không phải người; con số quyết định là thời gian giữa hai lần hạ Xích Mãng của người chơi / bot thật (#410: bot chỉ nên biết quái trong tầm nhìn như hai cột tầm nhìn ở đây, không đọc \`state.monsters\` của cả bản đồ). ${sens.pc.measured.kimDan / 60 < 5 ? `Xích Mãng đo nhanh hơn giả định ở tầm nhìn máy tính nên người chơi máy tính có thể qua Kim Đan nhanh hơn mục tiêu (${gio(sens.pc.measured.kimDan)} giờ so với 5-7) bằng đường Xích Mãng; ` : ""}\`kim-dan.ts\` đã có ca "tìm nhanh" 30 giây cho đường tắt đan.
`;
}
