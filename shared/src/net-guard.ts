// Bảo vệ tính mạng khi MẤT KẾT NỐI (QUYET_DINH_M3 mục 33, docs/THIET_KE_MAT_KET_NOI.md). Chết thật là mất kiếp, mà mạng nhà máy chủ rớt 13-25 giây mỗi ~10 phút:
//  - đường hầm "đứng" mà socket CHƯA đóng thì máy chủ không biết người chơi đã mất kết nối, nhân vật đứng im giữa trận và bị đánh tới chết;
//  - 20 giây giữ chỗ < thời gian rớt thực tế + thời gian nối lại.
//
// Luật (máy chủ quyết định, client chỉ gửi nhịp tim đều và hiển thị):
//  1. Client khai nhịp gửi tin của mình khi vào phòng (`JoinOptions.beatMs`, `NET_BEAT_MS`). Máy chủ ghi thời điểm nhận TIN CUỐI (bất kỳ tin nào) của từng người; client có khai
//     nhịp mà im lặng quá `NET_SILENCE_GHOST_MS` thì thành "hồn lìa xác" NGAY (bất tử, quái bỏ mục tiêu, không bị sát thương theo giây, không bị PK) DÙ socket còn mở; có tin lại thì ra
//     khỏi trạng thái đó. Client không khai nhịp (bản cũ) thì giữ hành vi cũ (chỉ rớt socket mới thành hồn lìa xác): nhịp tim bản cũ 5 giây sẽ bị coi là im lặng oan.
//  2. Rớt socket: giữ nhân vật `NET_RECONNECT_GRACE_S` giây chờ nối lại (trước đây 20).
//  3. Nối lại / có tin lại sau im lặng: `NET_SHIELD_MS` hộ thể (bất tử), quái đang đánh mình mất mục tiêu; máu / linh lực giữ như lúc rớt. Máy chủ gửi `netShield { ms }`.
//  4. Bị hạ khi đã im lặng >= `NET_SPARE_SILENCE_MS`: KHÔNG tính chết thật (không Hoàng Tuyền, không mất kiếp): hồi ở điểm an toàn gần nhất với `NET_SPARE_HP_PCT` khí huyết
//     tối đa, kèm hộ thể; ghi nhật ký kiểm toán.
//  5. Hồn lìa xác không đánh / dùng chiêu / dùng đan / nhặt đồ; thách đấu mà một bên mất kết nối thì huỷ trận (hoà).
// TƯƠNG THÍCH: chỉ THÊM (tin, hằng số, trường tuỳ chọn của `JoinOptions`) nên KHÔNG tăng `PROTOCOL_VERSION`.

/** Nhịp gửi tin tối thiểu của client ở tiền cảnh (ms): `ping` mỗi chừng này (kể cả khi đứng yên). Client khai giá trị này ở `JoinOptions.beatMs`. */
export const NET_BEAT_MS = 1000;
/** Client khai `beatMs` lớn hơn mức này (hoặc nhỏ hơn `NET_BEAT_MIN_MS`) thì máy chủ KHÔNG áp luật im lặng cho người đó (nhịp quá thưa không đủ chứng cứ). */
export const NET_BEAT_MAX_MS = 1500;
export const NET_BEAT_MIN_MS = 250;
/** Máy chủ không nhận tin nào của client (có khai nhịp) quá chừng này (ms) thì đưa vào "hồn lìa xác" ngay, dù socket còn mở. */
export const NET_SILENCE_GHOST_MS = 3000;
/** Bị hạ khi client đã im lặng từ chừng này (ms) trở lên: tha chết do mạng (không mất kiếp). */
export const NET_SPARE_SILENCE_MS = 2000;
/** Giữ nhân vật chờ nối lại khi rớt socket (giây). */
export const NET_RECONNECT_GRACE_S = 90;
/** Thời gian hộ thể sau khi nối lại / có tin lại / được tha chết (ms). */
export const NET_SHIELD_MS = 3000;
/** Khí huyết (tỉ lệ khí huyết tối đa) khi được tha chết do mạng, hồi ở điểm an toàn gần nhất. */
export const NET_SPARE_HP_PCT = 0.1;

/** Tên tin máy chủ -> client (chỉ chủ nhân vật nhận). */
export const NET_MSG = { shield: "netShield" } as const;

/** Lý do hộ thể: `resume` = nối lại / có tin lại sau im lặng; `spared` = vừa được tha chết do mạng (đã hồi ở điểm an toàn). */
export type NetShieldReason = "resume" | "spared";

/** Máy chủ -> client: nhân vật đang được hộ thể `ms` mili-giây tính từ lúc gửi (đồng hồ máy chủ; client đếm ngược theo đồng hồ của mình). */
export interface NetShieldMsg {
  ms: number;
  reason: NetShieldReason;
}

/**
 * Đọc nhịp client khai ở `JoinOptions.beatMs` (máy chủ không tin client): số hữu hạn trong [`NET_BEAT_MIN_MS`, `NET_BEAT_MAX_MS`] thì nhận (làm tròn xuống),
 * còn lại `null` = không áp luật im lặng cho người này (như client cũ).
 */
export function parseBeatMs(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const v = Math.floor(raw);
  return v >= NET_BEAT_MIN_MS && v <= NET_BEAT_MAX_MS ? v : null;
}
