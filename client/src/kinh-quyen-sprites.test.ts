// Icon sáu kinh quyển đợt 2 (Nguyên Anh, #654): hình được vẽ TRƯỚC vật phẩm trong `shared/` (id chưa có trong `ITEMS` thì vô hại; Dev D thêm chiêu + quyển sau,
// `atlas.test.ts` đòi icon cho MỌI vật phẩm). Màu bìa theo hệ giống đợt 1 nên hai quyển cùng hệ chỉ khác nhau ở DẤU giữa bìa: test này giữ cho
// không quyển nào trùng pixel với icon khác (trùng thì người chơi không phân biệt được hai quyển trong túi).
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";

const dir = new URL("../public/assets/items/", import.meta.url);
const atlas = JSON.parse(
  fs.readFileSync(new URL("../public/assets/atlas.json", import.meta.url), "utf-8"),
) as { frames: Record<string, { frame: { w: number; h: number } }> };

/** Sáu quyển đợt 2 (id theo hợp đồng của Dev D ở #654). */
const DOT_2 = [
  "kinh_han_quang_tien",
  "kinh_bach_kim_trao",
  "kinh_van_thach_tran",
  "kinh_bang_hoa_loan",
  "kinh_liet_hoa_kiem",
  "kinh_van_hanh_bo",
];

const bytesOf = (id: string) => fs.readFileSync(new URL(`${id}.png`, dir));
const hashOf = (id: string) => crypto.createHash("sha256").update(bytesOf(id)).digest("hex");

describe("icon kinh quyển đợt 2 (Nguyên Anh, #654)", () => {
  it("mỗi quyển có tệp items/<id>.png 24x24 và khung atlas item-<id> 24x24", () => {
    for (const id of DOT_2) {
      const b = bytesOf(id);
      expect(b.subarray(1, 4).toString("ascii"), `${id}: PNG`).toBe("PNG");
      expect([b.readUInt32BE(16), b.readUInt32BE(20)], `${id}: kích thước tệp`).toEqual([24, 24]);
      const f = atlas.frames[`item-${id}`];
      expect(f, `item-${id}`).toBeDefined();
      expect([f.frame.w, f.frame.h], `${id}: kích thước khung`).toEqual([24, 24]);
    }
  });

  it("không quyển nào trùng từng byte với icon vật phẩm khác (kể cả 12 quyển đợt 1 và nhau)", () => {
    const all = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".png"))
      .map((f) => f.replace(/\.png$/, ""));
    const owner = new Map<string, string>();
    for (const id of all) {
      const h = hashOf(id);
      const other = owner.get(h);
      // chỉ báo lỗi khi một quyển đợt 2 dính vào cặp trùng
      if (other !== undefined && (DOT_2.includes(id) || DOT_2.includes(other)))
        expect.fail(`${id} trùng icon ${other}`);
      owner.set(h, id);
    }
    expect(all.filter((id) => DOT_2.includes(id))).toHaveLength(DOT_2.length);
  });

  it("quyển nào cũng đủ điểm ảnh đặc (không phải tệp trống) và hình khác nhau thật sự giữa các cặp cùng hệ", () => {
    // cặp cùng hệ (cùng màu bìa gốc): Băng (Huyền Băng Chỉ / Hàn Quang Tiễn / Băng Hoa Loạn), Hỏa, Phong, Kim, Thổ
    const cungHe: Array<[string, string]> = [
      ["kinh_huyen_bang_chi", "kinh_han_quang_tien"],
      ["kinh_huyen_bang_chi", "kinh_bang_hoa_loan"],
      ["kinh_han_quang_tien", "kinh_bang_hoa_loan"],
      ["kinh_hoa_van_kiem", "kinh_liet_hoa_kiem"],
      ["kinh_phieu_phong_bo", "kinh_van_hanh_bo"],
      ["kinh_ung_trao", "kinh_bach_kim_trao"],
      ["kinh_bon_thach_quyen", "kinh_van_thach_tran"],
    ];
    for (const [a, b] of cungHe) expect(hashOf(a), `${a} khác ${b}`).not.toBe(hashOf(b));
    for (const id of DOT_2) expect(bytesOf(id).length, `${id}: dung lượng`).toBeGreaterThan(120);
  });
});

// ---- Hình dấu không đọc ra chữ Hán (quy tắc dự án: không chữ Hán / chữ lạ trên ảnh; review của A trên #719) ----
// Hai dấu từng bị đọc ra chữ: ba vệt gần thẳng đứng song song ("川") và lưới 2 x 2 ("田"); dấu kiếm thì ra "王". Test giải mã chính tệp PNG (bộ mã hoá của
// `gen-assets.mjs`: PNG RGBA 8 bit, bộ lọc None) và kiểm HÌNH của dấu (các cụm điểm ảnh cùng màu), không so màu hay hash.

/** Giải mã PNG RGBA 8 bit, bộ lọc None; trả hàm đọc điểm ảnh (r, g, b, a). */
function decodeIcon(id: string) {
  const b = bytesOf(id);
  const idat: Buffer[] = [];
  for (let off = 8; off < b.length;) {
    const len = b.readUInt32BE(off);
    if (b.toString("ascii", off + 4, off + 8) === "IDAT")
      idat.push(b.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const w = b.readUInt32BE(16);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  return (x: number, y: number) => {
    const o = y * (w * 4 + 1) + 1 + x * 4;
    return [raw[o], raw[o + 1], raw[o + 2], raw[o + 3]] as const;
  };
}

const STEPS_4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const STEPS_8 = [...STEPS_4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

interface Blob {
  n: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Cụm điểm ảnh (liền kề 8 hướng nếu `diag`, không thì 4 hướng) có đúng màu `rgb` trong vùng dấu: x = 8..16, y = 9..16 (giữa hai dải ngang của bìa, nên dải bìa không lẫn vào). */
function blobsOf(id: string, rgb: number, diag = false): Blob[] {
  const at = decodeIcon(id);
  const want = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255];
  const on = (x: number, y: number) =>
    x >= 8 && x <= 16 && y >= 9 && y <= 16 && at(x, y).every((v, i) => v === want[i]);
  const seen = new Set<number>();
  const out: Blob[] = [];
  for (let y = 9; y <= 16; y++)
    for (let x = 8; x <= 16; x++) {
      if (!on(x, y) || seen.has(y * 32 + x)) continue;
      const blob: Blob = { n: 0, x0: x, x1: x, y0: y, y1: y };
      const stack: Array<[number, number]> = [[x, y]];
      seen.add(y * 32 + x);
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        blob.n++;
        blob.x0 = Math.min(blob.x0, cx);
        blob.x1 = Math.max(blob.x1, cx);
        blob.y0 = Math.min(blob.y0, cy);
        blob.y1 = Math.max(blob.y1, cy);
        for (const [dx, dy] of diag ? STEPS_8 : STEPS_4) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (on(nx, ny) && !seen.has(ny * 32 + nx)) {
            seen.add(ny * 32 + nx);
            stack.push([nx, ny]);
          }
        }
      }
      out.push(blob);
    }
  return out;
}

describe("hình dấu kinh quyển không đọc ra chữ Hán", () => {
  it("Bạch Kim Trảo: đúng ba vệt, mỗi vệt XIÊN (lệch ngang >= nửa chiều cao), đầu không cùng hàng (không phải ba nét dọc song song)", () => {
    const blobs = blobsOf("kinh_bach_kim_trao", 0x5a626e, true);
    expect(blobs, "số vệt cào").toHaveLength(3);
    for (const b of blobs) {
      const dx = b.x1 - b.x0;
      const dy = b.y1 - b.y0;
      expect(dy, "vệt đủ dài").toBeGreaterThanOrEqual(3);
      expect(dx, `vệt (${b.x0},${b.y0}) lệch ngang ${dx} so với cao ${dy}`).toBeGreaterThanOrEqual(
        dy / 2,
      );
    }
    expect(new Set(blobs.map((b) => b.y0)).size, "đầu các vệt lệch nhau").toBeGreaterThan(1);
    expect(new Set(blobs.map((b) => b.n)).size, "độ dài các vệt khác nhau").toBeGreaterThan(1);
  });

  it("Vạn Thạch Trận: đúng ba tảng đá khác cỡ (diện tích đôi một khác nhau), không xếp lưới (không hai tảng cùng hộp bao)", () => {
    const stones = blobsOf("kinh_van_thach_tran", 0xf0d9a0);
    expect(stones, "số tảng đá").toHaveLength(3);
    expect(new Set(stones.map((b) => b.n)).size, "diện tích khác nhau").toBe(3);
    const box = (b: Blob) => `${b.x1 - b.x0}x${b.y1 - b.y0}`;
    expect(new Set(stones.map(box)).size, "hộp bao khác nhau").toBe(3);
    // không có hai tảng cùng hàng trên VÀ cùng cột trái (lưới 2 x 2 đều tăm tắp)
    expect(new Set(stones.map((b) => `${b.x0},${b.y0}`)).size).toBe(3);
  });

  it('Băng Hoa Loạn: bông tuyết sáu nhánh, KHÔNG có nhánh ngang (dọc + ngang + hai chéo là tám nan đều, đọc ra chữ Hán "米")', () => {
    const at = decodeIcon("kinh_bang_hoa_loan");
    const white = (x: number, y: number) => at(x, y).every((v) => v === 255);
    for (let y = 9; y <= 16; y++) {
      let run = 0;
      let best = 0;
      for (let x = 8; x <= 16; x++) {
        run = white(x, y) ? run + 1 : 0;
        best = Math.max(best, run);
      }
      expect(best, `hàng y = ${y}: nét ngang liền dài ${best}`).toBeLessThanOrEqual(3);
    }
    // có nhánh dọc suốt chiều cao dấu (hàng 10..16)
    for (let y = 10; y <= 16; y++) expect(white(12, y), `nhánh dọc thiếu ở y = ${y}`).toBe(true);
  });
});
