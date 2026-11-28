// Ba chiêu Hóa Thần đầu tiên (D1 #1466 lát C, `shared/src/skills-hoa-than.ts`): khung `skillViolations`, độ hiếm / bậc, nguồn rơi hợp bậc (`book-drop-realm.test.ts` canh luật chung),
// sách trỏ đúng chiêu, và dòng nguồn ở `docs/NGUON_NOI_DUNG.md` mục 3. DPS thật do `server/src/balance/skills-dps.test.ts` giữ, chạy cả chiêu thật qua `cast` do `server/src/systems/skill-kit.test.ts`.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DROP_TABLES,
  ITEM_BY_ID,
  LEARNABLE_SKILLS,
  MONSTER_BY_ID,
  MONSTER_REALM,
  SKILL_BY_ID,
  SKILL_MULT_CAP,
  bookIdOf,
} from "./index";
import { SKILLS_HOA_THAN } from "./skills-hoa-than";
import { skillViolations } from "./skill-violations";

const NGUON_DOC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/NGUON_NOI_DUNG.md"),
  "utf8",
);
const IDS = ["xich_luyen_doan_hon", "tam_kiem_vo_hinh", "thai_son_ap_dinh"] as const;
const SOI = [
  "da_lang",
  "hac_phong_lang",
  "huyet_nguyet_lang",
  "xich_diem_lang",
  "thuong_nguyet_lang",
  "ngan_nguyet_lang",
] as const;

describe("ba chiêu Hóa Thần (D1 #1466 lát C)", () => {
  it("đúng ba chiêu, đều trong LEARNABLE_SKILLS, `reqRealm` 5, Địa phẩm (grade 2), độ hiếm >= 3, qua `skillViolations`", () => {
    expect(SKILLS_HOA_THAN.map((s) => s.id)).toEqual([...IDS]);
    for (const id of IDS) {
      const s = SKILL_BY_ID[id];
      expect(s, id).toBeDefined();
      expect(LEARNABLE_SKILLS.includes(s), id).toBe(true);
      expect(s.reqRealm, id).toBe(5);
      expect(s.grade, id).toBe(2);
      expect(s.rarity, id).toBeGreaterThanOrEqual(3);
    }
    expect(skillViolations(SKILLS_HOA_THAN).join("\n")).toBe("");
    // trần khung Hóa Thần (KHUNG mục 5): hit 4,1 / total 7
    expect(SKILL_MULT_CAP[5]).toEqual({ hit: 4.1, total: 7 });
    for (const s of SKILLS_HOA_THAN)
      expect(s.mult, s.id).toBeLessThanOrEqual(SKILL_MULT_CAP[5].hit);
  });

  it("mô tả nguyên văn nguồn: không chữ Hán, không xưng 'bạn', không tên môn phái / địa danh riêng của nguồn", () => {
    for (const s of SKILLS_HOA_THAN) {
      expect(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(s.desc), s.id).toBe(false);
      expect(s.desc.toLowerCase().includes("bạn"), s.id).toBe(false);
      for (const ten of ["Thanh Vân", "Kim Đạo Tự", "Huyền Vũ Môn", "Đan Hà Cốc", "Bắc Minh"])
        expect(s.desc.includes(ten) || s.name.includes(ten), `${s.id}: ${ten}`).toBe(false);
    }
  });

  it("sách dựng tự động (kinh_<id>) và rơi từ sói Lang Hoang (quái bậc 5 = đúng bậc của chiêu), 0,6-1,2 % mỗi nơi, KHÔNG rơi từ quái thấp bậc", () => {
    for (const id of IDS) {
      const book = ITEM_BY_ID[bookIdOf(id)];
      expect(book, id).toBeDefined();
      const nguon = Object.entries(DROP_TABLES).filter(([, rows]) =>
        rows.some((d) => d.itemId === bookIdOf(id)),
      );
      expect(nguon.length, `${id}: có nơi rơi`).toBeGreaterThan(0);
      for (const [mon, rows] of nguon) {
        expect(MONSTER_REALM[mon], `${id} <- ${mon}`).toBeGreaterThanOrEqual(5);
        expect(SOI as readonly string[], `${id} <- ${mon}: chỉ sói Lang Hoang ở lát C`).toContain(
          mon,
        );
        const d = rows.find((x) => x.itemId === bookIdOf(id))!;
        expect(d.chance, `${id} <- ${mon}`).toBeGreaterThanOrEqual(0.006);
        expect(d.chance, `${id} <- ${mon}`).toBeLessThanOrEqual(0.012);
        expect(MONSTER_BY_ID[mon].boss, mon).toBeFalsy();
      }
    }
  });

  it("mỗi chiêu có ĐÚNG MỘT dòng `cong_phap` ở docs/NGUON_NOI_DUNG.md mục 3 (ghi #1466, KHONG_AP_DUNG, trỏ id trong skills-hoa-than.ts)", () => {
    for (const id of IDS) {
      const rows = NGUON_DOC.split("\n").filter(
        (r) => r.startsWith("|") && r.includes(`\`shared/src/skills-hoa-than.ts\` id \`${id}\``),
      );
      expect(rows.length, `${id}: số dòng nguồn`).toBe(1);
      const cols = rows[0].split("|").map((c) => c.trim());
      expect([cols[1], cols[5], cols[6]], id).toEqual(["cong_phap", "#1466", "KHONG_AP_DUNG"]);
    }
  });
});
