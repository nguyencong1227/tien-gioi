// Chuỗi chính chương 5 (Lang Hoang, #1465 giai đoạn 2 lát 2; `docs/KICH_BAN_CHUONG_5_6.md` mục 3.2): ba nhiệm vụ chính nối sau `thien_han_hoan` (Hàn Vân),
// hai cao nhân Đoan Mộc Thu / Lạc Thanh Sơn đứng TRONG trạm Tuyết Đao Quan, vật phẩm cốt truyện `manh_ao_liet_duong` rơi chắc từ Thiên Lang Vương và KHÔNG bán được.
// Chốt chặn: đột biến dữ liệu (đổi id, bỏ `next`, đổi bước, hạ thưởng dưới sàn, cho vật phẩm bán được...) phải làm đỏ ít nhất một ca.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DROP_TABLES,
  ITEM_BY_ID,
  LANG_HOANG_ID,
  MONSTER_BY_ID,
  NPC_BY_ID,
  QUEST_BY_ID,
  expToNext,
  getMap,
  sellPrice,
  type QuestDef,
} from "./index";

/** Chữ Hán (CJK): lời thoại / mô tả Tiên Giới tiếng Việt, KHÔNG được có. */
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

const CHAIN = ["lang_hoang_vong_quan", "lang_hoang_lang_con", "lang_hoang_duong_mau"] as const;
const q = (id: (typeof CHAIN)[number]): QuestDef => QUEST_BY_ID[id];

const NGUON_DOC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/NGUON_NOI_DUNG.md"),
  "utf8",
);

describe("chuỗi chính chương 5, Lang Hoang (#1465 giai đoạn 2 lát 2)", () => {
  it("nối liền: thien_han_hoan -> vong_quan -> lang_con -> duong_mau, nhiệm vụ cuối không có next; không ai khác trỏ vào giữa chuỗi", () => {
    expect(QUEST_BY_ID.thien_han_hoan.next).toBe("lang_hoang_vong_quan");
    expect(q("lang_hoang_vong_quan").next).toBe("lang_hoang_lang_con");
    expect(q("lang_hoang_lang_con").next).toBe("lang_hoang_duong_mau");
    expect(q("lang_hoang_duong_mau").next).toBeUndefined(); // chương 6 nối sau (Uy Vân Kinh, #1465 giai đoạn 2 lát 3)
    for (const id of CHAIN) {
      const truoc = Object.values(QUEST_BY_ID).filter((o) => o.next === id);
      expect(truoc.length, `${id}: đúng một nhiệm vụ đứng trước`).toBe(1);
      expect(q(id).daily, id).toBeFalsy();
      expect(q(id).desc.startsWith("Việc phụ"), `${id}: là nhiệm vụ CHÍNH`).toBe(false);
    }
  });

  it("người giao: nhiệm vụ nối giao ở Thôi Tuyết Phong (Hàn Vân), hai nhiệm vụ còn lại ở Quan úy Ngô Cự (Lang Hoang)", () => {
    expect(q("lang_hoang_vong_quan").giver).toBe("tram_truong_han");
    expect(q("lang_hoang_lang_con").giver).toBe("quan_uy_tuyet_dao");
    expect(q("lang_hoang_duong_mau").giver).toBe("quan_uy_tuyet_dao");
    expect(NPC_BY_ID.quan_uy_tuyet_dao.mapId).toBe(LANG_HOANG_ID);
  });

  it("bước đúng kịch bản: reachRealm Hóa Thần sơ kỳ; talk Đoan Mộc Thu -> kill Dã Lang x30 -> talk Lạc Thanh Sơn -> collect da x10; kill Huyết Nguyệt Lang x20 -> kill Thiên Lang Vương -> collect mảnh áo", () => {
    expect(q("lang_hoang_vong_quan").steps).toEqual([{ kind: "reachRealm", realm: 5, tier: 0 }]);
    expect(q("lang_hoang_lang_con").steps).toEqual([
      { kind: "talk", npcId: "doan_moc_thu" },
      { kind: "kill", monster: "da_lang", count: 30 },
      { kind: "talk", npcId: "lac_thanh_son" },
      { kind: "collect", itemId: "bi_lang_hoang", count: 10 },
    ]);
    expect(q("lang_hoang_duong_mau").steps).toEqual([
      { kind: "kill", monster: "huyet_nguyet_lang", count: 20 },
      { kind: "kill", monster: "thien_lang_vuong", count: 1 },
      { kind: "collect", itemId: "manh_ao_liet_duong", count: 1 },
    ]);
  });

  it("bậc nhận chỉ tăng dọc chuỗi và nhiệm vụ nối vào Hóa Thần đòi đúng Nguyên Anh hậu kỳ; trùm chỉ nhận từ Trung kỳ (đội 3-4 người như Thiên Hàn Vương)", () => {
    expect(q("lang_hoang_vong_quan").minRealm).toEqual({ realm: 4, tier: 2 });
    expect(q("lang_hoang_lang_con").minRealm).toEqual({ realm: 5, tier: 0 });
    expect(q("lang_hoang_duong_mau").minRealm).toEqual({ realm: 5, tier: 1 });
  });

  it("steps: quái SINH ở Lang Hoang, vật phẩm thu được RƠI từ quái ở các bước kill, hai NPC talk đứng ở Lang Hoang", () => {
    const lh = getMap(LANG_HOANG_ID)!;
    for (const id of CHAIN) {
      const killed = new Set<string>();
      for (const st of q(id).steps) {
        if (st.kind === "kill") {
          expect(MONSTER_BY_ID[st.monster], `${id}: ${st.monster}`).toBeDefined();
          expect(
            lh.monsterCapOf(st.monster),
            `${id}: ${st.monster} sinh ở Lang Hoang`,
          ).toBeGreaterThan(0);
          killed.add(st.monster);
        }
        if (st.kind === "collect") {
          expect(ITEM_BY_ID[st.itemId], `${id}: ${st.itemId}`).toBeDefined();
          const nguon = [...killed].filter((m) =>
            (DROP_TABLES[m] ?? []).some((d) => d.itemId === st.itemId),
          );
          expect(nguon.length, `${id}: ${st.itemId} phải rơi từ quái ở bước kill`).toBeGreaterThan(
            0,
          );
        }
        if (st.kind === "talk")
          expect(NPC_BY_ID[st.npcId]?.mapId, `${id}: ${st.npcId}`).toBe(LANG_HOANG_ID);
      }
    }
  });

  it("thưởng tu vi: >= sàn 5 % thanh bậc nhận, tổng chuỗi <= 5 % tổng thanh Hóa Thần (chương 6 còn dùng chung trần 10 %)", () => {
    let tong = 0;
    for (const id of CHAIN) {
      const m = q(id).minRealm!;
      const bar = expToNext(m.realm, m.tier);
      expect(q(id).rewards.exp!, `${id}: dưới sàn`).toBeGreaterThanOrEqual(Math.ceil(0.05 * bar));
      tong += q(id).rewards.exp!;
    }
    const bars = [0, 1, 2].reduce((a, t) => a + expToNext(5, t), 0);
    expect(tong, "tổng chuỗi chương 5").toBe(258_000);
    expect(tong / bars).toBeLessThanOrEqual(0.05);
  });

  it("thưởng đan có thật và KHÔNG thưởng kinh quyển (sách Hóa Thần chỉ rơi từ quái / trùm)", () => {
    for (const id of CHAIN) {
      for (const it of q(id).rewards.items ?? []) {
        expect(ITEM_BY_ID[it.itemId], `${id}: ${it.itemId}`).toBeDefined();
        expect(ITEM_BY_ID[it.itemId].type, `${id}: ${it.itemId} không phải sách`).not.toBe("book");
      }
    }
  });

  it("Mảnh áo Liệt Dương: nguyên liệu KHÔNG bán được, rơi CHẮC từ Thiên Lang Vương đủ cho cả đội 3-4 người (>= 3 mảnh), không rơi từ quái thường", () => {
    const it = ITEM_BY_ID.manh_ao_liet_duong;
    expect(it.type).toBe("material");
    expect(sellPrice("manh_ao_liet_duong")).toBe(0);
    const drop = DROP_TABLES.thien_lang_vuong.find((d) => d.itemId === "manh_ao_liet_duong");
    expect(drop, "Thiên Lang Vương phải rơi mảnh áo").toBeDefined();
    expect(drop!.chance).toBe(1);
    expect(drop!.min).toBeGreaterThanOrEqual(3);
    for (const [mon, drops] of Object.entries(DROP_TABLES))
      if (mon !== "thien_lang_vuong")
        expect(
          drops.some((d) => d.itemId === "manh_ao_liet_duong"),
          `${mon} không được rơi vật phẩm cốt truyện`,
        ).toBe(false);
  });

  it("hai cao nhân đứng ở Lang Hoang, 4-5 dòng thoại, không chữ Hán, không xưng 'bạn'; Đoan Mộc Thu nhắc 'ba trăm năm', Lạc Thanh Sơn nhắc 'gánh'", () => {
    for (const id of ["doan_moc_thu", "lac_thanh_son"]) {
      const n = NPC_BY_ID[id];
      expect(n, id).toBeDefined();
      expect(n.mapId, id).toBe(LANG_HOANG_ID);
      expect(n.dialog.length, id).toBeGreaterThanOrEqual(4);
      expect(n.dialog.length, id).toBeLessThanOrEqual(5);
      for (const line of n.dialog) {
        expect(CJK.test(line), `${id}: "${line}" có chữ Hán`).toBe(false);
        expect(line.toLowerCase().includes("bạn"), `${id}: xưng 'bạn'`).toBe(false);
      }
    }
    expect(NPC_BY_ID.doan_moc_thu.dialog.join(" ")).toContain("ba trăm năm");
    expect(NPC_BY_ID.lac_thanh_son.dialog.join(" ")).toContain("gánh");
  });

  it("đủ ba nhóm lời thoại cho mỗi nhiệm vụ; mô tả và lời thoại không chữ Hán, không xưng 'bạn'", () => {
    for (const id of CHAIN) {
      const def = q(id);
      for (const g of ["offer", "progress", "complete"] as const)
        expect(def.talk[g].length, `${id}: ${g}`).toBeGreaterThan(0);
      expect(CJK.test(def.title) || CJK.test(def.desc), `${id}: có chữ Hán`).toBe(false);
      for (const line of [...def.talk.offer, ...def.talk.progress, ...def.talk.complete]) {
        expect(CJK.test(line), `${id}: "${line}" có chữ Hán`).toBe(false);
        expect(line.toLowerCase().includes("bạn"), `${id}: xưng 'bạn'`).toBe(false);
      }
    }
  });

  it("nguồn: ba dòng ở docs/NGUON_NOI_DUNG.md mục 3 (lore.huyet_luong_du_thu_trieu su_kien; hai NPC du_lieu), ghi #1465, KHONG_AP_DUNG", () => {
    const rowsOf = (key: string) =>
      NGUON_DOC.split("\n").filter(
        (r) => r.startsWith("|") && r.includes(`\`${key}\``) && r.includes("#1465"),
      );
    const CASES: [string, string][] = [
      ["lore.huyet_luong_du_thu_trieu", "su_kien"],
      ["npc.quan_ky_chan_quan", "du_lieu"],
      ["npc.phu_son_lao_nhan", "du_lieu"],
    ];
    for (const [key, loai] of CASES) {
      const rows = rowsOf(key);
      expect(rows.length, `${key}: số dòng nguồn ghi #1465`).toBe(1);
      const cols = rows[0].split("|").map((c) => c.trim());
      expect([cols[1], cols[5], cols[6]], key).toEqual([loai, "#1465", "KHONG_AP_DUNG"]);
    }
  });
});
