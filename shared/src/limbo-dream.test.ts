// Giấc mơ bến sông (#1464, chương 1): dữ liệu `LIMBO_DREAM_LINES` + `limboDreamOf`. Chỉ là lời hiện ở màn Hoàng Tuyền: test canh hình dạng dữ liệu,
// quy ước chữ, tra cứu an toàn với giá trị lạ, và dòng nguồn ở `docs/NGUON_NOI_DUNG.md` mục 3.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { KIEP_CAP, LIMBO_DREAM_LINES, limboDreamOf } from "./index";

const CJK = /[㐀-䶿一-鿿豈-﫿]/;
const here = dirname(fileURLToPath(import.meta.url));
const NGUON_DOC = readFileSync(resolve(here, "../../docs/NGUON_NOI_DUNG.md"), "utf8");

describe("giấc mơ bến sông (#1464)", () => {
  it("có dòng cho kiếp ĐẦU; mỗi kiếp tối đa một dòng, kiếp nguyên trong khoảng hợp lệ", () => {
    expect(limboDreamOf(1)).toBeTruthy();
    const ks = LIMBO_DREAM_LINES.map((l) => l.kiep);
    expect(new Set(ks).size, "kiếp trùng").toBe(ks.length);
    for (const k of ks) {
      expect(Number.isInteger(k), String(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeLessThanOrEqual(KIEP_CAP);
    }
  });

  it("mỗi dòng: một câu liền <= 160 ký tự, không chữ Hán, không xưng 'bạn', không nêu tên chân tướng (Thích Không)", () => {
    for (const l of LIMBO_DREAM_LINES) {
      expect(l.text.trim(), `kiếp ${l.kiep}`).toBe(l.text);
      expect(l.text.length, `kiếp ${l.kiep}`).toBeGreaterThanOrEqual(20);
      expect(l.text.length, `kiếp ${l.kiep}`).toBeLessThanOrEqual(160);
      expect(l.text.includes("\n"), `kiếp ${l.kiep}: xuống dòng`).toBe(false);
      expect(CJK.test(l.text), `kiếp ${l.kiep}: chữ Hán`).toBe(false);
      expect(l.text.toLowerCase().includes("bạn"), `kiếp ${l.kiep}: 'bạn'`).toBe(false);
      expect(l.text.includes("Thích Không"), `kiếp ${l.kiep}: lộ chân tướng`).toBe(false);
    }
  });

  it("limboDreamOf an toàn với giá trị lạ: kiếp chưa có lời (2), 0, âm, số thực, NaN, chuỗi, null, 'constructor' -> undefined", () => {
    for (const bad of [2, 3, 0, -1, 1.5, NaN, Infinity, "1", null, undefined, {}, "constructor"])
      expect(limboDreamOf(bad), String(bad)).toBeUndefined();
  });

  it("mỗi khoá nguồn có ĐÚNG MỘT dòng ở docs/NGUON_NOI_DUNG.md mục 3: loại su_kien, ghi #1464, KHONG_AP_DUNG", () => {
    for (const l of LIMBO_DREAM_LINES) {
      const rows = NGUON_DOC.split("\n").filter(
        (r) => r.startsWith("|") && r.includes(`\`${l.nguon}\``) && r.includes("#1464"),
      );
      expect(rows.length, `${l.nguon}: số dòng nguồn ghi #1464`).toBe(1);
      const cols = rows[0].split("|").map((c) => c.trim());
      expect([cols[1], cols[5], cols[6]], l.nguon).toEqual(["su_kien", "#1464", "KHONG_AP_DUNG"]);
      expect(rows[0].includes("limbo-dream.ts"), `${l.nguon}: trỏ tệp`).toBe(true);
    }
  });
});
