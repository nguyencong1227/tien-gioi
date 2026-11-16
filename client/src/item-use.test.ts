// Nút "dùng" của vật phẩm trong túi (M7.4): đan dược "Dùng", kinh quyển "Học", còn lại không có nút.
import { describe, expect, it } from "vitest";
import {
  ITEM_BY_ID,
  ITEMS,
  REALMS,
  SKILLS_M7,
  STATUSES,
  bookIdOf,
  realmLabel,
  statusEffectFigures,
  type ItemDef,
} from "@tien-gioi/shared";
import {
  bookTeach,
  statusEffectLine,
  useBlockReason,
  useLabelOf,
  type UseContext,
} from "./item-use";

describe("useLabelOf", () => {
  it("kinh quyển -> Học; đan dược -> Dùng; nguyên liệu, trang bị, không có món -> null", () => {
    expect(useLabelOf(ITEM_BY_ID[bookIdOf("hoa_van_kiem")])).toBe("Học");
    expect(useLabelOf(ITEM_BY_ID.hoi_huyet_dan)).toBe("Dùng");
    expect(useLabelOf(ITEM_BY_ID.long_tho)).toBeNull();
    expect(useLabelOf(ITEM_BY_ID.lang_nha_kiem)).toBeNull();
    expect(useLabelOf(undefined)).toBeNull();
  });

  it("MỌI kinh quyển thật có nút Học; MỌI đan dược có nút Dùng; không loại vật phẩm nào khác có nút", () => {
    for (const d of SKILLS_M7) expect(useLabelOf(ITEM_BY_ID[bookIdOf(d.id)]), d.id).toBe("Học");
    for (const it of ITEMS) {
      const label = useLabelOf(it);
      if (it.type === "book") expect(label, it.id).toBe("Học");
      else if (it.effect) expect(label, it.id).toBe("Dùng");
      else expect(label, it.id).toBeNull();
    }
  });

  it("quyển có cả `teaches` lẫn `effect` (dữ liệu hỏng) ưu tiên Học: không thành nút Dùng của đan dược", () => {
    expect(
      useLabelOf({ teaches: "hoa_van_kiem", effect: { kind: "hp", amount: 10 } } as never),
    ).toBe("Học");
  });
});

describe("bookTeach (dòng Dạy ở chi tiết túi)", () => {
  const hoaVan = ITEM_BY_ID[bookIdOf("hoa_van_kiem")];

  it("quyển chiêu cơ bản: Luyện Khí đủ, Phàm Nhân chưa; ghi đúng tên chiêu và cảnh giới cần", () => {
    const skill = SKILLS_M7.find((d) => d.id === "hoa_van_kiem")!;
    const req = realmLabel(skill.reqRealm, skill.reqTier);
    const ok = bookTeach(hoaVan, skill.reqRealm, skill.reqTier);
    expect(ok).toEqual({
      skillName: skill.name,
      ok: true,
      text: `Dạy: ${skill.name} · Đủ cảnh giới (${req})`,
    });
    // một bậc dưới mức cần (nếu reqTier = 0 thì xuống một cảnh giới)
    const [lowRealm, lowTier] =
      skill.reqTier > 0 ? [skill.reqRealm, skill.reqTier - 1] : [skill.reqRealm - 1, 9];
    const low = bookTeach(hoaVan, lowRealm, lowTier);
    expect(low?.ok).toBe(false);
    expect(low?.text).toBe(`Dạy: ${skill.name} · Cần ${req}`);
  });

  it("cảnh giới cao hơn thì đủ bất kể bậc (cùng `skillReqMet` với máy chủ)", () => {
    for (const d of SKILLS_M7) {
      const info = bookTeach(ITEM_BY_ID[bookIdOf(d.id)], d.reqRealm + 1, 0);
      expect(info?.ok, d.id).toBe(true);
      expect(info?.text, d.id).toContain(d.name);
    }
  });

  it("món không phải kinh quyển, không có món, chiêu không tồn tại, cảnh giới lạ: null / chưa đủ, không ném lỗi", () => {
    expect(bookTeach(ITEM_BY_ID.hoi_huyet_dan, 3, 0)).toBeNull();
    expect(bookTeach(ITEM_BY_ID.lang_nha_kiem, 3, 0)).toBeNull();
    expect(bookTeach(undefined, 3, 0)).toBeNull();
    expect(bookTeach({ teaches: "khong_co_chieu_nay" }, 3, 0)).toBeNull();
    expect(bookTeach({ teaches: "constructor" }, 3, 0)).toBeNull();
    expect(bookTeach(hoaVan, Number.NaN, 0)?.ok).toBe(false);
    expect(bookTeach(hoaVan, Number.POSITIVE_INFINITY, 0)?.ok).toBe(false);
  });
});

// ---------- Vật phẩm gắn trạng thái (nghề nhỏ #514, issue #769) ----------

/** Đan thử gắn `dao_ho` (dữ liệu thật chưa có: D làm ở #763), dùng được ở đỉnh Trúc Cơ (realm 2) với đầy tu vi. */
const TRUC_CO = 2;
const lastTier = REALMS[TRUC_CO].tiers.length - 1;
const pill = (over: Partial<{ ratio: number; ms: number; forRealm: number | undefined }> = {}) =>
  ({
    id: "t_dan",
    name: "Đan thử",
    type: "consumable",
    stack: 9,
    rarity: 3,
    desc: "đan thử",
    color: 0xffffff,
    effect: { kind: "status", id: "dao_ho", ratio: 0.15, ms: 900_000, forRealm: TRUC_CO, ...over },
  }) as unknown as ItemDef;
const ctx = (over: Partial<UseContext> = {}): UseContext => ({
  activeIds: new Set<string>(),
  realm: TRUC_CO,
  tier: lastTier,
  exp: 1000,
  expMax: 1000,
  ...over,
});

describe("useBlockReason: nút Dùng của vật phẩm gắn trạng thái", () => {
  it("đủ điều kiện (đỉnh đúng bậc, đầy tu vi, chưa có hiệu lực): không mờ", () => {
    expect(useBlockReason(pill(), ctx())).toBeNull();
  });

  it("cùng id đang có chip: mờ 'Đang còn hiệu lực' (kể cả viên mạnh hơn); id KHÁC thì không", () => {
    expect(useBlockReason(pill(), ctx({ activeIds: new Set(["dao_ho"]) }))).toBe(
      "Đang còn hiệu lực",
    );
    expect(useBlockReason(pill({ ratio: 0.2 }), ctx({ activeIds: new Set(["dao_ho"]) }))).toBe(
      "Đang còn hiệu lực",
    );
    expect(useBlockReason(pill(), ctx({ activeIds: new Set(["haste", "shield"]) }))).toBeNull();
  });

  it("sai bậc: mờ kèm tên cảnh giới cần; chưa đầy tu vi: cùng lý do; chưa ở tầng cuối: cùng lý do", () => {
    const want = `Cần đỉnh ${REALMS[TRUC_CO].name}, đầy tu vi`;
    expect(useBlockReason(pill(), ctx({ realm: TRUC_CO + 1 }))).toBe(want);
    expect(useBlockReason(pill(), ctx({ realm: TRUC_CO - 1 }))).toBe(want);
    expect(useBlockReason(pill(), ctx({ exp: 999 }))).toBe(want);
    expect(useBlockReason(pill(), ctx({ tier: lastTier - 1 }))).toBe(want);
  });

  it("đan KHÔNG có forRealm (phù / đan tăng cường sau này) không kiểm cảnh giới, chỉ kiểm hiệu lực", () => {
    const free = pill({ forRealm: undefined });
    expect(useBlockReason(free, ctx({ realm: 0, tier: 0, exp: 0, expMax: 100 }))).toBeNull();
    expect(useBlockReason(free, ctx({ activeIds: new Set(["dao_ho"]) }))).toBe("Đang còn hiệu lực");
  });

  it("cùng THỨ TỰ với máy chủ: sai bậc được báo trước 'đang còn hiệu lực'", () => {
    expect(useBlockReason(pill(), ctx({ realm: 0, activeIds: new Set(["dao_ho"]) }))).toBe(
      `Cần đỉnh ${REALMS[TRUC_CO].name}, đầy tu vi`,
    );
  });

  it("dữ liệu hỏng không ném lỗi: id lạ / thời gian hỏng -> 'Không dùng được'; forRealm ngoài bảng vẫn có lý do", () => {
    const bad = pill();
    (bad.effect as { id: string }).id = "khong_co";
    expect(useBlockReason(bad, ctx())).toBe("Không dùng được");
    expect(useBlockReason(pill({ ms: Number.NaN }), ctx())).toBe("Không dùng được");
    expect(useBlockReason(pill({ forRealm: 99 }), ctx())).toBe("Cần đỉnh cảnh giới, đầy tu vi");
  });

  it("món khác (đan hồi huyết, nguyên liệu, kinh quyển, không có món) không bao giờ mờ", () => {
    for (const d of [
      ITEM_BY_ID.hoi_huyet_dan,
      ITEM_BY_ID.long_tho,
      ITEM_BY_ID.lang_nha_kiem,
      undefined,
    ])
      expect(useBlockReason(d, ctx({ activeIds: new Set(["dao_ho"]) }))).toBeNull();
    expect(useBlockReason(ITEM_BY_ID[bookIdOf("hoa_van_kiem")], ctx())).toBeNull();
  });
});

describe("statusEffectLine: dòng 'Hiệu lực' ở chi tiết túi", () => {
  it("đan hộ đạo: tác dụng + thời gian, số khớp statusEffectFigures", () => {
    const line = statusEffectLine(pill());
    expect(line).toBe("Hiệu lực: cộng 15% xác suất đột phá lần kế · 15 phút");
    const f = statusEffectFigures({ ratio: 0.15, ms: 900_000 });
    expect(line).toContain(f.pct[0]);
    expect(line).toContain(f.time[f.time.length - 1]);
  });

  it("hiển thị số MÁY CHỦ ÁP DỤNG (đã kẹp theo STATUSES), không phải số thô trong dữ liệu", () => {
    const dao = STATUSES.find((s) => s.id === "dao_ho")!;
    const line = statusEffectLine(pill({ ratio: 9, ms: 99_000_000 }))!;
    expect(line).toContain(`${Math.round(dao.maxRatio * 100)}%`);
    expect(line).toContain(`${dao.maxMs / 60_000} phút`);
    expect(line).not.toContain("900%");
  });

  it("thời gian không chẵn phút in bằng giây; ratio 0 thì không bịa phần trăm", () => {
    expect(statusEffectLine(pill({ ms: 90_000 }))).toContain("90 giây");
    expect(statusEffectLine(pill({ ratio: 0 }))).toBe(
      "Hiệu lực: cộng xác suất đột phá lần kế · 15 phút",
    );
  });

  it("món không gắn trạng thái / hiệu lực hỏng / không có món: không có dòng", () => {
    expect(statusEffectLine(ITEM_BY_ID.hoi_huyet_dan)).toBeNull();
    expect(statusEffectLine(ITEM_BY_ID.long_tho)).toBeNull();
    expect(statusEffectLine(undefined)).toBeNull();
    expect(statusEffectLine(pill({ ms: -1 }))).toBeNull();
  });
});
