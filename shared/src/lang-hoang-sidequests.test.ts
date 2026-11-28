// Ba việc phụ ở Tuyết Đao Quan (Lang Hoang, #1465 giai đoạn 2 lát 1; `docs/KICH_BAN_CHUONG_5_6.md` mục 3.3): mỗi việc một NPC giao đứng TRONG trạm Lang Hoang,
// bậc Hóa Thần (realm 5), steps chỉ kill / collect / talk trỏ tới quái SINH ở Lang Hoang và vật phẩm quái đó RƠI, thưởng tu vi trong khung (sàn 2 % thanh bậc nhận,
// tăng theo bậc), thưởng đan có thật, KHÔNG thưởng kinh quyển (sách Hóa Thần chỉ rơi từ quái), lời thoại không chữ Hán, dòng nguồn ở `docs/NGUON_NOI_DUNG.md` mục 3.
// Test này là chốt chặn: đột biến dữ liệu phải làm đỏ ít nhất một ca.
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
  QUESTS,
  QUEST_BY_ID,
  expToNext,
  getMap,
} from "./index";

/** Chữ Hán (CJK): lời thoại / mô tả Tiên Giới tiếng Việt, KHÔNG được có. */
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

const IDS = ["lh_phi_qua_ai", "lh_hang_lau", "lh_linh_ai_sach_nhieu"] as const;
/** Người giao: lái buôn, tán tu, quan úy (ba NPC khác nhau, đều là NPC của Lang Hoang). */
const GIVERS: Record<(typeof IDS)[number], string> = {
  lh_phi_qua_ai: "lai_buon_tuyet_dao",
  lh_hang_lau: "do_thap_tam_nuong",
  lh_linh_ai_sach_nhieu: "quan_uy_tuyet_dao",
};
/** Bậc nhận: hai việc đầu ở Sơ kỳ (tầng 0), việc cuối ở Trung kỳ (tầng 1). */
const TIER: Record<(typeof IDS)[number], number> = {
  lh_phi_qua_ai: 0,
  lh_hang_lau: 0,
  lh_linh_ai_sach_nhieu: 1,
};

const NGUON_DOC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/NGUON_NOI_DUNG.md"),
  "utf8",
);

describe("việc phụ Tuyết Đao Quan, Lang Hoang (#1465 giai đoạn 2 lát 1)", () => {
  const side = IDS.map((id) => QUEST_BY_ID[id]);

  it("đúng BA việc phụ, mỗi việc một NPC giao KHÁC nhau, NPC đứng ở Lang Hoang; mô tả mở đầu 'Việc phụ (không bắt buộc)', không lặp, không có người đứng trước", () => {
    for (const id of IDS) {
      const q = QUEST_BY_ID[id];
      expect(q, id).toBeDefined();
      expect(q.giver, id).toBe(GIVERS[id]);
      expect(NPC_BY_ID[q.giver]?.mapId, `${id}: NPC giao đứng ở Lang Hoang`).toBe(LANG_HOANG_ID);
      expect(q.desc.startsWith("Việc phụ (không bắt buộc)"), id).toBe(true);
      expect(q.daily, id).toBeFalsy();
      expect(
        QUESTS.some((o) => o.next === id),
        `${id}: không được là next của nhiệm vụ nào`,
      ).toBe(false);
      expect(q.next, id).toBeUndefined();
    }
    expect(new Set(side.map((q) => q.giver)).size).toBe(3);
  });

  it("mọi việc có minRealm Hóa Thần (realm 5), tầng đúng bảng, KHÔNG hạ xuống Nguyên Anh", () => {
    for (const id of IDS) {
      const q = QUEST_BY_ID[id];
      expect(q.minRealm!.realm, id).toBe(5);
      expect(q.minRealm!.tier, id).toBe(TIER[id]);
    }
  });

  it("steps chỉ kill / collect / talk: quái SINH ở Lang Hoang, vật phẩm thu được RƠI từ chính quái ở các bước kill của việc, NPC talk đứng ở Lang Hoang", () => {
    const lh = getMap(LANG_HOANG_ID)!;
    for (const id of IDS) {
      const q = QUEST_BY_ID[id];
      const killed = new Set<string>();
      for (const st of q.steps) {
        expect(["kill", "collect", "talk"], `${id}: bước ${st.kind}`).toContain(st.kind);
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
          expect(
            nguon.length,
            `${id}: ${st.itemId} phải rơi từ quái ở bước kill của việc`,
          ).toBeGreaterThan(0);
        }
        if (st.kind === "talk")
          expect(NPC_BY_ID[st.npcId]?.mapId, `${id}: ${st.npcId}`).toBe(LANG_HOANG_ID);
      }
    }
  });

  it("thưởng tu vi: >= sàn 2 % thanh bậc nhận, <= 3 % (trần việc phụ cả cảnh giới là 4 %), tăng theo bậc nhận", () => {
    for (const id of IDS) {
      const q = QUEST_BY_ID[id];
      const bar = expToNext(5, TIER[id]);
      expect(q.rewards.exp!, `${id}: dưới sàn`).toBeGreaterThanOrEqual(Math.ceil(0.02 * bar));
      expect(q.rewards.exp!, `${id}: quá 3 % thanh`).toBeLessThanOrEqual(Math.floor(0.03 * bar));
    }
    expect(QUEST_BY_ID.lh_linh_ai_sach_nhieu.rewards.exp!).toBeGreaterThan(
      QUEST_BY_ID.lh_phi_qua_ai.rewards.exp!,
    );
  });

  it("thưởng đan có thật và KHÔNG thưởng kinh quyển (sách Hóa Thần chỉ rơi từ quái)", () => {
    for (const id of IDS) {
      const items = QUEST_BY_ID[id].rewards.items ?? [];
      expect(items.length, `${id}: có vật phẩm thưởng`).toBeGreaterThan(0);
      for (const it of items) {
        expect(ITEM_BY_ID[it.itemId], `${id}: ${it.itemId}`).toBeDefined();
        expect(ITEM_BY_ID[it.itemId].type, `${id}: ${it.itemId} không phải sách`).not.toBe("book");
      }
    }
  });

  it("đủ ba nhóm lời thoại, mô tả và lời thoại không chữ Hán, không xưng 'bạn'", () => {
    for (const q of side) {
      for (const g of ["offer", "progress", "complete"] as const)
        expect(q.talk[g].length, `${q.id}: ${g}`).toBeGreaterThan(0);
      expect(CJK.test(q.desc), `${q.id}: desc có chữ Hán`).toBe(false);
      for (const line of [...q.talk.offer, ...q.talk.progress, ...q.talk.complete]) {
        expect(CJK.test(line), `${q.id}: "${line}" có chữ Hán`).toBe(false);
        expect(line.toLowerCase().includes("bạn"), `${q.id}: xưng 'bạn'`).toBe(false);
      }
    }
  });

  it("nguồn: ba dòng `su_kien` (ev.qa_*) + một dòng `du_lieu` (npc.do_thap_tam_nuong) ở docs/NGUON_NOI_DUNG.md mục 3, ghi #1465, KHONG_AP_DUNG", () => {
    const rowsOf = (key: string) =>
      NGUON_DOC.split("\n").filter(
        (r) => r.startsWith("|") && r.includes(`\`${key}\``) && r.includes("#1465"),
      );
    const CASES: [string, string][] = [
      ["ev.qa_phi_qua_ai", "su_kien"],
      ["ev.qa_hang_lau", "su_kien"],
      ["ev.qa_linh_ai_sach_nhieu", "su_kien"],
      ["npc.do_thap_tam_nuong", "du_lieu"],
    ];
    for (const [key, loai] of CASES) {
      const rows = rowsOf(key);
      expect(rows.length, `${key}: số dòng nguồn ghi #1465`).toBe(1);
      const cols = rows[0].split("|").map((c) => c.trim());
      expect([cols[1], cols[5], cols[6]], key).toEqual([loai, "#1465", "KHONG_AP_DUNG"]);
    }
  });
});
