/**
 * Lọc / tìm / sắp xếp sổ chiêu (CT11a, #1056): khi game có 48-80 chiêu, danh sách chiêu ĐÃ HỌC dài, người chơi cần tìm nhanh theo tên (không cần gõ dấu), hệ, phẩm,
 * ô đang gắn, và chỉ chiêu dùng được. THUẦN (không DOM, không đồng hồ, không đụng dữ liệu máy chủ): `ui.ts` đọc bộ lọc từ ô nhập / lựa chọn rồi gọi các hàm ở đây.
 *
 * Nguyên tắc: không bao giờ biến đổi danh sách đầu vào; không dùng RegExp từ chuỗi người chơi gõ (ký tự đặc biệt chỉ là chữ thường); thứ tự tất định
 * (cùng đầu vào, cùng thứ tự); đầu vào lạ (không phải chuỗi / số) về mặc định chứ không ném lỗi.
 */

/** Đủ thông tin một hàng sổ chiêu cần để lọc (`SkillRow` của `skills-panel.ts` thoả cấu trúc này). */
export interface FilterableSkill {
  id: string;
  name: string;
  /** Tên quyển (tìm được cả bằng tên quyển), có thể rỗng. */
  book: string;
  /** Tên hệ hiển thị ("Hỏa"): tìm bằng chữ "hoa" ra chiêu hệ Hỏa. */
  element: string;
  /** id hệ ("hoa", "none"...): khớp với lựa chọn hệ. */
  elementId: string;
  /** Phẩm 0 Hoàng .. 3 Thiên. */
  grade: number;
  /** Ô đang gắn (2-5) hoặc null. */
  slotNow: number | null;
  /** "Cần đạt ..." khi CHƯA đủ cảnh giới để dùng, không thì null. */
  need: string | null;
}

export type SkillSlotFilter = "all" | "equipped" | "free";

export interface SkillFilter {
  /** Chuỗi tìm: nhiều từ cách nhau khoảng trắng, MỖI từ phải xuất hiện (không phân biệt hoa thường, không cần dấu). */
  q: string;
  /** id hệ hoặc "all". */
  element: string;
  /** Phẩm 0-3 hoặc `null` (mọi phẩm). */
  grade: number | null;
  slot: SkillSlotFilter;
  /** Chỉ chiêu dùng được ngay (đủ cảnh giới). */
  usable: boolean;
}

export const DEFAULT_SKILL_FILTER: Readonly<SkillFilter> = {
  q: "",
  element: "all",
  grade: null,
  slot: "all",
  usable: false,
};

/** Độ dài tối đa của chuỗi tìm (chặn dán cả đoạn văn vào ô tìm). */
export const SKILL_QUERY_MAX = 64;

/**
 * Chữ thường, bỏ dấu tiếng Việt (NFD rồi xoá dấu kết hợp; "đ" -> "d"), gộp khoảng trắng: "Kiếm Khí" và "kiem khi" giống nhau. Không phải chuỗi -> "".
 */
export function foldText(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Bộ lọc đã làm sạch từ đầu vào bất kỳ (ô nhập / URL / thử nghiệm): trường sai kiểu về mặc định, chuỗi tìm cắt về `SKILL_QUERY_MAX`. */
export function cleanSkillFilter(raw: unknown): SkillFilter {
  const o = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const slot = o.slot === "equipped" || o.slot === "free" ? o.slot : "all";
  const grade =
    typeof o.grade === "number" && Number.isInteger(o.grade) && o.grade >= 0 && o.grade <= 3
      ? o.grade
      : null;
  return {
    q: typeof o.q === "string" ? o.q.slice(0, SKILL_QUERY_MAX) : "",
    element: typeof o.element === "string" && o.element !== "" ? o.element : "all",
    grade,
    slot,
    usable: o.usable === true,
  };
}

/** Bộ lọc có đang LỌC bớt gì không (để hiện nút "Bỏ lọc" và dòng "Hiện X / Y"). */
export function skillFilterActive(f: SkillFilter): boolean {
  return (
    foldText(f.q) !== "" || f.element !== "all" || f.grade !== null || f.slot !== "all" || f.usable
  );
}

/** Một hàng có qua bộ lọc không. */
export function skillMatches(row: FilterableSkill, f: SkillFilter): boolean {
  if (f.element !== "all" && row.elementId !== f.element) return false;
  if (f.grade !== null && row.grade !== f.grade) return false;
  if (f.slot === "equipped" && row.slotNow === null) return false;
  if (f.slot === "free" && row.slotNow !== null) return false;
  if (f.usable && row.need !== null) return false;
  const tokens = foldText(f.q)
    .split(" ")
    .filter((t) => t !== "");
  if (tokens.length === 0) return true;
  const hay = foldText(`${row.name} ${row.book} ${row.element}`);
  return tokens.every((t) => hay.includes(t));
}

/** Lọc (không sửa đầu vào, giữ nguyên thứ tự). */
export function filterSkills<T extends FilterableSkill>(rows: readonly T[], f: SkillFilter): T[] {
  return rows.filter((r) => skillMatches(r, f));
}

export type SkillSort = "slot" | "grade" | "name";

const byName = (a: FilterableSkill, b: FilterableSkill): number =>
  foldText(a.name).localeCompare(foldText(b.name), "vi") || a.id.localeCompare(b.id);

/**
 * Sắp xếp (bản SAO, tất định): `slot` = chiêu đang gắn lên trước theo số ô, rồi phẩm cao trước, rồi tên; `grade` = phẩm cao trước rồi tên; `name` = tên.
 * Hoà thì theo id để thứ tự không phụ thuộc thứ tự đầu vào.
 */
export function sortSkills<T extends FilterableSkill>(
  rows: readonly T[],
  mode: SkillSort = "slot",
): T[] {
  const out = [...rows];
  out.sort((a, b) => {
    if (mode === "slot") {
      const sa = a.slotNow ?? 99;
      const sb = b.slotNow ?? 99;
      if (sa !== sb) return sa - sb;
    }
    if (mode !== "name" && a.grade !== b.grade) return b.grade - a.grade;
    return byName(a, b);
  });
  return out;
}

/** "Hiện 5 / 48 chiêu" khi đang lọc, "48 chiêu" khi không. */
export function skillFilterSummary(shown: number, total: number, active: boolean): string {
  const s = Number.isFinite(shown) ? Math.max(0, Math.floor(shown)) : 0;
  const t = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  return active ? `Hiện ${s} / ${t} chiêu` : `${t} chiêu`;
}

/** Số chiêu theo từng hệ (để ghi "Hỏa (5)" trên lựa chọn hệ); hệ không có chiêu thì không có khoá. */
export function elementCounts(rows: readonly FilterableSkill[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.elementId, (m.get(r.elementId) ?? 0) + 1);
  return m;
}
