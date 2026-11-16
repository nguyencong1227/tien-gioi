// Rà soát ngôn ngữ hiển thị (issue #885, G1): chữ hiển thị cho người chơi (tên / mô tả vật phẩm, chiêu,
// quái, NPC, nhiệm vụ, lời thoại, toast máy chủ) phải sạch Việt — KHÔNG chữ Hán/CJK, KHÔNG khoảng trắng
// thừa / ký tự điều khiển / hai dấu cách, thuật ngữ "Linh thạch" nhất quán, KHÔNG lộ id nội bộ (snake_case).
// CHỈ KIỂM CHỨNG (test chéo): KHÔNG đổi id / số liệu / hành vi. Báo cáo ở docs/KIEM_NGON_NGU.md.
// Đột biến: thêm một chuỗi sai (vd chữ Hán) vào bảng dữ liệu thì test ĐỎ.
import { describe, expect, it } from "vitest";
import {
  ITEMS,
  MONSTERS,
  NPCS,
  QUESTS,
  SECT_FAILS,
  SECT_TERMS,
  SKILL_BOOK_ITEMS,
  SKILLS_M7,
  sectFailMessage,
} from "./index";

/**
 * Trường chứa CHỮ HIỂN THỊ. Chỉ chuỗi ở những trường này mới bị kiểm — bỏ qua `id` / `mapId` / số / enum
 * (those là khoá nội bộ, KHÔNG phải chữ hiển thị). Thêm trường mới ở đây khi phát hiện chỗ chứa chữ hiển thị.
 */
const DISPLAY_FIELDS = new Set([
  "name",
  "desc",
  "title",
  "bookName",
  "dialog",
  "talk",
  "text",
  "msg",
  "message",
  "hint",
  "label",
  "prompt",
  "note",
]);

/** Một mẫu chữ hiển thị đã nhặt được, kèm vị trí để báo lỗi rõ. */
interface Sample {
  where: string;
  field: string;
  text: string;
}

/** Đi sâu vào dữ liệu, nhặt MỌI chuỗi nằm trong trường hiển thị (không nhặt khoá / id / số). */
function collectDisplay(value: unknown, field: string, where: string, out: Sample[]): void {
  if (typeof value === "string") {
    if (DISPLAY_FIELDS.has(field)) out.push({ where, field, text: value });
    return;
  }
  if (Array.isArray(value)) {
    if (DISPLAY_FIELDS.has(field)) {
      // Mảng chữ của trường hiển thị (dialog/talk: string[]): kiểm từng phần tử.
      value.forEach((el, i) => {
        if (typeof el === "string") out.push({ where, field, text: el });
        else collectDisplay(el, field, `${where}[${i}]`, out);
      });
    } else {
      // Mảng object (vd bước nhiệm vụ): đi sâu, giữ tên trường.
      value.forEach((el, i) => collectDisplay(el, field, `${where}[${i}]`, out));
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectDisplay(v, k, `${where}.${k}`, out);
  }
}

/** Nhặt chữ hiển thị từ một bảng (mảng các object). */
function fromTable<T>(arr: readonly T[], where: string): Sample[] {
  const out: Sample[] = [];
  arr.forEach((item, i) => collectDisplay(item, "", `${where}[${i}]`, out));
  return out;
}

// ---------- Tập hợp mọi chữ hiển thị cần kiểm ----------

const samples: Sample[] = [
  ...fromTable(ITEMS, "ITEMS"),
  ...fromTable(MONSTERS, "MONSTERS"),
  ...fromTable(NPCS, "NPCS"),
  ...fromTable(QUESTS, "QUESTS"),
  ...fromTable(SKILLS_M7, "SKILLS_M7"),
  ...fromTable(SKILL_BOOK_ITEMS, "SKILL_BOOK_ITEMS"),
  // Thuật ngữ hiển thị (SECT_TERMS): giá là chữ hiển thị (vd "Cống hiến", "Bảo khố").
  ...Object.entries(SECT_TERMS).map(([k, v]) => ({ where: `SECT_TERMS.${k}`, field: k, text: v })),
];

// Toast máy chủ (FAIL_MESSAGES) — chữ hiển thị đủ câu, phải kết thúc dấu chấm.
const toastMessages: { reason: string; text: string }[] = SECT_FAILS.map((reason) => ({
  reason: String(reason),
  text: sectFailMessage(reason),
}));

// Lời thoại NPC — cũng là câu đủ, phải kết thúc dấu chấm.
const npcDialog: { npc: string; text: string }[] = NPCS.flatMap((n) =>
  n.dialog.map((t) => ({ npc: n.id, text: t })),
);

// ---------- Quy tắc ----------

/**
 * Ký tự CJK: Kana (Hiragana/Katakana \u3040-\u30ff), CJK mở rộng A (\u3400-\u4dbf), CJK thống nhất
 * (\u4e00-\u9fff), chữ Hán tương thích (\uf900-\ufaff), Hangul (\uac00-\ud7af). Dựng từ mã ký tự để KHÔNG
 * nhét chữ Hán vào tệp test. KHÔNG đụng dải combining diacritics (\u0300-\u036f) hay Latin mở rộng (\u1ea0-\u1eff)
 * của tiếng Việt.
 */
const CJK = new RegExp(
  "[\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af]",
);
/** Token kiểu id nội bộ (snake_case): dùng để phát hiện id lộ vào chữ hiển thị. */
const SNAKE_TOKEN = /[a-z0-9]+_[a-z0-9_]+/g;

/** Mọi id nội bộ đã biết — để so sánh xem token snake_case trong chữ hiển thị có phải id thật không. */
const knownIds = new Set<string>([
  ...ITEMS.map((i) => i.id),
  ...MONSTERS.map((m) => m.id),
  ...NPCS.map((n) => n.id),
  ...QUESTS.map((q) => q.id),
  ...SKILLS_M7.map((s) => s.id),
]);

/** Kiểm một chữ hiển thị theo các quy tắc (a) CJK (b) khoảng trắng/điều khiển (d) thuật ngữ (e) lộ id. */
function violationsOf(s: Sample): string[] {
  const v: string[] = [];
  const { text } = s;
  // (b) ký tự điều khiển (trừ tab/kết thúc hợp lệ đã bị trim bắt): khoảng cách trắng không phá, nhưng ký tự điều khiển thì không.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(text))
    v.push("ký tự điều khiển");
  // (b) khoảng trắng thừa đầu/cuối
  if (text !== text.trim()) v.push("khoảng trắng thừa đầu/cuối");
  // (b) hai dấu cách liền nhau giữa câu
  if (/ {2}/.test(text)) v.push("hai dấu cách liền nhau");
  // (a) chữ Hán / CJK
  if (CJK.test(text)) v.push("chữ Hán/CJK");
  // (d) thuật ngữ "Linh thạch" phải viết đúng chữ hoa-thường chuẩn (không "linh thạch", "Linh Thạch", "LINH THẠCH")
  for (const m of text.matchAll(/linh[ ]+thạch/gi)) {
    if (m[0] !== "Linh thạch") v.push(`thuật ngữ "Linh thạch" viết không chuẩn: "${m[0]}"`);
  }
  // (e) lộ id nội bộ: token snake_case trong chữ hiển thị trùng id thật
  for (const tok of text.match(SNAKE_TOKEN) ?? []) {
    if (knownIds.has(tok)) v.push(`lộ id nội bộ "${tok}"`);
  }
  return v;
}

/** Kết thúc câu hợp lệ: dấu chấm / chấm than / hỏi (chỉ ký tự ASCII — tránh dính dải CJK mà `no-cjk.test.ts` quét). */
const SENTENCE_END = /[.!?]$/;

describe("rà soát ngôn ngữ hiển thị (issue #885, G1)", () => {
  it("đã quét đủ chữ hiển thị (không để trống bộ kiểm)", () => {
    expect(samples.length, "phải quét được chữ hiển thị").toBeGreaterThan(0);
    expect(toastMessages.length, "phải có toast máy chủ để kiểm").toBeGreaterThan(0);
    expect(npcDialog.length, "phải có lời thoại NPC để kiểm").toBeGreaterThan(0);
  });

  it("mọi chữ hiển thị đều sạch: không CJK, không khoảng trắng thừa/điều khiển, thuật ngữ & id chuẩn", () => {
    const loi = samples.flatMap((s) =>
      violationsOf(s).map((reason) => `${s.where} (${s.field}): "${s.text}" — ${reason}`),
    );
    expect(loi, `chữ hiển thị lỗi ngôn ngữ:\n${loi.join("\n") || "không có"}`).toEqual([]);
  });

  it("toast máy chủ (FAIL_MESSAGES) đều là câu đủ, kết thúc dấu chấm", () => {
    const loi = toastMessages
      .filter((m) => !SENTENCE_END.test(m.text))
      .map((m) => `${m.reason}: "${m.text}"`);
    expect(loi, `toast KHÔNG kết thúc dấu chấm:\n${loi.join("\n") || "không có"}`).toEqual([]);
  });

  it("lời thoại NPC đều là câu đủ, kết thúc dấu chấm", () => {
    const loi = npcDialog
      .filter((d) => !SENTENCE_END.test(d.text))
      .map((d) => `${d.npc}: "${d.text}"`);
    expect(loi, `lời thoại KHÔNG kết thúc dấu chấm:\n${loi.join("\n") || "không có"}`).toEqual([]);
  });
});
