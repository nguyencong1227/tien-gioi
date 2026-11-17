// Phiên bản giao thức client <-> server (M4 mục 2.5, docs/PHAN_CONG_M4.md): để server từ chối một client QUÁ CŨ bằng thông báo
// thân thiện thay vì để nó chạy lệch hợp đồng `shared/` rồi treo hoặc báo lỗi khó hiểu (nguy cơ lớn nhất khi có app cài sẵn
// trên điện thoại, PWA giữ bản cũ trong cache, hoặc bot / công cụ chưa cập nhật).
//
// Luồng (client -> server -> client):
//  1. Client gửi `v: PROTOCOL_VERSION` trong `JoinOptions` khi vào phòng (`joinOrCreate` / `joinById`).
//  2. `onAuth` của phòng kiểm PHIÊN BẢN TRƯỚC mọi thứ khác (trước tên / mã / token): `isClientOutdated(options.v)` thì từ chối
//     bằng `ServerError(JOIN_CLIENT_OUTDATED, clientOutdatedMessage())`. Việc này không tiết lộ gì về nhân vật nào, nên không
//     cần xác thực xong mới được trả lời.
//  3. Client gặp lỗi này (`parseClientOutdated`) thì KHÔNG thử lại và KHÔNG báo lỗi chung: hiện màn hình "Có bản mới, hãy tải
//     lại" (nút tải lại; PWA dọn bản cache cũ). Đây là lỗi dứt khoát: vòng thử lại / chuyển hướng `wrong_map` phải bỏ qua nó.
//
// Quy ước tăng số:
//  - `PROTOCOL_VERSION` tăng 1 mỗi khi hợp đồng đổi KHÔNG tương thích ngược với client cũ (xoá / đổi tên / đổi nghĩa trường hoặc
//    tin nhắn; đổi luật mà client cũ sẽ hiểu sai). Thêm trường / tin nhắn mới mà client cũ bỏ qua được thì KHÔNG cần tăng.
//  - `MIN_PROTOCOL_VERSION` là số thấp nhất server còn nhận. Chỉ tăng khi cố ý ngừng hỗ trợ client cũ (kèm thông báo cho
//    người chơi); từ đó client / bot / công cụ không gửi `v` (coi là 0) hoặc gửi số thấp hơn bị từ chối.
//  - Client MỚI HƠN server (`v` > `PROTOCOL_VERSION`) vẫn được nhận: server không biết tương lai; triển khai server trước client.
//
// Hiện tại: client trước M4 không gửi `v` (= 0, "bản cũ") và vẫn được nhận (`MIN_PROTOCOL_VERSION` = 0) để bot / E2E / bản đã
// cài chạy tiếp; số này chỉ bắt đầu từ chối khi người vận hành nâng `MIN_PROTOCOL_VERSION`.
//
// Đây là cổng LỊCH SỰ, không phải biện pháp bảo mật: client gian vẫn gửi số tuỳ ý. Mọi kiểm tra khác của server (kiểu, giá trị
// hữu hạn, khoảng cách, hồi chiêu, mã nhân vật) giữ nguyên và không dựa vào `v`.

/**
 * Phiên bản giao thức hiện tại của bản `shared/` này (số nguyên không âm; bản trước M4 = 0, không gửi).
 * 2 (M6, #404): bản đồ `am_suong` + quái Kim Đan + nhiều vật phẩm mới: client cũ không biết id bản đồ / loài quái / vật phẩm mới nên
 * hiểu sai (travelTo tới bản đồ lạ, quái không có ảnh). `MIN_PROTOCOL_VERSION` KHÔNG đổi: nâng nó là quyết định lúc phát hành.
 * 3 (M7.1, #502): chiêu thức học được (`skills.ts`: tin `cast` / `skillSlot` / `skills` / `status`, `FxMsg` `cast` / `warn` / `bolt`), kinh quyển
 * (`ItemType` "book"), hành vi quái (`MonsterKind.behavior`...): client cũ không có hộp công pháp / báo trước đòn và không hiểu tin mới. DỰ KIẾN
 * thêm cùng đợt M7 (chưa có trong bản này): `Monster.fx` / `Monster.elite` (M7.3), ba ô trang bị mới (M7.4), bản đồ + quái Nguyên Anh (M7.5).
 * `MIN_PROTOCOL_VERSION` giữ nguyên tới lúc phát hành v0.3.0 (M7.14).
 * 4 (nghề nhỏ #514, `docs/THIET_KE_NGHE_NHO.md`): `ItemEffect` kind `status` (đan hộ đạo: vật phẩm gắn trạng thái), `StatusId` `dao_ho` (kind `breakAid`,
 * tin `status` mang `ratio` cho loại mới), `NpcDef.station` + `DialogAction` `forge.station` (Lò đan / Bàn phù: chữ tiêu đề, nút, toast theo trạm) và
 * vật phẩm / NPC / công thức nghề mới; client cũ không hiểu hiệu ứng `status` của vật phẩm (không số liệu, không chip đếm ngược) và gọi lò đan là
 * "Lò Rèn". Tăng TRƯỚC khi PR dữ liệu nghề đầu tiên (NPC Lò đan + đan hộ đạo, issue #763) vào `main`. `MIN_PROTOCOL_VERSION` KHÔNG đổi: nâng nó là
 * quyết định lúc phát hành bản có nghề.
 * 5 (chặn đường, mục 52, issue #1061, `docs/THIET_KE_CHAN_DUONG.md`): tin `ambushOffer` / `ambushChoose` / `ambushState` / `ambushFlee` / `ambushEnd` (`ambush.ts`), bản đồ
 * đấu trường `arena_*` (`MapDef.kind` "arena"). Client cũ không có hộp thoại Chiến / Bỏ chạy nên máy chủ CHỈ chặn đường người chơi có `v >= AMBUSH_MIN_PROTOCOL` (= 5);
 * client cũ vẫn vào chơi bình thường. `MIN_PROTOCOL_VERSION` KHÔNG đổi.
 * 6 (thêm chiêu thức, mục 51, CT1b #1076, `docs/PHAN_CONG_CHIEU_THUC.md` mục 3 / 3b): hình chiêu `chain` / `bolt` / `zone` / `trap` / `aura` / `totem`, trạng thái `empower` / `weaken` /
 * `mark_<hệ>` / `windup` (vận khí, kind `slow`, ngoài trần `MAX_STATUSES`), `STATUS_BIT.weaken`, `Monster.mark`, `FxMsg` `pbolt` / `chain` / `zone` / `trap` / `totem` / `aura` / `fxEnd`.
 * Client cũ không biết các id mới nên không vẽ hiệu ứng / không hiện huy hiệu và đoán sai tốc độ lúc vận khí (giật nhẹ <= 2,5 s); sát thương vẫn đúng (máy chủ quyết). `MIN_PROTOCOL_VERSION` KHÔNG đổi.
 */
export const PROTOCOL_VERSION = 6;

/** Phiên bản thấp nhất server còn nhận. 0 = nhận cả client chưa biết tới `v`. */
export const MIN_PROTOCOL_VERSION = 0;

/**
 * Client quá cũ (426 "Upgrade Required"): thông điệp là `clientOutdatedMessage(min)`. Khác các mã vào phòng đã dùng
 * (400, 401, 403, 409, 421, 422, 423).
 */
export const JOIN_CLIENT_OUTDATED = 426;

const OUTDATED_PREFIX = "client_outdated:";

/**
 * Phiên bản mà client tự khai, đã làm sạch: số nguyên hữu hạn từ 0 tới `Number.MAX_SAFE_INTEGER`; thiếu / sai kiểu / âm / lẻ /
 * `NaN` / vô hạn đều thành 0 (coi như client cũ chưa biết `v`). Server không tin kiểu của client.
 */
export function protocolOf(raw: unknown): number {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
}

/** Client khai `raw` có thấp hơn mức server còn nhận không (`min` mặc định `MIN_PROTOCOL_VERSION`). */
export function isClientOutdated(raw: unknown, min: number = MIN_PROTOCOL_VERSION): boolean {
  return protocolOf(raw) < min;
}

/** Thông điệp của lỗi `JOIN_CLIENT_OUTDATED`, mang theo phiên bản thấp nhất server nhận (để client hiện / ghi nhật ký). */
export function clientOutdatedMessage(min: number = MIN_PROTOCOL_VERSION): string {
  return OUTDATED_PREFIX + protocolOf(min);
}

/**
 * Lấy phiên bản thấp nhất server nhận từ lỗi vào phòng; không phải lỗi `client_outdated` thì `undefined`. Mã đúng nhưng
 * thông điệp hỏng vẫn là lỗi "client quá cũ" (trả 0): client luôn có thể hiện màn hình cập nhật.
 */
export function parseClientOutdated(code: unknown, message: unknown): number | undefined {
  if (code !== JOIN_CLIENT_OUTDATED) return undefined;
  if (typeof message !== "string" || !message.startsWith(OUTDATED_PREFIX)) return 0;
  const n = Number(message.slice(OUTDATED_PREFIX.length));
  return protocolOf(n);
}
