/**
 * Thứ tự chọn HƯỚNG đánh (QUYET_DINH_M3 mục 29, thay phần "Sửa" của mục 28). Lớp THUẦN (không DOM, không Phaser) để test được; `WorldScene` đưa các ứng viên vào.
 *
 * Người dùng GIỮ ưu tiên con trỏ chuột: có chuột hợp lệ trong màn chơi thì đánh / chiêu bay về phía con trỏ; KHÔNG có chuột hợp lệ thì về mục tiêu (khoá tay hoặc
 * tự động, mục 26); không có mục tiêu thì hướng nhìn.
 *   - chiêu dạng target (cone / line / fan / ground), đánh thường J, Kiếm khí K: con trỏ hợp lệ -> mục tiêu -> hướng nhìn;
 *   - chiêu self / nova: cùng thứ tự (quay mặt về hướng đó trước khi tung);
 *   - chiêu dash: phím hướng đang giữ -> con trỏ hợp lệ -> mục tiêu -> hướng nhìn.
 * Cài đặt tuỳ chọn "Ưu tiên mục tiêu hơn chuột" (mặc định TẮT, cho ai chơi thuần bàn phím) đổi chỗ con trỏ và mục tiêu.
 *
 * Con trỏ "hợp lệ" = chuột thật (không phải chạm / bút), nằm trong cửa sổ và phần tử dưới con trỏ chính là canvas màn chơi (`cursorOnScene`). Con trỏ trên bản đồ
 * nhỏ, bản đồ lớn, thẻ nhân vật, thanh menu, thanh chiêu, Tổ đội, Nhiệm vụ, Chat hay bảng đang mở thì coi như KHÔNG có chuột. Kiểm LÚC BẤM theo toạ độ con trỏ lần
 * cuối (không chỉ lúc chuột di chuyển): bảng mở ra dưới một con chuột đứng yên (bản đồ lớn bằng phím M) cũng thành "không có chuột".
 */

/** Cách chọn hướng của một lần đánh: `move` = chiêu lao (dash), `facing` = vòng nổ / hộ thể, `target` = chiêu có hướng, `basic` = đánh thường / Kiếm khí. */
export type AimKind = "move" | "facing" | "target" | "basic";

/** Nguồn của hướng đã chọn (để test và hiển thị gỡ lỗi). */
export type AimSource = "move" | "cursor" | "target" | "facing";

/** Các hướng ứng viên (rad); `null` = không có. */
export interface AimCandidates {
  /** Hướng phím di chuyển đang giữ (chỉ dùng cho dash) */
  move: number | null;
  /** Hướng tới con trỏ chuột HỢP LỆ */
  cursor: number | null;
  /** Hướng tới mục tiêu (khoá tay / tự động, hoặc quái gần nhất trong tầm khi chưa có mục tiêu) */
  target: number | null;
  /** Hướng nhìn hiện tại (luôn có) */
  facing: number;
}

export interface AimChoice {
  angle: number;
  source: AimSource;
}

function usable(a: number | null): a is number {
  return a !== null && Number.isFinite(a);
}

/**
 * Chọn hướng theo thứ tự ưu tiên ở đầu tệp. `preferTarget` = cài đặt "Ưu tiên mục tiêu hơn chuột". Ứng viên hỏng (NaN / vô hạn) bị bỏ qua như không có;
 * hướng nhìn hỏng thì 0 (không bao giờ trả NaN).
 */
export function chooseAim(
  kind: AimKind,
  c: AimCandidates,
  preferTarget: boolean = false,
): AimChoice {
  if (kind === "move" && usable(c.move)) return { angle: c.move, source: "move" };
  const order: Array<["cursor" | "target", number | null]> = preferTarget
    ? [
        ["target", c.target],
        ["cursor", c.cursor],
      ]
    : [
        ["cursor", c.cursor],
        ["target", c.target],
      ];
  for (const [source, a] of order) if (usable(a)) return { angle: a, source };
  return { angle: Number.isFinite(c.facing) ? c.facing : 0, source: "facing" };
}

/** Phần tử dưới con trỏ có phải chính canvas màn chơi không (không phải khung giao diện phủ trên màn chơi, không phải ngoài cửa sổ). */
export function cursorOnScene(hit: unknown, canvas: unknown): boolean {
  return hit !== null && hit !== undefined && hit === canvas;
}

/** Con trỏ chuột gần nhất (toạ độ cửa sổ); `null` = chưa có / vừa rời cửa sổ / vừa chạm bằng ngón tay hay bút. */
export interface CursorPos {
  x: number;
  y: number;
}

/** Ghi nhận một sự kiện con trỏ: chỉ CHUỘT THẬT được tính, chạm / bút xoá. */
export function cursorFromPointer(e: {
  pointerType?: string;
  clientX: number;
  clientY: number;
}): CursorPos | null {
  if (e.pointerType !== "mouse") return null;
  if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return null;
  return { x: e.clientX, y: e.clientY };
}

/** Khoá lưu theo THIẾT BỊ của cài đặt "Ưu tiên mục tiêu hơn chuột" (mặc định TẮT). */
export const PREFER_TARGET_STORAGE_KEY = "tg_aim_prefer_target";

/** Đọc giá trị đã lưu: chỉ đúng "1" mới bật. */
export function parsePreferTarget(raw: unknown): boolean {
  return raw === "1";
}
