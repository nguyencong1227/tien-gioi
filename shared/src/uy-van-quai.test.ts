// Quái Hóa Thần của Uy Vân Kinh, lát A1 chương 6 của D1 (#1466, mục 75; `docs/QUAI_HOA_THAN_DE_XUAT.md` mục 4, khung `docs/KHUNG_HOA_THAN.md` mục 4.1).
// Sáu loài thường khai báo ở lát A1 và CHƯA SINH (cho sinh ở lát sau: `monsterCap` của `uy_van`). Test canh: số liệu bám vai của khung, hành vi theo vai,
// cấp trong trần chặn đường Hóa Thần, thứ tự `minDanger` theo `exp`, bậc `MONSTER_REALM` 5, bảng rơi + tiền, KHÔNG sinh ở đâu, ảnh tạm là bí danh, và dòng nguồn.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AMBUSH_FOE_LEVEL_CAP,
  COIN_DROPS,
  DROP_TABLES,
  ITEM_BY_ID,
  MAPS,
  MONSTER_BY_ID,
  MONSTER_CAP,
  MONSTER_REALM,
  WILD_MONSTERS,
  getMap,
} from "./index";

/** Vai Hóa Thần của khung (mục 4.1): máu / công / tu vi khi hạ; cấp (mẫu Hàn Lang, Phong Nha, Cốt Tượng, Độc Tước). */
const ROLE = {
  gong: { hp: 7817, atk: 464, exp: 7920, level: 19 },
  ban: { hp: 7547, atk: 543, exp: 9120, level: 20 },
  day: { hp: 31807, atk: 216, exp: 15480, level: 20 },
  nang: { hp: 12669, atk: 899, exp: 16560, level: 21 },
} as const;

/** Sáu loài: vai + hệ số vai (tài liệu đề xuất mục 4) + hệ + hành vi mong đợi. */
const LOAI = [
  { id: "nga_quy", vai: "gong", he: 0.85, element: "hoa", behavior: "charger" },
  { id: "luyen_huyet_de_tu", vai: "gong", he: 0.9, element: "hoa", behavior: "charger" },
  { id: "huyet_anh", vai: "ban", he: 1.0, element: "hoa", behavior: "ranged" },
  { id: "cuong_thi", vai: "day", he: 0.95, element: "tho", behavior: undefined },
  { id: "huyet_mi", vai: "nang", he: 0.9, element: "hoa", behavior: "poisoner" },
  { id: "huyet_sat_chan_truyen", vai: "nang", he: 1.1, element: "hoa", behavior: "poisoner" },
] as const;

const NGUON_DOC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/NGUON_NOI_DUNG.md"),
  "utf8",
);

describe("quái Hóa Thần Uy Vân Kinh (D1 #1466 lát A1 chương 6)", () => {
  it("sáu loài có thật, bậc `MONSTER_REALM` 5 (Hóa Thần), không phải trùm", () => {
    expect(LOAI).toHaveLength(6);
    for (const l of LOAI) {
      const m = MONSTER_BY_ID[l.id];
      expect(m, l.id).toBeDefined();
      expect(MONSTER_REALM[l.id], `${l.id}: MONSTER_REALM`).toBe(5);
      expect(m.boss, `${l.id}: loài thường`).toBeFalsy();
    }
  });

  it("máu / công / tu vi = vai Hóa Thần của khung x hệ số vai (trong +-2 % làm tròn); cấp đúng vai và trong trần chặn đường Hóa Thần", () => {
    const cap = AMBUSH_FOE_LEVEL_CAP[5]!;
    for (const l of LOAI) {
      const m = MONSTER_BY_ID[l.id];
      const r = ROLE[l.vai];
      for (const k of ["hp", "atk", "exp"] as const) {
        const want = r[k] * l.he;
        expect(
          Math.abs(m[k] - want) / want,
          `${l.id}.${k} = ${m[k]}, khung x hệ số = ${Math.round(want)}`,
        ).toBeLessThanOrEqual(0.02);
      }
      expect(m.level, `${l.id}: cấp`).toBeGreaterThanOrEqual(r.level);
      expect(m.level, `${l.id}: cấp`).toBeLessThanOrEqual(cap);
    }
  });

  it("`minDanger` tăng CÙNG `exp` (loài tu vi cao nằm sâu hơn, như Hàn Vân), trong (0, 1), không trùng nhau", () => {
    const theoExp = [...LOAI].sort((a, b) => MONSTER_BY_ID[a.id].exp - MONSTER_BY_ID[b.id].exp);
    for (let i = 0; i + 1 < theoExp.length; i++)
      expect(
        MONSTER_BY_ID[theoExp[i + 1].id].minDanger,
        `${theoExp[i + 1].id} sâu hơn ${theoExp[i].id}`,
      ).toBeGreaterThan(MONSTER_BY_ID[theoExp[i].id].minDanger);
    for (const l of LOAI) {
      const d = MONSTER_BY_ID[l.id].minDanger;
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(1);
    }
  });

  it("hành vi theo vai: Ngạ Quỷ / Luyện Huyết lao (gồng 600-1200 ms), Huyết Ảnh bắn đạn né được, Huyết Mị / Chân Truyền nhổ đạn độc chậm, Cương Thi dày + chậm + công thấp nhất; tốc độ <= 200", () => {
    for (const l of LOAI) {
      const m = MONSTER_BY_ID[l.id];
      expect(m.behavior, `${l.id}: behavior`).toBe(l.behavior);
      expect(m.element, `${l.id}: element`).toBe(l.element);
      expect(m.speed, `${l.id}: speed`).toBeLessThanOrEqual(200);
      if (l.behavior === "charger") {
        expect(m.windupMs!, l.id).toBeGreaterThanOrEqual(600);
        expect(m.windupMs!, l.id).toBeLessThanOrEqual(1200);
      }
      if (l.behavior === "ranged" || l.behavior === "poisoner") {
        expect(m.boltSpeed!, `${l.id}: đạn né được`).toBeLessThanOrEqual(640);
        expect(m.boltRange!, `${l.id}: tầm đạn`).toBeGreaterThan(3 * m.attackRange);
        expect(m.boltRange!, `${l.id}: tầm đạn`).toBeLessThanOrEqual(400);
      }
      if (l.behavior === "poisoner")
        expect(m.boltSpeed!, `${l.id}: đạn độc chậm`).toBeLessThanOrEqual(300);
    }
    const day = MONSTER_BY_ID.cuong_thi;
    expect(day.slam, "Cương Thi không đập đất (nguồn chỉ nói da cứng, chậm)").toBeUndefined();
    for (const l of LOAI) {
      if (l.id === day.id) continue;
      expect(day.hp, l.id).toBeGreaterThan(MONSTER_BY_ID[l.id].hp);
      expect(day.speed, l.id).toBeLessThan(MONSTER_BY_ID[l.id].speed);
      expect(day.atk, l.id).toBeLessThan(MONSTER_BY_ID[l.id].atk);
    }
  });

  it("CHƯA SINH ở đâu: `MONSTER_CAP` 0, ngoài `WILD_MONSTERS`, không bản đồ nào (kể cả `uy_van`) có `monsterCap` cho chúng (cho sinh là lát sau)", () => {
    for (const l of LOAI) {
      expect(MONSTER_CAP[l.id], `${l.id}: MONSTER_CAP mặc định`).toBe(0);
      expect(
        WILD_MONSTERS.some((m) => m.id === l.id),
        `${l.id}: WILD_MONSTERS`,
      ).toBe(false);
      for (const map of MAPS)
        expect(getMap(map.id)!.monsterCapOf(l.id), `${l.id} @ ${map.id}`).toBe(0);
    }
  });

  it("bảng rơi đồ có thật (vật phẩm trỏ đúng) và tiền rơi hợp lệ, trung bình >= Linh Hư Yêu Vương 400 (nhóm 'chưa sinh'); loài tu vi cao rơi tiền trung bình không ít hơn loài tu vi thấp", () => {
    const avg = (id: string) =>
      COIN_DROPS[id]!.chance * ((COIN_DROPS[id]!.min + COIN_DROPS[id]!.max) / 2);
    for (const l of LOAI) {
      expect(DROP_TABLES[l.id]?.length ?? 0, `${l.id}: bảng rơi`).toBeGreaterThan(0);
      for (const d of DROP_TABLES[l.id]!)
        expect(ITEM_BY_ID[d.itemId], `${l.id} -> ${d.itemId}`).toBeDefined();
      expect(COIN_DROPS[l.id], `${l.id}: COIN_DROPS`).toBeDefined();
      expect(avg(l.id), `${l.id}: tiền trung bình`).toBeGreaterThanOrEqual(400);
    }
    const theoExp = [...LOAI].sort((a, b) => MONSTER_BY_ID[a.id].exp - MONSTER_BY_ID[b.id].exp);
    for (let i = 0; i + 1 < theoExp.length; i++)
      expect(
        avg(theoExp[i + 1].id),
        `${theoExp[i + 1].id} >= ${theoExp[i].id}`,
      ).toBeGreaterThanOrEqual(avg(theoExp[i].id));
  });

  it("ảnh TẠM là BÍ DANH (atlas chính chạm trần): mỗi loài có đủ khung `mon-<id>` ở atlas.json nhưng KHÔNG thêm điểm ảnh (khung trùng toạ độ với khung mượn)", () => {
    const atlas = JSON.parse(
      readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "../../client/public/assets/atlas.json"),
        "utf8",
      ),
    ) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> };
    const MUON: Record<string, string> = {
      luyen_huyet_de_tu: "cot_tuong",
      nga_quy: "suong_ho",
      cuong_thi: "thach_quy",
      huyet_mi: "doc_tuoc",
      huyet_anh: "phong_nha",
      huyet_sat_chan_truyen: "doc_thiem",
    };
    for (const l of LOAI) {
      const mine = atlas.frames[`mon-${l.id}`];
      const target = atlas.frames[`mon-${MUON[l.id]}`];
      expect(mine, `${l.id}: khung`).toBeDefined();
      expect(target, `${MUON[l.id]}: khung mượn`).toBeDefined();
      expect(mine.frame, `${l.id}: trùng toạ độ khung ${MUON[l.id]}`).toEqual(target.frame);
    }
  });

  it("mỗi loài có ĐÚNG MỘT dòng `du_lieu` ở docs/NGUON_NOI_DUNG.md mục 3 (khoá `enemy.<id>`, ghi #1466, KHONG_AP_DUNG, trỏ id trong `game.ts`)", () => {
    for (const l of LOAI) {
      const rows = NGUON_DOC.split("\n").filter(
        (r) => r.startsWith("|") && r.includes(`\`enemy.${l.id}\``) && r.includes("#1466"),
      );
      expect(rows.length, `${l.id}: số dòng nguồn`).toBe(1);
      const cols = rows[0].split("|").map((c) => c.trim());
      expect([cols[1], cols[5], cols[6]], l.id).toEqual(["du_lieu", "#1466", "KHONG_AP_DUNG"]);
      expect(rows[0].includes(`id \`${l.id}\``), `${l.id}: trỏ id`).toBe(true);
    }
  });
});
