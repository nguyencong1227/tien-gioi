// Dấu riêng của kinh quyển (issue #1303, B): sinh TẤT ĐỊNH từ id quyển để mọi quyển MỚI (G / D / E thêm chiêu) tự có dấu khác
// quyển cũ mà không phải vẽ tay, trước đây 43 / 57 quyển dùng cùng một dấu tròn (10 cặp icon giống hệt, 37 cặp gần giống).
//
// Hàm thuần (không đọc / ghi tệp, không đụng `Surface`) để `gen-assets.mjs` dùng khi vẽ và `book-marks.test.ts` kiểm trực tiếp.
//
// Thiết kế "ấn": lưới 7 x 7 điểm ảnh, ĐỐI XỨNG TRÁI / PHẢI (4 cột tự do x 7 hàng = 28 bit, ~268 triệu dạng nên hai id gần như không
// bao giờ trùng), vẽ bằng màu phụ của bìa giữa hai dải ngang. Luật chống chữ Hán (AGENTS.md: không chữ Hán / chữ lạ trên ảnh):
// các nét ngang / dọc LIỀN dài >= 4 điểm ảnh bị loại (nét thẳng giao nhau đọc ra «điền», «vương», «mễ», «xuyên»...), nên chỉ còn
// cụm điểm và nét ngắn như con dấu / phù ấn; mỗi hàng và mỗi cột phải có điểm sáng (không có ấn lép) và số điểm sáng nằm trong
// khoảng [MIN_LIT, MAX_LIT] (không quá thưa, không thành mảng đặc).

/** Kích thước ấn (điểm ảnh): 7 x 7, trải trong vùng 9 cột x 9 hàng giữa hai dải ngang của bìa. */
export const SIGIL_SIZE = 7;
export const MIN_LIT = 14;
export const MAX_LIT = 28;
/** Nét liền (ngang hoặc dọc) dài từ ngần này điểm trở lên bị loại. */
export const MAX_RUN = 3;

/** Băm 32 bit (FNV-1a rồi trộn bit kiểu murmur3) của một chuỗi: tất định, không phụ thuộc nền tảng. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Bộ số ngẫu nhiên xorshift32 gieo từ một số 32 bit (khác 0). */
function rng(seed) {
  let x = seed >>> 0 || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

/** Chiều dài nét liền dài nhất của một dãy 0/1. */
function longestRun(line) {
  let best = 0;
  let cur = 0;
  for (const v of line) {
    cur = v ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}

/** Lưới 7 x 7 (mảng 7 hàng, mỗi hàng 7 số 0/1) có đạt các luật của ấn không. */
export function sigilValid(grid) {
  const n = SIGIL_SIZE;
  let lit = 0;
  for (let y = 0; y < n; y++) {
    const row = grid[y];
    const col = grid.map((r) => r[y]);
    if (!row.some(Boolean) || !col.some(Boolean)) return false;
    if (longestRun(row) > MAX_RUN || longestRun(col) > MAX_RUN) return false;
    lit += row.reduce((a, v) => a + v, 0);
  }
  return lit >= MIN_LIT && lit <= MAX_LIT;
}

/**
 * Ấn của quyển `id`: mảng 7 hàng, mỗi hàng 7 số 0/1, đối xứng trái / phải. `salt` (số nguyên >= 0) đổi ấn khi hai quyển lỡ trùng
 * (chỉnh tay duy nhất cần có: ghi `salt` vào mục của quyển trong bảng `BOOKS`); mặc định 0.
 */
export function sigilGrid(id, salt = 0) {
  const n = SIGIL_SIZE;
  const half = (n + 1) >> 1; // 4 cột tự do: cột 0..3 (cột 3 là trục giữa)
  const next = rng(hash32(`${id}#${salt}`));
  for (let attempt = 0; attempt < 4096; attempt++) {
    const grid = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < half; x++) {
        const v = next() & 1 ? 1 : 0;
        grid[y][x] = v;
        grid[y][n - 1 - x] = v;
      }
    }
    if (sigilValid(grid)) return grid;
  }
  throw new Error(`Không sinh được ấn hợp lệ cho "${id}" (salt ${salt})`);
}

/**
 * Ấn dưới dạng 9 cột để `paintMark` của `gen-assets.mjs` vẽ ở y0 = 10 (như dấu "hoa"): mỗi hàng 9 ký tự, "#" là điểm sáng, "." là nền;
 * ấn 7 cột đặt giữa (cách mép trái / phải một cột).
 */
export function sigilRows(id, salt = 0) {
  return sigilGrid(id, salt).map((row) => `.${row.map((v) => (v ? "#" : ".")).join("")}.`);
}
