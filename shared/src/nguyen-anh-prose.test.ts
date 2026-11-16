// Rà phần CHỮ của nội dung Nguyên Anh (M7.9, #742): mô tả vật phẩm + lời thoại / mô tả nhiệm vụ Hàn Vân.
// Chỉ kiểm chuỗi hiển thị (độ dài, giọng, chữ Hán, xưng hô) và KHÓA SỐ LIỆU cơ chế (chỉ số trang bị, pct đan, giá ô riêng)
// để ai lỡ sửa số là đỏ. KHÔNG kiểm cân bằng (A giữ số); NOT đụng nguồn rơi / quái / chiêu.
// Đột biến đỏ (tự chạy trước khi push, dán vào PR): (1) rút desc dưới ngưỡng; (2) thêm "Bạn" vào lời thoại nhiệm vụ;
// (3) chép trùng desc hai vật phẩm; (4) đổi một chỉ số / pct / giá vật phẩm Nguyên Anh.
import { describe, expect, it } from "vitest";
import { ITEM_BY_ID, QUESTS } from "./index";
import { OWNER_GEAR_VALUE } from "./owner-gear";

/** Phạm vi chữ Hán (CJK): tiếng Việt (Latin có dấu) KHÔNG phải CJK; lời Tiên Giới KHÔNG được có. */
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

/** Xưng hô người chơi: quy ước "đạo hữu" / "ngươi"; KHÔNG được xưng "bạn". */
const CALLS_PLAYER_BAN = (s: string): boolean => s.toLowerCase().includes("bạn");

// ---------- (a) Vật phẩm Nguyên Anh ----------
/** Nguyên liệu Nguyên Anh (M7.5c, #506): mỗi loài Hàn Vân một thứ. */
const NGUYEN_ANH_MATERIALS = [
  "han_lang_mao",
  "phong_nha_vu",
  "tuong_cot",
  "doc_tuoc_nang",
  "thien_han_chau",
];
/** Bộ IV (trang bị Nguyên Anh sơ kỳ): ba ô công khai (items.ts) + hai ô riêng (owner-gear.ts). */
const NGUYEN_ANH_GEAR = [
  "han_vu_kiem",
  "han_lang_bao",
  "phong_nha_phu",
  "tuyet_hanh_ngoa",
  "han_tinh_boi",
];
/** Đan cấp 3 (Nguyên Anh): gọn theo thói quen mọi đan hồi (40/50/70/90 %), giữ nguyên — khoá chính xác dưới. */
const NGUYEN_ANH_PILLS = ["thuong_hoi_huyet_dan", "thuong_hoi_linh_dan"];

/** Mô tả nguyên liệu / trang bị phải là một câu flavor đủ dài, không cụt, không siêu dài. */
const MIN_DESC = 25;
const MAX_DESC = 170;

/**
 * Số liệu cơ chế cố định của vật phẩm Nguyên Anh — chốt chặn "không đổi số": id / độ hiếm / chỉ số trang bị / pct đan /
 * giá ô riêng. CHỈ số cơ chế; chữ (desc) do phần mô tả kiểm. Ai lỡ sửa số ở items.ts / owner-gear.ts thì test này đỏ.
 */
const NGUYEN_ANH_NUMBERS: Record<
  string,
  { rarity: number; equip?: Record<string, number>; healPct?: number; value?: number }
> = {
  // Bộ IV: thần phẩm (4),reqRealm 4 — chỉ số ghi ở đây khớp items.ts / owner-gear.ts
  han_vu_kiem: { rarity: 4, equip: { atk: 56 } },
  han_lang_bao: { rarity: 4, equip: { hp: 650 } },
  phong_nha_phu: { rarity: 4, equip: { mp: 170, speed: 28 } },
  tuyet_hanh_ngoa: { rarity: 4, equip: { speed: 24, guard: 6 }, value: 12000 },
  han_tinh_boi: { rarity: 4, equip: { hp: 400, mp: 125, cdr: 6 }, value: 12000 },
  // Đan cấp 3: tiên phẩm (3), pct hồi 90 %
  thuong_hoi_huyet_dan: { rarity: 3, healPct: 0.9 },
  thuong_hoi_linh_dan: { rarity: 3, healPct: 0.9 },
  // Nguyên liệu: linh/bảo phẩm (2), trừ Thiên Hàn châu (thần phẩm 4, rơi trùm)
  han_lang_mao: { rarity: 2 },
  phong_nha_vu: { rarity: 2 },
  tuong_cot: { rarity: 2 },
  doc_tuoc_nang: { rarity: 2 },
  thien_han_chau: { rarity: 4 },
};

describe("mô tả vật phẩm Nguyên Anh (M7.9, #742)", () => {
  it("nguyên liệu + trang bị Nguyên Anh: mô tả đủ dài, không CJK, không xưng 'bạn'", () => {
    for (const id of [...NGUYEN_ANH_MATERIALS, ...NGUYEN_ANH_GEAR]) {
      const it = ITEM_BY_ID[id];
      expect(it, id).toBeDefined();
      const d = it!.desc;
      expect(d.length, `${id}: mô tả quá ngắn`).toBeGreaterThanOrEqual(MIN_DESC);
      expect(d.length, `${id}: mô tả quá dài`).toBeLessThanOrEqual(MAX_DESC);
      expect(CJK.test(d), `${id}: chữ Hán`).toBe(false);
      expect(CALLS_PLAYER_BAN(d), `${id}: xưng 'bạn'`).toBe(false);
    }
  });

  it("đan cấp 3 giữ mô tả gọn, khớp chính xác (khoá số 90 %)", () => {
    expect(ITEM_BY_ID["thuong_hoi_huyet_dan"]!.desc).toBe("Hồi 90% khí huyết.");
    expect(ITEM_BY_ID["thuong_hoi_linh_dan"]!.desc).toBe("Hồi 90% linh lực.");
  });

  it("không có hai vật phẩm Nguyên Anh nào trùng mô tả", () => {
    const ids = [...NGUYEN_ANH_MATERIALS, ...NGUYEN_ANH_GEAR, ...NGUYEN_ANH_PILLS];
    const descs = ids.map((id) => ITEM_BY_ID[id]!.desc);
    expect(new Set(descs).size, `có ${descs.length - new Set(descs).size} cặp mô tả trùng`).toBe(
      descs.length,
    );
  });
});

describe("số liệu vật phẩm Nguyên Anh KHÔNG đổi (M7.9, #742)", () => {
  it("độ hiếm / chỉ số trang bị / pct đan / giá ô riêng khớp danh sách cố định", () => {
    for (const [id, want] of Object.entries(NGUYEN_ANH_NUMBERS)) {
      const it = ITEM_BY_ID[id];
      expect(it, id).toBeDefined();
      expect(it!.rarity, `${id}: độ hiếm`).toBe(want.rarity);
      if (want.equip) {
        const stats = (it!.equip?.stats ?? {}) as Record<string, number | undefined>;
        for (const [k, v] of Object.entries(want.equip))
          expect(stats[k], `${id}: chỉ số ${k}`).toBe(v);
      }
      if (want.healPct !== undefined) {
        expect(it!.effect?.kind, `${id}: kind`).toMatch(/heal/);
        expect(it!.effect?.pct, `${id}: pct hồi`).toBe(want.healPct);
      }
      if (want.value !== undefined) expect(OWNER_GEAR_VALUE[id], `${id}: giá bán`).toBe(want.value);
    }
  });
});

describe("lời thoại / mô tả nhiệm vụ KHÔNG xưng 'bạn', không chữ Hán (M7.9, #742)", () => {
  it("mọi nhiệm vụ: desc + đủ ba nhóm lời thoại không xưng 'bạn'", () => {
    for (const q of QUESTS) {
      const lines = [...q.talk.offer, ...q.talk.progress, ...q.talk.complete, q.desc];
      for (const line of lines)
        expect(CALLS_PLAYER_BAN(line), `${q.id}: "${line}" xưng 'bạn'`).toBe(false);
    }
  });

  it("mọi nhiệm vụ: desc + đủ ba nhóm lời thoại không chứa chữ Hán (CJK)", () => {
    for (const q of QUESTS) {
      expect(CJK.test(q.desc), `${q.id}: desc chữ Hán`).toBe(false);
      for (const group of [q.talk.offer, q.talk.progress, q.talk.complete])
        for (const line of group) expect(CJK.test(line), `${q.id}: "${line}" chữ Hán`).toBe(false);
    }
  });
});
