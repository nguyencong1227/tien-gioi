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

/** Nhặt MỌI chữ hiển thị từ một bảng (mảng object), giống `collectDisplay` của ngon-ngu. */
function displayStrings<T>(arr: readonly T[]): string[] {
  const out: string[] = [];
  const walk = (value: unknown, field: string): void => {
    if (typeof value === "string") {
      if (DISPLAY_FIELDS.has(field)) out.push(value);
      return;
    }
    if (Array.isArray(value)) return value.forEach((el, i) => walk(el, `${field}[${i}]`));
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
    ])
      expect(glossaryViolations(t), t).toEqual([]);
  });

  it("thiếu dấu thanh vẫn bị bắt (khớp không phân biệt dấu)", () => {
    expect(glossaryViolations("Ngươi ở Truc Co trung ky.")).toContain(
      "thấy 'Truc Co' -> dùng 'Trúc Cơ'",
    );
    expect(glossaryViolations("vào Lac Ha Tran")).toContain(
      "thấy 'Lac Ha Tran' -> dùng 'Lạc Hà Trấn'",
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
    // "Mộc" là hệ, KHÔNG có trong bảng này; nhưng kiểm rằng "Phàm phẩm" KHÔNG bám vào "Phàm phẩmX"
    expect(glossaryViolations("vật phẩm Phàm phamX")).toEqual([]);
    // ranh giới dấu câu: "Trúc Cơ." vẫn bắt "Truc Co." dạng thiếu dấu (dấu . sau vẫn là ranh giới từ)
    expect(glossaryViolations("hạng Truc Co.")).toContain("thấy 'Truc Co' -> dùng 'Trúc Cơ'");
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

  it("đủ nhóm: canh-gioi / dia-danh / tien-te / pham-cap / khai-niem đã phủ", () => {
    const groups = new Set(GLOSSARY.map((t) => t.group));
    for (const g of ["canh-gioi", "dia-danh", "tien-te", "pham-cap", "khai-niem"] as const)
      expect(groups.has(g), `thiếu nhóm ${g}`).toBe(true);
  });
});
