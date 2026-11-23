/**
 * Nền bản đồ từ GÓI TÀI NGUYÊN RIÊNG (QUYET_DINH_M3 mục 63, `docs/THIET_KE_GOI_TAI_NGUYEN_RIENG.md` mục 6, `docs/HUONG_DO_HOA_MOI.md` mục 11).
 *
 * Nơi DÙNG đầu tiên của `privateArtUrl`: khoá `tileset` của `PRIVATE_ART` là dải ô 8 x 1 (`TILE` px mỗi ô, thứ tự `T`) thay cho `/assets/tileset.png`
 * (vẽ bằng mã, luôn có sẵn = HÌNH THAY THẾ). Gói chưa có / chưa tải xong / tệp lỗi / sai kích thước thì `tilesetKeyFor` trả khoá cũ và mọi thứ chạy
 * y như trước (CI, máy dev và bản chạy thật không có gói không đổi gì). Khi gói về (kể cả về muộn) thì dựng lại lớp nền ĐÚNG MỘT lần.
 *
 * Hàm thuần, nhận `scene` / `packs` dạng giao diện hẹp nên test không cần Phaser thật.
 */
import { T, TILE } from "@tien-gioi/shared";
import type { PackController } from "./packs";
import { PRIVATE_ART, privateArtUrl, type PrivateArtEntry } from "./private-art";

/** Khoá của dải ô trong bảng `PRIVATE_ART`. */
export const TILESET_ART_KEY = "tileset";
/** Khoá texture Phaser của dải ô lấy từ gói riêng (khác khoá hình thay thế `tileset` để giữ nguyên hình thay thế). */
export const PRIVATE_TILESET_KEY = "tileset-private";
/** Số loại ô trong `T` (dải ô phải rộng đúng `TILE` x số này). */
export const TILE_TYPE_COUNT = Object.values(T).filter((v) => typeof v === "number").length;

/**
 * URL dải ô trong gói riêng, hoặc `null` (=> dùng hình thay thế) khi: khoá không có trong bảng, gói chưa `ready`, hoặc ô của gói KHÔNG đúng `TILE` x `TILE`
 * (phòng bảng sai lưới: ô khác cỡ làm vỡ bố cục bản đồ; `privateArtViolations` cũng canh ở test).
 */
export function privateTilesetUrl(
  packs: Pick<PackController, "state" | "fileUrl">,
  table: Readonly<Record<string, PrivateArtEntry>> = PRIVATE_ART,
): string | null {
  const e = Object.prototype.hasOwnProperty.call(table, TILESET_ART_KEY)
    ? table[TILESET_ART_KEY]
    : undefined;
  if (!e || e.frameWidth !== TILE || e.frameHeight !== TILE) return null;
  return privateArtUrl(packs, TILESET_ART_KEY, table);
}

/** Khoá texture dùng để dựng lớp nền: dải ô của gói riêng nếu ĐÃ nạp xong, ngược lại hình thay thế. */
export function tilesetKeyFor(hasTexture: (key: string) => boolean, fallbackKey: string): string {
  return hasTexture(PRIVATE_TILESET_KEY) ? PRIVATE_TILESET_KEY : fallbackKey;
}

/** Phần của `Phaser.Scene` mà bộ nạp dùng (giao diện hẹp để test bằng bản giả). */
export interface TilesetLoaderScene {
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
 * Nạp dải ô riêng thành texture `PRIVATE_TILESET_KEY`; `done(true)` khi texture có và ĐÚNG kích thước (`TILE * TILE_TYPE_COUNT` x `TILE`), ngược lại
 * `done(false)` (đã xoá texture sai cỡ). Không bao giờ ném lỗi. Đã có texture thì `done(true)` ngay, không tải lại.
 */
export function loadPrivateTilesetTexture(
  scene: TilesetLoaderScene,
  url: string,
  done: (ok: boolean) => void,
): void {
  if (scene.textures.exists(PRIVATE_TILESET_KEY)) {
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
    if (!scene.textures.exists(PRIVATE_TILESET_KEY)) return finish(false);
    let img: { width: number; height: number } | null;
    try {
      img = scene.textures.get(PRIVATE_TILESET_KEY).getSourceImage();
    } catch {
      img = null;
    }
    if (!img || img.width !== TILE * TILE_TYPE_COUNT || img.height !== TILE) {
      scene.textures.remove(PRIVATE_TILESET_KEY);
      return finish(false);
    }
    finish(true);
  };
  try {
    scene.load.image(PRIVATE_TILESET_KEY, url);
    scene.load.once("complete", onComplete);
    scene.load.start();
  } catch {
    finish(false);
  }
}
