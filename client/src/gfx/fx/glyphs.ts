/**
 * Tập ký tự và bố cục glyph của phông bit-map chữ bay (M5.2, #325, mục 7.1 (5)).
 *
 * Phông được SINH BẰNG MÃ lúc chạy (vẽ chữ vào một canvas rồi lập bảng glyph cho `BitmapText` của Phaser) nên không có tệp
 * ngoài và không cần giấy phép riêng. Phần này là hàm thuần: danh sách ký tự (số, dấu, đủ chữ cái tiếng Việt có dấu để
 * nhãn như "Bạo!" in được) và lưới bố cục; phần vẽ canvas nằm ở `fx.ts`.
 */

const DIGITS = "0123456789";
const SYMBOLS = " +-!?.,:%/x×";
const ASCII_LOWER = "abcdefghijklmnopqrstuvwxyz";
const ASCII_UPPER = ASCII_LOWER.toUpperCase();
/** Chữ cái tiếng Việt có dấu (thường); chữ hoa suy ra bằng `toUpperCase`. */
const VI_LOWER = "àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ";
const VI_UPPER = VI_LOWER.toUpperCase();

/** Mọi ký tự có trong phông (không trùng, giữ thứ tự). */
export const FX_CHARS: string = Array.from(
  new Set(Array.from(DIGITS + SYMBOLS + ASCII_LOWER + ASCII_UPPER + VI_LOWER + VI_UPPER)),
).join("");

/** Các ký tự của `text` mà phông không có (rỗng = in được hết). Khoảng trắng không tính. */
export function missingGlyphs(text: string): string[] {
  const have = new Set(Array.from(FX_CHARS));
  const miss = new Set<string>();
  for (const ch of Array.from(text.normalize("NFC"))) if (!have.has(ch)) miss.add(ch);
  return [...miss];
}

export interface GlyphCell {
  ch: string;
  /** Vị trí trong lưới (điểm ảnh, góc trên trái ô). */
  x: number;
  y: number;
}

export interface GlyphGrid {
  cols: number;
  rows: number;
  width: number;
  height: number;
  cells: GlyphCell[];
}

/** Xếp ký tự vào lưới ô `cellW x cellH`, tối đa `cols` cột. Thuần, tất định. */
export function layoutGlyphGrid(
  chars: string,
  cellW: number,
  cellH: number,
  cols: number,
): GlyphGrid {
  const list = Array.from(chars);
  const c = Math.max(1, Math.floor(cols));
  const rows = Math.max(1, Math.ceil(list.length / c));
  const cells = list.map((ch, i) => ({ ch, x: (i % c) * cellW, y: Math.floor(i / c) * cellH }));
  return { cols: c, rows, width: c * cellW, height: rows * cellH, cells };
}
