// Vật phẩm Hóa Thần của Lang Hoang, lát A2 của D1 (#1466, mục 75; `docs/QUAI_HOA_THAN_DE_XUAT.md` mục 5, khung `docs/KHUNG_HOA_THAN.md` mục 4.2): bốn nguyên liệu, bộ V (kiếm / bào / phù),
// ba công thức rèn ở thợ rèn Tuyết Đao Quan, bảng rơi của sáu loài sói. Quái VẪN chưa sinh (lát A3), nên test canh dữ liệu và tính nhất quán, không canh cân bằng săn quái.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DROP_TABLES,
  HOA_THAN_RECIPES,
  ITEM_BY_ID,
  ITEM_VALUE,
  LANG_HOANG_ID,
  NPC_BY_ID,
  NPCS,
  RECIPES,
  getMap,
  sellPrice,
  statsFor,
} from "./index";

const NGUON_DOC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/NGUON_NOI_DUNG.md"),
  "utf8",
);
const SOI = [
  "da_lang",
  "hac_phong_lang",
  "huyet_nguyet_lang",
  "xich_diem_lang",
  "thuong_nguyet_lang",
  "ngan_nguyet_lang",
] as const;
const MATS = ["bi_lang_hoang", "nanh_nguyet", "cot_lang_vuong", "hon_tinh_thien_lang"] as const;
const GEAR = ["kiem_nanh_nguyet", "bao_huyet_nguyet", "phu_hon_thien_lang"] as const;

describe("Hóa Thần Lang Hoang: nguyên liệu và bộ V (D1 #1466 lát A2)", () => {
  it("bốn nguyên liệu (material, độ hiếm >= 3) và ba món bộ V (equip, độ hiếm 4) có thật, có giá", () => {
    for (const id of MATS) {
      expect(ITEM_BY_ID[id], id).toBeDefined();
      expect(ITEM_BY_ID[id].type, id).toBe("material");
      expect(ITEM_BY_ID[id].rarity, id).toBeGreaterThanOrEqual(3);
      expect(ITEM_VALUE[id], `${id}: giá`).toBeGreaterThan(0);
    }
    for (const id of GEAR) {
      expect(ITEM_BY_ID[id], id).toBeDefined();
      expect(ITEM_BY_ID[id].type, id).toBe("equip");
      expect(ITEM_BY_ID[id].rarity, id).toBe(4);
      expect(ITEM_VALUE[id], `${id}: giá`).toBeGreaterThan(0);
    }
  });

  it("bộ V: mặc được từ Hóa Thần sơ kỳ, đúng bảng khung (kiếm 98, bào 1.168, phù 262 + tốc độ 28), ~29 % chỉ số gốc ở bậc đầu (25-40 %), cao hơn bộ IV cùng ô", () => {
    const base = statsFor(5, 0);
    for (const id of GEAR) {
      const e = ITEM_BY_ID[id].equip!;
      expect(e.reqRealm, id).toBe(5);
      expect(e.reqTier, id).toBe(0);
    }
    const kiem = ITEM_BY_ID.kiem_nanh_nguyet.equip!;
    const bao = ITEM_BY_ID.bao_huyet_nguyet.equip!;
    const phu = ITEM_BY_ID.phu_hon_thien_lang.equip!;
    expect(kiem.slot).toBe("weapon");
    expect(bao.slot).toBe("robe");
    expect(phu.slot).toBe("talisman");
    expect(kiem.stats).toEqual({ atk: 98 });
    expect(bao.stats).toEqual({ hp: 1168 });
    expect(phu.stats).toEqual({ mp: 262, speed: 28 });
    expect(kiem.stats.atk! / base.atk).toBeGreaterThan(0.25);
    expect(kiem.stats.atk! / base.atk).toBeLessThan(0.4);
    expect(bao.stats.hp! / base.maxHp).toBeGreaterThan(0.25);
    expect(bao.stats.hp! / base.maxHp).toBeLessThan(0.4);
    expect(kiem.stats.atk!).toBeGreaterThan(ITEM_BY_ID.han_vu_kiem.equip!.stats.atk!);
    expect(bao.stats.hp!).toBeGreaterThan(ITEM_BY_ID.han_lang_bao.equip!.stats.hp!);
    expect(phu.stats.mp!).toBeGreaterThan(ITEM_BY_ID.phong_nha_phu.equip!.stats.mp!);
    // tốc độ phù giữ +28 ở mọi bộ (KHUNG mục 4.2): không tăng, không giảm
    expect(phu.stats.speed!).toBe(ITEM_BY_ID.phong_nha_phu.equip!.stats.speed!);
  });

  it("bảng rơi: mỗi nguyên liệu rơi từ ít nhất một loài sói; hồn tinh chỉ từ Thương Nguyệt Lang (sói già nhất); mọi dòng trỏ vật phẩm có thật", () => {
    for (const m of MATS)
      expect(
        SOI.some((s) => DROP_TABLES[s].some((d) => d.itemId === m)),
        `${m}: không loài nào rơi`,
      ).toBe(true);
    for (const s of SOI) {
      expect(DROP_TABLES[s].length, s).toBeGreaterThan(0);
      for (const d of DROP_TABLES[s])
        expect(ITEM_BY_ID[d.itemId], `${s} -> ${d.itemId}`).toBeDefined();
      const rois = DROP_TABLES[s].some((d) => d.itemId === "hon_tinh_thien_lang");
      expect(rois, `${s}: hồn tinh`).toBe(s === "thuong_nguyet_lang");
    }
  });

  it("rèn: đúng ba công thức ở thợ rèn Tuyết Đao, mỗi món bộ V một công thức, CÓ phí, bán lại thành phẩm luôn lỗ so với phí + nguyên liệu, nguyên liệu kiếm được ở Lang Hoang", () => {
    expect(HOA_THAN_RECIPES).toHaveLength(3);
    expect(RECIPES.filter((r) => r.npcId === "tho_ren_tuyet_dao")).toEqual(HOA_THAN_RECIPES);
    expect(HOA_THAN_RECIPES.map((r) => r.output.itemId).sort()).toEqual([...GEAR].sort());
    const dropped = new Set(SOI.flatMap((s) => DROP_TABLES[s].map((d) => d.itemId)));
    for (const r of HOA_THAN_RECIPES) {
      expect(r.coin ?? 0, r.id).toBeGreaterThan(0);
      let mats = 0;
      for (const i of r.inputs) {
        expect(MATS as readonly string[], `${r.id}: ${i.itemId} là nguyên liệu Hóa Thần`).toContain(
          i.itemId,
        );
        expect(dropped.has(i.itemId), `${r.id}: ${i.itemId} rơi được`).toBe(true);
        expect(i.qty, r.id).toBeLessThanOrEqual(ITEM_BY_ID[i.itemId].stack);
        mats += (ITEM_VALUE[i.itemId] ?? 0) * i.qty;
      }
      expect(
        sellPrice(r.output.itemId),
        `${r.id}: bán lại phải lỗ so với phí + nguyên liệu`,
      ).toBeLessThan(mats + r.coin!);
    }
  });

  it("thợ rèn Tuyết Đao: đứng ở Lang Hoang, trong trạm, ô đi lại được; lời thoại 5 dòng", () => {
    const n = NPC_BY_ID.tho_ren_tuyet_dao;
    expect(n).toBeDefined();
    expect(n.mapId).toBe(LANG_HOANG_ID);
    const map = getMap(LANG_HOANG_ID)!;
    expect(map.inTown(n.x, n.y)).toBe(true);
    expect(NPCS.filter((x) => x.mapId === LANG_HOANG_ID).map((x) => x.id)).toContain(
      "tho_ren_tuyet_dao",
    );
    expect(n.dialog).toHaveLength(5);
  });

  it("mỗi nguyên liệu có ĐÚNG MỘT dòng `nguyen_lieu` ở docs/NGUON_NOI_DUNG.md mục 3 (ghi #1466, KHONG_AP_DUNG, trỏ id trong items.ts)", () => {
    for (const id of MATS) {
      const rows = NGUON_DOC.split("\n").filter(
        (r) =>
          r.startsWith("|") &&
          r.includes(`\`shared/src/items.ts\` id \`${id}\``) &&
          r.includes("#1466"),
      );
      expect(rows.length, `${id}: số dòng nguồn`).toBe(1);
      const cols = rows[0].split("|").map((c) => c.trim());
      expect([cols[1], cols[5], cols[6]], id).toEqual(["nguyen_lieu", "#1466", "KHONG_AP_DUNG"]);
    }
  });
});
