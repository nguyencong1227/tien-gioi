/**
 * Vẽ bản đồ nhỏ và bản đồ lớn (QUYET_DINH_M3 mục 17.2, issue #496 bước 2). Dữ liệu tĩnh lấy từ `map-overview.ts` (`getMapOverview`,
 * `terrainRGBA`); `WorldScene.syncMaps` chỉ gom phần ĐỘNG (mình, đồng đội, người khác, quái, mục tiêu nhiệm vụ) rồi vẽ chồng lên lớp nền ở đây.
 *
 * Tách làm hai phần:
 *  - PHẦN THUẦN (test được trong môi trường node): `fitView` (khung nhìn vừa canvas, giữ tỉ lệ), `zoneColor` / `zoneRGBA` (màu khu quái theo
 *    cấp), `placeLabels` (đặt nhãn không chồng nhau theo độ ưu tiên), `canvasPixelSize` (kích thước điểm ảnh theo CSS và `devicePixelRatio`);
 *  - PHẦN VẼ (cần `CanvasRenderingContext2D`): `terrainCanvas` dựng ảnh địa hình MỘT lần cho mỗi (bản đồ, kích thước, lớp khu quái) rồi
 *    `drawImage` mỗi khung (không tô lại từng ô mỗi 250 ms), `drawMapBase`, `drawMarkerMe`.
 *
 * Mọi kích thước hình vẽ tính theo `u` = điểm ảnh canvas cho mỗi điểm ảnh CSS (`devicePixelRatio`): canvas được tạo ở độ phân giải thật nên chữ
 * luôn >= `MIN_FONT_CSS_PX` điểm ảnh CSS thực, không bị co giãn mờ như canvas 120 / 384 cố định trước đây.
 */
import { TILE } from "@tien-gioi/shared";
import { terrainRGBA, type MapOverview, type Rgb } from "./map-overview";

/** Cỡ chữ nhỏ nhất của nhãn trên bản đồ, tính bằng điểm ảnh CSS (đọc được trên điện thoại). */
export const MIN_FONT_CSS_PX = 12;
/** Tỉ lệ điểm ảnh thiết bị tối đa: trên 3 chỉ tốn bộ nhớ mà mắt không thấy khác. */
export const MAX_DPR = 3;
const FONT_FAMILY = '"Noto Serif", Georgia, serif';

// ---------------------------------------------------------------- Khung nhìn

/** Phép biến đổi toạ độ thế giới (px) sang toạ độ canvas: `cx = x * scale + ox`. */
export interface MapView {
  readonly scale: number;
  readonly ox: number;
  readonly oy: number;
}

/**
 * Khung nhìn vừa trọn bản đồ `worldW x worldH` (px thế giới) trong canvas `cw x ch`, giữ tỉ lệ và căn giữa; `pad` là lề mỗi cạnh (điểm ảnh
 * canvas). Canvas hoặc bản đồ kích thước không hợp lệ trả khung nhìn tỉ lệ 1 ở gốc (không bao giờ NaN / Infinity).
 */
export function fitView(worldW: number, worldH: number, cw: number, ch: number, pad = 0): MapView {
  if (!(worldW > 0 && worldH > 0 && cw > 0 && ch > 0)) return { scale: 1, ox: 0, oy: 0 };
  const aw = Math.max(1, cw - 2 * pad);
  const ah = Math.max(1, ch - 2 * pad);
  const scale = Math.min(aw / worldW, ah / worldH);
  return { scale, ox: (cw - worldW * scale) / 2, oy: (ch - worldH * scale) / 2 };
}

/**
 * Kích thước điểm ảnh của canvas có kích thước CSS `cssW x cssH`: nhân `devicePixelRatio` (kẹp 1..`MAX_DPR`), làm tròn, tối thiểu 1.
 * `u` là hệ số đổi điểm ảnh CSS sang điểm ảnh canvas (dùng cho cỡ chữ, nét vẽ, biểu tượng).
 */
export function canvasPixelSize(
  cssW: number,
  cssH: number,
  dpr: number,
): { w: number; h: number; u: number } {
  const u = Math.min(MAX_DPR, Math.max(1, Number.isFinite(dpr) ? dpr : 1));
  return {
    w: Math.max(1, Math.round((Number.isFinite(cssW) ? cssW : 0) * u)),
    h: Math.max(1, Math.round((Number.isFinite(cssH) ? cssH : 0) * u)),
    u,
  };
}

// ---------------------------------------------------------------- Khu quái -> màu

const ZONE_LOW: Rgb = [96, 200, 96];
const ZONE_MID: Rgb = [236, 204, 70];
const ZONE_HIGH: Rgb = [226, 84, 70];

function lerp3(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Màu khu quái thứ `i` trong `n` khu (cấp tăng dần): xanh lá -> vàng -> đỏ. Một khu duy nhất lấy màu vàng. */
export function zoneColor(i: number, n: number): Rgb {
  if (n <= 1) return ZONE_MID;
  const t = Math.min(1, Math.max(0, i / (n - 1)));
  return t < 0.5 ? lerp3(ZONE_LOW, ZONE_MID, t * 2) : lerp3(ZONE_MID, ZONE_HIGH, (t - 0.5) * 2);
}

/** Độ đục của lớp tô khu quái (0-255): đủ thấy ranh giới mà không che địa hình. */
export const ZONE_ALPHA = 64;

/**
 * Lớp tô khu quái RGBA (`outW * outH * 4`, ô ngoài khu quái trong suốt): mỗi điểm ảnh lấy khu của ô ở GIỮA khối ô nó phủ (không trung bình
 * màu: ranh giới giữa hai khu vẫn nét). Cùng kích thước với `terrainRGBA` để chồng khít.
 */
export function zoneRGBA(
  ov: Pick<MapOverview, "zoneOfCell" | "zones" | "w" | "h">,
  outW: number,
  outH: number,
): Uint8ClampedArray {
  if (!(Number.isInteger(outW) && outW > 0 && Number.isInteger(outH) && outH > 0))
    throw new Error(`zoneRGBA: kích thước ảnh không hợp lệ (${outW}x${outH})`);
  const n = ov.zones.length;
  const colors = ov.zones.map((_, i) => zoneColor(i, n));
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let py = 0; py < outH; py++) {
    const y = Math.min(ov.h - 1, Math.floor(((py + 0.5) * ov.h) / outH));
    for (let px = 0; px < outW; px++) {
      const x = Math.min(ov.w - 1, Math.floor(((px + 0.5) * ov.w) / outW));
      const z = ov.zoneOfCell[y * ov.w + x];
      if (z === 0) continue;
      const c = colors[z - 1];
      if (!c) continue;
      const o = (py * outW + px) * 4;
      out[o] = c[0];
      out[o + 1] = c[1];
      out[o + 2] = c[2];
      out[o + 3] = ZONE_ALPHA;
    }
  }
  return out;
}

// ---------------------------------------------------------------- Đặt nhãn không chồng

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface LabelReq {
  readonly key: string;
  /** Điểm neo (tâm biểu tượng), điểm ảnh canvas */
  readonly x: number;
  readonly y: number;
  /** Kích thước chữ */
  readonly w: number;
  readonly h: number;
  /** Bán kính biểu tượng cần chừa quanh điểm neo */
  readonly r: number;
  /** Cao hơn được đặt trước (không đủ chỗ thì nhãn thấp hơn bị bỏ) */
  readonly prio: number;
}

export interface LabelPos {
  readonly key: string;
  /** Góc trên-trái của chữ */
  readonly x: number;
  readonly y: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Đặt các nhãn trong khung `bounds` sao cho KHÔNG chồng nhau và không chồng `obstacles` (biểu tượng đã vẽ): theo độ ưu tiên giảm dần, mỗi
 * nhãn thử lần lượt phía trên, dưới, phải, trái điểm neo (kéo ngang vào trong khung); không có chỗ thì bỏ nhãn đó (ưu tiên thấp bị bỏ
 * trước). Thứ tự đầu vào giữ nguyên khi cùng ưu tiên. Kết quả theo thứ tự đặt.
 */
export function placeLabels(
  reqs: readonly LabelReq[],
  bounds: { w: number; h: number },
  obstacles: readonly Rect[] = [],
): LabelPos[] {
  const order = reqs.map((r, i) => ({ r, i })).sort((a, b) => b.r.prio - a.r.prio || a.i - b.i);
  const taken: Rect[] = [...obstacles];
  const out: LabelPos[] = [];
  const gap = 2;
  for (const { r } of order) {
    const cx = Math.min(Math.max(r.x - r.w / 2, gap), Math.max(gap, bounds.w - r.w - gap));
    const candidates: Array<[number, number]> = [
      [cx, r.y - r.r - r.h - gap], // trên
      [cx, r.y + r.r + gap], // dưới
      [r.x + r.r + gap, r.y - r.h / 2], // phải
      [r.x - r.r - gap - r.w, r.y - r.h / 2], // trái
    ];
    for (const [x, y] of candidates) {
      const box: Rect = { x, y, w: r.w, h: r.h };
      if (x < 0 || y < 0 || x + r.w > bounds.w || y + r.h > bounds.h) continue;
      if (taken.some((t) => overlaps(box, t))) continue;
      taken.push(box);
      out.push({ key: r.key, x, y });
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- Vẽ

type Canvas2D = CanvasRenderingContext2D;

/** `terrainRGBA` / `zoneRGBA` tạo mảng bằng `new Uint8ClampedArray(n)` (luôn là `ArrayBuffer`, không phải `SharedArrayBuffer`): ép kiểu cho `ImageData`. */
function toImageData(rgba: Uint8ClampedArray, w: number, h: number): ImageData {
  return new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h);
}

const TERRAIN_CACHE_MAX = 8;
const terrainCache = new Map<string, HTMLCanvasElement>();

/**
 * Ảnh địa hình (kèm lớp tô khu quái nếu `withZones`) của bản đồ `ov` ở kích thước `pw x ph` điểm ảnh, dựng MỘT lần rồi nhớ (tối đa
 * `TERRAIN_CACHE_MAX` bản, bản cũ nhất bị bỏ). Gọi lại với cùng tham số trả cùng canvas.
 */
export function terrainCanvas(
  ov: MapOverview,
  pw: number,
  ph: number,
  withZones: boolean,
): HTMLCanvasElement {
  const key = `${ov.mapId}|${pw}x${ph}|${withZones ? "z" : "t"}`;
  const hit = terrainCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = pw;
  c.height = ph;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.putImageData(toImageData(terrainRGBA(ov, pw, ph), pw, ph), 0, 0);
    if (withZones) {
      const z = document.createElement("canvas");
      z.width = pw;
      z.height = ph;
      const zctx = z.getContext("2d");
      if (zctx) {
        zctx.putImageData(toImageData(zoneRGBA(ov, pw, ph), pw, ph), 0, 0);
        ctx.drawImage(z, 0, 0);
      }
    }
  }
  if (terrainCache.size >= TERRAIN_CACHE_MAX) {
    const oldest = terrainCache.keys().next().value;
    if (oldest !== undefined) terrainCache.delete(oldest);
  }
  terrainCache.set(key, c);
  return c;
}

/** Quên mọi ảnh địa hình đã dựng (đổi cỡ canvas hàng loạt, hoặc test). */
export function clearTerrainCache(): void {
  terrainCache.clear();
}

/** Màu các lớp động / biểu tượng: giữ khớp chú giải trong `index.html` (`.lg.*`). */
export const MAP_COLORS = {
  me: "#6ad06a",
  party: "#52c41a",
  other: "#9fd0ea",
  monster: "#e57373",
  npc: "#ffd74a",
  portal: "#a8ff78",
  town: "#d94a4a",
  lair: "#c084fc",
  text: "#f6efdc",
  halo: "rgba(10, 8, 6, 0.92)",
} as const;

export interface DrawBaseOptions {
  /** Điểm ảnh canvas cho mỗi điểm ảnh CSS */
  readonly u: number;
  /** Bản đồ lớn: thêm lớp khu quái, tên trấn / cổng / NPC / khu quái; bản đồ nhỏ chỉ vẽ biểu tượng, không chữ */
  readonly big: boolean;
  /** Dấu nhiệm vụ trên NPC ("!" nhận được, "?" đang làm): chỉ dùng ở bản đồ lớn */
  readonly markerOf?: (npcId: string) => string | null;
  /**
   * Bản đồ lớn trên canvas NHỎ (điện thoại ngang): chỉ ghi tên trấn, cổng (kèm nơi đến) và dấu nhiệm vụ; bỏ tên NPC và tên khu quái vì chữ
   * 12 px trên canvas ~200 px phủ kín bản đồ (chi tiết xem khi phóng to, bước 3).
   */
  readonly compact?: boolean;
}

/** Canvas CSS hẹp hơn mức này (px) thì bản đồ lớn dùng nhãn gọn (`DrawBaseOptions.compact`). */
export const COMPACT_CANVAS_CSS_PX = 300;

/** Vẽ chữ có viền tối quanh nét để đọc được trên mọi nền địa hình (nước, cỏ, đá). */
function haloText(
  ctx: Canvas2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  u: number,
): void {
  ctx.lineJoin = "round";
  ctx.lineWidth = 3 * u;
  ctx.strokeStyle = MAP_COLORS.halo;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function circle(ctx: Canvas2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/**
 * Lớp NỀN của bản đồ (địa hình, khu quái, trấn, hang, cổng, NPC, nhãn) trong khung nhìn `v` trên canvas `cw x ch`. Không vẽ gì động:
 * mình, đồng đội, người khác, quái, mục tiêu nhiệm vụ do chỗ gọi vẽ chồng lên (`MapView` + `u` cho cùng hệ toạ độ).
 */
export function drawMapBase(
  ctx: Canvas2D,
  ov: MapOverview,
  v: MapView,
  cw: number,
  ch: number,
  o: DrawBaseOptions,
): void {
  const { u, big } = o;
  const worldW = ov.w * TILE;
  const worldH = ov.h * TILE;
  const mw = worldW * v.scale;
  const mh = worldH * v.scale;

  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = "#12170f";
  ctx.fillRect(0, 0, cw, ch);
  const img = terrainCanvas(ov, Math.max(1, Math.round(mw)), Math.max(1, Math.round(mh)), big);
  ctx.drawImage(img, v.ox, v.oy, mw, mh);
  ctx.lineWidth = u;
  ctx.strokeStyle = "rgba(246, 239, 220, 0.35)";
  ctx.strokeRect(v.ox, v.oy, mw, mh);

  const obstacles: Rect[] = [];
  const labels: Array<LabelReq & { text: string; color: string }> = [];
  const fontPx = MIN_FONT_CSS_PX * u;
  if (big) ctx.font = `bold ${fontPx}px ${FONT_FAMILY}`;
  const label = (
    key: string,
    text: string,
    x: number,
    y: number,
    r: number,
    prio: number,
    color: string,
  ) => {
    labels.push({
      key,
      text,
      color,
      x,
      y,
      w: ctx.measureText(text).width,
      h: fontPx * 1.15,
      r,
      prio,
    });
  };

  // Khu an toàn (trấn / trạm)
  if (ov.town) {
    const tx = v.ox + ov.town.x * v.scale;
    const ty = v.oy + ov.town.y * v.scale;
    const tr = ov.town.r * v.scale;
    ctx.fillStyle = "rgba(217, 74, 74, 0.2)";
    circle(ctx, tx, ty, tr);
    ctx.fill();
    ctx.strokeStyle = MAP_COLORS.town;
    ctx.lineWidth = (big ? 2 : 1.2) * u;
    ctx.stroke();
    if (big) label("town", ov.town.name, tx, ty - tr, 0, 90, MAP_COLORS.text);
  }

  // Hang trùm (bí cảnh)
  if (ov.lair) {
    const lx = v.ox + ov.lair.x * v.scale;
    const ly = v.oy + ov.lair.y * v.scale;
    const lr = Math.max(4 * u, ov.lair.r * v.scale);
    ctx.fillStyle = "rgba(168, 85, 247, 0.28)";
    circle(ctx, lx, ly, lr);
    ctx.fill();
    ctx.strokeStyle = MAP_COLORS.lair;
    ctx.lineWidth = (big ? 1.5 : 1.2) * u;
    ctx.stroke();
    ctx.fillStyle = "#ef4444";
    circle(ctx, lx, ly, (big ? 4.5 : 2.8) * u);
    ctx.fill();
    obstacles.push({ x: lx - lr, y: ly - lr, w: 2 * lr, h: 2 * lr });
    if (big) label("lair", "Hang Yêu Vương", lx, ly, lr, 85, "#e9d5ff");
  }

  // Cổng truyền tống: chấm xanh ngọc viền trắng; bản đồ lớn ghi "tên cổng -> bản đồ đích"
  const portalR = (big ? 5 : 3) * u;
  for (const p of ov.portals) {
    const px = v.ox + p.x * v.scale;
    const py = v.oy + p.y * v.scale;
    ctx.fillStyle = MAP_COLORS.portal;
    circle(ctx, px, py, portalR);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = u;
    ctx.stroke();
    obstacles.push({ x: px - portalR, y: py - portalR, w: 2 * portalR, h: 2 * portalR });
    if (big) {
      // "Tên cổng → bản đồ đích"; canvas hẹp không đủ chỗ thì chỉ ghi "→ bản đồ đích" (người chơi cần biết nhất là đi đâu)
      const full = `${p.name} → ${p.toMapName}`;
      const text = ctx.measureText(full).width <= cw - 8 * u ? full : `→ ${p.toMapName}`;
      label(`portal:${p.id}`, text, px, py, portalR, 100, MAP_COLORS.portal);
    }
  }

  // NPC: chấm hoàng kim; bản đồ lớn thêm tên và dấu nhiệm vụ
  const npcR = (big ? 4.5 : 2.8) * u;
  for (const n of ov.npcs) {
    const nx = v.ox + n.x * v.scale;
    const ny = v.oy + n.y * v.scale;
    ctx.fillStyle = MAP_COLORS.npc;
    circle(ctx, nx, ny, npcR);
    ctx.fill();
    ctx.strokeStyle = "rgba(10, 8, 6, 0.85)";
    ctx.lineWidth = u;
    ctx.stroke();
    obstacles.push({ x: nx - npcR, y: ny - npcR, w: 2 * npcR, h: 2 * npcR });
    if (big && (!o.compact || o.markerOf?.(n.id))) {
      const m = o.markerOf?.(n.id) ?? null;
      label(
        `npc:${n.id}`,
        o.compact ? (m ?? "") : m ? `${m} ${n.name}` : n.name,
        nx,
        ny,
        npcR,
        m ? 80 : 60,
        m === "?" ? "#9ae59a" : m ? "#ff8a8a" : MAP_COLORS.text,
      );
    }
  }

  // Khu quái: tên loài mạnh nhất + cấp, chỉ bản đồ lớn (bỏ ở canvas nhỏ: chữ che hết bản đồ)
  if (big) {
    if (!o.compact)
      ov.zones.forEach((z, i) => {
        const [r, g, b] = zoneColor(i, ov.zones.length);
        label(
          `zone:${i}`,
          `${z.name} · ${z.levelLabel}`,
          v.ox + z.labelX * v.scale,
          v.oy + z.labelY * v.scale,
          0,
          40,
          `rgb(${r}, ${g}, ${b})`,
        );
      });
    const placed = placeLabels(labels, { w: cw, h: ch }, obstacles);
    const byKey = new Map(labels.map((l) => [l.key, l]));
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    for (const p of placed) {
      const l = byKey.get(p.key);
      if (l) haloText(ctx, l.text, p.x, p.y, l.color, u);
    }
  }
}

/** Mũi tên "mình": tam giác hướng theo `facing` (radian), viền trắng, tô xanh lục; `r` là bán kính (điểm ảnh canvas). */
export function drawMarkerMe(ctx: Canvas2D, x: number, y: number, facing: number, r: number): void {
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  ctx.beginPath();
  ctx.moveTo(x + c * r * 1.7, y + s * r * 1.7);
  ctx.lineTo(x + Math.cos(facing + 2.5) * r * 1.25, y + Math.sin(facing + 2.5) * r * 1.25);
  ctx.lineTo(x + Math.cos(facing + Math.PI) * r * 0.5, y + Math.sin(facing + Math.PI) * r * 0.5);
  ctx.lineTo(x + Math.cos(facing - 2.5) * r * 1.25, y + Math.sin(facing - 2.5) * r * 1.25);
  ctx.closePath();
  ctx.fillStyle = MAP_COLORS.me;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.3);
  ctx.strokeStyle = "#ffffff";
  ctx.lineJoin = "round";
  ctx.stroke();
}

/** Chấm tròn có viền (đồng đội, người chơi khác, quái). */
export function drawDot(
  ctx: Canvas2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke?: string,
  lineWidth = 1,
): void {
  ctx.fillStyle = fill;
  circle(ctx, x, y, r);
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

/** Chữ có viền tối (tên đồng đội cạnh chấm): dùng chung kiểu với nhãn nền. */
export function drawHaloText(
  ctx: Canvas2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  u: number,
): void {
  ctx.font = `bold ${MIN_FONT_CSS_PX * u}px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  haloText(ctx, text, x, y, fill, u);
}
