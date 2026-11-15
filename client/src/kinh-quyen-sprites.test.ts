// Icon sáu kinh quyển đợt 2 (Nguyên Anh, #654): hình được vẽ TRƯỚC vật phẩm trong `shared/` (id chưa có trong `ITEMS` thì vô hại; Dev D thêm chiêu + quyển sau,
// `atlas.test.ts` đòi icon cho MỌI vật phẩm). Màu bìa theo hệ giống đợt 1 nên hai quyển cùng hệ chỉ khác nhau ở DẤU giữa bìa: test này giữ cho
// không quyển nào trùng pixel với icon khác (trùng thì người chơi không phân biệt được hai quyển trong túi).
import crypto from "node:crypto";
import fs from "node:fs";
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
