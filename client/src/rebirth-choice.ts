// Lựa chọn đầu thai AN TOÀN (lỗi gấp mục 58, v0.5.2: nhân vật mới bấm "Đầu thai" chỉ thấy toast rồi vẫn kẹt ở Hoàng Tuyền).
//
// Máy chủ kiểm `RebirthMsg` bằng `validateRebirth` (shared) và TỪ CHỐI cả yêu cầu nếu một chỗ sai (giữ quá số ô, khắc quá nấc / chiêu không có / trùng, xuất thân
// chưa mở). Client dựng tin từ trạng thái màn Hoàng Tuyền (`LimboMsg` + lựa chọn của người chơi) nên có thể lệch bản của máy chủ (chân linh vừa đổi, tin cũ, chọn
// sẵn từ lần trước). Mô-đun này CHỈ GỬI phần hợp lệ: bỏ phần vượt số ô / không có / không hợp lệ rồi chạy lại ĐÚNG hàm của máy chủ làm chốt chặn; nếu vẫn không qua
// thì lùi về lựa chọn tối thiểu (Phàm gia, không giữ gì, giữ nguyên chiêu khắc) luôn hợp lệ. Trả kèm danh sách phần bị bỏ để màn hình báo cho người chơi.
// Thuần (không DOM) để test được.
import {
  DEFAULT_ORIGIN,
  engraveSlotsOf,
  keepSlotsOf,
  originOf,
  skillOf,
  validateRebirth,
  type LimboMsg,
  type RebirthChoice,
  type SoulView,
} from "@tien-gioi/shared";

/** Điều người chơi (hoặc mặc định) muốn: `engrave` vắng = giữ nguyên chiêu đã khắc (không gửi trường này). */
export interface RebirthWish {
  origin: string;
  keep: readonly string[];
  engrave?: readonly string[];
}

export interface SafeRebirth {
  choice: RebirthChoice;
  /** Phần bị bỏ, viết sẵn cho người đọc ("xuất thân ...", "2 di vật vượt số ô", ...); rỗng = gửi đúng như muốn */
  dropped: string[];
}

/** Chuẩn hoá lựa chọn đầu thai theo chân linh + danh sách giữ / khắc của màn Hoàng Tuyền; luôn trả lựa chọn mà `validateRebirth` chấp nhận. */
export function safeRebirthChoice(
  soul: Pick<SoulView, "unlocks" | "origins"> | null | undefined,
  limbo: Pick<LimboMsg, "keepable" | "engravable"> | null | undefined,
  wish: RebirthWish,
): SafeRebirth {
  const unlocks = soul && typeof soul.unlocks === "object" && soul.unlocks ? soul.unlocks : {};
  const origins = Array.isArray(soul?.origins) ? (soul!.origins as string[]) : [];
  const keepable = Array.isArray(limbo?.keepable) ? limbo!.keepable : [];
  const engravable = Array.isArray(limbo?.engravable) ? limbo!.engravable! : [];
  const dropped: string[] = [];

  // xuất thân: Phàm gia luôn được; xuất thân khác phải đã mở (có trong chân linh) và có phí (máy chủ từ chối xuất thân phí 0 khác Phàm gia)
  let origin = DEFAULT_ORIGIN;
  if (wish.origin !== DEFAULT_ORIGIN) {
    const o = originOf(wish.origin);
    if (o && o.cost > 0 && origins.includes(o.id)) origin = o.id;
    else dropped.push(`xuất thân ${String(wish.origin)} (chưa mở)`);
  }

  // giữ lại: mỗi id phải còn trong danh sách giữ được (đếm theo số lượng: một id có thể xuất hiện nhiều lần), tối đa `keepSlotsOf`
  const capKeep = keepSlotsOf(unlocks);
  const pool = [...keepable];
  const keep: string[] = [];
  let overKeep = 0;
  for (const id of wish.keep) {
    const i = typeof id === "string" ? pool.indexOf(id) : -1;
    if (i < 0 || keep.length >= capKeep) {
      overKeep++;
      continue;
    }
    pool.splice(i, 1);
    keep.push(id);
  }
  if (overKeep > 0) dropped.push(`${overKeep} di vật (vượt ${capKeep} ô đã mở hoặc không còn)`);

  // khắc chiêu: chỉ khi người chơi đổi bộ chọn; mỗi chiêu phải khắc được, không trùng, tối đa `engraveSlotsOf`
  let engrave: string[] | undefined;
  if (wish.engrave !== undefined) {
    const capEng = engraveSlotsOf(unlocks);
    engrave = [];
    let overEng = 0;
    for (const id of wish.engrave) {
      if (
        typeof id !== "string" ||
        engrave.includes(id) ||
        !engravable.includes(id) ||
        !skillOf(id) ||
        engrave.length >= capEng
      ) {
        overEng++;
        continue;
      }
      engrave.push(id);
    }
    if (overEng > 0)
      dropped.push(`${overEng} chiêu khắc (vượt ${capEng} ô đã mở hoặc không khắc được)`);
  }

  const choice: RebirthChoice =
    engrave === undefined ? { origin, keep } : { origin, keep, engrave };
  // chốt chặn: ĐÚNG hàm của máy chủ; vẫn không qua (dữ liệu lạ) thì lùi về lựa chọn tối thiểu luôn hợp lệ
  if (validateRebirth({ unlocks, origins }, choice, keepable, engravable) === null) {
    dropped.push("toàn bộ lựa chọn (không khớp chân linh), đầu thai với mặc định");
    return { choice: { origin: DEFAULT_ORIGIN, keep: [] }, dropped };
  }
  return { choice, dropped };
}

/**
 * Toast nào là LỜI TỪ CHỐI của máy chủ cho tin `rebirth` (nên hiện lên dòng trạng thái ở màn Hoàng Tuyền): toast tone "bad" (lựa chọn không hợp lệ, chưa khắc được chân
 * linh) hoặc nhắc "ghi sổ" (đúng lời "Linh hồn chưa kịp ghi sổ, chờ một lát." tone info). Thông báo THÔNG TIN khác (vd máy chủ báo phần bị bỏ khỏi lựa chọn) KHÔNG phải từ chối: đầu thai vẫn tiếp tục. Toast không liên quan tới lúc chờ (tin vui như thành tựu,
 * thông báo quái "★ ... nên đi đội.") thì KHÔNG: nếu không sẽ báo lỗi oan và mở khoá nút khi máy chủ còn đang xử lý.
 */
export function isRebirthRefusal(m: { text?: unknown; tone?: unknown }): boolean {
  if (typeof m.text !== "string" || m.text === "") return false;
  if (m.tone === "bad") return true;
  return m.tone !== "good" && /ghi sổ/i.test(m.text);
}
