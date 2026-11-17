// `Soul.social` (M9.1 #1020): văn phạm khoá, đọc file KHÔNG tin, bộ đếm hai chế độ, cấp thành tựu idempotent, ghi PK một nguồn, tích hợp `sanitizeSoul`.
import { describe, expect, it } from "vitest";
import { newSoul, sanitizeSoul } from "./reincarnation";
import {
  SOCIAL_ACH_MAX,
  SOCIAL_COUNTER_CAP,
  SOCIAL_COUNTER_KEYS_MAX,
  SOCIAL_PK_CAP,
  newSocial,
  sanitizeSocial,
  socialCounterMode,
  socialCounterOf,
  socialGrant,
  socialPkRecord,
  socialTrack,
} from "./social-soul";

describe("socialCounterMode: văn phạm khoá", () => {
  it("khoá cố định và họ có đuôi hợp lệ; chế độ đúng", () => {
    expect(socialCounterMode("kiep")).toBe("max");
    expect(socialCounterMode("realm_step")).toBe("max");
    expect(socialCounterMode("pk_won")).toBe("add");
    expect(socialCounterMode("boss:mang")).toBe("add");
    expect(socialCounterMode("craft:luyen_dan")).toBe("add");
    expect(socialCounterMode("map:am_suong")).toBe("max");
  });

  it("khoá lạ / sai văn phạm / tên của Object.prototype / kiểu sai đều null", () => {
    for (const bad of [
      "",
      "Kiep",
      "kiep:",
      ":x",
      "boss:",
      "boss:a:b",
      "xyz",
      "xyz:abc",
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
      "boss:__proto__x".replace("x", "") + "!",
      "a".repeat(49),
      5,
      null,
      undefined,
      {},
      [],
    ])
      expect(socialCounterMode(bad), String(bad)).toBeNull();
    expect(socialCounterMode("boss:_x")).toBeNull(); // đuôi cũng phải bắt đầu bằng chữ / số
    expect(socialCounterMode("boss:__proto__")).toBeNull();
    // `boss:constructor` là khoá hợp lệ về văn phạm (đuôi là id) và là THUỘC TÍNH RIÊNG khi lưu, không đụng prototype
    expect(socialCounterMode("boss:constructor")).toBe("add");
  });
});

describe("sanitizeSocial: không tin file lưu", () => {
  it("không phải object -> undefined (file chân linh cũ giữ nguyên)", () => {
    for (const bad of [null, undefined, 5, "x", [], true])
      expect(sanitizeSocial(bad)).toBeUndefined();
  });

  it("object rỗng -> mặc định hợp lệ; số kẹp, khoá lạ bị bỏ, danh hiệu sai -> null", () => {
    expect(sanitizeSocial({})).toEqual(newSocial());
    const s = sanitizeSocial({
      pk: { won: -5, lost: 9e99 },
      counters: {
        kiep: 3.9,
        "boss:mang": -2,
        xyz: 5,
        "map:am_suong": "7",
        pk_won: Number.NaN,
        craft: 1,
      },
      ach: { kiep_2: "2026-11-17T00:00:00Z", "Bad Id": "x", ok: 5 },
      title: "TOO-LONG",
    })!;
    expect(s.pk).toEqual({ won: 0, lost: SOCIAL_PK_CAP });
    expect(s.counters).toEqual({ kiep: 3, "boss:mang": 0 }); // giá trị không phải số hữu hạn (chuỗi "7", NaN) bỏ cả khoá
    expect(s.ach).toEqual({ kiep_2: "2026-11-17T00:00:00Z" });
    expect(s.title).toBeNull();
    expect(sanitizeSocial({ title: "lh2" })!.title).toBe("lh2");
  });

  it("khoá __proto__ từ JSON (thuộc tính riêng) bị bỏ; counters là mảng / chuỗi bị bỏ; đọc bằng socialCounterOf chỉ thuộc tính riêng", () => {
    const raw = JSON.parse('{"counters": {"__proto__": 5, "kiep": 2}, "ach": {"__proto__": "x"}}');
    const s = sanitizeSocial(raw)!;
    expect(Object.keys(s.counters)).toEqual(["kiep"]);
    expect(Object.keys(s.ach)).toEqual([]);
    expect(Object.getPrototypeOf(s.counters)).toBe(Object.prototype);
    expect(sanitizeSocial({ counters: [1, 2], ach: "x" })!.counters).toEqual({});
    expect(socialCounterOf(s, "constructor")).toBe(0);
    expect(socialCounterOf(s, "toString")).toBe(0);
    expect(socialCounterOf(s, "kiep")).toBe(2);
    expect(socialCounterOf(undefined, "kiep")).toBe(0);
  });

  it("số khoá / thành tựu bị chặn trên (file sửa tay phình to)", () => {
    const counters: Record<string, number> = {};
    for (let i = 0; i < SOCIAL_COUNTER_KEYS_MAX + 40; i++) counters[`boss:b${i}`] = 1;
    const ach: Record<string, string> = {};
    for (let i = 0; i < SOCIAL_ACH_MAX + 40; i++) ach[`a${i}`] = "t";
    const s = sanitizeSocial({ counters, ach })!;
    expect(Object.keys(s.counters).length).toBe(SOCIAL_COUNTER_KEYS_MAX);
    expect(Object.keys(s.ach).length).toBe(SOCIAL_ACH_MAX);
  });
});

describe("socialTrack: bộ đếm hai chế độ, thuần", () => {
  it("add cộng dồn phần nguyên; max chỉ tăng; không sửa đối số", () => {
    const a = newSocial();
    const r1 = socialTrack(a, "boss:mang", 2.9);
    expect(r1.changed).toBe(true);
    expect(r1.social.counters["boss:mang"]).toBe(2);
    expect(a.counters).toEqual({}); // đối số không đổi
    const r2 = socialTrack(r1.social, "boss:mang", 3);
    expect(r2.social.counters["boss:mang"]).toBe(5);
    const m1 = socialTrack(r2.social, "kiep", 4);
    expect(m1.social.counters.kiep).toBe(4);
    const m2 = socialTrack(m1.social, "kiep", 2); // thấp hơn: không giảm, không đổi
    expect(m2.changed).toBe(false);
    expect(m2.social).toBe(m1.social);
    expect(socialTrack(m1.social, "kiep", 9).social.counters.kiep).toBe(9);
  });

  it("khoá lạ, giá trị < 1 / không hữu hạn / sai kiểu: không đổi, trả đúng đối tượng cũ", () => {
    const a = newSocial();
    for (const [k, v] of [
      ["xyz", 1],
      ["boss:mang", 0],
      ["boss:mang", 0.9],
      ["boss:mang", -3],
      ["boss:mang", Number.NaN],
      ["boss:mang", Number.POSITIVE_INFINITY],
      ["boss:mang", "5"],
      ["__proto__", 1],
      [5, 1],
    ] as const) {
      const r = socialTrack(a, k, v);
      expect(r.changed, `${String(k)} ${String(v)}`).toBe(false);
      expect(r.social).toBe(a);
    }
  });

  it("kẹp SOCIAL_COUNTER_CAP; chặn số khoá mới nhưng khoá đã có vẫn tăng", () => {
    let s = newSocial();
    s = socialTrack(s, "boss:mang", SOCIAL_COUNTER_CAP + 5).social;
    expect(s.counters["boss:mang"]).toBe(SOCIAL_COUNTER_CAP);
    expect(socialTrack(s, "boss:mang", 1).changed).toBe(false); // đã chạm trần
    const full = newSocial();
    for (let i = 0; i < SOCIAL_COUNTER_KEYS_MAX; i++) full.counters[`boss:b${i}`] = 1;
    expect(socialTrack(full, "boss:moi", 1).changed).toBe(false);
    expect(socialTrack(full, "boss:b3", 1).social.counters["boss:b3"]).toBe(2);
  });

  it("linh hồn chưa có social (undefined): tạo mới", () => {
    expect(socialTrack(undefined, "pk_won", 1).social.counters.pk_won).toBe(1);
  });
});

describe("socialGrant: idempotent", () => {
  it("lần đầu ghi, lần sau trả lại đúng đối tượng cũ và giữ thời điểm đầu; id sai không ghi", () => {
    const a = newSocial();
    const g1 = socialGrant(a, "kiep_2", "2026-11-17T01:00:00Z");
    expect(g1.granted).toBe(true);
    expect(g1.social.ach).toEqual({ kiep_2: "2026-11-17T01:00:00Z" });
    expect(a.ach).toEqual({});
    const g2 = socialGrant(g1.social, "kiep_2", "2099-01-01T00:00:00Z");
    expect(g2.granted).toBe(false);
    expect(g2.social).toBe(g1.social);
    for (const bad of ["", "Bad Id", "__proto__", "a:b", 5, null]) {
      const r = socialGrant(g1.social, bad, "t");
      expect(r.granted, String(bad)).toBe(false);
      expect(r.social).toBe(g1.social);
    }
  });

  it("quá SOCIAL_ACH_MAX thì không ghi thêm", () => {
    const s = newSocial();
    for (let i = 0; i < SOCIAL_ACH_MAX; i++) s.ach[`a${i}`] = "t";
    expect(socialGrant(s, "moi", "t").granted).toBe(false);
  });
});

describe("socialPkRecord: một nguồn cho pk và bộ đếm", () => {
  it("thắng / thua cộng đúng phía VÀ bộ đếm tương ứng; kẹp SOCIAL_PK_CAP", () => {
    let s = socialPkRecord(undefined, "won");
    s = socialPkRecord(s, "won");
    s = socialPkRecord(s, "lost");
    expect(s.pk).toEqual({ won: 2, lost: 1 });
    expect(s.counters).toMatchObject({ pk_won: 2, pk_lost: 1 });
    const cap = { ...newSocial(), pk: { won: SOCIAL_PK_CAP, lost: 0 } };
    expect(socialPkRecord(cap, "won").pk.won).toBe(SOCIAL_PK_CAP);
  });
});

describe("sanitizeSoul + Soul.social", () => {
  it("file chân linh cũ (không có social) đọc ra không có trường social; có social thì được làm sạch và đi vòng JSON nguyên vẹn", () => {
    const old = sanitizeSoul(JSON.parse(JSON.stringify(newSoul("han", "t"))), "t")!;
    expect("social" in old).toBe(false);
    const withSocial = {
      ...newSoul("han", "t"),
      social: { ...newSocial(), title: "lh2", counters: { kiep: 3 } },
    };
    const back = sanitizeSoul(JSON.parse(JSON.stringify(withSocial)), "t")!;
    expect(back.social).toEqual(withSocial.social);
    const dirty = sanitizeSoul(
      { ...newSoul("han", "t"), social: { counters: { xyz: 1, kiep: -9 }, title: 7 } },
      "t",
    )!;
    expect(dirty.social).toEqual({ ...newSocial(), counters: { kiep: 0 } });
  });
});
