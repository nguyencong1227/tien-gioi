// Test cho Từ điển Tiên Giới (issue #1198): `GLOSSARY` + `glossaryViolations`.
// - Ca chứng minh từng tính năng bằng DỮ LIỆU GIẢ (đột biến matcher => đỏ).
// - KHÔNG có ca nào phụ thuộc dữ liệu thật đang sạch (dữ liệu thật quét ở khối cuối, chỉ khẳng định KHÔNG báo oan).
import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  BOSSES,
  DUNGEONS,
  ITEMS,
  LEARNABLE_SKILLS,
  MONSTERS,
  NPCS,
  QUESTS,
  SECT_LEVELS,
  SECT_QUESTS,
  SECT_TERMS,
  SKILL_BOOK_ITEMS,
  TITLES,
} from "./index";
import { GLOSSARY, glossaryViolations, type GlossaryTerm } from "./glossary";

/** Trường chứa chữ hiển thị (giống `ngon-ngu.test.ts`): chỉ chuỗi ở những trường này mới cần sạch thuật ngữ. */
const DISPLAY_FIELDS = new Set([
  "name",
  "desc",
  "title",
  "bookName",
  "dialog",
  "talk",
  "offer",
  "progress",
  "complete",
  "text",
  "msg",
  "message",
  "hint",
  "label",
  "prompt",
  "note",
]);

/**
 * Nhặt MỌI chữ hiển thị từ một bảng (mảng object), giống `collectDisplay` của `ngon-ngu.test.ts`.
 * QUAN TRỌNG: mảng của MỘT trường hiển thị (`dialog` / `talk.offer|progress|complete`: string[]) — MỖI phần tử là chữ hiển thị,
 * PHẢI nhặt (đừng gắn `field[i]` rồi bỏ vì `field[i]` không có trong DISPLAY_FIELDS — lỗi đã từng bỏ sót 307 chuỗi lời thoại).
 */
function displayStrings<T>(arr: readonly T[]): string[] {
  const out: string[] = [];
  const walk = (value: unknown, field: string): void => {
    if (typeof value === "string") {
      if (DISPLAY_FIELDS.has(field)) out.push(value);
      return;
    }
    if (Array.isArray(value)) {
      // Mảng của trường hiển thị: mỗi phần tử string là chữ hiển thị (bắt từng cái, báo đúng cha).
      if (DISPLAY_FIELDS.has(field))
        value.forEach((el) => {
          if (typeof el === "string") out.push(el);
        });
      else value.forEach((el) => walk(el, field)); // mảng thường: vẫn đi sâu (có thể là object chứa trường hiển thị)
      return;
    }
    if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, k);
  };
  arr.forEach((item) => walk(item, ""));
  return out;
}

describe("glossaryViolations — ca chứng minh (dữ liệu giả)", () => {
  it("chuỗi chuẩn KHÔNG bị báo (không báo oan)", () => {
    for (const t of [
      "Ngươi đang ở Trúc Cơ trung kỳ.",
      "Nhận 5 Linh thạch.",
      "Vào Lạc Hà Trấn phía bắc.",
      "Kiếm này Thiên phẩm.",
      "Chết trong tay quái = Hoàng Tuyền, mất kiếp.",
      "Chân linh đầu thai làm kiếp mới.",
    ])
      expect(glossaryViolations(t), t).toEqual([]);
  });

  it("biến thể LIỆT KÊ bị bắt (khớp CHÍNH XÁC — phân biệt dấu + hoa thường)", () => {
    // Matcher KHÔNG bóc dấu nữa: chỉ bắt các biến thể được LIỆT KÊ tường minh trong `wrong`.
    // Dạng thiếu dấu vẫn bị bắt VÌ được liệt kê (vd "Truc Co", "Lac Ha Tran", "Thien Han Vuong", "chan linh").
    expect(glossaryViolations("Ngươi ở Truc Co trung ky.")).toContain(
      "thấy 'Truc Co' -> dùng 'Trúc Cơ'",
    );
    // khái niệm "chân linh" thiếu dấu -> bắt (viết thường đúng thì KHÔNG báo)
    expect(glossaryViolations("chan linh đầu thai.")).toContain(
      "thấy 'chan linh' -> dùng 'chân linh'",
    );
    expect(glossaryViolations("vào Lac Ha Tran")).toContain(
      "thấy 'Lac Ha Tran' -> dùng 'Lạc Hà Trấn'",
    );
    // tên trùm (nhan-vat): "Thiên Hàn Vương" thiếu dấu -> bắt
    expect(glossaryViolations("đánh Thien Han Vuong")).toContain(
      "thấy 'Thien Han Vuong' -> dùng 'Thiên Hàn Vương'",
    );
  });

  it("phân biệt DẤU THANH: dạng thiếu dấu KHÔNG được liệt kê thì KHÔNG báo (vd 'Móc' ≠ 'Moc', 'Thúy' ≠ 'Thuy')", () => {
    // Đột biến chứng minh: matcher KHÔNG bóc dấu => "Móc câu" (đủ dấu, khác "Moc") KHÔNG bị báo oan thành hệ Mộc.
    expect(glossaryViolations("Chiếc Móc câu trên tường.")).toEqual([]);
    expect(glossaryViolations("Cô Thúy đi ngang.")).toEqual([]);
    // "Mộc" đúng (đủ dấu) cũng KHÔNG báo:
    expect(glossaryViolations("chiêu hệ Mộc mạnh.")).toEqual([]);
  });

  it("không lệch tọa độ với ký tự ba chấm '…' (bug cũ: bóc dấu làm misalign)", () => {
    // Đột biến chứng minh: matcher cũ (folded indexOf) trả [] khi có "…" (U+2026) vì NFKD gấp "…" thành "..." lệch tọa độ.
    // Matcher CHÍNH XÁC (indexOf trên src NFC) tìm đúng "Truc Co" bất chấp "…" ở chỗ khác.
    expect(glossaryViolations("Ngươi… Truc Co đấy.")).toContain("thấy 'Truc Co' -> dùng 'Trúc Cơ'");
  });

  it("viết đúng hoa/thường (canonical) KHÔNG báo; biến thể thiếu dấu (đủ cả hai dạng hoa thường) bị bắt", () => {
    // "Trúc Cơ" đúng (canonical) => KHÔNG báo (ca then chốt: matcher bỏ qua chữ trùng canonical).
    expect(glossaryViolations("người Trúc Cơ")).toEqual([]);
    // "truc co" (thường, thiếu dấu) đã LIỆT KÊ => bắt (phân biệt hoa thường: khác canonical).
    expect(glossaryViolations("người truc co")).toContain("thấy 'truc co' -> dùng 'Trúc Cơ'");
    // "Truc Co" (hoa chữ cái đầu, thiếu dấu) đã LIỆT KÊ => bắt.
    expect(glossaryViolations("người Truc Co")).toContain("thấy 'Truc Co' -> dùng 'Trúc Cơ'");
  });

  it('"Linh thạch" đúng chuẩn; mọi dạng sai hoa thường / thiếu dấu bị bắt (tất cả đều LIỆT KÊ)', () => {
    expect(glossaryViolations("Nhận 5 Linh thạch.")).toEqual([]);
    expect(glossaryViolations("Trả 5 linh thạch.")).toContain(
      "thấy 'linh thạch' -> dùng 'Linh thạch'",
    );
    expect(glossaryViolations("Trả 5 Linh Thạch.")).toContain(
      "thấy 'Linh Thạch' -> dùng 'Linh thạch'",
    );
    expect(glossaryViolations("Trả 5 LINH THẠCH.")).toContain(
      "thấy 'LINH THẠCH' -> dùng 'Linh thạch'",
    );
    // thiếu dấu hoa L: "Linh thach" -> bắt (biến thể được liệt kê tường minh sau sửa dữ liệu #1318)
    expect(glossaryViolations("Trả 5 Linh thach.")).toContain(
      "thấy 'Linh thach' -> dùng 'Linh thạch'",
    );
    // thiếu dấu thường: "linh thach" -> bắt
    expect(glossaryViolations("Trả 5 linh thach.")).toContain(
      "thấy 'linh thach' -> dùng 'Linh thạch'",
    );
  });

  it("khớp là TỪ (ranh giới chữ hai bên): KHÔNG bắt nhầm chữ dính trong từ khác", () => {
    // "Phàm phẩm" KHÔNG bám vào "Phàm phẩmX"
    expect(glossaryViolations("vật phẩm Phàm phamX")).toEqual([]);
    // ranh giới dấu câu: "Trúc Cơ." vẫn bắt "Truc Co." dạng thiếu dấu (dấu . sau vẫn là ranh giới từ)
    expect(glossaryViolations("hạng Truc Co.")).toContain("thấy 'Truc Co' -> dùng 'Trúc Cơ'");
  });

  it("hệ Mộc/Thủy/Vô sắc: dạng thiếu dấu bị bắt, dạng đúng (có dấu) KHÔNG báo oan", () => {
    // Matcher CHÍNH XÁC: "Moc" chỉ khớp chữ "Moc" trần, KHÔNG bám vào "Mộc" (đủ dấu) => KHÔNG báo oan chữ đúng.
    expect(glossaryViolations("chiêu hệ Moc mạnh.")).toContain("thấy 'Moc' -> dùng 'Mộc'");
    expect(glossaryViolations("chiêu hệ Thuy mạnh.")).toContain("thấy 'Thuy' -> dùng 'Thủy'");
    expect(glossaryViolations("chiêu hệ Vo sac.")).toContain("thấy 'Vo sac' -> dùng 'Vô sắc'");
    // dạng ĐÚNG (có dấu) KHÔNG báo oan — kể cả "Vô sắc" hai chữ:
    expect(glossaryViolations("chiêu hệ Mộc, Thủy và Vô sắc.")).toEqual([]);
  });

  it("Lôi KHÔNG có trong từ điển: 'Lối' (con đường) KHÔNG bị báo oan thành 'Lôi' (hệ)", () => {
    // Đột biến chứng minh: nếu ai đó thêm he.loi, ca này NGAY LẬP TỨC đỏ (báo oan "Lối núi").
    expect(glossaryViolations("Lối núi vẫn chưa yên, chưa đủ số.")).toEqual([]);
    expect(glossaryViolations("chờ tìm lối ra.")).toEqual([]);
  });

  it("dạng NFD của chữ ĐÚNG không bị báo oan (matcher NFC hóa trước; quy tắc NFC của `ngon-ngu` lo phần dấu tách rời)", () => {
    const nfd = "Ngươi ở Trúc Cơ.".normalize("NFD");
    expect(nfd).not.toBe(nfd.normalize("NFC"));
    expect(glossaryViolations(nfd), nfd).toEqual([]);
  });
});

describe("glossaryViolations — dữ liệu thật KHÔNG vi phạm (không báo oan)", () => {
  it("mọi chữ hiển thị trong bảng game đều sạch thuật ngữ", () => {
    const tables: [readonly unknown[], string][] = [
      [ITEMS, "ITEMS"],
      [MONSTERS, "MONSTERS"],
      [NPCS, "NPCS"],
      [QUESTS, "QUESTS"],
      [LEARNABLE_SKILLS, "LEARNABLE_SKILLS"],
      [SKILL_BOOK_ITEMS, "SKILL_BOOK_ITEMS"],
      [SECT_QUESTS, "SECT_QUESTS"],
      [SECT_LEVELS, "SECT_LEVELS"],
      [BOSSES, "BOSSES"],
      [DUNGEONS, "DUNGEONS"],
      [ACHIEVEMENTS, "ACHIEVEMENTS"],
      [TITLES, "TITLES"],
    ];
    const loi: string[] = [];
    for (const [arr, name] of tables)
      for (const s of displayStrings(arr))
        for (const reason of glossaryViolations(s)) loi.push(`${name}: "${s}" — ${reason}`);
    // SECT_TERMS: giá là chữ hiển thị (object nên quét từng cặp)
    for (const [k, v] of Object.entries(SECT_TERMS as Record<string, unknown>))
      if (typeof v === "string")
        for (const reason of glossaryViolations(v)) loi.push(`SECT_TERMS.${k} — ${reason}`);
    expect(loi, `chữ hiển thị vi phạm từ điển:\n${loi.join("\n") || "không có"}`).toEqual([]);
  });

  it("displayStrings nhặt CẢ lời thoại mảng (talk.offer/progress/complete, dialog): không bỏ sót (đột biến: walk cũ bỏ field[i] => đỏ)", () => {
    const fake = [
      { id: "q", title: "Việc", talk: { offer: ["Câu một."], complete: ["Câu hai."] } },
      { id: "n", name: "NPC", dialog: ["Chào người lữ khách."] },
    ];
    const got = displayStrings(fake);
    // Mảng của trường hiển thị (talk.offer/complete, dialog) PHẢI được nhặt — đây là chỗ walk cũ bỏ sót 307 chuỗi.
    expect(got).toContain("Câu một.");
    expect(got).toContain("Câu hai.");
    expect(got).toContain("Chào người lữ khách.");
    // id / khoá KHÔNG phải chữ hiển thị:
    expect(got).not.toContain("q");
    expect(got).not.toContain("n");
  });
});

describe("GLOSSARY — bất biến dữ liệu", () => {
  it("id duy nhất, đúng dạng <nhóm>.<ten>", () => {
    const ids = new Set<string>();
    for (const t of GLOSSARY) {
      expect(ids.has(t.id), `trùng id ${t.id}`).toBe(false);
      ids.add(t.id);
      expect(t.id.split(".").length, `id ${t.id} phải có dấu chấm`).toBe(2);
    }
  });

  it("canonical của MỌI term KHÔNG bị báo (không báo oan chính cách viết đúng)", () => {
    for (const t of GLOSSARY as GlossaryTerm[])
      expect(glossaryViolations(t.canonical), `${t.id}: ${t.canonical}`).toEqual([]);
  });

  it("mọi term: dạng THẾ DẤU của canonical PHẢI được liệt kê trong wrong (bất biến chống trôi dữ liệu)", () => {
    // Bóc dấu thanh (NFKD + bỏ dấu kết hợp U+0300–U+036F) => tạo dạng "agent quên hết dấu" — lỗi thật hay gặp.
    // Đ là chữ riêng (KHÔNG phải dấu kết hợp) nên NFKD KHÔNG bỏ được; agent bỏ dấu thường gõ "D" => đổi Đ→D, đ→d.
    // Matcher CHÍNH XÁC nên dạng này chỉ bị bắt NẾU được LIỆT KÊ tường minh; thiếu => agent quên dấu thoát kiểm.
    const stripTones = (s: string): string =>
      s
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/Đ/g, "D")
        .replace(/đ/g, "d")
        .normalize("NFC");
    const missing: string[] = [];
    for (const t of GLOSSARY as GlossaryTerm[]) {
      const toneless = stripTones(t.canonical);
      if (toneless === t.canonical) continue; // canonical vốn không dấu -> bỏ qua
      const hit = glossaryViolations(toneless).some((r) => r.includes(t.canonical));
      if (!hit)
        missing.push(
          `${t.id}: canonical '${t.canonical}' -> dạng thiếu dấu '${toneless}' KHÔNG có trong wrong`,
        );
    }
    expect(
      missing,
      `thiếu biến thể thiếu dấu (sửa wrong rồi chạy lại):\n${missing.join("\n") || "không có"}`,
    ).toEqual([]);
  });

  it("đủ nhóm: canh-gioi / dia-danh / he / tien-te / pham-cap / khai-niem / nhan-vat đã phủ", () => {
    const groups = new Set(GLOSSARY.map((t) => t.group));
    for (const g of [
      "canh-gioi",
      "dia-danh",
      "he",
      "tien-te",
      "pham-cap",
      "khai-niem",
      "nhan-vat",
    ] as const)
      expect(groups.has(g), `thiếu nhóm ${g}`).toBe(true);
  });
});
