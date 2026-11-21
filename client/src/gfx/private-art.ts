/**
 * GÓI TÀI NGUYÊN RIÊNG, phía client (QUYET_DINH_M3 mục 63, `docs/THIET_KE_GOI_TAI_NGUYEN_RIENG.md` mục 6): bảng KHOÁ TEXTURE -> tệp trong gói riêng, và bản đồ -> gói cần chờ.
 *
 * Bảng này là DỮ LIỆU của Tiên Giới (khoá, tên tệp, kích thước ô), KHÔNG chứa tệp có bản quyền nên vào git được; tệp ảnh thật nằm ngoài repo (`/mnt/data/assets-private/dist/`, máy chủ phục vụ ở
 * `/assets-private/`). Khoá không có gói / gói chưa tải xong / tệp lỗi thì `privateArtUrl` trả `null` và nơi dùng giữ HÌNH THAY THẾ (CI và máy dev không có gói vẫn chạy đủ).
 *
 * Hai nguồn của một khoá PHẢI cùng lưới ô (`frameWidth` x `frameHeight`) và cùng ngữ nghĩa (`HUONG_DO_HOA_MOI.md` mục 10: ô 16 px phóng x2 = `TILE` 32, autotile 47 ô, một ảnh tileset gộp, đùn mép 1 px),
 * nếu không thì thay giữa chừng làm vỡ bố cục: `privateArtViolations` kiểm bảng với lưới của hình thay thế.
 *
 * Hiện CẢ HAI bảng RỖNG: chưa chọn hình (chờ G kiểm giấy phép từng gói và người dùng tải gói), bộ nạp đã sẵn sàng và có test bằng bảng tiêm.
 */
import type { PackController } from "./packs";

/** Một khoá texture trong gói riêng. */
export interface PrivateArtEntry {
  /** Mã gói trong manifest riêng (không kèm `private:`). */
  pack: string;
  /** Đường dẫn TƯƠNG ĐỐI trong gói (`PackFile.path`). */
  path: string;
  /** Kích thước MỘT ô (px) của tệp này; hình thay thế cùng khoá phải cùng số này. */
  frameWidth: number;
  frameHeight: number;
}

/** Khoá texture -> tệp gói riêng. Rỗng cho tới khi chọn hình. */
export const PRIVATE_ART: Readonly<Record<string, PrivateArtEntry>> = {};

/** Bản đồ -> các gói riêng cần có lúc dựng cảnh (chờ cùng hạn với gói bản đồ). Rỗng cho tới khi chọn hình. */
export const PRIVATE_MAP_PACKS: Readonly<Record<string, readonly string[]>> = {};

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/**
 * URL của khoá texture trong gói riêng, hoặc `null` (=> dùng hình thay thế) khi: khoá không có trong bảng, gói chưa `ready` (chưa tải xong / không có gói / lỗi), hoặc manifest không có tệp đó.
 * Chỉ TRẢ URL (đúng URL mà `ensure` đã tải nên khớp bộ nhớ đệm); không tải gì, không ném lỗi.
 */
export function privateArtUrl(
  packs: Pick<PackController, "state" | "fileUrl">,
  key: string,
  table: Readonly<Record<string, PrivateArtEntry>> = PRIVATE_ART,
): string | null {
  if (!hasOwn(table, key)) return null;
  const e = table[key]!;
  const id = `private:${e.pack}`;
  if (packs.state(id) !== "ready") return null;
  return packs.fileUrl(id, e.path);
}

/** Lỗi của bảng so với lưới ô của hình thay thế (`fallbackGrid`: khoá -> `[rộng, cao]`): khoá thiếu hình thay thế, lưới lệch, kích thước không dương. Rỗng = hợp lệ. Thuần. */
export function privateArtViolations(
  table: Readonly<Record<string, PrivateArtEntry>>,
  fallbackGrid: Readonly<Record<string, readonly [number, number]>>,
): string[] {
  const bad: string[] = [];
  for (const [key, e] of Object.entries(table)) {
    if (
      !Number.isInteger(e.frameWidth) ||
      !Number.isInteger(e.frameHeight) ||
      e.frameWidth <= 0 ||
      e.frameHeight <= 0
    ) {
      bad.push(`${key}: kích thước ô không hợp lệ (${e.frameWidth} x ${e.frameHeight})`);
      continue;
    }
    if (!hasOwn(fallbackGrid, key)) {
      bad.push(`${key}: KHÔNG có hình thay thế (CI / máy không có gói sẽ thiếu hình)`);
      continue;
    }
    const [w, h] = fallbackGrid[key]!;
    if (w !== e.frameWidth || h !== e.frameHeight)
      bad.push(
        `${key}: lưới ô lệch (gói ${e.frameWidth} x ${e.frameHeight}, hình thay thế ${w} x ${h})`,
      );
  }
  return bad;
}
