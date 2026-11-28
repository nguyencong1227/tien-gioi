// Từ điển Tiên Giới (issue #1198, mục 61.1): nguồn chung máy đọc được cho mọi agent nội dung (D / E / G)
// và cho `npm run check:content` của Dev F kiểm thuật ngữ. A đã chốt khung giao diện; E điền dữ liệu từ CHÍNH mã nguồn.
//
// KHÁC `ngon-ngu.test.ts` (rule (d) "Linh thạch" viết tay): đây là BẢNG dữ liệu tổng quát — thêm thuật ngữ chỉ cần thêm dòng,
// không đụng logic kiểm. `glossaryViolations` thuần hàm, KHÔNG đọc tệp, KHÔNG import dữ liệu từ nơi nào khác (chỉ kiểu).
//
// LUẬT KHớp (đúng hợp đồng issue #1198, A chốt review #1318): mỗi biến thể `wrong` khớp CHÍNH XÁC — CHUỖI TỪ (bao quanh bởi
// ranh giới chữ, không dính chữ khác hai bên) + PHÂN BIỆT dấu thanh + PHÂN BIỆT hoa / thường. Biến thể sai liệt kê TƯỜNG MINH
// trong `wrong` (vd "Truc Co" thiếu dấu, "truc co" thường, "Linh thach" hoa L thiếu dấu). Trùng hệt `canonical` thì bỏ qua.
// KHÔNG bóc dấu (NFKD): hết lệch tọa độ với ký tự kéo dài (vd "…"), và "Lối" ≠ "Loi" (không nhập nhằng) => thêm được mọi hệ.
// Đánh đổi: dạng thiếu dấu MỘT PHẦN ("Trúc Co") không bắt nếu không liệt kê — lỗi thật của agent là bỏ HẾT dấu hoặc sai hoa thường, đều liệt kê được.

export type GlossaryGroup =
  "canh-gioi" | "he" | "pham-cap" | "tien-te" | "khai-niem" | "dia-danh" | "nhan-vat";

export interface GlossaryTerm {
  /** Duy nhất, dạng `<nhóm>.<ten>` (vd "canh-gioi.truc-co"). */
  id: string;
  /** Nhóm để lọc / báo cáo. */
  group: GlossaryGroup;
  /** Cách viết chuẩn (đúng hoa / thường). */
  canonical: string;
  /** Biến thể SAI hay gặp, khớp CHÍNH XÁC (phân biệt dấu + hoa thường — xem luật trên). Liệt kê tường minh mọi dạng sai: thiếu dấu, sai hoa thường. */
  wrong: readonly string[];
  /** Quy tắc kèm (khi nào viết hoa, lưu ý dễ lẫn...). */
  note?: string;
}

/**
 * BẢNG TỪ ĐIỂN. Dữ liệu điền từ CHÍNH mã nguồn (realms.ts / map.ts / items.ts / ambush.ts / reincarnation.ts...), KHÔNG bịa.
 * CHƯA phủ hết: tên trùm / NPC thường (cần xử lý riêng), một số khái niệm (Duyên dễ lẫn "cơ duyên") — bổ sung các lượt sau.
 * HỆ: matcher khớp CHÍNH XÁC (không bóc dấu) nên KHÔNG nhập nhằng ("Lôi" ≠ "Lối") => có thể thêm đủ 10 hệ. Casing (hoa/thường) của MỌI hệ để Dev G chốt ở #1199 —
 * nên các term hệ CHỈ có wrong thiếu dấu (vd "Loi", "Hoa", "Bang"), KHÔNG có wrong hoa/thường cho tới khi G chốt. Kim/Phong KHÔNG dấu → bỏ wrong.
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
    wrong: ["Hac Phong Coc", "hac phong coc"],
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

  // --- Địa danh + quốc gia của mạch truyện mục 75 (`docs/COT_TRUYEN.md`; nguồn Vạn Kiếp Tu Tiên theo AGENTS.md Asset nguồn 3) ---
  {
    id: "dia-danh.vinh-trieu-hai",
    group: "dia-danh",
    canonical: "Vĩnh Triều Hải",
    wrong: ["Vinh Trieu Hai", "vinh trieu hai"],
    note: "Biển có triều rút lộ Triều Khư (chương 7).",
  },
  {
    id: "dia-danh.lang-hoang",
    group: "dia-danh",
    canonical: "Lang Hoang",
    wrong: [],
    note: "Bản đồ chương 5 (Hóa Thần), lãnh địa Lang tộc; không dấu nên không có biến thể sai.",
  },
  {
    id: "dia-danh.uy-van-kinh",
    group: "dia-danh",
    canonical: "Uy Vân Kinh",
    wrong: ["Uy Van Kinh", "uy van kinh"],
    note: "Kinh đô Lương Quốc, bản đồ chương 6.",
  },
  {
    id: "dia-danh.tuyet-dao-quan",
    group: "dia-danh",
    canonical: "Tuyết Đao Quan",
    wrong: ["Tuyet Dao Quan", "tuyet dao quan"],
    note: "Cửa ải trước Lang Hoang (Lương Quốc).",
  },
  {
    id: "dia-danh.trieu-khu",
    group: "dia-danh",
    canonical: "Triều Khư",
    wrong: ["Trieu Khu", "trieu khu"],
    note: "Đáy Vĩnh Triều Hải lộ ra khi triều rút, bản đồ chương 7.",
  },
  {
    id: "dia-danh.u-hon-dien",
    group: "dia-danh",
    canonical: "U Hồn Điện",
    wrong: ["U Hon Dien", "u hon dien"],
    note: "Di tích sa mạc Hạt tộc, bản đồ chương 8.",
  },
  {
    id: "dia-danh.vong-quan",
    group: "dia-danh",
    canonical: "Vọng Quan",
    wrong: ["Vong Quan", "vong quan"],
    note: "Trạm ở U Hồn Điện (chương 8); KHÔNG lẫn bến 'Vong Xuyên'.",
  },
  {
    id: "dia-danh.kiem-trach",
    group: "dia-danh",
    canonical: "Kiếm Trạch",
    wrong: ["Kiem Trach", "kiem trach"],
    note: "Chiến trường Đoạn Thiên, bản đồ chương 9.",
  },
  {
    id: "dia-danh.tieu-phong-quan",
    group: "dia-danh",
    canonical: "Tiểu Phong Quan",
    wrong: ["Tieu Phong Quan", "tieu phong quan"],
    note: "Trạm ở Kiếm Trạch (chương 9).",
  },
  {
    id: "dia-danh.thien-mon-ha",
    group: "dia-danh",
    canonical: "Thiên Môn Hạ",
    wrong: ["Thien Mon Ha", "thien mon ha"],
    note: "Dưới chân cửa trời, bản đồ chương 10.",
  },
  {
    id: "dia-danh.dai-ung",
    group: "dia-danh",
    canonical: "Đại Ung",
    wrong: ["Dai Ung", "dai ung"],
    note: "Nước trung nguyên, phía nam (quốc gia, mục 75).",
  },
  {
    id: "dia-danh.bac-minh",
    group: "dia-danh",
    canonical: "Bắc Minh",
    wrong: ["Bac Minh", "bac minh"],
    note: "Nước phía bắc và giữa (quốc gia, mục 75); KHÔNG lẫn chữ 'minh' riêng lẻ.",
  },
  {
    id: "dia-danh.luong-quoc",
    group: "dia-danh",
    canonical: "Lương Quốc",
    wrong: ["Luong Quoc", "luong quoc"],
    note: "Nước phía tây, vùng biên ải (quốc gia, mục 75).",
  },
  {
    id: "dia-danh.viem-quoc",
    group: "dia-danh",
    canonical: "Viêm Quốc",
    wrong: ["Viem Quoc", "viem quoc"],
    note: "Nước đông nam (quốc gia, mục 75).",
  },
  {
    id: "dia-danh.thinh-quoc",
    group: "dia-danh",
    canonical: "Thịnh Quốc",
    wrong: ["Thinh Quoc", "thinh quoc"],
    note: "Nước buôn phía đông (quốc gia, mục 75).",
  },

  // --- Hệ (skills.ts: ELEMENTS — 10 hệ) ---
  // matcher KHớp CHÍNH XÁC (không bóc dấu) => hết nhập nhằng do THĂNG SẮC: "Lối" (con đường) ≠ "Loi", "Móc" ≠ "Moc" — KHÔNG còn báo oan chữ đúng.
  // NHƯNG biến thể thiếu dấu của hệ vẫn là CHUỖI TRẦN, nên nếu thêm sẽ Bám chữ trần hợp lệ đang có trong chữ hiển thị (vd wrong "Hoa" của Hỏa bám "Hoa"
  // trong "Băng Hoa Loạn"; "Tho" bám "Thố/Thợ"; "Bang" bám "Bảng"; "Am" bám "Ám"; "Loi" bám "Lối núi/lối ra"). Mỗi hệ cần quét chữ hiển thị thật rồi mới thêm.
  // Đã thêm 3 hệ KHÔNG có chữ trần hợp lệ đụng: Mộc ("Moc"), Thủy ("Thuy"), Vô sắc ("Vo sac" — xem ghi chú test đã quét CẢ lời thoại).
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
    // Matcher khớp CHÍNH XÁC nên PHẢI liệt kê tường minh MỌI dạng sai: sai hoa thường VÀ thiếu dấu (không tự động bắt nữa).
    wrong: ["linh thạch", "Linh Thạch", "LINH THẠCH", "Linh thach", "linh thach"],
    note: "Chỉ chữ cái đầu 'L' hoa, 'thạch' thường (nhất quán rule (d) của ngon-ngu). Viết thường hết / hoa cả hai / in hoa hết / thiếu dấu đều sai.",
  },

  // --- Phẩm cấp (items.ts: RARITY_NAMES) ---
  { id: "pham-cap.pham-pham", group: "pham-cap", canonical: "Phàm phẩm", wrong: ["Pham pham"] },
  { id: "pham-cap.linh-pham", group: "pham-cap", canonical: "Linh phẩm", wrong: ["Linh pham"] },
  { id: "pham-cap.bao-pham", group: "pham-cap", canonical: "Bảo phẩm", wrong: ["Bao pham"] },
  { id: "pham-cap.tien-pham", group: "pham-cap", canonical: "Tiên phẩm", wrong: ["Tien pham"] },
  { id: "pham-cap.than-pham", group: "pham-cap", canonical: "Thần phẩm", wrong: ["Than pham"] },

  // --- Khái niệm ---
  {
    id: "khai-niem.hoang-tuyen",
    group: "khai-niem",
    canonical: "Hoàng Tuyền",
    wrong: ["Hoang Tuyen", "hoang tuyen"],
    note: "Chết thật (mất kiếp); KHÔNG thiếu dấu ('hoang tuyen') hay dính chữ 'Hoànguyền'.",
  },
  {
    id: "khai-niem.tam-sinh-thach",
    group: "khai-niem",
    canonical: "Tam Sinh Thạch",
    wrong: ["Tam Sinh Thach", "tam sinh thach"],
    note: "Bảng mở khóa lợi ích vĩnh viễn của luân hồi.",
  },
  {
    id: "khai-niem.chan-linh",
    group: "khai-niem",
    canonical: "chân linh",
    wrong: ["chan linh"],
    note: "Linh hồn đầu thai qua kiếp (reincarnation.ts); viết thường, KHÔNG thiếu dấu. KHÔNG lẫn 'Duyên' (để sau — 'cơ duyên' dễ báo oan).",
  },

  // --- Khái niệm của mạch truyện mục 75 ---
  {
    id: "khai-niem.thien-mon",
    group: "khai-niem",
    canonical: "Thiên Môn",
    wrong: ["Thien Mon", "thien mon"],
    note: "Cửa trời ngăn Nhân giới và Linh giới (mục 75, `docs/COT_TRUYEN.md`).",
  },
  {
    id: "khai-niem.doan-thien",
    group: "khai-niem",
    canonical: "Đoạn Thiên",
    wrong: ["Doan Thien", "doan thien"],
    note: "Ngày Ngũ Tổ chém Yêu Hoàng rồi phong Thiên Môn; chiến trường Kiếm Trạch.",
  },
  {
    id: "khai-niem.tam-thien-hoi",
    group: "khai-niem",
    canonical: "Tầm Thiên Hội",
    wrong: ["Tam Thien Hoi", "tam thien hoi"],
    note: "Hội kín muốn mở lại Thiên Môn (phe phản diện).",
  },
  {
    id: "khai-niem.vong-xuyen",
    group: "khai-niem",
    canonical: "Vong Xuyên",
    wrong: ["Vong Xuyen", "vong xuyen"],
    note: "Bến đò Hoàng Tuyền (nơi Lão Đò chở hồn).",
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

  // --- Nhân vật / nhóm nhân vật của mạch truyện mục 75 ---
  {
    id: "nhan-vat.ngu-to",
    group: "nhan-vat",
    canonical: "Ngũ Tổ",
    wrong: ["Ngu To"],
    note: "Năm vị tổ sư nhân tộc; CHỈ biến thể 'Ngu To' hoa chữ đầu (thường 'ngu to' có thể là 'ngu' + 'to' hợp lệ).",
  },
  {
    id: "nhan-vat.yeu-hoang",
    group: "nhan-vat",
    canonical: "Yêu Hoàng",
    wrong: ["Yeu Hoang", "yeu hoang"],
    note: "Vua yêu bị Ngũ Tổ chém ngày Đoạn Thiên.",
  },
  {
    id: "nhan-vat.lao-do",
    group: "nhan-vat",
    canonical: "Lão Đò",
    wrong: ["Lao Do"],
    note: "Người dẫn hồn ở bến Vong Xuyên; CHỈ biến thể 'Lao Do' hoa chữ đầu (thường 'lao do' dễ trùng chữ hợp lệ).",
  },
];

/** Là chữ (Unicode letter, kể cả tiếng Việt có dấu) — dùng kiểm ranh giới từ. */
function isLetter(ch: string | undefined): boolean {
  return ch !== undefined && /\p{L}/u.test(ch);
}

/**
 * Tìm mọi vi phạm thuật ngữ trong `text`. Trả danh sách lý do dạng `thấy '<biến thể sai>' -> dùng '<chuẩn>'` (rỗng = sạch).
 * Khớp CHÍNH XÁC (xem LUẬT KHớp trên): NFC + ranh giới chữ hai bên + PHÂN BIỆT dấu thanh + PHÂN BIỆT hoa / thường;
 * khớp trùng hệt `canonical` thì bỏ qua. KHÔNG bóc dấu => hết lệch tọa độ với ký tự kéo dài ("…") và "Lối" ≠ "Lôi".
 */
export function glossaryViolations(text: string): string[] {
  const out: string[] = [];
  // Chuẩn NFC: tiếng Việt precomposed nên 1 chữ = 1 đơn vị mã, tọa độ cắt chuỗi khớp gốc (không cần folded nữa).
  const src = text.normalize("NFC");
  for (const term of GLOSSARY) {
    const canonical = term.canonical.normalize("NFC");
    for (const rawW of term.wrong) {
      const w = rawW.normalize("NFC");
      if (!w) continue;
      let from = 0;
      for (;;) {
        const idx = src.indexOf(w, from);
        if (idx < 0) break;
        const end = idx + w.length;
        const atWordStart = idx === 0 || !isLetter(src[idx - 1]);
        const atWordEnd = end >= src.length || !isLetter(src[end]);
        // Trùng hệt canonical (cùng chữ, cùng dấu, cùng hoa thường) thì KHÔNG báo.
        if (atWordStart && atWordEnd && src.slice(idx, end) !== canonical) {
          out.push(`thấy '${w}' -> dùng '${term.canonical}'`);
        }
        from = end;
      }
    }
  }
  return out;
}
