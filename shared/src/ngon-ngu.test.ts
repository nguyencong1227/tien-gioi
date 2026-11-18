// Rà soát ngôn ngữ hiển thị (issue #885, G1; A sửa theo review A + B ở #964): chữ hiển thị cho người chơi (tên / mô tả vật phẩm, chiêu, quái, NPC,
// nhiệm vụ, lời thoại, toast máy chủ, nhiệm vụ tông, cấp tông, chiêu trùm, bí cảnh, thành tựu, danh hiệu) phải sạch Việt:
// (a) KHÔNG chữ Hán / CJK, (b) KHÔNG khoảng trắng thừa / ký tự điều khiển / hai dấu cách, (c) lời thoại + toast là câu đủ,
// (d) thuật ngữ "Linh thạch" nhất quán, (e) KHÔNG lộ id nội bộ (snake_case), (f) chữ ở dạng Unicode NFC.
// CHỈ KIỂM CHỨNG (test chéo): KHÔNG đổi id / số liệu / hành vi. Báo cáo ở docs/KIEM_NGON_NGU.md.
// MỖI quy tắc có ca chứng minh bằng DỮ LIỆU GIẢ (hàm thuần `violationsOf` / `collectDisplay`) nên đột biến quy tắc là đỏ, kể cả khi dữ liệu thật đang sạch.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  SECT_FAILS,
  SECT_LEVELS,
  SECT_QUESTS,
  SECT_TERMS,
  SKILL_BOOK_ITEMS,
  TITLES,
  sectFailMessage,
} from "./index";

/**
 * Trường chứa CHỮ HIỂN THỊ. Chỉ chuỗi ở những trường này mới bị kiểm: bỏ qua `id` / `mapId` / số / enum
 * (đó là khoá nội bộ, KHÔNG phải chữ hiển thị). Thêm trường mới ở đây khi phát hiện chỗ chứa chữ hiển thị.
 * `offer` / `progress` / `complete` là ba mảng lời thoại của `SECT_QUESTS[].talk` (object nên phải kể tên từng mảng, không thì bị bỏ qua).
 */
export const DISPLAY_FIELDS = new Set([
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

/** Một mẫu chữ hiển thị đã nhặt được, kèm vị trí để báo lỗi rõ (vd `SECT_QUESTS[3].talk.offer[0]`). */
export interface Sample {
  where: string;
  field: string;
  text: string;
}

/** Đi sâu vào dữ liệu, nhặt MỌI chuỗi nằm trong trường hiển thị (không nhặt khoá / id / số). */
export function collectDisplay(value: unknown, field: string, where: string, out: Sample[]): void {
  if (typeof value === "string") {
    if (DISPLAY_FIELDS.has(field)) out.push({ where, field, text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((el, i) => {
      const at = `${where}[${i}]`;
      // Mảng chữ của trường hiển thị (dialog / offer...: string[]): kiểm từng phần tử, báo kèm chỉ số.
      if (typeof el === "string") {
        if (DISPLAY_FIELDS.has(field)) out.push({ where: at, field, text: el });
      } else collectDisplay(el, field, at, out);
    });
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectDisplay(v, k, `${where}.${k}`, out);
  }
}

/** Nhặt chữ hiển thị từ một bảng (mảng các object). */
export function fromTable<T>(arr: readonly T[], where: string): Sample[] {
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
  // Mọi chiêu học được (gồm 18 chiêu cũ SKILLS_M7 và các đợt chiêu mới của D / E / G / A) + kinh quyển tự dựng
  ...fromTable(LEARNABLE_SKILLS, "LEARNABLE_SKILLS"),
  ...fromTable(SKILL_BOOK_ITEMS, "SKILL_BOOK_ITEMS"),
  // Nhiệm vụ tông (E sinh nhiều chữ nhất): `title`, `desc` và lời thoại `talk.offer / progress / complete`
  ...fromTable(SECT_QUESTS, "SECT_QUESTS"),
  // Tên 5 cấp tông, chiêu trùm (hiện trên thanh máu), tên bí cảnh, thành tựu + danh hiệu (M9)
  ...fromTable(SECT_LEVELS, "SECT_LEVELS"),
  ...fromTable(BOSSES, "BOSSES"),
  ...fromTable(DUNGEONS, "DUNGEONS"),
  ...fromTable(ACHIEVEMENTS, "ACHIEVEMENTS"),
  ...fromTable(TITLES, "TITLES"),
  // Thuật ngữ hiển thị (SECT_TERMS): giá là chữ hiển thị (vd "Cống hiến", "Bảo khố").
  ...Object.entries(SECT_TERMS).map(([k, v]) => ({ where: `SECT_TERMS.${k}`, field: k, text: v })),
];

// Toast máy chủ (FAIL_MESSAGES): chữ hiển thị đủ câu, phải kết thúc dấu câu.
const toastMessages: { reason: string; text: string }[] = SECT_FAILS.map((reason) => ({
  reason: String(reason),
  text: sectFailMessage(reason),
}));

// Lời thoại NPC: cũng là câu đủ.
const npcDialog: { where: string; text: string }[] = NPCS.flatMap((n, i) =>
  n.dialog.map((t, j) => ({ where: `NPCS[${i}](${n.id}).dialog[${j}]`, text: t })),
);

// Lời thoại nhiệm vụ tông (`talk.offer / progress / complete`): câu đủ.
const sectTalk: { where: string; text: string }[] = SECT_QUESTS.flatMap((q, i) =>
  (["offer", "progress", "complete"] as const).flatMap((k) =>
    (q.talk?.[k] ?? []).map((t, j) => ({
      where: `SECT_QUESTS[${i}](${q.id}).talk.${k}[${j}]`,
      text: t,
    })),
  ),
);

// ---------- Quy tắc ----------

/**
 * Ký tự CJK: GIỐNG HỆT regex của `server/scripts/no-cjk.test.ts` (chữ Hán kể cả mở rộng B trở đi nhờ cờ `u`, kana, hangul, bopomofo, dấu câu CJK U+3000-303F,
 * dạng toàn chiều U+FF00-FFEF). Một ca bên dưới đọc tệp đó và so khớp NGUYÊN VĂN để hai bản không lệch nhau. Viết bằng `\p{Script=...}` / `\u` nên KHÔNG có chữ Hán trong tệp này.
 */
export const CJK_CLASS =
  "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}\\p{Script=Bopomofo}\\u3000-\\u303f\\uff00-\\uffef]";
const CJK = new RegExp(CJK_CLASS, "u");
/**
 * Mẫu id nội bộ lộ vào chữ hiển thị: chữ / số, dấu gạch dưới, chữ / số. Chữ hiển thị tiếng Việt KHÔNG BAO GIỜ có `_` giữa hai ký tự chữ-số, nên kiểm theo MẪU
 * (không cần danh sách id đã biết: id của bảng mới như `SECT_QUESTS` / `BOSSES` / `DUNGEONS` cũng bị bắt).
 */
const LEAKED_ID = /[A-Za-z0-9]_[A-Za-z0-9]/;

/** Kiểm một chữ hiển thị theo các quy tắc (a) CJK (b) khoảng trắng / điều khiển (d) thuật ngữ (e) lộ id (f) NFC. Trả về danh sách lý do (rỗng = sạch). */
export function violationsOf(text: string): string[] {
  const v: string[] = [];
  // (b) ký tự điều khiển (khoảng cách trắng thường không phá, ký tự điều khiển thì không)
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(text))
    v.push("ký tự điều khiển");
  // (b) khoảng trắng thừa đầu / cuối
  if (text !== text.trim()) v.push("khoảng trắng thừa đầu/cuối");
  // (b) hai dấu cách liền nhau giữa câu
  if (/ {2}/.test(text)) v.push("hai dấu cách liền nhau");
  // (f) Unicode NFC: tiếng Việt gõ dạng tổ hợp (NFD) trông giống hệt nhưng so sánh / tìm kiếm / quy tắc (d) khác
  const nfc = text.normalize("NFC");
  if (text !== nfc) v.push("chữ không ở dạng Unicode NFC");
  // (a) chữ Hán / CJK
  if (CJK.test(text)) v.push("chữ Hán/CJK");
  // (d) thuật ngữ "Linh thạch" đúng chữ hoa-thường chuẩn (không "linh thạch", "Linh Thạch", "LINH THẠCH"); chạy trên bản NFC để bản NFD không lọt
  for (const m of nfc.matchAll(/linh[ ]+thạch/gi)) {
    if (m[0] !== "Linh thạch") v.push(`thuật ngữ "Linh thạch" viết không chuẩn: "${m[0]}"`);
  }
  // (e) lộ id nội bộ (snake_case)
  if (LEAKED_ID.test(text)) v.push("lộ id nội bộ (snake_case)");
  return v;
}

/**
 * Kết thúc câu hợp lệ: dấu chấm / chấm than / hỏi / chấm lửng (U+2026), có thể theo sau dấu đóng ngoặc hoặc nháy (`."`, `.)`, `!'`).
 * Chỉ ký tự ASCII và dấu câu Latin: không dính dải CJK mà `no-cjk.test.ts` quét.
 */
export const SENTENCE_END = /[.!?\u2026]["')\]\u2019\u201d]?$/;

describe("rà soát ngôn ngữ hiển thị (issue #885, G1)", () => {
  it("đã quét đủ chữ hiển thị (không để trống bộ kiểm), kể cả bảng M8 / trùm / bí cảnh / thành tựu", () => {
    expect(samples.length, "phải quét được chữ hiển thị").toBeGreaterThan(0);
    expect(toastMessages.length, "phải có toast máy chủ để kiểm").toBeGreaterThan(0);
    expect(npcDialog.length, "phải có lời thoại NPC để kiểm").toBeGreaterThan(0);
    expect(sectTalk.length, "phải có lời thoại nhiệm vụ tông để kiểm").toBeGreaterThan(0);
    const has = (re: RegExp) => samples.some((s) => re.test(s.where));
    // mỗi bảng mới thật sự được quét tới tầng chữ (không bị bỏ sót vì tên trường)
    expect(has(/^SECT_QUESTS\[\d+\]\.title$/), "SECT_QUESTS title").toBe(true);
    expect(has(/^SECT_QUESTS\[\d+\]\.desc$/), "SECT_QUESTS desc").toBe(true);
    for (const k of ["offer", "progress", "complete"])
      expect(
        has(new RegExp(`^SECT_QUESTS\\[\\d+\\]\\.talk\\.${k}\\[\\d+\\]$`)),
        `SECT_QUESTS talk.${k}`,
      ).toBe(true);
    expect(has(/^SECT_LEVELS\[\d+\]\.name$/), "SECT_LEVELS name").toBe(true);
    expect(has(/^BOSSES\[\d+\]\.abilities\[\d+\]\.name$/), "BOSSES abilities name").toBe(true);
    expect(has(/^DUNGEONS\[\d+\]\.name$/), "DUNGEONS name").toBe(true);
    expect(has(/^ACHIEVEMENTS\[\d+\]\.name$/), "ACHIEVEMENTS name").toBe(true);
    expect(has(/^TITLES\[\d+\]\.text$/), "TITLES text").toBe(true);
  });

  it("mọi chữ hiển thị đều sạch: không CJK, không khoảng trắng thừa / điều khiển, đúng NFC, thuật ngữ & id chuẩn", () => {
    const loi = samples.flatMap((s) =>
      violationsOf(s.text).map((reason) => `${s.where} (${s.field}): "${s.text}" — ${reason}`),
    );
    expect(loi, `chữ hiển thị lỗi ngôn ngữ:\n${loi.join("\n") || "không có"}`).toEqual([]);
  });

  it("toast máy chủ (FAIL_MESSAGES) đều là câu đủ, kết thúc dấu câu", () => {
    const loi = toastMessages
      .filter((m) => !SENTENCE_END.test(m.text))
      .map((m) => `${m.reason}: "${m.text}"`);
    expect(loi, `toast KHÔNG kết thúc dấu câu:\n${loi.join("\n") || "không có"}`).toEqual([]);
  });

  it("lời thoại NPC đều là câu đủ, kết thúc dấu câu", () => {
    const loi = npcDialog
      .filter((d) => !SENTENCE_END.test(d.text))
      .map((d) => `${d.where}: "${d.text}"`);
    expect(loi, `lời thoại KHÔNG kết thúc dấu câu:\n${loi.join("\n") || "không có"}`).toEqual([]);
  });

  it("lời thoại nhiệm vụ tông (talk.offer / progress / complete) đều là câu đủ, kết thúc dấu câu", () => {
    const loi = sectTalk
      .filter((d) => !SENTENCE_END.test(d.text))
      .map((d) => `${d.where}: "${d.text}"`);
    expect(loi, `lời thoại tông KHÔNG kết thúc dấu câu:\n${loi.join("\n") || "không có"}`).toEqual(
      [],
    );
  });

  it("regex CJK GIỐNG HỆT của server/scripts/no-cjk.test.ts (không để hai bản lệch nhau)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../../server/scripts/no-cjk.test.ts"), "utf8");
    // `no-cjk.test.ts` viết `/[...]/u`; so phần trong ngoặc vuông với `CJK_CLASS` (ở đây đã nhân đôi dấu `\\` vì nằm trong chuỗi)
    expect(src).toContain(CJK_CLASS.replace(/\\\\/g, "\\"));
  });
});

// ---------- Chứng minh từng quy tắc bằng dữ liệu GIẢ (đột biến quy tắc => đỏ, kể cả khi dữ liệu thật sạch) ----------

describe("mỗi quy tắc có ca chứng minh (dữ liệu giả)", () => {
  /** Dựng ký tự từ mã Unicode để KHÔNG nhét chữ Hán / dấu CJK vào tệp này. */
  const ch = (...codes: number[]) => String.fromCodePoint(...codes);
  const reasons = (text: string) => violationsOf(text).join(" | ");

  it("chuỗi sạch không bị báo (không báo oan)", () => {
    for (const t of [
      "Hồi 40% khí huyết.",
      "Nhận 12 Linh thạch.",
      "Tiền thưởng: 5 Linh thạch",
      "Ngươi hãy vào trừ cho gọn, rồi trở về tông môn!",
    ])
      expect(violationsOf(t), t).toEqual([]);
  });

  it("(a) CJK: chữ Hán, dấu câu toàn chiều, dấu chấm CJK, Bopomofo và chữ Hán mở rộng B đều bị báo", () => {
    for (const bad of [
      ch(0x75c5), // chữ Hán thường
      ch(0xff0c), // dấu phẩy toàn chiều
      ch(0xff1a), // dấu hai chấm toàn chiều
      ch(0x3002), // dấu chấm CJK
      ch(0x3105), // Bopomofo
      ch(0x20000), // CJK mở rộng B (ngoài BMP: regex không cờ `u` bỏ sót)
      ch(0x3042), // Hiragana
      ch(0xac00), // Hangul
    ])
      expect(reasons(`Hồi máu ${bad} nhanh.`), `U+${bad.codePointAt(0)!.toString(16)}`).toContain(
        "chữ Hán/CJK",
      );
  });

  it("(b) khoảng trắng: đầu / cuối, hai dấu cách liền nhau, ký tự điều khiển", () => {
    expect(reasons(" Hồi máu")).toContain("khoảng trắng thừa");
    expect(reasons("Hồi máu ")).toContain("khoảng trắng thừa");
    expect(reasons("Hồi  máu")).toContain("hai dấu cách");
    expect(reasons("Hồi\u0007máu")).toContain("ký tự điều khiển");
  });

  it("(c) câu đủ: có dấu chấm / hỏi / than / lửng, đóng nháy hoặc ngoặc; thiếu dấu thì không", () => {
    for (const ok of [
      "Xong.",
      "Xong!",
      "Xong?",
      `Xong${ch(0x2026)}`,
      'Ông nói: "Đi."',
      "Xong (nhé.)",
      "Xong!'",
    ])
      expect(SENTENCE_END.test(ok), ok).toBe(true);
    for (const bad of ["Xong", "Xong,", "Xong:", 'Ông nói "đi"'])
      expect(SENTENCE_END.test(bad), bad).toBe(false);
  });

  it('(d) thuật ngữ "Linh thạch": "linh thạch", "Linh Thạch", "LINH THẠCH" bị báo, bản NFD cũng không lọt', () => {
    for (const bad of ["Nhận 5 linh thạch.", "Nhận 5 Linh Thạch.", "Nhận 5 LINH THẠCH."])
      expect(reasons(bad), bad).toContain('thuật ngữ "Linh thạch"');
    // "linh thạch" viết thường ở dạng NFD (chữ cái + dấu tách rời): vẫn phải bị quy tắc (d) bắt NGOÀI quy tắc NFC
    const nfd = "Nhận 5 linh thạch.".normalize("NFD");
    expect(nfd).not.toBe(nfd.normalize("NFC"));
    const r = reasons(nfd);
    expect(r).toContain("NFC");
    expect(r).toContain('thuật ngữ "Linh thạch"');
  });

  it("(e) lộ id: id đã biết VÀ id CHƯA biết kiểu snake_case đều bị báo; số / gạch ngang bình thường thì không", () => {
    expect(reasons("Tiêu diệt hoi_huyet_dan ngay.")).toContain("lộ id");
    expect(reasons("Quái st_tru_ho_son xuất hiện.")).toContain("lộ id"); // id của bảng mới, chưa nằm trong danh sách id nào
    expect(reasons("Cấp 3 - Trúc Cơ, 12/05.")).toBe("");
  });

  it("(f) NFC: chữ tổ hợp NFD bị báo, chữ dựng sẵn NFC thì không", () => {
    const nfc = "Luyện khí tầng một.";
    const nfd = nfc.normalize("NFD");
    expect(nfd).not.toBe(nfc);
    expect(violationsOf(nfc)).toEqual([]);
    expect(reasons(nfd)).toContain("NFC");
  });

  it("quét báo ĐÚNG vị trí: lời thoại tông nằm trong `talk.offer[i]` được nhặt kèm chỉ số, bảng không có chữ hiển thị thì không nhặt gì", () => {
    const fake = [
      {
        id: "st_a",
        title: "Việc một",
        talk: { offer: ["Câu một.", `Câu hai ${ch(0x75c5)}.`], progress: ["Đang làm."] },
      },
      { id: "st_b", title: "Việc hai", talk: { offer: ["Câu ba."], complete: ["Xong."] } },
    ];
    const got = fromTable(fake, "SECT_QUESTS");
    const wheres = got.map((s) => s.where);
    expect(wheres).toContain("SECT_QUESTS[0].talk.offer[1]");
    expect(wheres).toContain("SECT_QUESTS[1].talk.complete[0]");
    expect(wheres).not.toContain("SECT_QUESTS[0].id"); // `id` không phải chữ hiển thị
    const bad = got.filter((s) => violationsOf(s.text).length > 0).map((s) => s.where);
    expect(bad).toEqual(["SECT_QUESTS[0].talk.offer[1]"]);
    expect(fromTable([{ id: "x", level: 3, kind: "kill" }], "T")).toEqual([]);
  });
});
