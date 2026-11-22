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

  it("thiếu dấu thanh vẫn bị bắt (khớp không phân biệt dấu)", () => {
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

  it("viết thường cảnh giới bị bắt; viết đúng hoa KHÔNG báo (khớp phân biệt hoa thường)", () => {
    expect(glossaryViolations("người trúc cơ")).toContain("thấy 'trúc cơ' -> dùng 'Trúc Cơ'");
    // "Trúc Cơ" đúng => KHÔNG báo (đây là ca then chốt: matcher phải bỏ qua chữ trùng canonical)
    expect(glossaryViolations("người Trúc Cơ")).toEqual([]);
  });

  it('"Linh thạch" đúng chuẩn; "linh thạch" / "Linh Thạch" / "LINH THẠCH" bị bắt (thiếu dấu tự động bắt)', () => {
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
    // thiếu dấu: "linh thach" (lowercase, không dấu) -> bắt qua biến thể "linh thạch" (matcher không phân biệt dấu)
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

  it("hệ Mộc/Thủy/Vô sắc: thiếu dấu bị bắt, dạng đúng KHÔNG báo oan", () => {
    // Chỉ 3 hệ được thêm: bóc dấu KHÔNG đụng chữ khác đang có (Hỏa/Thổ/Băng/Âm/LÔI bị trễ — Lôi ≡ Lối, xem glossary.ts khối `he`).
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
