// Các tệp Tiled của bản đồ thường (docs/THIET_KE_BAN_DO_TILED.md mục 4a): bản CHẠY logic `shared/maps/<id>.logic.json`, nhập tĩnh. Module này KHÔNG nằm trong `index.ts` vì mỗi lần nhập kéo theo ~16 KB gzip
// dữ liệu bản đồ: SERVER nhập ở `defineRooms` (nhận tệp lúc khởi động); CLIENT nhập ĐỘNG từ chunk game tải SAU màn đăng nhập (S3a, `client/src/game-modules.ts`: `adoptTiledMapFiles()` trước khi dựng cảnh), KHÔNG từ gói khởi động (`client/perf-budget.json`: `startupGzipKb` 220, `totalJsGzipKb` 548).
import {
  adoptTiledMaps,
  AM_SUONG_ID,
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  HAN_VAN_ID,
  LANG_HOANG_ID,
  UY_VAN_ID,
} from "./map";
import lacHaTiled from "../maps/lac_ha.logic.json";
import hacPhongTiled from "../maps/hac_phong.logic.json";
import amSuongTiled from "../maps/am_suong.logic.json";
import hanVanTiled from "../maps/han_van.logic.json";
import langHoangTiled from "../maps/lang_hoang.logic.json";
import uyVanTiled from "../maps/uy_van.logic.json";

/** Tệp Tiled của từng bản đồ thường (khoá = id). Thêm bản đồ mới: thêm tệp + dòng ở đây. */
export const TILED_MAP_FILES: Readonly<Record<string, unknown>> = {
  [DEFAULT_MAP_ID]: lacHaTiled,
  [HAC_PHONG_ID]: hacPhongTiled,
  [AM_SUONG_ID]: amSuongTiled,
  [HAN_VAN_ID]: hanVanTiled,
  [LANG_HOANG_ID]: langHoangTiled,
  [UY_VAN_ID]: uyVanTiled,
};

/** Nhận cả các tệp (idempotent: gọi lại dựng lại từ tệp). Trả danh sách id đã nhận. */
export function adoptTiledMapFiles(): string[] {
  return adoptTiledMaps(TILED_MAP_FILES);
}
