import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_GROUPS,
  SOCIAL_ACH_MAX,
  SOCIAL_COUNTER_CAP,
  SOCIAL_COUNTER_KEYS_MAX,
  TITLES,
  sampleAchievements,
  type AchievementDef,
  type AchievementsMsg,
  type TitleDef,
} from "@tien-gioi/shared";
import {
  AskGate,
  achievementsView,
  fmtAchDate,
  progressText,
  sanitizeAchievementNewMsg,
  sanitizeAchievementsMsg,
  titleUnlockToast,
  unlockedTitleIds,
} from "./achievement-view";

const empty = (): AchievementsMsg => ({ ach: {}, counters: {}, title: null });

describe("sanitizeAchievementsMsg", () => {
  it("tin mẫu hợp lệ qua nguyên vẹn", () => {
    const m = sampleAchievements();
    expect(sanitizeAchievementsMsg(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });

  it("sai kiểu -> null", () => {
    for (const bad of [null, undefined, 3, "x", [], true])
      expect(sanitizeAchievementsMsg(bad)).toBeNull();
  });

  it("thiếu ach / counters / title: về rỗng, không sập", () => {
    expect(sanitizeAchievementsMsg({})).toEqual(empty());
    expect(sanitizeAchievementsMsg({ ach: 5, counters: [], title: 7 })).toEqual(empty());
  });

  it("khoá thành tựu lạ (__proto__, hoa, ký tự lạ, quá dài) và giá trị không phải chuỗi bị bỏ; không bao giờ đổi prototype", () => {
    const m = sanitizeAchievementsMsg(
      JSON.parse(
        '{"ach":{"__proto__":"x","kiep_2":"2026-11-17T08:00:00.000Z","Kiep":"x","a b":"x","ok_1":5,"' +
          "z".repeat(60) +
          '":"x","hop_le":"y"},"counters":{},"title":null}',
      ),
    )!;
    expect(Object.keys(m.ach).sort()).toEqual(["hop_le", "kiep_2"]);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(Object.getPrototypeOf(m.ach)).toBe(Object.prototype);
  });

  it("thời điểm quá dài bị cắt về 40 ký tự", () => {
    const m = sanitizeAchievementsMsg({ ach: { a1: "x".repeat(200) } })!;
    expect(m.ach.a1).toHaveLength(40);
  });

  it("bộ đếm: khoá hợp lệ theo họ giữ, lạ bị bỏ; số kẹp [0, cận], lẻ làm tròn xuống, không hữu hạn / không phải số bị bỏ", () => {
    const m = sanitizeAchievementsMsg(
      JSON.parse(
        '{"counters":{"kiep":2.9,"pk_won":-5,"boss:mang":99999999999,"__proto__":3,"khong_co":4,"map:am_suong":1,"pk_lost":"3","craft:x":null}}',
      ),
    )!;
    expect(m.counters).toEqual({
      kiep: 2,
      pk_won: 0,
      "boss:mang": SOCIAL_COUNTER_CAP,
      "map:am_suong": 1,
    });
  });

  it("cắt theo trần số thành tựu / bộ đếm của hợp đồng", () => {
    const ach: Record<string, string> = {};
    for (let i = 0; i < SOCIAL_ACH_MAX + 50; i++) ach[`a${i}`] = "x";
    const counters: Record<string, number> = {};
    for (let i = 0; i < SOCIAL_COUNTER_KEYS_MAX + 50; i++) counters[`boss:b${i}`] = 1;
    const m = sanitizeAchievementsMsg({ ach, counters })!;
    expect(Object.keys(m.ach)).toHaveLength(SOCIAL_ACH_MAX);
    expect(Object.keys(m.counters)).toHaveLength(SOCIAL_COUNTER_KEYS_MAX);
  });

  it("title: id đúng văn phạm giữ; sai (dài, hoa, không phải chuỗi) -> null", () => {
    expect(sanitizeAchievementsMsg({ title: "lh2" })!.title).toBe("lh2");
    for (const bad of ["lh2xx", "LH2", "", "__proto__", 5, {}])
      expect(sanitizeAchievementsMsg({ title: bad })!.title).toBeNull();
  });
});

describe("sanitizeAchievementNewMsg", () => {
  it("id hợp lệ giữ; lạ / sai kiểu -> null", () => {
    expect(sanitizeAchievementNewMsg({ id: "kiep_2" })).toEqual({ id: "kiep_2" });
    for (const bad of [
      null,
      undefined,
      3,
      "kiep_2",
      {},
      { id: 5 },
      { id: "__proto__" },
      { id: "Kiep" },
      { id: "" },
    ])
      expect(sanitizeAchievementNewMsg(bad)).toBeNull();
  });
});

describe("unlockedTitleIds", () => {
  it("danh hiệu thưởng của thành tựu ĐÃ đạt (và còn có thật); chưa đạt / lạ thì không", () => {
    expect([...unlockedTitleIds({ kiep_2: "x" })]).toEqual(["lh2"]);
    expect([...unlockedTitleIds({})]).toEqual([]);
    expect([...unlockedTitleIds({ khong_co_thanh_tuu: "x", constructor: "x" })]).toEqual([]);
    const defs: AchievementDef[] = [
      {
        id: "a1",
        name: "A",
        desc: "d",
        group: "pk",
        cond: { counter: "pk_won", atLeast: 1 },
        reward: { titleId: "zz1" },
      },
    ];
    expect([...unlockedTitleIds({ a1: "x" }, defs, [])]).toEqual([]); // danh hiệu thưởng không còn trong TITLES
  });
});

describe("fmtAchDate", () => {
  it("ISO hợp lệ ra ngày vi-VN; không hợp lệ / không phải chuỗi -> rỗng", () => {
    expect(fmtAchDate("2026-11-17T08:00:00.000Z")).toMatch(/^\d{1,2}\/\d{1,2}\/2026$/);
    for (const bad of ["", "khong phai ngay", null, undefined, 5]) expect(fmtAchDate(bad)).toBe("");
  });
});

describe("progressText", () => {
  const def = (counter: string, atLeast: number): AchievementDef => ({
    id: "t",
    name: "T",
    desc: "d",
    group: "pk",
    cond: { counter, atLeast },
  });
  it("có / cần, kẹp ở cần; âm về 0", () => {
    expect(progressText(def("pk_won", 10), 6)).toBe("6 / 10");
    expect(progressText(def("pk_won", 10), 99)).toBe("10 / 10");
    expect(progressText(def("pk_won", 10), -4)).toBe("0 / 10");
    expect(progressText(def("pk_won", 1000), 1500)).toBe("1.000 / 1.000");
  });
  it("kiếp, cảnh giới (đổi bậc ra tên), bản đồ", () => {
    expect(progressText(def("kiep", 5), 2)).toBe("Kiếp 2 / 5");
    const rs = progressText(def("realm_step", 20), 12);
    expect(rs).not.toMatch(/\d/); // tên cảnh giới, không phải số bậc thô
    expect(rs).toContain(" / ");
    expect(progressText(def("map:am_suong", 1), 0)).toBe("Chưa đến");
    expect(progressText(def("map:am_suong", 1), 1)).toBe("Đã đến");
  });
});

describe("achievementsView (dữ liệu mẫu của shared)", () => {
  const v = achievementsView(sampleAchievements());

  it("nhóm theo thứ tự ACHIEVEMENT_GROUPS, bỏ nhóm rỗng; tổng khớp dữ liệu", () => {
    const order = ACHIEVEMENT_GROUPS.filter((g) => ACHIEVEMENTS.some((a) => a.group === g));
    expect(v.groups.map((g) => g.id)).toEqual(order);
    expect(v.total).toBe(ACHIEVEMENTS.length);
    expect(v.groups.reduce((s, g) => s + g.total, 0)).toBe(ACHIEVEMENTS.length);
    expect(v.done).toBe(1);
    expect(v.summary).toBe(`Đã đạt 1 / ${ACHIEVEMENTS.length} thành tựu.`);
  });

  it("mục đã đạt: Hoàn thành, 100%, có ngày; mục dở: có / cần, % theo tiến độ, chưa có ngày", () => {
    const items = v.groups.flatMap((g) => g.items);
    const done = items.find((i) => i.id === "kiep_2")!;
    expect(done).toMatchObject({ done: true, progress: "Hoàn thành", pct: 100 });
    expect(done.at).toMatch(/\d/);
    const doing = items.find((i) => i.id === "pk_thang_10")!;
    expect(doing).toMatchObject({ done: false, progress: "6 / 10", pct: 60, at: "" });
    const zero = items.find((i) => i.id === "trum_mang_1")!;
    expect(zero).toMatchObject({ done: false, pct: 0, progress: "0 / 1" });
  });

  it("thưởng ghi danh hiệu + Duyên bằng chữ, không lộ id", () => {
    const items = v.groups.flatMap((g) => g.items);
    expect(items.find((i) => i.id === "kiep_2")!.reward).toBe(
      "Thưởng: danh hiệu Tái Sinh, +2 Duyên",
    );
    expect(items.find((i) => i.id === "trum_mang_1")!.reward).toBe(
      "Thưởng: danh hiệu Thợ Săn Trùm",
    );
    for (const i of items) expect(i.reward).not.toMatch(/\b(lh2|tr1|pk10|kp1)\b/);
  });

  it("danh hiệu: bốn danh hiệu, chỉ cái đã mở có thể đeo, cái đang đeo được đánh dấu, cái khóa nói cách mở", () => {
    expect(v.titles.map((t) => t.id)).toEqual(TITLES.map((t) => t.id));
    const lh2 = v.titles.find((t) => t.id === "lh2")!;
    expect(lh2).toMatchObject({ unlocked: true, worn: true, hint: "" });
    const tr1 = v.titles.find((t) => t.id === "tr1")!;
    expect(tr1.unlocked).toBe(false);
    expect(tr1.worn).toBe(false);
    expect(tr1.hint).toBe("Mở bằng thành tựu: Hạ Xích Mãng");
    expect(v.worn).toBe("lh2");
    expect(v.wornText).toBe("Danh hiệu đang đeo: Tái Sinh");
  });

  it("đang đeo danh hiệu CHƯA mở / không có thật (dữ liệu hỏng): coi như không đeo", () => {
    for (const title of ["tr1", "zzzz", "toString"]) {
      const m = { ...sampleAchievements(), title };
      const x = achievementsView(m);
      expect(x.worn).toBeNull();
      expect(x.wornText).toBe("Chưa đeo danh hiệu.");
      expect(x.titles.some((t) => t.worn)).toBe(false);
    }
  });

  it("đánh dấu Mới chỉ cho thành tựu ĐÃ đạt và có trong newIds", () => {
    const m = sampleAchievements();
    const x = achievementsView(m, new Set(["kiep_2", "pk_thang_10", "khong_co"]));
    const items = x.groups.flatMap((g) => g.items);
    expect(items.filter((i) => i.isNew).map((i) => i.id)).toEqual(["kiep_2"]);
  });

  it("sổ rỗng: 0 đạt, mọi mục 0%, không đeo gì; bộ đếm thiếu không sập", () => {
    const x = achievementsView(empty());
    expect(x.done).toBe(0);
    expect(x.groups.flatMap((g) => g.items).every((i) => !i.done && i.pct === 0)).toBe(true);
    expect(x.worn).toBeNull();
    expect(() => achievementsView({} as AchievementsMsg)).not.toThrow();
  });

  it("thành tựu có danh hiệu thưởng KHÔNG còn trong TITLES: không lộ id, danh hiệu đó không hiện", () => {
    const defs: AchievementDef[] = [
      {
        id: "a1",
        name: "A",
        desc: "d",
        group: "pk",
        cond: { counter: "pk_won", atLeast: 1 },
        reward: { titleId: "zz9", duyen: 1 },
      },
    ];
    const titles: TitleDef[] = [];
    const x = achievementsView(
      { ach: { a1: "2026-11-17T00:00:00.000Z" }, counters: {}, title: "zz9" },
      new Set(),
      defs,
      titles,
    );
    expect(x.groups[0].items[0].reward).toBe("Thưởng: +1 Duyên");
    expect(x.titles).toEqual([]);
    expect(x.worn).toBeNull();
  });

  it("nhóm: đếm đạt / tổng đúng từng nhóm", () => {
    const g = v.groups.find((g) => g.id === "luan_hoi")!;
    expect(g).toMatchObject({ done: 1, total: 1, label: "Luân hồi" });
  });
});

describe("titleUnlockToast", () => {
  it("thành tựu có danh hiệu thưởng ra câu mời đeo; không thưởng danh hiệu / lạ -> null", () => {
    expect(titleUnlockToast("kiep_2")).toBe("Mở danh hiệu Tái Sinh: mở bảng Xã hội để đeo.");
    for (const bad of ["khong_co", "", "constructor", "__proto__"])
      expect(titleUnlockToast(bad)).toBeNull();
  });
});

describe("AskGate", () => {
  it("đã có dữ liệu: không xin lại trong 20 s; hết 20 s hoặc `force` thì xin", () => {
    const g = new AskGate();
    expect(g.tryAsk(1000, true)).toBe(true);
    expect(g.tryAsk(1000 + 19_999, true)).toBe(false);
    expect(g.tryAsk(1000 + 20_000, true)).toBe(true);
    expect(g.tryAsk(1000 + 20_001, true, true)).toBe(true);
  });

  it("chưa có dữ liệu: luôn được xin lại (không chặn người chơi thử lại)", () => {
    const g = new AskGate();
    expect(g.tryAsk(0, false)).toBe(true);
    expect(g.tryAsk(100, false)).toBe(true);
  });

  it("im lặng: chỉ khi CHƯA có dữ liệu và đã xin quá 6 s (biên)", () => {
    const g = new AskGate();
    expect(g.stale(0, false)).toBe(false); // chưa xin lần nào
    g.tryAsk(1000, false);
    expect(g.stale(1000 + 5_999, false)).toBe(false);
    expect(g.stale(1000 + 6_000, false)).toBe(true);
    expect(g.stale(1000 + 60_000, true)).toBe(false); // có dữ liệu thì không im
  });
});
