// Sách chiêu phải rơi từ quái HỢP cảnh giới (AGENTS.md mục "Chiêu thức", PHAN_CONG_CHIEU_THUC.md mục 8).
// Lý do có test này: #1390 cho chiêu Kim Đan (`reqRealm` 3) rơi từ Xích Mãng (trùm Trúc Cơ) mà A, B, C đều duyệt nhầm theo nhãn "Trúc Cơ" trong mô tả PR;
// `books.test.ts` chỉ kiểm quyển KIẾM ĐƯỢC, không kiểm quái rơi có đúng bậc. Chỉ số `reqRealm`: 0 Phàm Nhân, 1 Luyện Khí, 2 Trúc Cơ, 3 Kim Đan, 4 Nguyên Anh.
// Bảng bậc quái `MONSTER_REALM` nay ở `shared/src/monster-realm.ts` (dùng chung với `so-tay-quai`, #1420).
import { describe, expect, it } from "vitest";
import {
  DROP_TABLES,
  ITEM_BY_ID,
  LEARNABLE_SKILLS,
  MONSTER_BY_ID,
  MONSTER_REALM,
  bookIdOf,
} from "./index";

/**
 * Danh sách tồn đọng: chiêu `rarity >= 2` mà MỌI nơi rơi đều thấp hơn `reqRealm` hoặc cao hơn hai bậc. Hiện RỖNG: `hac_sa_doc_chuong` và `thiem_to_cong` (Trúc Cơ, trước chỉ rơi
 * từ Độc Tước Nguyên Anh) đã có nơi rơi cùng bậc ở Xích Mãng. KHÔNG thêm id vào đây: chiêu mới phải có ít nhất một nơi rơi cùng bậc (hoặc hơn đúng một bậc).
 */
const LOW_REALM_ONLY_FROM_HIGHER: readonly string[] = [];

/** Mọi (quái, chiêu) có sách chiêu trong bảng rơi. */
function bookDrops(): { monster: string; skillId: string; reqRealm: number; rarity: number }[] {
  const skillByBook = new Map(LEARNABLE_SKILLS.map((s) => [bookIdOf(s.id), s]));
  const out: { monster: string; skillId: string; reqRealm: number; rarity: number }[] = [];
  for (const [monster, table] of Object.entries(DROP_TABLES)) {
    for (const e of table) {
      const s = skillByBook.get(e.itemId);
      if (s) out.push({ monster, skillId: s.id, reqRealm: s.reqRealm, rarity: s.rarity });
    }
  }
  return out;
}

describe("sách chiêu rơi từ quái HỢP cảnh giới", () => {
  it("bảng MONSTER_REALM chỉ chứa quái có thật, và MỌI quái có rơi sách chiêu đều có dòng (quái mới rơi sách phải khai bậc)", () => {
    for (const m of Object.keys(MONSTER_REALM)) expect(MONSTER_BY_ID[m], m).toBeDefined();
    for (const { monster } of bookDrops())
      expect(
        MONSTER_REALM[monster],
        `${monster} rơi sách chiêu nhưng chưa khai bậc ở MONSTER_REALM`,
      ).toBeDefined();
  });

  it("KHÔNG quái nào rơi sách chiêu yêu cầu cảnh giới CAO HƠN bậc của quái (vd chiêu Kim Đan rơi từ trùm Trúc Cơ)", () => {
    for (const d of bookDrops())
      expect(
        d.reqRealm,
        `${d.monster} (bậc ${MONSTER_REALM[d.monster]}) rơi ${d.skillId} yêu cầu cảnh giới ${d.reqRealm}: đổi sang quái đủ bậc`,
      ).toBeLessThanOrEqual(MONSTER_REALM[d.monster]);
  });

  it("chiêu độ hiếm >= 2 có ít nhất một nơi rơi cùng bậc hoặc hơn đúng một bậc (không chỉ rơi từ quái cao hơn nhiều bậc), trừ danh sách tồn đọng", () => {
    const drops = bookDrops();
    for (const s of LEARNABLE_SKILLS.filter((x) => x.rarity >= 2)) {
      const near = drops.some(
        (d) =>
          d.skillId === s.id &&
          MONSTER_REALM[d.monster] >= s.reqRealm &&
          MONSTER_REALM[d.monster] <= s.reqRealm + 1,
      );
      if (LOW_REALM_ONLY_FROM_HIGHER.includes(s.id))
        expect(near, `${s.id} đã có nơi rơi cùng bậc: xoá khỏi LOW_REALM_ONLY_FROM_HIGHER`).toBe(
          false,
        );
      else
        expect(
          near,
          `${s.id} (reqRealm ${s.reqRealm}) chưa có quái cùng bậc (hoặc hơn một bậc) rơi`,
        ).toBe(true);
    }
  });

  it("danh sách tồn đọng chỉ chứa chiêu có thật (rarity >= 2) đang có nơi rơi", () => {
    for (const id of LOW_REALM_ONLY_FROM_HIGHER) {
      const s = LEARNABLE_SKILLS.find((x) => x.id === id);
      expect(s, id).toBeDefined();
      expect(s!.rarity, id).toBeGreaterThanOrEqual(2);
      expect(ITEM_BY_ID[bookIdOf(id)], id).toBeDefined();
    }
  });
});
