// Từ cấm (issue #1199, mục 61.1): nguồn máy đọc được cho mọi agent nội dung (D / E / G) và để Dev F nối vào
// `npm run check:content` (Phần 3 #1200). Chặn những chữ KHÔNG được phép xuất hiện trong NỘI DUNG GAME Tiên Giới:
//   (1) tên riêng của truyện / game khác (Vạn Kiếp Tu Tiên và các tiên hiệp khác) — nhân vật, tông phái, môn phái,
//       tự viện, quốc gia; thế giới Tiên Giới giữ nguyên, KHÔNG lấy của game/người khác (AGENTS.md "Asset nguồn 3").
//   (2) từ hiện đại lạc văn phong tu tiên (ok / level / boss...) — nhất là trong LỜI THOẠI NPC, mô tả.
//
// KHÁC `glossary.ts` (bảng thuật ngữ CHUẨN + biến thể sai): ở đây là DANH SÁCH CHỮ CẤM — mọi dạng (hoa / thường,
// thiếu dấu nếu là chữ trần) đều cấm vì KHÔNG có cách viết hợp lệ. Nên matcher KHớp KHÔNG phân biệt hoa / thường,
// nhưng vẫn ranh giới từ hai bên + NFC để khỏi bám chữ khác (vd "ok" KHÔNG bám "book"; "Minh" trong "Bắc Minh"
// KHÔNG bám chữ "minh" riêng lẻ hợp lệ).
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
 * DANH SÁCH TỪ CẤM. Dữ liệu lấy từ những chỗ đã xác nhận rò rỏ tên riêng của nguồn khác: AGENTS.md (Asset nguồn 3:
 * Thanh Vân Môn, Bắc Minh, Huyền Vũ Môn, Kim Đạo Tự, Đan Hà Cốc), test `skills-kim-tho.test.ts` (VKTT_PROPER), và
 * ví dụ người dùng trong issue #1199 (Hàn Lập). CHƯA phủ hết — gặp rò rỏ mới (tên nhân vật / tông phái truyện khác)
 * thì THÊM dòng vào đây, đừng bịa danh sách rộng không có bằng chứng.
 */
export const BANNED_TERMS: readonly BannedTerm[] = [
  // --- Tông phái / môn phái / tự viện / cốc của Vạn Kiếp Tu Tiên (AGENTS.md + skills-kim-tho.test.ts) ---
  {
    term: "Thanh Vân Môn",
    reason: "tông phái của Vạn Kiếp Tu Tiên; KHÔNG làm tông phái của Tiên Giới",
  },
  {
    term: "Thanh Vân Kiếm Tông",
    reason: "tông phái của Vạn Kiếp Tu Tiên; KHÔNG làm tông phái của Tiên Giới",
  },
  {
    term: "Bắc Minh",
    reason: "môn phái của Vạn Kiếp Tu Tiên; KHÔNG lấy làm của Tiên Giới",
  },
  {
    term: "Huyền Vũ Môn",
    reason: "môn phái của Vạn Kiếp Tu Tiên; KHÔNG lấy làm của Tiên Giới",
  },
  {
    term: "Kim Đạo Tự",
    reason: "tự viện của Vạn Kiếp Tu Tiên; KHÔNG lấy làm của Tiên Giới",
  },
  {
    term: "Đan Hà Cốc",
    reason: "cốc (địa danh tông phái) của Vạn Kiếp Tu Tiên; KHÔNG lấy làm của Tiên Giới",
  },
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

/** Là chữ (Unicode letter, kể cả tiếng Việt có dấu) — dùng kiểm ranh giới từ. */
function isLetter(ch: string | undefined): boolean {
  return ch !== undefined && /\p{L}/u.test(ch);
}

/**
 * Tìm mọi chữ cấm trong `text`. Trả danh sách lý do dạng `bị cấm '<chữ thấy>' (<lý do>)` (có gợi ý thì thêm
 * `-> dùng '<thay thế>'`; rỗng = sạch). Khớp KHÔNG phân biệt hoa / thường + ranh giới từ hai bên + NFC.
 *
 * KHÔNG phân biệt hoa / thường vì chữ cấm KHÔNG có dạng hợp lệ nào (khác `glossaryViolations` — nơi chỉ báo biến
 * thể sai, bỏ qua dạng chuẩn). Vẫn ranh giới từ để khỏi bám chữ khác: "ok" KHÔNG bám "book"/"OKA"; "Bắc Minh"
 * KHÔNG bám chữ "minh" riêng lẻ. toLowerCase KHÔNG đổi độ dài với tiếng Việt precomposed + ASCII (chữ ta ta chỉ
 * dùng hai tập này) nên vị trí tìm được ở bản thường áp thẳng lại bản gốc để cắt chuỗi + kiểm ranh giới.
 */
export function bannedViolations(text: string): string[] {
  const out: string[] = [];
  const src = text.normalize("NFC");
  const hay = src.toLowerCase();
  for (const b of BANNED_TERMS) {
    const term = b.term.normalize("NFC");
    if (!term) continue;
    const needle = term.toLowerCase();
    let from = 0;
    for (;;) {
      const idx = hay.indexOf(needle, from);
      if (idx < 0) break;
      const end = idx + needle.length;
      const atWordStart = idx === 0 || !isLetter(src[idx - 1]);
      const atWordEnd = end >= src.length || !isLetter(src[end]);
      if (atWordStart && atWordEnd) {
        const seen = src.slice(idx, end);
        let line = `bị cấm '${seen}' (${b.reason})`;
        if (b.suggest) line += ` -> dùng '${b.suggest}'`;
        out.push(line);
      }
      from = end;
    }
  }
  return out;
}
