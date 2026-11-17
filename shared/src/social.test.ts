// Hợp đồng M9 (M9.1 #1020): bảng xếp hạng, trùm thế giới theo giờ, thành tựu + danh hiệu, hàm mẫu.
import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_BY_ID,
  ACHIEVEMENT_DUYEN_MAX,
  ACHIEVEMENT_DUYEN_TOTAL_MAX,
  BOARD_COLUMNS,
  BOARD_IDS,
  BOARD_SIZE,
  TITLES,
  TITLE_BY_ID,
  WORLD_BOSS_MIN_SHARE_PCT,
  WORLD_BOSS_SCHEDULE,
  WORLD_BOSS_SUPPORT_CAP_PCT,
  WORLD_BOSS_TZ_OFFSET_MS,
  achievementProgress,
  achievementOf,
  achievementViolations,
  achievementsDue,
  compareBoardRows,
  newSocial,
  parseBoardsGet,
  parseTitleSet,
  rankBoard,
  sampleAchievements,
  sampleBoards,
  sampleWorldBossEvent,
  sampleWorldBossSchedule,
  socialTrack,
  titleOf,
  titleViolations,
  worldBossAnnouncements,
  worldBossDayStart,
  worldBossEligible,
  worldBossNext,
  worldBossNoneMsg,
  worldBossOccurrence,
  worldBossPhaseAt,
  worldBossPoints,
  worldBossViolations,
  type AchievementDef,
  type BoardRow,
  type TitleDef,
  type WorldBossSlot,
} from "./social";
import { realmOfStep } from "./realms";

/** Hai chữ Hán dựng bằng mã (repo cấm viết chữ Hán trực tiếp trong mã, `no-cjk.test.ts`). */
const HAN = String.fromCharCode(0x5929, 0x9053);

/** ms của (năm, tháng, ngày, giờ, phút) theo giờ máy chủ UTC+7. */
const at7 = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  Date.UTC(y, mo - 1, d, h, mi) - WORLD_BOSS_TZ_OFFSET_MS;

describe("dữ liệu thật đã vào phải qua luật kiểm", () => {
  it("lịch trùm thế giới (rỗng tới khi E có dữ liệu), thành tựu, danh hiệu", () => {
    expect(worldBossViolations()).toEqual([]);
    expect(WORLD_BOSS_SCHEDULE.length).toBe(0); // KHUNG: E thêm ở M9.10 (bộ thực thi không lập lịch khi rỗng)
    expect(achievementViolations()).toEqual([]);
    expect(titleViolations()).toEqual([]);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(4);
    expect(TITLES.length).toBeGreaterThanOrEqual(4);
  });

  it("bảng tra theo id khớp danh sách; tên của Object.prototype không lọt", () => {
    for (const a of ACHIEVEMENTS) expect(ACHIEVEMENT_BY_ID[a.id]).toBe(a);
    for (const t of TITLES) expect(TITLE_BY_ID[t.id]).toBe(t);
    // Tra bằng thuộc tính riêng là việc của người gọi: bảng KHÔNG được có khoá ngoài danh sách
    expect(Object.keys(ACHIEVEMENT_BY_ID).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
  });

  it("lịch mẫu hợp lệ", () => {
    expect(worldBossViolations(sampleWorldBossSchedule())).toEqual([]);
  });
});

describe("worldBossViolations: bắt dữ liệu sai", () => {
  const base = (): WorldBossSlot => sampleWorldBossSchedule()[0];
  const bad = (patch: Partial<WorldBossSlot>) => worldBossViolations([{ ...base(), ...patch }]);

  it("mỗi luật đỏ khi vi phạm", () => {
    expect(bad({ id: "Bad Id" }).join()).toContain("id sai văn phạm");
    expect(bad({ boss: "khong_co" }).join()).toContain("không có loài quái");
    expect(bad({ boss: "ho" }).join()).toContain("không phải trùm");
    expect(bad({ boss: "constructor" }).join()).toContain("không có loài quái");
    expect(bad({ mapId: "khong_co" }).join()).toContain("không có bản đồ");
    expect(bad({ mapId: "bi_canh_linh_hu" }).join()).toContain("bí cảnh");
    expect(bad({ hour: 24 }).join()).toContain("giờ");
    expect(bad({ minute: 60 }).join()).toContain("phút");
    expect(bad({ durationMin: 5 }).join()).toContain("thời lượng");
    expect(bad({ announceMin: [] }).join()).toContain("mốc báo trước");
    expect(bad({ announceMin: [5, 10] }).join()).toContain("giảm dần");
    expect(bad({ announceMin: [60] }).join()).toContain("1-59");
    expect(bad({ reward: { exp: 0, coin: 0 } }).join()).toContain("tu vi");
    expect(bad({ reward: { exp: 10, coin: -1 } }).join()).toContain("Linh thạch");
    expect(
      bad({ reward: { exp: 10, coin: 1, top: { itemId: "khong_co", count: 1 } } }).join(),
    ).toContain("vật phẩm thưởng");
    expect(
      bad({ reward: { exp: 10, coin: 1, top: { itemId: "dai_hoi_huyet_dan", count: 0 } } }).join(),
    ).toContain("số vật phẩm");
  });

  it("khung giờ không được vắt qua nửa đêm (giờ + thời lượng <= 24:00); đúng 24:00 thì được", () => {
    expect(bad({ hour: 23, minute: 50, durationMin: 30 }).join()).toContain("vắt qua nửa đêm");
    expect(bad({ hour: 23, minute: 31, durationMin: 30 }).join()).toContain("vắt qua nửa đêm");
    expect(bad({ hour: 23, minute: 30, durationMin: 30 })).toEqual([]); // kết thúc đúng 24:00
    expect(bad({ hour: 0, minute: 0, durationMin: 120 })).toEqual([]);
    // Hệ quả cho worldBossNext: khung hợp lệ luôn nằm gọn trong một ngày, nên lúc 00:10 khung 23:30 (hôm qua) đã kết thúc và "sắp tới" là khung hôm nay
    const late = { ...base(), id: "khuya", hour: 23, minute: 30 };
    const o = worldBossNext([late], at7(2026, 11, 18, 0, 10))!;
    expect(o.startMs).toBe(at7(2026, 11, 18, 23, 30));
    expect(worldBossPhaseAt(o, at7(2026, 11, 18, 0, 10))).toBe("soon");
  });

  it("id trùng và hai khung giờ chồng nhau bị bắt; hai khung cách nhau thì không", () => {
    const a = base();
    expect(worldBossViolations([a, { ...a }]).join()).toContain("id trùng");
    expect(worldBossViolations([a, { ...a, id: "khac", minute: 20 }]).join()).toContain(
      "chồng giờ",
    );
    expect(worldBossViolations([a, { ...a, id: "khac", hour: 13 }])).toEqual([]);
  });
});

describe("lịch theo giờ máy chủ UTC+7", () => {
  const slots = sampleWorldBossSchedule();

  it("đầu ngày UTC+7: 00:00 giờ máy chủ, tất định qua ranh giới ngày", () => {
    expect(worldBossDayStart(at7(2026, 11, 17, 0, 0))).toBe(at7(2026, 11, 17));
    expect(worldBossDayStart(at7(2026, 11, 17, 23, 59))).toBe(at7(2026, 11, 17));
    expect(worldBossDayStart(at7(2026, 11, 18, 0, 0))).toBe(at7(2026, 11, 18));
  });

  it("worldBossNext: trước 12:00 -> khung trưa sắp tới; trong 12:00-12:30 -> khung trưa đang diễn ra; sau đó -> khung tối; sau 21:30 -> trưa ngày mai; lịch rỗng -> null", () => {
    const t = (h: number, m = 0) => worldBossNext(slots, at7(2026, 11, 17, h, m))!;
    expect(t(9).slot.id).toBe("mau_trua");
    expect(t(9).startMs).toBe(at7(2026, 11, 17, 12));
    expect(worldBossPhaseAt(t(9), at7(2026, 11, 17, 9))).toBe("soon");
    expect(t(12, 10).slot.id).toBe("mau_trua");
    expect(worldBossPhaseAt(t(12, 10), at7(2026, 11, 17, 12, 10))).toBe("live");
    expect(t(12, 30).slot.id).toBe("mau_toi"); // đúng lúc kết thúc: không còn là khung trưa
    expect(t(15).slot.id).toBe("mau_toi");
    const night = t(22);
    expect(night.slot.id).toBe("mau_trua");
    expect(night.startMs).toBe(at7(2026, 11, 18, 12));
    expect(worldBossNext([], 0)).toBeNull();
    expect(worldBossNext(slots, Number.NaN)).toBeNull();
    const o = worldBossOccurrence(slots[0], at7(2026, 11, 17));
    expect(worldBossPhaseAt(o, o.endMs)).toBe("ended");
  });

  it("worldBossAnnouncements: mỗi mốc báo trước ĐÚNG MỘT lần khi gọi liên tiếp theo từng tick", () => {
    const s = slots[0];
    const start = at7(2026, 11, 17, 12);
    const fired: number[] = [];
    // Chạy từ 12:00 - 12 phút tới 12:00 + 1 phút, bước 10 s (các mốc 10 / 5 / 1 phút rơi ĐÚNG vào biên bước: bắt lỗi bắn hai lần hoặc bỏ sót ở biên)
    for (let prev = start - 12 * 60_000; prev < start + 60_000; prev += 10_000)
      fired.push(...worldBossAnnouncements(s, start, prev, prev + 10_000));
    expect(fired).toEqual([10, 5, 1]);
    expect(worldBossAnnouncements(s, start, start - 3 * 60_000, start - 3 * 60_000)).toEqual([]);
  });
});

describe("đóng góp trùm thế giới", () => {
  it("hỗ trợ chỉ tính tối đa SUPPORT_CAP % của TỔNG điểm; không đánh thì hỗ trợ vô nghĩa", () => {
    expect(worldBossPoints(0, 1_000_000)).toBe(0);
    expect(worldBossPoints(700, 0)).toBe(700);
    const p = worldBossPoints(700, 1_000_000);
    expect(p).toBeCloseTo(1000, 6); // 700 / (1 - 0,3)
    expect((p - 700) / p).toBeCloseTo(WORLD_BOSS_SUPPORT_CAP_PCT / 100, 6);
    expect(worldBossPoints(700, 100)).toBe(800); // dưới trần: tính đủ
    for (const bad of [Number.NaN, -5, Number.POSITIVE_INFINITY])
      expect(worldBossPoints(bad, bad)).toBeGreaterThanOrEqual(0);
  });

  it("ngưỡng thưởng 1,5 % máu tối đa: đúng ngưỡng thì đạt, dưới thì không, đầu vào xấu thì không", () => {
    const hp = 100_000;
    const need = (hp * WORLD_BOSS_MIN_SHARE_PCT) / 100;
    expect(worldBossEligible(need, hp)).toBe(true);
    expect(worldBossEligible(need - 1, hp)).toBe(false);
    expect(worldBossEligible(1, 0)).toBe(false);
    expect(worldBossEligible(Number.NaN, hp)).toBe(false);
    expect(worldBossEligible(1e9, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("bảng xếp hạng: so sánh, xếp hạng, đọc tin", () => {
  const row = (name: string, o: Partial<BoardRow> = {}): BoardRow => ({ rank: 0, name, ...o });

  it("tuvi: cảnh giới > bậc > tu vi, hoà thì theo tên (tất định, không phân biệt hoa thường)", () => {
    const rows = [
      row("b", { realm: 2, tier: 1, exp: 5 }),
      row("A", { realm: 3, tier: 0, exp: 1 }),
      row("c", { realm: 2, tier: 1, exp: 9 }),
      row("B", { realm: 2, tier: 1, exp: 5 }),
    ];
    const r = rankBoard("tuvi", rows);
    expect(r.map((x) => x.name)).toEqual(["A", "c", "b", "B"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
    expect(rows[0].rank).toBe(0); // không sửa đối số
  });

  it("hoà mọi khoá thì xếp theo tên, KHÔNG phụ thuộc thứ tự đầu vào", () => {
    const a = row("x", { realm: 1, tier: 1, exp: 5 });
    const b = row("y", { realm: 1, tier: 1, exp: 5 });
    expect(rankBoard("tuvi", [b, a]).map((r) => r.name)).toEqual(["x", "y"]);
    expect(rankBoard("tuvi", [a, b]).map((r) => r.name)).toEqual(["x", "y"]);
  });

  it("pk: thắng nhiều hơn trước, rồi tỉ lệ thắng cao hơn", () => {
    const r = rankBoard("pk", [
      row("x", { won: 20, lost: 20 }),
      row("y", { won: 20, lost: 5 }),
      row("z", { won: 30, lost: 90 }),
    ]);
    expect(r.map((x) => x.name)).toEqual(["z", "y", "x"]);
  });

  it("linhhon và tongmon theo khoá của bảng", () => {
    expect(
      rankBoard("linhhon", [row("a", { step: 5, kiep: 9 }), row("b", { step: 6, kiep: 1 })]).map(
        (x) => x.name,
      ),
    ).toEqual(["b", "a"]);
    expect(
      rankBoard("tongmon", [
        row("a", { level: 2, points: 900 }),
        row("b", { level: 2, points: 950 }),
      ]).map((x) => x.name),
    ).toEqual(["b", "a"]);
    expect(
      compareBoardRows("pk", row("a", { won: 0, lost: 0 }), row("b", { won: 0, lost: 0 })),
    ).toBeLessThan(0);
  });

  it("rankBoard cắt BOARD_SIZE dòng", () => {
    const rows = Array.from({ length: 50 }, (_, i) => row(`n${i}`, { won: i, lost: 0 }));
    const r = rankBoard("pk", rows);
    expect(r.length).toBe(BOARD_SIZE);
    expect(r[0].won).toBe(49);
  });

  it("parseBoardsGet chỉ nhận bảng CÓ THẬT (không nhận tên của Object.prototype / kiểu sai)", () => {
    for (const id of BOARD_IDS) expect(parseBoardsGet({ board: id })).toBe(id);
    for (const bad of [
      null,
      undefined,
      5,
      "tuvi",
      [],
      {},
      { board: "constructor" },
      { board: "__proto__" },
      { board: 1 },
      { board: ["tuvi"] },
    ])
      expect(parseBoardsGet(bad), JSON.stringify(bad)).toBeNull();
  });

  it("parseTitleSet: id đúng ID ngắn hoặc null; sai kiểu thì bỏ tin", () => {
    expect(parseTitleSet({ id: "lh2" })).toEqual({ id: "lh2" });
    expect(parseTitleSet({ id: null })).toEqual({ id: null });
    for (const bad of [
      null,
      undefined,
      5,
      "x",
      {},
      { id: "" },
      { id: "TooLong" },
      { id: "abcde" },
      { id: 7 },
      { id: "a-b" },
      { id: "__proto__" },
    ])
      expect(parseTitleSet(bad), JSON.stringify(bad)).toBeUndefined();
  });
});

describe("danh hiệu + thành tựu: luật kiểm bắt dữ liệu sai", () => {
  const ach = (patch: Partial<AchievementDef> = {}): AchievementDef => ({
    ...ACHIEVEMENTS[0],
    ...patch,
  });
  const bad = (patch: Partial<AchievementDef>) => achievementViolations([ach(patch)]).join(" | ");

  it("danh hiệu: id dài, trùng, chữ dài, chữ Hán, nhóm lạ", () => {
    const t = (patch: Partial<TitleDef>) =>
      titleViolations([{ ...TITLES[0], ...patch }]).join(" | ");
    expect(t({ id: "dai_qua" })).toContain("id phải khớp");
    expect(t({ id: "A" })).toContain("id phải khớp");
    expect(titleViolations([TITLES[0], { ...TITLES[1], id: TITLES[0].id }]).join()).toContain(
      "id trùng",
    );
    expect(t({ text: "" })).toContain("chữ phải dài");
    expect(t({ text: "x".repeat(13) })).toContain("chữ phải dài");
    expect(t({ text: HAN })).toContain("chữ Hán");
    expect(t({ group: "khong_co" as never })).toContain("nhóm");
  });

  it("thành tựu: mỗi luật đỏ khi vi phạm", () => {
    expect(bad({ id: "Bad Id" })).toContain("id sai văn phạm");
    expect(
      achievementViolations([
        ACHIEVEMENTS[0],
        { ...ACHIEVEMENTS[1], id: ACHIEVEMENTS[0].id },
      ]).join(),
    ).toContain("id trùng");
    expect(bad({ name: "" })).toContain("tên phải dài");
    expect(bad({ name: "x".repeat(41) })).toContain("tên phải dài");
    expect(bad({ desc: HAN })).toContain("chữ Hán");
    expect(bad({ group: "khong_co" as never })).toContain("nhóm");
    expect(bad({ cond: { counter: "xyz", atLeast: 1 } })).toContain("bộ đếm");
    expect(bad({ cond: { counter: "boss:ho", atLeast: 1 } })).toContain("không phải loài trùm");
    expect(bad({ cond: { counter: "boss:khong_co", atLeast: 1 } })).toContain(
      "không phải loài trùm",
    );
    expect(bad({ cond: { counter: "map:khong_co", atLeast: 1 } })).toContain("không có bản đồ");
    expect(bad({ cond: { counter: "kiep", atLeast: 0 } })).toContain("atLeast");
    expect(bad({ cond: { counter: "kiep", atLeast: 1.5 } })).toContain("atLeast");
    expect(bad({ cond: { counter: "kiep", atLeast: 2_000_000 } })).toContain("KIEP_CAP");
    expect(bad({ cond: { counter: "realm_step", atLeast: 9999 } })).toContain("bậc cao nhất");
    expect(bad({ reward: { titleId: "khong" } })).toContain("danh hiệu thưởng");
    expect(bad({ reward: { duyen: ACHIEVEMENT_DUYEN_MAX + 1 } })).toContain("Duyên thưởng");
  });

  it("hai thành tựu cùng điều kiện, và tổng Duyên vượt trần, bị bắt", () => {
    const a = ach();
    const b = { ...a, id: "khac" };
    expect(achievementViolations([a, b]).join()).toContain("trùng điều kiện");
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...a,
      id: `d${i}`,
      cond: { counter: "kiep", atLeast: 2 + i },
      reward: { duyen: ACHIEVEMENT_DUYEN_MAX },
    }));
    expect(many.length * ACHIEVEMENT_DUYEN_MAX).toBeGreaterThan(ACHIEVEMENT_DUYEN_TOTAL_MAX);
    expect(achievementViolations(many).join()).toContain("tổng Duyên");
  });
});

describe("achievementsDue / achievementProgress", () => {
  it("đủ điều kiện mà chưa có thì 'đến hạn'; đã có thì không; chưa đủ thì không", () => {
    expect(achievementsDue(undefined)).toEqual([]);
    let s = newSocial();
    s = socialTrack(s, "kiep", 2).social;
    s = socialTrack(s, "boss:mang", 1).social;
    expect(
      achievementsDue(s)
        .map((a) => a.id)
        .sort(),
    ).toEqual(["kiep_2", "trum_mang_1"]);
    const granted = { ...s, ach: { kiep_2: "t" } };
    expect(achievementsDue(granted).map((a) => a.id)).toEqual(["trum_mang_1"]);
    expect(achievementsDue(socialTrack(newSocial(), "kiep", 1).social)).toEqual([]);
  });

  it("tiến độ: have kẹp ở need, done theo ach; khoá lạ trong counters không lọt prototype", () => {
    const a = ACHIEVEMENT_BY_ID.pk_thang_10;
    expect(achievementProgress(a, { pk_won: 4 }, {})).toEqual({ have: 4, need: 10, done: false });
    expect(achievementProgress(a, { pk_won: 99 }, { pk_thang_10: "t" })).toEqual({
      have: 10,
      need: 10,
      done: true,
    });
    expect(achievementProgress(a, {}, {})).toEqual({ have: 0, need: 10, done: false });
    const c = achievementProgress({ ...a, cond: { counter: "constructor", atLeast: 1 } }, {}, {});
    expect(c.have).toBe(0);
  });
});

describe("hàm mẫu khớp kiểu thật", () => {
  it("sampleBoards: mọi bảng đã xếp hạng 1..n, có đủ các cột của BOARD_COLUMNS, mine nằm trong rows, tất định", () => {
    for (const id of BOARD_IDS) {
      const m = sampleBoards(id, 6);
      expect(m.board).toBe(id);
      expect(m.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
      for (const r of m.rows)
        for (const c of BOARD_COLUMNS[id]) expect(typeof r[c.key], `${id}.${c.key}`).toBe("number");
      expect(m.mine.rank).toBe(3);
      expect(m.mine.row).toEqual(m.rows[2]);
      expect(m.ageMs).toBeGreaterThan(0);
      expect(JSON.stringify(sampleBoards(id, 6))).toBe(JSON.stringify(m));
      // Tài khoản thử nghiệm chỉ ở các bảng KHÔNG phải tuvi
      expect(m.rows.some((r) => r.test === true)).toBe(id !== "tuvi");
    }
  });

  it("sampleWorldBossEvent: soon có startsInMs, live có endsInMs + top <= 5 + mine, ended có outcome + reward; thời gian đều TƯƠNG ĐỐI (không có mốc tuyệt đối)", () => {
    const soon = sampleWorldBossEvent("soon");
    expect(soon.startsInMs).toBeGreaterThan(0);
    const live = sampleWorldBossEvent("live");
    expect(live.endsInMs).toBeGreaterThan(0);
    expect(live.top!.length).toBeLessThanOrEqual(5);
    expect(live.mine!.eligible).toBe(true);
    const ended = sampleWorldBossEvent("ended");
    expect(ended.outcome).toBe("killed");
    expect(ended.reward!.exp).toBeGreaterThan(0);
    for (const m of [soon, live, ended]) {
      expect(Object.keys(m)).not.toContain("atMs");
      expect(m.name.length).toBeGreaterThan(0);
    }
  });

  it("sampleBoards: đủ biến thể của `mine` (ngoài top, lý do không hạng) khớp BoardNoRank", () => {
    for (const id of BOARD_IDS) {
      const out = sampleBoards(id, 5, "outside");
      expect(out.mine.rank).toBe(47);
      expect(out.mine.row!.rank).toBe(47);
      expect(out.rows.length).toBe(5); // hạng 47 KHÔNG nằm trong rows
      for (const c of BOARD_COLUMNS[id]) expect(typeof out.mine.row![c.key]).toBe("number");
      expect(sampleBoards(id, 5, "test").mine).toEqual({ rank: null, reason: "test" });
      expect(sampleBoards(id, 5, "none").mine).toEqual({ rank: null, reason: "none" });
      const mg = sampleBoards(id, 5, "min_games").mine;
      expect(mg).toMatchObject({ rank: null, reason: "min_games" });
      expect(mg.need).toBeGreaterThan(0);
      expect(JSON.stringify(sampleBoards(id, 5, "outside"))).toBe(JSON.stringify(out));
    }
  });

  it("sampleBoards('linhhon'): mọi bậc nằm TRONG thang (realmOfStep không null) kể cả ở số dòng tối đa và dòng ngoài top", () => {
    for (const variant of ["top", "outside"] as const) {
      const m = sampleBoards("linhhon", BOARD_SIZE, variant);
      const all = [...m.rows, ...(m.mine.row ? [m.mine.row] : [])];
      for (const r of all) expect(realmOfStep(r.step!), `bậc ${r.step}`).not.toBeNull();
    }
  });

  it("sampleWorldBossEvent: none, fled / cancelled / below, live chưa đủ ngưỡng", () => {
    expect(sampleWorldBossEvent("none")).toEqual(worldBossNoneMsg());
    expect(worldBossNoneMsg()).toEqual({ phase: "none", id: "", name: "", mapId: "" });
    expect(sampleWorldBossEvent("ended", "fled")).toMatchObject({
      phase: "ended",
      outcome: "fled",
    });
    expect(sampleWorldBossEvent("ended", "fled").reward).toBeUndefined();
    expect(sampleWorldBossEvent("ended", "cancelled").outcome).toBe("cancelled");
    const below = sampleWorldBossEvent("ended", "below");
    expect(below.outcome).toBe("killed");
    expect(below.reward).toBeUndefined(); // hạ được nhưng người xem chưa đủ ngưỡng: không thưởng
    expect(sampleWorldBossEvent("live", "below").mine).toEqual({
      pts: 900,
      pct: 0.4,
      eligible: false,
    });
    expect(sampleWorldBossEvent("live").mine!.eligible).toBe(true);
  });

  it("achievementOf / titleOf: tra thuộc tính RIÊNG (id lạ, tên của Object.prototype, kiểu sai đều undefined)", () => {
    expect(achievementOf("kiep_2")).toBe(ACHIEVEMENT_BY_ID.kiep_2);
    expect(titleOf("lh2")).toBe(TITLE_BY_ID.lh2);
    for (const bad of [
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
      "",
      "khong_co",
      5,
      null,
      undefined,
      {},
    ]) {
      expect(achievementOf(bad), String(bad)).toBeUndefined();
      expect(titleOf(bad), String(bad)).toBeUndefined();
    }
  });

  it("sampleAchievements: chỉ chứa id có thật, danh hiệu đang đeo là danh hiệu có thật", () => {
    const m = sampleAchievements();
    for (const id of Object.keys(m.ach)) expect(ACHIEVEMENT_BY_ID[id]).toBeDefined();
    expect(TITLE_BY_ID[m.title!]).toBeDefined();
  });
});
