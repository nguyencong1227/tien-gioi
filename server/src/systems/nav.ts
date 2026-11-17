// Tìm đường cho quái THEO BÁN KÍNH THÂN (QUYET_DINH_M3 mục 48, issue #1012). Chỉ server, không đụng `shared/`.
// Vì sao: quái đi thẳng tới mục tiêu và `moveWithCollision` chỉ trượt theo trục, nên trùm thân to kẹt ở cây / đá và người chơi đứng sau cây đánh trùm miễn phí.
//
// Lưới tìm đường: nút cách nhau `NAV_CELL` = nửa ô (16 px) để thân to lọt cả khe 2 ô (tâm thân nằm đúng RANH GIỚI hai ô, không phải tâm ô), thân nhỏ lọt khe 1 ô.
// Nút thông được cho cỡ thân `cls` khi HÌNH VUÔNG nửa cạnh `cls` quanh nút không chạm ô chặn (chặt hơn `circleBlocked`, vốn chỉ thử 4 góc + tâm, nên đơn điệu theo bán kính:
// thông cho cỡ lớn thì thông cho mọi cỡ nhỏ hơn, đường tìm ra đi được thật bằng `moveWithCollision` của thân thật). Cỡ thân làm tròn LÊN bội 4 px, kẹp [8, 32].
// A* 8 hướng, không cắt góc, có TRẦN số nút xét (không bao giờ tốn quá `NAV_MAX_NODES` nút một lần tìm). Không tới được đích (người đứng chỗ trùm không lọt tới) thì
// trả đường tới nút GẦN đích nhất đã xét (`reached: false`), để người gọi biết mà không đứng im.
// Dùng một bộ đệm chung cho mỗi bản đồ (không cấp phát trong lúc tìm), tìm xong chép ra mảng riêng; an toàn vì Node chạy một luồng và `findPath` không `await`.
import { TILE, type GameMap } from "@tien-gioi/shared";

/** Khoảng cách giữa hai nút lưới (px): nửa ô. */
export const NAV_CELL = TILE / 2;
/** Số nút tối đa một lần tìm được xét (trần CPU); quá thì trả đường tới nút gần đích nhất. */
export const NAV_MAX_NODES = 3000;
/**
 * Trọng số của heuristic (A* có trọng số): > 1 xét ít nút hơn nhiều (mô phỏng 100 quái đuổi ~3 lần nhanh hơn) đổi lại đường dài hơn chút (<= 1,5 lần trong trường hợp xấu nhất, thường ~5%): quái đuổi không cần đường tối ưu.
 * Chỉ ảnh hưởng thứ tự xét nút; `reached` / nút gần đích nhất vẫn tính theo heuristic gốc.
 */
export const NAV_H_WEIGHT = 1.5;
/** Bước lấy mẫu khi kiểm đường thẳng (px), nhỏ hơn nửa ô nên không lọt qua ô chặn. */
const LOS_STEP = 8;
const SQRT2 = Math.SQRT2;

/** Cỡ thân tìm đường: bán kính thân thật làm tròn LÊN bội của 4 px, kẹp [8, 32]. */
export function navClassOf(r: number): number {
  return Math.min(32, Math.max(8, Math.ceil(r / 4) * 4));
}

/** Độ nới quanh khu an toàn (px) mà quái cỡ `cls` không bước vào: `def.radius + 8` với `def.radius` = bán kính di chuyển / 0,8 (`monsters.ts`). */
export function safePadOf(cls: number): number {
  return cls / 0.8 + 8;
}

/** Hình vuông nửa cạnh `r` quanh (x, y) không chạm ô chặn nào (kể cả ô chỉ chạm mép). Ngoài bản đồ tính là chặn. */
export function squareFree(map: GameMap, x: number, y: number, r: number): boolean {
  const x0 = Math.floor((x - r) / TILE);
  const x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE);
  const y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) if (isBlockedTile(map, tx, ty)) return false;
  return true;
}

function isBlockedTile(map: GameMap, tx: number, ty: number): boolean {
  // `isBlockedPx` đã coi ngoài bản đồ là đá; lấy tâm ô để tra đúng ô (tx, ty)
  return map.isBlockedPx(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
}

/**
 * Đường thẳng từ (x0, y0) tới (x1, y1) đi được cho thân bán kính `r` (cùng phép thử `circleBlocked` với `moveWithCollision`, nên khớp chuyển động thật)? Lấy mẫu mỗi
 * `LOS_STEP` px, kể cả hai đầu. `safePad` (tuỳ chọn): đường chạm khu an toàn nới thêm chừng này (px) cũng coi là bị chặn (quái không bước vào khu an toàn).
 */
export function lineClear(
  map: GameMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  safePad?: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const n = Math.max(1, Math.ceil(len / LOS_STEP));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    if (map.circleBlocked(x, y, r)) return false;
    // Quái không bước vào khu an toàn (nới `safePad`): đường xuyên qua đó coi như bị chặn
    if (safePad !== undefined && map.inSafe(x, y, safePad)) return false;
  }
  return true;
}

/**
 * Như `lineClear` nhưng bằng hình vuông (chặt hơn): dùng để làm thẳng đường A*. Lấy mẫu mỗi `LOS_STEP` px và NỚI nửa cạnh thêm `LOS_STEP / 2` để hình vuông ở điểm giữa hai mẫu
 * (lệch tối đa nửa bước theo mỗi trục) luôn nằm trong hình vuông của mẫu gần nhất: đoạn thẳng được duyệt thì mọi điểm trên nó thông cho cỡ `r`, không sót góc ô chặn ở đường chéo.
 */
function lineSquareFree(
  map: GameMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  safePad: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / LOS_STEP));
  const rr = r + LOS_STEP / 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    if (!squareFree(map, x, y, rr) || map.inSafe(x, y, safePad + LOS_STEP / 2)) return false;
  }
  return true;
}

/** Kết quả một lần tìm: các điểm (x0, y0, x1, y1, ...) theo px từ chỗ đứng tới đích (đã làm thẳng) và có tới đích thật không. */
export interface NavPath {
  /** Toạ độ xen kẽ x, y; có ít nhất một điểm. Điểm đầu là nút gần chỗ đứng nhất. */
  pts: Float32Array;
  /** `true`: tới được vùng đích (trong `goalR` của đích). `false`: chỉ tới nút gần đích nhất đã xét. */
  reached: boolean;
  /** Số nút đã xét (để đo CPU / test). */
  expanded: number;
}

class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly masks = new Map<number, Uint8Array>();
  private readonly regions = new Map<number, Uint8Array>();
  // Bộ đệm A* dùng chung (tránh cấp phát): `stamp[i] === run` nghĩa là g[i] / parent[i] hợp lệ trong lần tìm này
  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  private readonly stamp: Uint32Array;
  private readonly closed: Uint32Array;
  private run = 0;
  private heapK: Float32Array;
  private heapV: Int32Array;
  private heapN = 0;

  constructor(readonly map: GameMap) {
    this.cols = map.def.w * 2 + 1;
    this.rows = map.def.h * 2 + 1;
    const n = this.cols * this.rows;
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    const cap = (NAV_MAX_NODES + 1) * 8;
    this.heapK = new Float32Array(cap);
    this.heapV = new Int32Array(cap);
  }

  /** Mặt nạ thông được cho cỡ `cls` (1 = thông), dựng lười một lần. */
  mask(cls: number): Uint8Array {
    let m = this.masks.get(cls);
    if (m) return m;
    m = new Uint8Array(this.cols * this.rows);
    // Quái không bước vào khu an toàn (`monsters.ts`: `inSafe(x, y, def.radius + 8)`, `def.radius` = bán kính di chuyển / 0,8): nút trong khu đó (nới theo cỡ) coi là chặn,
    // nếu không đường A* xuyên qua trấn / cổng và trùm đứng ngơ ở mép khu an toàn.
    const safePad = safePadOf(cls);
    for (let j = 0; j < this.rows; j++)
      for (let i = 0; i < this.cols; i++) {
        const x = i * NAV_CELL;
        const y = j * NAV_CELL;
        m[j * this.cols + i] =
          squareFree(this.map, x, y, cls) && !this.map.inSafe(x, y, safePad) ? 1 : 0;
      }
    this.masks.set(cls, m);
    return m;
  }

  /** Nút thông gần (x, y) nhất trong vòng `ring` nút quanh ô làm tròn; -1 nếu không có. */
  nearestFree(mask: Uint8Array, x: number, y: number, ring: number): number {
    const ci = Math.round(x / NAV_CELL);
    const cj = Math.round(y / NAV_CELL);
    let best = -1;
    let bestD = Infinity;
    for (let j = cj - ring; j <= cj + ring; j++) {
      if (j < 0 || j >= this.rows) continue;
      for (let i = ci - ring; i <= ci + ring; i++) {
        if (i < 0 || i >= this.cols) continue;
        const k = j * this.cols + i;
        if (!mask[k]) continue;
        const d = Math.hypot(i * NAV_CELL - x, j * NAV_CELL - y);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
    }
    return best;
  }

  /** Vùng CHÍNH cho cỡ `cls`: thành phần liên thông (8 hướng, không cắt góc) có nhiều nút nhất = thế giới mở. Túi kín / khoảnh đất cô lập không thuộc vùng này. Dựng lười một lần mỗi cỡ. */
  mainRegion(cls: number): Uint8Array {
    const hit = this.regions.get(cls);
    if (hit) return hit;
    const mask = this.mask(cls);
    const label = new Int32Array(mask.length); // 0 = chưa gán
    const queue = new Int32Array(mask.length);
    let bestLabel = 0;
    let bestSize = 0;
    let next = 0;
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || label[s]) continue;
      const id = ++next;
      let head = 0;
      let tail = 0;
      queue[tail++] = s;
      label[s] = id;
      while (head < tail) {
        const k = queue[head++];
        const ci = k % this.cols;
        const cj = (k - ci) / this.cols;
        for (let d = 0; d < 8; d++) {
          const ni = ci + DI[d];
          const nj = cj + DJ[d];
          if (ni < 0 || nj < 0 || ni >= this.cols || nj >= this.rows) continue;
          const nk = nj * this.cols + ni;
          if (label[nk] || !mask[nk]) continue;
          if (d >= 4 && (!mask[cj * this.cols + ni] || !mask[nj * this.cols + ci])) continue; // chéo: không cắt góc
          label[nk] = id;
          queue[tail++] = nk;
        }
      }
      if (tail > bestSize) {
        bestSize = tail;
        bestLabel = id;
      }
    }
    const region = new Uint8Array(mask.length);
    if (bestLabel) for (let k = 0; k < label.length; k++) if (label[k] === bestLabel) region[k] = 1;
    this.regions.set(cls, region);
    return region;
  }

  private push(k: number, v: number) {
    let i = this.heapN++;
    const hk = this.heapK;
    const hv = this.heapV;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= k) break;
      hk[i] = hk[p];
      hv[i] = hv[p];
      i = p;
    }
    hk[i] = k;
    hv[i] = v;
  }

  private pop(): number {
    const hk = this.heapK;
    const hv = this.heapV;
    const top = hv[0];
    const n = --this.heapN;
    if (n > 0) {
      const k = hk[n];
      const v = hv[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= k) break;
        hk[i] = hk[c];
        hv[i] = hv[c];
        i = c;
      }
      hk[i] = k;
      hv[i] = v;
    }
    return top;
  }

  /**
   * A* từ nút gần (sx, sy) tới bất kỳ nút thông nào cách (gx, gy) không quá `goalR`. `avoid` (tuỳ chọn): nút trong bán kính `avoidR` quanh (ax, ay) coi như CHẶN
   * (thử lối khác khi kẹt). Trả `null` nếu không có nút thông nào gần chỗ đứng (đang đứng trong vật chặn).
   */
  find(
    cls: number,
    sx: number,
    sy: number,
    gx: number,
    gy: number,
    goalR: number,
    avoid?: { x: number; y: number; r: number },
  ): NavPath | null {
    const mask = this.mask(cls);
    const cols = this.cols;
    const start = this.nearestFree(mask, sx, sy, 2);
    if (start < 0) return null;
    const run = ++this.run;
    const { g, parent, stamp, closed } = this;
    this.heapN = 0;
    const heur = (i: number, j: number) =>
      Math.max(0, Math.hypot(i * NAV_CELL - gx, j * NAV_CELL - gy) - goalR) / NAV_CELL;
    const si = start % cols;
    const sj = (start - si) / cols;
    g[start] = 0;
    parent[start] = -1;
    stamp[start] = run;
    this.push(NAV_H_WEIGHT * heur(si, sj), start);
    let best = start;
    let bestH = heur(si, sj);
    let reachedAt = -1;
    let expanded = 0;
    const avoidR2 = avoid ? avoid.r * avoid.r : 0;
    const cap = this.heapK.length - 8;
    while (this.heapN > 0 && expanded < NAV_MAX_NODES && this.heapN < cap) {
      const k = this.pop();
      if (closed[k] === run) continue;
      closed[k] = run;
      expanded++;
      const ci = k % cols;
      const cj = (k - ci) / cols;
      const h = heur(ci, cj);
      if (h < bestH || (h === bestH && g[k] < g[best])) {
        bestH = h;
        best = k;
      }
      if (h === 0) {
        reachedAt = k;
        break;
      }
      for (let d = 0; d < 8; d++) {
        const ni = ci + DI[d];
        const nj = cj + DJ[d];
        if (ni < 0 || nj < 0 || ni >= cols || nj >= this.rows) continue;
        const nk = nj * cols + ni;
        if (!mask[nk] || closed[nk] === run) continue;
        if (d >= 4 && (!mask[cj * cols + ni] || !mask[nj * cols + ci])) continue; // chéo: không cắt góc
        if (avoid) {
          const ax = ni * NAV_CELL - avoid.x;
          const ay = nj * NAV_CELL - avoid.y;
          if (ax * ax + ay * ay <= avoidR2) continue;
        }
        const ng = g[k] + (d >= 4 ? SQRT2 : 1);
        if (stamp[nk] === run && g[nk] <= ng) continue;
        stamp[nk] = run;
        g[nk] = ng;
        parent[nk] = k;
        this.push(ng + NAV_H_WEIGHT * heur(ni, nj), nk);
      }
    }
    const end = reachedAt >= 0 ? reachedAt : best;
    // Dựng lại đường (từ đích về chỗ đứng) rồi đảo
    const nodes: number[] = [];
    for (let k = end; k >= 0; k = parent[k]) nodes.push(k);
    nodes.reverse();
    return { pts: this.smooth(nodes, cls), reached: reachedAt >= 0, expanded };
  }

  /** Làm thẳng đường: từ mỗi điểm nhảy tới điểm xa nhất còn nhìn thấy bằng đường thẳng thông cho cỡ `cls`. Nút đầu = chỗ đứng gần nhất. */
  private smooth(nodes: number[], cls: number): Float32Array {
    const cols = this.cols;
    const px = (k: number) => (k % cols) * NAV_CELL;
    const py = (k: number) => Math.floor(k / cols) * NAV_CELL;
    const out: number[] = [px(nodes[0]), py(nodes[0])];
    let a = 0;
    while (a < nodes.length - 1) {
      let b = a + 1;
      // Mở rộng tới điểm xa nhất nhìn thấy (đơn điệu đủ tốt cho đường ngắn; dừng ở lần chặn đầu tiên)
      while (
        b + 1 < nodes.length &&
        lineSquareFree(
          this.map,
          px(nodes[a]),
          py(nodes[a]),
          px(nodes[b + 1]),
          py(nodes[b + 1]),
          cls,
          safePadOf(cls),
        )
      )
        b++;
      out.push(px(nodes[b]), py(nodes[b]));
      a = b;
    }
    return Float32Array.from(out);
  }
}

// 4 hướng thẳng (0..3) rồi 4 hướng chéo (4..7)
const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];

const grids = new WeakMap<GameMap, NavGrid>();

function gridOf(map: GameMap): NavGrid {
  let g = grids.get(map);
  if (!g) {
    g = new NavGrid(map);
    grids.set(map, g);
  }
  return g;
}

/**
 * Tìm đường cho thân bán kính `r` từ (sx, sy) tới vùng cách (gx, gy) không quá `goalR` (px). `null` khi chỗ đứng không có nút thông nào gần (thân đang kẹt trong vật chặn):
 * người gọi quay về đi thẳng như cũ. `avoid`: vùng coi như chặn (thử lối khác).
 */
export function findPath(
  map: GameMap,
  r: number,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  goalR: number,
  avoid?: { x: number; y: number; r: number },
): NavPath | null {
  return gridOf(map).find(navClassOf(r), sx, sy, gx, gy, goalR, avoid);
}

/**
 * (x, y) có nằm trong VÙNG CHÍNH của bản đồ cho thân bán kính `r` (thành phần liên thông lớn nhất của lưới tìm đường, tức thế giới mở) không? Dùng để chọn chỗ sinh trùm: không sinh
 * trong túi kín / khoảnh đất cô lập / chỗ chỉ thân nhỏ lọt, nơi người chơi không dẫn được trùm ra và trùm không đi đâu được.
 */
export function inMainRegion(map: GameMap, r: number, x: number, y: number): boolean {
  const grid = gridOf(map);
  const cls = navClassOf(r);
  const k = grid.nearestFree(grid.mask(cls), x, y, 1);
  return k >= 0 && grid.mainRegion(cls)[k] === 1;
}

/**
 * Dựng sẵn mặt nạ (và vùng chính cho loại có trùm) của MỌI cỡ thân quái có ở bản đồ này, lúc tạo phòng: mỗi cỡ tốn vài ms một lần, không để lần đầu quái cần đường làm tick vọt lên giữa trận.
 * `radii`: bán kính di chuyển (`def.radius * 0.8`) của các loài; `bossRadii`: riêng loài trùm (cần vùng chính để chọn chỗ sinh).
 */
export function warmNav(map: GameMap, radii: readonly number[], bossRadii: readonly number[] = []) {
  const grid = gridOf(map);
  for (const r of radii) grid.mask(navClassOf(r));
  for (const r of bossRadii) grid.mainRegion(navClassOf(r));
}

/** Số nút thông của cỡ `r` (để test / số liệu). */
export function navOpenNodes(map: GameMap, r: number): number {
  const m = gridOf(map).mask(navClassOf(r));
  let n = 0;
  for (let i = 0; i < m.length; i++) n += m[i];
  return n;
}
