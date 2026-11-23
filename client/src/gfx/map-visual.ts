/**
 * Lớp HÌNH của bản đồ vẽ từ `visual.json` (Tiled S3b, #1206 / #1330 mục 67.1): hàm THUẦN kiểm tra tệp + nạp ảnh tileset, chưa đụng cảnh.
 *
 * `visual.json` nằm trong gói `map:<id>` (`client/public/packs/map-<id>/`, do `npm run map:build -w server` sinh): ba lớp `ground` / `decor` / `over` + MỘT tileset nhúng
 * (ảnh `tileset_world.png` ĐÙN MÉP: margin 1 / spacing 2, ô 16 px, do `client/scripts/art/dung-tileset-world.py` dựng). Tệp đến từ máy chủ web nên coi như KHÔNG TIN:
 * `sanitizeVisualMap` từ chối cả tệp (trả `null`, client vẽ cách cũ) khi sai kích thước, sai kiểu, gid ngoài tileset, cờ lật, số ô quá lớn.
 *
 * Gói chỉ BỔ SUNG (như mọi gói): thiếu tệp / tải lỗi / sai cỡ ảnh thì không làm gì, mọi thứ chạy y như trước.
 */

/** Cỡ ô của tileset nhúng (điểm ảnh của ảnh gốc; cảnh phóng `TILE / VISUAL_TILE` lần khi vẽ). */
export const VISUAL_TILE = 16;
/** Trần số ô một lớp (chống tệp lạ ngốn bộ nhớ); bản đồ lớn nhất của game 128 x 128. */
export const VISUAL_MAX_CELLS = 256 * 256;
/** Tên các lớp hình, theo thứ tự vẽ từ dưới lên. */
export const VISUAL_LAYER_NAMES = ["ground", "decor", "over"] as const;
export type VisualLayerName = (typeof VISUAL_LAYER_NAMES)[number];

export interface VisualTileset {
  firstgid: number;
  columns: number;
  tilecount: number;
  margin: number;
  spacing: number;
  /** Tên tệp ảnh trong gói (`tileset_world.png`), đã kiểm là tên tệp trơn. */
  image: string;
}

export interface VisualMap {
  width: number;
  height: number;
  tileset: VisualTileset;
  /** gid theo hàng (y * width + x); 0 = không có ô. */
  ground: Uint16Array;
  decor: Uint16Array;
  over: Uint16Array;
  /** gid lớn nhất đang dùng (để biết ảnh phải cao ít nhất bao nhiêu hàng). */
  maxGid: number;
}

const isInt = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/**
 * Kiểm + đọc `visual.json` của bản đồ `expectW` x `expectH` ô. `null` nếu sai BẤT KỲ điều nào: không phải đối tượng, kích thước khác bản đồ, ô không phải 16 px, không đúng MỘT tileset,
 * thiếu lớp, lớp sai độ dài, gid không nguyên / âm / có cờ lật / ngoài `firstgid .. firstgid + tilecount - 1`. Không bao giờ ném lỗi.
 */
export function sanitizeVisualMap(
  raw: unknown,
  expectW: number,
  expectH: number,
): VisualMap | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (r.width !== expectW || r.height !== expectH) return null;
    if (!isInt(expectW, 1, 4096) || !isInt(expectH, 1, 4096)) return null;
    const cells = expectW * expectH;
    if (cells > VISUAL_MAX_CELLS) return null;
    if (r.tilewidth !== VISUAL_TILE || r.tileheight !== VISUAL_TILE) return null;
    if (!Array.isArray(r.tilesets) || r.tilesets.length !== 1) return null;
    const t = r.tilesets[0] as Record<string, unknown> | null;
    if (!t || typeof t !== "object") return null;
    if (t.tilewidth !== VISUAL_TILE || t.tileheight !== VISUAL_TILE) return null;
    const { firstgid, columns, tilecount, margin, spacing, image } = t;
    if (
      !isInt(firstgid, 1, 4096) ||
      !isInt(columns, 1, 256) ||
      !isInt(tilecount, 1, 65535) ||
      !isInt(margin, 0, 8) ||
      !isInt(spacing, 0, 8) ||
      typeof image !== "string" ||
      !/^[A-Za-z0-9_.-]{1,64}\.png$/.test(image) ||
      image.includes("..")
    )
      return null;
    if (firstgid + tilecount > 65536) return null;
    if (!Array.isArray(r.layers)) return null;
    const out: Partial<Record<VisualLayerName, Uint16Array>> = {};
    let maxGid = 0;
    const hi = firstgid + tilecount - 1;
    for (const name of VISUAL_LAYER_NAMES) {
      const l = (r.layers as unknown[]).find(
        (x) => x && typeof x === "object" && (x as Record<string, unknown>).name === name,
      ) as Record<string, unknown> | undefined;
      if (!l || l.type !== "tilelayer" || !Array.isArray(l.data) || l.data.length !== cells)
        return null;
      const a = new Uint16Array(cells);
      for (let i = 0; i < cells; i++) {
        const g = l.data[i];
        // 0 = trống; còn lại phải là số nguyên trong tileset (cờ lật của Tiled nằm ở bit cao nên làm gid vượt `hi`)
        if (g === 0) continue;
        if (!isInt(g, firstgid, hi)) return null;
        a[i] = g;
        if (g > maxGid) maxGid = g;
      }
      out[name] = a;
    }
    return {
      width: expectW,
      height: expectH,
      tileset: { firstgid, columns, tilecount, margin, spacing, image },
      ground: out.ground!,
      decor: out.decor!,
      over: out.over!,
      maxGid,
    };
  } catch {
    return null;
  }
}

/** Rộng đúng của ảnh tileset đùn mép: `2 x margin + columns x TILE + (columns - 1) x spacing`. */
export function visualImageWidth(ts: VisualTileset): number {
  return 2 * ts.margin + ts.columns * VISUAL_TILE + (ts.columns - 1) * ts.spacing;
}

/** Cao TỐI THIỂU của ảnh để chứa gid lớn nhất đang dùng (ảnh có thể cao hơn nếu `tilecount` làm tròn lên hàng). */
export function visualMinImageHeight(vm: VisualMap): number {
  const ts = vm.tileset;
  const rows = vm.maxGid < ts.firstgid ? 1 : Math.floor((vm.maxGid - ts.firstgid) / ts.columns) + 1;
  return 2 * ts.margin + rows * VISUAL_TILE + (rows - 1) * ts.spacing;
}

/** Ảnh tileset thật có đủ rộng đúng và đủ cao để chứa mọi gid dùng không (sai cỡ => không vẽ, tránh ô lệch). */
export function visualImageFits(vm: VisualMap, img: { width: number; height: number }): boolean {
  return img.width === visualImageWidth(vm.tileset) && img.height >= visualMinImageHeight(vm);
}

/** Tên tệp `visual.json` và ảnh tileset trong gói `map:<id>` (đường dẫn tương đối trong `/packs/`). */
export function visualPackPaths(
  mapId: string,
  image: string,
): { json: string; image: string } | null {
  if (!/^[a-z0-9_]{1,40}$/.test(mapId)) return null;
  return { json: `map-${mapId}/visual.json`, image: `map-${mapId}/${image}` };
}

/** Khoá texture Phaser của ảnh tileset hình của MỘT bản đồ (mỗi bản đồ một ảnh: bảng màu theo vùng khác nhau). */
export const visualTextureKey = (mapId: string): string => `map-visual:${mapId}`;

/** Hàng gid (mảng số thường) của một lớp để đưa vào `make.tilemap({ data })`. */
export function visualRows(layer: Uint16Array, width: number, height: number): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < height; y++)
    rows.push(Array.from(layer.subarray(y * width, (y + 1) * width)));
  return rows;
}

/** Phần của `Phaser.Scene` mà bộ nạp ảnh dùng (giao diện hẹp để test bằng bản giả). */
export interface VisualLoaderScene {
  textures: {
    exists(key: string): boolean;
    remove(key: string): unknown;
    get(key: string): { getSourceImage(): { width: number; height: number } };
  };
  load: {
    image(key: string, url: string): unknown;
    once(event: string, fn: (...args: unknown[]) => void): unknown;
    off(event: string, fn: (...args: unknown[]) => void): unknown;
    start(): unknown;
  };
}

/**
 * Nạp ảnh tileset hình thành texture `key`; `done(true)` khi texture có và `fits` đúng (đã xoá texture sai cỡ), ngược lại `done(false)`. Không bao giờ ném lỗi; texture đã có thì
 * `done(true)` ngay (không tải lại, không kiểm lại: đã kiểm lúc nạp).
 */
export function loadVisualTexture(
  scene: VisualLoaderScene,
  key: string,
  url: string,
  fits: (img: { width: number; height: number }) => boolean,
  done: (ok: boolean) => void,
): void {
  if (scene.textures.exists(key)) {
    done(true);
    return;
  }
  let finished = false;
  const finish = (ok: boolean) => {
    if (finished) return;
    finished = true;
    scene.load.off("complete", onComplete);
    done(ok);
  };
  const onComplete = () => {
    if (!scene.textures.exists(key)) return finish(false);
    let img: { width: number; height: number } | null;
    try {
      img = scene.textures.get(key).getSourceImage();
    } catch {
      img = null;
    }
    if (!img || !fits(img)) {
      scene.textures.remove(key);
      return finish(false);
    }
    finish(true);
  };
  try {
    scene.load.image(key, url);
    scene.load.once("complete", onComplete);
    scene.load.start();
  } catch {
    finish(false);
  }
}

/** Tải `visual.json` bằng `fetch` (hạn `timeoutMs`), trả đối tượng JSON thô hoặc `null` (lỗi mạng / HTTP / JSON hỏng / quá giờ). Không bao giờ ném lỗi. */
export async function fetchVisualJson(
  url: string,
  fetchFn: typeof fetch,
  timeoutMs = 8000,
): Promise<unknown | null> {
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
  try {
    const res = await fetchFn(url, ac ? { signal: ac.signal } : undefined);
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Khoá `localStorage` để người chơi tắt lớp hình mới (`"0"` = tắt). */
export const VISUAL_STORAGE_KEY = "tg.mapVisual";

/**
 * Lớp hình Tiled có bật không: `?visual=0` tắt, `?visual=1` bật (thắng khoá lưu); không có thì khoá `localStorage` `"0"` tắt; mặc định BẬT (nhưng chỉ vẽ khi gói
 * `map:<id>` THẬT SỰ có ảnh tileset: gói chưa có ảnh thì client vẽ cách cũ). Không bao giờ ném lỗi (trình duyệt chặn `localStorage`).
 */
export function mapVisualEnabled(
  search: string,
  storage: { getItem(k: string): string | null } | null,
): boolean {
  try {
    const q = new URLSearchParams(search).get("visual");
    if (q === "0") return false;
    if (q === "1") return true;
    return storage?.getItem(VISUAL_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * Độ sâu của lớp `over` (tán cây phủ trên đầu nhân vật). Thực thể xếp theo `y` (<= `worldH`); hiệu ứng chung (`fx`, vòng chọn mục tiêu, tia kiếm khí) ở ĐÚNG `worldH`; nhãn / khiên ở `worldH + 1` trở lên.
 * Tán ở NGAY DƯỚI `worldH` (lệch 0,01): phủ mọi thực thể, nhưng hiệu ứng chiêu / vòng chọn quái KHÔNG bị tán che mất (A nêu ở #1346).
 */
export const visualOverDepth = (worldH: number): number => worldH - 0.01;

/** Thời gian làm mờ chuyển từ nền cũ sang lớp hình mới (ms). */
export const VISUAL_FADE_MS = 350;

/**
 * Kế hoạch chuyển nền cũ -> lớp hình mới khi gói + ảnh về MUỘN sau khi cảnh đã vẽ nền cũ: có nền cũ và người chơi không bật "giảm chuyển động" thì làm mờ dần (lớp mới từ trong suốt
 * lên đặc, nền cũ gỡ SAU khi xong) để không nháy một cái; không thì thay ngay.
 */
export function visualFadePlan(
  hadLegacy: boolean,
  reducedMotion: boolean,
): { fade: boolean; ms: number } {
  const fade = hadLegacy && !reducedMotion;
  return { fade, ms: fade ? VISUAL_FADE_MS : 0 };
}
