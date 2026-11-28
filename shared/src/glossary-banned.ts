// Từ cấm (issue #1199, mục 61.1; sửa theo mục 75 / #1462): nguồn máy đọc được cho mọi agent nội dung (D / E / G) và để
// Dev F nối vào `npm run check:content` (Phần 3 #1200). Chặn những chữ KHÔNG được phép xuất hiện trong NỘI DUNG GAME Tiên Giới:
//   (1) tên riêng của truyện / game KHÁC (vd Hàn Lập của Phàm Nhân Tu Tiên) — nhân vật, tông phái, quốc gia mượn
//       từ nguồn KHÔNG được phép (AGENTS.md "Asset nguồn 3"). Từ 25/11/2026 (QUYET_DINH_M3 mục 75) tên của Vạn Kiếp Tu
//       Tiên (cốt truyện, địa danh, nhân vật, quốc gia, tông phái: Huyền Vũ Môn, Bắc Minh, Thanh Vân Môn...) ĐƯỢC dùng
//       nên KHÔNG còn nằm ở đây; thuật ngữ chuẩn của chúng ở `glossary.ts` / `docs/TU_DIEN_TIEN_GIOI.md`.
//   (2) từ hiện đại lạc văn phong tu tiên (ok / level / boss...) — nhất là trong LỜI THOẠI NPC, mô tả.
//
// KHÁC `glossary.ts` (bảng thuật ngữ CHUẨN + biến thể sai): ở đây là DANH SÁCH CHỮ CẤM — mọi dạng (hoa / thường,
// thiếu dấu nếu là chữ trần) đều cấm vì KHÔNG có cách viết hợp lệ. Nên matcher KHớp KHÔNG phân biệt hoa / thường,
// nhưng vẫn ranh giới từ hai bên + NFC để khỏi bám chữ khác (vd "ok" KHÔNG bám "book"; "Hàn Lập"
// KHÔNG bám chữ "hàn" / "lập" riêng lẻ hợp lệ).
//
// PHẠM VI ÁP DỤNG (quan trọng — tránh dương tính giả): CHỈ áp cho NỘI DUNG GAME (hội thoại, tên, mô tả vật phẩm /
// chiêu / quái / NPC / nhiệm vụ...). KHÔNG áp cho chú thích tác quyền, CREDITS.md, NGUON_NOI_DUNG.md, hoặc chính các
// tệp test (nơi nêu tên cấm để kiểm). Dev F nối `bannedViolations` vào `check:content` chỉ quét chữ hiển thị game.
//
// CHỮ HÁN / CJK KHÔNG đưa vào đây: đã bị `ngon-ngu.test.ts` (quy tắc a) chặn trên TẤT CẢ chữ hiển thị game — nối
// trùng chỉ gây dư thừa. Danh sách này chỉ lo tên riêng Latinh + từ hiện đại.
//
// `bannedViolations` thuần hàm, KHÔNG đọc tệp, KHÔNG import dữ liệu từ nơi khác (chỉ kiểu). Thêm chữ cấm chỉ cần thêm
// dòng vào BANNED_TERMS, không đụng logic kiểm.

export interface BannedTerm {
  /** Chuỗi chữ cấm. Khớp KHÔNG phân biệt hoa / thường, có ranh giới từ hai bên (xem `bannedViolations`). */
  term: string;
  /** Lý do cấm — in kèm khi báo vi phạm. */
  reason: string;
  /** Cách nói thay thế hợp văn phong Tiên Giới (nếu có) — gợi ý sửa. */
  suggest?: string;
}

/**
 * DANH SÁCH TỪ CẤM. Chỉ còn tên của truyện / game KHÁC (ví dụ người dùng trong issue #1199: Hàn Lập; danh sách rộng hơn
 * ở `FOREIGN_NAMES` của `client/src/no-foreign-names.test.ts`) và từ hiện đại lạc văn phong. Tên của Vạn Kiếp Tu Tiên
 * đã gỡ theo mục 75 (#1462). CHƯA phủ hết — gặp rò rỉ mới (tên nhân vật / tông phái truyện khác) thì THÊM dòng vào đây,
 * đừng bịa danh sách rộng không có bằng chứng.
 */
export const BANNED_TERMS: readonly BannedTerm[] = [
  // --- Nhân vật của truyện / game khác (issue #1199 ví dụ) ---
  {
    term: "Hàn Lập",
    reason: "nhân vật của tiên hiệp khác (Phàm Nhân Tu Tiên); KHÔNG làm nhân vật của Tiên Giới",
  },
  // --- Từ hiện đại lạc văn phong tu tiên (thường lộ trong lời thoại / mô tả) ---
  {
    term: "ok",
    reason: "từ tiếng Anh lạc văn phong",
    suggest: "được / vâng / phải vậy",
  },
  {
    term: "level",
    reason: "từ tiếng Anh lạc văn phong",
    suggest: "cấp / cảnh giới",
  },
  {
    term: "boss",
    reason: "từ tiếng Anh lạc văn phong",
    suggest: "trùm",
  },
];

/** Escape ký tự đặc biệt của RegExp trong một mảnh chữ (để nối an toàn vào pattern). */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Tìm mọi chữ cấm trong `text`. Trả danh sách lý do dạng `bị cấm '<chữ thấy>' (<lý do>)` (có gợi ý thì thêm
 * `-> dùng '<thay thế>'`; rỗng = sạch). Khớp KHÔNG phân biệt hoa / thường + ranh giới chữ hai bên + NFC; các chữ
 * trong một term cách nhau bởi CHỈ khoảng trắng (nhiều dấu cách / xuống dòng / NBSP đều chấp nhận).
 *
 * KHÔNG phân biệt hoa / thường vì chữ cấm KHÔNG có dạng hợp lệ nào (khác `glossaryViolations` — nơi chỉ báo biến
 * thể sai, bỏ qua dạng chuẩn). Ranh giới chữ dùng lookbehind / lookahead `\p{L}` (chữ Unicode, kể cả tiếng Việt có
 * dấu) để khỏi bám chữ khác: "ok" KHÔNG bám "book"/"OKA"; "Hàn Lập" KHÔNG bám chữ "hàn" / "lập" riêng lẻ. MỖI term dựng
 * MỘT RegExp (flag `giu` = global + KHÔNG phân biệt hoa thường + Unicode); các chữ trong term nối bằng `\s+` để
 * chịu nhiều dấu cách / xuống dòng / NBSP giữa chúng.
 *
 * KHÔNG dùng `toLowerCase()` + `indexOf`: `İ` (U+0130, "I" có chấm trên) thường hoá thành 2 ký tự làm lệch chỉ số,
 * bỏ lỡ vi phạm đứng sau nó (đã gặp ở đầu `07ef3b6f`: `"İ Hàn Lập"` báo 0 thay vì 1).
 */
export function bannedViolations(text: string): string[] {
  const src = text.normalize("NFC");
  const out: string[] = [];
  for (const b of BANNED_TERMS) {
    const term = b.term.normalize("NFC").trim();
    if (!term) continue;
    // Ranh giới chữ hai bên (?<!\p{L}) / (?!\p{L}); các chữ trong term cách nhau bởi \s+ (nhiều khoảng / xuống dòng / NBSP).
    const pattern = "(?<!\\p{L})" + term.split(/\s+/).map(escapeRegex).join("\\s+") + "(?!\\p{L})";
    for (const m of src.matchAll(new RegExp(pattern, "giu"))) {
      let line = `bị cấm '${m[0]}' (${b.reason})`;
      if (b.suggest) line += ` -> dùng '${b.suggest}'`;
      out.push(line);
    }
  }
  return out;
}
