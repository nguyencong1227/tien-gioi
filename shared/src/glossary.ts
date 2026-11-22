// Từ điển Tiên Giới (issue #1198, mục 61.1): nguồn chung máy đọc được cho mọi agent nội dung (D / E / G)
// và cho `npm run check:content` của Dev F kiểm thuật ngữ. A đã chốt khung giao diện; E điền dữ liệu từ CHÍNH mã nguồn.
//
// KHÁC `ngon-ngu.test.ts` (rule (d) "Linh thạch" viết tay): đây là BẢNG dữ liệu tổng quát — thêm thuật ngữ chỉ cần thêm dòng,
// không đụng logic kiểm. `glossaryViolations` thuần hàm, KHÔNG đọc tệp, KHÔNG import dữ liệu từ nơi nào khác (chỉ kiểu).
//
// LUẬT KHớp: mỗi biến thể `wrong` khớp CHUỖI TỪ (bao quanh bởi ranh giới chữ, không dính chữ khác hai bên),
// KHÔNG phân biệt dấu thanh (để bắt "Truc Co" thiếu dấu) NHƯNG phân biệt HOA / THƯỜNG (để "Trúc Cơ" đúng KHÔNG bị báo oan,
// còn "trúc cơ" viết thường thì báo). Một khớp mà chữ gốc TRÙNG HẲN `canonical` thì bỏ qua (đó là cách viết đúng).

export type GlossaryGroup =
  "canh-gioi" | "he" | "pham-cap" | "tien-te" | "khai-niem" | "dia-danh" | "nhan-vat";

export interface GlossaryTerm {
  /** Duy nhất, dạng `<nhóm>.<ten>` (vd "canh-gioi.truc-co"). */
  id: string;
  /** Nhóm để lọc / báo cáo. */
  group: GlossaryGroup;
  /** Cách viết chuẩn (đúng hoa / thường). */
  canonical: string;
  /** Biến thể SAI hay gặp. Khớp không phân biệt dấu nhưng phân biệt hoa thường (xem luật trên). */
  wrong: readonly string[];
  /** Quy tắc kèm (khi nào viết hoa, lưu ý dễ lẫn...). */
  note?: string;
}

/**
 * BẢNG TỪ ĐIỂN. Dữ liệu điền từ CHÍNH mã nguồn (realms.ts / map.ts / items.ts / ambush.ts / reincarnation.ts...), KHÔNG bịa.
 * CHƯA phủ hết: tên trùm / NPC thường (cần xử lý riêng), một số khái niệm (Duyên dễ lẫn "cơ duyên") — bổ sung các lượt sau.
 * HỆ: chỉ thêm 3 hệ bóc dấu KHÔNG đụng chữ khác (Mộc/Thủy/Vô sắc); Hỏa/Thổ/Băng/Âm/Lôi TRỄ vì bóc dấu trùng chữ đang có (Lôi ≡ Lối — xem khối `he` dưới);
 * Kim/Phong KHÔNG dấu; casing (hoa/thường) của MỌI hệ để Dev G chốt ở #1199 — nên các term hệ CHỈ có wrong thiếu dấu, KHÔNG có wrong hoa/thường.
 */
export const GLOSSARY: readonly GlossaryTerm[] = [
  // --- Cảnh giới (realms.ts: REALMS) ---
  {
    id: "canh-gioi.pham-nhan",
    group: "canh-gioi",
    canonical: "Phàm Nhân",
    wrong: ["Pham Nhan", "pham nhan"],
  },
  {
    id: "canh-gioi.luyen-khi",
    group: "canh-gioi",
    canonical: "Luyện Khí",
    wrong: ["Luyen Khi", "luyen khi"],
  },
  {
    id: "canh-gioi.truc-co",
    group: "canh-gioi",
    canonical: "Trúc Cơ",
    wrong: ["Truc Co", "truc co"],
  },
  {
    id: "canh-gioi.kim-dan",
    group: "canh-gioi",
    canonical: "Kim Đan",
    wrong: ["Kim Dan", "kim dan"],
  },
  {
    id: "canh-gioi.nguyen-anh",
    group: "canh-gioi",
    canonical: "Nguyên Anh",
    wrong: ["Nguyen Anh", "nguyen anh"],
  },
  {
    id: "canh-gioi.hoa-than",
    group: "canh-gioi",
    canonical: "Hóa Thần",
    wrong: ["Hoa Than", "hoa than"],
  },
  {
    id: "canh-gioi.luyen-hu",
    group: "canh-gioi",
    canonical: "Luyện Hư",
    wrong: ["Luyen Hu", "luyen hu"],
  },
  {
    id: "canh-gioi.hop-the",
    group: "canh-gioi",
    canonical: "Hợp Thể",
    wrong: ["Hop The", "hop the"],
  },
  {
    id: "canh-gioi.dai-thua",
    group: "canh-gioi",
    canonical: "Đại Thừa",
    wrong: ["Dai Thua", "dai thua"],
    note: "Thừa KHÔNG phải 'Thăng'.",
  },
  {
    id: "canh-gioi.do-kiep",
    group: "canh-gioi",
    canonical: "Độ Kiếp",
    wrong: ["Do Kiep", "do kiep"],
  },

  // --- Địa danh (map.ts: tên bản đồ thường) ---
  {
    id: "dia-danh.lac-ha-tran",
    group: "dia-danh",
    canonical: "Lạc Hà Trấn",
    wrong: ["Lac Ha Tran", "lac ha tran"],
  },
  {
    id: "dia-danh.hac-phong-coc",
    group: "dia-danh",
    canonical: "Hắc Phong Cốc",
    wrong: ["Hack Phong Coc", "hack phong coc"],
  },
  {
    id: "dia-danh.am-suong-trach",
    group: "dia-danh",
    canonical: "Âm Sương Trạch",
    wrong: ["Am Suong Trach", "am suong trach"],
  },
  {
    id: "dia-danh.han-van-linh",
    group: "dia-danh",
    canonical: "Hàn Vân Lĩnh",
    wrong: ["Han Van Linh", "han van linh"],
  },

  // --- Hệ (skills.ts: ELEMENTS — 10 hệ) ---
  // CHỈ thêm 3 hệ mà việc bóc dấu KHÔNG đụng chữ khác đang có trong chữ hiển thị (đã quét CẢ lời thoại — xem ghi chú test).
  // TRỄ (đừng thêm khi chưa có cơ chế khử nhập nhằng — pha / ngữ cảnh):
  //   Hỏa "Hoa" ≡ Hoa (Băng Hoa Loạn) / Hóa (Hóa Huyết, Hóa Thần) / Hòa (Hòa thượng);
  //   Thổ "Tho" ≡ Thố·Thỏ (Linh Thố) / Thợ (Thợ rèn);  Băng "Bang" ≡ Bảng (Bảng cáo thị);  Âm "Am" ≡ Ám (Ám sát);
  //   Lôi "Loi" ≡ Lối (Lối núi, lối ra) — BÁO OAN thật trên SECT_QUESTS, đã bỏ.
  //   Matcher bóc dấu KHÔNG phân biệt được nên thêm vào sẽ BÁO OAN chữ đúng.
  // Kim / Phong KHÔNG dấu → bỏ wrong. Casing (hoa/thường) của MỌI hệ để Dev G chốt ở #1199 → term hệ chỉ có wrong thiếu dấu.
  { id: "he.moc", group: "he", canonical: "Mộc", wrong: ["Moc"] },
  { id: "he.thuy", group: "he", canonical: "Thủy", wrong: ["Thuy"] },
  {
    id: "he.vo-sac",
    group: "he",
    canonical: "Vô sắc",
    wrong: ["Vo sac"],
    note: "Hệ id 'none' (không khắc / không bị khắc); KHÔNG phải chữ 'vô sắc' thường.",
  },

  // --- Tiền tệ ---
  {
    id: "tien-te.linh-thach",
    group: "tien-te",
    canonical: "Linh thạch",
    // Matcher KHÔNG phân biệt dấu nên chỉ cần liệt kê các biến thể KHÁC chữ hoa/thường; thiếu dấu tự động bắt.
    wrong: ["linh thạch", "Linh Thạch", "LINH THẠCH"],
    note: "Chỉ chữ cái đầu 'L' hoa, 'thạch' thường (nhất quán rule (d) của ngon-ngu). Viết thường hết / hoa cả hai / in hoa hết đều sai.",
  },

  // --- Phẩm cấp (items.ts: RARITY_NAMES) ---
  { id: "pham-cap.pham-pham", group: "pham-cap", canonical: "Phàm phẩm", wrong: ["Pham pham"] },
  { id: "pham-cap.linh-pham", group: "pham-cap", canonical: "Linh phẩm", wrong: ["Linh pham"] },
  { id: "pham-cap.bao-pham", group: "pham-cap", canonical: "Bảo phẩm", wrong: ["Bao pham"] },
  { id: "pham-cap.tien-pham", group: "pham-cap", canonical: "Tiên phẩm", wrong: ["Tien pham"] },
  { id: "pham-cap.than-pham", group: "pham-cap", canonical: "Thần phẩm", wrong: ["Than pham"] },

  // --- Khái niệm ---
  {
    id: "khai-niem.hoang-thuyen",
    group: "khai-niem",
    canonical: "Hoàng Tuyền",
    wrong: ["Hoang Thuyen", "hoang thuyen"],
    note: "Chết thật (mất kiếp), KHÔNG viết 'Hoànguyền'.",
  },
  {
    id: "khai-niem.tam-sinh-thach",
    group: "khai-niem",
    canonical: "Tam Sinh Thạch",
    wrong: ["Tam Sinh Thach", "tam sinh thach"],
    note: "Bảng mở khóa lợi ích vĩnh viễn của luân hồi.",
  },

  // --- Tên chính: trùm (boss-level, có chữ "Vương") — quái thường để lượt sau ---
  {
    id: "nhan-vat.thien-han-vuong",
    group: "nhan-vat",
    canonical: "Thiên Hàn Vương",
    wrong: ["Thien Han Vuong", "thien han vuong"],
    note: "Trùm Nguyên Anh, rơi Thiên Hàn châu.",
  },
  {
    id: "nhan-vat.linh-hu-yeu-vuong",
    group: "nhan-vat",
    canonical: "Linh Hư Yêu Vương",
    wrong: ["Linh Hu Yeu Vuong", "linh hu yeu vuong"],
    note: "Trùm bí cảnh Linh Hư.",
  },
  {
    id: "nhan-vat.phan-than-yeu-vuong",
    group: "nhan-vat",
    canonical: "Phân Thân Yêu Vương",
    wrong: ["Phan Than Yeu Vuong", "phan than yeu vuong"],
  },
];

/** Bóc dấu thanh (NFKD + bỏ dấu kết hợp U+0300–U+036F) để khớp KHÔNG phân biệt dấu, nhưng GIỮ HOA / THƯỜNG. */
function stripDia(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

/** Là chữ (Unicode letter, kể cả tiếng Việt có dấu) — dùng kiểm ranh giới từ. */
function isLetter(ch: string | undefined): boolean {
  return ch !== undefined && /\p{L}/u.test(ch);
}

/**
 * Tìm mọi vi phạm thuật ngữ trong `text`. Trả danh sách lý do dạng `thấy '<biến thể sai>' -> dùng '<chuẩn>'` (rỗng = sạch).
 * Khớp từ (ranh giới chữ hai bên), KHÔNG phân biệt dấu nhưng PHÂN BIỆT hoa thường; khớp trùng hệt `canonical` thì bỏ qua.
 */
export function glossaryViolations(text: string): string[] {
  const out: string[] = [];
  // Chuẩn NFC trước: tiếng Việt precomposed nên bóc dấu (NFKD) bảo đảm 1 chữ = 1 đơn vị mã,
  // giữ cho tọa độ folded khớp tọa độ gốc (khi kiểm ranh giới từ / cắt chuỗi). Quy tắc NFC của `ngon-ngu` lo phần chữ tách rời.
  const src = text.normalize("NFC");
  const folded = stripDia(src);
  for (const term of GLOSSARY) {
    for (const w of term.wrong) {
      const fw = stripDia(w);
      if (!fw) continue;
      let from = 0;
      for (;;) {
        const idx = folded.indexOf(fw, from);
        if (idx < 0) break;
        const end = idx + fw.length;
        const atWordStart = idx === 0 || !isLetter(src[idx - 1]);
        const atWordEnd = end >= src.length || !isLetter(src[end]);
        if (atWordStart && atWordEnd) {
          const span = src.slice(idx, idx + w.length);
          if (span !== term.canonical) out.push(`thấy '${span}' -> dùng '${term.canonical}'`);
        }
        from = end;
      }
    }
  }
  return out;
}
